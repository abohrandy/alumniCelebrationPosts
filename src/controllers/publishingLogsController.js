const { initDb } = require('../models/database');

exports.list = async (req, res) => {
    try {
        const db = await initDb();
        const logs = await db.all(`
            SELECT pl.*, e.title, e.full_name, e.event_type 
            FROM publishing_logs pl 
            LEFT JOIN events e ON pl.event_id = e.id 
            ORDER BY pl.published_at DESC
        `);
        res.json(logs);
    } catch (err) {
        console.error('Error fetching publishing logs:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
};
