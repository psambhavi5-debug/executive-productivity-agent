/*
 * Temporal resolver — turns fuzzy deadline language ("by end of day tomorrow",
 * "Thursday morning", "tomorrow (Wednesday) morning", "before Thursday's board prep",
 * "3 PM today", "Wednesday evening, not Thursday") into a concrete timestamp,
 * relative to the moment the statement was made.
 *
 * Conventions (documented in docs/INPUTS_AND_ASSUMPTIONS.md):
 *   first thing = 9:00 AM · morning = by 12:00 PM · end of day / bare day = 6:00 PM
 *   afternoon = 5:00 PM · evening / tonight = 9:00 PM · "this week" = Friday 6:00 PM
 *   "before <event>" = the event's start on the user's calendar
 *   "before <day>" = start of that day · a bare hour 1–7 without am/pm = PM
 */
(function (EPA) {
  const U = EPA.util;
  const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const DAY_ALT = "today|tonight|tomorrow|this week|this morning|this afternoon|this evening|" + DAYS.join("|");
  const PART_HOURS = { "first thing": [9, 0], "end of day": [18, 0], eod: [18, 0], morning: [12, 0], afternoon: [17, 0], evening: [21, 0], tonight: [21, 0] };
  const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, sep: 8, october: 9, november: 10, december: 11 };

  const blank = (m) => " ".repeat(m.length);

  function dayFromWord(word, ref, ctx) {
    const refDay = U.startOfDay(ref);
    if (word === "today" || word === "tonight" || word.startsWith("this ") && word !== "this week") return refDay;
    if (word === "tomorrow") return refDay + U.DAY;
    if (word === "this week") return ctx.week.end;
    const idx = DAYS.indexOf(word);
    if (idx < 0) return null;
    const target = (idx + 1) % 7; // JS: 0 = Sunday
    for (let k = 0; k < 7; k++) { const d = refDay + k * U.DAY; if (U.weekday(d) === target) return d; }
    return null;
  }

  function resolve(text, ref, ctx) {
    const orig = U.norm(text);
    let t = orig.toLowerCase();
    const mentions = [];

    // 1. drop things that look like dates but are not deadlines
    t = t.replace(new RegExp(`\\b(not|instead of)\\s+(today|tomorrow|${DAYS.join("|")})\\b`, "g"), blank); // negations
    t = t.replace(new RegExp(`\\b(${DAYS.join("|")})\\s*-\\s*(${DAYS.join("|")})(\\s+[a-z]+)?`, "g"), blank); // ranges = availability
    t = t.replace(new RegExp(`\\((${DAYS.join("|")})\\)`, "g"), blank); // glosses: "tomorrow (Wednesday)"

    // 2. event anchors: "before Thursday's board prep", "before your board prep block"
    const anchorRe = /\bbefore\s+(?:(?:[a-z]+'s|your|the|our)\s+)?(?:(?:[a-z]+'s|your|the|our)\s+)?([a-z]+(?:\s+[a-z]+)?)/g;
    let m;
    while ((m = anchorRe.exec(t))) {
      const words = m[1].split(/\s+/);
      if (DAY_ALT.split("|").includes(words[0])) {
        const d = dayFromWord(words[0], ref, ctx);
        if (d != null) mentions.push({ pos: m.index, end: m.index + m[0].length, due: d, kind: "before-day", hasClock: false });
        t = t.slice(0, m.index) + blank(m[0]) + t.slice(m.index + m[0].length);
        continue;
      }
      const want = U.tokens(m[1]);
      const ev = (ctx.userEvents || []).filter((e) => e.at >= U.startOfDay(ref))
        .find((e) => want.length && want.every((w) => U.tokens(e.title).includes(w)));
      if (ev) {
        mentions.push({ pos: m.index, end: m.index + m[0].length, due: ev.at, kind: "anchor", anchor: ev.title, anchorId: ev.id, hasClock: false });
        t = t.slice(0, m.index) + blank(m[0]) + t.slice(m.index + m[0].length);
      }
    }

    // 3. day words, absolute dates, parts of day, clock times
    const days = [];
    const dayRe = new RegExp(`\\b(${DAY_ALT})(?:'s)?\\b`, "g");
    while ((m = dayRe.exec(t))) {
      const d = dayFromWord(m[1], ref, ctx);
      if (d == null) continue;
      const part = m[1].startsWith("this ") && m[1] !== "this week" ? m[1].slice(5) : null;
      days.push({ pos: m.index, end: m.index + m[0].length, due: d, word: m[1], parts: part ? [part] : [], clock: null });
    }
    const absRe = /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|sep|october|november|december)\b/g;
    while ((m = absRe.exec(t))) {
      const refD = new Date(ref);
      const d = Date.UTC(refD.getUTCFullYear(), MONTHS[m[2]], +m[1]);
      const same = days.find((x) => x.due === d && Math.abs(x.pos - m.index) < 20);
      if (same) { same.end = Math.max(same.end, m.index + m[0].length); continue; }
      days.push({ pos: m.index, end: m.index + m[0].length, due: d, word: m[0], parts: [], clock: null });
    }
    // blank compound "this morning" so "morning" is not re-read as a separate part
    days.forEach((d) => { if (d.word.startsWith("this ")) t = t.slice(0, d.pos) + blank(t.slice(d.pos, d.end)) + t.slice(d.end); });

    const extras = [];
    const partRe = /\b(first thing|end of day|eod|morning|afternoon|evening|tonight)\b/g;
    while ((m = partRe.exec(t))) extras.push({ type: "part", pos: m.index, end: m.index + m[0].length, value: m[1] });
    const clockRe = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b|\b(\d{1,2})\s*(am|pm)\b|\bat\s+(\d{1,2})\b(?![:\d])/g;
    while ((m = clockRe.exec(t))) {
      let h, min = 0, ap;
      if (m[1]) { h = +m[1]; min = +m[2]; ap = m[3]; } else if (m[4]) { h = +m[4]; ap = m[5]; } else { h = +m[6]; }
      if (h > 23) continue;
      if (ap === "pm" && h < 12) h += 12; else if (ap === "am" && h === 12) h = 0; else if (!ap && h >= 1 && h <= 7) h += 12;
      extras.push({ type: "clock", pos: m.index, end: m.index + m[0].length, value: [h, min] });
    }

    // attach each part/clock to the nearest day word (within 30 chars), else to the reference day
    const standalone = [];
    extras.forEach((x) => {
      let best = null, bestDist = 31;
      days.forEach((d) => {
        const dist = x.pos >= d.end ? x.pos - d.end : d.pos - x.end;
        if (dist >= 0 && dist < bestDist) { best = d; bestDist = dist; }
      });
      if (best) { if (x.type === "clock") best.clock = x.value; else best.parts.push(x.value); best.pos = Math.min(best.pos, x.pos); best.end = Math.max(best.end, x.end); }
      else standalone.push(x);
    });

    days.forEach((d) => {
      let due, hasClock = false;
      if (d.clock) { due = d.due + d.clock[0] * U.HOUR + d.clock[1] * U.MIN; hasClock = true; }
      else if (d.word === "this week") due = U.atTime(d.due, 18, 0);
      else {
        const order = ["first thing", "end of day", "eod", "morning", "afternoon", "evening", "tonight"];
        const part = order.find((p) => d.parts.includes(p));
        const hm = part ? PART_HOURS[part] : [18, 0];
        due = U.atTime(d.due, hm[0], hm[1]);
      }
      mentions.push({ pos: d.pos, end: d.end, due, kind: "point", hasClock });
    });
    standalone.forEach((x) => {
      const hm = x.type === "clock" ? x.value : PART_HOURS[x.value];
      mentions.push({ pos: x.pos, end: x.end, due: U.atTime(ref, hm[0], hm[1]), kind: "point", hasClock: x.type === "clock" });
    });

    mentions.sort((a, b) => a.pos - b.pos);
    mentions.forEach((mm) => { mm.phrase = orig.slice(mm.pos, mm.end).trim(); });
    // when several dates appear ("I said Wednesday, but realistically Thursday morning"),
    // the explicit clock time wins; otherwise the LAST non-negated mention wins.
    const clocked = mentions.filter((x) => x.hasClock);
    const chosen = clocked.length ? clocked[clocked.length - 1] : mentions[mentions.length - 1] || null;
    return { mentions, chosen };
  }

  EPA.temporal = { resolve };
})(typeof window !== "undefined" ? (window.EPA = window.EPA || {}) : (globalThis.EPA = globalThis.EPA || {}));
