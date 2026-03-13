const { initDb, logActivity } = require('../src/models/database');
const { processIntervalEvents, sendPost } = require('../src/services/scheduler');
const scheduler = require('../src/services/scheduler');

async function verifyExpiryLogic() {
    console.log('--- Verifying Announcement Expiry Logic ---');
    const db = await initDb();

    // Mock sendPost to avoid actual WhatsApp calls
    const originalSendPost = scheduler.sendPost;
    scheduler.sendPost = async (event) => {
        console.log(`[MOCK] Sending post for: ${event.title}`);
    };

    try {
        // 1. Create a test announcement that is expired
        console.log('\nStep 1: Creating an expired announcement...');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const result = await db.run(
            `INSERT INTO events (
                title, event_type, schedule_type, repeat_interval_days, 
                post_time, expiry_date, status, created_at, design_image_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                'Test Expired Announcement', 
                'announcement', 
                'interval', 
                1, 
                '06:00', 
                yesterdayStr, 
                'active', 
                new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
                'uploads/test.jpg'
            ]
        );
        const eventId = result.lastID;
        console.log(`Created event with ID ${eventId}, expiry_date: ${yesterdayStr}`);

        // 2. Trigger processIntervalEvents
        console.log('\nStep 2: Triggering processIntervalEvents...');
        await processIntervalEvents();

        // 3. Verify status is now 'inactive'
        console.log('\nStep 3: Verifying event status...');
        const updatedEvent = await db.get("SELECT status FROM events WHERE id = ?", [eventId]);
        console.log(`Event status is now: ${updatedEvent.status}`);

        if (updatedEvent.status === 'inactive') {
            console.log('✅ SUCCESS: Event was auto-deactivated.');
        } else {
            console.log('❌ FAILURE: Event was NOT auto-deactivated.');
        }

        // 4. Verify activity log
        console.log('\nStep 4: Checking activity log...');
        const log = await db.get("SELECT * FROM activity_logs WHERE event_id = ? AND action = 'event_deactivated'", [eventId]);
        if (log) {
            console.log(`✅ SUCCESS: Activity log found: ${log.description}`);
        } else {
            console.log('❌ FAILURE: Activity log NOT found.');
        }

    } catch (error) {
        console.error('Test failed with error:', error);
    } finally {
        // Cleanup
        // await db.run("DELETE FROM events WHERE title = 'Test Expired Announcement'");
        // Restore sendPost
        scheduler.sendPost = originalSendPost;
        process.exit();
    }
}

verifyExpiryLogic();
