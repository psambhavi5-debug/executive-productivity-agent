# AI tools used and how they were used

The brief allows a few AI tools. These are the ones used, what each did, and what was checked by hand.

| Tool | Where | What it did | How the output was checked |
|---|---|---|---|
| **Claude Code** (Anthropic's coding agent, Claude Opus 5) | Build time | Read the photographed brief and data pack and transcribed the data pack into `data/sources.js`. Helped design the pipeline, then wrote the engine, UI, CLI, tests, docs and the slide deck. | Transcription compared line by line against the printout, with `T2.E4` (the page break) noted as an assumption. The 13 acceptance tests in `test/agent.test.js` cover every requirement in the brief. Outputs were reviewed for each day of the week using `npm run brief -- --as-of …`. |
| **Claude API**, model `claude-opus-5` (optional) | Run time | Answers free-form questions as a **tool-use agent**. It calls `get_daily_brief`, `list_commitments`, `get_commitment`, `get_calendar`, `list_flags` and `search_sources` over the deterministic engine, then answers with `[source id]` citations. | The system prompt forbids inventing owners and dates. Claude only sees data through the tools. The UI shows which tools were called for every answer. If no key is set, the offline agent answers. |

## Why the core isn't an LLM
- **Reviewability:** a reviewer can run `npm start` with no key, account or cost, and get the same result every time.
- **No hallucinated ownership:** the key test for this assignment is *"flag unclear ownership rather than inventing it"*. Rules only make someone the owner through an explicit speech act, and suggestions are kept apart.
- **Grounding test:** every citation and every deadline phrase is checked to exist word for word in the sources (`grounding` test).
- **The LLM adds flexibility where it helps,** in open-ended questions, and has no say over the facts.

## What was done without AI
- Choosing the problem framing (commitment register + time travel + calendar cross-check).
- Checking every finding against the printed data pack (see the findings table in [INPUTS_AND_ASSUMPTIONS.md](INPUTS_AND_ASSUMPTIONS.md)).

> If you used other tools during the 6 hours (e.g. ChatGPT for slide wording, or a screen recorder with AI captions for the demo video), add them to this table before you submit.
