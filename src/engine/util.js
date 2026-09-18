/* Shared helpers: time handling (timezone-free), text normalisation, tokenising. */
(function (EPA) {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // All timestamps are naive local office time. We store them as UTC epoch ms so the
  // result never depends on the timezone of the machine running the agent.
  function parseT(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
    if (!m) throw new Error("Bad timestamp: " + s);
    return Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  }
  function toIso(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  }
  function startOfDay(ms) { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  function atTime(dayMs, h, m) { return startOfDay(dayMs) + h * HOUR + (m || 0) * MIN; }
  function weekday(ms) { return new Date(ms).getUTCDay(); }
  function sameDay(a, b) { return startOfDay(a) === startOfDay(b); }

  function fmtTime(ms) {
    const d = new Date(ms);
    let h = d.getUTCHours(); const m = d.getUTCMinutes();
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return m ? `${h}:${String(m).padStart(2, "0")} ${ap}` : `${h} ${ap}`;
  }
  function fmtDay(ms) { const d = new Date(ms); return `${WD_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; }
  function fmtDayTime(ms) { return `${fmtDay(ms)}, ${fmtTime(ms)}`; }

  // "in 3h 20m" / "2d 4h ago"
  function fmtDelta(ms) {
    const abs = Math.abs(ms);
    let out;
    if (abs < HOUR) out = `${Math.max(1, Math.round(abs / MIN))}m`;
    else if (abs < DAY) { const h = Math.floor(abs / HOUR); const m = Math.round((abs % HOUR) / MIN); out = m ? `${h}h ${m}m` : `${h}h`; }
    else { const d = Math.floor(abs / DAY); const h = Math.round((abs % DAY) / HOUR); out = h ? `${d}d ${h}h` : `${d}d`; }
    return out;
  }

  function norm(text) {
    return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–]/g, "-");
  }

  const STOP = new Set(("a an the and or but to of for on in at by with from is are was were be been it its this that these those i me my you your we our us he him his she her they them their " +
    "can could will would should need needs want have has had do does did not no yes so just also still get got send sent let's lets up out about any anyone someone who whose what when " +
    "now then there here as if than too very more one quick note self thing things okay ok good noted time today tomorrow week day morning evening afternoon end").split(" "));
  function stem(w) {
    if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
    return w;
  }
  function tokens(text) {
    return norm(text).toLowerCase().replace(/'s\b/g, "").split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)).map(stem);
  }

  function uniq(arr) { return Array.from(new Set(arr)); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  EPA.util = { MIN, HOUR, DAY, WEEKDAYS, parseT, toIso, startOfDay, atTime, weekday, sameDay, fmtTime, fmtDay, fmtDayTime, fmtDelta, norm, tokens, stem, uniq, cap };
})(typeof window !== "undefined" ? (window.EPA = window.EPA || {}) : (globalThis.EPA = globalThis.EPA || {}));
