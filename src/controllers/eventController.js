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
                event_date, schedule_type, repeat_interval_days, repeat_interval_hours, post_time, expiry_date, repeat_annually,
                whatsapp_profile_id,
                captions // New: Array of caption strings
            } = req.body;

            // Backward compatibility
            const fullName = full_name || `${req.body.first_name || ''} ${req.body.second_name || ''}`.trim();

            const parseBoolField = (val, defaultVal = 0) => {
                if (val === undefined || val === null) return defaultVal;
                if (val === true || val === 'true' || val === 1 || val === '1' || val === 'on') return 1;
                return 0;
            };

            const publishWhatsapp = parseBoolField(req.body.publish_whatsapp, 1);
            const publishFacebookFeed = parseBoolField(req.body.publish_facebook_feed, 0);
            const publishFacebookReel = parseBoolField(req.body.publish_facebook_reel, 0);
            const publishInstagramFeed = parseBoolField(req.body.publish_instagram_feed, 0);
            const publishInstagramReel = parseBoolField(req.body.publish_instagram_reel, 0);
            const publishFacebookStory = parseBoolField(req.body.publish_facebook_story, 0);

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
                 design_image_path, caption, message_template, schedule_type, repeat_interval_days, repeat_interval_hours, post_time, current_image_index, expiry_date, repeat_annually, created_by, whatsapp_profile_id,
                 publish_whatsapp, publish_facebook_feed, publish_facebook_reel, publish_instagram_feed, publish_instagram_reel, publish_facebook_story)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                    repeat_interval_hours || null,
                    post_time || '06:00',
                    0,
                    expiry_date || null,
                    repeat_annually ? 1 : 0,
                    userId,
                    whatsapp_profile_id || null,
                    publishWhatsapp,
                    publishFacebookFeed,
                    publishFacebookReel,
                    publishInstagramFeed,
                    publishInstagramReel,
                    publishFacebookStory
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

            // Trigger video reel generation if Facebook or Instagram Reel is checked
            if (publishFacebookReel === 1 || publishInstagramReel === 1) {
                try {
                    const { generateReel } = require('../services/videoGenerator');
                    const generatedReelPath = await generateReel(dbPaths[0]);
                    await db.run('UPDATE events SET generated_reel_path = ? WHERE id = ?', [generatedReelPath, eventId]);
                } catch (reelErr) {
                    console.error('Failed to generate video reel on event creation:', reelErr.message);
                }
            }

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
                event_date, schedule_type, repeat_interval_days, repeat_interval_hours, post_time, expiry_date, repeat_annually,
                whatsapp_profile_id,
                captions // New: Array of caption strings
            } = req.body;

            const fullName = full_name || `${req.body.first_name || ''} ${req.body.second_name || ''}`.trim();

            const parseBoolField = (val, defaultVal = 0) => {
                if (val === undefined || val === null) return defaultVal;
                if (val === true || val === 'true' || val === 1 || val === '1' || val === 'on') return 1;
                return 0;
            };

            const publishWhatsapp = parseBoolField(req.body.publish_whatsapp, 1);
            const publishFacebookFeed = parseBoolField(req.body.publish_facebook_feed, 0);
            const publishFacebookReel = parseBoolField(req.body.publish_facebook_reel, 0);
            const publishInstagramFeed = parseBoolField(req.body.publish_instagram_feed, 0);
            const publishInstagramReel = parseBoolField(req.body.publish_instagram_reel, 0);
            const publishFacebookStory = parseBoolField(req.body.publish_facebook_story, 0);

            const db = await initDb();

            let updateQuery = `
                UPDATE events 
                SET title = ?, full_name = ?, phone_number = ?,
                    event_type = ?, event_date = ?, caption = ?, message_template = ?,
                    schedule_type = ?, repeat_interval_days = ?, repeat_interval_hours = ?, post_time = ?, expiry_date = ?, repeat_annually = ?,
                    whatsapp_profile_id = ?, publish_whatsapp = ?, publish_facebook_feed = ?, publish_facebook_reel = ?, publish_instagram_feed = ?, publish_instagram_reel = ?, publish_facebook_story = ?
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
                repeat_interval_hours || null,
                post_time || '06:00',
                expiry_date || null,
                repeat_annually ? 1 : 0,
                whatsapp_profile_id || null,
                publishWhatsapp,
                publishFacebookFeed,
                publishFacebookReel,
                publishInstagramFeed,
                publishInstagramReel,
                publishFacebookStory
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

            // Post-update: check if we need to generate or delete the video reel
            const updatedEvent = await db.get('SELECT * FROM events WHERE id = ?', [id]);
            const shouldHaveReel = (publishFacebookReel === 1 || publishInstagramReel === 1);

            if (shouldHaveReel) {
                const imageChanged = req.files && (req.files.design_image || req.files['design_image[]']);
                const noReelExists = !updatedEvent.generated_reel_path;

                if (imageChanged || noReelExists) {
                    try {
                        if (updatedEvent.generated_reel_path) {
                            const oldReelAbs = path.resolve(process.env.DATA_DIR || '', updatedEvent.generated_reel_path);
                            if (fs.existsSync(oldReelAbs)) fs.unlinkSync(oldReelAbs);
                        }
                        const { generateReel } = require('../services/videoGenerator');
                        const nextReelPath = await generateReel(updatedEvent.design_image_path);
                        await db.run('UPDATE events SET generated_reel_path = ? WHERE id = ?', [nextReelPath, id]);
                    } catch (reelErr) {
                        console.error('Failed to regenerate video reel on update:', reelErr.message);
                    }
                }
            } else {
                if (updatedEvent.generated_reel_path) {
                    try {
                        const oldReelAbs = path.resolve(process.env.DATA_DIR || '', updatedEvent.generated_reel_path);
                        if (fs.existsSync(oldReelAbs)) fs.unlinkSync(oldReelAbs);
                        await db.run('UPDATE events SET generated_reel_path = NULL WHERE id = ?', [id]);
                    } catch (cleanupErr) {
                        console.error('Failed to clean up old reel:', cleanupErr.message);
                    }
                }
            }

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
            
            // Clean up the generated reel file if it exists
            const event = await db.get("SELECT generated_reel_path FROM events WHERE id = ?", [id]);
            if (event && event.generated_reel_path) {
                try {
                    const reelAbs = path.resolve(process.env.DATA_DIR || '', event.generated_reel_path);
                    if (fs.existsSync(reelAbs)) fs.unlinkSync(reelAbs);
                } catch (cleanupErr) {
                    console.error('Failed to delete reel file on event removal:', cleanupErr.message);
                }
            }

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
            if (req.query.force !== 'true') {
                const alreadySent = await db.get(
                    "SELECT id FROM activity_logs WHERE event_id = ? AND action = 'post_sent' AND date(created_at, 'localtime') = date('now', 'localtime')",
                    [id]
                );

                if (alreadySent) {
                    return res.status(400).json({ error: 'This event has already been posted today.' });
                }
            }

            // Fetch images and captions to use the correct round-robin item
            const images = await db.all('SELECT * FROM event_images WHERE event_id = ? ORDER BY sort_order ASC', [event.id]);
            const captions = await db.all('SELECT * FROM event_captions WHERE event_id = ? ORDER BY sort_order ASC', [event.id]);

            let selectedImagePath = event.design_image_path;
            let nextImageIndex = event.current_image_index;
            if (images.length > 0) {
                const imgIndex = (event.current_image_index || 0) % images.length;
                selectedImagePath = images[imgIndex].image_path;
                nextImageIndex = (imgIndex + 1) % images.length;
            }

            let selectedCaption = event.caption;
            let nextCaptionIndex = event.current_caption_index || 0;
            if (captions.length > 0) {
                const capIndex = (event.current_caption_index || 0) % captions.length;
                selectedCaption = captions[capIndex].caption_text;
                nextCaptionIndex = (capIndex + 1) % captions.length;
            }

            const eventToPost = { 
                ...event, 
                design_image_path: selectedImagePath,
                caption: selectedCaption
            };

            // 2. Race Condition Prevention & Lifecycle Updates
            let statusMessage = 'Post request initiated.';
            if (['birthday', 'wedding_anniversary', 'one_day_event'].includes(event.event_type)) {
                // Mark as inactive IMMEDIATELY to prevent the minutely scheduler from picking it up
                await db.run("UPDATE events SET status = 'inactive' WHERE id = ?", [id]);
                statusMessage += ' Event marked as inactive to prevent duplicates.';
            } else {
                // For recurrent events, update the round-robin indexes so the next post uses the next image/caption
                await db.run(
                    'UPDATE events SET current_image_index = ?, current_caption_index = ? WHERE id = ?',
                    [nextImageIndex, nextCaptionIndex, event.id]
                );
            }

            const { sendPost } = require('../services/scheduler');
            // Pass the updated event object with correct round-robin image/caption and force override
            setImmediate(() => sendPost(eventToPost, req.query.force === 'true'));
            
            res.json({ message: statusMessage });
        } catch (error) {
            console.error('Error in postNow:', error);
            res.status(500).json({ error: 'Internal server error.' });
        }
    }
};

module.exports = eventController;
