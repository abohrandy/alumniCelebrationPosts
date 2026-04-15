/**
 * WhatsApp Service — powered by @whiskeysockets/baileys
 *
 * Pure WebSocket implementation. No Chromium, no Puppeteer, no browser.
 * This eliminates all memory pressure, detached frame errors, and startup hangs.
 *
 * Exported interface is identical to the old whatsapp-web.js version so that
 * api.js and scheduler.js require zero changes.
 */

const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

console.log('--- WHATSAPP SERVICE (Baileys) LOADED at ' + new Date().toLocaleTimeString() + ' ---');

const { emitStatus, emitLog } = require('./socket');

// Baileys is ESM-only; use dynamic import() from CommonJS
let _baileys = null;
async function getBaileys() {
    if (!_baileys) {
        _baileys = await import('@whiskeysockets/baileys');
    }
    return _baileys;
}

const silentLogger = pino({ level: 'silent' });

class WhatsAppClient {
    constructor() {
        this.sock = null;
        this.status = 'DISCONNECTED';
        this.qrText = '';
        this.lastError = null;
        this.initialized = false;
        this._saveCreds = null;

        // Expose a dummy .client property so any code that checks waClient.client
        // gets a truthy value when connected instead of crashing.
        this.client = null;
    }

    async init() {
        if (this.initialized) {
            console.log('WhatsApp Client already initialized, skipping...');
            return;
        }
        this.initialized = true;

        try {
            const {
                default: makeWASocket,
                useMultiFileAuthState,
                fetchLatestBaileysVersion,
                DisconnectReason,
                makeCacheableSignalKeyStore
            } = await getBaileys();

            const baseDir = process.env.DATA_DIR || 'C:\\';
            const authDir = path.join(baseDir, 'wa_auth_baileys');

            // Ensure auth directory exists
            if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

            const { state, saveCreds } = await useMultiFileAuthState(authDir);
            this._saveCreds = saveCreds;

            // Fetch latest supported WA version (falls back gracefully if network fails)
            let version;
            try {
                const result = await fetchLatestBaileysVersion();
                version = result.version;
                console.log(`Baileys WA version: ${version.join('.')}`);
            } catch (e) {
                console.warn('Could not fetch latest WA version, using bundled default:', e.message);
                version = [2, 3000, 1015901307]; // safe fallback
            }

            this.sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, silentLogger)
                },
                logger: silentLogger,
                printQRInTerminal: false,
                browser: ['MUAAFCT Poster', 'Chrome', '120.0.0'],
                syncFullHistory: false,
                generateHighQualityLinkPreview: false
            });

            // Keep .client in sync so legacy code that checks `waClient.client` works
            this.client = this.sock;

            // Save credentials whenever they update
            this.sock.ev.on('creds.update', saveCreds);

            // Handle connection state changes
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    this.status = 'AUTH_REQUIRED';
                    this.qrText = qr;
                    console.log('QR RECEIVED — waiting for scan');
                    emitLog({ type: 'info', message: 'QR Code received, waiting for scan...', timestamp: new Date().toISOString() });
                    qrcode.generate(qr, { small: true });
                    emitStatus(this.getStatus());
                }

                if (connection === 'open') {
                    this.status = 'CONNECTED';
                    this.qrText = '';
                    this.lastError = null;
                    this.client = this.sock;
                    console.log('WhatsApp Client connected!');
                    emitLog({ type: 'success', message: 'WhatsApp Client is ready and connected!', timestamp: new Date().toISOString() });
                    emitStatus(this.getStatus());
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    this.status = 'DISCONNECTED';
                    this.client = null;
                    const reason = lastDisconnect?.error?.message || `Code ${statusCode}`;
                    console.log(`WhatsApp connection closed. Reason: ${reason}. Reconnect: ${shouldReconnect}`);
                    emitLog({
                        type: 'error',
                        message: `WhatsApp disconnected: ${reason}. ${shouldReconnect ? 'Reconnecting in 10s...' : 'Logged out — rescan QR to reconnect.'}`,
                        timestamp: new Date().toISOString()
                    });
                    emitStatus(this.getStatus());

                    if (shouldReconnect) {
                        setTimeout(() => {
                            console.log('Auto-reconnecting WhatsApp...');
                            this.initialized = false;
                            this.init().catch(e => console.error('Auto-reconnect failed:', e.message));
                        }, 10000);
                    } else {
                        // Logged out — need fresh QR
                        this.initialized = false;
                    }
                }
            });

            console.log('WhatsApp Client initializing via Baileys WebSocket...');
        } catch (error) {
            this.initialized = false;
            this.lastError = error.message;
            console.error('Error initializing WhatsApp Baileys client:', error);
            emitLog({ type: 'error', message: 'WhatsApp init failed: ' + error.message, timestamp: new Date().toISOString() });
            emitStatus(this.getStatus());
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
            emitLog({ type: 'info', message: 'WhatsApp reconnecting...', timestamp: new Date().toISOString() });

            this.status = 'DISCONNECTED';
            this.initialized = false;
            this.client = null;

            if (this.sock) {
                try {
                    this.sock.ev.removeAllListeners();
                    await this.sock.logout().catch(() => {});
                    this.sock.end();
                } catch (e) {
                    console.error('Error during sock cleanup:', e.message);
                }
                this.sock = null;
            }

            await this.init();
        } catch (error) {
            console.error('Error during reconnection:', error);
            throw error;
        }
    }

    async sendTextMessage(to, text) {
        try {
            if (this.status !== 'CONNECTED' || !this.sock) {
                throw new Error('WhatsApp is not connected.');
            }
            await this.sock.sendMessage(to, { text });
            console.log(`Text message sent to ${to} successfully.`);
            return true;
        } catch (error) {
            console.error('Error sending WhatsApp text message:', error.message);
            throw error;
        }
    }

    async sendImageWithCaption(groupId, imagePath, caption) {
        const MAX_RETRIES = 2;
        let lastError;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (this.status !== 'CONNECTED' || !this.sock) {
                    throw new Error('WhatsApp is not connected.');
                }
                const imageBuffer = fs.readFileSync(imagePath);
                await this.sock.sendMessage(groupId, {
                    image: imageBuffer,
                    caption: caption
                });
                console.log(`Image+caption sent to ${groupId} successfully.`);
                return true;
            } catch (error) {
                lastError = error;
                console.error(`Error sending WhatsApp image (attempt ${attempt}/${MAX_RETRIES}):`, error.message);
                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    continue;
                }
            }
        }
        throw lastError;
    }

    async disconnect() {
        try {
            console.log('Disconnect/logout requested...');
            emitLog({ type: 'info', message: 'Disconnecting WhatsApp session...', timestamp: new Date().toISOString() });

            if (this.sock) {
                await this.sock.logout().catch(e => console.error('Logout error:', e.message));
                this.sock.end();
                this.sock = null;
            }

            this.status = 'DISCONNECTED';
            this.qrText = '';
            this.initialized = false;
            this.client = null;

            emitLog({ type: 'success', message: 'WhatsApp session disconnected successfully.', timestamp: new Date().toISOString() });
            emitStatus(this.getStatus());
        } catch (error) {
            console.error('Error during disconnect:', error);
            this.status = 'DISCONNECTED';
            this.initialized = false;
            this.client = null;
            this.sock = null;
            emitStatus(this.getStatus());
            throw error;
        }
    }

    async getGroups() {
        try {
            if (this.status !== 'CONNECTED' || !this.sock) {
                throw new Error('WhatsApp is not connected.');
            }
            const groups = await this.sock.groupFetchAllParticipating();
            return Object.entries(groups).map(([id, g]) => ({ id, name: g.subject }));
        } catch (error) {
            console.error('Error getting groups:', error);
            throw error;
        }
    }
}

// Singleton instance
const waClient = new WhatsAppClient();
module.exports = waClient;
