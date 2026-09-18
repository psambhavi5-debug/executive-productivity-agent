/* Web UI — renders the agent's output. All reasoning happens in src/engine (runs in the browser). */
(function () {
  const EPA = window.EPA;
  const U = EPA.util;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const DAYS = [["2026-09-21", "Mon 21"], ["2026-09-22", "Tue 22"], ["2026-09-23", "Wed 23"], ["2026-09-24", "Thu 24"], ["2026-09-25", "Fri 25"]];
  const TIMES = [["08:00", "8:00 AM"], ["08:30", "8:30 AM"], ["09:40", "9:40 AM"], ["12:00", "12:00 PM"], ["15:00", "3:00 PM"], ["17:00", "5:00 PM"], ["19:00", "7:00 PM"], ["23:59", "End of day"]];
  const STATUS_LABEL = { overdue: "Overdue", "due-today": "Due today", "due-soon": "Due < 24h", open: "Open", done: "Done", lapsed: "Time passed", unowned: "No owner", "unowned-overdue": "No owner · late" };
  const SRC_LABEL = { meeting: "Meeting", email: "Email", voice: "Voice note", calendar: "Calendar" };

  const state = { day: "2026-09-24", time: "08:30", tab: "brief", filter: "all", claude: false, llm: false, history: [] };
  let run = null;

  // ---------- as-of clock -------------------------------------------------
  function readHash() {
    const m = /asof=(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(location.hash);
    if (m) { state.day = m[1]; state.time = m[2]; }
    const t = /tab=(\w+)/.exec(location.hash);
    if (t) state.tab = t[1];
  }
  function writeHash() { history.replaceState(null, "", `#asof=${state.day}T${state.time}&tab=${state.tab}`); }
  function buildClock() {
    $("#days").innerHTML = DAYS.map(([d, l]) => `<button role="tab" data-day="${d}" class="${d === state.day ? "active" : ""}">${l}</button>`).join("");
    const times = TIMES.some(([t]) => t === state.time) ? TIMES : TIMES.concat([[state.time, state.time]]);
    $("#time").innerHTML = times.map(([t, l]) => `<option value="${t}" ${t === state.time ? "selected" : ""}>${l}</option>`).join("");
  }
  $("#days").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.day = b.dataset.day; refresh(); });
  $("#time").addEventListener("change", (e) => { state.time = e.target.value; refresh(); });

  // ---------- helpers -----------------------------------------------------
  const who = (p) => (p ? (p === run.ctx.user ? "You" : run.ctx.people[p].first) : "—");
  const badge = (status) => `<span class="badge ${status}">${esc(STATUS_LABEL[status] || status)}</span>`;
  const cites = (ids) => ids && ids.length ? `<span class="cites">${U.uniq(ids).map((id) => `<button class="cite" data-src="${esc(id)}">${esc(id)}</button>`).join("")}</span>` : "";
  function linkify(text) {
    return esc(text).replace(/\[([A-Z][A-Za-z0-9.#]+(?:,\s*[A-Z][A-Za-z0-9.#]+)*)\]/g, (m, ids) => cites(ids.split(/,\s*/)));
  }
  function itemCard(it, opts = {}) {
    return `<div class="item" data-item="${it.id}">
      <div class="row"><div class="title">${esc(it.title)}</div>${badge(it.status)}</div>
      ${opts.owner ? `<div class="who">Owner: ${esc(who(it.owner))}</div>` : ""}
      <div class="meta">${esc(it.done ? `Completed ${U.fmtDayTime(it.done.at)} · ${it.done.how}` : EPA.brief.describe(it, run))}</div>
      <div class="meta">${it.evidence.length} source${it.evidence.length > 1 ? "s" : ""} merged ${cites(it.evidence)}</div>
    </div>`;
  }

  // ---------- views -------------------------------------------------------
  function viewBrief() {
    const b = run.brief;
    const clashes = b.flags.filter((f) => f.type === "calendar-conflict").length;
    const stat = (n, label, cls) => `<div class="stat ${n ? cls : ""}"><b>${n}</b><span>${label}</span></div>`;
    const prio = b.priorities.length
      ? `<ol class="prio">${b.priorities.map((p) => `<li ${p.itemId ? `data-item="${p.itemId}"` : ""}><div><div class="t">${esc(p.text)}</div><div class="w">${esc(p.why)} ${cites(p.sources)}</div></div></li>`).join("")}</ol>`
      : `<p class="prose muted">Nothing urgent right now.</p>`;
    const sched = b.schedule.length
      ? b.schedule.map((s) => `<div class="slot ${s.onCalendar ? "" : "ghost"} ${s.past ? "past" : ""}">
          <div class="tm">${U.fmtTime(s.at)}<br><span class="muted small">${U.fmtTime(s.end)}</span></div>
          <div><div class="ev">${esc(s.title)} ${cites([s.id])}</div>${s.notes.map((n) => `<div class="note ${/NOT|Overlaps|not yours/.test(n) ? "warn" : ""}">${esc(n)}</div>`).join("")}</div>
        </div>`).join("")
      : `<div class="slot"><div></div><div class="muted">No meetings today.</div></div>`;
    const col = (title, arr, opts, empty) => `<div class="card col"><h3>${title}<span class="badge">${arr.length}</span></h3>${arr.length ? arr.map((it) => itemCard(it, opts)).join("") : `<div class="empty">${empty}</div>`}</div>`;
    return `
      <div class="section card hero">
        <div><div class="when">${U.fmtDayTime(run.asOf)} · replaying only what had happened by then</div><h2>${esc(b.headline)}</h2></div>
        <div class="stats">
          ${stat(b.counts.overdue, "Overdue (mine)", "red")}${stat(b.counts.dueToday, "Due today (mine)", "amber")}
          ${stat(b.counts.unowned, "Needs an owner", "violet")}${stat(clashes, "Calendar clashes", "red")}${stat(b.counts.waiting, "Waiting on others", "blue")}
        </div>
      </div>
      <div class="section"><div class="section-title">Do first</div><div class="card">${prio}</div></div>
      <div class="section"><div class="section-title">Today's calendar <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">— striped = agreed elsewhere but not on your calendar</span></div><div class="card sched">${sched}</div></div>
      <div class="section grid3">
        ${col("My actions", b.mine, {}, "Nothing open.")}
        ${col("Waiting on others", b.waiting, { owner: true }, "Nothing outstanding.")}
        ${col("Needs an owner", b.unowned, {}, "Everything has an owner.")}
      </div>
      ${b.flags.length ? `<div class="section"><div class="section-title">Flags <span class="count">${b.flags.length}</span></div><div class="card">${b.flags.slice(0, 4).map(flagRow).join("")}</div></div>` : ""}
      <div class="section"><div class="section-title">Closed this week <span class="count">${b.closed.length}</span></div>
        <div class="card">${b.closed.length ? b.closed.map((it) => `<div class="flag" data-item="${it.id}" style="cursor:pointer"><div class="row"><div class="t">${esc(it.title)}</div>${badge("done")}</div><div class="d">${esc(who(it.owner))} · ${U.fmtDayTime(it.done.at)} · ${esc(it.done.how)} ${cites([it.done.recordId])}</div></div>`).join("") : `<div class="flag muted">Nothing closed yet.</div>`}</div></div>`;
  }

  function flagRow(f) {
    return `<div class="flag" ${f.itemId ? `data-item="${f.itemId}" style="cursor:pointer"` : ""}><div class="row"><div class="t">${esc(f.title)}</div><span class="badge ${f.severity}">${f.past ? "past" : f.severity}</span></div><div class="d">${esc(f.detail)} ${cites(f.sources)}</div></div>`;
  }

  function viewRegister() {
    const F = { all: () => true, mine: (it) => it.direction === "mine", waiting: (it) => it.direction === "waiting", unowned: (it) => it.direction === "unowned", open: (it) => !it.done, done: (it) => !!it.done };
    const labels = { all: "All", mine: "My actions", waiting: "Waiting on others", unowned: "No owner", open: "Open", done: "Done" };
    const rows = run.items.filter(F[state.filter]).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.due || Infinity) - (b.due || Infinity));
    return `<div class="filters" id="filters">${Object.keys(F).map((k) => `<button data-filter="${k}" class="${state.filter === k ? "active" : ""}">${labels[k]}</button>`).join("")}</div>
      <div class="card table-wrap"><table class="table"><thead><tr><th>Commitment</th><th>Owner → For</th><th>Due</th><th>Status</th><th>Evidence</th></tr></thead><tbody>
      ${rows.map((it) => `<tr class="clickable" data-item="${it.id}">
        <td><b>${esc(it.title)}</b><div class="muted small">${esc(EPA.reason.KIND_LABEL[it.kind])} · ${esc(it.topicLabel)}</div></td>
        <td>${esc(who(it.owner))} → ${esc(who(it.beneficiary))}</td>
        <td>${it.due ? esc(U.fmtDayTime(it.due)) : '<span class="muted">—</span>'}${it.slips ? `<div class="muted small">changed ${it.slips}×</div>` : ""}</td>
        <td>${badge(it.status)}</td>
        <td>${cites(it.evidence)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="muted small">Each row is one de-duplicated commitment. Click a row to see every statement that was merged into it.</p>`;
  }

  function viewFlags() {
    const all = run.flags;
    return `<div class="card">${all.length ? all.map(flagRow).join("") : `<div class="flag muted">No flags.</div>`}</div>
      <p class="muted small">Flags are raised by rules: unowned work, calendar clashes / missing entries, date drift, deliveries at risk, stale reminders, replies you owe.</p>`;
  }

  function viewSources(hl) {
    const recs = run.ctx.records;
    const group = (title, arr) => `<div class="src-group"><h3>${title}</h3><div class="card">${arr.map((r) => {
      const future = r.sourceType !== "calendar" && r.at > run.asOf;
      return `<div class="src ${r.id === hl ? "hl" : ""}" id="src-${r.id.replace(/\./g, "-")}" ${future ? 'style="opacity:.35"' : ""}>
        <div><div class="id">${esc(r.id)}</div><div class="by">${esc(U.fmtDayTime(r.at))}</div></div>
        <div><div class="by">${r.sourceType === "calendar" ? esc(run.ctx.people[r.owner].first + "'s calendar") : esc(who(r.speaker)) + (r.to && r.to.length ? " → " + esc(r.to.map(who).join(", ")) : r.toAllStaff ? " → All staff" : "")}${future ? " · not yet happened at the chosen time" : ""}</div>${esc(r.sourceType === "calendar" ? `${r.title} (${U.fmtTime(r.at)}–${U.fmtTime(r.end)})` : r.text)}</div></div>`;
    }).join("")}</div></div>`;
    const threads = EPA.SOURCES.threads.map((t) => group(`Email thread ${t.id} — ${esc(t.subject)}`, recs.filter((r) => r.threadId === t.id)));
    return group("Meeting transcript — Leadership Sync, Mon 21 Sep 9:00 AM (MTG1)", recs.filter((r) => r.sourceType === "meeting")) +
      threads.join("") + group("Voice notes (Arjun, to himself)", recs.filter((r) => r.sourceType === "voice")) +
      ["arjun", "neha", "raghav", "divya"].map((p) => group(`Calendar — ${run.ctx.people[p].name}`, recs.filter((r) => r.sourceType === "calendar" && r.owner === p))).join("");
  }

  function viewHow() {
    const st = (n, t, p) => `<div class="stage"><div class="n">STAGE ${n}</div><h4>${t}</h4><p>${p}</p></div>`;
    const c = run.ctx;
    return `<div class="card section"><div class="pipeline">
      ${st(1, "Ingest", `${c.records.length} records (1 meeting · 25 emails · 2 voice notes · ${c.events.length} calendar entries) split into ${c.clauses.length} citable clauses.`)}
      ${st(2, "Extract", "Per clause: topic linking (thread subject, keyword overlap, coreference), speech acts (commit, request, deliver, chase, disclaim…), people, and a resolved deadline.")}
      ${st(3, "Reason", "Replay clauses in time order up to “as of”. Merge by (topic, owner, kind) → one commitment with many sources. Track date changes, chasers, delivery, stale notes.")}
      ${st(4, "Check", "Cross-check agreed times and other people's calendars against Arjun's calendar. Flag unowned work, at-risk deliveries, replies owed.")}
      ${st(5, "Brief & Q&A", "Rank priorities, annotate today's calendar, answer questions. Optional Claude agent calls the same engine through tools and must cite sources.")}
    </div></div>
    <div class="card prose">
      <h3>Principles</h3>
      <ul>
        <li><b>Grounded:</b> every item and flag carries source ids; tests check every cited phrase exists in the data pack.</li>
        <li><b>No invented owners:</b> when ownership is unclear the agent says so, lists who disclaimed it and who was suggested, and asks for a decision.</li>
        <li><b>Time-aware:</b> choose any moment in the week; the agent only uses what had been said by then, and counts down to deadlines from that moment.</li>
        <li><b>Voice notes = Arjun's own statements</b>, but a private note never relaxes a promise already made to someone else.</li>
      </ul>
      <h3>Deadline conventions</h3>
      <p>first thing = 9:00 AM · morning = 12:00 PM · end of day / bare day = 6:00 PM · evening = 9:00 PM · “this week” = Fri 6:00 PM · “before board prep” = start of that event on Arjun's calendar.</p>
      <p class="small">Full detail: <code>docs/ARCHITECTURE.md</code> and <code>docs/INPUTS_AND_ASSUMPTIONS.md</code>.</p>
    </div>`;
  }

  // ---------- drawer & popover -------------------------------------------
  function openItem(id) {
    const it = run.items.find((x) => x.id === id);
    if (!it) return;
    const fl = run.flags.filter((f) => f.itemId === id);
    $("#drawerBody").innerHTML = `
      <div class="muted small">${esc(it.id)} · ${esc(EPA.reason.KIND_LABEL[it.kind])} · ${esc(it.topicLabel)}</div>
      <h2 id="drawerTitle" style="margin:4px 30px 8px 0;font-size:19px">${esc(it.title)}</h2>
      ${badge(it.status)}
      <dl class="kv">
        <dt>Owner</dt><dd>${esc(it.owner ? who(it.owner) : "Nobody — not assigned by the agent")}</dd>
        <dt>For</dt><dd>${esc(who(it.beneficiary))}</dd>
        <dt>Due</dt><dd>${esc(EPA.brief.whenText(it, run.asOf))}</dd>
        ${it.done ? `<dt>Completed</dt><dd>${esc(U.fmtDayTime(it.done.at))} · ${esc(it.done.how)} ${cites([it.done.recordId])}</dd>` : ""}
        ${it.disclaimers.length ? `<dt>Disclaimed by</dt><dd>${esc(U.uniq(it.disclaimers.map((d) => who(d.who))).join(", "))}</dd>` : ""}
        ${it.candidates.length ? `<dt>Suggested</dt><dd>${esc(U.uniq(it.candidates.map((c) => `${who(c.who)} (by ${who(c.by)})`)).join(", "))} — unconfirmed</dd>` : ""}
        ${it.neededBy ? `<dt>Needed by</dt><dd>${esc(it.neededBy.label)} · ${esc(U.fmtDayTime(it.neededBy.due))}</dd>` : ""}
      </dl>
      ${fl.length ? `<div class="card" style="margin-bottom:16px">${fl.map(flagRow).join("")}</div>` : ""}
      ${it.deadlines.length ? `<h3 style="font-size:14px;margin:8px 0">How the deadline was stated</h3>
        <div class="card table-wrap" style="margin-bottom:16px"><table class="table"><thead><tr><th>Who</th><th>Words</th><th>Means</th><th>Type</th></tr></thead><tbody>
        ${it.deadlines.map((d) => `<tr><td>${esc(who(d.by))}</td><td>“${esc(d.phrase)}” ${cites([d.recordId])}</td><td>${esc(U.fmtDayTime(d.due))}</td><td class="muted">${esc(d.type)}</td></tr>`).join("")}
        </tbody></table></div>` : ""}
      <h3 style="font-size:14px;margin:8px 0">Evidence merged into this commitment (${it.evidence.length} sources)</h3>
      <ul class="timeline">${it.timeline.map((t) => `<li><div class="when"><span class="stype">${SRC_LABEL[t.sourceType]}</span>${esc(U.fmtDayTime(t.at))} · ${esc(who(t.speaker))} ${cites([t.recordId])}</div><div class="said">“${esc(t.text)}”</div><div class="fx">→ ${esc(t.effect)}</div></li>`).join("")}</ul>`;
    $("#drawer").hidden = false;
  }
  $("#drawerClose").addEventListener("click", () => { $("#drawer").hidden = true; });
  $("#drawer").addEventListener("click", (e) => { if (e.target.id === "drawer") $("#drawer").hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { $("#drawer").hidden = true; $("#pop").hidden = true; } });

  function showSource(id, anchor) {
    const r = run.ctx.recordById[id];
    if (!r) return;
    const pop = $("#pop");
    const by = r.sourceType === "calendar" ? `${run.ctx.people[r.owner].first}'s calendar` : `${who(r.speaker)}${r.to && r.to.length ? " → " + r.to.map(who).join(", ") : ""}`;
    pop.innerHTML = `<div class="id">${esc(id)} · ${SRC_LABEL[r.sourceType]}${r.subject ? " · " + esc(r.subject) : ""}</div><div class="by">${esc(by)} · ${esc(U.fmtDayTime(r.at))}</div><div>${esc(r.sourceType === "calendar" ? `${r.title} (${U.fmtTime(r.at)}–${U.fmtTime(r.end)})` : r.text)}</div>`;
    pop.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const w = Math.min(380, window.innerWidth - 24);
    pop.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - w - 12)) + "px";
    pop.style.top = (rect.bottom + 6 + 160 > window.innerHeight ? Math.max(12, rect.top - 150) : rect.bottom + 6) + "px";
  }

  document.addEventListener("click", (e) => {
    const c = e.target.closest(".cite");
    if (c) { e.stopPropagation(); showSource(c.dataset.src, c); return; }
    if (!e.target.closest("#pop")) $("#pop").hidden = true;
    const f = e.target.closest("[data-filter]");
    if (f) { state.filter = f.dataset.filter; render(); return; }
    const it = e.target.closest("[data-item]");
    if (it && !e.target.closest(".drawer-panel")) openItem(it.dataset.item);
  });

  // ---------- tabs --------------------------------------------------------
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.tab = b.dataset.tab; render(); });

  function render() {
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === state.tab));
    const V = { brief: viewBrief, register: viewRegister, flags: viewFlags, sources: viewSources, how: viewHow };
    $("#view").innerHTML = (V[state.tab] || viewBrief)();
    writeHash();
  }
  function refresh() { run = EPA.agent.run(`${state.day}T${state.time}`); buildClock(); render(); }

  // ---------- chat --------------------------------------------------------
  const SUGGEST = ["What needs action today?", "What did I promise Raghav?", "What am I waiting on?", "Who owns the Mumbai lease?", "Any calendar conflicts?", "What's overdue?", "Where are we on the Meridian call?"];
  $("#suggest").innerHTML = SUGGEST.map((s) => `<button type="button">${esc(s)}</button>`).join("");
  $("#suggest").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) ask(b.textContent); });
  $("#composer").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#q").value.trim(); if (q) { $("#q").value = ""; ask(q); } });

  function addMsg(cls, html) {
    const d = document.createElement("div");
    d.className = `msg ${cls}`;
    d.innerHTML = html;
    $("#messages").appendChild(d);
    $("#messages").scrollTop = $("#messages").scrollHeight;
    return d;
  }
  async function ask(q) {
    addMsg("user", esc(q));
    const stamp = U.fmtDayTime(run.asOf);
    if (state.claude && state.llm) {
      const pending = addMsg("bot thinking", "Claude is calling the agent's tools…");
      try {
        const res = await fetch("api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, asOf: `${state.day}T${state.time}`, history: state.history }) });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || res.statusText);
        pending.className = "msg bot";
        pending.innerHTML = `${linkify(out.answer)}<span class="engine">Claude (${esc(out.model || "")}) · tools: ${esc(out.trace.map((t) => t.tool).join(" → ") || "none")} · as of ${esc(stamp)}</span>`;
        state.history.push({ role: "user", text: q }, { role: "assistant", text: out.answer });
        return;
      } catch (err) {
        pending.className = "msg bot";
        pending.innerHTML = `<span class="muted">Claude unavailable (${esc(err.message)}). Falling back to the offline agent:</span>\n\n`;
        const a = EPA.qa.answer(q, run);
        pending.innerHTML += `${linkify(a.text)}<span class="engine">Offline agent · intent: ${esc(a.intent)} · as of ${esc(stamp)}</span>`;
        return;
      }
    }
    const a = EPA.qa.answer(q, run);
    addMsg("bot", `${linkify(a.text)}<span class="engine">Offline agent · intent: ${esc(a.intent)} · as of ${esc(stamp)}</span>`);
  }

  async function detectLlm() {
    if (location.protocol === "file:") return;
    try {
      const r = await fetch("api/health");
      if (!r.ok) return;
      const h = await r.json();
      if (h.llm) {
        state.llm = true; state.claude = true;
        $("#claudeToggleWrap").hidden = false;
        $("#claudeToggle").checked = true;
        const setMode = () => { $("#mode").textContent = state.claude ? `Claude · ${h.model}` : "Offline agent"; $("#mode").classList.toggle("on", state.claude); };
        $("#claudeToggle").addEventListener("change", (e) => { state.claude = e.target.checked; setMode(); });
        setMode();
      }
    } catch (e) { /* static hosting: offline agent only */ }
  }

  readHash();
  refresh();
  detectLlm();
  addMsg("bot", `Hi Arjun — I've read the Leadership Sync transcript, 25 emails, 2 voice notes and 4 calendars. Pick a moment in the week at the top; I'll only use what had happened by then.\n\nTry a suggestion above or ask your own question.`);
})();
