const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkSpecificEvents() {
    const dbPath = path.join(process.cwd(), 'src', 'database.sqlite');
    const db = new sqlite3.Database(dbPath);

    db.all("SELECT * FROM events WHERE event_type IN ('monday_market', 'recurrent_announcement')", (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log('Monday Market / Recurrent Announcement events:');
        console.table(rows);
        db.close();
    });
}

checkSpecificEvents();
