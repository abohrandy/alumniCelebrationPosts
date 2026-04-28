const { initDb } = require('../src/models/database');

async function fixEvents() {
    try {
        const db = await initDb();
        
        console.log('Searching for recurrent announcements with 7-day intervals...');
        
        const events = await db.all(
            `SELECT * FROM events 
             WHERE event_type IN ('monday_market', 'recurrent_announcement') 
             AND schedule_type = 'interval' 
             AND repeat_interval_days = 7`
        );
        
        if (events.length === 0) {
            console.log('No misconfigured events found.');
            return;
        }
        
        console.log(`Found ${events.length} events to fix.`);
        
        for (const event of events) {
            console.log(`Updating Event ID ${event.id} (${event.title || event.full_name}) to weekly schedule...`);
            await db.run(
                "UPDATE events SET schedule_type = 'weekly', repeat_interval_days = NULL WHERE id = ?",
                [event.id]
            );
        }
        
        console.log('Fix completed successfully.');
    } catch (error) {
        console.error('Error fixing events:', error);
    }
}

fixEvents();
