/**
 * ESP32 Integration Route
 * Domain: https://facerecognition.makelearners.com/
 *
 * Endpoints:
 *   POST /api/esp32/notify   — called by the browser after recognition
 *   GET  /api/esp32/status   — polled by the ESP32 to get the latest command
 *   GET  /api/esp32/health   — quick ping to verify connectivity
 *
 * Flow:
 *  1. Browser recognises a face → calls POST /api/esp32/notify with result.
 *  2. Server stores the latest command in memory (per-user or global).
 *  3. ESP32 polls GET /api/esp32/status every ~500 ms.
 *  4. Server returns { command: "GREEN" | "RED_BUZZ" | "OFF" } and clears it.
 *
 * LED / Buzzer logic:
 *   Known person   → GREEN  (green LED only)
 *   Unknown person → RED_BUZZ (red LED + buzzer)
 *   No face        → OFF
 */

const express = require('express');
const router  = express.Router();

// ---------------------------------------------------------------------------
// In-memory command store  { userId -> { command, timestamp, personName } }
// For a production system replace this with Redis or a DB row.
// ---------------------------------------------------------------------------
const commandStore = {};

// How long (ms) a command stays valid before auto-clearing to OFF
const COMMAND_TTL_MS = 5000;

// ---------------------------------------------------------------------------
// Helper — resolve a userId key; falls back to 'global' for ESP32 polling
// without auth (useful when ESP32 shares a single API key per installation).
// ---------------------------------------------------------------------------
function storeKey(req) {
    // If the request comes from a logged-in browser session, scope to that user
    if (req.session && req.session.userId) return `user_${req.session.userId}`;
    // Allow an optional ?user_id= query param for multi-user ESP32 installs
    if (req.query.user_id) return `user_${req.query.user_id}`;
    return 'global';
}

// ---------------------------------------------------------------------------
// POST /api/esp32/notify
// Called by the browser client immediately after a recognition event.
//
// Body (JSON):
// {
//   "event"      : "known" | "unknown" | "none",
//   "personName" : "John Doe",          // present when event === "known"
//   "confidence" : 87                   // 0-100
// }
// ---------------------------------------------------------------------------
router.post('/notify', (req, res) => {
    const { event, personName, confidence } = req.body;

    if (!event) {
        return res.status(400).json({ success: false, message: 'event field is required.' });
    }

    let command;
    switch (event) {
        case 'known':
            command = 'GREEN';
            break;
        case 'unknown':
            command = 'RED_BUZZ';
            break;
        default:
            command = 'OFF';
    }

    const key = storeKey(req);
    commandStore[key] = {
        command,
        personName: personName || null,
        confidence: confidence || 0,
        timestamp: Date.now()
    };

    console.log(`[ESP32] Notify → key=${key} command=${command} person=${personName || 'N/A'}`);

    return res.json({
        success: true,
        command,
        message: `Command '${command}' queued for ESP32.`
    });
});

// ---------------------------------------------------------------------------
// GET /api/esp32/status
// Polled by the ESP32 microcontroller (via HTTP GET).
// Returns the latest pending command and then resets it to OFF.
//
// Query params (optional):
//   ?user_id=3   — to scope commands to a specific user account
//
// Response:
// {
//   "command"    : "GREEN" | "RED_BUZZ" | "OFF",
//   "personName" : "John Doe" | null,
//   "confidence" : 87
// }
// ---------------------------------------------------------------------------
router.get('/status', (req, res) => {
    const key = storeKey(req);
    const entry = commandStore[key];

    // If no command or TTL expired, return OFF
    if (!entry || (Date.now() - entry.timestamp) > COMMAND_TTL_MS) {
        return res.json({ command: 'OFF', personName: null, confidence: 0 });
    }

    // Return current command — keep it alive until TTL expires naturally
    // (ESP32 will act on it for the full TTL window)
    return res.json({
        command:    entry.command,
        personName: entry.personName,
        confidence: entry.confidence
    });
});

// ---------------------------------------------------------------------------
// POST /api/esp32/clear
// Lets the ESP32 explicitly acknowledge and clear the command after acting.
// ---------------------------------------------------------------------------
router.post('/clear', (req, res) => {
    const key = storeKey(req);
    if (commandStore[key]) {
        commandStore[key].command   = 'OFF';
        commandStore[key].timestamp = Date.now();
    }
    return res.json({ success: true, message: 'Command cleared.' });
});

// ---------------------------------------------------------------------------
// GET /api/esp32/health
// Simple connectivity check that the ESP32 can use on boot.
// ---------------------------------------------------------------------------
router.get('/health', (_req, res) => {
    return res.json({
        success: true,
        service: 'FaceID SaaS — ESP32 Bridge',
        domain:  'https://facerecognition.makelearners.com/',
        time:    new Date().toISOString()
    });
});

module.exports = router;
