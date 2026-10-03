const db = require('../../config/db');
const fs = require('fs');
const path = require('path');

function removeUploaded(mediaPath) {
    if (!mediaPath) return;
    const uploadsRoot = path.resolve(__dirname, '../../uploads');
    const target = path.resolve(__dirname, '../..', String(mediaPath).replace(/^[/\\]+/, ''));
    if (!target.startsWith(uploadsRoot + path.sep)) return;
    try { if (fs.existsSync(target)) fs.unlinkSync(target); } catch { /* Keep the saved banner if cleanup fails. */ }
}

// সব সেটিংস, ব্যানার এবং ক্যাটাগরি ফেচ করার API
exports.getBannersAndSettings = async (req, res) => {
    try {
        const [settingsRaw] = await db.query("SELECT setting_key, setting_value FROM settings");
        const settings = {};
        settingsRaw.forEach(s => settings[s.setting_key] = s.setting_value);

        const [bannersRaw] = await db.query("SELECT * FROM site_banners");
        const banners = {};
        bannersRaw.forEach(b => banners[b.section_key] = b);

        const [categories] = await db.query("SELECT id, name FROM categories");

        res.json({
            success: true,
            current_logo: settings.site_logo || '',
            banners,
            categories
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// লোগো বা ব্যানার আপলোড ও আপডেট করার API
exports.updateBannerOrLogo = async (req, res) => {
    try {
        const section_key = String(req.body.section_key || '').trim();
        const title = String(req.body.title || '').trim().slice(0, 160);
        const file = req.file;

        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(section_key)) {
            return res.status(400).json({ success: false, message: 'Use a section key with letters, numbers, hyphens, or underscores.' });
        }

        // ---- SITE LOGO UPDATE ----
        if (section_key === 'site_logo') {
            if (!file) {
                return res.status(400).json({ success: false, message: 'No logo file uploaded' });
            }

            // পুরানো লোগো ডিলিট করা
            const [oldLogoRows] = await db.query("SELECT setting_value FROM settings WHERE setting_key='site_logo'");

            const logoPath = `uploads/logo/${file.filename}`;
            await db.query(
                "INSERT INTO settings (setting_key, setting_value) VALUES ('site_logo', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
                [logoPath, logoPath]
            );
            if (oldLogoRows[0]?.setting_value !== logoPath) removeUploaded(oldLogoRows[0]?.setting_value);

            return res.json({ success: true, message: 'লোগো সফলভাবে আপডেট হয়েছে!', path: logoPath });
        }

        // ---- HERO / CATEGORY BANNERS UPDATE ----
        else {
            const [existingRows] = await db.query("SELECT * FROM site_banners WHERE section_key = ?", [section_key]);
            const existing = existingRows[0];

            let mediaPath = existing ? existing.media_path : '';
            let mediaType = existing ? existing.media_type : 'image';

            if (file) {
                mediaPath = `uploads/banners/${file.filename}`;
                mediaType = file.mimetype.startsWith('video') ? 'video' : 'image';
            }

            if (existing) {
                await db.query(
                    "UPDATE site_banners SET title = ?, media_path = ?, media_type = ? WHERE section_key = ?",
                    [title || '', mediaPath, mediaType, section_key]
                );
            } else {
                await db.query(
                    "INSERT INTO site_banners (section_key, title, media_path, media_type) VALUES (?, ?, ?, ?)",
                    [section_key, title || '', mediaPath, mediaType]
                );
            }
            if (file && existing?.media_path !== mediaPath) removeUploaded(existing?.media_path);

            return res.json({ success: true, message: 'সফলভাবে আপডেট করা হয়েছে!', mediaPath });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error during upload' });
    }
};