const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkScriptsDb() {
    const dbPath = path.join(process.cwd(), 'scripts', 'database.sqlite');
    console.log('Checking database at: ' + dbPath);
    const db = new sqlite3.Database(dbPath);

    db.all("SELECT * FROM events", (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.table(rows);
        db.close();
    });
}

checkScriptsDb();
