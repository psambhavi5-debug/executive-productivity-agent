/*
 * Agent facade — runs the full pipeline for a given "as of" moment.
 *   ingest → extract → reason (+ calendar check) → flags → daily brief
 * Ingest + extract are time-independent and cached; reasoning is replayed
 * for every "as of" so the agent only knows what had happened by then.
 */
(function (EPA) {
  const U = EPA.util;
  let cache = null;

  function prepare() {
    if (cache) return cache;
    const ctx = EPA.ingest.ingest(EPA.SOURCES);
    const ex = EPA.extract.extract(ctx, EPA.SOURCES);
    cache = { ctx, ex };
    return cache;
  }

  function run(asOfIso) {
    const { ctx, ex } = prepare();
    const asOf = typeof asOfIso === "number" ? asOfIso : U.parseT(asOfIso);
    const r = EPA.reason.reason(ctx, ex, asOf);
    const out = { asOf, ctx, ex, items: r.items, appointments: r.appointments, calendar: r.calendar };
    out.flags = EPA.brief.buildFlags(out);
    out.brief = EPA.brief.buildBrief(out);
    return out;
  }

  EPA.agent = { run, prepare, DEFAULT_AS_OF: "2026-09-24T08:30" };
})(typeof window !== "undefined" ? (window.EPA = window.EPA || {}) : (globalThis.EPA = globalThis.EPA || {}));
