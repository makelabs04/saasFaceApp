const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = `uploads/${req.session.userId}`;
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp/;
        if (allowed.test(path.extname(file.originalname).toLowerCase())) {
            cb(null, true);
        } else {
            cb(new Error('Only image files allowed'));
        }
    }
});

// Register a new person
router.post('/register', requireAuth, async (req, res) => {
    try {
        const { name, age, email, mobile } = req.body;
        if (!name) return res.json({ success: false, message: 'Name is required.' });

        const faceLabel = `${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
        const [result] = await db.query(
            'INSERT INTO persons (user_id, name, age, email, mobile, face_label) VALUES (?, ?, ?, ?, ?, ?)',
            [req.session.userId, name, age || null, email || null, mobile || null, faceLabel]
        );
        res.json({ success: true, personId: result.insertId, faceLabel, message: 'Person registered!' });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// Save face sample (base64 image + descriptor)
router.post('/sample', requireAuth, async (req, res) => {
    try {
        const { personId, imageData, descriptor } = req.body;
        if (!personId || !descriptor) return res.json({ success: false, message: 'Missing data.' });

        // Verify person belongs to this user
        const [persons] = await db.query('SELECT id FROM persons WHERE id = ? AND user_id = ?', [personId, req.session.userId]);
        if (persons.length === 0) return res.json({ success: false, message: 'Person not found.' });

        let imagePath = null;
        if (imageData) {
            const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
            const dir = `uploads/${req.session.userId}/${personId}`;
            fs.mkdirSync(dir, { recursive: true });
            imagePath = `${dir}/${uuidv4()}.jpg`;
            fs.writeFileSync(imagePath, Buffer.from(base64Data, 'base64'));
        }

        await db.query(
            'INSERT INTO face_samples (person_id, user_id, image_path, face_descriptor) VALUES (?, ?, ?, ?)',
            [personId, req.session.userId, imagePath, JSON.stringify(descriptor)]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// Upload image and save sample
router.post('/upload-sample', requireAuth, upload.single('image'), async (req, res) => {
    try {
        const { personId, descriptor } = req.body;
        if (!personId || !descriptor) return res.json({ success: false, message: 'Missing data.' });

        const [persons] = await db.query('SELECT id FROM persons WHERE id = ? AND user_id = ?', [personId, req.session.userId]);
        if (persons.length === 0) return res.json({ success: false, message: 'Person not found.' });

        const imagePath = req.file ? req.file.path : null;
        await db.query(
            'INSERT INTO face_samples (person_id, user_id, image_path, face_descriptor) VALUES (?, ?, ?, ?)',
            [personId, req.session.userId, imagePath, descriptor]
        );
        res.json({ success: true, imagePath });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// Get all persons with sample counts
router.get('/list', requireAuth, async (req, res) => {
    try {
        const [persons] = await db.query(
            `SELECT p.*, COUNT(fs.id) as sample_count 
             FROM persons p 
             LEFT JOIN face_samples fs ON fs.person_id = p.id 
             WHERE p.user_id = ? 
             GROUP BY p.id 
             ORDER BY p.created_at DESC`,
            [req.session.userId]
        );
        res.json({ success: true, persons });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// Get face descriptors for recognition
router.get('/descriptors', requireAuth, async (req, res) => {
    try {
        const [samples] = await db.query(
            `SELECT fs.face_descriptor, fs.person_id, p.name, p.age, p.email, p.mobile, p.face_label
             FROM face_samples fs
             JOIN persons p ON p.id = fs.person_id
             WHERE fs.user_id = ? AND fs.face_descriptor IS NOT NULL`,
            [req.session.userId]
        );

        // Group by person
        const grouped = {};
        for (const s of samples) {
            if (!grouped[s.person_id]) {
                grouped[s.person_id] = {
                    personId: s.person_id,
                    name: s.name,
                    age: s.age,
                    email: s.email,
                    mobile: s.mobile,
                    faceLabel: s.face_label,
                    descriptors: []
                };
            }
            try {
                grouped[s.person_id].descriptors.push(JSON.parse(s.face_descriptor));
            } catch (e) {}
        }

        res.json({ success: true, data: Object.values(grouped) });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// Delete person
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        await db.query('DELETE FROM persons WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: 'Server error.' });
    }
});

// Get sample count for a person
router.get('/:id/samples', requireAuth, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT COUNT(*) as count FROM face_samples WHERE person_id = ? AND user_id = ?',
            [req.params.id, req.session.userId]
        );
        res.json({ success: true, count: rows[0].count });
    } catch (err) {
        res.json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
