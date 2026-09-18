/*
 * Stage 2 — EXTRACT
 * For every clause: (a) which topic/workstream it belongs to (entity linking),
 * (b) which speech acts it contains (commit, request, deliver, follow-up, ownership
 * doubt, ...), (c) which people it mentions / addresses, (d) any deadline it states.
 * Rules are deliberately transparent so every decision can be audited in the UI.
 */
(function (EPA) {
  const U = EPA.util;

  // Speech-act lexicon. Order does not matter; a clause can carry several acts.
  const CUES = {
    DELIVER: /\b(attached|attaching|sent as promised|here is|here's the)\b/,
    ACK: /\b(got it|thank you|thanks)\b/,
    FOLLOWUP: /\b(following up|just checking|quick check|still good for|still on for|any update)\b/,
    OWNERSHIP_UNCLEAR: /(needs someone to|not sure whose|haven't seen anyone pick|has anyone confirmed who|who's (handling|signing)|still unowned|\bunowned\b|someone needs to own|been assigned|don't assume)/,
    DISCLAIM: /(not on my end|don't think it's me|\bnot us\b|\bnot mine\b)/,
    SUGGEST: /(supposed to be|sits with|belongs to|should be owned by)\s+(?:[a-z]+\s+){0,1}([a-z]+)/,
    NOTICE: /\b(requires|deadline is|still pending)\b/,
    REQUEST: /\b(can|could|would) you\b|\bcan i get\b|\bplease\b|\bneeds to be in my hands\b/,
    COMMIT: /\bi(?:'ll| will|'d)\b|\bwill (?:send|have|get|share|do|deliver)\b|\bi owe\b|\bneed to (?:get|send|lock|reconfirm|confirm|share|finish|deliver)\b|\btargeting\b/,
    REVIEW_INTENT: /\b(?:want|need) time to (?:review|go through)\b/,
    FOR_REVIEW: /\bfor (?:your |his |her )?review\b|\bto \w+ for review\b/,
    ACCEPT: /^(yes|sure|ok|okay|understood|no worries|noted)\b|\bworks\b|\bdoable\b|\bconfirmed\b|\bsounds good\b/,
    PROPOSE: /\bhow about\b|\blet's say\b/,
    REVISE: /\binstead\b|\bshifting\b|\bslip\b|\brealistically\b|\bpushed\b|\bbumped\b|\brunning behind\b/,
    PROGRESS: /\b\d+% done\b|\bcoming together\b|\bstarting on\b/,
    SCHEDULING: /\b(new time|a time|propose|reschedule|slot)\b/
  };

  function buildTopics(S, ctx) {
    // Seed topics from email-thread subjects; enrich with the external org/person
    // aliases of thread participants so "Meridian call" links to "Call Reschedule".
    return S.threads.map((t) => {
      const toks = new Set(U.tokens(t.subject));
      const participants = U.uniq(t.emails.flatMap((e) => [e.from, ...e.to])).filter((p) => ctx.people[p]);
      participants.forEach((pid) => {
        const p = ctx.people[pid];
        if (p.org !== "Veridian") { U.tokens(p.org).forEach((w) => toks.add(w)); toks.add(p.first.toLowerCase()); (p.aliases || []).forEach((a) => toks.add(a)); }
      });
      return { id: t.id, label: t.subject, tokens: toks, participants };
    });
  }

  function mentionedPeople(text, ctx) {
    const low = text.toLowerCase();
    const found = [];
    Object.values(ctx.people).forEach((p) => {
      const names = [p.first.toLowerCase(), ...(p.aliases || [])];
      if (names.some((n) => new RegExp(`\\b${n}\\b`).test(low))) found.push(p.id);
    });
    return found;
  }

  function vocative(text, ctx) {
    const m = /^([A-Z][a-z]+),/.exec(text);
    if (!m) return null;
    const p = Object.values(ctx.people).find((x) => x.first === m[1]);
    return p ? p.id : null;
  }

  function extract(ctx, S) {
    const topics = buildTopics(S, ctx);
    const topicById = {};
    topics.forEach((t) => { topicById[t.id] = t; });
    const userEvents = ctx.events.filter((e) => e.owner === ctx.user);
    const tctx = { week: ctx.week, userEvents };

    let prev = null; // previous clause in the same discourse (meeting / voice note)
    ctx.clauses.forEach((c) => {
      const low = c.text.toLowerCase();
      const ctoks = U.tokens(c.text);

      // --- topic linking -------------------------------------------------------
      let topic = null, topicReason = "";
      if (c.threadId) { topic = c.threadId; topicReason = "email thread subject"; }
      else {
        let best = 0;
        topics.forEach((t) => {
          const score = ctoks.filter((w) => t.tokens.has(w)).length;
          if (score > best) { best = score; topic = t.id; }
        });
        if (topic) topicReason = `keyword overlap with "${topicById[topic].label}"`;
        else if (prev && prev.recordGroup === groupOf(c) && prev.topic) { topic = prev.topic; topicReason = "continues previous statement (coreference)"; }
      }
      c.topic = topic;
      c.topicReason = topicReason;
      c.recordGroup = groupOf(c);

      // --- speech acts ---------------------------------------------------------
      c.acts = Object.keys(CUES).filter((k) => CUES[k].test(low));
      if (c.acts.includes("DELIVER")) c.acts = c.acts.filter((a) => a !== "ACK");
      if (c.acts.includes("DISCLAIM") && !c.acts.includes("OWNERSHIP_UNCLEAR")) c.acts.push("OWNERSHIP_UNCLEAR");
      c.isQuestion = /\?\s*$/.test(c.text);
      const sug = CUES.SUGGEST.exec(low);
      if (sug) {
        const cand = mentionedPeople(sug[0], ctx)[0];
        c.suggestedOwner = cand || null;
      }

      // --- people --------------------------------------------------------------
      c.mentions = mentionedPeople(c.text, ctx).filter((p) => p !== c.speaker);
      const voc = vocative(c.text, ctx);
      c.addressees = voc ? [voc] : c.to.filter((p) => p !== c.speaker);

      // --- deadline ------------------------------------------------------------
      const r = EPA.temporal.resolve(c.text, c.at, tctx);
      c.deadline = r.chosen;
      c.deadlineMentions = r.mentions;

      prev = c;
    });

    function groupOf(c) {
      if (c.sourceType === "meeting") return c.recordId.split(".")[0];
      return c.recordId;
    }

    return { topics, topicById };
  }

  EPA.extract = { extract, CUES };
})(typeof window !== "undefined" ? (window.EPA = window.EPA || {}) : (globalThis.EPA = globalThis.EPA || {}));
