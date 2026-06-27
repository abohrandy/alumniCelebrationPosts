const cron = require('node-cron');
const { initDb } = require('../models/database');
const waClient = require('./whatsapp');
const path = require('path');
const { format } = require('date-fns');
const { emitLog } = require('./socket');
const { logActivity } = require('../models/database');
const instagram = require('./instagram');

// ── Cleanup Past One-Day Events ──
async function cleanupOneDayEvents() {
    try {
        const db = await initDb();
        const now = new Date();
        const todayStr = format(now, 'yyyy-MM-dd');

        // Deactivate all one_day_events whose event_date is earlier than today AND are not repeating annually
        const result = await db.run(
            `UPDATE events 
             SET status = 'inactive' 
             WHERE event_type = 'one_day_event' 
             AND status = 'active'
             AND (repeat_annually IS NULL OR repeat_annually = 0)
             AND event_date < ?`,
            [todayStr]
        );
        
        if (result && result.changes > 0) {
            console.log(`Cleaned up (deactivated) ${result.changes} past one-day events.`);
            await logActivity(null, 'cleanup', null, `Deactivated ${result.changes} past one-day events.`);
        }
    } catch (error) {
        console.error('Error cleaning up one-day events:', error);
    }
}

// ── Reactivate Yearly Events ──
async function reactivateYearlyEvents() {
    try {
        const db = await initDb();
        const currentYear = new Date().getFullYear().toString();

        // Reactivate birthdays, anniversaries, and repeating one-day events
        // ONLY if they haven't been successfully posted yet in the current year.
        const result = await db.run(`
            UPDATE events 
            SET status = 'active'
            WHERE event_type IN ('birthday', 'wedding_anniversary', 'one_day_event')
            AND (event_type != 'one_day_event' OR repeat_annually = 1)
            AND status = 'inactive'
            AND id NOT IN (
                SELECT event_id FROM activity_logs 
                WHERE action = 'post_sent' 
                AND strftime('%Y', created_at) = ?
            )
        `, [currentYear]);

        if (result && result.changes > 0) {
            console.log(`Reactivated ${result.changes} yearly events for ${currentYear}.`);
            await logActivity(null, 'reactivate_yearly', null, `Reactivated ${result.changes} yearly events for ${currentYear}.`);
        }
    } catch (error) {
        console.error('Error reactivating yearly events:', error);
    }
}

// ── Cleanup Old Video Reels (Older than 7 days) ──
async function cleanupOldReels() {
    try {
        const db = await initDb();
        const events = await db.all("SELECT id, generated_reel_path FROM events WHERE generated_reel_path IS NOT NULL");
        const fs = require('fs');
        const now = new Date();
        let deletedCount = 0;

        for (const event of events) {
            try {
                const fullPath = path.resolve(process.env.DATA_DIR || '', event.generated_reel_path);
                if (fs.existsSync(fullPath)) {
                    const stats = fs.statSync(fullPath);
                    const ageInDays = (now.getTime() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
                    if (ageInDays > 7) {
                        fs.unlinkSync(fullPath);
                        await db.run("UPDATE events SET generated_reel_path = NULL WHERE id = ?", [event.id]);
                        deletedCount++;
                    }
                } else {
                    // Path exists in DB but file is missing on disk, clean up DB reference
                    await db.run("UPDATE events SET generated_reel_path = NULL WHERE id = ?", [event.id]);
                }
            } catch (err) {
                console.error(`Error deleting old reel for event ${event.id}:`, err.message);
            }
        }

        if (deletedCount > 0) {
            console.log(`Cleaned up ${deletedCount} reels older than 7 days.`);
            await logActivity(null, 'cleanup_reels', null, `Deleted ${deletedCount} reels older than 7 days.`);
        }
    } catch (error) {
        console.error('Error cleaning up old reels:', error);
    }
}

async function scheduleDailyPosts() {
    // ── Daily Cleanup ──
    // Every day at midnight
    cron.schedule('0 0 * * *', async () => {
        console.log('Running daily cleanup and reactivation...');
        await reactivateYearlyEvents();
        await cleanupOneDayEvents();
        await cleanupOldReels();
    }, { timezone: "Africa/Lagos" });

    // Run birthday check every minute to handle staggered times accurately
    cron.schedule('* * * * *', async () => {
        console.log('Running periodic post scheduler check...');
        await processTodayEvents();
    }, { timezone: "Africa/Lagos" });

    // Initial check on startup
    console.log('Running initial post scheduler check on startup...');
    await reactivateYearlyEvents();
    await cleanupOneDayEvents();
    await cleanupOldReels();
    await processTodayEvents();

    // ── Monday Market ──
    // Every Monday at 5:00 AM
    cron.schedule('0 5 * * 1', async () => {
        console.log('Running Monday Market scheduler...');
        await processWeeklyEvents();
    }, { timezone: "Africa/Lagos" });

    // ── Interval-based events (Announcements) ──
    // Check every minute if any interval-based event should be posted
    cron.schedule('* * * * *', async () => {
        await processIntervalEvents();
    }, { timezone: "Africa/Lagos" });

    console.log('Daily scheduler initialized.');
}

// ── Birthday / Wedding Anniversary (single_date) ──
async function processTodayEvents() {
    try {
        const db = await initDb();
        const now = new Date();
        
        // Get date in Lagos
        const dateOptions = { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' };
        const dateStr = new Intl.DateTimeFormat('en-GB', dateOptions).format(now); 
        const [d, m, y] = dateStr.split('/');
        const todayStr = `${y}-${m}-${d}`;
        
        // Get time in Lagos
        const timeOptions = { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false };
        let currentTime = new Intl.DateTimeFormat('en-US', timeOptions).format(now);
        if (currentTime.startsWith('24:')) currentTime = currentTime.replace('24:', '00:');
        const [currentHourStr, currentMinStr] = currentTime.split(':');
        const currentHour = parseInt(currentHourStr, 10);
        const currentMin = parseInt(currentMinStr, 10);

        const events = await db.all(
            `SELECT * FROM events 
             WHERE event_type IN ('birthday', 'wedding_anniversary', 'one_day_event') 
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
                     AND date(created_at, 'localtime') = date('now', 'localtime')`,
                    [event.id]
                );

                if (alreadyPosted) {
                    continue;
                }

                // Check global gap to avoid batching multiple events in one run
                // We use UTC comparison (SQLite's default) to be timezone-independent
                const recentPost = await db.get(
                    `SELECT id FROM activity_logs 
                     WHERE action = 'post_sent' 
                     AND created_at > datetime('now', '-10 minutes')
                     LIMIT 1`
                );

                if (recentPost) {
                    return;
                }

                console.log(`Executing scheduled post for ${displayName} (target time was ${targetHour}:${String(targetMin).padStart(2, '0')})`);
                
                // --- Race Condition Prevention ---
                // Mark as inactive BEFORE initiating sendPost to prevent manual triggers from conflicting
                await db.run("UPDATE events SET status = 'inactive' WHERE id = ?", [event.id]);

                await module.exports.sendPost(event);
                
                // After one successful post attempt, we exit this run. 
                // This ensures we never batch multiple posts and always respect the 1-minute cron check cycle.
                return;
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
             WHERE event_type IN ('monday_market', 'recurrent_announcement')
             AND schedule_type = 'weekly'
             AND status = 'active'
             ORDER BY created_at ASC`
        );

        if (events.length === 0) {
            console.log('No weekly recurrent events to post.');
            return;
        }

        console.log(`Processing ${events.length} weekly recurrent events...`);

        for (const event of events) {
            // 1. Get all images and captions for this event
            const images = await db.all(
                'SELECT * FROM event_images WHERE event_id = ? ORDER BY sort_order ASC',
                [event.id]
            );
            const captions = await db.all(
                'SELECT * FROM event_captions WHERE event_id = ? ORDER BY sort_order ASC',
                [event.id]
            );

            // 2. Determine which image to post
            let selectedImagePath = event.design_image_path;
            let nextImageIndex = event.current_image_index;
            if (images.length > 0) {
                const imgIndex = event.current_image_index % images.length;
                selectedImagePath = images[imgIndex].image_path;
                nextImageIndex = (imgIndex + 1) % images.length;
            }

            // 3. Determine which caption to post
            let selectedCaption = event.caption;
            let nextCaptionIndex = event.current_caption_index || 0;
            if (captions.length > 0) {
                const capIndex = (event.current_caption_index || 0) % captions.length;
                selectedCaption = captions[capIndex].caption_text;
                nextCaptionIndex = (capIndex + 1) % captions.length;
            }

            // 4. Send the post
            const eventToPost = { 
                ...event, 
                design_image_path: selectedImagePath,
                caption: selectedCaption
            };
            
            console.log(`[WA-Scheduler] Posting round-robin variation for "${event.title || event.id}" (Img: ${nextImageIndex}, Cap: ${nextCaptionIndex})`);
            await sendPost(eventToPost);

            // 5. Update indexes for next time
            await db.run(
                'UPDATE events SET current_image_index = ?, current_caption_index = ? WHERE id = ?',
                [nextImageIndex, nextCaptionIndex, event.id]
            );
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
        
        // Get current time in Lagos
        const timeOptions = { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false };
        let currentTime = new Intl.DateTimeFormat('en-US', timeOptions).format(now);
        if (currentTime.startsWith('24:')) currentTime = currentTime.replace('24:', '00:');
        
        // Get current date in Lagos
        const dateOptions = { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' };
        const dateStr = new Intl.DateTimeFormat('en-GB', dateOptions).format(now); 
        const [d, m, y] = dateStr.split('/');
        const todayDate = new Date(`${y}-${m}-${d}T00:00:00Z`);

        // 1. Check ALL active interval events for expiry and auto-deactivate
        const allActiveIntervals = await db.all(
            "SELECT * FROM events WHERE schedule_type = 'interval' AND status = 'active'"
        );

        for (const event of allActiveIntervals) {
            if (event.expiry_date) {
                const expiryDate = new Date(event.expiry_date);
                expiryDate.setHours(23, 59, 59, 999);
                if (now > expiryDate) {
                    console.log(`Event ${event.id} (${event.title}) has expired on ${event.expiry_date}. Deleting.`);
                    // Deleting the image files
                    if (event.design_image_path) {
                        try {
                            const fullPath = process.env.DATA_DIR 
                                ? path.resolve(process.env.DATA_DIR, event.design_image_path.replace('uploads/', '')) 
                                : path.resolve(event.design_image_path);
                            if (require('fs').existsSync(fullPath)) require('fs').unlinkSync(fullPath);
                        } catch(e) {}
                    }
                    await db.run("DELETE FROM events WHERE id = ?", [event.id]);
                    emitLog({ type: 'success', message: `Announcement "${event.title || event.id}" auto-deleted due to expiry.`, timestamp: new Date().toISOString() });
                    await logActivity(null, 'event_deleted', event.id, `Announcement "${event.title || event.id}" auto-deleted due to expiry (${event.expiry_date})`);
                }
            }
        }

        // 2. Process events due for posting NOW
        const eventsToPost = await db.all(
            `SELECT * FROM events
             WHERE schedule_type = 'interval'
             AND status = 'active'
             AND post_time = ?
             ORDER BY created_at ASC`,
            [currentTime]
        );

        for (const event of eventsToPost) {
            // Check if enough days have passed since creation or last post
            if (event.repeat_interval_days) {
                const createdDateStr = event.created_at.split(' ')[0]; // Extract YYYY-MM-DD
                const createdDate = new Date(`${createdDateStr}T00:00:00Z`);
                const daysSinceCreation = Math.round((todayDate - createdDate) / (1000 * 60 * 60 * 24));

                if (daysSinceCreation % event.repeat_interval_days === 0) {
                    console.log(`Processing interval event: ${event.title || event.id}`);
                    
                    // Round Robin Logic for Interval Events
                    const images = await db.all('SELECT * FROM event_images WHERE event_id = ? ORDER BY sort_order ASC', [event.id]);
                    const captions = await db.all('SELECT * FROM event_captions WHERE event_id = ? ORDER BY sort_order ASC', [event.id]);

                    let selectedImagePath = event.design_image_path;
                    let nextImageIndex = event.current_image_index;
                    if (images.length > 0) {
                        const imgIndex = event.current_image_index % images.length;
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
                    
                    await sendPost(eventToPost);

                    // Update indexes
                    await db.run(
                        'UPDATE events SET current_image_index = ?, current_caption_index = ? WHERE id = ?',
                        [nextImageIndex, nextCaptionIndex, event.id]
                    );
                }
            }
        }
    } catch (error) {
        console.error('Error processing interval events:', error);
    }
}

// ── Send Post (handles all event types) ──
async function sendPost(event, _isRetry = false) {
    try {
        const db = await initDb();

        // --- Final Double-Post Guard ---
        // Check if this specific event was already successfully posted today (local time)
        const alreadySent = await db.get(
            "SELECT id FROM activity_logs WHERE event_id = ? AND action = 'post_sent' AND date(created_at, 'localtime') = date('now', 'localtime')",
            [event.id]
        );

        if (alreadySent && !_isRetry) {
            console.log(`[WA-Guard] Skipping sendPost for "${event.title || event.id}" because it was already sent today.`);
            return;
        }

        const settings = await db.get('SELECT * FROM settings WHERE id = 1');
        const groupId = settings?.whatsapp_group_id || process.env.WHATSAPP_GROUP_ID;
        const groupId2 = settings?.whatsapp_group_id_2 || '';

        if (!groupId) {
            console.error('WhatsApp Group ID not found in settings or .env');
            return;
        }

        let caption = '';

        if (event.event_type === 'birthday' || event.event_type === 'wedding_anniversary' || event.event_type === 'one_day_event') {
            // Use custom caption, event template, or default template
            if (event.caption && event.caption.trim() !== '') {
                caption = event.caption;
            } else if (event.message_template && event.message_template.trim() !== '') {
                caption = event.message_template;
            } else {
                if (event.event_type === 'birthday') {
                    caption = settings?.birthday_template || '🎉 Happy Birthday {name}!';
                } else if (event.event_type === 'wedding_anniversary') {
                    caption = settings?.anniversary_template || '💍 Happy Wedding Anniversary {name}!';
                } else {
                    caption = settings?.one_day_event_template || 'Congratulations {name}! 🎉✨';
                }
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

        const displayName = event.full_name || event.title || event.event_type;

        // --- WhatsApp Posting ---
        if (event.publish_whatsapp !== 0) {
            try {
                const profileId = event.whatsapp_profile_id;
                const instance = waClient.getInstance(profileId);
                const { logPublishing } = require('../models/database');
                
                if (!instance || instance.status !== 'CONNECTED') {
                    const errorMsg = `Account ${instance ? instance.name : (profileId || 'Default')} is not connected. Skipping WhatsApp post.`;
                    console.error(errorMsg);
                    emitLog({ type: 'error', message: errorMsg, timestamp: new Date().toISOString() });
                    await logActivity(null, 'post_failed', event.id, errorMsg);
                    await logPublishing(event.id, 'whatsapp', 'failed', errorMsg);
                } else {
                    const dbProfile = await db.get('SELECT group_id, group_id_2 FROM whatsapp_profiles WHERE id = ?', [instance.id]);
                    
                    let targetGroupId = groupId;
                    let targetGroupId2 = groupId2;

                    if (dbProfile) {
                        targetGroupId = dbProfile.group_id;
                        targetGroupId2 = dbProfile.group_id_2;
                        if (!targetGroupId && groupId) targetGroupId = groupId; 
                    }

                    console.log(`Sending post for ${displayName} via account [${instance.name}]`);

                    if (targetGroupId) {
                        console.log(`Posting to primary group: ${targetGroupId}`);
                        await instance.sendImageWithCaption(targetGroupId, imagePath, caption);
                    } else {
                        console.warn('No primary group ID found for this post.');
                    }

                    if (targetGroupId2 && event.event_type !== 'monday_market') {
                        try {
                            await instance.sendImageWithCaption(targetGroupId2, imagePath, caption);
                            console.log(`Also sent to secondary group: ${targetGroupId2}`);
                        } catch (err2) {
                            console.error(`Failed to send to secondary group ${targetGroupId2}:`, err2.message);
                        }
                    }

                    const logMsg = `Post sent for ${displayName} (${event.event_type}) via ${instance.name}`;
                    console.log(logMsg);
                    emitLog({ type: 'success', message: logMsg, timestamp: new Date().toISOString() });
                    await logActivity(null, 'post_sent', event.id, logMsg, {
                        event_type: event.event_type,
                        display_name: displayName,
                        whatsapp_account: instance.name,
                        whatsapp_primary: targetGroupId,
                        whatsapp_secondary: groupId2 || null,
                        caption: caption
                    });
                    
                    await logPublishing(event.id, 'whatsapp', 'success', `Sent to primary group: ${targetGroupId}${targetGroupId2 ? ' & secondary group' : ''}`);
                }
            } catch (waErr) {
                console.error('WhatsApp sending failed:', waErr.message);
                const { logPublishing } = require('../models/database');
                await logPublishing(event.id, 'whatsapp', 'failed', waErr.message);
            }
        }

        // --- Facebook Feed Posting ---
        if (event.publish_facebook_feed === 1) {
            try {
                console.log('Facebook Feed posting enabled. Fetching credentials...');
                const pageId = settings?.facebook_page_id;
                const pageToken = settings?.facebook_access_token;
                
                if (!pageId || !pageToken) {
                    throw new Error('Facebook Page ID or Access Token is missing from Settings.');
                }
                
                const axios = require('axios');
                
                // 1. Upload the photo as unpublished to get a photo ID
                console.log('Uploading photo to Facebook (unpublished)...');
                const FormData = require('form-data');
                const form = new FormData();
                form.append('source', require('fs').createReadStream(imagePath));
                form.append('published', 'false');
                
                const photoRes = await axios.post(`https://graph.facebook.com/v20.0/${pageId}/photos`, form, {
                    params: {
                        access_token: pageToken
                    },
                    headers: form.getHeaders()
                });
                
                const photoId = photoRes.data.id;
                if (!photoId) {
                    throw new Error('Failed to retrieve photo ID from unpublished upload.');
                }
                console.log(`Photo uploaded successfully. Photo ID: ${photoId}`);
                
                // 2. Publish to the Page Feed using POST /{page-id}/feed
                console.log('Creating post on page feed with the attached photo...');
                const feedRes = await axios.post(
                    `https://graph.facebook.com/v20.0/${pageId}/feed`,
                    {
                        message: caption,
                        attached_media: [{ media_fbid: photoId }]
                    },
                    {
                        params: {
                            access_token: pageToken
                        }
                    }
                );
                
                console.log(`Facebook Feed post successful! Post ID: ${feedRes.data.id}`);
                const { logPublishing } = require('../models/database');
                await logPublishing(event.id, 'facebook_feed', 'success', JSON.stringify(feedRes.data));
            } catch (fbErr) {
                console.error('Facebook Feed posting failed:', fbErr.response?.data || fbErr.message);
                const { logPublishing } = require('../models/database');
                const errMsg = fbErr.response?.data ? JSON.stringify(fbErr.response.data) : fbErr.message;
                await logPublishing(event.id, 'facebook_feed', 'failed', errMsg);
            }
        }

        // --- Facebook Reel Posting ---
        if (event.publish_facebook_reel === 1) {
            try {
                console.log('Facebook Reel posting enabled. Fetching credentials...');
                const pageId = settings?.facebook_page_id;
                const pageToken = settings?.facebook_access_token;
                
                if (!pageId || !pageToken) {
                    throw new Error('Facebook Page ID or Access Token is missing from Settings.');
                }
                
                let videoPath = '';
                if (!event.generated_reel_path) {
                    console.log('No generated reel path found in database. Dynamically generating video from image path:', imagePath);
                    const { generateReel } = require('./videoGenerator');
                    const generatedReelPath = await generateReel(event.design_image_path);
                    await db.run('UPDATE events SET generated_reel_path = ? WHERE id = ?', [generatedReelPath, event.id]);
                    event.generated_reel_path = generatedReelPath;
                    videoPath = require('path').resolve(process.env.DATA_DIR || '', generatedReelPath);
                } else {
                    videoPath = require('path').resolve(process.env.DATA_DIR || '', event.generated_reel_path);
                }
                
                if (!require('fs').existsSync(videoPath)) {
                    throw new Error(`Generated reel file does not exist at path: ${videoPath}`);
                }
                
                const axios = require('axios');
                
                // 1. Initialize upload session
                console.log('Initializing Facebook Reel upload session...');
                const initRes = await axios.post(`https://graph.facebook.com/v20.0/${pageId}/video_reels`, null, {
                    params: {
                        upload_phase: 'start',
                        access_token: pageToken
                    }
                });
                
                const videoId = initRes.data.video_id;
                const uploadUrl = initRes.data.upload_url;
                if (!videoId || !uploadUrl) {
                    throw new Error('Failed to retrieve video_id or upload_url from Facebook Reel initialization.');
                }
                
                // 2. Upload video binary
                console.log(`Uploading video binary to Facebook Reel upload session: ${videoId}...`);
                const fs = require('fs');
                const fileStream = fs.createReadStream(videoPath);
                const fileSize = fs.statSync(videoPath).size;
                
                await axios.post(uploadUrl, fileStream, {
                    headers: {
                        'Authorization': `OAuth ${pageToken}`,
                        'offset': '0',
                        'file_size': fileSize,
                        'Content-Type': 'application/octet-stream'
                    }
                });
                
                // 3. Finalize and publish
                console.log(`Finalizing and publishing Facebook Reel ${videoId}...`);
                const finishRes = await axios.post(`https://graph.facebook.com/v20.0/${pageId}/video_reels`, null, {
                    params: {
                        upload_phase: 'finish',
                        video_id: videoId,
                        video_state: 'PUBLISHED',
                        description: caption,
                        access_token: pageToken
                    }
                });
                
                console.log(`Facebook Reel post successful! Response:`, finishRes.data);
                const { logPublishing } = require('../models/database');
                await logPublishing(event.id, 'facebook_reel', 'success', JSON.stringify(finishRes.data));
            } catch (fbReelErr) {
                console.error('Facebook Reel posting failed:', fbReelErr.response?.data || fbReelErr.message);
                const { logPublishing } = require('../models/database');
                const errMsg = fbReelErr.response?.data ? JSON.stringify(fbReelErr.response.data) : fbReelErr.message;
                await logPublishing(event.id, 'facebook_reel', 'failed', errMsg);
            }
        }

        // --- Instagram Feed Posting ---
        if (event.publish_instagram_feed === 1) {
            try {
                console.log('Instagram Feed posting enabled. Fetching credentials...');
                const businessId = settings?.instagram_business_id;
                const accessToken = settings?.instagram_access_token;
                const imgbbApiKey = settings?.imgbb_api_key;
                
                if (!businessId || !accessToken || !imgbbApiKey) {
                    throw new Error('Instagram Business Account ID, Access Token, or ImgBB API Key is missing from Settings.');
                }
                
                console.log('Preparing image and uploading to ImgBB...');
                const publicUrl = await instagram.uploadToImgBB(imagePath, imgbbApiKey);
                console.log(`Image uploaded to ImgBB: ${publicUrl}`);
                
                console.log('Posting to Instagram...');
                const igPostId = await instagram.postToInstagram(
                    publicUrl,
                    caption,
                    businessId,
                    accessToken
                );
                
                console.log(`Instagram Feed post successful! Post ID: ${igPostId}`);
                const { logPublishing } = require('../models/database');
                await logPublishing(event.id, 'instagram_feed', 'success', JSON.stringify({ post_id: igPostId, public_url: publicUrl }));
            } catch (igError) {
                console.error('Instagram Feed posting failed:', igError.message);
                const { logPublishing } = require('../models/database');
                await logPublishing(event.id, 'instagram_feed', 'failed', igError.message);
            }
        }

        // --- Instagram Reel Posting ---
        if (event.publish_instagram_reel === 1) {
            try {
                console.log('Instagram Reel posting enabled. Fetching credentials...');
                const businessId = settings?.instagram_business_id;
                const accessToken = settings?.instagram_access_token;
                
                if (!businessId || !accessToken) {
                    throw new Error('Instagram Business Account ID or Access Token is missing from Settings.');
                }
                
                let videoPath = '';
                if (!event.generated_reel_path) {
                    console.log('No generated reel path found in database. Dynamically generating video from image path:', imagePath);
                    const { generateReel } = require('./videoGenerator');
                    const generatedReelPath = await generateReel(event.design_image_path);
                    await db.run('UPDATE events SET generated_reel_path = ? WHERE id = ?', [generatedReelPath, event.id]);
                    event.generated_reel_path = generatedReelPath;
                    videoPath = require('path').resolve(process.env.DATA_DIR || '', generatedReelPath);
                } else {
                    videoPath = require('path').resolve(process.env.DATA_DIR || '', event.generated_reel_path);
                }
                
                if (!require('fs').existsSync(videoPath)) {
                    throw new Error(`Generated reel file does not exist at path: ${videoPath}`);
                }
                
                // 1. Upload video to tmpfiles.org to get a public URL
                console.log('Uploading Reel video to tmpfiles.org for temporary public URL...');
                const FormData = require('form-data');
                const form = new FormData();
                form.append('file', require('fs').createReadStream(videoPath));
                
                const axios = require('axios');
                const uploadRes = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
                    headers: form.getHeaders(),
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                });
                
                if (!uploadRes.data || !uploadRes.data.data || !uploadRes.data.data.url) {
                    throw new Error('Failed to upload video to tmpfiles.org: ' + JSON.stringify(uploadRes.data));
                }
                
                const viewUrl = uploadRes.data.data.url;
                const publicVideoUrl = viewUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
                console.log(`Video uploaded to tmpfiles.org successfully! Direct URL: ${publicVideoUrl}`);
                
                // 2. Create IG media container for Reels
                console.log('Creating Instagram Reel media container...');
                const containerRes = await axios.post(`https://graph.facebook.com/v20.0/${businessId}/media`, null, {
                    params: {
                        media_type: 'REELS',
                        video_url: publicVideoUrl,
                        caption: caption,
                        access_token: accessToken
                    }
                });
                
                const creationId = containerRes.data.id;
                if (!creationId) {
                    throw new Error('Failed to retrieve creation_id from Instagram media container initialization.');
                }
                
                // 3. Poll container status until FINISHED
                console.log(`Instagram Reel container created: ${creationId}. Polling status...`);
                let status = 'IN_PROGRESS';
                let attempts = 0;
                while (status === 'IN_PROGRESS' || status === 'SUBMITTED') {
                    if (attempts > 30) {
                        throw new Error('Timeout waiting for Instagram Reel container to finish processing.');
                    }
                    console.log(`Polling attempt ${attempts + 1}: current status is ${status}. Waiting 5 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    const statusRes = await axios.get(`https://graph.facebook.com/v20.0/${creationId}`, {
                        params: {
                            fields: 'status_code',
                            access_token: accessToken
                        }
                    });
                    status = statusRes.data.status_code;
                    attempts++;
                }
                
                if (status !== 'FINISHED') {
                    throw new Error(`Instagram Reel container processing failed with status: ${status}`);
                }
                console.log('Instagram Reel container is ready for publishing!');
                
                // 4. Publish the container
                console.log('Publishing Instagram Reel container...');
                const publishRes = await axios.post(`https://graph.facebook.com/v20.0/${businessId}/media_publish`, null, {
                    params: {
                        creation_id: creationId,
                        access_token: accessToken
                    }
                });
                
                console.log(`Instagram Reel post successful! Response:`, publishRes.data);
                const { logPublishing } = require('../models/database');
                await logPublishing(event.id, 'instagram_reel', 'success', JSON.stringify(publishRes.data));
            } catch (igReelErr) {
                console.error('Instagram Reel posting failed:', igReelErr.response?.data || igReelErr.message);
                const { logPublishing } = require('../models/database');
                const errMsg = igReelErr.response?.data ? JSON.stringify(igReelErr.response.data) : igReelErr.message;
                await logPublishing(event.id, 'instagram_reel', 'failed', errMsg);
            }
        }

        // Explicitly trigger garbage collection to free up memory (if enabled)
        if (global.gc) {
            console.log('Running explicit GC after post success...');
            global.gc();
        }

        // --- Lifecycle Automation ---
        // 1. Deactivate annual events after posting "till next year"
        if (event.event_type === 'birthday' || 
            event.event_type === 'wedding_anniversary' || 
            (event.event_type === 'one_day_event' && event.repeat_annually === 1) || 
            (event.event_type === 'one_day_event' && (!event.repeat_annually || event.repeat_annually === 0))) {
            
            await db.run("UPDATE events SET status = 'inactive' WHERE id = ?", [event.id]);
        }
        
        // 2. Delete single-post non-repeating announcements immediately after post
        if (event.event_type === 'announcement' && (!event.repeat_interval_days || event.repeat_interval_days == 0)) {
            if (event.design_image_path) {
                try {
                    const fullPath = process.env.DATA_DIR 
                        ? path.resolve(process.env.DATA_DIR, event.design_image_path.replace('uploads/', '')) 
                        : path.resolve(event.design_image_path);
                    if (require('fs').existsSync(fullPath)) require('fs').unlinkSync(fullPath);
                } catch(e) {}
            }
            await db.run("DELETE FROM events WHERE id = ?", [event.id]);
        }

    } catch (error) {
        const displayName = event.full_name || event.title || event.event_type;
        const errMsg = `Failed to send post for ${displayName}: ${error.message}`;
        console.error(errMsg);
        emitLog({ type: 'error', message: errMsg, timestamp: new Date().toISOString() });
        await logActivity(null, 'post_failed', event.id, errMsg, { error: error.message });
    }
}

module.exports = { scheduleDailyPosts, processTodayEvents, processIntervalEvents, sendPost };
