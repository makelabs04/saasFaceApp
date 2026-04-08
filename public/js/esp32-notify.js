/**
 * esp32-notify.js  — SaaS Multi-User Edition
 *
 * The browser sends POST /api/esp32/notify which is session-authenticated.
 * The server stamps the command with the logged-in userId automatically.
 * The ESP32 uses ?token=<userId> to poll only its own slot.
 *
 * FIXES:
 *   1. Cooldown guard — same event+person will NOT re-send within COOLDOWN_MS.
 *      This prevents the LED from blinking continuously while the same face
 *      stays in frame (live camera sends detections repeatedly at ~5 FPS).
 *   2. No re-ping loop — removed scheduleRefresh entirely. The server TTL
 *      (8 s) is long enough; the ESP32 clears the command after acting on it.
 *   3. stopESP32Notify() — cancels any pending timers and sends 'none' once,
 *      so stopping the camera cleanly clears the server slot.
 *   4. Priority guard — 'none'/'unknown' cannot cancel a pending 'known' debounce.
 */

(function () {
    const NOTIFY_URL  = '/api/esp32/notify';   // session-authenticated, no token needed
    const DEBOUNCE_MS = 100;    // reduced: faster LED response
    const COOLDOWN_MS = 6000;  // don't re-send same event for this many ms

    const PRIORITY = { known: 2, unknown: 1, none: 0 };

    let _timer        = null;
    let _pendingEvent = null;
    let _sentEvent    = null;
    let _sentPerson   = null;
    let _sentAt       = 0;   // timestamp of last successful send

    async function sendToServer(event, personName, confidence) {
        try {
            const res = await fetch(NOTIFY_URL, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ event, personName: personName || null, confidence: confidence || 0 })
            });
            const data = await res.json();
            console.log(`[ESP32] notified → ${data.command}`);
        } catch (e) {
            console.warn('[ESP32] notify error:', e.message);
        }
    }

    window.notifyESP32 = function (event, personName, confidence) {
        const incomingPri = PRIORITY[event] ?? 0;
        const pendingPri  = PRIORITY[_pendingEvent] ?? 0;

        // Priority guard: weaker events don't cancel a stronger pending debounce
        if (_timer && incomingPri < pendingPri) return;

        // Cooldown guard: if same event AND same person fired recently, skip entirely.
        // This is the main fix — live camera fires every 200ms for the same face;
        // without this, every frame would queue a new command and the ESP32
        // LED keeps re-triggering even after the camera stops.
        const now = Date.now();
        const sameEvent  = (event === _sentEvent);
        const samePerson = (personName === _sentPerson);
        if (sameEvent && samePerson && (now - _sentAt) < COOLDOWN_MS) return;

        clearTimeout(_timer);
        _pendingEvent = event;

        _timer = setTimeout(async () => {
            _pendingEvent = null;
            _sentEvent    = event;
            _sentPerson   = personName || null;
            _sentAt       = Date.now();

            await sendToServer(event, personName, confidence);
        }, DEBOUNCE_MS);
    };

    /**
     * Call this when the camera is stopped.
     * Cancels any pending debounce and sends a single 'none' to clear the
     * server slot — so the ESP32 won't act on a stale command next time.
     */
    window.stopESP32Notify = function () {
        clearTimeout(_timer);
        _timer        = null;
        _pendingEvent = null;
        _sentEvent    = null;
        _sentPerson   = null;
        _sentAt       = 0;
        // Send 'none' once to clear server slot immediately
        sendToServer('none', null, 0);
        console.log('[ESP32] notify stopped — server slot cleared');
    };
})();
