# Inputs, sources and assumptions

## Inputs
All inputs come from the printed **Data Pack — Assignment 1**. They were transcribed word for word into [`data/sources.js`](../data/sources.js). The agent reads nothing else, and nothing in the outputs comes from outside the data pack.

| Source | Ids | Count | Notes |
|---|---|---|---|
| People and email addresses | `people[]` | 6 | Arjun (the user), Neha, Raghav, Divya, Priya (external client, Meridian Logistics), Facilities (a **distribution list**, not a person) |
| Meeting transcript: Leadership Sync, Mon 21 Sep, 9:00–9:35 AM | `MTG1.U1`–`MTG1.U10` | 10 utterances | Attendees: Arjun, Neha, Raghav, Divya |
| Calendars, week of 21–25 Sep | `CAL.<person>.<n>` | 34 entries | Arjun 11, Neha 7, Raghav 8, Divya 8 |
| Email threads | `T1.E1`–`T5.E5` | 25 emails | T1 Vendor List · T2 Q3 Campaign Deck · T3 Call Reschedule · T4 Expense Variance Report · T5 Mumbai Office Lease Renewal |
| Voice notes (Arjun to himself) | `VN1`, `VN2` | 2 | Mon 21 Sep 6:40 PM (in cab), Wed 23 Sep 8:15 AM |

Each record is split into **clauses** at sentence and em-dash boundaries (71 in total). Citations point to the record id, and the UI shows the full text.

## Assumptions

### Time
| Assumption | Why |
|---|---|
| All times are local office time in a single timezone | The data pack gives no timezone. The engine stores times timezone-free, so results don't depend on the machine running it. |
| **"Today" = the as-of moment chosen in the UI** (default Thu 24 Sep, 8:30 AM) | The brief says to use the week's dates to track how close deadlines are. The real date is outside the week, so the user picks a moment inside it. |
| The agent only uses statements made **up to** as-of | This keeps "overdue" honest (no hindsight). Calendars count as known all week because they're schedules. |
| Meeting statements are timestamped at the meeting start (Mon 9:00 AM) | The transcript gives no times for individual utterances. |
| first thing = **9:00 AM**; morning = **by 12:00 PM**; end of day / a bare day ("by Wednesday") = **6:00 PM**; afternoon = 5:00 PM; evening / tonight = **9:00 PM**; "this week" = **Fri 6:00 PM** | Business-day conventions. They are documented and the same everywhere, and they're easy to change in `temporal.js`. |
| "before <event>" = the start of that event on Arjun's calendar | "before Thursday's board prep" → Thu 9:00 AM (Board Prep Session). |
| "before <day>" = the start of that day | "review before Thursday" → Thu 12:00 AM. |
| A bare hour 1–7 with no am/pm = PM | "see you at 3" → 3:00 PM. |
| Agreed meetings with no stated length last 30 minutes | Used only to check for clashes. |

### Language and ownership
| Assumption | Why |
|---|---|
| **Voice notes are Arjun's own statements** (commitments and open items), not instructions from someone else | Stated in the data pack. |
| A private voice note **never relaxes** a promise made to someone else | VN1 "might slip to tomorrow morning" doesn't override the email to Raghav: "first thing tomorrow morning". |
| When several dates appear in one clause, a clock time wins; otherwise the **last** one that isn't negated wins | "I said Wednesday, but realistically Thursday morning is safer" → Thursday. Negations like "not Thursday" and "instead of Wednesday" are dropped. |
| Availability ranges are not deadlines | "We're flexible Tuesday–Thursday afternoons" is ignored as a deadline. |
| A request makes the **addressee** the owner. A commitment makes the **speaker** the owner. | "Divya, can you also pull…" → Divya owns it. |
| A suggestion is **not** ownership | "supposed to be Facilities" / "typically sits with Facilities" → Facilities is an *unconfirmed candidate*. Facilities' own emails only send reminders and never claim the work, so the lease stays **unowned**. |
| A scheduling commitment is done when the counterpart confirms the proposed time | Priya: "Wednesday 3 PM works on our end, confirmed." |
| A delivery "for review" creates a review action for the recipient | Neha delivers the deck "ahead of our 9:30 review" → Arjun: *Review Q3 Campaign Deck*, due Thu 9:30. |
| A reply is owed when the last message in a thread is a question addressed only to Arjun | T1.E5 "still good for this morning?", T5.E5 "can you confirm who's handling it?" |

### Data-pack transcription
| Item | Assumption |
|---|---|
| `T2.E4` (Neha, Wed 23 Sep 10:20 AM) | The printout breaks across pages. It was read as **"Let's say 9:30 AM Thursday, before your board prep block."** This matches `T2.E5` ("ahead of our 9:30 review") and Neha's calendar ("Deck Review with Arjun", Thu 9:30–10:00). |
| Email recipients "All Staff" | Treated as a broadcast. Nobody becomes an owner from it. |

## Things the agent deliberately does *not* do
- It doesn't assign an owner to the Mumbai lease, doesn't claim the vendor list was sent (there's no evidence it was), and doesn't assume the deck review moved.
- It doesn't send emails or change calendars. It recommends, and Arjun acts.

## What the data shows (as of Thu 24 Sep, 8:30 AM)
| # | Finding | Evidence |
|---|---|---|
| 1 | **Vendor list to Raghav is OVERDUE.** Promised by Tue EOD, then Tue 9 AM, then Wed 12 PM. The date changed twice, Raghav chased on Wed 8:45 AM, and nothing shows it was sent. | MTG1.U3, T1.E1–E5, VN1 |
| 2 | **Mumbai lease sign-off has NO OWNER**, and the deadline is Fri 25 Sep 6 PM. Arjun and Divya both disclaimed it. Facilities was suggested but never confirmed. | MTG1.U4–U6, T5.E1–E5, VN1 |
| 3 | **Clash: the deck review at 9:30 AM Thu is inside Board Prep (9–10 AM)**, and it isn't on Arjun's calendar. | T2.E4, T2.E5, CAL.neha.6, CAL.arjun.8 |
| 4 | Review the expense variance report before board prep (9 AM). Divya delivered it Wed 6 PM. | T4.E2, T4.E4, VN2 |
| 5 | Meridian call: already confirmed for Wed 3 PM. The VN2 reminder is stale. | T3.E2–E5, VN2 |
| 6 | Divya's first target (Thu morning) was after board prep. This was flagged at-risk on Mon/Tue and resolved when she agreed to Wed evening. | MTG1.U6–U7, T4.E1–E3 |
| 7 | "Quick Call with Arjun" (Tue 9 AM) is on Divya's calendar but not Arjun's. | CAL.divya.3 |
