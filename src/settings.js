"use strict";
const T = window.__TAURI__;
const invoke = T.core.invoke;
const emit = T.event.emit;
const getCurrentWindow = T.window.getCurrentWindow;

const I = {
  zh: {
    title: "设置", secHotkeys: "快捷键", hkClip: "剪贴板绳", hkNotes: "便签绳",
    hkHint: "点击后按下组合键录制", restoreDefault: "恢复默认",
    secInvoke: "呼出方式", hoverOn: "顶边悬停呼出", dwell: "停顿时长", flip: "左右翻转修饰键",
    flipNone: "关闭", mShift: "Shift", mCtrl: "Ctrl", mAlt: "Alt",
    secClean: "自动清理", retention: "保留天数", days: "天",
    secGeneral: "常规", language: "语言", autostart: "开机自启动",
    secTheme: "主题", tSoft: "柔彩日常", tSilver: "经典银灰", tLinen: "棉麻木夹", tPorcelain: "奶白轻盈", tGraphite: "石墨金属",
    secWatch: "监听文件夹", addFolder: "添加文件夹", watchHint: "这些文件夹新增文件会自动上绳", noFolders: "（未添加）",
    secHelp: "使用说明", secAbout: "关于", save: "保存", cancel: "取消",
    help: [
      ["呼出", "鼠标顶到屏幕最上沿：左半剪贴板绳、右半便签绳；按住翻转键左右对调。或用快捷键。"],
      ["单击/双击", "单击复制；双击把文字粘回刚才的应用（图片为复制）。"],
      ["钉住", "右键「钉住」的卡不参与自动清理（图钉标记）。"],
      ["文件/拖拽", "复制文件自动上绳；按住卡片外拖=复制，Shift 拖=移动。"],
      ["截图", "PrintScreen 或 Win+Shift+S 截图进剪贴板，自动上绳。"],
    ],
    about: "ClipLine · 晾衣绳主题剪贴板 / 便签。灵感来自 Tendedero (MIT) 与 Clothespeg (Apache-2.0)；独立重写，名称与图标均为原创。",
  },
  en: {
    title: "Settings", secHotkeys: "Hotkeys", hkClip: "Clipboard line", hkNotes: "Notes line",
    hkHint: "Click, then press a key combo", restoreDefault: "Restore defaults",
    secInvoke: "Invoke", hoverOn: "Drop on top-edge hover", dwell: "Dwell", flip: "Flip modifier",
    flipNone: "Off", mShift: "Shift", mCtrl: "Ctrl", mAlt: "Alt",
    secClean: "Auto cleanup", retention: "Keep for", days: "days",
    secGeneral: "General", language: "Language", autostart: "Launch at startup",
    secTheme: "Theme", tSoft: "Soft color", tSilver: "Classic silver", tLinen: "Linen & wood", tPorcelain: "Porcelain", tGraphite: "Graphite",
    secWatch: "Watched folders", addFolder: "Add folder", watchHint: "New files in these folders hang automatically", noFolders: "(none)",
    secHelp: "How to use", secAbout: "About", save: "Save", cancel: "Cancel",
    help: [
      ["Invoke", "Top edge: left = clipboard, right = notes; hold the flip key to swap. Or hotkeys."],
      ["Click", "Click copies; double-click pastes into your previous app."],
      ["Pin", "Right-click Pin keeps a card from auto-cleanup."],
      ["Files/drag", "Copied files hang; drag a card out = copy, Shift-drag = move."],
      ["Screenshots", "PrintScreen / Win+Shift+S goes to the clipboard and hangs."],
    ],
    about: "ClipLine — a clothesline clipboard & notes app. Inspired by Tendedero (MIT) and Clothespeg (Apache-2.0); independent rewrite, original name and icon.",
  },
};
let LANG = "zh";
const t = (k) => (I[LANG] && I[LANG][k] !== undefined ? I[LANG][k] : I.zh[k]);

let cfg = {};
let draft = {};
let capturing = null;
const $ = (id) => document.getElementById(id);

function section(title) { const s = document.createElement("div"); s.className = "set-section"; const h = document.createElement("h3"); h.textContent = title; s.appendChild(h); return s; }
function row(label, control, sub) {
  const r = document.createElement("div"); r.className = "set-row";
  const l = document.createElement("div"); l.innerHTML = `<div class="label">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ""}`;
  r.appendChild(l); r.appendChild(control); return r;
}
function seg(val, opts, onPick) {
  const wrap = document.createElement("div"); wrap.className = "seg"; wrap.style.flexWrap = "wrap";
  opts.forEach(([v, label]) => {
    const b = document.createElement("button"); b.textContent = label; if (String(val) === String(v)) b.classList.add("on");
    b.onclick = () => { wrap.querySelectorAll("button").forEach((z) => z.classList.remove("on")); b.classList.add("on"); onPick(v); };
    wrap.appendChild(b);
  });
  return wrap;
}
function switchEl(on, onChange) {
  const sw = document.createElement("div"); sw.className = "switch" + (on ? " on" : "");
  sw.onclick = () => { const v = !sw.classList.contains("on"); sw.classList.toggle("on", v); onChange(v); };
  return sw;
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
  if (!capturing) return;
  e.preventDefault(); e.stopPropagation();
  const k = keyName(e.code);
  if (!k) return;
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  parts.push(k);
  draft[capturing.field] = parts.join("+");
  capturing.el.textContent = parts.join("+"); capturing.el.classList.remove("capturing");
  capturing = null;
}, true);

function render() {
  $("shead").textContent = t("title");
  const body = $("sbody"); body.innerHTML = "";

  // Hotkeys
  const s1 = section(t("secHotkeys"));
  const mkHk = (field) => {
    const inp = document.createElement("div"); inp.className = "hk-input"; inp.tabIndex = 0;
    inp.textContent = draft[field];
    inp.onclick = () => { if (capturing) capturing.el.classList.remove("capturing"); capturing = { field, el: inp }; inp.classList.add("capturing"); inp.textContent = "…"; inp.focus(); };
    return inp;
  };
  s1.appendChild(row(t("hkClip"), mkHk("hotkey_clip"), t("hkHint")));
  s1.appendChild(row(t("hkNotes"), mkHk("hotkey_notes")));
  const restore = document.createElement("button"); restore.className = "btn-mini"; restore.textContent = t("restoreDefault");
  restore.onclick = () => { draft.hotkey_clip = "Ctrl+Alt+C"; draft.hotkey_notes = "Ctrl+Alt+N"; render(); };
  const rr = document.createElement("div"); rr.className = "set-row"; rr.style.justifyContent = "flex-end"; rr.appendChild(restore);
  s1.appendChild(rr);
  const err = document.createElement("div"); err.className = "set-err"; err.id = "setErr"; s1.appendChild(err);
  body.appendChild(s1);

  // Invoke
  const s2 = section(t("secInvoke"));
  s2.appendChild(row(t("hoverOn"), switchEl(draft.hover_enabled, (v) => draft.hover_enabled = v)));
  s2.appendChild(row(t("dwell"), seg(draft.dwell_ms, [[150, "0.15s"], [250, "0.25s"], [400, "0.4s"]], (v) => draft.dwell_ms = parseInt(v, 10))));
  s2.appendChild(row(t("flip"), seg(draft.flip_mod, [["none", t("flipNone")], ["shift", t("mShift")], ["ctrl", t("mCtrl")], ["alt", t("mAlt")]], (v) => draft.flip_mod = v)));
  body.appendChild(s2);

  // Cleanup
  const s3 = section(t("secClean"));
  s3.appendChild(row(t("retention"), seg(draft.retention_days, [[7, "7"], [14, "14"], [30, "30"], [90, "90"]], (v) => draft.retention_days = parseInt(v, 10)), t("days")));
  body.appendChild(s3);

  // General
  const s4 = section(t("secGeneral"));
  const langSel = document.createElement("select"); langSel.className = "set-select";
  [["zh", "中文"], ["en", "English"]].forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; if (draft.lang === v) o.selected = true; langSel.appendChild(o); });
  langSel.onchange = () => { draft.lang = langSel.value; LANG = draft.lang === "en" ? "en" : "zh"; render(); };
  s4.appendChild(row(t("language"), langSel));
  s4.appendChild(row(t("autostart"), switchEl(draft.autostart, (v) => draft.autostart = v)));
  body.appendChild(s4);

  // Theme
  const st = section(t("secTheme"));
  const themeSeg = seg(draft.theme, [["soft", t("tSoft")], ["silver", t("tSilver")], ["linen", t("tLinen")], ["porcelain", t("tPorcelain")], ["graphite", t("tGraphite")]], (v) => { draft.theme = v; emit("theme:preview", v); });
  const trow = document.createElement("div"); trow.className = "set-row"; trow.style.flexDirection = "column"; trow.style.alignItems = "stretch"; trow.appendChild(themeSeg);
  st.appendChild(trow);
  body.appendChild(st);

  // Watched folders
  const sw = section(t("secWatch"));
  const hint = document.createElement("div"); hint.className = "sub"; hint.style.marginBottom = "8px"; hint.textContent = t("watchHint");
  sw.appendChild(hint);
  const list = document.createElement("div");
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
  addBtn.onclick = () => { invoke("pick_folder").then((p) => { if (p) { draft.watch_folders = draft.watch_folders || []; if (!draft.watch_folders.includes(p)) draft.watch_folders.push(p); renderWatch(); } }).catch(() => {}); };
  sw.appendChild(addBtn);
  body.appendChild(sw);

  // Help
  const s5 = section(t("secHelp"));
  const help = document.createElement("div"); help.className = "set-help";
  const g = document.createElement("div"); g.className = "g";
  t("help").forEach(([k, v]) => { const kk = document.createElement("div"); kk.className = "k"; kk.textContent = k; const vv = document.createElement("div"); vv.textContent = v; g.appendChild(kk); g.appendChild(vv); });
  help.appendChild(g); s5.appendChild(help); body.appendChild(s5);

  // About
  const s6 = section(t("secAbout"));
  const ab = document.createElement("div"); ab.className = "set-about"; ab.textContent = t("about");
  s6.appendChild(ab); body.appendChild(s6);

  $("cancelBtn").textContent = t("cancel");
  $("saveBtn").textContent = t("save");
}

function saveSettings() {
  invoke("update_settings", { data: JSON.stringify(draft) })
    .then((res) => { if (res) cfg = JSON.parse(res); emit("settings:changed"); try { getCurrentWindow().close(); } catch (e) {} })
    .catch((err) => { const e = $("setErr"); if (e) e.textContent = String(err); });
}
function cancelSettings() { emit("theme:preview", cfg.theme || "soft"); try { getCurrentWindow().close(); } catch (e) {} }

$("saveBtn").addEventListener("click", saveSettings);
$("cancelBtn").addEventListener("click", cancelSettings);
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !capturing) cancelSettings(); });

(async function boot() {
  try { const s = await invoke("get_settings"); if (s) cfg = JSON.parse(s); } catch (e) {}
  draft = Object.assign({ hotkey_clip: "Ctrl+Alt+C", hotkey_notes: "Ctrl+Alt+N", hover_enabled: true, dwell_ms: 250, flip_mod: "shift", retention_days: 30, lang: "zh", autostart: false, theme: "soft", watch_folders: [] }, cfg);
  LANG = draft.lang === "en" ? "en" : "zh";
  render();
})();
