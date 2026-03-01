const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { initDb } = require('../models/database');

function setupAuth(app) {
    // Only set up Google OAuth if credentials are provided
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientID || !clientSecret) {
        console.warn('Google OAuth not configured – GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing.');
        console.warn('Auth endpoints will be disabled. Set env vars to enable authentication.');
        return;
    }

    const callbackURL = process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback';

    passport.use(new GoogleStrategy({
        clientID,
        clientSecret,
        callbackURL
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const db = await initDb();
            const email = profile.emails[0].value;
            const name = profile.displayName;
            const avatarUrl = profile.photos?.[0]?.value || null;

            // Check if user exists
            let user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

            if (!user) {
                // Determine role: admin if matches ADMIN_EMAIL, otherwise media
                const role = (process.env.ADMIN_EMAIL && email === process.env.ADMIN_EMAIL) ? 'admin' : 'media';
                const result = await db.run(
                    'INSERT INTO users (name, email, avatar_url, role) VALUES (?, ?, ?, ?)',
                    [name, email, avatarUrl, role]
                );
                user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastID]);
            } else {
                // Update avatar if changed
                if (avatarUrl && avatarUrl !== user.avatar_url) {
                    await db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, user.id]);
                    user.avatar_url = avatarUrl;
                }
            }

            return done(null, user);
        } catch (err) {
            return done(err, null);
        }
    }));

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const db = await initDb();
            const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
            done(null, user || null);
        } catch (err) {
            done(err, null);
        }
    });

    app.use(passport.initialize());
    app.use(passport.session());
}

module.exports = { setupAuth };
