const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

const { emitStatus, emitLog } = require('./socket');

// Baileys dynamic import
let _baileys = null;
async function getBaileys() {
    if (!_baileys) {
        _baileys = await import('@whiskeysockets/baileys');
    }
    return _baileys;
}

const silentLogger = pino({ level: 'silent' });

class WhatsAppClient {
    constructor(profile) {
        this.id = profile.id;
        this.name = profile.name;
        this.authDirName = profile.auth_dir || `profile_${profile.id}`;
        this.isDefault = !!profile.is_default;
        
        this.sock = null;
        this.status = 'DISCONNECTED';
        this.qrText = '';
        this.lastError = null;
        this.initialized = false;
        
        // Expose .client for legacy compatibility
        this.client = null;
    }

    async init() {
        if (this.initialized) return;
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
            const authPath = path.join(baseDir, this.authDirName);

            if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

            const { state, saveCreds } = await useMultiFileAuthState(authPath);

            let version;
            try {
                const result = await fetchLatestBaileysVersion();
                version = result.version;
            } catch (e) {
                version = [2, 3000, 1015901307];
            }

            this.sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, silentLogger)
                },
                logger: silentLogger,
                printQRInTerminal: false,
                browser: [`MUAAFCT-${this.name}`, 'Chrome', '120.0.0'],
                syncFullHistory: false,
                generateHighQualityLinkPreview: false
            });

            this.client = this.sock;
            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    this.status = 'AUTH_REQUIRED';
                    this.qrText = qr;
                    console.log(`[WA-${this.id}] QR RECEIVED`);
                    emitStatus(this.getStatus());
                }

                if (connection === 'open') {
                    this.status = 'CONNECTED';
                    this.qrText = '';
                    this.lastError = null;
                    console.log(`[WA-${this.id}] Connected: ${this.name}`);
                    emitLog({ type: 'success', message: `${this.name} is connected.`, timestamp: new Date().toISOString() });
                    emitStatus(this.getStatus());
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    this.status = 'DISCONNECTED';
                    this.client = null;
                    
                    if (shouldReconnect) {
                        setTimeout(() => {
                            this.initialized = false;
                            this.init().catch(() => {});
                        }, 10000);
                    } else {
                        this.initialized = false;
                    }
                    emitStatus(this.getStatus());
                }
            });

        } catch (error) {
            this.initialized = false;
            this.lastError = error.message;
            emitStatus(this.getStatus());
        }
    }

    getStatus() {
        return {
            id: this.id,
            name: this.name,
            status: this.status,
            qrText: this.qrText,
            lastError: this.lastError
        };
    }

    async sendTextMessage(to, text) {
        if (this.status !== 'CONNECTED' || !this.sock) throw new Error(`Account ${this.name} is not connected.`);
        await this.sock.sendMessage(to, { text });
        return true;
    }

    async sendImageWithCaption(groupId, imagePath, caption) {
        if (this.status !== 'CONNECTED' || !this.sock) throw new Error(`Account ${this.name} is not connected.`);
        const imageBuffer = fs.readFileSync(imagePath);
        await this.sock.sendMessage(groupId, { image: imageBuffer, caption });
        return true;
    }

    async getGroups() {
        if (this.status !== 'CONNECTED' || !this.sock) return [];
        const groups = await this.sock.groupFetchAllParticipating();
        return Object.entries(groups).map(([id, g]) => ({ id, name: g.subject }));
    }

    async disconnect() {
        if (this.sock) {
            await this.sock.logout().catch(() => {});
            this.sock.end();
            this.sock = null;
        }
        this.status = 'DISCONNECTED';
        this.initialized = false;
        emitStatus(this.getStatus());
    }

    setDefault(isDefault) {
        this.isDefault = isDefault;
    }
}

class WAAccountManager {
    constructor() {
        this.instances = new Map();
        this.isInitialized = false;
    }

    async initAll() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        const { getDb } = require('../models/database');
        const db = await getDb();
        const profiles = await db.all('SELECT * FROM whatsapp_profiles');

        console.log(`Starting ${profiles.length} WhatsApp profiles...`);
        for (const profile of profiles) {
            const client = new WhatsAppClient(profile);
            this.instances.set(profile.id, client);
            client.init().catch(err => console.error(`Failed to init profile ${profile.id}:`, err));
        }
    }

    getInstance(id) {
        // If ID is string or missing, handle gracefully
        const numericId = parseInt(id);
        if (isNaN(numericId)) {
            // Priority 1: The instance marked as default
            const instances = Array.from(this.instances.values());
            const defaultInstance = instances.find(i => i.isDefault);
            if (defaultInstance) return defaultInstance;
            
            // Priority 2: Fallback to first available
            return instances[0];
        }
        return this.instances.get(numericId);
    }

    async addInstance(profile) {
        const client = new WhatsAppClient(profile);
        this.instances.set(profile.id, client);
        await client.init();
        return client;
    }

    async removeInstance(id) {
        const client = this.instances.get(parseInt(id));
        if (client) {
            await client.disconnect();
            this.instances.delete(parseInt(id));
        }
    }

    getAllStatus() {
        return Array.from(this.instances.values()).map(i => i.getStatus());
    }

    setDefault(id) {
        const numericId = parseInt(id);
        this.instances.forEach((client, instanceId) => {
            client.setDefault(instanceId === numericId);
        });
    }

    // Proxy methods for legacy support (uses default instance)
    async sendTextMessage(to, text, profileId = null) {
        const client = this.getInstance(profileId);
        if (!client) throw new Error('No WhatsApp account available.');
        return client.sendTextMessage(to, text);
    }

    async sendImageWithCaption(groupId, imagePath, caption, profileId = null) {
        const client = this.getInstance(profileId);
        if (!client) throw new Error('No WhatsApp account available.');
        return client.sendImageWithCaption(groupId, imagePath, caption);
    }

    async getGroups(profileId = null) {
        const client = this.getInstance(profileId);
        if (!client) return [];
        return client.getGroups();
    }
    
    // Legacy alias for top-level waClient
    get status() {
        const primary = this.getInstance();
        return primary ? primary.status : 'DISCONNECTED';
    }
}

const waManager = new WAAccountManager();
module.exports = waManager;

