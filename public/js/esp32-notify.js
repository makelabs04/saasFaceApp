/**
 * esp32-notify.js  — SaaS Multi-User Edition
 *
 * The browser sends POST /api/esp32/notify which is session-authenticated.
 * The server stamps the command with the logged-in userId automatically.
 * The ESP32 uses ?token=<userId> to poll only its own slot.
 *
 * Fixes applied:
 *   1. Priority guard — 'none'/'unknown' cannot cancel a pending 'known' debounce.
 *   2. Hold window   — after 'known' fires, weaker events are ignored for HOLD_MS.
 *   3. Fast debounce — 400ms instead of 1200ms so ESP32 sees GREEN quickly.
 *   4. Re-ping loop  — keeps server TTL alive every 2.5s while face is present.
 */

(function () {
    const NOTIFY_URL  = '/api/esp32/notify';   // session-authenticated, no token needed
    const DEBOUNCE_MS = 400;
    const HOLD_MS     = 4000;

    const PRIORITY = { known: 2, unknown: 1, none: 0 };

    let _timer        = null;
    let _refreshTimer = null;
    let _pendingEvent = null;
    let _sentEvent    = null;
    let _holdUntil    = 0;

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

    function scheduleRefresh(event, personName, confidence) {
        clearTimeout(_refreshTimer);
        if (event === 'none') return;
        _refreshTimer = setTimeout(async () => {
            await sendToServer(event, personName, confidence);
            scheduleRefresh(event, personName, confidence);
        }, 2500);
    }

    window.notifyESP32 = function (event, personName, confidence) {
        const incomingPri = PRIORITY[event] ?? 0;
        const pendingPri  = PRIORITY[_pendingEvent] ?? 0;
        const sentPri     = PRIORITY[_sentEvent] ?? 0;

        if (Date.now() < _holdUntil && incomingPri < sentPri) return;
        if (_timer && incomingPri < pendingPri) return;

        clearTimeout(_timer);
        _pendingEvent = event;

        _timer = setTimeout(async () => {
            _pendingEvent = null;
            _sentEvent    = event;

            await sendToServer(event, personName, confidence);

            if (event !== 'none') {
                _holdUntil = Date.now() + HOLD_MS;
                scheduleRefresh(event, personName, confidence);
            } else {
                _holdUntil = 0;
                clearTimeout(_refreshTimer);
            }
        }, DEBOUNCE_MS);
    };
})();
