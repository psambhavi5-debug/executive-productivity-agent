#!/usr/bin/env node
/*
 * CLI for the Executive Productivity Agent.
 *   node cli/epa.js brief    [--as-of 2026-09-24T08:30]
 *   node cli/epa.js ask "What did I promise Raghav?" [--as-of ...] [--claude]
 *   node cli/epa.js register [--as-of ...]
 *   node cli/epa.js export out.json [--as-of ...]
 */
const fs = require("fs");
const EPA = require("../src/engine/index.js");
const U = EPA.util;

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const asOf = flag("--as-of") || EPA.agent.DEFAULT_AS_OF;
const useClaude = args.includes("--claude") && args.splice(args.indexOf("--claude"), 1);
const [cmd, ...rest] = args;
const run = EPA.agent.run(asOf);

function printBrief() {
  const b = run.brief;
  console.log(`\nDAILY BRIEF — ${U.fmtDayTime(run.asOf)}\n${b.headline}\n`);
  console.log("TOP PRIORITIES");
  b.priorities.forEach((p, i) => console.log(`  ${i + 1}. ${p.text}\n     ${p.why}  [${(p.sources || []).join(", ")}]`));
  console.log("\nTODAY'S CALENDAR");
  b.schedule.forEach((s) => console.log(`  ${U.fmtTime(s.at).padEnd(8)} ${s.title}${s.onCalendar ? "" : "  (not on your calendar)"}${s.notes.length ? "\n           ↳ " + s.notes.join(" | ") : ""}`));
  const sect = (title, arr, who) => { console.log(`\n${title} (${arr.length})`); arr.forEach((it) => console.log(`  • ${it.title}${who ? ` — ${run.ctx.people[it.owner].first}` : ""}\n    ${EPA.brief.describe(it, run)}  [${it.evidence.join(", ")}]`)); };
  sect("MY ACTIONS", b.mine);
  sect("WAITING ON OTHERS", b.waiting, true);
  sect("NEEDS AN OWNER", b.unowned);
  console.log(`\nFLAGS (${b.flags.length})`);
  b.flags.forEach((f) => console.log(`  [${f.severity}] ${f.title}\n    ${f.detail}`));
  console.log(`\nCLOSED THIS WEEK (${b.closed.length})`);
  b.closed.forEach((it) => console.log(`  ✓ ${it.title} — ${U.fmtDayTime(it.done.at)} (${it.done.how})`));
  console.log("");
}

(async () => {
  if (!cmd || cmd === "brief") return printBrief();
  if (cmd === "ask") {
    const q = rest.join(" ");
    if (useClaude) {
      const out = await require("../src/llm/claude-agent.js").ask({ question: q, asOf });
      console.log(`\n${out.answer}\n\n(tools: ${out.trace.map((t) => t.tool).join(" → ")})\n`);
    } else console.log(`\n${EPA.qa.answer(q, run).text}\n`);
    return;
  }
  if (cmd === "register") {
    run.items.forEach((it) => console.log(`${it.id.padEnd(4)} ${it.status.padEnd(16)} ${it.direction.padEnd(8)} ${(it.owner || "UNOWNED").padEnd(8)} ${it.title}  ${it.due ? "| " + U.fmtDayTime(it.due) : ""}`));
    return;
  }
  if (cmd === "export") {
    const file = rest[0] || "agent-output.json";
    const strip = (it) => Object.assign({}, it, { dueIso: it.due ? U.toIso(it.due) : null });
    fs.writeFileSync(file, JSON.stringify({ asOf: U.toIso(run.asOf), brief: Object.assign({}, run.brief, { mine: run.brief.mine.map((x) => x.id), waiting: run.brief.waiting.map((x) => x.id), unowned: run.brief.unowned.map((x) => x.id), closed: run.brief.closed.map((x) => x.id) }), commitments: run.items.map(strip), flags: run.flags, appointments: run.appointments }, null, 2));
    console.log(`Wrote ${file}`);
    return;
  }
  console.log("Usage: node cli/epa.js [brief|ask \"question\"|register|export file.json] [--as-of YYYY-MM-DDTHH:MM] [--claude]");
})().catch((e) => { console.error(e.message); process.exit(1); });
