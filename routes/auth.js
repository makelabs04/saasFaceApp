const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password)
            return res.json({ success: false, message: 'All fields are required.' });

        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0)
            return res.json({ success: false, message: 'Email already registered.' });

        const hashed = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashed]);
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

        const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
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
