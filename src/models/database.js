const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

async function initDb() {
    // Use persistent Railway volume if configured, otherwise local directory
    // Prioritize DATA_DIR, then root directory, then legacy src/ directory
    let dbDir = process.env.DATA_DIR;
    let dbPath = '';

    if (dbDir) {
        dbPath = path.join(dbDir, 'database.sqlite');
    } else {
        const rootPath = path.join(__dirname, '..', '..');
        const legacyPath = path.join(__dirname, '..');

        const rootDb = path.join(rootPath, 'database.sqlite');
        const legacyDb = path.join(legacyPath, 'database.sqlite');

        // If root has a non-zero size database, use it. Otherwise, if legacy exists, use legacy.
        if (fs.existsSync(rootDb) && fs.statSync(rootDb).size > 0) {
            dbPath = rootDb;
        } else if (fs.existsSync(legacyDb)) {
            dbPath = legacyDb;
        } else {
            dbPath = rootDb; // Default to root for new installs
        }
        dbDir = path.dirname(dbPath);
    }

    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await db.exec('PRAGMA foreign_keys = ON');

    // ── Users table ──
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            avatar_url TEXT,
            role TEXT NOT NULL DEFAULT 'media' CHECK(role IN ('admin', 'media')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ── Sessions table (for express-session with connect-sqlite3) ──
    await db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            sess TEXT NOT NULL,
            expired DATETIME
        )
    `);

    // ── Events table (unified) ──
    // Check if old schema exists and migrate
    const tableInfo = await db.all("PRAGMA table_info(events)");
    const columnNames = tableInfo.map(c => c.name);

    if (tableInfo.length === 0) {
        // Fresh install — create the full table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                first_name TEXT,
                second_name TEXT,
                phone_number TEXT,
                event_type TEXT NOT NULL CHECK(event_type IN ('birthday', 'wedding_anniversary', 'monday_market', 'announcement')),
                event_date TEXT,
                design_image_path TEXT,
                caption TEXT,
                message_template TEXT,
                schedule_type TEXT DEFAULT 'single_date' CHECK(schedule_type IN ('single_date', 'weekly', 'interval')),
                repeat_interval_days INTEGER,
                post_time TEXT DEFAULT '06:00',
                current_image_index INTEGER DEFAULT 0,
                created_by INTEGER REFERENCES users(id),
                status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ── Event Images table (for albums/rotation) ──
        await db.exec(`
            CREATE TABLE IF NOT EXISTS event_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
                image_path TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ── Migrate data from old 'celebrants' table if it exists ──
        const celebrantsTable = await db.all("PRAGMA table_info(celebrants)");
        if (celebrantsTable.length > 0) {
            console.log('Migrating data from celebrants table to events...');
            const celebrantCols = celebrantsTable.map(c => c.name);
            try {
                const celebrants = await db.all('SELECT * FROM celebrants');
                for (const c of celebrants) {
                    // Map old event_type values
                    let eventType = 'birthday';
                    if (c.event_type === 'Wedding Anniversary' || c.event_type === 'wedding_anniversary') {
                        eventType = 'wedding_anniversary';
                    }

                    await db.run(
                        `INSERT INTO events (first_name, second_name, phone_number, event_type, event_date,
                         design_image_path, message_template, schedule_type, status, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 'single_date', ?, ?)`,
                        [
                            c.first_name || null,
                            c.second_name || null,
                            c.phone_number || null,
                            eventType,
                            c.event_date || null,
                            c.design_image_path || null,
                            c.message_template || null,
                            c.status || 'active',
                            c.created_at || new Date().toISOString()
                        ]
                    );
                }
                console.log(`Migrated ${celebrants.length} records from celebrants to events.`);
            } catch (migErr) {
                console.error('Error migrating celebrants:', migErr);
            }
        }
    } else {
        // Migration: add new columns if missing
        if (!columnNames.includes('title')) {
            await db.exec("ALTER TABLE events ADD COLUMN title TEXT");
        }
        if (!columnNames.includes('caption')) {
            await db.exec("ALTER TABLE events ADD COLUMN caption TEXT");
        }
        if (!columnNames.includes('schedule_type')) {
            await db.exec("ALTER TABLE events ADD COLUMN schedule_type TEXT DEFAULT 'single_date'");
        }
        if (!columnNames.includes('repeat_interval_days')) {
            await db.exec("ALTER TABLE events ADD COLUMN repeat_interval_days INTEGER");
        }
        if (!columnNames.includes('post_time')) {
            await db.exec("ALTER TABLE events ADD COLUMN post_time TEXT DEFAULT '06:00'");
        }
        if (!columnNames.includes('created_by')) {
            await db.exec("ALTER TABLE events ADD COLUMN created_by INTEGER");
        }
        if (!columnNames.includes('current_image_index')) {
            await db.exec("ALTER TABLE events ADD COLUMN current_image_index INTEGER DEFAULT 0");
        }

        // ── Always ensure event_images table exists ──
        await db.exec(`
            CREATE TABLE IF NOT EXISTS event_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
                image_path TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ── CRITICAL MIGRATION: Fix event_type constraint case mismatch ──
        // If we detect the old capitalized constraints, we must recreate the table
        const tableSchema = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='events'");
        if (tableSchema && tableSchema.sql.includes("'Birthday'")) {
            console.log('Old capitalized constraints detected. Recreating events table with new constraints...');
            await db.exec('PRAGMA foreign_keys = OFF');
            await db.exec('BEGIN TRANSACTION');

            // 1. Create temporary table
            await db.exec(`
                CREATE TABLE events_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT,
                    first_name TEXT,
                    second_name TEXT,
                    phone_number TEXT,
                    event_type TEXT NOT NULL CHECK(event_type IN ('birthday', 'wedding_anniversary', 'monday_market', 'announcement')),
                    event_date TEXT,
                    design_image_path TEXT,
                    caption TEXT,
                    message_template TEXT,
                    schedule_type TEXT DEFAULT 'single_date' CHECK(schedule_type IN ('single_date', 'weekly', 'interval')),
                    repeat_interval_days INTEGER,
                    post_time TEXT DEFAULT '06:00',
                    current_image_index INTEGER DEFAULT 0,
                    created_by INTEGER REFERENCES users(id),
                    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 2. Copy data while normalizing event_type to lowercase
            await db.exec(`
                INSERT INTO events_new (
                    id, title, first_name, second_name, phone_number, 
                    event_type, event_date, design_image_path, caption, 
                    message_template, schedule_type, repeat_interval_days, 
                    post_time, current_image_index, created_by, status, created_at
                )
                SELECT 
                    id, title, first_name, second_name, phone_number,
                    CASE 
                        WHEN event_type = 'Birthday' THEN 'birthday'
                        WHEN event_type = 'Wedding Anniversary' THEN 'wedding_anniversary'
                        ELSE LOWER(event_type)
                    END,
                    event_date, design_image_path, caption,
                    message_template, schedule_type, repeat_interval_days,
                    post_time, 0, created_by, status, created_at
                FROM events
            `);

            // 3. Swap tables
            await db.exec('DROP TABLE events');
            await db.exec('ALTER TABLE events_new RENAME TO events');

            await db.exec('COMMIT');
            await db.exec('PRAGMA foreign_keys = ON');
            console.log('Events table successfully migrated to new constraints.');
        } else {
            // Simple value normalization if schema is already correct
            await db.exec("UPDATE events SET event_type = 'birthday' WHERE event_type = 'Birthday'");
            await db.exec("UPDATE events SET event_type = 'wedding_anniversary' WHERE event_type = 'Wedding Anniversary'");
        }
    }


    // ── Always check: recover from celebrants if events is empty ──
    const eventsCount = await db.get('SELECT COUNT(*) as count FROM events');
    if (eventsCount.count === 0) {
        const celebrantsExists = await db.all("PRAGMA table_info(celebrants)");
        if (celebrantsExists.length > 0) {
            console.log('Events table empty — recovering data from celebrants table...');
            try {
                const celebrants = await db.all('SELECT * FROM celebrants');
                for (const c of celebrants) {
                    let eventType = 'birthday';
                    if (c.event_type === 'Wedding Anniversary' || c.event_type === 'wedding_anniversary') {
                        eventType = 'wedding_anniversary';
                    }
                    await db.run(
                        `INSERT INTO events (first_name, second_name, phone_number, event_type, event_date,
                         design_image_path, message_template, schedule_type, status, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 'single_date', ?, ?)`,
                        [
                            c.first_name || null,
                            c.second_name || null,
                            c.phone_number || null,
                            eventType,
                            c.event_date || null,
                            c.design_image_path || null,
                            c.message_template || null,
                            c.status || 'active',
                            c.created_at || new Date().toISOString()
                        ]
                    );
                }
                console.log(`Recovered ${celebrants.length} records from celebrants into events.`);
            } catch (migErr) {
                console.error('Error recovering celebrants data:', migErr);
            }
        }
    }

    // ── Settings table ──
    await db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            whatsapp_group_id TEXT DEFAULT '',
            whatsapp_group_id_2 TEXT DEFAULT '',
            birthday_template TEXT DEFAULT '🎉 Happy Birthday {name}! Wishing you joy, success and many more years ahead.',
            anniversary_template TEXT DEFAULT '💍 Happy Wedding Anniversary {name}! May your love continue to grow and your journey together be blessed.'
        )
    `);

    // Add second group column if missing (migration)
    const settingsInfo = await db.all("PRAGMA table_info(settings)");
    const settingsCols = settingsInfo.map(c => c.name);
    if (!settingsCols.includes('whatsapp_group_id_2')) {
        await db.exec("ALTER TABLE settings ADD COLUMN whatsapp_group_id_2 TEXT DEFAULT ''");
    }

    const settingsCount = await db.get('SELECT COUNT(*) as count FROM settings');
    if (settingsCount.count === 0) {
        await db.run(`INSERT INTO settings (id, whatsapp_group_id, birthday_template, anniversary_template) 
                     VALUES (1, '', '🎉 Happy Birthday {name}! Wishing you joy, success and many more years ahead.', '💍 Happy Wedding Anniversary {name}! May your love continue to grow and your journey together be blessed.')`);
    }

    // ── Activity Logs table ──
    const logsInfo = await db.all("PRAGMA table_info(activity_logs)");
    const logColumns = logsInfo.map(c => c.name);

    if (logsInfo.length === 0) {
        await db.exec(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id),
                action TEXT NOT NULL,
                event_id INTEGER,
                description TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } else {
        // Migration
        if (!logColumns.includes('user_id')) {
            await db.exec("ALTER TABLE activity_logs ADD COLUMN user_id INTEGER");
        }
        if (!logColumns.includes('event_id')) {
            await db.exec("ALTER TABLE activity_logs ADD COLUMN event_id INTEGER");
        }
        if (!logColumns.includes('action') && logColumns.includes('action_type')) {
            await db.exec("ALTER TABLE activity_logs RENAME COLUMN action_type TO action");
        }
    }

    // Seed admin user from env var if set
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
        const existingAdmin = await db.get('SELECT * FROM users WHERE email = ?', [adminEmail]);
        if (!existingAdmin) {
            await db.run(
                'INSERT INTO users (name, email, role) VALUES (?, ?, ?)',
                ['Admin', adminEmail, 'admin']
            );
        }
    }

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

async function logActivity(userId, action, eventId, description) {
    try {
        const db = await getDb();
        await db.run(
            'INSERT INTO activity_logs (user_id, action, event_id, description) VALUES (?, ?, ?, ?)',
            [userId || null, action, eventId || null, description]
        );
        const { emitStats } = require('../services/socket');
        emitStats({ action: 'new_log' });
    } catch (e) {
        console.error('Failed to log activity:', e);
    }
}

module.exports = { initDb, getDb, logActivity };
