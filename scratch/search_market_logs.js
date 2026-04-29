const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function searchLogs() {
    const dbPath = path.join(process.cwd(), 'src', 'database.sqlite');
    const db = new sqlite3.Database(dbPath);

    console.log('Searching for "market" in activity_logs...');
    db.all("SELECT * FROM activity_logs WHERE description LIKE '%market%' OR details LIKE '%market%'", (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.table(rows);
        db.close();
    });
}

searchLogs();
