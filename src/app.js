"use strict";

/* ---------- Tauri bridge (with a browser fallback for dev) ---------- */
const TAURI = window.__TAURI__;
const invoke = TAURI ? TAURI.core.invoke : async () => {};
const listen = TAURI ? TAURI.event.listen : async () => () => {};
const convertFileSrc = (p) => { try { return TAURI ? TAURI.core.convertFileSrc(p) : p; } catch (e) { return p; } };
const isImagePath = (p) => /\.(png|jpe?g|gif|bmp|webp)$/i.test(p || "");
const FILE_SVG = '<svg width="40" height="44" viewBox="0 0 40 44" xmlns="http://www.w3.org/2000/svg"><path d="M7 2h18l9 9v29a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#f1efe8" stroke="#c9b79a" stroke-width="2"/><path d="M25 2v9h9" fill="none" stroke="#c9b79a" stroke-width="2"/><line x1="11" y1="20" x2="29" y2="20" stroke="#d8d3c8" stroke-width="2.5" stroke-linecap="round"/><line x1="11" y1="27" x2="29" y2="27" stroke="#d8d3c8" stroke-width="2.5" stroke-linecap="round"/><line x1="11" y1="34" x2="23" y2="34" stroke="#d8d3c8" stroke-width="2.5" stroke-linecap="round"/></svg>';
const DRAG_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADgAAAA4CAYAAACohjseAAAABmJLR0QA/wD/AP+gvaeTAAADMklEQVRoge2azWsTQRjGf7NJbJN+6KEqQooIfvQg9mCt7aFi9aL2rv9B8T/opVI/QNCLnu3Nk2gRWpAKNgpeKsEPBCmkaAUteolF25pNm2TGy6aINDqbmY1p2N8lG9h53nl23uwDmYGQkJCQkJCKCD83z06Pn4ygxhQcA1oCmtNPIC3hdv/Z4SlTMW2D6ek7owquAI5pUV2E4GrvmeExIw2dm2anx086qJRwIk7yQA+7kl1EYttM6lakVFgn+2WeT5k0SpakkHKwd+ji82r1tFbDQV0GnOSBHvbsOxKYOYBIbBu79x4muf8ogKMc57KJnm67HQXYlewyqeWLnZ0btXpMdHQNtuI93VoRjTWVL9tMdGr2wvhfNLzBqA2R3MIcSzMT5Bc/INfXbEgCsMP7zIxcUOV8VErc7rp5TzsfjVdw6elDFsevkVuYs2puE1qAQSHUZGbkwhXdQUYrmFuYI/vkASISoXVgiER3H6I5YSJZEZXP4b57yfKzSSgVR+dHzqcO3rj/z3w0WsFvMxOgFK0DQ7QcPxWYOQDRnCDRc4K2gXMAjkJo5aORwbXFBQAS3X0mMr6Id/eXL7Xy0cigXM+D93RrhRPfqKWVjw0fE6HBrY6VoP+T5ewixbW8Fa1oUzPtHcnqx1uZxW/8yH7m6/s3VjUViu0dnVWNDVvUL9s7OhEI8u6yFb3meHt9tShAe0eS9iCEq6DhWzQ0uNUJ5Dfo5laRxZIVLScaIZ5orXq8dYNubpXvS1nbslWbDFvUL+UnXSgWrOjForH6alE8k/EghKug4Vs0NLjVqZscNM27StRdDto2GbaoX6rNQdO8q4SuwRWgrVRY19oj3HI5KOAVQPbLfOATso2WwRLcAviUSfP141uKhUB3kayiZbD/7PCUEFxVsiQ/Z9K8Tt0l/Xg8+NlZQPst2ntmeExIOQg8BVaDnZY9fL1FvfMqp8vfvZ3XuqbhczA0+A9W8LaXa4V0N2pp/bNsZLCcj+67lyYyvnDfznpXSquo2Q6vErcAlp9Nsvoihcy7JnJ/r+Xm+PkixcrzRwASqXeGzdd50c3wjnSM1vD3LEFcOnTj3nWdm38BEHbzQzZC4kIAAAAASUVORK5CYII=";

/* Keep the line from auto-rolling-up while a menu / overlay is open. */
function refreshModal() {
  const open = !$("ctx").hidden || !$("preview").hidden || !$("editor").hidden || !$("settings").hidden;
  invoke("set_modal", { on: open }).catch(() => {});
}

/* ---------- i18n ---------- */
const I18N = {
  zh: {
    all: "全部", text: "文字", link: "链接", color: "颜色", image: "图片", file: "文件",
    search: "搜索…", copied: "已复制", savedTo: "已保存到桌面", hung: "已挂上绳",
    emptyClip: "绳上还空着 — 复制点什么试试",
    emptyNotes: "绳上还没有便签 — 点上方的 + 写一张",
    plus: "新建便签", gear: "设置", prev: "上一屏", next: "下一屏", pinOnly: "只看钉住的",
    take: "取下", preview: "预览", edit: "编辑", confirmTake: "确认取下钉住的卡？",
    copy: "复制", copyImg: "复制图片", copyPath: "复制文件地址",
    pin: "钉住", unpin: "取消钉住", reveal: "在资源管理器中显示", openIt: "打开",
    openLink: "在浏览器打开", saveDesktop: "保存到桌面", toNote: "转为便签",
    editorPh: "写点什么…\n第一行是标题\n用 [] 开头的行会变成勾选项",
    editorHint: "Ctrl+S 保存 · Esc 关闭", save: "保存", remind: "提醒",
    r15: "15 分钟后", r1h: "1 小时后", rtm: "明天此时", rclr: "清除提醒",
    pinDesktop: "钉到桌面", custom: "自定义时间", setTime: "设为提醒",
    repeat: "重复", rNone: "不重复", rDaily: "每天", rWeekly: "每周", rMonthly: "每月",
    next: "下次", arrived: "提醒已到", gotit: "知道了",
    setTitle: "设置",
    secHotkeys: "快捷键", hkClip: "剪贴板绳", hkNotes: "便签绳",
    hkHint: "点击后按下组合键录制", restoreDefault: "恢复默认",
    secInvoke: "呼出方式", hoverOn: "顶边悬停呼出", dwell: "停顿时长", flip: "左右翻转修饰键",
    flipNone: "关闭", mShift: "Shift", mCtrl: "Ctrl", mAlt: "Alt",
    secClean: "自动清理", retention: "保留天数", days: "天",
    secGeneral: "常规", language: "语言", autostart: "开机自启动",
    secTheme: "主题", tSoft: "柔彩日常", tSilver: "经典银灰", tLinen: "棉麻木夹", tPorcelain: "奶白轻盈", tGraphite: "石墨金属",
    secWatch: "监听文件夹", addFolder: "添加文件夹", watchHint: "这些文件夹新增文件会自动上绳", noFolders: "（未添加）",
    secHelp: "使用说明", secAbout: "关于",
    cancel: "取消", close: "关闭", saved: "已保存",
    helpBody: [
      ["呼出", "鼠标顶到屏幕最上沿：左半出剪贴板绳、右半出便签绳；按住翻转键左右对调。或用快捷键。"],
      ["收起", "鼠标移开、点绳外空白、再按一次快捷键，或 Esc。"],
      ["单击卡片", "复制到剪贴板。"],
      ["双击卡片", "粘贴回你刚才的应用（文字自动 Ctrl+V；图片为复制）。"],
      ["右键卡片", "复制、盯住、在资源管理器显示、保存到桌面、打开、转为便签等。"],
      ["便签", "点绳中上方 + 新建；第一行为标题；[] 开头变勾选项；页脚 🔔 设提醒。"],
      ["截图", "按 PrintScreen 或 Win+Shift+S 截图会进剪贴板，自动挂上绳。"],
    ],
  },
  en: {
    all: "All", text: "Text", link: "Link", color: "Color", image: "Image", file: "File",
    search: "Search…", copied: "Copied", savedTo: "Saved to Desktop", hung: "Hung on the line",
    emptyClip: "The line is empty — copy something",
    emptyNotes: "No notes yet — click + above to write one",
    plus: "New note", gear: "Settings", prev: "Previous", next: "Next", pinOnly: "Pinned only",
    take: "Remove", preview: "Preview", edit: "Edit", confirmTake: "Remove pinned card?",
    copy: "Copy", copyImg: "Copy image", copyPath: "Copy file path",
    pin: "Pin", unpin: "Unpin", reveal: "Show in Explorer", openIt: "Open",
    openLink: "Open in browser", saveDesktop: "Save to Desktop", toNote: "Turn into note",
    editorPh: "Write something…\nFirst line is the title\nLines starting with [] become checkboxes",
    editorHint: "Ctrl+S save · Esc close", save: "Save", remind: "Remind",
    r15: "In 15 min", r1h: "In 1 hour", rtm: "Tomorrow", rclr: "Clear reminder",
    pinDesktop: "Pin to desktop", custom: "Custom time", setTime: "Set reminder",
    repeat: "Repeat", rNone: "Once", rDaily: "Daily", rWeekly: "Weekly", rMonthly: "Monthly",
    next: "Next", arrived: "Reminder due", gotit: "Got it",
    setTitle: "Settings",
    secHotkeys: "Hotkeys", hkClip: "Clipboard line", hkNotes: "Notes line",
    hkHint: "Click, then press a key combo to record", restoreDefault: "Restore defaults",
    secInvoke: "Invoke", hoverOn: "Drop on top-edge hover", dwell: "Dwell", flip: "Flip modifier",
    flipNone: "Off", mShift: "Shift", mCtrl: "Ctrl", mAlt: "Alt",
    secClean: "Auto cleanup", retention: "Keep for", days: "days",
    secGeneral: "General", language: "Language", autostart: "Launch at startup",
    secTheme: "Theme", tSoft: "Soft color", tSilver: "Classic silver", tLinen: "Linen & wood", tPorcelain: "Porcelain", tGraphite: "Graphite",
    secWatch: "Watched folders", addFolder: "Add folder", watchHint: "New files in these folders hang automatically", noFolders: "(none)",
    secHelp: "How to use", secAbout: "About",
    cancel: "Cancel", close: "Close", saved: "Saved",
    helpBody: [
      ["Invoke", "Move the pointer to the very top: left half = clipboard, right half = notes; hold the flip key to swap. Or use hotkeys."],
      ["Roll up", "Move away, click off the line, press the hotkey again, or Esc."],
      ["Click card", "Copies to the clipboard."],
      ["Double-click", "Pastes into your previous app (text auto Ctrl+V; image = copy)."],
      ["Right-click", "Copy, pin, show in Explorer, save to Desktop, open, turn into note…"],
      ["Notes", "Click + to add; first line is the title; [] starts a checkbox; 🔔 sets a reminder."],
      ["Screenshots", "PrintScreen or Win+Shift+S goes to the clipboard and hangs automatically."],
    ],
  },
};
let LANG = "zh";
const t = (k) => (I18N[LANG] && I18N[LANG][k] !== undefined ? I18N[LANG][k] : (I18N.zh[k] || k));

/* ---------- note tints ---------- */
const TINTS = [
  { key: null,     bg: "#f5f5f3", ink: "#2b2a27" },
  { key: "cream",  bg: "#faf0d6", ink: "#292624" },
  { key: "yellow", bg: "#f0e9d0", ink: "#292624" },
  { key: "orange", bg: "#efddca", ink: "#292624" },
  { key: "red",    bg: "#e9d0cb", ink: "#292624" },
  { key: "green",  bg: "#dce4d7", ink: "#292624" },
  { key: "blue",   bg: "#d3dce5", ink: "#292624" },
  { key: "black",  bg: "#c5c4c4", ink: "#292624" },
];
const tintOf = (k) => TINTS.find((x) => x.key === k) || TINTS[0];

/* ---------- state ---------- */
let state = { clips: [], notes: [] };
let cfg = { hotkey_clip: "Ctrl+Alt+C", hotkey_notes: "Ctrl+Alt+N", hover_enabled: true, dwell_ms: 250, flip_mod: "shift", retention_days: 30, lang: "zh", autostart: false, theme: "soft", watch_folders: [] };
function applyTheme(name) { stage.dataset.theme = name || "soft"; }
const ui = { deck: "clipboard", filter: "all", search: "", pinnedOnly: false, page: 0 };

const $ = (id) => document.getElementById(id);
const stage = $("stage");

/* ---------- persistence ---------- */
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => invoke("save_state", { data: JSON.stringify(state) }).catch(() => {}), 250);
}
async function load() {
  try {
    const raw = await invoke("load_state");
    if (raw) {
      const d = JSON.parse(raw);
      state.clips = Array.isArray(d.clips) ? d.clips : [];
      state.notes = Array.isArray(d.notes) ? d.notes : [];
    }
  } catch (e) {}
  try {
    const s = await invoke("get_settings");
    if (s) cfg = Object.assign(cfg, JSON.parse(s));
  } catch (e) {}
  LANG = cfg.lang === "en" ? "en" : "zh";
  cleanup();
}

function cleanup() {
  const keepMs = (cfg.retention_days || 30) * 86400000;
  const now = Date.now();
  state.clips = state.clips.filter((c) => c.pinned || now - (c.ts || now) < keepMs);
  if (state.clips.length > 300) {
    const pinned = state.clips.filter((c) => c.pinned);
    const rest = state.clips.filter((c) => !c.pinned).slice(0, 300 - pinned.length);
    state.clips = pinned.concat(rest).sort((a, b) => b.ts - a.ts);
  }
}

/* ---------- classification ---------- */
function classify(text) {
  const s = text.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return "color";
  if (/^(rgb|rgba|hsl|hsla)\([\d.,\s%/]+\)$/i.test(s)) return "color";
  if (/^(https?:\/\/|www\.)\S+$/i.test(s)) return "link";
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s) && !/\s/.test(s) && s.length < 120) return "link";
  if (/[;{}]\s*$|\n\s{2,}\S|=>|function |const |def |class |import /.test(text) && text.includes("\n")) return "code";
  return "text";
}

/* ---------- add from clipboard ---------- */
function clipSig(it) {
  if (it.vis === "image" || it.kind === "image") return "img:" + (it.thumb || it.path || "");
  if (it.vis === "file" || it.kind === "file") return "file:" + ((it.files || []).join("|"));
  return "txt:" + (it.text || "");
}
function addClip(item) {
  if (item.kind === "text") item.vis = classify(item.text || "");
  else if (item.kind === "image") item.vis = "image";
  else if (item.kind === "file") item.vis = "file";
  // Same content already on the line → drop the old one and re-hang at front.
  const sig = clipSig(item);
  const idx = state.clips.findIndex((c) => clipSig(c) === sig);
  if (idx >= 0) { item.pinned = state.clips[idx].pinned || false; state.clips.splice(idx, 1); }
  else { item.pinned = false; }
  state.clips.unshift(item);
  cleanup(); save();
  if (ui.deck === "clipboard" && !stage.classList.contains("up")) render();
}

/* ---------- rope geometry ---------- */
function ropeMetrics() { const W = window.innerWidth; return { W, sag: Math.min(30, W * 0.018), top: 36 }; }
function ropeY(x) { const { W, sag, top } = ropeMetrics(); const f = x / W; return top + 4 * sag * f * (1 - f); }
function drawRope() { const { W, sag, top } = ropeMetrics(); $("ropePath").setAttribute("d", `M0,${top} Q${W / 2},${top + 2 * sag} ${W},${top}`); }

/* ---------- filtering ---------- */
function visibleList() {
  if (ui.deck === "notes") {
    let arr = state.notes.slice();
    if (ui.pinnedOnly) arr = arr.filter((n) => n.pinned);
    if (ui.search) { const q = ui.search.toLowerCase(); arr = arr.filter((n) => (n.body || "").toLowerCase().includes(q)); }
    return arr.sort((a, b) => (b.pinned - a.pinned) || (b.ts - a.ts));
  }
  let arr = state.clips.slice();
  if (ui.filter !== "all") {
    if (ui.filter === "text") arr = arr.filter((c) => c.vis === "text" || c.vis === "code");
    else arr = arr.filter((c) => c.vis === ui.filter);
  }
  if (ui.pinnedOnly) arr = arr.filter((c) => c.pinned);
  if (ui.search) { const q = ui.search.toLowerCase(); arr = arr.filter((c) => (c.text || "").toLowerCase().includes(q)); }
  return arr.sort((a, b) => (b.pinned - a.pinned) || (b.ts - a.ts));
}

/* ---------- render ---------- */
function render() {
  drawRope();
  const isNotes = ui.deck === "notes";
  const pitch = isNotes ? 240 : 188;
  const cardsEl = $("cards");
  cardsEl.innerHTML = "";

  const list = visibleList();
  const W = window.innerWidth;
  const perPage = Math.max(1, Math.floor((W - 120) / pitch));
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  if (ui.page >= pages) ui.page = pages - 1;
  if (ui.page < 0) ui.page = 0;
  const slice = list.slice(ui.page * perPage, ui.page * perPage + perPage);
  const count = slice.length;
  const marginX = Math.max(70, (W - count * pitch) / 2);

  if (list.length === 0) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = isNotes ? t("emptyNotes") : t("emptyClip");
    cardsEl.appendChild(e);
  }

  slice.forEach((item, i) => {
    const x = marginX + (i + 0.5) * pitch;
    const el = isNotes ? buildNoteCard(item) : buildClipCard(item);
    const cardW = isNotes ? 220 : 170;
    el.style.left = `${x - cardW / 2}px`;
    el.style.top = `${ropeY(x)}px`;
    el.style.setProperty("--swing", `${(i % 2 ? 1 : -1) * (5 + (i % 3) * 2)}deg`);
    cardsEl.appendChild(el);
  });

  const total = list.length;
  const from = total ? ui.page * perPage + 1 : 0;
  const to = Math.min(total, ui.page * perPage + perPage);
  $("count").textContent = total ? `${from}–${to} / ${total}` : "0";
  $("prev").style.visibility = ui.page > 0 ? "visible" : "hidden";
  $("next").style.visibility = ui.page < pages - 1 ? "visible" : "hidden";
  renderFilters();
}

function renderFilters() {
  const el = $("filters");
  if (ui.deck === "notes") { el.innerHTML = ""; return; }
  const defs = [["all", t("all")], ["text", t("text")], ["link", t("link")], ["color", t("color")], ["image", t("image")], ["file", t("file")]];
  el.innerHTML = "";
  defs.forEach(([k, label]) => {
    const b = document.createElement("button");
    b.textContent = label;
    if (ui.filter === k) b.classList.add("on");
    b.onclick = () => { ui.filter = k; ui.page = 0; render(); };
    el.appendChild(b);
  });
}

/* ---------- clipboard card ---------- */
function buildClipCard(item) {
  const card = document.createElement("div");
  card.className = "card" + (item.pinned ? " pinned" : "");
  card.innerHTML = `<div class="peg"></div><div class="card-body"></div>`;
  const body = card.querySelector(".card-body");

  if (item.vis === "image") {
    const d = document.createElement("div"); d.className = "c-image";
    d.innerHTML = `<img src="${item.thumb || ""}" alt="">`; body.appendChild(d);
  } else if (item.vis === "color") {
    const d = document.createElement("div"); d.className = "c-color";
    const val = (item.text || "").trim();
    d.innerHTML = `<div class="swatch" style="background:${val}"></div><div class="val">${escapeHtml(val)}</div>`;
    body.appendChild(d);
  } else if (item.vis === "link") {
    const d = document.createElement("div"); d.className = "c-link";
    const url = (item.text || "").trim(); let host = url;
    try { host = new URL(url.startsWith("http") ? url : "http://" + url).host; } catch (e) {}
    d.innerHTML = `<div class="u">${escapeHtml(url)}</div><div class="host">${escapeHtml(host)}</div>`;
    body.appendChild(d);
  } else if (item.vis === "file") {
    const files = item.files || [];
    const first = files[0] || "";
    const base = first.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || first;
    const more = files.length > 1 ? `<div class="fcount">+${files.length - 1}</div>` : "";
    if (files.length === 1 && isImagePath(first)) {
      const d = document.createElement("div"); d.className = "c-image";
      d.innerHTML = `<img alt="">${more}`;
      body.appendChild(d);
      invoke("read_image_data", { path: first }).then((data) => { if (data) d.querySelector("img").src = data; }).catch(() => {});
    } else {
      const d = document.createElement("div"); d.className = "c-file";
      d.innerHTML = `<div class="ico">${FILE_SVG}</div><div class="fname">${escapeHtml(base)}</div>${more}`;
      body.appendChild(d);
    }
  } else {
    const d = document.createElement("div"); d.className = "c-text" + (item.vis === "code" ? " code" : "");
    d.textContent = item.text || ""; body.appendChild(d);
  }

  addCorners(card, body, item, false);
  body.addEventListener("click", (e) => { if (e.target.closest(".corner")) return; if (dragSuppressed()) return; copyClip(item, card); });
  body.addEventListener("dblclick", (e) => {
    if (e.target.closest(".corner")) return;
    if (item.vis === "image") { invoke("copy_image", { path: item.path }).catch(()=>{}); invoke("rollup_now"); }
    else if (item.vis === "file") { if ((item.files || [])[0]) invoke("open_path", { path: item.files[0] }).catch(()=>{}); }
    else invoke("paste_text", { text: item.text || "" }).catch(()=>{});
  });
  card.addEventListener("contextmenu", (e) => showCtx(e, item, false));
  if (item.vis === "image" || item.vis === "file") attachDragOut(card, item);
  return card;
}

/* ---------- note card ---------- */
function buildNoteCard(note) {
  const tt = tintOf(note.tint);
  const card = document.createElement("div");
  card.className = "card note wooden" + (note.pinned ? " pinned" : "");
  card.innerHTML = `<div class="peg"></div><div class="card-body"></div>`;
  const body = card.querySelector(".card-body");
  body.style.setProperty("--note-bg", tt.bg);
  body.style.setProperty("--note-ink", tt.ink);

  const inner = document.createElement("div"); inner.className = "note-inner";
  const lines = (note.body || "").split("\n");
  const title = lines.find((l) => l.trim()) || "（空白便签）";
  const rest = lines.slice(lines.indexOf(title) + 1);

  let html = `<div class="note-title">${escapeHtml(stripMark(title))}</div><div class="note-lines">`;
  rest.forEach((ln) => {
    const m = ln.match(/^\s*\[( |x|X)\]\s?(.*)$/);
    if (m) {
      const done = m[1].toLowerCase() === "x";
      html += `<div class="note-line ${done ? "done" : ""}"><span class="box" data-idx="${lines.indexOf(ln)}">${done ? "✓" : ""}</span><span>${escapeHtml(m[2])}</span></div>`;
    } else if (ln.trim()) {
      html += `<div class="note-line"><span>${escapeHtml(ln)}</span></div>`;
    }
  });
  const due = note.fired && !note.acked;
  const bellLabel = due ? t("arrived") : (note.remindAt ? t("next") + " " + fmtWhen(note.remindAt) + repeatMark(note) : "");
  html += `</div><div class="note-foot">
      <button data-act="edit">✎ ${t("edit")}</button>
      <button data-act="bell" class="bell${due ? " dot" : ""}">🔔 ${escapeHtml(bellLabel)}</button>
      ${due ? `<button data-act="ack">${t("gotit")}</button>` : ""}
    </div>`;
  inner.innerHTML = html;
  body.appendChild(inner);

  inner.querySelectorAll(".box").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); toggleCheck(note, parseInt(b.dataset.idx, 10)); }));
  inner.querySelector('[data-act="edit"]').addEventListener("click", (e) => { e.stopPropagation(); openEditor(note); });
  inner.querySelector('[data-act="bell"]').addEventListener("click", (e) => { e.stopPropagation(); showReminderPanel(e, note, () => { save(); render(); }); });
  const ackBtn = inner.querySelector('[data-act="ack"]');
  if (ackBtn) ackBtn.addEventListener("click", (e) => { e.stopPropagation(); note.acked = true; note.fired = false; note.remindAt = null; save(); render(); });

  addCorners(card, body, note, true);
  body.addEventListener("dblclick", () => openEditor(note));
  card.addEventListener("contextmenu", (e) => showCtx(e, note, true));
  return card;
}

function stripMark(s) { return s.replace(/^\s*\[( |x|X)\]\s?/, ""); }
function toggleCheck(note, lineIdx) {
  const lines = note.body.split("\n");
  const m = lines[lineIdx] && lines[lineIdx].match(/^(\s*)\[( |x|X)\](\s?.*)$/);
  if (!m) return;
  lines[lineIdx] = `${m[1]}[${m[2].toLowerCase() === "x" ? " " : "x"}]${m[3]}`;
  note.body = lines.join("\n"); note.ts = Date.now();
  save(); render();
}

/* ---------- corners ---------- */
function addCorners(card, body, item, isNote) {
  const x = document.createElement("button");
  x.className = "corner x"; x.textContent = "✕"; x.title = t("take");
  x.addEventListener("click", (e) => { e.stopPropagation(); if (item.pinned) confirmRemove(e, item, isNote); else removeItem(item, isNote); });
  body.appendChild(x);
  const mag = document.createElement("button");
  mag.className = "corner mag"; mag.textContent = isNote ? "✎" : "🔍"; mag.title = isNote ? t("edit") : t("preview");
  mag.addEventListener("click", (e) => { e.stopPropagation(); if (isNote) openEditor(item); else openPreview(item); });
  body.appendChild(mag);
}

/* ---------- copy / remove ---------- */
function copyClip(item, card) {
  if (item.vis === "image") invoke("copy_image", { path: item.path }).catch((e) => toast("复制失败: " + e));
  else if (item.vis === "file") invoke("copy_files", { paths: item.files || [] }).catch((e) => toast("复制失败: " + e));
  else invoke("copy_text", { text: item.text || "" }).catch((e) => toast("复制失败: " + e));
  flash(card);
}

/* ---------- drag out (card -> other apps / folders) ---------- */
let suppressClickUntil = 0;
function dragSuppressed() { return Date.now() < suppressClickUntil; }
function attachDragOut(card, item) {
  let sx = 0, sy = 0, armed = false, started = false;
  card.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; if (e.target.closest(".corner")) return; armed = true; started = false; sx = e.clientX; sy = e.clientY; });
  card.addEventListener("pointermove", (e) => {
    if (!armed || started) return;
    if (Math.abs(e.clientX - sx) < 6 && Math.abs(e.clientY - sy) < 6) return;
    started = true; armed = false;
    const paths = item.vis === "image" ? (item.path ? [item.path] : []) : (item.files || []);
    if (!paths.length) return;
    const icon = item.vis === "image" ? (item.thumb || DRAG_ICON) : DRAG_ICON;
    const mode = e.shiftKey ? "move" : "copy"; // Windows: Shift = move, default = copy
    suppressClickUntil = Date.now() + 500;
    try {
      window.__TAURI__.drag.startDrag({ item: paths, icon, mode }, () => {
        // Drag finished (dropped or cancelled) — get the line out of the way.
        invoke("rollup_now").catch(() => {});
      });
    } catch (err) {}
  });
  card.addEventListener("pointerup", () => { armed = false; });
  card.addEventListener("pointercancel", () => { armed = false; });
}

/* ---------- drag in (files dropped onto the line) ---------- */
function addDroppedFiles(paths) {
  if (!paths || !paths.length) return;
  const item = { id: "f" + Date.now() + "-" + Math.floor(Math.random() * 1e6), kind: "file", vis: "file", files: paths.slice(), text: paths.join("\n"), pinned: false, ts: Date.now() };
  state.clips.unshift(item); cleanup(); save();
  if (ui.deck !== "clipboard") setDeck("clipboard");
  if (!stage.classList.contains("up")) render();
  toast(t("hung"));
}
function flash(card) {
  const f = document.createElement("div"); f.className = "copied-flash"; f.textContent = t("copied");
  card.querySelector(".card-body").appendChild(f); setTimeout(() => f.remove(), 900);
}
function confirmRemove(e, item, isNote) {
  const ctx = $("ctx"); ctx.innerHTML = "";
  const b = document.createElement("button");
  b.textContent = t("confirmTake"); b.style.color = "#c0392b";
  b.onclick = () => { hideCtx(); removeItem(item, isNote); };
  ctx.appendChild(b);
  ctx.hidden = false; refreshModal();
  ctx.style.left = Math.min(e.clientX, window.innerWidth - 150) + "px";
  ctx.style.top = Math.min(e.clientY, window.innerHeight - 60) + "px";
}
function removeItem(item, isNote) {
  if (isNote) state.notes = state.notes.filter((n) => n.id !== item.id);
  else { state.clips = state.clips.filter((c) => c.id !== item.id); if (item.path) invoke("delete_file", { path: item.path }).catch(()=>{}); }
  save(); render();
}

/* ---------- context menu ---------- */
function showCtx(e, item, isNote) {
  e.preventDefault();
  const ctx = $("ctx"); ctx.innerHTML = "";
  const add = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.onclick = () => { hideCtx(); fn(); }; ctx.appendChild(b); };
  const sep = () => { const s = document.createElement("div"); s.className = "sep"; ctx.appendChild(s); };

  if (!isNote) {
    if (item.vis === "image") {
      add(t("copyImg"), () => invoke("copy_image", { path: item.path }).catch(()=>{}));
      add(t("openIt"), () => invoke("open_path", { path: item.path }).catch(()=>{}));
      add(t("reveal"), () => invoke("reveal_path", { path: item.path }).catch(()=>{}));
      add(t("copyPath"), () => { invoke("copy_text", { text: item.path || "" }).catch(()=>{}); toast(t("copied")); });
      add(t("saveDesktop"), () => saveDesktop(item));
    } else if (item.vis === "file") {
      const f0 = (item.files || [])[0] || "";
      add(t("copy"), () => invoke("copy_files", { paths: item.files || [] }).catch(()=>{}));
      add(t("openIt"), () => { if (f0) invoke("open_path", { path: f0 }).catch(()=>{}); });
      add(t("reveal"), () => { if (f0) invoke("reveal_path", { path: f0 }).catch(()=>{}); });
      add(t("copyPath"), () => { invoke("copy_text", { text: (item.files || []).join("\n") }).catch(()=>{}); toast(t("copied")); });
    } else {
      add(t("copy"), () => invoke("copy_text", { text: item.text || "" }).catch(()=>{}));
      if (item.vis === "link") add(t("openLink"), () => invoke("open_url", { url: normUrl(item.text) }).catch(()=>{}));
      add(t("toNote"), () => convertToNote(item));
      add(t("saveDesktop"), () => saveDesktop(item));
    }
  }
  add(item.pinned ? t("unpin") : t("pin"), () => { item.pinned = !item.pinned; save(); render(); });
  sep();
  add(t("take"), () => removeItem(item, isNote));

  ctx.hidden = false; refreshModal();
  const w = 170, h = ctx.offsetHeight || 160;
  ctx.style.left = Math.min(e.clientX, window.innerWidth - w) + "px";
  ctx.style.top = Math.min(e.clientY, window.innerHeight - h) + "px";
}
function hideCtx() { $("ctx").hidden = true; refreshModal(); }
function normUrl(u) { u = (u || "").trim(); return /^https?:\/\//i.test(u) ? u : "http://" + u; }

function saveDesktop(item) {
  const kind = item.vis === "image" ? "image" : "text";
  invoke("save_to_desktop", { kind, text: item.text || "", path: item.path || "" })
    .then(() => toast(t("savedTo"))).catch(() => {});
}
function convertToNote(item) {
  const note = { id: "n" + Date.now() + "-" + Math.floor(Math.random() * 1e6), tint: "yellow", body: item.text || "", pinned: false, ts: Date.now(), remindAt: null, reminded: false };
  state.notes.unshift(note); save();
  setDeck("notes"); render(); toast(t("toNote"));
}

/* ---------- preview ---------- */
let pvScale = 1;
function imagePathOf(item) {
  if (item.vis === "image") return item.path || "";
  if (item.vis === "file" && (item.files || []).length === 1 && isImagePath(item.files[0])) return item.files[0];
  return "";
}
function openPreview(item) {
  const imgPath = imagePathOf(item);
  if (imgPath) {
    // Images open in their own floating, draggable, resize-to-fit window.
    invoke("pin_image", { path: imgPath, w: item.w || 640, h: item.h || 480 }).catch((e) => toast("预览失败: " + e));
    return;
  }
  const inner = $("previewInner");
  inner.innerHTML = "";
  inner.classList.remove("is-image");
  const txt = (item.text || "").trim();
  inner.textContent = txt || "（空）";
  $("preview").hidden = false; refreshModal();
}
function closePreview() { $("preview").hidden = true; refreshModal(); }

/* ---------- note editor ---------- */
let editing = null;
function newNote() {
  editing = { id: "n" + Date.now() + "-" + Math.floor(Math.random() * 1e6), tint: null, body: "", pinned: false, ts: Date.now(), remindAt: null, reminded: false, _new: true };
  openEditorFor(editing);
}
function openEditor(note) { editing = note; openEditorFor(note); }
function openEditorFor(note) {
  const tt = tintOf(note.tint);
  const sheet = document.querySelector(".editor-sheet");
  sheet.style.setProperty("--editor-bg", tt.bg); sheet.style.setProperty("--editor-ink", tt.ink);
  const ta = $("editorBody"); ta.value = note.body || ""; ta.placeholder = t("editorPh");
  $("bellText").textContent = note.remindAt ? fmtWhen(note.remindAt) : t("remind");
  const tc = $("tints"); tc.innerHTML = "";
  TINTS.forEach((x) => {
    const d = document.createElement("div");
    d.className = "tint" + (note.tint === x.key ? " on" : "");
    d.style.background = x.bg; d.title = x.key || "默认";
    d.onclick = () => { note.tint = x.key; sheet.style.setProperty("--editor-bg", x.bg); sheet.style.setProperty("--editor-ink", x.ink); tc.querySelectorAll(".tint").forEach((z) => z.classList.remove("on")); d.classList.add("on"); };
    tc.appendChild(d);
  });
  $("editor").hidden = false; refreshModal();
  setTimeout(() => $("editorBody").focus(), 30);
}
function closeEditor() {
  if (!editing) { $("editor").hidden = true; return; }
  editing.body = $("editorBody").value; editing.ts = Date.now();
  const has = editing.body.trim().length > 0;
  if (editing._new) { delete editing._new; if (has) state.notes.unshift(editing); }
  else if (!has) { state.notes = state.notes.filter((n) => n.id !== editing.id); }
  editing = null; $("editor").hidden = true; refreshModal(); save(); render();
}

/* ---------- reminders ---------- */
function fmtTime(ms) { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
function fmtWhen(ms) {
  const d = new Date(ms), now = new Date();
  const hm = fmtTime(ms);
  if (d.toDateString() === now.toDateString()) return hm;
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")} ${hm}`;
}
function repeatMark(note) {
  switch (note.repeat) {
    case "daily": return " ·" + t("rDaily");
    case "weekly": return " ·" + t("rWeekly");
    case "monthly": return " ·" + t("rMonthly");
    default: return "";
  }
}
function setReminder(note, ms, after) {
  note.remindAt = ms; note.fired = false; note.acked = false;
  if (after) after();
}
function nextOccurrence(ms, repeat) {
  const d = new Date(ms); const now = Date.now();
  do {
    if (repeat === "daily") d.setDate(d.getDate() + 1);
    else if (repeat === "weekly") d.setDate(d.getDate() + 7);
    else if (repeat === "monthly") d.setMonth(d.getMonth() + 1);
    else return null;
  } while (d.getTime() <= now);
  return d.getTime();
}

/* A small reminder popover reused by note cards and the editor. */
function showReminderPanel(e, note, after) {
  if (!note.repeat) note.repeat = "none";
  const ctx = $("ctx"); ctx.innerHTML = "";
  const commit = () => { save(); if (after) after(); };

  const btn = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.onclick = fn; return b; };
  ctx.appendChild(btn(t("r15"), () => { setReminder(note, Date.now() + 15 * 60000); hideCtx(); commit(); }));
  ctx.appendChild(btn(t("r1h"), () => { setReminder(note, Date.now() + 60 * 60000); hideCtx(); commit(); }));
  ctx.appendChild(btn(t("rtm"), () => { setReminder(note, Date.now() + 24 * 3600000); hideCtx(); commit(); }));

  // custom datetime
  const cwrap = document.createElement("div"); cwrap.style.padding = "6px 10px";
  const lab = document.createElement("div"); lab.textContent = t("custom"); lab.style.cssText = "font-size:11px;color:#8a847b;margin-bottom:4px;";
  const inp = document.createElement("input"); inp.type = "datetime-local"; inp.className = "set-select"; inp.style.width = "100%";
  const setBtn = document.createElement("button"); setBtn.className = "btn-mini"; setBtn.textContent = t("setTime"); setBtn.style.marginTop = "6px";
  setBtn.onclick = () => { if (inp.value) { setReminder(note, new Date(inp.value).getTime()); hideCtx(); commit(); } };
  cwrap.appendChild(lab); cwrap.appendChild(inp); cwrap.appendChild(setBtn);
  ctx.appendChild(cwrap);

  // repeat row
  const rrow = document.createElement("div"); rrow.style.padding = "4px 10px 8px";
  const rl = document.createElement("div"); rl.textContent = t("repeat"); rl.style.cssText = "font-size:11px;color:#8a847b;margin-bottom:4px;";
  const seg = document.createElement("div"); seg.className = "seg";
  [["none", t("rNone")], ["daily", t("rDaily")], ["weekly", t("rWeekly")], ["monthly", t("rMonthly")]].forEach(([v, l]) => {
    const b = document.createElement("button"); b.textContent = l; if ((note.repeat || "none") === v) b.classList.add("on");
    b.onclick = () => { note.repeat = v; seg.querySelectorAll("button").forEach((z) => z.classList.remove("on")); b.classList.add("on"); save(); if (after) after(); };
    seg.appendChild(b);
  });
  rrow.appendChild(rl); rrow.appendChild(seg); ctx.appendChild(rrow);

  const s = document.createElement("div"); s.className = "sep"; ctx.appendChild(s);
  ctx.appendChild(btn(t("rclr"), () => { note.remindAt = null; note.fired = false; note.acked = false; note.repeat = "none"; hideCtx(); commit(); }));

  ctx.hidden = false; refreshModal();
  const h = ctx.offsetHeight || 300;
  ctx.style.left = Math.min(e.clientX, window.innerWidth - 240) + "px";
  ctx.style.top = Math.max(8, Math.min(e.clientY, window.innerHeight - h - 8)) + "px";
}

setInterval(() => {
  const now = Date.now(); let changed = false;
  state.notes.forEach((n) => {
    if (n.remindAt && !n.fired && now >= n.remindAt) {
      const title = (n.body || "").split("\n").find((l) => l.trim()) || t("remind");
      toast("🔔 " + stripMark(title));
      try { if (window.Notification && Notification.permission === "granted") new Notification("ClipLine", { body: stripMark(title) }); } catch (e) {}
      if (n.repeat && n.repeat !== "none") {
        const nx = nextOccurrence(n.remindAt, n.repeat);
        n.remindAt = nx; // keep pending for the next round
      } else {
        n.fired = true; n.acked = false;
      }
      changed = true;
    }
  });
  if (changed) { save(); if (!stage.classList.contains("up") && ui.deck === "notes") render(); }
}, 20000);

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg) { const el = $("toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 1800); }

/* ---------- util ---------- */
function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* ---------- settings ---------- */
let draft = null;
let capturing = null; // which hotkey input is recording
function openSettings() {
  draft = Object.assign({}, cfg);
  renderSettings();
  $("settings").hidden = false; refreshModal();
}
function closeSettings() { capturing = null; $("settings").hidden = true; applyTheme(cfg.theme); refreshModal(); }

function renderSettings() {
  $("setTitle").textContent = t("setTitle");
  const seg = (val, opts) => {
    const wrap = document.createElement("div"); wrap.className = "seg";
    opts.forEach(([v, label]) => { const b = document.createElement("button"); b.textContent = label; if (String(val) === String(v)) b.classList.add("on"); b.dataset.v = v; wrap.appendChild(b); });
    return wrap;
  };
  const row = (label, control, sub) => {
    const r = document.createElement("div"); r.className = "set-row";
    const l = document.createElement("div"); l.innerHTML = `<div class="label">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ""}`;
    r.appendChild(l); r.appendChild(control); return r;
  };
  const body = $("settingsBody"); body.innerHTML = "";

  // Hotkeys
  const s1 = section(t("secHotkeys"));
  const mkHk = (field) => {
    const inp = document.createElement("div"); inp.className = "hk-input"; inp.tabIndex = 0;
    inp.textContent = draft[field];
    inp.onclick = () => startCapture(field, inp);
    inp.dataset.field = field;
    return inp;
  };
  s1.appendChild(row(t("hkClip"), mkHk("hotkey_clip"), t("hkHint")));
  s1.appendChild(row(t("hkNotes"), mkHk("hotkey_notes")));
  const restore = document.createElement("button"); restore.className = "btn-mini"; restore.textContent = t("restoreDefault");
  restore.onclick = () => { draft.hotkey_clip = "Ctrl+Alt+C"; draft.hotkey_notes = "Ctrl+Alt+N"; renderSettings(); };
  const rr = document.createElement("div"); rr.className = "set-row"; rr.style.justifyContent = "flex-end"; rr.appendChild(restore);
  s1.appendChild(rr);
  const err = document.createElement("div"); err.className = "set-err"; err.id = "setErr"; s1.appendChild(err);
  body.appendChild(s1);

  // Invoke
  const s2 = section(t("secInvoke"));
  const hoverSw = switchEl(draft.hover_enabled, (v) => draft.hover_enabled = v);
  s2.appendChild(row(t("hoverOn"), hoverSw));
  const dwellSeg = seg(draft.dwell_ms, [[150, "0.15s"], [250, "0.25s"], [400, "0.4s"]]);
  dwellSeg.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; draft.dwell_ms = parseInt(b.dataset.v, 10); dwellSeg.querySelectorAll("button").forEach((z) => z.classList.remove("on")); b.classList.add("on"); };
  s2.appendChild(row(t("dwell"), dwellSeg));
  const flipSeg = seg(draft.flip_mod, [["none", t("flipNone")], ["shift", t("mShift")], ["ctrl", t("mCtrl")], ["alt", t("mAlt")]]);
  flipSeg.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; draft.flip_mod = b.dataset.v; flipSeg.querySelectorAll("button").forEach((z) => z.classList.remove("on")); b.classList.add("on"); };
  s2.appendChild(row(t("flip"), flipSeg));
  body.appendChild(s2);

  // Cleanup
  const s3 = section(t("secClean"));
  const retSeg = seg(draft.retention_days, [[7, "7"], [14, "14"], [30, "30"], [90, "90"]]);
  retSeg.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; draft.retention_days = parseInt(b.dataset.v, 10); retSeg.querySelectorAll("button").forEach((z) => z.classList.remove("on")); b.classList.add("on"); };
  s3.appendChild(row(t("retention"), retSeg, t("days")));
  body.appendChild(s3);

  // General
  const s4 = section(t("secGeneral"));
  const langSel = document.createElement("select"); langSel.className = "set-select";
  [["zh", "中文"], ["en", "English"]].forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; if (draft.lang === v) o.selected = true; langSel.appendChild(o); });
  langSel.onchange = () => { draft.lang = langSel.value; };
  s4.appendChild(row(t("language"), langSel));
  const autoSw = switchEl(draft.autostart, (v) => draft.autostart = v);
  s4.appendChild(row(t("autostart"), autoSw));
  body.appendChild(s4);

  // Theme
  const st = section(t("secTheme"));
  const themeSeg = document.createElement("div"); themeSeg.className = "seg"; themeSeg.style.flexWrap = "wrap";
  [["soft", t("tSoft")], ["silver", t("tSilver")], ["linen", t("tLinen")], ["porcelain", t("tPorcelain")], ["graphite", t("tGraphite")]].forEach(([v, l]) => {
    const b = document.createElement("button"); b.textContent = l; if ((draft.theme || "soft") === v) b.classList.add("on");
    b.onclick = () => { draft.theme = v; themeSeg.querySelectorAll("button").forEach((z) => z.classList.remove("on")); b.classList.add("on"); applyTheme(v); };
    themeSeg.appendChild(b);
  });
  const tr = document.createElement("div"); tr.className = "set-row"; tr.style.flexDirection = "column"; tr.style.alignItems = "stretch"; tr.appendChild(themeSeg);
  st.appendChild(tr);
  body.appendChild(st);

  // Watched folders
  const sw = section(t("secWatch"));
  const hint = document.createElement("div"); hint.className = "sub"; hint.style.marginBottom = "8px"; hint.textContent = t("watchHint");
  sw.appendChild(hint);
  const list = document.createElement("div"); list.id = "watchList";
  const renderWatch = () => {
    list.innerHTML = "";
    const fs = draft.watch_folders || [];
    if (!fs.length) { const e = document.createElement("div"); e.className = "sub"; e.textContent = t("noFolders"); list.appendChild(e); }
    fs.forEach((f, i) => {
      const r = document.createElement("div"); r.className = "set-row"; r.style.margin = "4px 0";
      const p = document.createElement("div"); p.textContent = f; p.style.cssText = "font-size:12px;word-break:break-all;flex:1;";
      const rm = document.createElement("button"); rm.className = "btn-mini"; rm.textContent = "✕";
      rm.onclick = () => { draft.watch_folders.splice(i, 1); renderWatch(); };
      r.appendChild(p); r.appendChild(rm); list.appendChild(r);
    });
  };
  renderWatch();
  sw.appendChild(list);
  const addBtn = document.createElement("button"); addBtn.className = "btn-mini"; addBtn.textContent = "+ " + t("addFolder"); addBtn.style.marginTop = "8px";
  addBtn.onclick = () => {
    invoke("pick_folder").then((p) => {
      if (p) { draft.watch_folders = draft.watch_folders || []; if (!draft.watch_folders.includes(p)) draft.watch_folders.push(p); renderWatch(); }
    }).catch(() => {});
  };
  sw.appendChild(addBtn);
  body.appendChild(sw);

  // Help
  const s5 = section(t("secHelp"));
  const help = document.createElement("div"); help.className = "set-help";
  const g = document.createElement("div"); g.className = "g";
  t("helpBody").forEach(([k, v]) => { const kk = document.createElement("div"); kk.className = "k"; kk.textContent = k; const vv = document.createElement("div"); vv.textContent = v; g.appendChild(kk); g.appendChild(vv); });
  help.appendChild(g); s5.appendChild(help); body.appendChild(s5);

  // About
  const s6 = section(t("secAbout"));
  const ab = document.createElement("div"); ab.className = "set-about";
  ab.innerHTML = "ClipLine · v1 — 晾衣绳主题剪贴板 / 便签。<br>灵感来自 Tendedero (MIT) 与 Clothespeg (Apache-2.0)；本程序为独立重写，名称与图标均为原创。";
  s6.appendChild(ab); body.appendChild(s6);

  // Footer
  let foot = document.querySelector(".set-foot");
  if (!foot) { foot = document.createElement("div"); foot.className = "set-foot"; document.querySelector(".settings-sheet").appendChild(foot); }
  foot.innerHTML = "";
  const cancel = document.createElement("button"); cancel.textContent = t("cancel"); cancel.onclick = closeSettings;
  const saveBtn = document.createElement("button"); saveBtn.className = "primary"; saveBtn.textContent = t("save"); saveBtn.onclick = saveSettings;
  foot.appendChild(cancel); foot.appendChild(saveBtn);
}

function section(title) { const s = document.createElement("div"); s.className = "set-section"; const h = document.createElement("h3"); h.textContent = title; s.appendChild(h); return s; }
function switchEl(on, onChange) {
  const sw = document.createElement("div"); sw.className = "switch" + (on ? " on" : "");
  sw.onclick = () => { const v = !sw.classList.contains("on"); sw.classList.toggle("on", v); onChange(v); };
  return sw;
}

function startCapture(field, el) {
  if (capturing) capturing.el.classList.remove("capturing");
  capturing = { field, el }; el.classList.add("capturing"); el.textContent = "…"; el.focus();
}
function keyName(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  if (code === "Space") return "Space";
  if (code === "Enter") return "Enter";
  if (code === "Tab") return "Tab";
  return null;
}
document.addEventListener("keydown", (e) => {
  if (capturing) {
    e.preventDefault(); e.stopPropagation();
    const k = keyName(e.code);
    if (!k) return; // wait for a real key
    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Super");
    parts.push(k);
    const combo = parts.join("+");
    draft[capturing.field] = combo;
    capturing.el.textContent = combo; capturing.el.classList.remove("capturing");
    capturing = null;
    return;
  }
}, true);

function saveSettings() {
  invoke("update_settings", { data: JSON.stringify(draft) })
    .then((res) => {
      if (res) cfg = JSON.parse(res);
      LANG = cfg.lang === "en" ? "en" : "zh";
      applyLang();
      applyTheme(cfg.theme);
      cleanup(); render();
      toast(t("saved"));
      closeSettings();
    })
    .catch((err) => { const e = $("setErr"); if (e) e.textContent = String(err); });
}

/* ---------- apply language to static chrome ---------- */
function applyLang() {
  $("searchInput").placeholder = t("search");
  $("plus").title = t("plus");
  $("gear").title = t("gear");
  $("prev").title = t("prev");
  $("next").title = t("next");
  $("pinOnly").title = t("pinOnly");
  $("editorBody").placeholder = t("editorPh");
  $("bellText").textContent = t("remind");
  const hint = document.querySelector(".editor-foot .hint"); if (hint) hint.textContent = t("editorHint");
  const esave = $("editorSave"); if (esave) esave.textContent = t("save");
}

/* ---------- deck / drop / rollup ---------- */
function setDeck(deck) {
  ui.deck = deck; ui.page = 0;
  stage.classList.toggle("deck-notes", deck === "notes");
  stage.classList.toggle("deck-clipboard", deck === "clipboard");
}
function onDrop(deck) { setDeck(deck); stage.classList.remove("up"); render(); }
function onRollup() {
  hideCtx(); closePreview();
  if (!$("editor").hidden) closeEditor();
  if (!$("settings").hidden) closeSettings();
  stage.classList.add("up");
}

$("panel").addEventListener("transitionend", (ev) => {
  if (ev.propertyName === "transform" && stage.classList.contains("up")) invoke("rollup_done").catch(() => {});
});

/* ---------- global input ---------- */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!$("settings").hidden) { closeSettings(); return; }
    if (!$("editor").hidden) { closeEditor(); return; }
    if (!$("preview").hidden) { closePreview(); return; }
    if (!$("ctx").hidden) { hideCtx(); return; }
    invoke("rollup_now").catch(() => {});
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !$("editor").hidden) { e.preventDefault(); closeEditor(); }
});
document.addEventListener("click", (e) => {
  if (!$("ctx").hidden && !e.target.closest("#ctx")) hideCtx();
  if (pointerInsideLine) return;
  if (e.target.closest(".card") || e.target.closest("#pill") || e.target.closest("#plus") ||
      e.target.closest("#editor") || e.target.closest("#preview") || e.target.closest("#ctx") || e.target.closest("#settings")) return;
  if (!stage.classList.contains("up")) invoke("rollup_now").catch(() => {});
});
// Track (at pointerdown, before any re-render detaches the target) whether the
// interaction began inside the line/overlays. The click handler uses this
// instead of inspecting the click target, which may already be detached.
let pointerInsideLine = false;
document.addEventListener("pointerdown", (e) => {
  if (stage.classList.contains("up")) { pointerInsideLine = false; return; }
  pointerInsideLine = !!(e.target.closest("#stage") || e.target.closest("#editor") || e.target.closest("#preview") || e.target.closest("#ctx"));
}, true);
$("preview").addEventListener("click", (e) => { if (e.target.id === "preview") closePreview(); });
$("settings").addEventListener("click", (e) => { if (e.target.id === "settings") closeSettings(); });
$("setClose").addEventListener("click", closeSettings);
$("editorClose").addEventListener("click", closeEditor);
$("editorSave").addEventListener("click", closeEditor);
$("plus").addEventListener("click", newNote);
$("gear").addEventListener("click", () => { invoke("rollup_now").catch(() => {}); invoke("open_settings").catch(() => {}); });
$("bell").addEventListener("click", (e) => { if (editing) showReminderPanel(e, editing, () => { $("bellText").textContent = editing.remindAt ? fmtWhen(editing.remindAt) : t("remind"); }); });
$("prev").addEventListener("click", () => { ui.page--; render(); });
$("next").addEventListener("click", () => { ui.page++; render(); });
$("pinOnly").addEventListener("click", () => { ui.pinnedOnly = !ui.pinnedOnly; $("pinOnly").classList.toggle("on", ui.pinnedOnly); ui.page = 0; render(); });
$("searchInput").addEventListener("input", (e) => { ui.search = e.target.value; ui.page = 0; render(); });
window.addEventListener("wheel", (e) => {
  if (stage.classList.contains("up")) return;
  if (!$("settings").hidden || !$("preview").hidden || !$("editor").hidden || !$("ctx").hidden) return;
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX > 0 : e.deltaY > 0) ui.page++; else ui.page--;
  render();
}, { passive: true });
window.addEventListener("resize", () => { if (!stage.classList.contains("up")) render(); });

/* ---------- events from Rust ---------- */
async function wire() {
  await listen("clip:add", (ev) => addClip(ev.payload));
  await listen("line:drop", (ev) => onDrop(ev.payload.deck));
  await listen("line:rollup", () => onRollup());
  await listen("ui:newnote", () => { setDeck("notes"); stage.classList.remove("up"); render(); newNote(); });
  await listen("theme:preview", (ev) => applyTheme(ev.payload || "soft"));
  await listen("settings:changed", async () => {
    try { const s = await invoke("get_settings"); if (s) cfg = Object.assign(cfg, JSON.parse(s)); } catch (e) {}
    LANG = cfg.lang === "en" ? "en" : "zh";
    applyLang(); applyTheme(cfg.theme); cleanup(); render();
  });
  await listen("tauri://drag-drop", (ev) => {
    const p = ev.payload || {};
    const paths = p.paths || (Array.isArray(p) ? p : []);
    if (paths && paths.length) addDroppedFiles(paths);
  });
}

/* ---------- boot ---------- */
(async function boot() {
  window.addEventListener("error", (e) => { try { toast("错误: " + (e.message || e.error || e)); } catch (x) {} });
  window.addEventListener("unhandledrejection", (e) => { try { const r = e.reason; toast("错误: " + (r && r.toString ? r.toString() : r)); } catch (x) {} });
  try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
  await load();
  applyLang();
  applyTheme(cfg.theme);
  await wire();
  render();
})();
