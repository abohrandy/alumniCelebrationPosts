const { initDb, logActivity } = require('../models/database');
const path = require('path');
const http = require('http');
const sharp = require('sharp');
sharp.cache(false);
sharp.concurrency(1);
const fs = require('fs');
const { emitStats } = require('../services/socket');

const eventController = {
    async create(req, res) {
        try {
            const {
                event_type, title,
                full_name, phone_number,
                caption, message_template,
                event_date, schedule_type, repeat_interval_days, post_time, expiry_date, repeat_annually,
                whatsapp_profile_id,
                captions // New: Array of caption strings
            } = req.body;

            // Backward compatibility
            const fullName = full_name || `${req.body.first_name || ''} ${req.body.second_name || ''}`.trim();

            if (!req.files || (!req.files.design_image && !req.files['design_image[]'])) {
                return res.status(400).json({ error: 'No image uploaded.' });
            }

            const images = req.files.design_image || req.files['design_image[]'];
            const filesToProcess = Array.isArray(images) ? images : [images];
            const uploadBase = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : 'uploads';

            // Determine upload subdirectory by event type
            const subDir = (event_type === 'monday_market' || event_type === 'recurrent_announcement') ? 'market'
                : event_type === 'announcement' ? 'announcements'
                    : event_type === 'wedding_anniversary' ? 'anniversaries'
                        : event_type === 'one_day_event' ? 'one_day'
                            : 'birthdays';

            const uploadDir = path.join(uploadBase, subDir);
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

            const dbPaths = [];
            for (const file of filesToProcess) {
                const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}-${file.name}`;
                const uploadPath = path.join(uploadDir, fileName);
                const dbPath = `uploads/${subDir}/${fileName}`;

                if (file.mimetype.startsWith('image/')) {
                    try {
                        await sharp(file.data)
                            .jpeg({ quality: 90 })
                            .toFile(uploadPath);
                    } catch (sharpErr) {
                        console.error('Sharp processing failed, saving raw file:', sharpErr.message);
                        await file.mv(uploadPath);
                    }
                } else {
                    await file.mv(uploadPath);
                }
                dbPaths.push(dbPath);
            }

            const db = await initDb();
            const userId = req.user ? req.user.id : null;

            const result = await db.run(
                `INSERT INTO events (title, full_name, phone_number, event_type, event_date, 
                 design_image_path, caption, message_template, schedule_type, repeat_interval_days, post_time, current_image_index, expiry_date, repeat_annually, created_by, whatsapp_profile_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    title || null,
                    fullName || null,
                    phone_number || null,
                    event_type,
                    event_date || null,
                    dbPaths[0],
                    caption || null,
                    message_template || null,
                    schedule_type || 'single_date',
                    repeat_interval_days || null,
                    post_time || '06:00',
                    0,
                    expiry_date || null,
                    repeat_annually ? 1 : 0,
                    userId,
                    whatsapp_profile_id || null
                ]
            );

            const eventId = result.lastID;

            // Save multiple images
            for (let i = 0; i < dbPaths.length; i++) {
                await db.run(
                    'INSERT INTO event_images (event_id, image_path, sort_order) VALUES (?, ?, ?)',
                    [eventId, dbPaths[i], i]
                );
            }

            // Save multiple captions
            if (captions) {
                const captionsList = Array.isArray(captions) ? captions : [captions];
                for (let i = 0; i < captionsList.length; i++) {
                    if (captionsList[i] && captionsList[i].trim()) {
                        await db.run(
                            'INSERT INTO event_captions (event_id, caption_text, sort_order) VALUES (?, ?, ?)',
                            [eventId, captionsList[i].trim(), i]
                        );
                    }
                }
            } else if (caption) {
                // Fallback for single caption
                await db.run(
                    'INSERT INTO event_captions (event_id, caption_text, sort_order) VALUES (?, ?, ?)',
                    [eventId, caption, 0]
                );
            }

            emitStats({ action: 'create' });

            const displayName = fullName || title || event_type;

            await logActivity(userId, 'create_event', result.lastID, `Created ${event_type}: ${displayName}`, {
                event_type, title, full_name: fullName, phone_number, event_date, schedule_type, repeat_interval_days, post_time, expiry_date, repeat_annually, whatsapp_profile_id
            });
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
                full_name, phone_number,
                caption, message_template,
                event_date, schedule_type, repeat_interval_days, post_time, expiry_date, repeat_annually,
                whatsapp_profile_id,
                captions // New: Array of caption strings
            } = req.body;

            const fullName = full_name || `${req.body.first_name || ''} ${req.body.second_name || ''}`.trim();

            const db = await initDb();

            let updateQuery = `
                UPDATE events 
                SET title = ?, full_name = ?, phone_number = ?,
                    event_type = ?, event_date = ?, caption = ?, message_template = ?,
                    schedule_type = ?, repeat_interval_days = ?, post_time = ?, expiry_date = ?, repeat_annually = ?,
                    whatsapp_profile_id = ?
            `;
            let queryParams = [
                title || null,
                fullName || null,
                phone_number || null,
                event_type,
                event_date || null,
                caption || null,
                message_template || null,
                schedule_type || 'single_date',
                repeat_interval_days || null,
                post_time || '06:00',
                expiry_date || null,
                repeat_annually ? 1 : 0,
                whatsapp_profile_id || null
            ];

            if (req.files && (req.files.design_image || req.files['design_image[]'])) {
                const images = req.files.design_image || req.files['design_image[]'];
                const filesToProcess = Array.isArray(images) ? images : [images];
                const uploadBase = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : 'uploads';

                const subDir = (event_type === 'monday_market' || event_type === 'recurrent_announcement') ? 'market'
                    : event_type === 'announcement' ? 'announcements'
                        : event_type === 'wedding_anniversary' ? 'anniversaries'
                        : event_type === 'one_day_event' ? 'one_day'
                            : 'birthdays';

                const uploadDir = path.join(uploadBase, subDir);
                if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

                const dbPaths = [];
                for (const file of filesToProcess) {
                    const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}-${file.name}`;
                    const uploadPath = path.join(uploadDir, fileName);
                    const dbPath = `uploads/${subDir}/${fileName}`;

                    if (file.mimetype.startsWith('image/')) {
                        try {
                            await sharp(file.data)
                                .jpeg({ quality: 90 })
                                .toFile(uploadPath);
                        } catch (sharpErr) {
                            console.error('Sharp processing failed, saving raw file:', sharpErr.message);
                            await file.mv(uploadPath);
                        }
                    } else {
                        await file.mv(uploadPath);
                    }
                    dbPaths.push(dbPath);
                }

                updateQuery += `, design_image_path = ?`;
                queryParams.push(dbPaths[0]);

                await db.run('DELETE FROM event_images WHERE event_id = ?', [id]);
                for (let i = 0; i < dbPaths.length; i++) {
                    await db.run(
                        'INSERT INTO event_images (event_id, image_path, sort_order) VALUES (?, ?, ?)',
                        [id, dbPaths[i], i]
                    );
                }
                updateQuery += `, current_image_index = 0`;
            }

            if (captions) {
                await db.run('DELETE FROM event_captions WHERE event_id = ?', [id]);
                const captionsList = Array.isArray(captions) ? captions : [captions];
                for (let i = 0; i < captionsList.length; i++) {
                    if (captionsList[i] && captionsList[i].trim()) {
                        await db.run(
                            'INSERT INTO event_captions (event_id, caption_text, sort_order) VALUES (?, ?, ?)',
                            [id, captionsList[i].trim(), i]
                        );
                    }
                }
                updateQuery += `, current_caption_index = 0`;
            } else if (caption) {
                 updateQuery += `, caption = ?`;
                 queryParams.push(caption);
            }

            updateQuery += ` WHERE id = ?`;
            queryParams.push(id);

            await db.run(updateQuery, queryParams);
            emitStats({ action: 'update' });

            const userId = req.user ? req.user.id : null;
            await logActivity(userId, 'edit_event', parseInt(id), `Updated event ID ${id}`, {
                event_type, title, full_name: fullName, phone_number, event_date, schedule_type, repeat_interval_days, post_time, expiry_date, repeat_annually, whatsapp_profile_id
            });
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

            // Fetch images and captions for each event
            for (const event of events) {
                event.images = await db.all("SELECT image_path, sort_order FROM event_images WHERE event_id = ? ORDER BY sort_order ASC", [event.id]);
                event.captions = await db.all("SELECT caption_text, sort_order FROM event_captions WHERE event_id = ? ORDER BY sort_order ASC", [event.id]);
            }

            res.json(events);
        } catch (error) {
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async delete(req, res) {
        try {
            const { id } = req.params;
            const db = await initDb();
            await db.run("DELETE FROM events WHERE id = ?", [id]);
            emitStats({ action: 'delete' });
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
            if (!event) return res.status(404).json({ error: 'Event not found' });
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
            if (!event) return res.status(404).json({ error: 'Event not found.' });

            // 1. Double-Post Prevention: Check if already sent today (local time)
            const alreadySent = await db.get(
                "SELECT id FROM activity_logs WHERE event_id = ? AND action = 'post_sent' AND date(created_at, 'localtime') = date('now', 'localtime')",
                [id]
            );

            if (alreadySent) {
                return res.status(400).json({ error: 'This event has already been posted today.' });
            }

            // 2. Race Condition Prevention: Mark as inactive IMMEDIATELY
            // This prevents the scheduler from picking it up if it runs in the next few seconds
            await db.run("UPDATE events SET status = 'inactive' WHERE id = ?", [id]);

            const { sendPost } = require('../services/scheduler');
            // We pass the updated event object or let sendPost handle it
            setImmediate(() => sendPost(event));
            
            res.json({ message: 'Post request initiated. Event marked as inactive to prevent duplicates.' });
        } catch (error) {
            console.error('Error in postNow:', error);
            res.status(500).json({ error: 'Internal server error.' });
        }
    }
};

module.exports = eventController;
