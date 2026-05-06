const express = require('express');
const router = express.Router();
const db = require('../db');

// ── Admin credentials (change these as needed) ────────────────────────────────
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin@123';

// ── Admin session middleware ──────────────────────────────────────────────────
function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    return res.status(401).json({ success: false, message: 'Unauthorized. Admin login required.' });
}

// Admin login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.json({ success: false, message: 'All fields are required.' });
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        return res.json({ success: true, message: 'Admin login successful.' });
    }
    res.json({ success: false, message: 'Invalid admin credentials.' });
});

// Admin logout
router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

// Admin session check
router.get('/me', (req, res) => {
    res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// Get all registered users with their person/face counts
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const [users] = await db.query(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.created_at,
                COUNT(DISTINCT p.id)  AS person_count,
                COUNT(DISTINCT fs.id) AS face_sample_count
            FROM users u
            LEFT JOIN persons p  ON p.user_id  = u.id
            LEFT JOIN face_samples fs ON fs.user_id = u.id
            GROUP BY u.id
            ORDER BY u.created_at DESC
        `);
        res.json({ success: true, users });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// Get persons registered by a specific user
router.get('/users/:id/persons', requireAdmin, async (req, res) => {
    try {
        const [persons] = await db.query(`
            SELECT p.*, COUNT(fs.id) AS sample_count
            FROM persons p
            LEFT JOIN face_samples fs ON fs.person_id = p.id
            WHERE p.user_id = ?
            GROUP BY p.id
            ORDER BY p.created_at DESC
        `, [req.params.id]);
        res.json({ success: true, persons });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// Get summary stats
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const [[{ total_users }]]        = await db.query('SELECT COUNT(*) AS total_users FROM users');
        const [[{ total_persons }]]      = await db.query('SELECT COUNT(*) AS total_persons FROM persons');
        const [[{ total_face_samples }]] = await db.query('SELECT COUNT(*) AS total_face_samples FROM face_samples');
        res.json({ success: true, stats: { total_users, total_persons, total_face_samples } });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
