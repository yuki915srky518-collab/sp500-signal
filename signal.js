// S&P500 売買判断：判定基準と点数計算(index.html・build-summary.js 共通)
// しきい値を変えるときは DEFAULTS を書き換える
(function (root) {
  "use strict";

  // ---------- 設定 ----------
  const MAX_PT = 5;
  const DEFAULTS = {
    fg:    { buyStart: 30, buyFull: 15, sellStart: 70, sellFull: 80 },
    ma:    { period: 50, buyFull: -5, sellFull: 5 },
    rci:   { short: 10, long: 30, buyStart: -60, buyFull: -90, sellStart: 60, sellFull: 95 },
    skew:  { buyStart: 130, buyFull: 120, sellStart: 150, sellFull: 160 },
    judge: { strongBuy: 11.5, buy: 6, sell: -8, strongSell: -10.5 }
  };

  // ---------- 計算 ----------
  const clamp01 = x => Math.max(0, Math.min(1, x));
  // start から full に向かって 0→MAX_PT(向きは自動)
  const ramp = (x, start, full) => full === start ? (x === start ? MAX_PT : 0) : MAX_PT * clamp01((x - start) / (full - start));

  function sortDedupe(pairs) {
    const m = new Map();
    for (const p of pairs || []) if (p && p[1] != null) m.set(p[0], +p[1]);
    return [...m.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
  }
  function sma(arr, n) {
    const out = new Array(arr.length).fill(null);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      if (i >= n) sum -= arr[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }
  // RCI：日付順位(新しい=1)と価格順位(高い=1、同値は平均順位)のスピアマン順位相関×100
  function rci(arr, n) {
    const out = new Array(arr.length).fill(null);
    for (let i = n - 1; i < arr.length; i++) {
      const w = arr.slice(i - n + 1, i + 1);
      const sorted = [...w].sort((a, b) => b - a);
      let d2 = 0;
      for (let j = 0; j < n; j++) {
        const first = sorted.indexOf(w[j]);
        let cnt = 0;
        for (const v of sorted) if (v === w[j]) cnt++;
        const priceRank = first + 1 + (cnt - 1) / 2;
        const timeRank = n - j;
        d2 += (timeRank - priceRank) ** 2;
      }
      out[i] = 100 * (1 - 6 * d2 / (n * (n * n - 1)));
    }
    return out;
  }
  // 日付に合わせて直近値を当てる(7日以上空いたら欠損)
  function alignTo(dates, pairs) {
    const out = new Array(dates.length).fill(null);
    let k = -1;
    for (let i = 0; i < dates.length; i++) {
      while (k + 1 < pairs.length && pairs[k + 1][0] <= dates[i]) k++;
      if (k >= 0 && (Date.parse(dates[i]) - Date.parse(pairs[k][0])) / 864e5 <= 7) out[i] = pairs[k][1];
    }
    return out;
  }

  function scoreRow(r, S) {
    const p = {};
    // Fear & Greed
    if (r.fg == null) p.fg = { buy: 0, sell: 0, ok: false };
    else p.fg = {
      buy: r.fg <= S.fg.buyStart ? ramp(r.fg, S.fg.buyStart, S.fg.buyFull) : 0,
      sell: r.fg >= S.fg.sellStart ? ramp(r.fg, S.fg.sellStart, S.fg.sellFull) : 0, ok: true };
    // 移動平均線(終値が線より下＝買い、上＝売り)
    if (r.dev == null) p.ma = { buy: 0, sell: 0, ok: false };
    else p.ma = {
      buy: r.dev < 0 ? ramp(r.dev, 0, S.ma.buyFull) : 0,
      sell: r.dev > 0 ? ramp(r.dev, 0, S.ma.sellFull) : 0, ok: true };
    // RCI
    if (r.rs == null || r.rl == null) p.rci = { buy: 0, sell: 0, ok: false };
    else p.rci = {
      buy: (r.rs < r.rl && r.rs <= S.rci.buyStart) ? ramp(r.rs, S.rci.buyStart, S.rci.buyFull) : 0,
      sell: (r.rs > r.rl && r.rs >= S.rci.sellStart) ? ramp(r.rs, S.rci.sellStart, S.rci.sellFull) : 0, ok: true };
    // SKEW
    if (r.skew == null) p.skew = { buy: 0, sell: 0, ok: false };
    else p.skew = {
      buy: r.skew <= S.skew.buyStart ? ramp(r.skew, S.skew.buyStart, S.skew.buyFull) : 0,
      sell: r.skew >= S.skew.sellStart ? ramp(r.skew, S.skew.sellStart, S.skew.sellFull) : 0, ok: true };
    r.parts = p;
    r.buy = p.fg.buy + p.ma.buy + p.rci.buy + p.skew.buy;
    r.sell = p.fg.sell + p.ma.sell + p.rci.sell + p.skew.sell;
    r.score = r.buy - r.sell;
    r.complete = p.fg.ok && p.ma.ok && p.rci.ok && p.skew.ok;
    return r;
  }

  function judge(score, J) {
    if (score >= J.strongBuy) return { cls: "sb", label: "強い買い", icon: "▲▲" };
    if (score >= J.buy) return { cls: "b", label: "買い", icon: "▲" };
    if (score <= J.strongSell) return { cls: "ss", label: "強い売り", icon: "▼▼" };
    if (score <= J.sell) return { cls: "s", label: "売り", icon: "▼" };
    return { cls: "n", label: "様子見", icon: "―" };
  }

  function compute(D, S) {
    const sp = sortDedupe(D.gspc);
    const dates = sp.map(p => p[0]), close = sp.map(p => p[1]);
    const ma = sma(close, Math.max(2, Math.round(S.ma.period)));
    const rs = rci(close, Math.max(3, Math.round(S.rci.short)));
    const rl = rci(close, Math.max(3, Math.round(S.rci.long)));
    const skew = alignTo(dates, sortDedupe(D.skew));
    let fgPairs = [];
    if (D.fg) {
      fgPairs = (D.fg.history || []).slice();
      if (D.fg.current && D.fg.current.score != null) fgPairs.push([D.fg.current.date, D.fg.current.score]);
    }
    const fg = alignTo(dates, sortDedupe(fgPairs));
    return dates.map((d, i) => scoreRow({
      date: d, close: close[i], ma: ma[i],
      dev: ma[i] == null ? null : 100 * (close[i] - ma[i]) / ma[i],
      rs: rs[i], rl: rl[i], skew: skew[i], fg: fg[i]
    }, S));
  }

  const fgLabel = v => v == null ? "" : v < 25 ? "極度の恐怖" : v < 45 ? "恐怖" : v <= 55 ? "中立" : v <= 75 ? "強欲" : "極度の強欲";

  // ---------- ウィジェット用コード(例 v1:30,15,70,80|50,-5,5|...) ----------
  const CODE_ORDER = [
    ["fg", ["buyStart", "buyFull", "sellStart", "sellFull"]],
    ["ma", ["period", "buyFull", "sellFull"]],
    ["rci", ["short", "long", "buyStart", "buyFull", "sellStart", "sellFull"]],
    ["skew", ["buyStart", "buyFull", "sellStart", "sellFull"]],
    ["judge", ["strongBuy", "buy", "sell", "strongSell"]]
  ];
  function encodeSettings(S) {
    return "v1:" + CODE_ORDER.map(([g, ks]) => ks.map(k => +S[g][k]).join(",")).join("|");
  }
  function decodeSettings(code) {
    const m = String(code || "").trim().match(/^v1:(.+)$/);
    if (!m) return null;
    const parts = m[1].split("|");
    if (parts.length !== CODE_ORDER.length) return null;
    const S = {};
    for (let i = 0; i < CODE_ORDER.length; i++) {
      const [g, ks] = CODE_ORDER[i];
      const vals = parts[i].split(",").map(Number);
      if (vals.length !== ks.length || vals.some(v => !isFinite(v))) return null;
      S[g] = {};
      ks.forEach((k, j) => { S[g][k] = vals[j]; });
    }
    return S;
  }
  const isDefault = S => encodeSettings(S) === encodeSettings(DEFAULTS);

  // ---------- ウィジェット用の要約 ----------
  function summarize(D, S) {
    const rows = compute(D, S);
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
      return Object.assign({}, x, { value: r2(x.value), buy: r2(p.buy), sell: r2(p.sell), points: r2(p.buy - p.sell), state: state(p) });
    });
    return {
      date: last.date,
      fetchedAt: D.fetchedAt,
      score: r2(last.score),
      buy: r2(last.buy),
      sell: r2(last.sell),
      judgment: judge(last.score, S.judge),
      prev: prev ? { date: prev.date, score: r2(prev.score), label: judge(prev.score, S.judge).label } : null,
      indicators,
      thresholds: S.judge,
      custom: !isDefault(S),
      fgStale: !!D.fgError,
      generatedAt: new Date().toISOString()
    };
  }

  const api = { MAX_PT, DEFAULTS, compute, judge, fgLabel, encodeSettings, decodeSettings, isDefault, summarize };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Signal = api;
})(typeof window !== "undefined" ? window : this);
