// Acceptance tests mapped to the assignment brief. Run: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const EPA = require("../src/engine/index.js");
const U = EPA.util;

const run = (t) => EPA.agent.run(t);
const find = (r, pred) => r.items.find(pred);
const vendor = (r) => find(r, (it) => it.topic === "T1" && it.owner === "arjun" && it.kind === "deliverable");

test("identifies commitments made by the executive (meeting, email and voice note)", () => {
  const r = run("2026-09-24T08:30");
  const mine = r.items.filter((it) => it.owner === "arjun").map((it) => it.title);
  assert.ok(mine.includes("Send Raghav the updated vendor list"));
  assert.ok(mine.some((t) => /Reconfirm the new time/.test(t)));
  assert.ok(mine.some((t) => /Review Expense Variance Report/.test(t)));
});

test("separates 'my actions' from 'waiting on others'", () => {
  const r = run("2026-09-22T12:00");
  const neha = find(r, (it) => it.owner === "neha");
  const divya = find(r, (it) => it.owner === "divya");
  assert.equal(neha.direction, "waiting");
  assert.equal(divya.direction, "waiting");
  assert.equal(vendor(r).direction, "mine");
  assert.equal(neha.beneficiary, "arjun");
});

test("detects deadlines and overdue items, relative to the chosen moment", () => {
  assert.equal(vendor(run("2026-09-23T11:00")).status, "due-today");
  const r = run("2026-09-24T08:30");
  assert.equal(vendor(r).status, "overdue");
  assert.equal(U.toIso(vendor(r).due), "2026-09-23T12:00"); // "tomorrow (Wednesday) morning" said Tue evening
  assert.equal(vendor(r).slips, 2);
});

test("de-duplicates the same action across sources", () => {
  const r = run("2026-09-25T18:00");
  const v = r.items.filter((it) => it.topic === "T1" && it.owner === "arjun" && it.kind === "deliverable");
  assert.equal(v.length, 1, "vendor list must be ONE commitment");
  ["MTG1.U3", "T1.E1", "T1.E2", "VN1", "T1.E4"].forEach((id) => assert.ok(v[0].evidence.includes(id), id));
  const exp = r.items.filter((it) => it.topic === "T4" && it.owner === "divya");
  assert.equal(exp.length, 1, "expense report must be ONE commitment (meeting + 5 emails + voice note)");
  assert.ok(exp[0].evidence.includes("MTG1.U7") && exp[0].evidence.includes("VN2"));
});

test("stale voice-note reminder is recognised as already done (Meridian)", () => {
  const r = run("2026-09-23T09:00");
  const m = find(r, (it) => it.topic === "T3" && it.owner === "arjun" && it.kind === "scheduling");
  assert.ok(m.done, "Priya confirmed Wed 3 PM on Tue 5:45 PM");
  assert.equal(m.stale[0].recordId, "VN2");
  assert.ok(r.flags.some((f) => f.type === "stale-reminder"));
});

test("flags unclear ownership instead of inventing an owner (Mumbai lease)", () => {
  const r = run("2026-09-25T09:00");
  const lease = find(r, (it) => it.topic === "T5" && it.kind === "ownership");
  assert.equal(lease.owner, null);
  assert.equal(lease.direction, "unowned");
  assert.deepEqual(U.uniq(lease.candidates.map((c) => c.who)), ["facilities"]);
  assert.deepEqual(U.uniq(lease.disclaimers.map((d) => d.who)).sort(), ["arjun", "divya"]);
  assert.equal(U.toIso(lease.due), "2026-09-25T18:00");
  assert.ok(r.flags.some((f) => f.type === "unowned" && f.severity === "high"));
  // Raghav asked Arjun directly → Arjun owes a decision, but is still not made the owner of the lease
  assert.ok(find(r, (it) => it.topic === "T5" && it.owner === "arjun" && it.kind === "decision"));
});

test("detects the 9:30 deck-review clash with Board Prep and the missing calendar entry", () => {
  const r = run("2026-09-24T08:30");
  const c = r.flags.find((f) => f.type === "calendar-conflict" && !f.past);
  assert.ok(c);
  assert.ok(c.sources.includes("CAL.arjun.8") && c.sources.includes("CAL.neha.6"));
  assert.ok(r.flags.some((f) => f.type === "calendar-missing" && f.sources.includes("CAL.divya.3")));
});

test("flags delivery at risk when the promised date is after the moment it is needed", () => {
  const before = find(run("2026-09-21T15:00"), (it) => it.owner === "divya");
  assert.ok(before.atRisk, "Divya's email said Thursday morning, board prep is Thursday 9 AM");
  const after = find(run("2026-09-22T10:00"), (it) => it.owner === "divya");
  assert.equal(after.atRisk, undefined, "resolved once Divya agreed to Wednesday evening");
});

test("time travel: the agent only knows what had happened by 'as of'", () => {
  const r = run("2026-09-21T09:40");
  r.items.forEach((it) => it.evidence.forEach((id) => assert.ok(id.startsWith("MTG1"), id)));
});

test("produces a daily brief", () => {
  const b = run("2026-09-24T08:30").brief;
  assert.match(b.headline, /1 overdue/);
  assert.equal(b.priorities[0].text, "Send Raghav the updated vendor list");
  assert.ok(b.schedule.some((s) => !s.onCalendar && /Q3 Campaign Deck/.test(s.title)));
});

test("answers 'What did I promise Raghav?' and 'What needs action today?'", () => {
  const r = run("2026-09-24T08:30");
  const a1 = EPA.qa.answer("What did I promise Raghav?", r);
  assert.equal(a1.intent, "promised-to");
  assert.match(a1.text, /vendor list/);
  assert.match(a1.text, /OVERDUE/);
  const a2 = EPA.qa.answer("What needs action today?", r);
  assert.equal(a2.intent, "today");
  assert.match(a2.text, /vendor list/);
  assert.match(a2.text, /Mumbai/);
});

test("grounding: every citation and every deadline phrase exists in the sources", () => {
  const r = run("2026-09-25T18:00");
  const recs = r.ctx.recordById;
  r.items.forEach((it) => {
    it.evidence.forEach((id) => assert.ok(recs[id], `unknown source ${id}`));
    it.deadlines.forEach((d) => assert.ok(U.norm(recs[d.recordId].text).toLowerCase().includes(d.phrase.toLowerCase()), `"${d.phrase}" not in ${d.recordId}`));
  });
});

test("temporal resolver handles the messy phrasing in the data pack", () => {
  const ctx = EPA.agent.prepare().ctx;
  const tctx = { week: ctx.week, userEvents: ctx.events.filter((e) => e.owner === "arjun") };
  const R = (text, at) => U.toIso(EPA.temporal.resolve(text, U.parseT(at), tctx).chosen.due);
  assert.equal(R("I'll get that to him by end of day tomorrow.", "2026-09-21T09:00"), "2026-09-22T18:00");
  assert.equal(R("will send by tomorrow (Wednesday) morning for sure.", "2026-09-22T18:30"), "2026-09-23T12:00");
  assert.equal(R("I said Wednesday, but realistically Thursday morning is safer.", "2026-09-21T09:00"), "2026-09-24T12:00");
  assert.equal(R("shifting the review to Thursday morning instead of Wednesday", "2026-09-22T16:15"), "2026-09-24T12:00");
  assert.equal(R("needs to be in my hands by Wednesday evening, not Thursday.", "2026-09-23T08:15"), "2026-09-23T21:00");
  assert.equal(R("can you also pull the July expense variance report before Thursday's board prep?", "2026-09-21T09:00"), "2026-09-24T09:00");
  assert.equal(R("Let's say 9:30 AM Thursday, before your board prep block.", "2026-09-23T10:20"), "2026-09-24T09:30");
  assert.equal(R("Deadline is Friday, 25 September, end of day.", "2026-09-24T16:00"), "2026-09-25T18:00");
  assert.equal(R("Yes, confirmed, see you at 3.", "2026-09-23T14:00"), "2026-09-23T15:00");
  assert.equal(EPA.temporal.resolve("We're flexible Tuesday-Thursday afternoons.", U.parseT("2026-09-21T13:00"), tctx).chosen, null);
});
