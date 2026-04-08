/**
 * esp32-notify.js  — FIXED
 *
 * ROOT CAUSE OF BUG:
 *   The detection loop runs every 200ms. Every call to notifyESP32() did
 *   clearTimeout(_timer) unconditionally, so a single frame of 'none' or
 *   'unknown' immediately after a 'known' frame cancelled the pending
 *   GREEN notification before it ever reached the server.
 *
 * FIXES APPLIED:
 *   1. Priority guard — 'none' and 'unknown' cannot cancel a pending
 *      higher-priority event ('known' > 'unknown' > 'none').
 *   2. Sticky hold — once 'known' fires, it holds for HOLD_MS so rapid
 *      'none' frames between detections don't reset the server to OFF.
 *   3. Kept the 3s re-ping loop so the server TTL (6000ms) is always
 *      refreshed while a face remains in frame.
 *
 * Usage (already in recognize.html → updateResultsPanel):
 *   notifyESP32('known',   personName, confidence)
 *   notifyESP32('unknown')
 *   notifyESP32('none')
 */

(function () {
    const NOTIFY_URL  = '/api/esp32/notify';
    const DEBOUNCE_MS = 400;   // reduced: fire faster so ESP32 sees GREEN quickly
    const HOLD_MS     = 4000;  // after sending 'known'/'unknown', ignore weaker events for this long

    const PRIORITY = { known: 2, unknown: 1, none: 0 };

    let _timer        = null;
    let _refreshTimer = null;
    let _pendingEvent = null;   // event waiting in debounce
    let _sentEvent    = null;   // last event actually sent to server
    let _holdUntil    = 0;      // timestamp until which weaker events are ignored

    async function sendToServer(event, personName, confidence) {
        try {
            const res = await fetch(NOTIFY_URL, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    event,
                    personName: personName || null,
                    confidence: confidence || 0
                })
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
        // Re-ping every 2.5s to keep server TTL (6000ms) alive
        _refreshTimer = setTimeout(async () => {
            await sendToServer(event, personName, confidence);
            scheduleRefresh(event, personName, confidence);
        }, 2500);
    }

    window.notifyESP32 = function (event, personName, confidence) {
        const incomingPriority = PRIORITY[event] ?? 0;
        const pendingPriority  = PRIORITY[_pendingEvent] ?? 0;
        const sentPriority     = PRIORITY[_sentEvent] ?? 0;

        // If we're inside a hold window and this event is weaker than what
        // was already sent, ignore it completely — don't even reset the timer.
        if (Date.now() < _holdUntil && incomingPriority < sentPriority) {
            return;
        }

        // Don't cancel a stronger pending event with a weaker incoming one.
        if (_timer && incomingPriority < pendingPriority) {
            return;
        }

        // New event is equal or stronger — update pending and restart debounce.
        clearTimeout(_timer);
        _pendingEvent = event;

        _timer = setTimeout(async () => {
            _pendingEvent = null;
            _sentEvent    = event;

            await sendToServer(event, personName, confidence);

            if (event !== 'none') {
                // Hold: ignore weaker events for HOLD_MS after sending
                _holdUntil = Date.now() + HOLD_MS;
                scheduleRefresh(event, personName, confidence);
            } else {
                _holdUntil = 0;
                clearTimeout(_refreshTimer);
            }
        }, DEBOUNCE_MS);
    };
})();
