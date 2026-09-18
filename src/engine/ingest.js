/*
 * Stage 1 — INGEST
 * Normalises the four raw source types (meeting transcript, calendars, email threads,
 * voice notes) into one list of `records`, then splits every record into `clauses`
 * (the unit the extractor reasons about). Every clause keeps a stable citation id.
 */
(function (EPA) {
  const U = EPA.util;

  function splitClauses(text) {
    // sentence boundaries, then em-dash clause boundaries ("Following up — can you ...")
    const out = [];
    U.norm(text).split(/(?<=[.?!])\s+/).forEach((sentence) => {
      sentence.split(/\s+[—]\s+/).forEach((c) => { if (c.trim()) out.push(c.trim()); });
    });
    return out;
  }

  function ingest(S) {
    const records = [];
    const clauses = [];
    const people = {};
    S.people.forEach((p) => { people[p.id] = p; });
    const byEmail = {};
    S.people.forEach((p) => { byEmail[p.email] = p.id; });

    let seq = 0;
    function addClauses(rec) {
      splitClauses(rec.text).forEach((txt, k) => {
        clauses.push({
          id: `${rec.id}#${k + 1}`,
          recordId: rec.id,
          sourceType: rec.sourceType,
          at: rec.at,
          seq: seq++,
          speaker: rec.speaker,
          to: rec.to || [],
          threadId: rec.threadId || null,
          text: txt,
          isFirstInRecord: k === 0
        });
      });
    }

    S.meetings.forEach((m) => {
      const at = U.parseT(m.start);
      m.utterances.forEach((u, i) => {
        const rec = {
          id: `${m.id}.U${i + 1}`, sourceType: "meeting", at, speaker: u.speaker, to: [],
          text: u.text, title: `${m.title} (${U.fmtDayTime(at)})`, meetingId: m.id
        };
        records.push(rec); addClauses(rec);
      });
    });

    S.threads.forEach((t) => {
      t.emails.forEach((e, i) => {
        const rec = {
          id: `${t.id}.E${i + 1}`, sourceType: "email", at: U.parseT(e.at), speaker: e.from,
          to: e.to.filter((x) => x !== "all-staff"), toAllStaff: e.to.includes("all-staff"),
          text: e.text, title: `Email — ${t.subject}`, threadId: t.id, subject: t.subject
        };
        records.push(rec); addClauses(rec);
      });
    });

    S.voiceNotes.forEach((v) => {
      const rec = { id: v.id, sourceType: "voice", at: U.parseT(v.at), speaker: v.speaker, to: [], text: v.text, title: `Voice note (${U.fmtDayTime(U.parseT(v.at))})` };
      records.push(rec); addClauses(rec);
    });

    const events = [];
    Object.keys(S.calendars).forEach((pid) => {
      S.calendars[pid].forEach((ev, i) => {
        const rec = {
          id: `CAL.${pid}.${i + 1}`, sourceType: "calendar", owner: pid, at: U.parseT(ev.start),
          end: U.parseT(ev.end), title: ev.title, text: `${people[pid].first}'s calendar: ${ev.title} (${U.fmtDay(U.parseT(ev.start))}, ${U.fmtTime(U.parseT(ev.start))}–${U.fmtTime(U.parseT(ev.end))})`
        };
        records.push(rec); events.push(rec);
      });
    });

    clauses.sort((a, b) => a.at - b.at || a.seq - b.seq);
    const recordById = {};
    records.forEach((r) => { recordById[r.id] = r; });
    return { records, recordById, clauses, events, people, byEmail, user: S.user, week: { start: U.parseT(S.week.start), end: U.parseT(S.week.end) } };
  }

  EPA.ingest = { ingest, splitClauses };
})(typeof window !== "undefined" ? (window.EPA = window.EPA || {}) : (globalThis.EPA = globalThis.EPA || {}));
