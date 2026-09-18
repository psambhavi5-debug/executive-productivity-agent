// Node entry point: loads the browser-compatible engine files into one namespace.
const files = ["../../data/sources.js", "./util.js", "./ingest.js", "./temporal.js", "./extract.js", "./calendar.js", "./reason.js", "./brief.js", "./qa.js", "./agent.js"];
files.forEach((f) => require(f));
module.exports = globalThis.EPA;
