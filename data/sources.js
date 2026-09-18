/*
 * Data Pack — Assignment 1: Executive Productivity Agent
 * Transcribed verbatim from the printed data pack (week of Mon 21 – Fri 25 Sep 2026).
 * This file is the ONLY source of truth the agent reads. Nothing else is invented.
 *
 * Time convention: all timestamps are local office time, written as
 * "YYYY-MM-DDTHH:MM" with no timezone (see docs/INPUTS_AND_ASSUMPTIONS.md).
 */
(function (EPA) {
  EPA.SOURCES = {
    week: { start: "2026-09-21", end: "2026-09-25" },

    user: "arjun",

    people: [
      { id: "arjun", name: "Arjun Malhotra", first: "Arjun", role: "VP Sales (the agent's user)", email: "arjun.malhotra@veridian-corp.example", org: "Veridian" },
      { id: "neha", name: "Neha Kapoor", first: "Neha", role: "Marketing Lead", email: "neha.kapoor@veridian-corp.example", org: "Veridian" },
      { id: "raghav", name: "Raghav Sethi", first: "Raghav", role: "Ops Manager", email: "raghav.sethi@veridian-corp.example", org: "Veridian" },
      { id: "divya", name: "Divya Rao", first: "Divya", role: "Finance", email: "divya.rao@veridian-corp.example", org: "Veridian" },
      { id: "priya", name: "Priya Nair", first: "Priya", role: "Meridian Logistics (external client)", email: "priya.nair@meridianlogistics.example", org: "Meridian Logistics", aliases: ["meridian"] },
      { id: "facilities", name: "Facilities", first: "Facilities", role: "Internal distribution list", email: "facilities@veridian-corp.example", org: "Veridian", isList: true }
    ],

    // 1. Meeting transcript
    meetings: [
      {
        id: "MTG1",
        title: "Leadership Sync",
        start: "2026-09-21T09:00",
        end: "2026-09-21T09:35",
        attendees: ["arjun", "neha", "raghav", "divya"],
        utterances: [
          { speaker: "arjun", text: "Let's keep this quick. Neha, where are we on the Q3 campaign deck?" },
          { speaker: "neha", text: "Draft is 80% done. I'll send it to Arjun for review by Wednesday." },
          { speaker: "arjun", text: "Good. Also, remind me — I told Raghav I'd send him the updated vendor list. I'll get that to him by end of day tomorrow." },
          { speaker: "raghav", text: "Appreciated. Separately, the Mumbai office renewal paperwork needs someone to sign off this week. Not sure whose desk that's on right now." },
          { speaker: "divya", text: "I think that's supposed to be Facilities, but I haven't seen anyone pick it up." },
          { speaker: "arjun", text: "Okay, flag it, don't assume. Divya, can you also pull the July expense variance report before Thursday's board prep?" },
          { speaker: "divya", text: "Yes, I'll have it ready Wednesday evening." },
          { speaker: "arjun", text: "One more thing — client call with Meridian Logistics got pushed. I need to reconfirm the new time with their team myself." },
          { speaker: "neha", text: "Also, just a reminder, the campaign deck review — I said Wednesday, but realistically Thursday morning is safer." },
          { speaker: "arjun", text: "Noted. Let's close here." }
        ]
      }
    ],

    // 2. Calendars
    calendars: {
      arjun: [
        { start: "2026-09-21T09:00", end: "2026-09-21T09:35", title: "Leadership Sync" },
        { start: "2026-09-21T14:00", end: "2026-09-21T14:30", title: "1:1 with Neha" },
        { start: "2026-09-21T16:00", end: "2026-09-21T17:00", title: "Blocked" },
        { start: "2026-09-22T11:00", end: "2026-09-22T12:00", title: "Internal Budget Review" },
        { start: "2026-09-22T15:00", end: "2026-09-22T15:30", title: "Blocked" },
        { start: "2026-09-23T15:00", end: "2026-09-23T15:30", title: "Call — Meridian Logistics" },
        { start: "2026-09-23T18:00", end: "2026-09-23T18:15", title: "Blocked" },
        { start: "2026-09-24T09:00", end: "2026-09-24T10:00", title: "Board Prep Session" },
        { start: "2026-09-24T16:00", end: "2026-09-24T17:00", title: "Hiring Panel — Sales Associate" },
        { start: "2026-09-25T10:00", end: "2026-09-25T10:30", title: "Facilities Check-in" },
        { start: "2026-09-25T13:00", end: "2026-09-25T14:00", title: "Blocked" }
      ],
      neha: [
        { start: "2026-09-21T10:00", end: "2026-09-21T11:00", title: "Blocked" },
        { start: "2026-09-21T14:00", end: "2026-09-21T14:30", title: "1:1 with Arjun" },
        { start: "2026-09-22T13:00", end: "2026-09-22T14:00", title: "Campaign Vendor Call" },
        { start: "2026-09-23T10:00", end: "2026-09-23T10:30", title: "Deck Prep" },
        { start: "2026-09-23T13:00", end: "2026-09-23T15:00", title: "Blocked" },
        { start: "2026-09-24T09:30", end: "2026-09-24T10:00", title: "Deck Review with Arjun" },
        { start: "2026-09-25T11:00", end: "2026-09-25T12:00", title: "Blocked" }
      ],
      raghav: [
        { start: "2026-09-21T09:00", end: "2026-09-21T09:35", title: "Leadership Sync" },
        { start: "2026-09-21T13:00", end: "2026-09-21T14:00", title: "Blocked" },
        { start: "2026-09-22T11:00", end: "2026-09-22T12:00", title: "Internal Budget Review" },
        { start: "2026-09-22T15:30", end: "2026-09-22T16:00", title: "Ops Standup" },
        { start: "2026-09-23T09:00", end: "2026-09-23T11:00", title: "Blocked" },
        { start: "2026-09-24T14:00", end: "2026-09-24T15:00", title: "Blocked" },
        { start: "2026-09-25T10:00", end: "2026-09-25T10:30", title: "Facilities Check-in" },
        { start: "2026-09-25T15:00", end: "2026-09-25T16:00", title: "Blocked" }
      ],
      divya: [
        { start: "2026-09-21T14:30", end: "2026-09-21T15:00", title: "Budget Prep" },
        { start: "2026-09-21T16:00", end: "2026-09-21T17:00", title: "Blocked" },
        { start: "2026-09-22T09:00", end: "2026-09-22T09:15", title: "Quick Call with Arjun" },
        { start: "2026-09-22T11:00", end: "2026-09-22T12:00", title: "Internal Budget Review" },
        { start: "2026-09-23T13:00", end: "2026-09-23T14:00", title: "Blocked" },
        { start: "2026-09-24T09:00", end: "2026-09-24T10:00", title: "Board Prep Session" },
        { start: "2026-09-24T14:00", end: "2026-09-24T15:00", title: "Blocked" },
        { start: "2026-09-25T10:00", end: "2026-09-25T11:00", title: "Blocked" }
      ]
    },

    // 3. Email threads (5 subjects x 5 emails)
    threads: [
      {
        id: "T1", subject: "Vendor List",
        emails: [
          { at: "2026-09-21T09:50", from: "raghav", to: ["arjun"], text: "Following up from the sync — can you send the updated vendor list today?" },
          { at: "2026-09-21T17:40", from: "arjun", to: ["raghav"], text: "Running behind, will send first thing tomorrow morning instead." },
          { at: "2026-09-22T09:15", from: "raghav", to: ["arjun"], text: "No worries, whenever you get a chance today works." },
          { at: "2026-09-22T18:30", from: "arjun", to: ["raghav"], text: "Sorry, got pulled into board prep — will send by tomorrow (Wednesday) morning for sure." },
          { at: "2026-09-23T08:45", from: "raghav", to: ["arjun"], text: "Just checking — still good for this morning?" }
        ]
      },
      {
        id: "T2", subject: "Q3 Campaign Deck",
        emails: [
          { at: "2026-09-21T11:00", from: "neha", to: ["arjun"], text: "Deck's coming together, still targeting Wednesday for your review." },
          { at: "2026-09-22T16:15", from: "neha", to: ["arjun"], text: "Heads up — shifting the review to Thursday morning instead of Wednesday, need one more day on the data slides." },
          { at: "2026-09-23T10:00", from: "arjun", to: ["neha"], text: "Understood, Thursday morning works. What time exactly?" },
          { at: "2026-09-23T10:20", from: "neha", to: ["arjun"], text: "Let's say 9:30 AM Thursday, before your board prep block." },
          { at: "2026-09-24T08:00", from: "neha", to: ["arjun"], text: "Deck is ready, attaching the draft ahead of our 9:30 review." }
        ]
      },
      {
        id: "T3", subject: "Call Reschedule",
        emails: [
          { at: "2026-09-21T13:00", from: "priya", to: ["arjun"], text: "Our scheduled call this week got bumped from our side — can you propose a new time? We're flexible Tuesday–Thursday afternoons." },
          { at: "2026-09-22T15:00", from: "arjun", to: ["priya"], text: "Apologies for the delay — how about Wednesday 3:00 PM?" },
          { at: "2026-09-22T17:45", from: "priya", to: ["arjun"], text: "Wednesday 3 PM works on our end, confirmed." },
          { at: "2026-09-23T13:30", from: "priya", to: ["arjun"], text: "Quick check — still on for 3 PM today?" },
          { at: "2026-09-23T14:00", from: "arjun", to: ["priya"], text: "Yes, confirmed, see you at 3." }
        ]
      },
      {
        id: "T4", subject: "Expense Variance Report",
        emails: [
          { at: "2026-09-21T14:30", from: "divya", to: ["arjun"], text: "Starting on the July variance numbers, targeting Thursday morning for board prep as discussed." },
          { at: "2026-09-22T09:00", from: "arjun", to: ["divya"], text: "Actually, can I get it by Wednesday evening instead? Want time to review before Thursday." },
          { at: "2026-09-22T09:40", from: "divya", to: ["arjun"], text: "Wednesday evening is tight but doable, I'll prioritize it." },
          { at: "2026-09-23T18:00", from: "divya", to: ["arjun"], text: "Report attached, sent as promised." },
          { at: "2026-09-23T18:10", from: "arjun", to: ["divya"], text: "Got it, thank you — exactly what I needed before tomorrow." }
        ]
      },
      {
        id: "T5", subject: "Mumbai Office Lease Renewal",
        emails: [
          { at: "2026-09-21T10:15", from: "facilities", to: ["all-staff"], text: "Reminder: the Mumbai office lease renewal requires an authorized signature by Friday, 25 September." },
          { at: "2026-09-22T11:00", from: "raghav", to: ["arjun", "divya"], text: "Following up from the sync — has anyone confirmed who's signing off on the Mumbai renewal? Don't think it's been assigned." },
          { at: "2026-09-23T09:30", from: "divya", to: ["raghav", "arjun"], text: "Not on my end — I believe this typically sits with Facilities directly, not us." },
          { at: "2026-09-24T16:00", from: "facilities", to: ["all-staff"], text: "Second reminder: signature is still pending. Deadline is Friday, 25 September, end of day." },
          { at: "2026-09-24T16:45", from: "raghav", to: ["arjun"], text: "This is now one day out and still unowned — can you confirm who's handling it?" }
        ]
      }
    ],

    // 4. Voice notes — recorded by Arjun, for himself (treated like Arjun's own meeting statements)
    voiceNotes: [
      { id: "VN1", at: "2026-09-21T18:40", speaker: "arjun", context: "recorded in cab", text: "Quick note to self — need to get Raghav that vendor list, I think I said today but it might slip to tomorrow morning, remind me. Also still haven't heard back on the Mumbai lease thing, someone needs to own that, I don't think it's me." },
      { id: "VN2", at: "2026-09-23T08:15", speaker: "arjun", context: "", text: "Reminder — expense variance report from Divya needs to be in my hands by Wednesday evening, not Thursday. I want time to go through it before board prep. Also Meridian call — I owe Priya a time, need to lock that in today." }
    ]
  };
})(typeof window !== "undefined" ? (window.EPA = window.EPA || {}) : (globalThis.EPA = globalThis.EPA || {}));
