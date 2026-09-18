/*
 * Stage 3 — REASON
 * Replays every extracted clause in time order (up to the chosen "as of" moment) and
 * folds them into a de-duplicated commitment register:
 *   key = (topic, owner, kind)  →  one commitment, many pieces of evidence.
 * Then derives status, deadline drift, chasers, stale reminders, unclear ownership,
 * pending replies and calendar conflicts.
 */
(function (EPA) {
  const U = EPA.util;

  const KIND_LABEL = { deliverable: "Deliverable", scheduling: "Scheduling", review: "Review", decision: "Decision", ownership: "Needs owner", reply: "Reply" };

  function reason(ctx, ex, asOf) {
    const user = ctx.user;
    const P = ctx.people;
    const clauses = ctx.clauses.filter((c) => c.at <= asOf);
    const items = [];
    const byKey = {};
    const appts = {};
    let nextId = 1;

    const label = (topicId) => ex.topicById[topicId].label;
    const first = (pid) => (P[pid] ? P[pid].first : pid);

    function getItem(topic, owner, kind, c) {
      const key = `${topic}|${owner || "UNOWNED"}|${kind}`;
      if (!byKey[key]) {
        const it = {
          id: `C${nextId++}`, key, topic, topicLabel: label(topic), owner: owner || null, kind, beneficiary: null,
          title: null, deadlines: [], evidence: [], timeline: [], chasers: [], stale: [], disclaimers: [], candidates: [],
          notices: [], forReview: false, neededBy: null, done: null, proposed: null, replyPending: null, firstSeen: c.at
        };
        byKey[key] = it; items.push(it);
      }
      return byKey[key];
    }
    const openItems = (topic, pred) => items.filter((it) => it.topic === topic && !it.done && pred(it));
    function note(it, c, effect) {
      if (!it.evidence.includes(c.recordId)) it.evidence.push(c.recordId);
      it.timeline.push({ at: c.at, clauseId: c.id, recordId: c.recordId, speaker: c.speaker, sourceType: c.sourceType, text: c.text, effect });
    }
    function addDeadline(it, c, type) {
      if (!c.deadline) return;
      // A private voice note never relaxes a promise already made to someone else.
      if (c.sourceType === "voice" && it.owner === user && it.beneficiary && it.beneficiary !== user && type !== "requested") type = "self-note";
      it.deadlines.push({ at: c.at, due: c.deadline.due, phrase: c.deadline.phrase, by: c.speaker, type, clauseId: c.id, recordId: c.recordId, anchor: c.deadline.anchor || null });
    }
    function setTitle(it, c) {
      if (it.title) return;
      it.title = titleFrom(c, it);
    }
    function titleFrom(c, it) {
      const lbl = it.topicLabel;
      let m = /needs someone to ([a-z ]+?)(?:\s+this week|\s+by|[.,]|$)/i.exec(c.text);
      if (it.kind === "ownership") return m ? `${U.cap(m[1])} — ${lbl}` : `${lbl} — owner needed`;
      if (it.kind === "review") return `Review ${lbl}`;
      m = /(?:\bI'd|\bI'll|\bI will|\bcan you(?: also)?|\bcould you|\bneed to|\bwill)\s+(.+)$/i.exec(c.text);
      if (!m) return null;
      let p = m[1].replace(/\s+(by|before|today|tomorrow|this week|first thing|for sure|instead|myself|ready)\b.*$/i, "").replace(/[?.!,]+$/, "");
      const ben = it.beneficiary && P[it.beneficiary];
      if (ben) p = p.replace(/\b(him|her)\b/, ben.first);
      if (ben && ben.org !== "Veridian") p = p.replace(/\btheir team\b/, `the ${ben.org} team`);
      p = p.replace(/\bthat\s+(?=[a-z]+ [a-z]+)/, "the ").replace(/\bit\b/, `the ${lbl}`);
      return U.cap(p);
    }
    function beneficiaryFor(c, prevC) {
      return c.mentions[0] || c.addressees.find((a) => a !== c.speaker) || (prevC && prevC.recordGroup === c.recordGroup ? prevC.mentions[0] : null) || null;
    }

    let prevC = null;
    clauses.forEach((c) => {
      if (!c.topic) { prevC = c; return; }
      const acts = new Set(c.acts);
      const s = c.speaker;
      const A = c.addressees;
      const sIsList = P[s] && P[s].isList;

      // (a) ownership doubt / org-wide notices → an UNOWNED commitment, never a guessed owner
      const ownershipOpen = byKey[`${c.topic}|UNOWNED|ownership`];
      if (acts.has("OWNERSHIP_UNCLEAR") || (acts.has("NOTICE") && (sIsList || ownershipOpen))) {
        const it = getItem(c.topic, null, "ownership", c);
        setTitle(it, c);
        addDeadline(it, c, acts.has("NOTICE") ? "notice" : "stated");
        if (acts.has("DISCLAIM")) it.disclaimers.push({ who: s, clauseId: c.id, recordId: c.recordId });
        if (c.suggestedOwner) it.candidates.push({ who: c.suggestedOwner, by: s, clauseId: c.id, recordId: c.recordId });
        if (acts.has("NOTICE")) it.notices.push(c.recordId);
        if (acts.has("FOLLOWUP")) it.chasers.push({ by: s, at: c.at, recordId: c.recordId });
        const effect = acts.has("DISCLAIM") ? `${first(s)} says it is not theirs` : c.suggestedOwner ? `${first(s)} suggests ${first(c.suggestedOwner)} (unconfirmed)` : acts.has("NOTICE") ? "deadline notice" : "ownership unclear";
        note(it, c, effect);
        if (acts.has("REQUEST") && A.includes(user)) {
          const d = getItem(c.topic, user, "decision", c);
          d.beneficiary = d.beneficiary || s;
          setTitle(d, c);
          d.linkedTo = it.id;
          note(d, c, `${first(s)} asks you directly`);
        }
        prevC = c; return;
      }

      // (b) delivery
      if (acts.has("DELIVER")) {
        let it = openItems(c.topic, (x) => x.owner === s && x.kind === "deliverable")[0];
        if (!it) { it = getItem(c.topic, s, "deliverable", c); it.beneficiary = A[0] || null; it.title = `Deliver ${it.topicLabel}`; }
        it.done = { at: c.at, clauseId: c.id, recordId: c.recordId, how: "delivered" };
        note(it, c, "delivered");
        if (it.forReview && it.beneficiary) {
          const rv = getItem(c.topic, it.beneficiary, "review", c);
          setTitle(rv, c);
          rv.beneficiary = s;
          if (c.deadline && c.deadline.hasClock) addDeadline(rv, c, "agreed");
          else if (effectiveDue(it)) rv.deadlines.push(Object.assign({}, lastDeadline(it), { type: "inherited" }));
          rv.derivedFrom = it.id;
          note(rv, c, `received from ${first(s)} — your review is now due`);
        }
      }

      // (c) chasers
      if (acts.has("FOLLOWUP")) {
        openItems(c.topic, (x) => x.beneficiary === s && x.owner && x.owner !== s).forEach((it) => { it.chasers.push({ by: s, at: c.at, recordId: c.recordId }); note(it, c, `${first(s)} follows up`); });
      }

      // (d) explicit intent to review something
      if (acts.has("REVIEW_INTENT")) {
        const rv = getItem(c.topic, s, "review", c);
        setTitle(rv, c);
        addDeadline(rv, c, rv.deadlines.length ? "restated" : "promised");
        if (c.deadline && c.deadline.kind === "anchor") rv.neededBy = { due: c.deadline.due, label: c.deadline.anchor, recordId: c.recordId };
        note(rv, c, "you want time to review it");
      }

      // (e) request: the addressee becomes the owner, the speaker the beneficiary
      if (acts.has("REQUEST")) {
        let owners = A.filter((a) => a !== s);
        if (!owners.length) owners = c.mentions.filter((m) => m !== s && !(P[m] && P[m].isList));
        owners.forEach((o) => {
          const it = getItem(c.topic, o, acts.has("SCHEDULING") ? "scheduling" : "deliverable", c);
          it.beneficiary = it.beneficiary || s;
          setTitle(it, c);
          if (it.done) { it.stale.push({ clauseId: c.id, recordId: c.recordId, at: c.at }); note(it, c, "asked again after it was already done"); return; }
          addDeadline(it, c, "requested");
          if (c.deadline && c.deadline.kind === "anchor") it.neededBy = { due: c.deadline.due, label: c.deadline.anchor, recordId: c.recordId };
          note(it, c, `${first(s)} asks ${first(o)}`);
        });
      }

      // (f) commitment by the speaker
      if (acts.has("COMMIT")) {
        const it = getItem(c.topic, s, acts.has("SCHEDULING") ? "scheduling" : "deliverable", c);
        if (!it.beneficiary) it.beneficiary = beneficiaryFor(c, prevC);
        setTitle(it, c);
        if (acts.has("FOR_REVIEW")) it.forReview = true;
        if (it.done && c.at > it.done.at) {
          it.stale.push({ clauseId: c.id, recordId: c.recordId, at: c.at });
          note(it, c, "restated after it was already completed (stale reminder)");
        } else {
          addDeadline(it, c, acts.has("REVISE") ? "revised" : acts.has("ACCEPT") ? "agreed" : it.deadlines.length ? "restated" : "promised");
          note(it, c, acts.has("REVISE") ? "deadline revised" : acts.has("ACCEPT") ? "agrees" : "commits");
        }
      }

      // (g) acceptance without an explicit "I'll"
      if (acts.has("ACCEPT") && !acts.has("COMMIT")) {
        openItems(c.topic, (x) => x.owner === s && x.kind !== "ownership").forEach((it) => { if (c.deadline) { addDeadline(it, c, "agreed"); note(it, c, "agrees"); } });
        openItems(c.topic, (x) => x.beneficiary === s && x.owner !== s).forEach((it) => {
          if (it.kind === "scheduling" && it.proposed) {
            it.done = { at: c.at, clauseId: c.id, recordId: c.recordId, how: `time confirmed by ${first(s)}` };
            note(it, c, `${first(s)} confirms the proposed time — done`);
          } else if (c.deadline) { addDeadline(it, c, "agreed"); note(it, c, `${first(s)} agrees to the new date`); }
        });
      }

      // (h) revision without an explicit "I'll"
      if (acts.has("REVISE") && !acts.has("COMMIT") && !acts.has("REQUEST") && c.deadline) {
        openItems(c.topic, (x) => x.owner === s && x.kind === "deliverable").forEach((it) => { addDeadline(it, c, "revised"); note(it, c, "deadline revised"); });
      }

      // (i) proposals of a concrete time
      if (acts.has("PROPOSE") && c.deadline) {
        openItems(c.topic, (x) => x.owner === s && x.kind === "scheduling").forEach((it) => { it.proposed = { due: c.deadline.due, recordId: c.recordId }; note(it, c, `proposes ${U.fmtDayTime(c.deadline.due)}`); });
        openItems(c.topic, (x) => x.owner === s && x.kind === "deliverable").forEach((it) => { addDeadline(it, c, "agreed"); note(it, c, `sets the time: ${U.fmtDayTime(c.deadline.due)}`); });
      }

      // (j) appointments with the user that carry a concrete clock time
      if (c.deadline && c.deadline.hasClock && (s === user || A.includes(user)) &&
        (acts.has("PROPOSE") || acts.has("ACCEPT") || acts.has("FOLLOWUP") || acts.has("DELIVER") || /\b(review|call|meeting|see you)\b/i.test(c.text))) {
        const key = `${c.topic}|${c.deadline.due}`;
        const ap = appts[key] || (appts[key] = { key, topic: c.topic, topicLabel: label(c.topic), at: c.deadline.due, proposer: s, participants: [], confirmedBy: [], sources: [] });
        U.uniq([s, ...A]).forEach((p) => { if (!ap.participants.includes(p)) ap.participants.push(p); });
        if (acts.has("ACCEPT") && !ap.confirmedBy.includes(s)) ap.confirmedBy.push(s);
        if (!ap.sources.includes(c.recordId)) ap.sources.push(c.recordId);
      }
      prevC = c;
    });

    // ---- pending replies: last message in a thread is a question addressed only to the user
    const byThread = {};
    clauses.filter((c) => c.threadId).forEach((c) => { (byThread[c.threadId] = byThread[c.threadId] || []).push(c); });
    Object.keys(byThread).forEach((tid) => {
      const cl = byThread[tid];
      const lastRec = cl[cl.length - 1].recordId;
      const msg = cl.filter((c) => c.recordId === lastRec);
      const m0 = msg[0];
      if (m0.speaker === user || m0.to.length !== 1 || m0.to[0] !== user || !msg.some((c) => c.isQuestion)) return;
      const q = msg.filter((c) => c.isQuestion).map((c) => c.text).join(" ");
      const pending = { from: m0.speaker, at: m0.at, recordId: m0.recordId, question: q };
      const target = items.find((it) => it.topic === tid && it.owner === user && !it.done && it.beneficiary === m0.speaker);
      if (target) target.replyPending = pending;
      else {
        const it = getItem(tid, user, "reply", m0);
        it.beneficiary = m0.speaker; it.title = `Reply to ${first(m0.speaker)}: "${q}"`; it.replyPending = pending;
        note(it, msg[msg.length - 1], "unanswered question to you");
      }
    });

    // ---- derived fields
    items.forEach((it) => {
      if (!it.title) it.title = `${KIND_LABEL[it.kind]} — ${it.topicLabel}`;
      it.direction = it.owner === user ? "mine" : it.owner ? "waiting" : "unowned";
      if (it.kind === "decision" && it.linkedTo) {
        const own = items.find((x) => x.id === it.linkedTo);
        if (own && !it.deadlines.length && lastDeadline(own)) it.deadlines.push(Object.assign({}, lastDeadline(own), { type: "inherited" }));
      }
      it.due = effectiveDue(it);
      it.dueEntry = lastDeadline(it);
      it.slips = countSlips(it);
      const said = it.deadlines.filter((d) => d.type !== "requested" && d.type !== "inherited" && d.type !== "self-note");
      it.conflictingStatements = distinctDues(it) > 2 && said.length >= 2 && said[said.length - 1].due !== said[said.length - 2].due;
      if (it.neededBy && it.due && !it.done && it.due > it.neededBy.due) it.atRisk = { reason: `current target (${U.fmtDayTime(it.due)}) is after it is needed (${it.neededBy.label}, ${U.fmtDayTime(it.neededBy.due)})` };
      it.status = statusOf(it, asOf);
    });

    const appointments = Object.values(appts).sort((a, b) => a.at - b.at);
    const calendar = EPA.calendarCheck(ctx, ex, appointments, asOf);
    return { items, appointments, calendar };
  }

  function lastDeadline(it) {
    const firm = it.deadlines.filter((d) => d.type !== "requested" && d.type !== "self-note");
    if (firm.length) return firm[firm.length - 1];
    const real = it.deadlines.filter((d) => d.type !== "requested");
    if (real.length) return real[real.length - 1];
    return it.deadlines[it.deadlines.length - 1] || null;
  }
  function effectiveDue(it) { const d = lastDeadline(it); return d ? d.due : null; }
  // How many times the owner changed the date they committed to.
  function countSlips(it) {
    if (it.kind !== "deliverable" && it.kind !== "scheduling") return 0;
    let changes = 0, cur = null;
    it.deadlines.forEach((d) => {
      if (d.by !== it.owner || d.type === "requested" || d.type === "inherited" || d.type === "self-note") return;
      if (cur != null && d.due !== cur) changes++;
      cur = d.due;
    });
    return changes;
  }
  function distinctDues(it) { return new Set(it.deadlines.map((d) => d.due)).size; }

  function statusOf(it, asOf) {
    if (it.done) return "done";
    if (it.direction === "unowned") return it.due && it.due < asOf ? "unowned-overdue" : "unowned";
    if (!it.due) return "open";
    const left = it.due - asOf;
    if (left < 0) return (it.kind === "review" || it.kind === "reply") ? "lapsed" : "overdue";
    if (U.sameDay(it.due, asOf)) return "due-today";
    if (left <= U.DAY) return "due-soon";
    return "open";
  }

  EPA.reason = { reason, statusOf, KIND_LABEL };
})(typeof window !== "undefined" ? (window.EPA = window.EPA || {}) : (globalThis.EPA = globalThis.EPA || {}));
