// data.js と signal.js から、ウィジェット用の summary.json を作る(GitHub Actions で実行)
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Signal = require("./signal.js");

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "data.js"), "utf8"), ctx);
const summary = Signal.summarize(ctx.window.MARKET_DATA, Signal.DEFAULTS);
fs.writeFileSync(path.join(__dirname, "summary.json"), JSON.stringify(summary, null, 1));
console.log(`summary.json: ${summary.date} ${summary.judgment.label} ${summary.score}`);
