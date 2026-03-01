const express = require('express');
const router = express.Router();
const passport = require('passport');
const eventController = require('../controllers/eventController');
const settingsController = require('../controllers/settingsController');
const waClient = require('../services/whatsapp');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const { logActivity } = require('../models/database');

// ── Auth Routes ──
router.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/?error=auth_failed' }),
    async (req, res) => {
        if (req.user) {
            await logActivity(req.user.id, 'user_login', null, `${req.user.name} (${req.user.email}) signed in`);
        }
        res.redirect('/');
    }
);

router.get('/auth/me', (req, res) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
        const { id, name, email, role, avatar_url } = req.user;
        return res.json({ authenticated: true, user: { id, name, email, role, avatar_url } });
    }
    res.json({ authenticated: false });
});

router.post('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        req.session.destroy(() => {
            res.json({ message: 'Logged out' });
        });
    });
});

// ── Event Routes (protected) ──
router.post('/events', requireAuth, eventController.create);
router.put('/events/:id', requireAuth, eventController.update);
router.post('/events/:id/post-now', requireAuth, eventController.postNow);
router.get('/events', requireAuth, eventController.list);
router.delete('/events/:id', requireAuth, eventController.delete);
router.patch('/events/:id/status', requireAuth, eventController.toggleStatus);

// Backward compat — keep old /celebrants routes pointing to events
router.post('/celebrants', requireAuth, eventController.create);
router.put('/celebrants/:id', requireAuth, eventController.update);
router.post('/celebrants/:id/post-now', requireAuth, eventController.postNow);
router.get('/celebrants', requireAuth, eventController.list);
router.delete('/celebrants/:id', requireAuth, eventController.delete);
router.patch('/celebrants/:id/status', requireAuth, eventController.toggleStatus);

// ── Settings Routes (admin only) ──
router.get('/settings', requireAdmin, settingsController.getSettings);
router.post('/settings', requireAdmin, settingsController.updateSettings);

// ── User Management Routes (admin only) ──
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const { initDb } = require('../models/database');
        const db = await initDb();
        const users = await db.all('SELECT id, name, email, role, avatar_url, created_at FROM users ORDER BY created_at DESC');
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: error.message });
    }
});

router.patch('/users/:id/role', requireAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        if (!['admin', 'media'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Must be admin or media.' });
        }
        const { initDb } = require('../models/database');
        const db = await initDb();
        const targetUser = await db.get('SELECT name, email FROM users WHERE id = ?', [req.params.id]);
        await db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
        await logActivity(req.user.id, 'role_changed', null, `Changed ${targetUser ? targetUser.name : 'user ' + req.params.id} role to ${role}`);
        res.json({ message: 'Role updated', id: req.params.id, role });
    } catch (error) {
        console.error('Error updating role:', error);
        res.status(500).json({ error: error.message });
    }
});

// ── WhatsApp Status Routes ──
router.get('/whatsapp/status', requireAuth, (req, res) => {
    res.json(waClient.getStatus());
});

router.post('/whatsapp/send-test', requireAdmin, async (req, res) => {
    try {
        const { initDb } = require('../models/database');
        const db = await initDb();
        const settings = await db.get('SELECT * FROM settings WHERE id = 1');
        const groupId = settings?.whatsapp_group_id || process.env.WHATSAPP_GROUP_ID;

        if (!groupId) {
            return res.status(400).json({ error: 'WhatsApp Group ID not configured' });
        }

        await waClient.sendTextMessage(groupId, '✅ *Alumni Celebrant Auto Poster*: Test connection successful!');
        res.json({ message: 'Test message sent successfully' });
    } catch (error) {
        console.error('Error sending test message:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/whatsapp/reconnect', requireAdmin, async (req, res) => {
    try {
        await waClient.reconnect();
        res.json({ message: 'Reconnection initiated' });
    } catch (error) {
        console.error('Error initiating reconnection:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/whatsapp/chats', requireAuth, async (req, res) => {
    try {
        if (!waClient.client || waClient.status !== 'CONNECTED') {
            return res.status(400).json({ error: 'WhatsApp is not connected' });
        }
        const chats = await waClient.client.getChats();
        const simplifiedChats = chats.map(c => ({ id: c.id._serialized, name: c.name, isGroup: c.isGroup }));
        res.json(simplifiedChats);
    } catch (error) {
        console.error('Error getting chats:', error);
        res.status(500).json({ error: error.message });
    }
});

// ── Activity Logs Route (admin only) ──
router.get('/logs', requireAdmin, async (req, res) => {
    try {
        const { initDb } = require('../models/database');
        const db = await initDb();
        const logs = await db.all(`
            SELECT al.*, u.name as user_name, u.avatar_url as user_avatar
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.created_at DESC 
            LIMIT 200
        `);
        res.json(logs);
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
