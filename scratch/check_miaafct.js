const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkMiaafct() {
    const dbPath = path.join(process.cwd(), 'miaafct.sqlite');
    console.log('Checking database at: ' + dbPath);
    const db = new sqlite3.Database(dbPath);

    db.all('SELECT name FROM sqlite_master WHERE type="table"', (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.table(rows);
        
        db.all('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 10', (err, logRows) => {
            if (err) {
                console.error('Error fetching logs:', err.message);
            } else {
                console.log('Recent logs:');
                console.table(logRows);
            }
            db.close();
        });
    });
}

checkMiaafct();
