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
                full_name TEXT,
                phone_number TEXT,
                event_type TEXT NOT NULL CHECK(event_type IN ('birthday', 'wedding_anniversary', 'monday_market', 'recurrent_announcement', 'announcement', 'one_day_event')),
                event_date TEXT,
                design_image_path TEXT,
                caption TEXT,
                message_template TEXT,
                schedule_type TEXT DEFAULT 'single_date' CHECK(schedule_type IN ('single_date', 'weekly', 'interval')),
                repeat_interval_days INTEGER,
                post_time TEXT DEFAULT '06:00',
                current_image_index INTEGER DEFAULT 0,
                current_caption_index INTEGER DEFAULT 0,
                created_by INTEGER REFERENCES users(id),
                status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
                expiry_date TEXT,
                repeat_annually INTEGER DEFAULT 0,
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

        // ── Event Captions table (for text rotation) ──
        await db.exec(`
            CREATE TABLE IF NOT EXISTS event_captions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
                caption_text TEXT NOT NULL,
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
                        `INSERT INTO events (full_name, phone_number, event_type, event_date,
                         design_image_path, message_template, schedule_type, status, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, 'single_date', ?, ?)`,
                        [
                            ((c.first_name || '') + ' ' + (c.second_name || '')).trim() || null,
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
        if (!columnNames.includes('current_caption_index')) {
            await db.exec("ALTER TABLE events ADD COLUMN current_caption_index INTEGER DEFAULT 0");
        }
        
        // Ensure event_captions table exists even in evolved DBs
        await db.exec(`
            CREATE TABLE IF NOT EXISTS event_captions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
                caption_text TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration: Rename monday_market to recurrent_announcement and move captions
        try {
            // Move existing captions to event_captions table if they haven't been moved
            const existingItems = await db.all("SELECT id, caption FROM events WHERE event_type = 'monday_market' AND caption IS NOT NULL AND caption != ''");
            for (const item of existingItems) {
                const count = await db.get("SELECT COUNT(*) as count FROM event_captions WHERE event_id = ?", [item.id]);
                if (count.count === 0) {
                    await db.run("INSERT INTO event_captions (event_id, caption_text) VALUES (?, ?)", [item.id, item.caption]);
                }
            }
            
            // Rename type
            await db.run("UPDATE events SET event_type = 'recurrent_announcement' WHERE event_type = 'monday_market'");
        } catch (e) {
            console.error('Migration to recurrent_announcement partially failed (likely constraint):', e.message);
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
        if (!columnNames.includes('full_name')) {
            await db.exec("ALTER TABLE events ADD COLUMN full_name TEXT");
            if (columnNames.includes('first_name')) {
                await db.exec("UPDATE events SET full_name = TRIM(IFNULL(first_name, '') || ' ' || IFNULL(second_name, ''))");
            }
        }
        if (!columnNames.includes('expiry_date')) {
            await db.exec("ALTER TABLE events ADD COLUMN expiry_date TEXT");
        }
        if (!columnNames.includes('repeat_annually')) {
            await db.exec("ALTER TABLE events ADD COLUMN repeat_annually INTEGER DEFAULT 0");
        }
        // Remove first_name and second_name if full_name exists and they are no longer needed
        if (columnNames.includes('first_name') && columnNames.includes('full_name')) {
            // SQLite does not support dropping columns directly without recreating the table.
            // This is handled by the table recreation logic below if event_type constraints are old.
            // If not, these columns will remain but won't be used.
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

        // ── CRITICAL MIGRATION: Fix event_type constraint case mismatch and schema changes ──
        // If we detect the old capitalized constraints, we must recreate the table
        const tableSchema = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='events'");
        if (tableSchema && (tableSchema.sql.includes("'Birthday'") || columnNames.includes('first_name') || !tableSchema.sql.includes('one_day_event') || !tableSchema.sql.includes('recurrent_announcement'))) {
            console.log('Old constraints, missing event types, or legacy columns detected. Recreating events table...');
            await db.exec('PRAGMA foreign_keys = OFF');
            await db.exec('BEGIN TRANSACTION');

            // 1. Create temporary table
            await db.exec(`
                CREATE TABLE events_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    full_name TEXT,
                    phone_number TEXT,
                    event_type TEXT NOT NULL CHECK(event_type IN ('birthday', 'wedding_anniversary', 'monday_market', 'recurrent_announcement', 'announcement', 'one_day_event')),
                    event_date TEXT,
                    design_image_path TEXT,
                    caption TEXT,
                    message_template TEXT,
                    schedule_type TEXT DEFAULT 'single_date' CHECK(schedule_type IN ('single_date', 'weekly', 'interval')),
                    repeat_interval_days INTEGER,
                    post_time TEXT DEFAULT '06:00',
                    current_image_index INTEGER DEFAULT 0,
                    current_caption_index INTEGER DEFAULT 0,
                    created_by INTEGER REFERENCES users(id),
                    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
                    expiry_date TEXT,
                    repeat_annually INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 2. Copy data while normalizing event_type to lowercase and combining names
            const hasFirstName = columnNames.includes('first_name');
            const fullNameSelect = hasFirstName 
                ? "IFNULL(full_name, TRIM(IFNULL(first_name, '') || ' ' || IFNULL(second_name, '')))"
                : "full_name";
            
            const repeatAnnuallySelect = columnNames.includes('repeat_annually') ? 'repeat_annually' : '0';

            await db.exec(`
                INSERT INTO events_new (
                    id, full_name, phone_number,
                    event_type, event_date, design_image_path, caption,
                    message_template, schedule_type, repeat_interval_days,
                    post_time, current_image_index, current_caption_index, created_by, status, expiry_date, repeat_annually, created_at
                )
                SELECT
                    id,
                    ${fullNameSelect},
                    phone_number,
                    CASE
                        WHEN event_type = 'Birthday' THEN 'birthday'
                        WHEN event_type = 'Wedding Anniversary' THEN 'wedding_anniversary'
                        WHEN event_type = 'monday_market' THEN 'recurrent_announcement'
                        ELSE LOWER(event_type)
                    END,
                    event_date, design_image_path, caption,
                    message_template, schedule_type, repeat_interval_days,
                    post_time, current_image_index, current_caption_index, created_by, status, expiry_date, ${repeatAnnuallySelect}, created_at
                FROM events
            `);

            // 3. Swap tables
            await db.exec('DROP TABLE events');
            await db.exec('ALTER TABLE events_new RENAME TO events');

            await db.exec('COMMIT');
            await db.exec('PRAGMA foreign_keys = ON');
            console.log('Events table successfully migrated to new schema.');
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
                        `INSERT INTO events (full_name, phone_number, event_type, event_date,
                         design_image_path, message_template, schedule_type, status, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, 'single_date', ?, ?)`,
                        [
                            ((c.first_name || '') + ' ' + (c.second_name || '')).trim() || null,
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
            instagram_business_id TEXT DEFAULT '',
            instagram_access_token TEXT DEFAULT '',
            imgbb_api_key TEXT DEFAULT '',
            instagram_enabled INTEGER DEFAULT 0,
            birthday_template TEXT DEFAULT 'Happy Birthday, {name} 🎉🎂\n\nOn this special day, MUAA FCT celebrates a remarkable and inspiring woman. Your strength, brilliance, and dedication continue to make a difference. May this new year bring you greater success, divine favor, good health, and endless happiness.\n\nKeep shining and showing the light! ✨\n\nWith love always,\nMUAA FCT\n\n@{phone}',
            anniversary_template TEXT DEFAULT 'Happy Wedding Anniversary to {name} 🎉❤️\n\nMay your love continue to grow stronger, your home be filled with peace, and your union remain blessed with joy and prosperity.\n\nWishing you many more beautiful years together in happiness and good health. 💍✨\n\nFrom MUAA FCT Chapter\n@{phone}',
            one_day_event_template TEXT DEFAULT 'Congratulations {name}! 🎉✨\n\nMUAA FCT celebrates with you on this special occasion. We wish you continued success, joy, and many more milestones ahead.\n\nKeep shining! ✨\n\nWith love always,\nMUAA FCT\n\n@{phone}'
        )
    `);

    // Add second group column if missing (migration)
    const settingsInfo = await db.all("PRAGMA table_info(settings)");
    const settingsCols = settingsInfo.map(c => c.name);
    if (!settingsCols.includes('whatsapp_group_id_2')) {
        await db.exec("ALTER TABLE settings ADD COLUMN whatsapp_group_id_2 TEXT DEFAULT ''");
    }
    if (!settingsCols.includes('instagram_business_id')) {
        await db.exec("ALTER TABLE settings ADD COLUMN instagram_business_id TEXT DEFAULT ''");
    }
    if (!settingsCols.includes('instagram_access_token')) {
        await db.exec("ALTER TABLE settings ADD COLUMN instagram_access_token TEXT DEFAULT ''");
    }
    if (!settingsCols.includes('imgbb_api_key')) {
        await db.exec("ALTER TABLE settings ADD COLUMN imgbb_api_key TEXT DEFAULT ''");
    }
    if (!settingsCols.includes('instagram_enabled')) {
        await db.exec("ALTER TABLE settings ADD COLUMN instagram_enabled INTEGER DEFAULT 0");
    }
    if (!settingsCols.includes('one_day_event_template')) {
        await db.exec("ALTER TABLE settings ADD COLUMN one_day_event_template TEXT DEFAULT 'Congratulations {name}! 🎉✨\n\nMUAA FCT celebrates with you on this special occasion. We wish you continued success, joy, and many more milestones ahead.\n\nKeep shining! ✨\n\nWith love always,\nMUAA FCT\n\n@{phone}'");
    }

    const settingsCount = await db.get('SELECT COUNT(*) as count FROM settings');
    const defaultBirthday = 'Happy Birthday, {name} 🎉🎂\n\nOn this special day, MUAA FCT celebrates a remarkable and inspiring woman. Your strength, brilliance, and dedication continue to make a difference. May this new year bring you greater success, divine favor, good health, and endless happiness.\n\nKeep shining and showing the light! ✨\n\nWith love always,\nMUAA FCT\n\n@{phone}';
    const defaultAnniversary = 'Happy Wedding Anniversary to {name} 🎉❤️\n\nMay your love continue to grow stronger, your home be filled with peace, and your union remain blessed with joy and prosperity.\n\nWishing you many more beautiful years together in happiness and good health. 💍✨\n\nFrom MUAA FCT Chapter\n@{phone}';

    if (settingsCount.count === 0) {
        await db.run(`INSERT INTO settings (id, whatsapp_group_id, birthday_template, anniversary_template) 
                     VALUES (1, '', ?, ?)`, [defaultBirthday, defaultAnniversary]);
    } else {
        // Migration: Update existing generic templates to the new MUAA FCT branded ones 
        // if they match any of the previous default versions
        const birthdayDefaults = [
            '🎉 Happy Birthday {name}! Wishing you joy, success and many more years ahead.',
            'Happy Birthday, {name}! 🎉🎂\n\nOn this special day, MUAA FCT celebrates a remarkable and inspiring individual. Your strength, brilliance, and dedication continue to make a difference. May this new year bring you greater success, divine favor, good health, and endless happiness.\n\nKeep shining and showing the light! ✨\n\nWith love always,\nMUAA FCT',
            'Happy Birthday, {name} 🎉🎂\n\nOn this special day, MUAA FCT celebrates a remarkable and inspiring individual. Your strength, brilliance, and dedication continue to make a difference. May this new year bring you greater success, divine favor, good health, and endless happiness.\n\nKeep shining and showing the light! ✨\n\nWith love always,\nMUAA FCT'
        ];

        const anniversaryDefaults = [
            '💍 Happy Wedding Anniversary {name}! May your love continue to grow and your journey together be blessed.',
            'Happy Wedding Anniversary, {name}! 💍✨\n\nMUAA FCT celebrates the beautiful bond you share today. May your union continue to be blessed with love, understanding, and joy. Wishing you many more years of togetherness and happiness.\n\nCheers to your beautiful journey! 🥂\n\nWith love always,\nMUAA FCT',
            'Happy Wedding Anniversary, {name} 💍✨\n\nMUAA FCT celebrates the beautiful bond you share today. May your union continue to be blessed with love, understanding, and joy. Wishing you many more years of togetherness and happiness.\n\nCheers to your beautiful journey! 🥂\n\nWith love always,\nMUAA FCT'
        ];

        const currentSettings = await db.get('SELECT birthday_template, anniversary_template FROM settings WHERE id = 1');

        if (!currentSettings.birthday_template || birthdayDefaults.includes(currentSettings.birthday_template) || currentSettings.birthday_template.trim() === '') {
            await db.run('UPDATE settings SET birthday_template = ? WHERE id = 1', [defaultBirthday]);
        }

        if (!currentSettings.anniversary_template || anniversaryDefaults.includes(currentSettings.anniversary_template) || currentSettings.anniversary_template.trim() === '') {
            await db.run('UPDATE settings SET anniversary_template = ? WHERE id = 1', [defaultAnniversary]);
        }
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
                details TEXT,
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
        if (!logColumns.includes('details')) {
            await db.exec("ALTER TABLE activity_logs ADD COLUMN details TEXT");
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

    // ── WhatsApp Profiles table ──
    await db.exec(`
        CREATE TABLE IF NOT EXISTS whatsapp_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            auth_dir TEXT NOT NULL UNIQUE,
            status TEXT DEFAULT 'DISCONNECTED',
            last_error TEXT,
            is_default INTEGER DEFAULT 0,
            group_id TEXT DEFAULT '',
            group_id_2 TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Add group_id_2 column if missing (migration)
    const profileColumns = await db.all("PRAGMA table_info(whatsapp_profiles)");
    const profileColNames = profileColumns.map(c => c.name);
    if (!profileColNames.includes('group_id_2')) {
        await db.exec("ALTER TABLE whatsapp_profiles ADD COLUMN group_id_2 TEXT DEFAULT ''");
    }

    // Migration: Sync global settings to primary profile if profile groups are empty
    const globalSettings = await db.get('SELECT whatsapp_group_id, whatsapp_group_id_2 FROM settings WHERE id = 1');
    if (globalSettings) {
        await db.run(`
            UPDATE whatsapp_profiles 
            SET group_id = CASE WHEN group_id = '' THEN ? ELSE group_id END,
                group_id_2 = CASE WHEN group_id_2 = '' THEN ? ELSE group_id_2 END
            WHERE is_default = 1
        `, [globalSettings.whatsapp_group_id, globalSettings.whatsapp_group_id_2]);
    }

    // ── Migrate Existing Session to Profile 1 ──
    const profileCount = await db.get('SELECT COUNT(*) as count FROM whatsapp_profiles');
    if (profileCount.count === 0) {
        console.log('Seeding primary WhatsApp profile...');
        await db.run(
            'INSERT INTO whatsapp_profiles (name, auth_dir, is_default, status) VALUES (?, ?, ?, ?)',
            ['Primary Account', 'wa_auth_baileys', 1, 'DISCONNECTED']
        );
        
        // If the old wa_auth_baileys exists in a legacy spot, the service will pick it up.
        // We'll organize future profiles into wa_auth_baileys/profile_<id>
    }

    // ── Events Table Updates ──
    const eventCols = await db.all("PRAGMA table_info(events)");
    const eventColNames = eventCols.map(c => c.name);
    if (!eventColNames.includes('whatsapp_profile_id')) {
        await db.exec("ALTER TABLE events ADD COLUMN whatsapp_profile_id INTEGER REFERENCES whatsapp_profiles(id)");
        // Update existing events to use the primary profile
        const primaryProfile = await db.get('SELECT id FROM whatsapp_profiles WHERE is_default = 1');
        if (primaryProfile) {
            await db.run('UPDATE events SET whatsapp_profile_id = ?', [primaryProfile.id]);
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

async function logActivity(userId, action, eventId, description, details = null) {
    try {
        const db = await getDb();
        const detailsStr = details && typeof details === 'object' ? JSON.stringify(details) : details;
        await db.run(
            'INSERT INTO activity_logs (user_id, action, event_id, description, details) VALUES (?, ?, ?, ?, ?)',
            [userId || null, action, eventId || null, description, detailsStr || null]
        );
        const { emitStats } = require('../services/socket');
        emitStats({ action: 'new_log' });
    } catch (e) {
        console.error('Failed to log activity:', e);
    }
}

module.exports = { initDb, getDb, logActivity };
