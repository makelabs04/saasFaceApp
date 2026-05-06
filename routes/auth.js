const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// ── Validation helpers ────────────────────────────────────────────────────────
function isValidName(name) {
    // Only letters (including accented), spaces, hyphens, apostrophes — no digits/symbols
    return /^[A-Za-zÀ-ÖØ-öø-ÿ\s'\-]{2,100}$/.test(name);
}

function isValidEmail(email) {
    // Standard email: local@domain.tld — must have proper structure
    return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
}

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password)
            return res.json({ success: false, message: 'All fields are required.' });

        // Validate name — no integers or symbols
        if (!isValidName(name.trim()))
            return res.json({ success: false, message: 'Name must contain only letters and spaces (no numbers or symbols).' });

        // Validate email format
        if (!isValidEmail(email.trim()))
            return res.json({ success: false, message: 'Please enter a valid email address (e.g. user@example.com).' });

        if (password.length < 6)
            return res.json({ success: false, message: 'Password must be at least 6 characters.' });

        // Duplicate email check
        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
        if (existing.length > 0)
            return res.json({ success: false, message: 'This email is already registered. Please sign in.' });

        const hashed = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name.trim(), email.trim().toLowerCase(), hashed]);
        res.json({ success: true, message: 'Registration successful! Please login.' });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error. Try again.' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.json({ success: false, message: 'All fields are required.' });

        const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
        if (rows.length === 0)
            return res.json({ success: false, message: 'Invalid credentials.' });

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match)
            return res.json({ success: false, message: 'Invalid credentials.' });

        req.session.userId = user.id;
        req.session.userName = user.name;
        res.json({ success: true, message: 'Login successful!', name: user.name });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

// Session check
router.get('/me', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ loggedIn: true, name: req.session.userName, userId: req.session.userId });
    } else {
        res.json({ loggedIn: false });
    }
});

module.exports = router;
