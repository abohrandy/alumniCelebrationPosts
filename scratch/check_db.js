const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkLogs() {
    const dbPath = path.join(process.cwd(), 'src', 'database.sqlite');
    console.log('Checking database at: ' + dbPath);
    const db = new sqlite3.Database(dbPath);

    const query = 'SELECT * FROM activity_logs WHERE created_at >= "2026-04-26" ORDER BY created_at DESC LIMIT 50';
    
    db.all(query, (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.table(rows);
        
        console.log('\nChecking events of type monday_market or recurrent_announcement...');
        const eventQuery = 'SELECT id, title, event_type, status, schedule_type FROM events WHERE event_type IN ("monday_market", "recurrent_announcement")';
        db.all(eventQuery, (err, eventRows) => {
            if (err) {
                console.error(err);
                return;
            }
            console.table(eventRows);
            db.close();
        });
    });
}

checkLogs();
