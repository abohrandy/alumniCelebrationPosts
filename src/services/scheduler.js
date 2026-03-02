const cron = require('node-cron');
const { initDb } = require('../models/database');
const waClient = require('./whatsapp');
const path = require('path');
const { format } = require('date-fns');
const { emitLog } = require('./socket');
const { logActivity } = require('../models/database');

async function scheduleDailyPosts() {
    // ── Birthday & Wedding Anniversary ──
    // Run every day at 1:00 AM to prepare the queue for 6:00 AM
    cron.schedule('0 1 * * *', async () => {
        console.log('Running daily post scheduler check...');
        await processTodayEvents();
    });

    // ── Monday Market ──
    // Every Monday at 5:00 AM
    cron.schedule('0 5 * * 1', async () => {
        console.log('Running Monday Market scheduler...');
        await processWeeklyEvents();
    }, { timezone: "Africa/Lagos" });

    // ── Interval-based events (Announcements) ──
    // Check every hour if any interval-based event should be posted
    cron.schedule('0 * * * *', async () => {
        await processIntervalEvents();
    }, { timezone: "Africa/Lagos" });

    console.log('Daily scheduler initialized.');
}

// ── Birthday / Wedding Anniversary (single_date) ──
async function processTodayEvents() {
    try {
        const db = await initDb();
        const today = format(new Date(), 'yyyy-MM-dd');

        const events = await db.all(
            `SELECT * FROM events 
             WHERE event_type IN ('birthday', 'wedding_anniversary') 
             AND event_date LIKE ? 
             AND status = 'active' 
             ORDER BY created_at ASC`,
            [`%${today.substring(5)}`] // Matches MM-DD across years
        );

        if (events.length === 0) {
            console.log('No birthday/anniversary events for today:', today);
            return;
        }

        console.log(`Found ${events.length} events for today. Scheduling posts...`);

        events.forEach((event, index) => {
            const postHour = 6;
            const postMinute = index * 30;
            const actualHour = postHour + Math.floor(postMinute / 60);
            const actualMin = postMinute % 60;
            const cronTime = `${actualMin} ${actualHour} * * *`;

            cron.schedule(cronTime, async () => {
                const displayName = `${event.first_name || ''} ${event.second_name || ''}`.trim();
                console.log(`Executing post for ${displayName} at ${actualHour}:${String(actualMin).padStart(2, '0')}`);
                await sendPost(event);
            }, {
                scheduled: true,
                timezone: "Africa/Lagos"
            });

            const displayName = `${event.first_name || ''} ${event.second_name || ''}`.trim();
            console.log(`Scheduled: ${displayName} at ${actualHour}:${String(actualMin).padStart(2, '0')}`);
        });

    } catch (error) {
        console.error('Error processing today\'s events:', error);
    }
}

// ── Monday Market (weekly) ──
async function processWeeklyEvents() {
    try {
        const db = await initDb();

        const events = await db.all(
            `SELECT * FROM events 
             WHERE event_type = 'monday_market' 
             AND schedule_type = 'weekly'
             AND status = 'active'
             ORDER BY created_at ASC`
        );

        if (events.length === 0) {
            console.log('No Monday Market events to post.');
            return;
        }

        console.log(`Posting ${events.length} Monday Market events...`);

        for (const event of events) {
            // Get all images for this event
            const images = await db.all(
                'SELECT * FROM event_images WHERE event_id = ? ORDER BY sort_order ASC',
                [event.id]
            );

            if (images.length > 0) {
                // Determine which image to post
                const index = event.current_image_index % images.length;
                const selectedImage = images[index];

                // Temporarily override the event's design_image_path for sendPost
                const eventToPost = { ...event, design_image_path: selectedImage.image_path };
                await sendPost(eventToPost);

                // Update index for next week
                await db.run(
                    'UPDATE events SET current_image_index = ? WHERE id = ?',
                    [(index + 1) % images.length, event.id]
                );
            } else {
                // Fallback to single image if no records in event_images
                await sendPost(event);
            }
        }
    } catch (error) {
        console.error('Error processing weekly events:', error);
    }
}

// ── Announcements (interval) ──
async function processIntervalEvents() {
    try {
        const db = await initDb();
        const now = new Date();
        const currentHour = String(now.getHours()).padStart(2, '0');
        const currentMin = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${currentHour}:${currentMin}`;

        const events = await db.all(
            `SELECT * FROM events
             WHERE schedule_type = 'interval'
             AND status = 'active'
             AND post_time = ?
             ORDER BY created_at ASC`,
            [currentTime]
        );

        for (const event of events) {
            // Check if enough days have passed since creation or last post
            if (event.repeat_interval_days) {
                const createdDate = new Date(event.created_at);
                const daysSinceCreation = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));

                if (daysSinceCreation % event.repeat_interval_days === 0) {
                    console.log(`Posting interval event: ${event.title || event.id}`);
                    await sendPost(event);
                }
            }
        }
    } catch (error) {
        console.error('Error processing interval events:', error);
    }
}

// ── Send Post (handles all event types) ──
async function sendPost(event) {
    try {
        const db = await initDb();
        const settings = await db.get('SELECT * FROM settings WHERE id = 1');
        const groupId = settings?.whatsapp_group_id || process.env.WHATSAPP_GROUP_ID;
        const groupId2 = settings?.whatsapp_group_id_2 || '';

        if (!groupId) {
            console.error('WhatsApp Group ID not found in settings or .env');
            return;
        }

        let caption = '';

        if (event.event_type === 'birthday' || event.event_type === 'wedding_anniversary') {
            // Use custom caption, event template, or default template
            if (event.caption && event.caption.trim() !== '') {
                caption = event.caption;
            } else if (event.message_template && event.message_template.trim() !== '') {
                caption = event.message_template;
            } else {
                caption = event.event_type === 'wedding_anniversary'
                    ? (settings?.anniversary_template || '💍 Happy Wedding Anniversary {name}!')
                    : (settings?.birthday_template || '🎉 Happy Birthday {name}!');
            }
            const name = `${event.first_name || ''} ${event.second_name || ''}`.trim();
            const phone = event.phone_number || '';
            caption = caption.replace(/{name}/g, name).replace(/{phone}/g, phone);
        } else {
            // monday_market / announcement — use caption directly
            caption = event.caption || event.title || '';
        }

        const imagePath = process.env.DATA_DIR
            ? path.resolve(process.env.DATA_DIR, event.design_image_path)
            : path.resolve(event.design_image_path);

        // Send to primary group
        await waClient.sendImageWithCaption(groupId, imagePath, caption);

        // Send to secondary group if configured (skip for Monday Market)
        if (groupId2 && event.event_type !== 'monday_market') {
            try {
                await waClient.sendImageWithCaption(groupId2, imagePath, caption);
                console.log(`Also sent to secondary group: ${groupId2}`);
            } catch (err2) {
                console.error(`Failed to send to secondary group ${groupId2}:`, err2.message);
            }
        }

        const displayName = event.first_name
            ? `${event.first_name} ${event.second_name || ''}`.trim()
            : event.title || event.event_type;

        const logMsg = `Post sent for ${displayName} (${event.event_type})`;
        console.log(logMsg);
        emitLog({ type: 'success', message: logMsg, timestamp: new Date().toISOString() });
        await logActivity(null, 'post_sent', event.id, logMsg);

    } catch (error) {
        const displayName = event.first_name
            ? `${event.first_name || ''}`.trim()
            : event.title || event.event_type;
        const errMsg = `Failed to send post for ${displayName}: ${error.message}`;
        console.error(errMsg);
        emitLog({ type: 'error', message: errMsg, timestamp: new Date().toISOString() });
        await logActivity(null, 'post_failed', event.id, errMsg);
    }
}

module.exports = { scheduleDailyPosts, processTodayEvents, sendPost };
