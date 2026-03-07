const cron = require('node-cron');
const { initDb } = require('../models/database');
const waClient = require('./whatsapp');
const path = require('path');
const { format } = require('date-fns');
const { emitLog } = require('./socket');
const { logActivity } = require('../models/database');
const instagram = require('./instagram');

async function scheduleDailyPosts() {
    // Run birthday check every 30 minutes to catch up and handle staggered times
    cron.schedule('*/30 * * * *', async () => {
        console.log('Running periodic post scheduler check...');
        await processTodayEvents();
    }, { timezone: "Africa/Lagos" });

    // Initial check on startup
    console.log('Running initial post scheduler check on startup...');
    await processTodayEvents();

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
        const now = new Date();
        const todayStr = format(now, 'yyyy-MM-dd');
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();

        const events = await db.all(
            `SELECT * FROM events 
             WHERE event_type IN ('birthday', 'wedding_anniversary') 
             AND event_date LIKE ? 
             AND status = 'active' 
             ORDER BY created_at ASC`,
            [`%${todayStr.substring(5)}`] // Matches MM-DD across years
        );

        if (events.length === 0) {
            console.log('No birthday/anniversary events for today:', todayStr);
            return;
        }

        console.log(`Found ${events.length} potential events for today. Checking schedule...`);

        for (let index = 0; index < events.length; index++) {
            const event = events[index];
            const postHour = 6;
            const postMinute = index * 10;
            const targetHour = postHour + Math.floor(postMinute / 60);
            const targetMin = postMinute % 60;

            const displayName = event.full_name || event.title || event.event_type;

            // Check if it's time to post
            if (currentHour > targetHour || (currentHour === targetHour && currentMin >= targetMin)) {
                // Check if already posted today
                const alreadyPosted = await db.get(
                    `SELECT id FROM activity_logs 
                     WHERE event_id = ? 
                     AND action = 'post_sent' 
                     AND date(created_at) = date('now', 'localtime')`,
                    [event.id]
                );

                if (alreadyPosted) {
                    console.log(`Post for ${displayName} already sent today. Skipping.`);
                    continue;
                }

                console.log(`Executing scheduled post for ${displayName} (target time was ${targetHour}:${String(targetMin).padStart(2, '0')})`);
                await sendPost(event);
            } else {
                console.log(`Staggered post for ${displayName} scheduled for ${targetHour}:${String(targetMin).padStart(2, '0')}. Waiting...`);
            }
        }

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
            // Check if event has expired
            if (event.expiry_date) {
                const expiryDate = new Date(event.expiry_date);
                expiryDate.setHours(23, 59, 59, 999); // Include the expiry date itself
                if (now > expiryDate) {
                    console.log(`Event ${event.id} (${event.title}) has expired on ${event.expiry_date}. Skipping.`);
                    continue;
                }
            }

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
            const name = event.full_name || '';
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

        // --- Instagram Posting ---
        if (settings?.instagram_enabled === 1 || settings?.instagram_enabled === true) {
            try {
                console.log('Instagram posting enabled. Preparing image...');
                // 1. Upload to ImgBB to get public URL
                const publicUrl = await instagram.uploadToImgBB(imagePath, settings.imgbb_api_key);
                console.log(`Image uploaded to ImgBB: ${publicUrl}`);

                // 2. Post to Instagram
                const igPostId = await instagram.postToInstagram(
                    publicUrl,
                    caption,
                    settings.instagram_business_id,
                    settings.instagram_access_token
                );
                console.log(`Instagram post successful! Post ID: ${igPostId}`);
                await logActivity(null, 'instagram_post_sent', event.id, `Instagram post sent. ID: ${igPostId}`, { platform: 'instagram', post_id: igPostId, public_url: publicUrl });
            } catch (igError) {
                console.error('Instagram posting failed:', igError.message);
                await logActivity(null, 'instagram_post_failed', event.id, `Instagram failed: ${igError.message}`, { platform: 'instagram', error: igError.message });
                // Don't throw here, keep WhatsApp log success if WhatsApp worked
            }
        }

        const displayName = event.full_name || event.title || event.event_type;

        const logMsg = `Post sent for ${displayName} (${event.event_type})`;
        console.log(logMsg);
        emitLog({ type: 'success', message: logMsg, timestamp: new Date().toISOString() });
        await logActivity(null, 'post_sent', event.id, logMsg, {
            event_type: event.event_type,
            display_name: displayName,
            whatsapp_primary: groupId,
            whatsapp_secondary: groupId2 || null,
            caption: caption
        });

    } catch (error) {
        const displayName = event.full_name || event.title || event.event_type;
        const errMsg = `Failed to send post for ${displayName}: ${error.message}`;
        console.error(errMsg);
        emitLog({ type: 'error', message: errMsg, timestamp: new Date().toISOString() });
        await logActivity(null, 'post_failed', event.id, errMsg, { error: error.message });
    }
}

module.exports = { scheduleDailyPosts, processTodayEvents, sendPost };
