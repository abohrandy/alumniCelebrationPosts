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
            await logActivity(req.user.id, 'user_login', null, `${req.user.name} (${req.user.email}) signed in`, {
                name: req.user.name,
                email: req.user.email,
                role: req.user.role,
                ip: req.ip
            });
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
        await logActivity(req.user.id, 'role_changed', null, `Changed ${targetUser ? targetUser.name : 'user ' + req.params.id} role to ${role}`, {
            target_user_id: req.params.id,
            target_user_name: targetUser?.name,
            new_role: role
        });
        res.json({ message: 'Role updated', id: req.params.id, role });
    } catch (error) {
        console.error('Error updating role:', error);
        res.status(500).json({ error: error.message });
    }
});

// ── WhatsApp Status & Profile Routes ──

// List all profiles
router.get('/whatsapp/profiles', requireAuth, async (req, res) => {
    try {
        const { getDb } = require('../models/database');
        const db = await getDb();
        const profiles = await db.all('SELECT * FROM whatsapp_profiles ORDER BY id ASC');
        const liveStatus = waClient.getAllStatus();

        // Merge DB data with live status
        const merged = profiles.map(p => {
            const live = liveStatus.find(s => s.id === p.id);
            return {
                ...p,
                status: live ? live.status : 'DISCONNECTED',
                qrText: live ? live.qrText : '',
                lastError: live ? live.lastError : p.lastError
            };
        });
        res.json(merged);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new profile
router.post('/whatsapp/profiles', requireAdmin, async (req, res) => {
    try {
        const { name, group_id, group_id_2 } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const { getDb } = require('../models/database');
        const db = await getDb();
        
        const result = await db.run(
            'INSERT INTO whatsapp_profiles (name, auth_dir, group_id, group_id_2) VALUES (?, ?, ?, ?)',
            [name, `wa_auth_${Date.now()}`, group_id || '', group_id_2 || '']
        );
        
        const newProfile = await db.get('SELECT * FROM whatsapp_profiles WHERE id = ?', [result.lastID]);
        await waClient.addInstance(newProfile);
        
        await logActivity(req.user.id, 'whatsapp_profile_created', null, `Created WhatsApp profile: ${name}`);
        res.json(newProfile);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update profile details
router.patch('/whatsapp/profiles/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, group_id, group_id_2 } = req.body;
        const { getDb } = require('../models/database');
        const db = await getDb();

        const profile = await db.get('SELECT * FROM whatsapp_profiles WHERE id = ?', [id]);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });

        await db.run(
            'UPDATE whatsapp_profiles SET name = ?, group_id = ?, group_id_2 = ? WHERE id = ?',
            [name || profile.name, group_id ?? profile.group_id, group_id_2 ?? profile.group_id_2, id]
        );

        // Update live instance name if it exists
        const instance = waClient.getInstance(id);
        if (instance) instance.name = name || profile.name;

        await logActivity(req.user.id, 'whatsapp_profile_updated', null, `Updated WhatsApp profile: ${name || profile.name}`);
        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete profile
router.delete('/whatsapp/profiles/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { getDb } = require('../models/database');
        const db = await getDb();
        
        const profile = await db.get('SELECT * FROM whatsapp_profiles WHERE id = ?', [id]);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });
        if (profile.is_default) return res.status(400).json({ error: 'Cannot delete the primary profile' });

        await waClient.removeInstance(id);
        await db.run('DELETE FROM whatsapp_profiles WHERE id = ?', [id]);
        
        // Clean up auth dir
        const baseDir = process.env.DATA_DIR || 'C:\\';
        const fs = require('fs');
        const path = require('path');
        const authPath = path.join(baseDir, profile.auth_dir);
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
        }

        await logActivity(req.user.id, 'whatsapp_profile_deleted', null, `Deleted WhatsApp profile: ${profile.name}`);
        res.json({ message: 'Profile deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Set profile as default
router.patch('/whatsapp/profiles/:id/default', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { getDb } = require('../models/database');
        const db = await getDb();

        const profile = await db.get('SELECT * FROM whatsapp_profiles WHERE id = ?', [id]);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });

        await db.run('BEGIN TRANSACTION');
        try {
            await db.run('UPDATE whatsapp_profiles SET is_default = 0');
            await db.run('UPDATE whatsapp_profiles SET is_default = 1 WHERE id = ?', [id]);
            await db.run('COMMIT');
            waClient.setDefault(id);
        } catch (e) {
            await db.run('ROLLBACK');
            throw e;
        }

        await logActivity(req.user.id, 'whatsapp_profile_default_changed', null, `Set profile "${profile.name}" as primary account`);
        res.json({ message: 'Default profile updated', id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Original routes updated for multi-instance (supports ?profileId=X)
router.get('/whatsapp/status', requireAuth, (req, res) => {
    const profileId = req.query.profileId;
    if (profileId) {
        const instance = waClient.getInstance(profileId);
        return res.json(instance ? instance.getStatus() : { error: 'Not found' });
    }
    res.json(waClient.getAllStatus()[0] || { status: 'DISCONNECTED' });
});

router.post('/whatsapp/reconnect', requireAdmin, async (req, res) => {
    try {
        const profileId = req.body.profileId || req.query.profileId;
        const instance = waClient.getInstance(profileId);
        if (!instance) throw new Error('Account not found');
        
        await instance.disconnect();
        await instance.init();
        res.json({ message: 'Reconnection initiated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/whatsapp/disconnect', requireAdmin, async (req, res) => {
    try {
        const profileId = req.body.profileId;
        const instance = waClient.getInstance(profileId);
        if (!instance) throw new Error('Account not found');
        
        await instance.disconnect();
        await logActivity(req.user.id, 'whatsapp_disconnected', null, `Admin disconnected WhatsApp session: ${instance.name}`);
        res.json({ message: 'WhatsApp disconnected successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/whatsapp/groups', requireAdmin, async (req, res) => {
    try {
        const profileId = req.query.profileId;
        const groups = await waClient.getGroups(profileId);
        res.json(groups);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/whatsapp/chats', requireAuth, async (req, res) => {
    try {
        const profileId = req.query.profileId;
        const instance = waClient.getInstance(profileId);
        if (!instance || instance.status !== 'CONNECTED') {
            return res.status(400).json({ error: 'WhatsApp is not connected' });
        }
        const groups = await instance.getGroups();
        const simplifiedChats = groups.map(g => ({ id: g.id, name: g.name, isGroup: true }));
        res.json(simplifiedChats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/whatsapp/send-test', requireAdmin, async (req, res) => {
    try {
        const profileId = req.body.profileId;
        const instance = waClient.getInstance(profileId);
        if (!instance) throw new Error('Account not found');

        const { getDb } = require('../models/database');
        const db = await getDb();
        const settings = await db.get('SELECT * FROM settings WHERE id = 1');
        
        // Use profile-specific group if available, else settings
        const groupId = req.body.groupId || settings?.whatsapp_group_id || process.env.WHATSAPP_GROUP_ID;

        if (!groupId) return res.status(400).json({ error: 'WhatsApp Group ID not configured' });

        await instance.sendTextMessage(groupId, `✅ *MUAAFCT Poster*: Test connection successful from account *${instance.name}*!`);
        res.json({ message: 'Test message sent successfully' });
    } catch (error) {
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
