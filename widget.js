// S&P500 売買判断ウィジェット(iPhone Scriptable 用)
// 小サイズ：判定とスコア ／ 中・大サイズ：4指標の内訳つき
const BASE = "https://yuki915srky518-collab.github.io/sp500-signal/";

const C = {
  bg: Color.dynamic(new Color("#ffffff"), new Color("#1c1c1e")),
  ink: Color.dynamic(new Color("#0b0b0b"), new Color("#ffffff")),
  sub: Color.dynamic(new Color("#52514e"), new Color("#c3c2b7")),
  muted: new Color("#898781"),
  buy: Color.dynamic(new Color("#2a78d6"), new Color("#3987e5")),
  buyStrong: Color.dynamic(new Color("#184f95"), new Color("#86b6ef")),
  sell: Color.dynamic(new Color("#e34948"), new Color("#e66767")),
  sellStrong: Color.dynamic(new Color("#a8302f"), new Color("#f19c9b"))
};
const judgeColor = cls => ({ sb: C.buyStrong, b: C.buy, s: C.sell, ss: C.sellStrong }[cls] || C.sub);
const stateColor = st => st === "buy" ? C.buy : st === "sell" ? C.sell : C.muted;
const signed = (v, d) => v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(d);

// 取得(失敗したら前回の保存分を使う)
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "sp500-signal-summary.json");
let data = null, stale = false;
try {
  const req = new Request(BASE + "summary.json?t=" + Date.now());
  req.timeoutInterval = 20;
  data = await req.loadJSON();
  if (!data || data.score == null) throw new Error("bad data");
  fm.writeString(cachePath, JSON.stringify(data));
} catch (e) {
  if (fm.fileExists(cachePath)) { data = JSON.parse(fm.readString(cachePath)); stale = true; }
}

const w = new ListWidget();
w.backgroundColor = C.bg;
w.url = BASE;
w.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);
const family = config.widgetFamily || "medium";

function addText(stack, text, size, color, bold) {
  const t = stack.addText(text);
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}

function mainBlock(stack, big) {
  const head = stack.addStack();
  addText(head, "S&P500", 12, C.sub, true);
  head.addSpacer();
  addText(head, data.date.slice(5).replace("-", "/"), 11, C.muted, false);
  stack.addSpacer(big ? 6 : 4);
  addText(stack, `${data.judgment.icon} ${data.judgment.label}`, big ? 24 : 20, judgeColor(data.judgment.cls), true);
  const sc = stack.addStack();
  sc.bottomAlignContent();
  addText(sc, signed(data.score, 1), big ? 30 : 26, C.ink, true);
  sc.addSpacer(3);
  addText(sc, "点", 12, C.sub, false);
  stack.addSpacer();
  if (data.prev) addText(stack, `前日 ${signed(data.prev.score, 1)}(${data.prev.label})`, 10, C.muted, false);
  if (stale || data.fgStale) addText(stack, stale ? "※前回取得分" : "※F&Gは前回値", 9, C.sell, false);
}

if (!data) {
  addText(w, "S&P500 売買判断", 12, C.sub, true);
  w.addSpacer(6);
  addText(w, "データを取得できませんでした", 12, C.ink, false);
} else if (family === "small") {
  w.setPadding(14, 14, 12, 14);
  mainBlock(w, false);
} else {
  w.setPadding(14, 16, 14, 16);
  const row = w.addStack();
  row.layoutHorizontally();
  const left = row.addStack();
  left.layoutVertically();
  left.size = new Size(128, 0);
  mainBlock(left, true);
  row.addSpacer(12);
  const right = row.addStack();
  right.layoutVertically();
  right.centerAlignContent();
  for (const ind of data.indicators) {
    const r = right.addStack();
    r.centerAlignContent();
    const n = r.addStack(); n.size = new Size(52, 0);
    addText(n, ind.name, 12, C.sub, false);
    const v = r.addStack(); v.size = new Size(56, 0);
    v.addSpacer();
    addText(v, ind.text, 12, C.ink, true);
    r.addSpacer();
    const mark = ind.state === "buy" ? "▲" : ind.state === "sell" ? "▼" : "―";
    const pts = ind.state === "buy" ? ind.buy : ind.state === "sell" ? ind.sell : 0;
    addText(r, `${mark}${pts.toFixed(1)}`, 12, stateColor(ind.state), true);
    right.addSpacer(5);
  }
}

if (config.runsInWidget) Script.setWidget(w);
else if (family === "small") await w.presentSmall();
else await w.presentMedium();
Script.complete();
