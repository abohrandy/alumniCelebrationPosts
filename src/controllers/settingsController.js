const { initDb, logActivity } = require('../models/database');

exports.getSettings = async (req, res) => {
    try {
        const db = await initDb();
        const row = await db.get('SELECT * FROM settings WHERE id = 1');
        res.json(row || {});
    } catch (err) {
        console.error('Error getting settings:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateSettings = async (req, res) => {
    const {
        whatsapp_group_id,
        whatsapp_group_id_2,
        birthday_template,
        anniversary_template,
        one_day_event_template,
        instagram_business_id,
        instagram_access_token,
        facebook_page_id,
        facebook_page_name,
        facebook_access_token,
        facebook_app_id,
        facebook_app_secret,
        imgbb_api_key,
        instagram_enabled
    } = req.body;

    try {
        const db = await initDb();
        const query = `
            UPDATE settings 
            SET whatsapp_group_id = ?, 
                whatsapp_group_id_2 = ?,
                birthday_template = ?, 
                anniversary_template = ?,
                one_day_event_template = ?,
                instagram_business_id = ?,
                instagram_access_token = ?,
                facebook_page_id = ?,
                facebook_page_name = ?,
                facebook_access_token = ?,
                facebook_app_id = ?,
                facebook_app_secret = ?,
                imgbb_api_key = ?,
                instagram_enabled = ?
            WHERE id = 1
        `;

        await db.run(query, [
            whatsapp_group_id,
            whatsapp_group_id_2 || '',
            birthday_template,
            anniversary_template,
            one_day_event_template,
            instagram_business_id || '',
            instagram_access_token || '',
            facebook_page_id || '',
            facebook_page_name || '',
            facebook_access_token || '',
            facebook_app_id || '',
            facebook_app_secret || '',
            imgbb_api_key || '',
            instagram_enabled ? 1 : 0
        ]);
        await logActivity(req.user ? req.user.id : null, 'settings_updated', null, 'Application settings were modified.', {
            whatsapp_group_id,
            whatsapp_group_id_2,
            instagram_business_id,
            facebook_page_id,
            facebook_page_name,
            facebook_app_id,
            instagram_enabled
        });
        res.json({ message: 'Settings updated successfully' });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.exchangeFacebookToken = async (req, res) => {
    const { userAccessToken } = req.body;
    if (!userAccessToken) {
        return res.status(400).json({ error: 'User access token is required' });
    }

    try {
        const db = await initDb();
        const settings = await db.get('SELECT * FROM settings WHERE id = 1');
        const appId = settings?.facebook_app_id || '461695913915110';
        const appSecret = settings?.facebook_app_secret;

        if (!appSecret) {
            return res.status(400).json({ error: 'Facebook App Secret is not configured in Settings.' });
        }

        const axios = require('axios');
        
        // 1. Exchange short-lived token for long-lived User Access Token
        console.log('Exchanging short-lived user token for long-lived...');
        const tokenRes = await axios.get('https://graph.facebook.com/v20.0/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: appId,
                client_secret: appSecret,
                fb_exchange_token: userAccessToken
            }
        });

        const longLivedUserToken = tokenRes.data.access_token;
        if (!longLivedUserToken) {
            throw new Error('Failed to obtain long-lived User Access Token.');
        }

        // 2. Fetch Pages & connected Instagram Business accounts
        console.log('Fetching Facebook Pages and linked Instagram accounts...');
        const accountsRes = await axios.get('https://graph.facebook.com/v20.0/me/accounts', {
            params: {
                fields: 'id,name,access_token,instagram_business_account{id,name,username}',
                access_token: longLivedUserToken
            }
        });

        // 3. Return the pages list
        const pages = accountsRes.data.data.map(page => ({
            id: page.id,
            name: page.name,
            access_token: page.access_token,
            instagram: page.instagram_business_account ? {
                id: page.instagram_business_account.id,
                name: page.instagram_business_account.name || page.instagram_business_account.username
            } : null
        }));

        res.json({ pages });
    } catch (err) {
        console.error('Error exchanging Facebook token:', err.response?.data || err.message);
        const errMsg = err.response?.data?.error?.message || err.message;
        res.status(500).json({ error: errMsg });
    }
};
