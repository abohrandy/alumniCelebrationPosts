const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

async function initDb() {
    // Use persistent Railway volume if configured, otherwise local directory
    const dbDir = process.env.DATA_DIR || path.join(__dirname, '..');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    const dbPath = path.join(dbDir, 'database.sqlite');

    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            second_name TEXT NOT NULL,
            phone_number TEXT,
            event_type TEXT CHECK(event_type IN ('Birthday', 'Wedding Anniversary')) NOT NULL,
            event_date TEXT NOT NULL, -- Format: YYYY-MM-DD
            design_image_path TEXT NOT NULL,
            message_template TEXT,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            whatsapp_group_id TEXT DEFAULT '',
            birthday_template TEXT DEFAULT '🎉 Happy Birthday {name}! Wishing you joy, success and many more years ahead.',
            anniversary_template TEXT DEFAULT '💍 Happy Wedding Anniversary {name}! May your love continue to grow and your journey together be blessed.'
        )
    `);

    // Insert default settings if they don't exist
    const settingsCount = await db.get('SELECT COUNT(*) as count FROM settings');
    if (settingsCount.count === 0) {
        await db.run(`INSERT INTO settings (id, whatsapp_group_id, birthday_template, anniversary_template) 
                     VALUES (1, '', '🎉 Happy Birthday {name}! Wishing you joy, success and many more years ahead.', '💍 Happy Wedding Anniversary {name}! May your love continue to grow and your journey together be blessed.')`);
    }

    await db.exec(`
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action_type TEXT NOT NULL,
            description TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('Database initialized successfully.');
    return db;
}

// Global cached db promise
let dbPromise = null;
function getDb() {
    if (!dbPromise) {
        dbPromise = initDb();
    }
    return dbPromise;
}

async function logActivity(action_type, description) {
    try {
        const db = await getDb();
        await db.run(
            'INSERT INTO activity_logs (action_type, description) VALUES (?, ?)',
            [action_type, description]
        );
        // Also emit to dashboard for real-time log updates (if we want to reuse the socket)
        const { emitStats } = require('../services/socket');
        emitStats({ action: 'new_log' });
    } catch (e) {
        console.error('Failed to log activity:', e);
    }
}

module.exports = { initDb, logActivity };
