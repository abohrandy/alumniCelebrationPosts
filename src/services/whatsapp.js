const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
console.log('--- WHATSAPP SERVICE MODULE LOADED at ' + new Date().toLocaleTimeString() + ' ---');
const { emitStatus, emitLog } = require('./socket');

class WhatsAppClient {
    constructor() {
        const baseDir = process.env.DATA_DIR || 'C:\\';
        const uniquePath = path.join(baseDir, 'wa_session_' + Date.now());
        const authPath = path.join(baseDir, 'wa_auth_persistent');

        const puppeteerOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--remote-allow-origins=*',
                '--no-zygote',
                '--no-first-run',
                '--disable-canvas-aa',
                '--disable-2d-canvas-clip-aa',
                '--disable-gl-drawing-for-tests',
                '--disable-breakpad',
                '--disable-canvas-sketch-api',
                '--disable-domain-reliability',
                '--disable-software-rasterizer',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-client-side-phishing-detection',
                '--disable-default-apps',
                '--disable-hang-monitor',
                '--disable-popup-blocking',
                '--disable-prompt-on-repost',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--safebrowsing-disable-auto-update',
                '--mute-audio',
                '--disable-infobars',
                '--disable-site-isolation-trials',
                // NOTE: --single-process removed — it is experimental and causes Chromium crashes
                '--disable-renderer-backgrounding',
                '--js-flags=--max-old-space-size=256'
            ]
        };

        // Use system Chromium if available (Docker/Railway)
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
            console.log('Using chromium at:', process.env.PUPPETEER_EXECUTABLE_PATH);
        }

        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: authPath
            }),
            puppeteer: {
                ...puppeteerOptions,
                timeout: 120000 // 2-minute launch timeout
            }
            // webVersionCache omitted: using the bundled WhatsApp Web version for reliability.
            // Remote URL fetches frequently fail or hang on Railway causing silent startup failures.
        });

        this.status = 'DISCONNECTED';
        this.qrText = '';
        this.lastError = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) {
            console.log('WhatsApp Client already initialized, skipping...');
            return;
        }
        this.initialized = true;
        this._startupResolved = false;

        const baseDir = process.env.DATA_DIR || 'C:\\';
        const tempPath = path.join(baseDir, 'wa_temp_' + Date.now());
        if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });
        process.env.TEMP = tempPath;
        process.env.TMP = tempPath;

        // Clean stale Chromium lock files from previous crashed instances
        const authPath = path.join(baseDir, 'wa_auth_persistent');
        this._cleanLockFiles(authPath);

        console.log('WhatsApp Client initializing with TEMP:', process.env.TEMP);

        this.client.on('qr', (qr) => {
            this._startupResolved = true;
            this.status = 'AUTH_REQUIRED';
            this.qrText = qr;
            console.log('QR RECEIVED', qr);
            emitLog({ type: 'info', message: 'QR Code received, waiting for scan...', timestamp: new Date().toISOString() });
            qrcode.generate(qr, { small: true });
            emitStatus(this.getStatus());
        });

        this.client.on('ready', async () => {
            this._startupResolved = true;
            this.status = 'CONNECTED';
            this.qrText = '';
            console.log('Client is ready!');
            emitLog({ type: 'success', message: 'WhatsApp Client is ready and connected!', timestamp: new Date().toISOString() });
            emitStatus(this.getStatus());
        });

        this.client.on('authenticated', () => {
            this._startupResolved = true;
            console.log('AUTHENTICATED');
            emitLog({ type: 'info', message: 'WhatsApp session authenticated.', timestamp: new Date().toISOString() });
        });

        this.client.on('auth_failure', (msg) => {
            this._startupResolved = true;
            this.status = 'DISCONNECTED';
            this.lastError = 'Auth failure: ' + msg;
            console.error('AUTHENTICATION FAILURE', msg);
            emitLog({ type: 'error', message: 'Authentication failure: ' + msg, timestamp: new Date().toISOString() });
            emitStatus(this.getStatus());
        });

        this.client.on('disconnected', (reason) => {
            this.status = 'DISCONNECTED';
            console.log('Client was logged out', reason);
            emitLog({ type: 'error', message: 'WhatsApp Client disconnected/logged out.', timestamp: new Date().toISOString() });
            emitStatus(this.getStatus());
            // Schedule a reconnect with a short delay to avoid rapid loops
            setTimeout(() => this.reconnect().catch(e => console.error('Auto-reconnect failed:', e.message)), 5000);
        });

        // ── Startup Watchdog ──
        // If Chromium crashes silently during startup, neither 'qr' nor 'ready' will fire.
        // After 3 minutes, if we never resolved, force a full reconnect.
        const STARTUP_TIMEOUT_MS = 3 * 60 * 1000;
        setTimeout(async () => {
            if (!this._startupResolved) {
                console.error('=== STARTUP WATCHDOG: Chromium did not become ready within 3 minutes. Forcing reconnect. ===');
                emitLog({ type: 'error', message: 'Chromium startup timed out. Attempting automatic recovery...', timestamp: new Date().toISOString() });
                try {
                    this.initialized = false;
                    await this.reconnect();
                } catch (e) {
                    console.error('Watchdog reconnect failed:', e.message);
                }
            }
        }, STARTUP_TIMEOUT_MS);

        // Trigger GC once ready to clean up initialization overhead
        if (global.gc) {
            setTimeout(() => {
                console.log('Running GC after WhatsApp initialization...');
                global.gc();
            }, 5000);
        }

        // initialize() resolves once Chromium launches (not when WhatsApp is ready).
        // We catch errors here so a Chromium launch failure doesn't crash the whole server.
        const initResult = this.client.initialize().catch(err => {
            console.error('WhatsApp client initialize() failed:', err.message);
            emitLog({ type: 'error', message: `WhatsApp init failed: ${err.message}`, timestamp: new Date().toISOString() });
            this.initialized = false;
            // Retry after 30s delay
            setTimeout(() => {
                console.log('Retrying WhatsApp initialization after failure...');
                this.reconnect().catch(e => console.error('Retry reconnect failed:', e.message));
            }, 30000);
        });

        // ── Request Interception: block heavy resources to reduce RAM ──
        setTimeout(async () => {
            try {
                if (this.client.pupPage) {
                    const page = this.client.pupPage;
                    await page.setRequestInterception(true);
                    page.on('request', (req) => {
                        const resourceType = req.resourceType();
                        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                            req.abort();
                        } else {
                            req.continue();
                        }
                    });
                    console.log('--- Resource Interception Enabled (Blocking CSS/Images/Fonts) ---');
                }
            } catch (err) {
                console.error('Failed to set request interception:', err.message);
            }
        }, 8000);

        return initResult;
    }

    _cleanLockFiles(dir) {
        try {
            if (!fs.existsSync(dir)) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    this._cleanLockFiles(fullPath);
                } else if (entry.name === 'SingletonLock' || entry.name === 'SingletonCookie' || entry.name === 'SingletonSocket') {
                    fs.unlinkSync(fullPath);
                    console.log('Removed stale lock file:', fullPath);
                }
            }
        } catch (err) {
            console.error('Error cleaning lock files:', err.message);
        }
    }

    getStatus() {
        return {
            status: this.status,
            qrText: this.qrText,
            lastError: this.lastError
        };
    }

    async reconnect() {
        try {
            console.log('Reconnection requested...');
            this.status = 'DISCONNECTED';
            this.initialized = false;
            if (this.client) {
                try {
                    await this.client.destroy();
                } catch (e) {
                    console.error('Error destroying client:', e.message);
                }
            }
            // Re-importing Client just in case, though it's at top level
            const baseDir = process.env.DATA_DIR || 'C:\\';
            const authPath = path.join(baseDir, 'wa_auth_persistent');

            const reconnectPuppeteerOptions = {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-extensions',
                    '--remote-allow-origins=*',
                    '--no-zygote',
                    '--no-first-run',
                    '--disable-canvas-aa',
                    '--disable-2d-canvas-clip-aa',
                    '--disable-gl-drawing-for-tests',
                    '--disable-breakpad',
                    '--disable-canvas-sketch-api',
                    '--disable-domain-reliability',
                    '--disable-software-rasterizer',
                    '--disable-background-networking',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-client-side-phishing-detection',
                    '--disable-default-apps',
                    '--disable-hang-monitor',
                    '--disable-popup-blocking',
                    '--disable-prompt-on-repost',
                    '--disable-sync',
                    '--disable-translate',
                    '--metrics-recording-only',
                    '--safebrowsing-disable-auto-update',
                    '--mute-audio',
                    '--disable-infobars',
                    '--disable-site-isolation-trials',
                    // NOTE: --single-process removed — causes Chromium crashes
                    '--disable-renderer-backgrounding',
                    '--js-flags=--max-old-space-size=256'
                ]
            };
            if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                reconnectPuppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
            }

            this.client = new Client({
                authStrategy: new LocalAuth({
                    dataPath: authPath
                }),
                puppeteer: {
                    ...reconnectPuppeteerOptions,
                    timeout: 120000
                }
                // No webVersionCache remote — use bundled version for reliability
            });
            return this.init();
        } catch (error) {
            console.error('Error during reconnection:', error);
            throw error;
        }
    }

    /**
     * Checks if the underlying Puppeteer page is still alive.
     * If the frame is detached, attempts to recover by refreshing the page.
     * Returns true if recovery was successful or page was already alive.
     */
    async _ensurePageAlive() {
        try {
            const page = this.client.pupPage;
            if (!page || page.isClosed()) {
                console.warn('Puppeteer page is closed or missing. Cannot recover inline.');
                return false;
            }
            // Quick health check: try to evaluate something trivial on the page
            await page.evaluate(() => document.title);
            return true;
        } catch (err) {
            console.warn('Page health check failed:', err.message);
            try {
                console.log('Attempting page recovery by reloading WhatsApp Web...');
                const page = this.client.pupPage;
                if (page && !page.isClosed()) {
                    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
                    // Wait a moment for WhatsApp Web JS to re-initialize inside the page
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    console.log('Page reloaded successfully. Re-checking health...');
                    await page.evaluate(() => document.title);
                    return true;
                }
            } catch (recoveryErr) {
                console.error('Page recovery failed:', recoveryErr.message);
            }
            return false;
        }
    }

    /**
     * Detects if an error is a detached frame error that is potentially recoverable.
     */
    _isDetachedFrameError(error) {
        const msg = (error.message || '').toLowerCase();
        return msg.includes('detached frame') ||
               msg.includes('execution context was destroyed') ||
               msg.includes('target closed') ||
               msg.includes('session closed') ||
               msg.includes('protocol error');
    }

    async sendTextMessage(to, text) {
        const MAX_RETRIES = 2;
        let lastError;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (this.status !== 'CONNECTED') {
                    throw new Error('WhatsApp is not connected.');
                }
                await this.client.sendMessage(to, text);
                console.log(`Text message sent to ${to} successfully.`);
                return true;
            } catch (error) {
                lastError = error;
                console.error(`Error sending WhatsApp text message (attempt ${attempt}/${MAX_RETRIES}):`, error.message);

                if (this._isDetachedFrameError(error) && attempt < MAX_RETRIES) {
                    console.log('Detected detached frame error. Attempting page recovery before retry...');
                    const recovered = await this._ensurePageAlive();
                    if (recovered) {
                        console.log('Page recovery succeeded. Retrying send...');
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        continue;
                    } else {
                        console.error('Page recovery failed. Will not retry.');
                        break;
                    }
                }
                // Non-recoverable error or final attempt
                break;
            }
        }
        throw lastError;
    }

    async sendImageWithCaption(groupId, imagePath, caption) {
        const MAX_RETRIES = 2;
        let lastError;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (this.status !== 'CONNECTED') {
                    throw new Error('WhatsApp is not connected.');
                }

                const media = MessageMedia.fromFilePath(imagePath);
                await this.client.sendMessage(groupId, media, { caption: caption });
                console.log(`Message sent to ${groupId} successfully.`);
                return true;
            } catch (error) {
                lastError = error;
                console.error(`Error sending WhatsApp message (attempt ${attempt}/${MAX_RETRIES}):`, error.message);

                if (this._isDetachedFrameError(error) && attempt < MAX_RETRIES) {
                    console.log('Detected detached frame error. Attempting page recovery before retry...');
                    const recovered = await this._ensurePageAlive();
                    if (recovered) {
                        console.log('Page recovery succeeded. Retrying send...');
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        continue;
                    } else {
                        console.error('Page recovery failed. Will not retry.');
                        break;
                    }
                }
                // Non-recoverable error or final attempt
                break;
            }
        }
        throw lastError;
    }

    async disconnect() {
        try {
            console.log('Disconnect/logout requested...');
            emitLog({ type: 'info', message: 'Disconnecting WhatsApp session...', timestamp: new Date().toISOString() });
            if (this.client) {
                await this.client.logout();
            }
            this.status = 'DISCONNECTED';
            this.qrText = '';
            this.initialized = false;
            emitLog({ type: 'success', message: 'WhatsApp session disconnected successfully.', timestamp: new Date().toISOString() });
            emitStatus(this.getStatus());
        } catch (error) {
            console.error('Error during disconnect:', error);
            this.status = 'DISCONNECTED';
            this.initialized = false;
            emitStatus(this.getStatus());
            throw error;
        }
    }

    async getGroups() {
        try {
            if (this.status !== 'CONNECTED') {
                throw new Error('WhatsApp is not connected.');
            }
            const chats = await this.client.getChats();
            return chats
                .filter(c => c.isGroup)
                .map(c => ({ id: c.id._serialized, name: c.name }));
        } catch (error) {
            console.error('Error getting groups:', error);
            throw error;
        }
    }
}

// Singleton instance
const waClient = new WhatsAppClient();
module.exports = waClient;
