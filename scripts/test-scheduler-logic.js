const { initDb } = require('../src/models/database');
const { processTodayEvents } = require('../src/services/scheduler');
const { format } = require('date-fns');

async function runTest() {
    process.env.TZ = 'Africa/Lagos';
    const db = await initDb();
    const today = format(new Date(), 'MM-dd');

    console.log('--- Test 1: Identify today events ---');
    const events = await db.all(
        "SELECT * FROM events WHERE event_type IN ('birthday', 'wedding_anniversary') AND event_date LIKE ?",
        [`%${today}`]
    );
    console.log(`Found ${events.length} events for today.`);

    console.log('\n--- Test 2: Run processTodayEvents (Deduplication Check) ---');
    // Note: This will actually try to send posts if it's past 6 AM and they haven't been sent.
    // To be safe, we'd normally mock sendPost, but here we can just observe the logs.
    await processTodayEvents();

    console.log('\n--- Test 3: Check activity logs for today ---');
    const logs = await db.all(
        "SELECT * FROM activity_logs WHERE action = 'post_sent' AND date(created_at) = date('now', 'localtime')"
    );
    console.log(`Posts recorded in logs for today: ${logs.length}`);

    console.log('\nTest completed.');
}

runTest().catch(console.error);
