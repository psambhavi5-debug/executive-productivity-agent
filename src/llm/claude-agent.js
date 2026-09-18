/*
 * Optional LLM layer — a Claude tool-use agent that answers free-form questions.
 *
 * Claude never sees a pre-written answer: it gets tools over the deterministic
 * engine (brief, commitment register, calendars, flags, raw sources) and must
 * call them, then answer with source citations. The engine stays the single
 * source of truth, so the LLM cannot invent owners or dates that are not in the data.
 *
 * Requires `npm install` (pulls @anthropic-ai/sdk) and ANTHROPIC_API_KEY.
 */
const EPA = require("../engine/index.js");
const U = EPA.util;

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
const MAX_TURNS = 8;

const SYSTEM = `You are the Executive Productivity Agent for Arjun Malhotra (VP Sales, Veridian). You speak to Arjun as "you".
Neha, Raghav, Divya, Priya and Facilities are SOURCES of information (their emails, calendars, messages), not people you serve.

How to work:
- Always call tools before answering. The tools expose a deterministic commitment register built from the week's meeting transcript, calendars, email threads and Arjun's voice notes.
- Answer ONLY from tool results. If something is not in the sources, say so plainly. Never invent an owner, a date, or a promise.
- If ownership is unclear, say it is unclear and who has disclaimed or been suggested. Do not pick an owner.
- Cite source ids in square brackets after each claim, e.g. [T1.E4] or [MTG1.U3] or [CAL.arjun.8].
- Be concise and action-oriented: lead with what Arjun should do, with deadlines and how close they are relative to the current time you are given.`;

const TOOLS = [
  { name: "get_daily_brief", description: "The daily action brief for the current moment: headline, top priorities, today's annotated schedule, counts.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  {
    name: "list_commitments",
    description: "List commitments from the de-duplicated register. direction: 'mine' = Arjun must act; 'waiting' = someone owes Arjun; 'unowned' = nobody has taken it. person matches owner or counterpart by first name.",
    input_schema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["mine", "waiting", "unowned", "all"] },
        person: { type: "string", description: "First name, e.g. Raghav" },
        status: { type: "string", enum: ["open", "done", "all"] }
      },
      additionalProperties: false
    }
  },
  { name: "get_commitment", description: "Full detail of one commitment: every deadline statement with who said it, the merged evidence timeline, chasers, flags.", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } },
  { name: "get_calendar", description: "Calendar events for a date (YYYY-MM-DD) for Arjun or another person, plus agreed-but-unbooked times and conflicts.", input_schema: { type: "object", properties: { date: { type: "string" }, person: { type: "string" } }, required: ["date"], additionalProperties: false } },
  { name: "list_flags", description: "Risk flags: unowned items, calendar conflicts, deadline drift, at-risk deliveries, stale reminders, replies owed.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "search_sources", description: "Keyword search over the raw source statements (only those made up to the current moment).", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } }
];

function compactItem(it, run) {
  const P = run.ctx.people;
  const f = (p) => (p ? (P[p] ? P[p].first : p) : null);
  return {
    id: it.id, title: it.title, topic: it.topicLabel, kind: it.kind, direction: it.direction,
    owner: f(it.owner) || "UNOWNED", counterpart: f(it.beneficiary), status: it.status,
    due: it.due ? U.fmtDayTime(it.due) : null,
    time_left: it.due ? (it.due >= run.asOf ? "in " : "overdue by ") + U.fmtDelta(it.due - run.asOf) : null,
    completed: it.done ? `${U.fmtDayTime(it.done.at)} (${it.done.how}) [${it.done.recordId}]` : null,
    times_moved: it.slips, chased_by: it.chasers.map((c) => `${f(c.by)} ${U.fmtDayTime(c.at)} [${c.recordId}]`),
    reply_owed: it.replyPending ? `${f(it.replyPending.from)}: "${it.replyPending.question}" [${it.replyPending.recordId}]` : null,
    sources: it.evidence
  };
}

function runTool(name, input, run) {
  const P = run.ctx.people;
  const byFirst = (n) => Object.values(P).find((p) => p.first.toLowerCase() === String(n || "").toLowerCase());
  switch (name) {
    case "get_daily_brief": {
      const b = run.brief;
      return {
        now: U.fmtDayTime(run.asOf), headline: b.headline, counts: b.counts,
        priorities: b.priorities.map((p) => ({ do: p.text, why: p.why, sources: p.sources })),
        today_schedule: b.schedule.map((s) => ({ time: `${U.fmtTime(s.at)}–${U.fmtTime(s.end)}`, title: s.title, on_your_calendar: s.onCalendar, notes: s.notes, source: s.id, past: s.past }))
      };
    }
    case "list_commitments": {
      const p = input.person ? byFirst(input.person) : null;
      if (input.person && !p) return { error: `Unknown person "${input.person}". Known: ${Object.values(P).map((x) => x.first).join(", ")}` };
      return run.items
        .filter((it) => !input.direction || input.direction === "all" || it.direction === input.direction)
        .filter((it) => !p || it.owner === p.id || it.beneficiary === p.id)
        .filter((it) => !input.status || input.status === "all" || (input.status === "done" ? !!it.done : !it.done))
        .map((it) => compactItem(it, run));
    }
    case "get_commitment": {
      const it = run.items.find((x) => x.id === input.id);
      if (!it) return { error: `No commitment ${input.id}` };
      return Object.assign(compactItem(it, run), {
        deadline_history: it.deadlines.map((d) => ({ said_by: P[d.by] ? P[d.by].first : d.by, words: d.phrase, means: U.fmtDayTime(d.due), type: d.type, source: d.recordId })),
        timeline: it.timeline.map((t) => ({ when: U.fmtDayTime(t.at), who: P[t.speaker] ? P[t.speaker].first : t.speaker, said: t.text, effect: t.effect, source: t.recordId })),
        disclaimed_by: it.disclaimers.map((d) => P[d.who].first), suggested_owners: it.candidates.map((c) => `${P[c.who].first} (suggested by ${P[c.by].first}, unconfirmed)`),
        flags: run.flags.filter((fl) => fl.itemId === it.id).map((fl) => fl.title)
      });
    }
    case "get_calendar": {
      const day = U.parseT(input.date);
      const p = input.person ? byFirst(input.person) : P[run.ctx.user];
      if (!p) return { error: `Unknown person "${input.person}"` };
      return {
        person: p.first, date: U.fmtDay(day),
        events: run.ctx.events.filter((e) => e.owner === p.id && U.sameDay(e.at, day)).map((e) => ({ time: `${U.fmtTime(e.at)}–${U.fmtTime(e.end)}`, title: e.title, source: e.id })),
        agreed_times_with_arjun: run.appointments.filter((a) => U.sameDay(a.at, day)).map((a) => ({ time: U.fmtTime(a.at), topic: a.topicLabel, with: a.participants.map((x) => P[x].first), on_arjun_calendar: !!a.onCalendar, sources: a.sources })),
        issues: run.calendar.issues.filter((i) => U.sameDay(i.at, day)).map((i) => ({ title: i.title, detail: i.detail, sources: i.sources }))
      };
    }
    case "list_flags":
      return run.flags.map((fl) => ({ type: fl.type, severity: fl.severity, past: !!fl.past, title: fl.title, detail: fl.detail, sources: fl.sources }));
    case "search_sources": {
      const qt = U.tokens(input.query || "");
      return run.ctx.clauses.filter((c) => c.at <= run.asOf)
        .map((c) => ({ c, s: U.tokens(c.text).filter((w) => qt.includes(w)).length })).filter((h) => h.s > 0)
        .sort((a, b) => b.s - a.s).slice(0, 8)
        .map((h) => ({ source: h.c.recordId, when: U.fmtDayTime(h.c.at), who: P[h.c.speaker] ? P[h.c.speaker].first : h.c.speaker, text: h.c.text }));
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

async function loadSdk() {
  try { return (await import("@anthropic-ai/sdk")).default; } catch (e) { return null; }
}

async function ask({ question, asOf, history = [] }) {
  const Anthropic = await loadSdk();
  if (!Anthropic) throw Object.assign(new Error("Claude SDK not installed. Run `npm install`."), { code: "NO_SDK" });
  const client = new Anthropic();
  const run = EPA.agent.run(asOf || EPA.agent.DEFAULT_AS_OF);
  const trace = [];

  // Prior turns as plain text; the current moment goes in the user turn so the system prompt stays cacheable.
  const messages = history.slice(-6).map((h) => ({ role: h.role, content: h.text }));
  messages.push({ role: "user", content: `Current time: ${U.fmtDayTime(run.asOf)} (${U.toIso(run.asOf)}). Question from Arjun: ${question}` });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages
    });

    if (response.stop_reason === "refusal") return { answer: "The model declined to answer this request.", trace, model: response.model };
    if (response.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: response.content }); continue; }

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !toolUses.length) {
      const answer = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      return { answer: answer || "(no answer)", trace, model: response.model };
    }

    messages.push({ role: "assistant", content: response.content });
    const results = toolUses.map((tu) => {
      let out, isError = false;
      try { out = runTool(tu.name, tu.input || {}, run); if (out && out.error) isError = true; } catch (e) { out = { error: e.message }; isError = true; }
      trace.push({ tool: tu.name, input: tu.input });
      return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out), is_error: isError };
    });
    messages.push({ role: "user", content: results });
  }
  return { answer: "Stopped after too many tool calls without a final answer.", trace, model: MODEL };
}

module.exports = { ask, runTool, TOOLS, SYSTEM, MODEL, loadSdk };
