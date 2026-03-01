require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const path = require('path');
const { initDb } = require('./src/models/database');
const apiRoutes = require('./src/routes/api');
const { scheduleDailyPosts } = require('./src/services/scheduler');

const { initSocket } = require('./src/services/socket');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Initialize Socket.io
initSocket(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
}));

// Static files for uploads (Using Railway volume if configured)
const uploadBase = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadBase));

// Serve the admin dashboard frontend (built Vite output)
const dashboardPath = path.join(__dirname, 'admin-dashboard-dist');
const dashboardSrcPath = path.join(__dirname, 'admin-dashboard');
// Use built dist if available, otherwise fall back to source folder
const frontendPath = require('fs').existsSync(dashboardPath) ? dashboardPath : dashboardSrcPath;
app.use(express.static(frontendPath));

// Routes
app.use('/api', apiRoutes);

// Basic health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
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
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();
