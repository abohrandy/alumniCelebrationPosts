const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkSettings() {
    const dbPath = path.join(process.cwd(), 'src', 'database.sqlite');
    const db = new sqlite3.Database(dbPath);

    db.all('SELECT * FROM settings', (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.table(rows);
        db.close();
    });
}

checkSettings();
