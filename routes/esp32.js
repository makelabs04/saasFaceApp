/**
 * ESP32 Integration Route — SaaS Multi-User Edition
 *
 * PROBLEM FIXED:
 *   The old code used a single global `store` shared across ALL users.
 *   When User A's browser did recognition, User B's ESP32 also received
 *   that command because all ESPs polled the same endpoint with no identity.
 *
 * SOLUTION — Token-based per-user command slots:
 *   1. Browser (POST /notify)  → has session → stamps command with userId.
 *   2. ESP32  (GET  /status)   → sends ?token=<userId> → reads only its own slot.
 *   3. ESP32  (POST /clear)    → sends ?token=<userId> → clears only its own slot.
 *
 *   The "token" is simply the numeric userId. The user finds their token
 *   on the Dashboard page, and enters it once in the Arduino sketch.
 *
 * Endpoints:
 *   POST /api/esp32/notify          — browser → server (requires login session)
 *   GET  /api/esp32/status?token=ID — ESP32  → server
 *   POST /api/esp32/clear?token=ID  — ESP32  → server
 *   GET  /api/esp32/health          — connectivity ping (no auth needed)
 *   GET  /api/esp32/token           — browser → get own userId token (requires login)
 */

const express      = require('express');
const router       = express.Router();
const { requireAuth } = require('../middleware/auth');

// ─── Per-user command store  { userId -> { command, personName, confidence, timestamp } }
const userStore = {};

// Command expires after this many ms if ESP32 doesn't clear it first
const TTL_MS = 8000;

function getSlot(userId) {
    if (!userStore[userId]) {
        userStore[userId] = { command: 'OFF', personName: null, confidence: 0, timestamp: 0 };
    }
    return userStore[userId];
}

// ─── GET /api/esp32/token  — browser fetches its own userId to show on dashboard
router.get('/token', requireAuth, (req, res) => {
    res.json({ success: true, token: req.session.userId, userName: req.session.userName });
});

// ─── POST /api/esp32/notify  — browser → server (after recognition)
router.post('/notify', requireAuth, (req, res) => {
    const { event, personName, confidence } = req.body;
    if (!event) return res.status(400).json({ success: false, message: 'event required.' });

    const command = event === 'known' ? 'GREEN' : event === 'unknown' ? 'RED_BUZZ' : 'OFF';
    const slot    = getSlot(req.session.userId);

    slot.command    = command;
    slot.personName = personName || null;
    slot.confidence = confidence || 0;
    slot.timestamp  = Date.now();

    console.log(`[ESP32] user=${req.session.userId} command=${command} person=${personName || '-'} conf=${confidence || 0}`);
    return res.json({ success: true, command });
});

// ─── GET /api/esp32/status?token=<userId>  — ESP32 polls this
router.get('/status', (req, res) => {
    const userId = parseInt(req.query.token);
    if (!userId) return res.status(400).json({ command: 'OFF', error: 'token required' });

    const slot = getSlot(userId);
    if ((Date.now() - slot.timestamp) > TTL_MS) {
        return res.json({ command: 'OFF', personName: null, confidence: 0 });
    }
    return res.json({ command: slot.command, personName: slot.personName, confidence: slot.confidence });
});

// ─── POST /api/esp32/clear?token=<userId>  — ESP32 acknowledges command
router.post('/clear', (req, res) => {
    const userId = parseInt(req.query.token);
    if (!userId) return res.status(400).json({ success: false, error: 'token required' });

    const slot      = getSlot(userId);
    slot.command    = 'OFF';
    slot.timestamp  = 0;
    return res.json({ success: true });
});

// ─── GET /api/esp32/health  — ping, no auth
router.get('/health', (_req, res) => {
    res.json({ success: true, service: 'FaceID ESP32 Bridge (Multi-User)', time: new Date().toISOString() });
});

module.exports = router;
