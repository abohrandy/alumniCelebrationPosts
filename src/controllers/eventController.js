const { initDb, logActivity } = require('../models/database');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const { emitStats } = require('../services/socket');

const eventController = {
    async create(req, res) {
        try {
            const {
                event_type, title,
                first_name, second_name, phone_number,
                caption, message_template,
                event_date, schedule_type, repeat_interval_days, post_time
            } = req.body;

            if (!req.files || (!req.files.design_image && !req.files['design_image[]'])) {
                return res.status(400).json({ error: 'No image uploaded.' });
            }

            const images = req.files.design_image || req.files['design_image[]'];
            const filesToProcess = Array.isArray(images) ? images : [images];
            const uploadBase = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : 'uploads';

            // Determine upload subdirectory by event type
            const subDir = event_type === 'monday_market' ? 'market'
                : event_type === 'announcement' ? 'announcements'
                    : event_type === 'wedding_anniversary' ? 'anniversaries'
                        : 'birthdays';

            const uploadDir = path.join(uploadBase, subDir);
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

            const dbPaths = [];
            for (const file of filesToProcess) {
                const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}-${file.name}`;
                const uploadPath = path.join(uploadDir, fileName);
                const dbPath = `uploads/${subDir}/${fileName}`;

                try {
                    await sharp(file.data)
                        .jpeg({ quality: 90 })
                        .toFile(uploadPath);
                } catch (sharpErr) {
                    console.error('Sharp processing failed, saving raw file:', sharpErr.message);
                    await file.mv(uploadPath);
                }
                dbPaths.push(dbPath);
            }

            const db = await initDb();
            const userId = req.user ? req.user.id : null;

            const result = await db.run(
                `INSERT INTO events (title, first_name, second_name, phone_number, event_type, event_date, 
                 design_image_path, caption, message_template, schedule_type, repeat_interval_days, post_time, current_image_index, expiry_date, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    title || null,
                    first_name || null,
                    second_name || null,
                    phone_number || null,
                    event_type,
                    event_date || null,
                    dbPaths[0], // First image as main path
                    caption || null,
                    message_template || null,
                    schedule_type || 'single_date',
                    repeat_interval_days || null,
                    post_time || '06:00',
                    0, // initial index
                    expiry_date || null,
                    userId
                ]
            );

            const eventId = result.lastID;

            // Insert all images into event_images table
            for (let i = 0; i < dbPaths.length; i++) {
                await db.run(
                    'INSERT INTO event_images (event_id, image_path, sort_order) VALUES (?, ?, ?)',
                    [eventId, dbPaths[i], i]
                );
            }

            emitStats({ action: 'create' });

            const displayName = first_name
                ? `${first_name} ${second_name || ''}`
                : title || event_type;

            await logActivity(userId, 'create_event', result.lastID, `Created ${event_type}: ${displayName}`);
            res.status(201).json({ message: 'Event created successfully', id: result.lastID });
        } catch (error) {
            console.error('Error creating event:', error);
            res.status(500).json({ error: error.message || 'Internal server error.' });
        }
    },

    async update(req, res) {
        try {
            const { id } = req.params;
            const {
                event_type, title,
                first_name, second_name, phone_number,
                caption, message_template,
                event_date, schedule_type, repeat_interval_days, post_time
            } = req.body;

            const db = await initDb();

            let updateQuery = `
                UPDATE events 
                SET title = ?, first_name = ?, second_name = ?, phone_number = ?,
                    event_type = ?, event_date = ?, caption = ?, message_template = ?,
                    schedule_type = ?, repeat_interval_days = ?, post_time = ?, expiry_date = ?
            `;
            let queryParams = [
                title || null,
                first_name || null,
                second_name || null,
                phone_number || null,
                event_type,
                event_date || null,
                caption || null,
                message_template || null,
                schedule_type || 'single_date',
                repeat_interval_days || null,
                post_time || '06:00',
                expiry_date || null
            ];

            if (req.files && (req.files.design_image || req.files['design_image[]'])) {
                const images = req.files.design_image || req.files['design_image[]'];
                const filesToProcess = Array.isArray(images) ? images : [images];
                const uploadBase = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : 'uploads';

                const subDir = event_type === 'monday_market' ? 'market'
                    : event_type === 'announcement' ? 'announcements'
                        : event_type === 'wedding_anniversary' ? 'anniversaries'
                            : 'birthdays';

                const uploadDir = path.join(uploadBase, subDir);
                if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

                const dbPaths = [];
                for (const file of filesToProcess) {
                    const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}-${file.name}`;
                    const uploadPath = path.join(uploadDir, fileName);
                    const dbPath = `uploads/${subDir}/${fileName}`;

                    await sharp(file.data)
                        .jpeg({ quality: 90 })
                        .toFile(uploadPath);

                    dbPaths.push(dbPath);
                }

                updateQuery += `, design_image_path = ?`;
                queryParams.push(dbPaths[0]);

                // Clear old images for this event and add new ones (Overwrite approach)
                await db.run('DELETE FROM event_images WHERE event_id = ?', [id]);
                for (let i = 0; i < dbPaths.length; i++) {
                    await db.run(
                        'INSERT INTO event_images (event_id, image_path, sort_order) VALUES (?, ?, ?)',
                        [id, dbPaths[i], i]
                    );
                }
                // Reset index if images changed
                updateQuery += `, current_image_index = 0`;
            }

            updateQuery += ` WHERE id = ?`;
            queryParams.push(id);

            await db.run(updateQuery, queryParams);
            emitStats({ action: 'update' });

            const userId = req.user ? req.user.id : null;
            await logActivity(userId, 'edit_event', parseInt(id), `Updated event ID ${id}`);
            res.json({ message: 'Event updated successfully.' });
        } catch (error) {
            console.error('Error updating event:', error);
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async list(req, res) {
        try {
            const db = await initDb();
            const events = await db.all(`
                SELECT e.*, u.name as creator_name 
                FROM events e 
                LEFT JOIN users u ON e.created_by = u.id 
                ORDER BY e.created_at DESC
            `);
            res.json(events);
        } catch (error) {
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async delete(req, res) {
        try {
            const { id } = req.params;
            const db = await initDb();

            const event = await db.get("SELECT design_image_path FROM events WHERE id = ?", [id]);
            if (event && event.design_image_path) {
                const fullPath = process.env.DATA_DIR
                    ? path.join(process.env.DATA_DIR, event.design_image_path.replace('uploads/', ''))
                    : event.design_image_path;
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            }

            await db.run("DELETE FROM events WHERE id = ?", [id]);
            emitStats({ action: 'delete' });

            const userId = req.user ? req.user.id : null;
            await logActivity(userId, 'delete_event', parseInt(id), `Deleted event ID ${id}`);
            res.json({ message: 'Event deleted.' });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async toggleStatus(req, res) {
        try {
            const { id } = req.params;
            const db = await initDb();
            const event = await db.get("SELECT status FROM events WHERE id = ?", [id]);
            const newStatus = event.status === 'active' ? 'inactive' : 'active';

            await db.run("UPDATE events SET status = ? WHERE id = ?", [newStatus, id]);
            res.json({ id, status: newStatus });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async postNow(req, res) {
        try {
            const { id } = req.params;
            const db = await initDb();
            const event = await db.get("SELECT * FROM events WHERE id = ?", [id]);

            if (!event) {
                return res.status(404).json({ error: 'Event not found.' });
            }

            const { sendPost } = require('../services/scheduler');
            setImmediate(() => sendPost(event));

            res.json({ message: 'Post request initiated. Check recent logs for status.' });
        } catch (error) {
            console.error('Error in postNow:', error);
            res.status(500).json({ error: 'Internal server error.' });
        }
    }
};

module.exports = eventController;
