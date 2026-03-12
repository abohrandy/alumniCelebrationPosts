const { initDb, logActivity } = require('../src/models/database');
const scheduler = require('../src/services/scheduler');
const { format, subMinutes } = require('date-fns');
const path = require('path');
const fs = require('fs');

async function verifyGap() {
    console.log('--- Verification: 10-Minute Gap Enforcement ---');
    
    // 1. Setup a clean test database in the current directory
    const testDir = __dirname;
    const dbPath = path.join(testDir, 'database.sqlite');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    
    // Set environment variable to use this directory for the database
    process.env.DATA_DIR = testDir;
    
    const db = await initDb();
    
    // Mock the exports.sendPost specifically
    const originalSendPost = scheduler.sendPost;
    let postCount = 0;
    
    scheduler.sendPost = async (event) => {
        postCount++;
        console.log(`[MOCK] Sending post for ${event.full_name}`);
        // Log the activity as sendPost would
        await logActivity(null, 'post_sent', event.id, `Post sent for ${event.full_name}`);
    };

    try {
        const now = new Date();
        const todayMMDD = format(now, 'MM-dd');
        
        // 2. Insert two events due NOW
        console.log('Inserting two test events...');
        await db.run(
            `INSERT INTO events (full_name, event_type, event_date, status, schedule_type) 
             VALUES (?, ?, ?, 'active', 'single_date'), (?, ?, ?, 'active', 'single_date')`,
            ['Test Person 1', 'birthday', `1990-${todayMMDD}`, 'Test Person 2', 'birthday', `1990-${todayMMDD}`]
        );

        console.log('\nRun 1: Both events are due. Only one should be sent.');
        await scheduler.processTodayEvents();
        
        if (postCount === 1) {
            console.log('✅ Result: Only one post was sent.');
        } else {
            console.error(`❌ Failure: ${postCount} posts were sent. Expected 1.`);
        }

        console.log('\nRun 2: Running immediately after. Zero new posts should be sent.');
        await scheduler.processTodayEvents();
        if (postCount === 1) {
            console.log('✅ Result: No second post sent yet (Gap enforced).');
        } else {
            console.error(`❌ Failure: Post count increased to ${postCount}. Gap NOT enforced.`);
        }

        console.log('\nStep 3: Manually backdating the last log by 15 minutes...');
        const lastLog = await db.get("SELECT id FROM activity_logs WHERE action = 'post_sent' ORDER BY created_at DESC LIMIT 1");
        if (!lastLog) throw new Error("Could not find the log for the first post");
        
        // Use SQLite's own datetime function to backdate to ensure compatibility with its comparison
        await db.run("UPDATE activity_logs SET created_at = datetime('now', '-15 minutes') WHERE id = ?", [lastLog.id]);

        console.log('Run 3: Running after gap. Second post should now be sent.');
        await scheduler.processTodayEvents();
        if (postCount === 2) {
            console.log('✅ Result: Second post sent after gap.');
        } else {
            console.error(`❌ Failure: Second post not sent. Count: ${postCount}`);
        }

    } catch (err) {
        console.error('Test Error:', err);
    } finally {
        // Restoring original function and cleaning up
        scheduler.sendPost = originalSendPost;
        await db.close();
        if (fs.existsSync(dbPath)) {
            // Give it a moment to release the file handle
            try { fs.unlinkSync(dbPath); } catch(e) {}
        }
        console.log('\nVerification completed.');
    }
}

verifyGap().catch(console.error);
