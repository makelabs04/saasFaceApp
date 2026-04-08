/**
 * ESP32 Integration Route
 * Domain: https://facerecognition.makelearners.com/
 *
 * FIX: Single global command slot — browser (has session) and ESP32
 *      (no session) both use the same key, so commands are never lost.
 *
 * Endpoints:
 *   POST /api/esp32/notify   — browser → server (after recognition)
 *   GET  /api/esp32/status   — ESP32  → server (polling ~700ms)
 *   POST /api/esp32/clear    — ESP32  → server (acknowledge & clear)
 *   GET  /api/esp32/health   — connectivity ping
 *
 * LED/Buzzer logic:
 *   known   → GREEN    (green LED only)
 *   unknown → RED_BUZZ (red LED + buzzer)
 *   none    → OFF
 */

const express = require('express');
const router  = express.Router();

// ─── Single global command store ───────────────────────────────────────────
// Browser writes here; ESP32 reads here. No key scoping needed.
let store = { command: 'OFF', personName: null, confidence: 0, timestamp: 0 };

// Command expires after this many ms if ESP32 doesn't clear it first
const TTL_MS = 6000;

// ─── POST /api/esp32/notify ────────────────────────────────────────────────
router.post('/notify', (req, res) => {
    const { event, personName, confidence } = req.body;
    if (!event) return res.status(400).json({ success: false, message: 'event required.' });

    const command = event === 'known' ? 'GREEN' : event === 'unknown' ? 'RED_BUZZ' : 'OFF';

    store = { command, personName: personName || null, confidence: confidence || 0, timestamp: Date.now() };

    console.log(`[ESP32] notify  command=${command}  person=${personName || '-'}  conf=${confidence || 0}`);
    return res.json({ success: true, command });
});

// ─── GET /api/esp32/status ─────────────────────────────────────────────────
router.get('/status', (_req, res) => {
    if ((Date.now() - store.timestamp) > TTL_MS) {
        return res.json({ command: 'OFF', personName: null, confidence: 0 });
    }
    return res.json({ command: store.command, personName: store.personName, confidence: store.confidence });
});

// ─── POST /api/esp32/clear ─────────────────────────────────────────────────
router.post('/clear', (_req, res) => {
    store.command   = 'OFF';
    store.timestamp = 0;
    return res.json({ success: true });
});

// ─── GET /api/esp32/health ─────────────────────────────────────────────────
router.get('/health', (_req, res) => {
    return res.json({ success: true, service: 'FaceID ESP32 Bridge', time: new Date().toISOString() });
});

module.exports = router;
