/*
 * Offline question answering — a transparent intent router over the commitment
 * register (no LLM needed). Every answer cites source ids like [T1.E4].
 * The optional Claude agent (src/llm) handles free-form questions with tools.
 */
(function (EPA) {
  const U = () => EPA.util;

  function detectPeople(q, ctx) {
    const low = q.toLowerCase();
    return Object.values(ctx.people).filter((p) => p.id !== ctx.user && [p.first.toLowerCase(), ...(p.aliases || [])].some((n) => new RegExp(`\\b${n}`).test(low))).map((p) => p.id);
  }
  function detectTopic(q, run) {
    const toks = U().tokens(q);
    let best = null, score = 0;
    run.ex.topics.forEach((t) => { const s = toks.filter((w) => t.tokens.has(w)).length; if (s > score) { score = s; best = t.id; } });
    const extra = { lease: "T5", mumbai: "T5", signature: "T5", deck: "T2", campaign: "T2", vendor: "T1", expense: "T4", variance: "T4", meridian: "T3" };
    if (!best) toks.forEach((w) => { if (extra[w]) best = extra[w]; });
    return best;
  }
  function detectDay(q, asOf) {
    const u = U(); const low = q.toLowerCase();
    if (/\btomorrow\b/.test(low)) return u.startOfDay(asOf) + u.DAY;
    if (/\byesterday\b/.test(low)) return u.startOfDay(asOf) - u.DAY;
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const i = days.findIndex((d) => low.includes(d));
    if (i >= 0) { let d = u.startOfDay(asOf) - u.weekday(asOf) * u.DAY + i * u.DAY; return d; }
    return u.startOfDay(asOf);
  }

  const cite = (ids) => (ids && ids.length ? " [" + U().uniq(ids).join(", ") + "]" : "");
  const STATUS = { overdue: "OVERDUE", "due-today": "due today", "due-soon": "due soon", open: "open", done: "done", lapsed: "time passed", unowned: "NO OWNER", "unowned-overdue": "NO OWNER · past deadline" };

  function line(it, run) {
    return `• ${it.title} — ${STATUS[it.status] || it.status}; ${it.done ? `completed ${U().fmtDayTime(it.done.at)} (${it.done.how})` : EPA.brief.describe(it, run)}${cite(it.evidence)}`;
  }

  function answer(question, run) {
    const u = U();
    const q = question.trim();
    const low = q.toLowerCase();
    const P = run.ctx.people;
    const me = run.ctx.user;
    const people = detectPeople(q, run.ctx);
    const topic = detectTopic(q, run);
    const items = run.items;
    const out = { intent: null, text: "", items: [], sources: [] };
    const pushItems = (arr) => arr.forEach((it) => { out.items.push(it.id); out.sources.push(...it.evidence); });

    const iPromise = /\b(i|me)\b[^?]*\b(promis|owe|commit|told|said i'?d)|\bmy (promise|commitment)s?\b/.test(low) && !/\b(promise|owe)[a-z]* me\b/.test(low);
    const theyPromise = /\b(promis|owe|commit)[a-z]* me\b|\bwaiting (on|for)\b|\bexpect(ing)? from\b|\bowe me\b/.test(low);

    // 1. promises between the user and a named person
    if (people.length && (iPromise || theyPromise || /\bpromis|\bowe|\bcommit/.test(low))) {
      const p = people[0];
      out.intent = iPromise || !theyPromise ? "promised-to" : "promised-by";
      if (out.intent === "promised-to") {
        const mine = items.filter((it) => it.owner === me && it.beneficiary === p);
        const asks = items.filter((it) => it.owner === me && it.beneficiary === p && it.kind === "decision");
        const lines = mine.map((it) => line(it, run));
        out.text = mine.length
          ? `You have ${mine.length} commitment${mine.length > 1 ? "s" : ""} to ${P[p].first}:\n${lines.join("\n")}`
          : `I found no commitment from you to ${P[p].first} in the sources up to ${u.fmtDayTime(run.asOf)}.`;
        const theirs = items.filter((it) => it.owner === p && it.beneficiary === me);
        if (theirs.length) out.text += `\n\nFor context, ${P[p].first} owes you:\n${theirs.map((it) => line(it, run)).join("\n")}`;
        pushItems(mine.concat(asks));
      } else {
        const theirs = items.filter((it) => it.owner === p);
        out.text = theirs.length ? `${P[p].first} committed to:\n${theirs.map((it) => line(it, run)).join("\n")}` : `I found no commitment by ${P[p].first} in the sources up to ${u.fmtDayTime(run.asOf)}.`;
        pushItems(theirs);
      }
      return finish(out);
    }

    // 2. ownership questions
    if (/\bown(s|er|ers|ership)?\b|\bunowned\b|who('?s| is) (handling|responsible|signing)|\bnobody\b|\bno one\b|\bunassigned\b/.test(low)) {
      out.intent = "ownership";
      const un = items.filter((it) => it.direction === "unowned" && (!topic || it.topic === topic));
      if (!un.length) out.text = "Every tracked item currently has a named owner.";
      else out.text = un.map((it) => {
        const fl = run.flags.find((f) => f.itemId === it.id && f.type === "unowned");
        return `• ${it.title} — ${fl ? fl.detail : EPA.brief.whenText(it, run.asOf)}${cite(it.evidence)}`;
      }).join("\n") + "\n\nI have not assigned an owner because no source confirms one.";
      pushItems(un);
      return finish(out);
    }

    // 3. waiting on others
    if (/\bwaiting\b|\bowed to me\b|\bothers\b|\bdelegat/.test(low)) {
      out.intent = "waiting";
      const w = items.filter((it) => it.direction === "waiting" && (!people.length || people.includes(it.owner)));
      const open = w.filter((it) => !it.done), done = w.filter((it) => it.done);
      out.text = (open.length ? `Still waiting on:\n${open.map((it) => `${line(it, run)} (owner: ${P[it.owner].first})`).join("\n")}` : "Nothing outstanding from others right now.") +
        (done.length ? `\n\nAlready received:\n${done.map((it) => `${line(it, run)} (from ${P[it.owner].first})`).join("\n")}` : "");
      pushItems(w);
      return finish(out);
    }

    // 4. overdue / slipping
    if (/\boverdue\b|\blate\b|\bmissed\b|\bslipp|\bbehind\b/.test(low)) {
      out.intent = "overdue";
      const od = items.filter((it) => it.status === "overdue" || (it.slips >= 2 && !it.done));
      out.text = od.length ? `Overdue or slipping:\n${od.map((it) => line(it, run)).join("\n")}` : "Nothing is overdue as of " + u.fmtDayTime(run.asOf) + ".";
      pushItems(od);
      return finish(out);
    }

    // 5. calendar / conflicts / schedule for a day
    if (/\bconflict|\bclash|\bdouble|\bcalendar\b|\bschedule\b|\bmeetings?\b|\bagenda\b/.test(low)) {
      out.intent = "calendar";
      const day = detectDay(q, run.asOf);
      const evs = run.ctx.events.filter((e) => e.owner === me && u.sameDay(e.at, day));
      const issues = run.calendar.issues.filter((i) => /conflict|clash|double/.test(low) ? !i.past : u.sameDay(i.at, day));
      out.text = `${u.fmtDay(day)} on your calendar:\n` + (evs.length ? evs.map((e) => `• ${u.fmtTime(e.at)}–${u.fmtTime(e.end)} ${e.title} [${e.id}]`).join("\n") : "• (nothing booked)");
      if (issues.length) out.text += `\n\nCalendar issues:\n${issues.map((i) => `• ${i.title}${cite(i.sources)}`).join("\n")}`;
      out.sources.push(...evs.map((e) => e.id), ...issues.flatMap((i) => i.sources));
      return finish(out);
    }

    // 6. what needs action today / priorities
    if (/\btoday\b|\baction\b|\bto ?do\b|\bpriorit|\bfocus\b|\burgent\b|\bbrief\b|\bnext\b|\bwhat should i\b/.test(low)) {
      out.intent = "today";
      const b = run.brief;
      const parts = [`${b.dayLabel}: ${b.headline}.`];
      if (b.priorities.length) parts.push("Do first:\n" + b.priorities.map((p, i) => `${i + 1}. ${p.text} — ${p.why}${cite(p.sources)}`).join("\n"));
      const meetings = b.schedule.filter((s) => !s.past && s.title !== "Blocked");
      if (meetings.length) parts.push("Still on today's calendar:\n" + meetings.map((s) => `• ${u.fmtTime(s.at)} ${s.title}${s.notes.length ? " — " + s.notes.join("; ") : ""} [${s.id}]`).join("\n"));
      const wt = b.waiting.filter((it) => it.status === "overdue" || it.status === "due-today");
      if (wt.length) parts.push("Due to you from others today:\n" + wt.map((it) => `${line(it, run)} (owner: ${P[it.owner].first})`).join("\n"));
      out.text = parts.join("\n\n");
      b.priorities.forEach((p) => out.sources.push(...(p.sources || [])));
      return finish(out);
    }

    // 7. status of a topic ("where are we on the Mumbai lease?")
    if (topic || people.length) {
      out.intent = "status";
      const rel = items.filter((it) => (topic ? it.topic === topic : true) && (!people.length || people.includes(it.owner) || people.includes(it.beneficiary)));
      const label = topic ? run.ex.topicById[topic].label : P[people[0]].first;
      out.text = rel.length ? `${label}:\n${rel.map((it) => line(it, run)).join("\n")}` : `Nothing tracked about ${label} up to ${u.fmtDayTime(run.asOf)}.`;
      const aps = run.appointments.filter((a) => !topic || a.topic === topic);
      const apLine = (a) => {
        const who = a.participants.filter((x) => x !== me).map((x) => P[x].first).join(", ");
        const conf = a.confirmedBy.length ? `confirmed by ${a.confirmedBy.map((x) => (x === me ? "you" : P[x].first)).join(" and ")}` : "not confirmed by you";
        return `• ${u.fmtDayTime(a.at)} with ${who} — ${a.onCalendar ? "on your calendar" : "NOT on your calendar"}, ${conf}${cite(a.sources)}`;
      };
      if (aps.length) out.text += "\n\nAgreed times:\n" + aps.map(apLine).join("\n");
      const fl = run.flags.filter((f) => rel.some((it) => it.id === f.itemId));
      if (fl.length) out.text += `\n\nFlags:\n${fl.map((f) => `• ${f.title}`).join("\n")}`;
      pushItems(rel);
      return finish(out);
    }

    // 8. fallback: evidence search
    out.intent = "search";
    const qt = u.tokens(q);
    const hits = run.ctx.clauses.filter((c) => c.at <= run.asOf).map((c) => ({ c, s: u.tokens(c.text).filter((w) => qt.includes(w)).length })).filter((h) => h.s > 0).sort((a, b) => b.s - a.s).slice(0, 4);
    out.text = hits.length
      ? `I couldn't map that to a commitment question, but these source lines look relevant:\n${hits.map((h) => `• "${h.c.text}" — ${P[h.c.speaker] ? P[h.c.speaker].first : h.c.speaker}, ${u.fmtDayTime(h.c.at)} [${h.c.recordId}]`).join("\n")}`
      : "I couldn't find anything about that in the sources. Try: \"What did I promise Raghav?\", \"What needs action today?\", \"What am I waiting on?\", \"Who owns the Mumbai lease?\", \"Any calendar conflicts?\"";
    out.sources.push(...hits.map((h) => h.c.recordId));
    return finish(out);
  }

  function finish(out) { out.sources = U().uniq(out.sources); return out; }

  EPA.qa = { answer, detectPeople, detectTopic };
})(typeof window !== "undefined" ? (window.EPA = window.EPA || {}) : (globalThis.EPA = globalThis.EPA || {}));
