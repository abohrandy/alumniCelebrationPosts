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
                // Additional explicit optimization flags to reduce RAM usage and cost on Railway
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
                '--disable-site-isolation-trials', // Major memory saver for headless Chromium
                '--single-process', // Experimental: Forces everything into one process to save RAM
                '--disable-renderer-backgrounding',
                '--js-flags="--max-old-space-size=192"'
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
            puppeteer: puppeteerOptions,
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
            }
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
            this.status = 'AUTH_REQUIRED';
            this.qrText = qr;
            console.log('QR RECEIVED', qr);
            emitLog({ type: 'info', message: 'QR Code received, waiting for scan...', timestamp: new Date().toISOString() });
            qrcode.generate(qr, { small: true });
            emitStatus(this.getStatus());
        });

        this.client.on('ready', async () => {
            this.status = 'CONNECTED';
            this.qrText = '';
            console.log('Client is ready!');
            emitLog({ type: 'success', message: 'WhatsApp Client is ready and connected!', timestamp: new Date().toISOString() });
            emitStatus(this.getStatus());
        });

        this.client.on('authenticated', () => {
            console.log('AUTHENTICATED');
            emitLog({ type: 'info', message: 'WhatsApp session authenticated.', timestamp: new Date().toISOString() });
        });

        this.client.on('auth_failure', (msg) => {
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
            this.client.initialize(); // Try to reconnect
        });

        // Trigger GC once ready to clean up initialization overhead
        if (global.gc) {
            setTimeout(() => {
                console.log('Running GC after WhatsApp initialization...');
                global.gc();
            }, 5000);
        }

        const initResult = this.client.initialize();

        // ── Aggressive Memory Strategy: Request Interception ──
        // Once the browser is launched, we intercept and block weight resources (images, css, etc)
        // Note: pupPage is usually available shortly after initialize()
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
                    console.log('--- Aggressive Resource Interception Enabled (Blocking CSS/Images/Fonts) ---');
                }
            } catch (err) {
                console.error('Failed to set request interception:', err.message);
            }
        }, 5000);

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
                    // Additional explicit optimization flags to reduce RAM usage and cost on Railway
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
                    '--disable-site-isolation-trials', // Major memory saver for headless Chromium
                    '--single-process',
                    '--disable-renderer-backgrounding',
                    '--js-flags="--max-old-space-size=192"'
                ]
            };
            if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                reconnectPuppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
            }

            this.client = new Client({
                authStrategy: new LocalAuth({
                    dataPath: authPath
                }),
                puppeteer: reconnectPuppeteerOptions,
                webVersionCache: {
                    type: 'remote',
                    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
                }
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
