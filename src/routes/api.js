const express = require('express');
const router = express.Router();
const celebrantController = require('../controllers/celebrantController');
const settingsController = require('../controllers/settingsController');
const waClient = require('../services/whatsapp');

// Celebrant Routes
router.post('/celebrants', celebrantController.create);
router.put('/celebrants/:id', celebrantController.update);
router.post('/celebrants/:id/post-now', celebrantController.postNow);
router.get('/celebrants', celebrantController.list);
router.delete('/celebrants/:id', celebrantController.delete);
router.patch('/celebrants/:id/status', celebrantController.toggleStatus);

// Settings Routes
router.get('/settings', settingsController.getSettings);
router.post('/settings', settingsController.updateSettings);

// WhatsApp Status Routes
router.get('/whatsapp/status', (req, res) => {
    res.json(waClient.getStatus());
});

router.post('/whatsapp/send-test', async (req, res) => {
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

router.post('/whatsapp/reconnect', async (req, res) => {
    try {
        await waClient.reconnect();
        res.json({ message: 'Reconnection initiated' });
    } catch (error) {
        console.error('Error initiating reconnection:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/whatsapp/chats', async (req, res) => {
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

// Activity Logs Route
router.get('/logs', async (req, res) => {
    try {
        const { initDb } = require('../models/database');
        const db = await initDb();
        const logs = await db.all('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100');
        res.json(logs);
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
