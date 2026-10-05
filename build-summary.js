// data.js と signal.js から、ウィジェット用の summary.json を作る(GitHub Actions で実行)
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Signal = require("./signal.js");

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "data.js"), "utf8"), ctx);
const D = ctx.window.MARKET_DATA;
const S = Signal.DEFAULTS;

const rows = Signal.compute(D, S);
const last = rows[rows.length - 1];
const prev = rows[rows.length - 2];
const r2 = v => v == null ? null : Math.round(v * 100) / 100;
const signed = (v, d) => v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(d);
const state = p => !p.ok ? "none" : p.buy > 0 ? "buy" : p.sell > 0 ? "sell" : "neutral";

const indicators = [
  { key: "fg", name: "F&G", value: last.fg, text: last.fg == null ? "—" : last.fg.toFixed(1) },
  { key: "ma", name: `${S.ma.period}日線`, value: last.dev, text: signed(last.dev, 1) + (last.dev == null ? "" : "%") },
  { key: "rci", name: "RCI", value: last.rs, text: signed(last.rs, 1) },
  { key: "skew", name: "SKEW", value: last.skew, text: last.skew == null ? "—" : last.skew.toFixed(1) }
].map(x => {
  const p = last.parts[x.key];
  return { ...x, value: r2(x.value), buy: r2(p.buy), sell: r2(p.sell), points: r2(p.buy - p.sell), state: state(p) };
});

const j = Signal.judge(last.score, S.judge);
const summary = {
  date: last.date,
  fetchedAt: D.fetchedAt,
  score: r2(last.score),
  buy: r2(last.buy),
  sell: r2(last.sell),
  judgment: j,
  prev: prev ? { date: prev.date, score: r2(prev.score), label: Signal.judge(prev.score, S.judge).label } : null,
  indicators,
  thresholds: S.judge,
  fgStale: !!D.fgError,
  generatedAt: new Date().toISOString()
};
fs.writeFileSync(path.join(__dirname, "summary.json"), JSON.stringify(summary, null, 1));
console.log(`summary.json: ${summary.date} ${j.label} ${summary.score}`);
