/**
 * esp32-notify.js
 *
 * FIX 1: Removed the "same event skip" guard — it was blocking re-sends
 *         when the same person stayed in frame across debounce windows.
 * FIX 2: Debounce now fires every DEBOUNCE_MS regardless of same/different,
 *         so the server TTL is always refreshed while a face is present.
 *
 * Usage (already in recognize.html updateResultsPanel):
 *   notifyESP32('known',   personName, confidence)
 *   notifyESP32('unknown')
 *   notifyESP32('none')
 */

(function () {
    const NOTIFY_URL   = '/api/esp32/notify';
    const DEBOUNCE_MS  = 1200;   // ms between server calls (< TTL of 6000ms)

    let _timer     = null;
    let _lastSent  = 0;

    window.notifyESP32 = function (event, personName, confidence) {
        clearTimeout(_timer);

        _timer = setTimeout(async () => {
            _lastSent = Date.now();
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

            // If still detecting something, schedule next refresh before TTL expires
            if (event !== 'none') {
                _timer = setTimeout(() => {
                    window.notifyESP32(event, personName, confidence);
                }, 3000);   // re-ping every 3s to keep TTL alive
            }
        }, DEBOUNCE_MS);
    };
})();
