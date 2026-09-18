/*
 * Stage 4 — BRIEF
 * Turns the commitment register + calendar check into (a) risk flags and
 * (b) the daily action brief for the chosen day.
 */
(function (EPA) {
  const U = EPA.util;

  function whenText(it, asOf) {
    if (!it.due) return "no deadline stated";
    const d = it.due - asOf;
    return d < 0 ? `was due ${U.fmtDayTime(it.due)} (${U.fmtDelta(d)} ago)` : `due ${U.fmtDayTime(it.due)} (in ${U.fmtDelta(d)})`;
  }

  function buildFlags(run) {
    const { items, calendar, asOf, ctx } = run;
    const P = ctx.people;
    const f = (p) => (P[p] ? P[p].first : p);
    const flags = [];

    items.filter((it) => it.direction === "unowned" && !it.done).forEach((it) => {
      const dis = U.uniq(it.disclaimers.map((d) => d.who));
      const cand = U.uniq(it.candidates.map((c) => c.who));
      const parts = [];
      if (dis.length) parts.push(`disclaimed by ${dis.map((d) => (d === ctx.user ? "you" : f(d))).join(" and ")}`);
      if (cand.length) parts.push(`${cand.map(f).join(", ")} was suggested (by ${U.uniq(it.candidates.map((c) => f(c.by))).join(", ")}) but never confirmed or claimed it`);
      if (it.chasers.length) parts.push(`chased ${it.chasers.length}× (${U.uniq(it.chasers.map((c) => f(c.by))).join(", ")})`);
      if (it.notices.length) parts.push(`${U.uniq(it.notices).length} deadline notice(s) sent`);
      flags.push({
        type: "unowned", severity: it.due && it.due - asOf < 2 * U.DAY ? "high" : "medium", itemId: it.id, at: it.due,
        title: `No owner: ${it.title}`,
        detail: `${U.cap(whenText(it, asOf))}. ${U.cap(parts.join("; "))}. The agent will not assign an owner — someone must explicitly take it.`,
        sources: it.evidence
      });
    });

    calendar.issues.forEach((i) => {
      flags.push({ type: i.type === "conflict" ? "calendar-conflict" : "calendar-missing", severity: i.past ? "low" : i.type === "conflict" ? "high" : "medium", at: i.at, past: i.past, title: i.title, detail: i.detail, sources: i.sources });
    });

    items.forEach((it) => {
      if (it.atRisk && !it.done) flags.push({ type: "at-risk", severity: "high", itemId: it.id, at: it.due, title: `At risk: ${it.title} (${f(it.owner)})`, detail: `The ${it.atRisk.reason}.`, sources: it.evidence });
      if (it.stale.length) {
        const s = it.stale[it.stale.length - 1];
        flags.push({ type: "stale-reminder", severity: "low", itemId: it.id, at: s.at, title: `Already done: ${it.title}`, detail: `A later note (${s.recordId}, ${U.fmtDayTime(s.at)}) still treats this as open, but it was completed ${U.fmtDayTime(it.done.at)} (${it.done.how}, ${it.done.recordId}). No action needed — de-duplicated.`, sources: [s.recordId, it.done.recordId] });
      }
      if (!it.done && it.slips >= 2) flags.push({ type: "deadline-drift", severity: "medium", itemId: it.id, at: it.due, title: `Slipping: ${it.title}`, detail: `The date has changed ${it.slips} times by ${it.owner === ctx.user ? "you" : f(it.owner)}: ${it.deadlines.filter((d) => d.by === it.owner && d.type !== "self-note").map((d) => U.fmtDayTime(d.due)).join(" → ")}.`, sources: it.evidence });
      if (!it.done && it.conflictingStatements && it.slips < 2) flags.push({ type: "mixed-signals", severity: "low", itemId: it.id, at: it.due, title: `Mixed signals on date: ${it.title}`, detail: `Sources disagree: ${it.deadlines.map((d) => `${f(d.by)} said "${d.phrase}" (${d.recordId})`).join("; ")}. Current best reading: ${U.fmtDayTime(it.due)}.`, sources: it.evidence });
      if (it.replyPending && !it.done) flags.push({ type: "reply-pending", severity: "medium", itemId: it.id, at: it.replyPending.at, title: `${f(it.replyPending.from)} is waiting for your reply (${it.topicLabel})`, detail: `"${it.replyPending.question}" — sent ${U.fmtDayTime(it.replyPending.at)}, no reply from you in the thread yet.`, sources: [it.replyPending.recordId] });
    });

    const rank = { high: 0, medium: 1, low: 2 };
    return flags.sort((a, b) => (a.past ? 1 : 0) - (b.past ? 1 : 0) || rank[a.severity] - rank[b.severity] || (a.at || 0) - (b.at || 0));
  }

  function describe(it, run) {
    const { asOf, ctx } = run;
    const f = (p) => (ctx.people[p] ? ctx.people[p].first : p);
    const bits = [whenText(it, asOf)];
    if (it.slips) bits.push(`date changed ${it.slips}×`);
    if (it.chasers.length && !it.done) bits.push(`${f(it.chasers[it.chasers.length - 1].by)} chased ${U.fmtDayTime(it.chasers[it.chasers.length - 1].at)}`);
    if (it.replyPending) bits.push(`reply owed to ${f(it.replyPending.from)}`);
    if (it.derivedFrom && it.kind === "review") { const src = run.items.find((x) => x.id === it.derivedFrom); if (src && src.done) bits.push(`received ${U.fmtDayTime(src.done.at)}`); }
    if (it.kind === "review" && !it.derivedFrom) { const del = run.items.find((x) => x.topic === it.topic && x.kind === "deliverable" && x.owner !== it.owner); if (del && del.done) bits.push(`${f(del.owner)} delivered it ${U.fmtDayTime(del.done.at)}`); else if (del) bits.push(`waiting on ${f(del.owner)} to deliver`); }
    return bits.join(" · ");
  }

  function buildBrief(run) {
    const { items, flags, asOf, ctx } = run;
    const open = items.filter((it) => !it.done);
    const byDue = (a, b) => (a.due || Infinity) - (b.due || Infinity);
    const mine = open.filter((it) => it.direction === "mine").sort(byDue);
    const waiting = open.filter((it) => it.direction === "waiting").sort(byDue);
    const unowned = open.filter((it) => it.direction === "unowned").sort(byDue);
    const closed = items.filter((it) => it.done).sort((a, b) => b.done.at - a.done.at);

    // priorities
    const cands = [];
    mine.forEach((it) => {
      let score = 0;
      if (it.status === "overdue") score = 100;
      else if (it.status === "due-today") score = 85 - Math.min(20, (it.due - asOf) / U.HOUR);
      else if (it.replyPending || it.kind === "decision") score = 70;
      else if (it.status === "due-soon") score = 60;
      else if (it.status === "lapsed") score = 30;
      else score = 20;
      cands.push({ score, text: it.title, why: describe(it, run), itemId: it.id, sources: it.evidence });
    });
    unowned.forEach((it) => cands.push({ score: it.due && it.due - asOf < 2 * U.DAY ? 95 : 65, text: `Get an owner for: ${it.title}`, why: `nobody owns it · ${whenText(it, asOf)}`, itemId: it.id, sources: it.evidence }));
    flags.filter((fl) => fl.type === "calendar-conflict" && !fl.past).forEach((fl) => cands.push({ score: U.sameDay(fl.at, asOf) ? 90 : 55, text: `Resolve clash: ${fl.title}`, why: fl.detail, sources: fl.sources }));
    flags.filter((fl) => fl.type === "at-risk").forEach((fl) => cands.push({ score: 55, text: fl.title, why: fl.detail, itemId: fl.itemId, sources: fl.sources }));
    waiting.filter((it) => it.status === "overdue").forEach((it) => cands.push({ score: 50, text: `Chase ${ctx.people[it.owner].first}: ${it.title}`, why: describe(it, run), itemId: it.id, sources: it.evidence }));
    const priorities = cands.filter((c) => c.score >= 50).sort((a, b) => b.score - a.score).slice(0, 5);

    // today's schedule, annotated
    const myEvents = ctx.events.filter((e) => e.owner === ctx.user && U.sameDay(e.at, asOf));
    const schedule = myEvents.map((e) => ({ at: e.at, end: e.end, title: e.title, id: e.id, onCalendar: true, notes: [] }));
    run.appointments.filter((ap) => U.sameDay(ap.at, asOf) && !ap.onCalendar).forEach((ap) => {
      const names = ap.participants.filter((p) => p !== ctx.user).map((p) => ctx.people[p].first).join(", ");
      schedule.push({ at: ap.at, end: ap.at + 30 * U.MIN, title: `${ap.topicLabel} with ${names}`, id: ap.sources[ap.sources.length - 1], onCalendar: false, notes: ["Agreed by email — NOT on your calendar"] });
    });
    ctx.events.filter((e) => e.owner !== ctx.user && U.sameDay(e.at, asOf) && e.title.toLowerCase().includes(ctx.people[ctx.user].first.toLowerCase()))
      .forEach((e) => { if (!schedule.some((s) => s.at === e.at)) schedule.push({ at: e.at, end: e.end, title: `${e.title} (${ctx.people[e.owner].first}'s calendar)`, id: e.id, onCalendar: false, notes: ["On their calendar, not yours"] }); });
    schedule.sort((a, b) => a.at - b.at);
    schedule.forEach((s) => {
      s.past = s.end <= asOf;
      schedule.forEach((o) => { if (o !== s && o.at < s.end && o.end > s.at) s.notes.push(`Overlaps "${o.title}"`); });
      items.filter((it) => !it.done && it.neededBy && it.neededBy.due === s.at).forEach((it) => s.notes.push(`Prep: ${it.title} (${it.owner === ctx.user ? "you" : ctx.people[it.owner].first})`));
      items.filter((it) => !it.done && it.direction === "unowned" && /facilit/i.test(s.title) && /mumbai|lease|office/i.test(it.title)).forEach((it) => s.notes.push(`Opportunity: raise "${it.title}" — still no owner`));
    });

    const dueToday = mine.filter((it) => it.status === "due-today").length;
    const overdue = mine.filter((it) => it.status === "overdue").length;
    const headline = [
      overdue ? `${overdue} overdue` : null,
      dueToday ? `${dueToday} due today` : null,
      unowned.length ? `${unowned.length} without an owner` : null,
      flags.filter((fl) => fl.type === "calendar-conflict" && !fl.past).length ? `${flags.filter((fl) => fl.type === "calendar-conflict" && !fl.past).length} calendar clash` : null,
      waiting.length ? `waiting on ${waiting.length}` : null
    ].filter(Boolean).join(" · ") || "Nothing urgent";

    return { asOf, dayLabel: U.fmtDay(asOf), headline, priorities, schedule, mine, waiting, unowned, closed, flags: flags.filter((fl) => !fl.past), pastFlags: flags.filter((fl) => fl.past), counts: { overdue, dueToday, mine: mine.length, waiting: waiting.length, unowned: unowned.length, closed: closed.length } };
  }

  EPA.brief = { buildFlags, buildBrief, describe, whenText };
})(typeof window !== "undefined" ? (window.EPA = window.EPA || {}) : (globalThis.EPA = globalThis.EPA || {}));
