const express = require('express');
const fs = require('fs');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const bannerController = require('../controllers/admin/bannerController');
const { verifyAdmin } = require('../middlewares/auth');

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const isLogo = req.body.section_key === 'site_logo';
        const uploadDir = isLogo 
            ? path.join(__dirname, '../uploads/logo') 
            : path.join(__dirname, '../uploads/banners');
        
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const section = String(req.body.section_key || 'media').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
        cb(null, `${section}_${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype === 'video/mp4') return cb(null, true);
        cb(new Error('Upload an image or MP4 video.'));
    }
});
const uploadMedia = upload.single('media_file');

router.get('/', bannerController.getBannersAndSettings);
router.post('/update', verifyAdmin, (req, res, next) => {
    uploadMedia(req, res, (err) => {
        if (!err) return next();
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        res.status(status).json({ success: false, message: err.message || 'Could not process the uploaded file.' });
    });
}, bannerController.updateBannerOrLogo);

module.exports = router;