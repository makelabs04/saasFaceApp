/**
 * esp32-notify.js  — paste this into recognize.html (or include as a <script>)
 *
 * Call notifyESP32('known', personName, confidence)  when a face is recognised.
 * Call notifyESP32('unknown')                        when an unregistered face appears.
 * Call notifyESP32('none')                           when no face is in frame.
 *
 * The function is debounced: it won't flood the server faster than once per second.
 */

(function () {
    const ESP32_NOTIFY_URL = 'https://facerecognition.makelearners.com/api/esp32/notify';
    let   _lastEvent       = null;
    let   _debounceTimer   = null;
    const DEBOUNCE_MS      = 1000;   // minimum ms between server calls

    window.notifyESP32 = function (event, personName, confidence) {
        const key = event + (personName || '');
        if (key === _lastEvent) return;  // same event — skip

        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(async () => {
            _lastEvent = key;
            try {
                await fetch(ESP32_NOTIFY_URL, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ event, personName: personName || null, confidence: confidence || 0 })
                });
            } catch (e) {
                console.warn('[ESP32] notify failed:', e.message);
            }
        }, DEBOUNCE_MS);
    };
})();

/* ─── Integration points in recognize.html ───────────────────────────────
 *
 * 1. In updateResultsPanel(), after computing known/unknown:
 *
 *    if (known.length > 0) {
 *        const top = known[0];
 *        notifyESP32('known', top.person.name, top.confidence);
 *    } else if (unknown.length > 0) {
 *        notifyESP32('unknown');
 *    } else {
 *        notifyESP32('none');
 *    }
 *
 * 2. The function already debounces, so safe to call inside the
 *    live-camera detection loop (runs every ~200 ms).
 */
