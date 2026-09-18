# 15-minute demo and defence script

Setup: run `npm start`, open http://localhost:3000, and set the clock to **Thu 24, 8:30 AM**. Keep a terminal open next to the browser.

| Time | Show | Say |
|---|---|---|
| 0:00–1:30 | Title slide → the problem | "Arjun's week is spread across a meeting, 25 emails, 2 voice notes and 4 calendars. The same promise shows up in 7 places with 4 different dates. The agent turns that into one brief he can act on at 8:30 in the morning." |
| 1:30–3:00 | **How it works** tab (pipeline) | Five stages. The core is deterministic and cites its sources. Claude is an optional tool-using layer on top. |
| 3:00–6:00 | **Daily brief**, Thu 8:30 AM | Go down the *Do first* list: **vendor list overdue** (date changed 2×, Raghav chased), **Mumbai lease has no owner** (due tomorrow 6 PM), the **9:30 deck review clash** with Board Prep (striped slot = not on your calendar), then the two reviews before 9:00 and 9:30. |
| 6:00–7:30 | Click **Send Raghav the updated vendor list** | The drawer shows **7 sources merged into one commitment** (meeting, 5 emails, voice note) and the deadline table with who said what and what it means. This is the de-duplication requirement. |
| 7:30–8:30 | Click the Mumbai item | Disclaimed by you and Divya. Facilities was *suggested*, never confirmed. "The agent will not assign an owner." This is the unclear-ownership requirement. |
| 8:30–10:00 | **Time travel**: Mon 3 PM → Wed 12 PM → Fri 9 AM | Mon: Divya's email target (Thu morning) is **at risk**, because it's after board prep. Wed: the vendor list is due today, and the Meridian voice note is flagged **stale** because it was already confirmed on Tuesday. Fri: the lease is due today, and there's a Facilities check-in at 10 AM where Arjun can raise it. |
| 10:00–11:30 | Chat: "What did I promise Raghav?", "What needs action today?", "What am I waiting on?" | Answers cite sources. Click a citation chip to see the original text. |
| 11:30–12:30 | (Optional) Claude mode | Ask something free-form: "Draft a 2-line reply to Raghav about the lease." Show the tool trace: Claude called `list_commitments` → `get_commitment`. |
| 12:30–13:30 | Terminal: `npm test` | 13 acceptance tests, one for each requirement, plus a grounding test that every cited phrase exists in the sources. |
| 13:30–15:00 | Limits and next steps slide | Rules are tuned to this data. At scale, stage 2 would be replaced with LLM extraction into the same schema, with the grounding check kept. Next come connectors (mail, calendar, speech-to-text). Write actions are left out on purpose. |

## Likely defence questions

**Why not just send everything to an LLM?**
It would give a different answer each run, it's hard to audit, and it's prone to guessing an owner for the Mumbai lease. The deterministic core makes each rule inspectable and testable. Claude sits on top for flexibility and only reads through tools.

**How does de-duplication work?**
Items are keyed on (topic, owner, kind), not on wording. The topic comes from the thread subject, keyword overlap or coreference. The owner comes from speech acts. So "I'd send him the updated vendor list", "will send first thing tomorrow" and "need to get Raghav that vendor list" all land on *T1 · Arjun · deliverable*.

**How is the deadline chosen when sources disagree?**
Each statement is stored with who said it and its type. The effective deadline is the latest *firm* statement (promised, agreed, revised or restated). A request alone doesn't set it, and a private voice note can't relax a promise made to someone else. Disagreements are raised as "mixed signals" or "date changed N×".

**What if the phrasing was different?**
The lexicon and temporal rules are general (they cover "can you", "I'll", "instead of", "before <event>", and so on), but they are tuned to this data. At scale, LLM extraction replaces stage 2 using the same schema and the same grounding test. See ARCHITECTURE.md → *Limits and next steps*.

**How do you know nothing is invented?**
The `grounding` test checks every citation id and every deadline phrase against the source text. Owners only come from explicit requests or commitments.

**What's "as of" for?**
The brief says to track how close deadlines are. As-of fixes a moment in the week and replays only what was known by then, so overdue and countdowns are correct and there's no hindsight.

## Demo video checklist (Drive, open access)
1. Record the flow above at 1080p (Windows: Win+Alt+R, or OBS).
2. Upload to Google Drive → Share → *Anyone with the link → Viewer*.
3. Put the link in the README and on the last slide.
