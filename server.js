require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
fs.mkdirSync('uploads', { recursive: true });

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'facerecog_secret_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/persons', require('./routes/persons'));
app.use('/api/esp32',   require('./routes/esp32'));   // ← ESP32 integration

// ── Page routes ──────────────────────────────────────────────────────────────
app.get('/',              (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'index.html')));
app.get('/dashboard',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'dashboard.html')));
app.get('/register-face', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'register-face.html')));
app.get('/recognize',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'recognize.html')));
app.get('/persons',       (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'persons.html')));

app.listen(PORT, () => {
    console.log(`\n✅ Face Recognition SaaS running at: http://localhost:${PORT}`);
    console.log(`🤖 ESP32 endpoint: http://localhost:${PORT}/api/esp32/status`);
    console.log(`📁 Make sure to run database.sql to set up MySQL database\n`);
});
