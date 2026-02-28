const cron = require('node-cron');
const { initDb } = require('../models/database');
const waClient = require('./whatsapp');
const path = require('path');
const { format } = require('date-fns');
const { emitLog } = require('./socket');
const { logActivity } = require('../models/database');

async function scheduleDailyPosts() {
    // Run every day at 1:00 AM to prepare the queue for 6:00 AM
    cron.schedule('0 1 * * *', async () => {
        console.log('Running daily post scheduler check...');
        await processTodayEvents();
    });

    console.log('Daily scheduler initialized.');
}

async function processTodayEvents() {
    try {
        const db = await initDb();
        const today = format(new Date(), 'yyyy-MM-dd');

        // Find events for today
        const events = await db.all(
            "SELECT * FROM events WHERE event_date LIKE ? AND status = 'active' ORDER BY created_at ASC",
            [`%${today.substring(5)}`] // Matches MM-DD
        );

        if (events.length === 0) {
            console.log('No events found for today:', today);
            return;
        }

        console.log(`Found ${events.length} events for today. Scheduling posts...`);

        // Schedule each post with a 30-minute delay starting at 6:00 AM
        events.forEach((event, index) => {
            const postHour = 6;
            const postMinute = index * 30;

            // Calculate actual hour and minute
            const actualHour = postHour + Math.floor(postMinute / 60);
            const actualMin = postMinute % 60;

            const cronTime = `${actualMin} ${actualHour} * * *`;

            cron.schedule(cronTime, async () => {
                console.log(`Executing post for ${event.first_name} ${event.second_name} at ${actualHour}:${actualMin}`);
                await sendPost(event);
            }, {
                scheduled: true,
                timezone: "Africa/Lagos" // Assuming Lagos time, update as needed
            });

            console.log(`Scheduled: ${event.first_name} at ${actualHour}:${actualMin}`);
        });

    } catch (error) {
        console.error('Error processing today\'s events:', error);
    }
}

async function sendPost(event) {
    try {
        const db = await initDb();
        const settings = await db.get('SELECT * FROM settings WHERE id = 1');

        const groupId = settings?.whatsapp_group_id || process.env.WHATSAPP_GROUP_ID;

        if (!groupId) {
            console.error('WhatsApp Group ID not found in settings or .env');
            return;
        }

        let template = settings?.birthday_template;
        if (event.event_type === 'Wedding Anniversary') {
            template = settings?.anniversary_template;
        }

        if (event.message_template && event.message_template.trim() !== '') {
            template = event.message_template;
        }

        const caption = (template || `🎉 Happy ${event.event_type} {name}!`)
            .replace(/{name}/g, `${event.first_name} ${event.second_name}`);

        const absolutePath = path.resolve(event.design_image_path);
        await waClient.sendImageWithCaption(groupId, absolutePath, caption);

        const logMsg = `Post sent for ${event.first_name} ${event.second_name}`;
        console.log(logMsg);
        emitLog({ type: 'success', message: logMsg, timestamp: new Date().toISOString() });
        await logActivity('whatsapp_post_sent', logMsg);

    } catch (error) {
        const errMsg = `Failed to send post for ${event.first_name}: ${error.message}`;
        console.error(errMsg);
        emitLog({ type: 'error', message: errMsg, timestamp: new Date().toISOString() });
        await logActivity('whatsapp_post_failed', errMsg);
    }
}

module.exports = { scheduleDailyPosts, processTodayEvents, sendPost };
