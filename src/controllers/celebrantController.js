const { initDb, logActivity } = require('../models/database');
const path = require('path');
const http = require('http');
const sharp = require('sharp');
sharp.cache(false);
sharp.concurrency(1);
const fs = require('fs');
const { emitStats } = require('../services/socket');

const celebrantController = {
    async create(req, res) {
        try {
            const { full_name, phone_number, event_type, event_date, message_template } = req.body;
            const fullName = full_name || `${req.body.first_name || ''} ${req.body.second_name || ''}`.trim();

            if (!req.files || !req.files.design_image) {
                return res.status(400).json({ error: 'No image uploaded.' });
            }

            const image = req.files.design_image;
            const uploadBase = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : 'uploads';
            const uploadDir = event_type === 'Birthday' ? path.join(uploadBase, 'birthdays') : path.join(uploadBase, 'anniversaries');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

            const fileName = `${Date.now()}-${image.name}`;
            const uploadPath = path.join(uploadDir, fileName);
            const dbPath = event_type === 'Birthday' ? `uploads/birthdays/${fileName}` : `uploads/anniversaries/${fileName}`;

            if (image.mimetype.startsWith('image/')) {
                await sharp(image.data)
                    .jpeg({ quality: 90 })
                    .toFile(uploadPath);
            } else {
                // For videos and other non-image files, just move them
                await image.mv(uploadPath);
            }

            const db = await initDb();
            const result = await db.run(
                `INSERT INTO events (full_name, phone_number, event_type, event_date, design_image_path, message_template)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [fullName || null, phone_number, event_type, event_date, dbPath, message_template]
            );

            emitStats({ action: 'create' });
            await logActivity(null, 'celebrant_added', result.lastID, `Added ${event_type} for ${fullName}`, { full_name: fullName, event_type, event_date });
            res.status(201).json({ message: 'Celebrant created successfully', id: result.lastID });
        } catch (error) {
            console.error('Error creating celebrant:', error);
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async update(req, res) {
        try {
            const { id } = req.params;
            const { full_name, phone_number, event_type, event_date, message_template } = req.body;
            const fullName = full_name || `${req.body.first_name || ''} ${req.body.second_name || ''}`.trim();
            const db = await initDb();

            let updateQuery = `
                UPDATE events 
                SET full_name = ?, phone_number = ?, event_type = ?, event_date = ?, message_template = ?
            `;
            let queryParams = [fullName || null, phone_number, event_type, event_date, message_template || null];

            if (req.files && req.files.design_image) {
                const image = req.files.design_image;
                const uploadBase = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : 'uploads';
                const uploadDir = event_type === 'Birthday' ? path.join(uploadBase, 'birthdays') : path.join(uploadBase, 'anniversaries');
                if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

                const fileName = `${Date.now()}-${image.name}`;
                const uploadPath = path.join(uploadDir, fileName);
                const dbPath = event_type === 'Birthday' ? `uploads/birthdays/${fileName}` : `uploads/anniversaries/${fileName}`;

                if (image.mimetype.startsWith('image/')) {
                    await sharp(image.data)
                        .jpeg({ quality: 90 })
                        .toFile(uploadPath);
                } else {
                    await image.mv(uploadPath);
                }

                updateQuery += `, design_image_path = ?`;
                queryParams.push(dbPath);
            }

            updateQuery += ` WHERE id = ?`;
            queryParams.push(id);

            await db.run(updateQuery, queryParams);
            emitStats({ action: 'update' });
            await logActivity(null, 'celebrant_updated', parseInt(id), `Updated celebrant ID ${id}`, { full_name: fullName, event_type, event_date });
            res.json({ message: 'Celebrant updated successfully.' });
        } catch (error) {
            console.error('Error updating celebrant:', error);
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async list(req, res) {
        try {
            const db = await initDb();
            const events = await db.all("SELECT * FROM events ORDER BY event_date ASC");
            res.json(events);
        } catch (error) {
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async delete(req, res) {
        try {
            const { id } = req.params;
            const db = await initDb();

            // Get path to delete file
            const event = await db.get("SELECT design_image_path FROM events WHERE id = ?", [id]);
            if (event && fs.existsSync(event.design_image_path)) {
                fs.unlinkSync(event.design_image_path);
            }

            await db.run("DELETE FROM events WHERE id = ?", [id]);
            emitStats({ action: 'delete' });
            await logActivity(null, 'celebrant_deleted', parseInt(id), `Deleted celebrant ID ${id}`, { id });
            res.json({ message: 'Celebrant deleted.' });
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
                return res.status(404).json({ error: 'Celebrant not found.' });
            }

            const { sendPost } = require('../services/scheduler');
            // Note: sendPost captures its own errors and logs them, we just trigger it and return immediately.
            setImmediate(() => sendPost(event));

            res.json({ message: 'Post request initiated. Check recent logs for status.' });
        } catch (error) {
            console.error('Error in postNow:', error);
            res.status(500).json({ error: 'Internal server error.' });
        }
    }
};

module.exports = celebrantController;
