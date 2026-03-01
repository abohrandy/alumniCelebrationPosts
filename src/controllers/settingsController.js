const { initDb, logActivity } = require('../models/database');

exports.getSettings = async (req, res) => {
    try {
        const db = await initDb();
        const row = await db.get('SELECT * FROM settings WHERE id = 1');
        res.json(row || {});
    } catch (err) {
        console.error('Error getting settings:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateSettings = async (req, res) => {
    const { whatsapp_group_id, whatsapp_group_id_2, birthday_template, anniversary_template } = req.body;

    try {
        const db = await initDb();
        const query = `
            UPDATE settings 
            SET whatsapp_group_id = ?, 
                whatsapp_group_id_2 = ?,
                birthday_template = ?, 
                anniversary_template = ?
            WHERE id = 1
        `;

        await db.run(query, [whatsapp_group_id, whatsapp_group_id_2 || '', birthday_template, anniversary_template]);
        await logActivity(req.user ? req.user.id : null, 'settings_updated', null, 'Application settings were modified.');
        res.json({ message: 'Settings updated successfully' });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: err.message });
    }
};
