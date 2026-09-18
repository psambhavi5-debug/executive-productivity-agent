/*
 * Calendar cross-check — compares (1) times agreed in email/voice/meetings and
 * (2) other people's calendar entries that name the user, against the user's own
 * calendar. Produces conflicts (double-booked) and mismatches (missing entries).
 */
(function (EPA) {
  const U = EPA.util;
  const DEFAULT_LEN = 30 * U.MIN;

  function calendarCheck(ctx, ex, appointments, asOf) {
    const user = ctx.user;
    const me = ctx.people[user];
    const mine = ctx.events.filter((e) => e.owner === user);
    const overlaps = (a0, a1) => mine.filter((e) => e.at < a1 && e.end > a0);
    const issues = [];

    appointments.forEach((ap) => {
      const end = ap.at + DEFAULT_LEN;
      const topicToks = ex.topicById[ap.topic].tokens;
      const names = ap.participants.filter((p) => p !== user).map((p) => ctx.people[p].first.toLowerCase());
      const ov = overlaps(ap.at, end);
      const match = ov.find((e) => U.tokens(e.title).some((w) => topicToks.has(w)) || names.some((n) => e.title.toLowerCase().includes(n)));
      const others = ctx.events.filter((e) => e.owner !== user && ap.participants.includes(e.owner) && e.at < end && e.end > ap.at);
      ap.othersCalendar = others.map((e) => e.id);
      if (match) { ap.onCalendar = match.id; return; }
      ap.onCalendar = null;
      const who = ap.participants.filter((p) => p !== user).map((p) => ctx.people[p].first).join(", ");
      if (ov.length) {
        ap.clash = ov[0].id;
        issues.push({
          type: "conflict", at: ap.at, key: `${ap.at}`,
          title: `${ap.topicLabel} with ${who} at ${U.fmtTime(ap.at)} clashes with "${ov[0].title}"`,
          detail: `${who} set ${U.fmtDayTime(ap.at)} for "${ap.topicLabel}". It is not on your calendar, and you are already booked for "${ov[0].title}" (${U.fmtTime(ov[0].at)}–${U.fmtTime(ov[0].end)}). Decide which one moves and tell the other side.`,
          sources: U.uniq([...ap.sources, ...ap.othersCalendar, ov[0].id])
        });
      } else {
        issues.push({
          type: "missing", at: ap.at, key: `${ap.at}`,
          title: `${ap.topicLabel}: ${U.fmtDayTime(ap.at)} agreed with ${who} but not on your calendar`,
          detail: `The time was agreed by email/voice but there is no matching entry on your calendar.`,
          sources: U.uniq([...ap.sources, ...ap.othersCalendar])
        });
      }
    });

    // other people's entries that name the user ("Quick Call with Arjun")
    ctx.events.filter((e) => e.owner !== user && e.title.toLowerCase().includes(me.first.toLowerCase())).forEach((e) => {
      const ownerFirst = ctx.people[e.owner].first;
      const ov = overlaps(e.at, e.end);
      const ok = ov.find((x) => x.title.toLowerCase().includes(ownerFirst.toLowerCase()) || x.title === e.title);
      if (ok) return;
      const existing = issues.find((i) => i.key === `${e.at}`);
      if (existing) { if (!existing.sources.includes(e.id)) existing.sources.push(e.id); existing.detail += ` ${ownerFirst}'s calendar also shows "${e.title}".`; return; }
      if (ov.length) {
        issues.push({ type: "conflict", at: e.at, key: `${e.at}`, title: `"${e.title}" on ${ownerFirst}'s calendar clashes with your "${ov[0].title}"`, detail: `${ownerFirst} has you booked ${U.fmtDayTime(e.at)}, but your calendar shows "${ov[0].title}".`, sources: [e.id, ov[0].id] });
      } else {
        issues.push({ type: "missing", at: e.at, key: `${e.at}`, title: `"${e.title}" (${U.fmtDayTime(e.at)}) is on ${ownerFirst}'s calendar but not yours`, detail: `${ownerFirst} expects you at ${U.fmtDayTime(e.at)}–${U.fmtTime(e.end)}; your calendar is free then. Add it or tell ${ownerFirst}.`, sources: [e.id] });
      }
    });

    issues.forEach((i) => { i.past = i.at + DEFAULT_LEN < asOf; });
    return { issues: issues.sort((a, b) => a.at - b.at) };
  }

  EPA.calendarCheck = calendarCheck;
})(typeof window !== "undefined" ? (window.EPA = window.EPA || {}) : (globalThis.EPA = globalThis.EPA || {}));
