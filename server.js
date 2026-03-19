require('dotenv').config();
process.env.TZ = 'Africa/Lagos';
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const fileUpload = require('express-fileupload');
const path = require('path');
const { initDb } = require('./src/models/database');
const apiRoutes = require('./src/routes/api');
const { scheduleDailyPosts } = require('./src/services/scheduler');
const { setupAuth } = require('./src/controllers/authController');
const { initSocket } = require('./src/services/socket');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Initialize Socket.io
initSocket(server);

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
}));

// Session middleware
const SQLiteStore = require('connect-sqlite3')(session);
const dbDir = process.env.DATA_DIR || path.join(__dirname, 'src');

app.use(session({
    store: new SQLiteStore({
        db: 'sessions.sqlite',
        dir: dbDir
    }),
    secret: process.env.SESSION_SECRET || 'alumni-poster-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production' && process.env.RAILWAY_ENVIRONMENT ? true : false,
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    },
    proxy: true
}));

// Passport auth setup
setupAuth(app);

// Static files for uploads (Using Railway volume if configured)
const uploadBase = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadBase));

// Serve the admin dashboard frontend (built Vite output)
const dashboardPath = path.join(__dirname, 'admin-dashboard-dist');
const dashboardSrcPath = path.join(__dirname, 'admin-dashboard');
const fs = require('fs');
const frontendPath = fs.existsSync(dashboardPath) ? dashboardPath : dashboardSrcPath;
app.use(express.static(frontendPath));

// Routes
app.use('/api', apiRoutes);

// Basic health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// SPA fallback — serve index.html for all non-API routes
app.get('/{*splat}', (req, res) => {
    const indexPath = path.join(frontendPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

// Initialize DB and start server
async function start() {
    try {
        await initDb();
        const waClient = require('./src/services/whatsapp');
        await waClient.init();
        await scheduleDailyPosts();

        server.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });

        // Periodic maintenance (Garbage Collection)
        if (global.gc) {
            setInterval(() => {
                console.log('Running scheduled global GC...');
                global.gc();
            }, 10 * 60 * 1000); // Every 10 minutes
        }
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();
