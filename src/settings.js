"use strict";
const T = window.__TAURI__;
const invoke = T.core.invoke;
const emit = T.event.emit;
const getCurrentWindow = T.window.getCurrentWindow;

const I = {
  zh: {
    title: "设置", pgGeneral: "常规", pgInvoke: "呼出与快捷键", pgClip: "剪贴板", pgNotes: "便签", pgLook: "外观", pgAbout: "关于", pgDonate: "打赏", donateLead: "ClipLine 是免费、开源的。如果它确实替你省了事，可以扫码请我喝杯茶。", donateNote: "打赏完全自愿：不解锁任何功能（所有功能本来就都给你），也不换来「优先处理」，issue 一视同仁地看。", donateWx: "微信", donateAli: "支付宝", donateThanks: "谢谢你用它。", secDrag: "拖出卡片", secBag: "收纳袋", secHotkeys: "快捷键", hkClip: "剪贴板绳", hkNotes: "便签绳", hkShot: "截图上绳", hkShotSub: "框选区域或点选窗口后可挂上绳、标注、识别文字、钉在桌面；也能取色",
    hkHint: "点击后按下组合键录制", restoreDefault: "恢复默认",
    secInvoke: "呼出方式", hoverOn: "顶边悬停呼出", dwell: "停顿时长", flip: "左右翻转修饰键", hangOn: "拖文件到屏幕顶部自动放绳", moveMod: "拖出卡片时「移动」用的按键", foldDate: "按日期折叠", foldDateSub: "今天的卡片散挂；更早的自动折成「三日内 / 一周内 / 更早」三叠（底部「按日期」按钮也可切换）", moveModSub: "开始拖动时按住即为移动（之后可松开）；不按为复制。默认 Shift，与 Windows 习惯一致", textExt: "文字卡片拖到文件夹时保存为",
    flipNone: "关闭", mShift: "Shift", mCtrl: "Ctrl", mAlt: "Alt",
    secClean: "自动清理", retention: "剪贴板卡片保留", retentionSub: "超过天数的卡片自动取下（单位：天）；收藏的卡片不清理", days: "天", bagDays: "收纳袋便签保留", forever: "永久", bagDaysSub: "已完成的便签在收纳袋里保留多少天（单位：天）；绳上的便签不会被清理。收纳袋左下角也能直接改",
    secGeneral: "常规", language: "语言", langAuto: "跟随系统", autostart: "开机自启动",
    lineDisplay: "晾衣绳出现在", ldCursor: "跟随鼠标", ldPrimary: "主显示器", ldMon: "显示器", ldMain: "（主）", ldMissing: "（未连接）", ldSub: "跟随鼠标：在哪块屏幕顶边呼出就在哪块屏幕放下；选定的显示器未连接时改用主显示器。提醒和更新卡片也弹在这块屏幕上",
    secTheme: "主题", accent: "强调色", trBlue: "深海蓝", trRed: "徕卡红", trayIcon: "托盘图标", trayIconSub: "保存后立即生效；程序文件（exe）的图标固定为陶土橙", dataDir: "数据文件夹", openDataDir: "打开数据文件夹", aTerra: "陶土橙", aMint: "薄荷绿", aSky: "晴空蓝", aNavy: "深海蓝", tSoft: "柔彩日常", tSilver: "经典银灰", tLinen: "棉麻木夹", tPorcelain: "奶白轻盈", tGraphite: "石墨金属",
    secWatch: "监听文件夹", addFolder: "添加文件夹", watchHint: "这些文件夹新增文件会自动上绳", noFolders: "（未添加）",
    secFont: "字体", fontFamily: "字体", fontSize: "字号", fsSmall: "小", fsMedium: "中", fsLarge: "大",
    fDefault: "系统默认", fYahei: "微软雅黑", fDengxian: "等线", fSource: "思源黑体", fSimsun: "宋体", fKaiti: "楷体", fFangsong: "仿宋",
    secRemind: "提醒快捷项", remindHint: "勾选在便签提醒面板里显示的快捷时间",
    p_m5: "5 分钟后", p_m10: "10 分钟后", p_m15: "15 分钟后", p_m30: "30 分钟后", p_h1: "1 小时后", p_h2: "2 小时后", p_h3: "3 小时后", p_tonight: "今晚 20:00", p_tomorrow: "明天此时", p_tomorrow9: "明早 9:00", p_nextweek: "下周此时",
    secHelp: "使用说明", secAbout: "关于", save: "保存", cancel: "取消",
    history: "更新历史", historySub: "历次版本更新了什么（打包在程序里，不联网也能看）", historyOpen: "查看", historyBack: "‹ 返回设置", historyCur: "当前版本",
    version: "当前版本", checkUpdate: "检查更新", updMode: "自动更新", updAuto: "自动下载", updNotify: "有新版时提醒", updOff: "关闭",
    updModeSub: "从 GitHub 发布页检查新版本。「自动下载」会在后台下好，提示一次后重启即可完成，不重启的话下次退出时自动安装；「有新版时提醒」只弹卡片，由你决定是否更新",
    help: [
      ["呼出", "鼠标顶到屏幕最上沿：左半剪贴板绳、右半便签绳；按住翻转键左右对调。或用快捷键。"],
      ["剪贴板卡", "单击复制（卡上浮现「已复制」）；文字卡双击放大编辑，图片双击复制，文件双击打开；右键看更多操作。"],
      ["便签", "点绳上方 + 新建；单击便签打开阅读视图，双击编辑；内容显示不全时，鼠标停在便签上用滚轮滚动。"],
      ["收藏", "悬停卡片点右下角 ☆：收藏的卡固定在左端，不参与自动清理。"],
      ["文件/拖拽", "复制文件自动上绳；按住卡片外拖=复制，Shift 拖=移动。文字卡拖到文件夹成 .txt/.md，拖到输入框即插入文字。把文件拖到屏幕最顶端，绳子会滑下来接住。"],
      ["截图", "Ctrl+Alt+S 框选截图，可挂上绳、标注、识别文字或钉在桌面；PrintScreen / Win+Shift+S 截的图进剪贴板后也会自动上绳。"],
    ],
    about: "ClipLine · 晾衣绳主题剪贴板 / 便签。灵感来自 Tendedero (MIT) 与 Clothespeg (Apache-2.0)；独立重写，名称与图标均为原创。",
  },
  en: {
    title: "Settings", pgGeneral: "General", pgInvoke: "Invoke & hotkeys", pgClip: "Clipboard", pgNotes: "Notes", pgLook: "Appearance", pgAbout: "About", pgDonate: "Tip jar", donateLead: "ClipLine is free and open source. If it has saved you some trouble, you can scan a code to buy me a cup of tea.", donateNote: "Entirely optional: it unlocks nothing (you already have every feature) and buys no priority — every issue is read the same way.", donateWx: "WeChat Pay", donateAli: "Alipay", donateThanks: "Thanks for using it.", secDrag: "Dragging cards out", secBag: "Done bag", secHotkeys: "Hotkeys", hkClip: "Clipboard line", hkNotes: "Notes line", hkShot: "Screenshot", hkShotSub: "Select a region or click a window, then hang, annotate, OCR or pin it — or pick a colour",
    hkHint: "Click, then press a key combo", restoreDefault: "Restore defaults",
    secInvoke: "Invoke", hoverOn: "Drop on top-edge hover", dwell: "Dwell", flip: "Flip modifier", hangOn: "Drag files to top edge to drop the line", moveMod: "Key for moving when dragging a card out", foldDate: "Fold by date", foldDateSub: "Today's cards hang loose; older ones fold into Last 3 days / This week / Older (also via the By date button)", moveModSub: "Hold it when the drag starts to move (you can let go afterwards); otherwise it copies. Default Shift, as in Windows", textExt: "Text card dragged to a folder becomes",
    flipNone: "Off", mShift: "Shift", mCtrl: "Ctrl", mAlt: "Alt",
    secClean: "Auto cleanup", retention: "Keep clipboard cards", retentionSub: "Cards older than this (days) are taken down; favourites are kept", days: "days", bagDays: "Keep notes in the done bag", forever: "Forever", bagDaysSub: "How many days finished notes stay in the done bag; notes on the line are never cleaned up. Also changeable from the bag itself",
    secGeneral: "General", language: "Language", langAuto: "Follow system", autostart: "Launch at startup",
    lineDisplay: "Line appears on", ldCursor: "Follow the mouse", ldPrimary: "Primary display", ldMon: "Display", ldMain: " (primary)", ldMissing: " (not connected)", ldSub: "Follow the mouse: it drops on whichever screen's top edge you use; a chosen display that is unplugged falls back to the primary one. Reminder and update cards appear on that screen too",
    secTheme: "Theme", accent: "Accent", trBlue: "Navy", trRed: "Leica red", trayIcon: "Tray icon", trayIconSub: "Applies on save; the exe icon itself stays terracotta", dataDir: "Data folder", openDataDir: "Open data folder", aTerra: "Terracotta", aMint: "Mint", aSky: "Sky", aNavy: "Navy", tSoft: "Soft color", tSilver: "Classic silver", tLinen: "Linen & wood", tPorcelain: "Porcelain", tGraphite: "Graphite",
    secWatch: "Watched folders", addFolder: "Add folder", watchHint: "New files in these folders hang automatically", noFolders: "(none)",
    secFont: "Font", fontFamily: "Typeface", fontSize: "Size", fsSmall: "S", fsMedium: "M", fsLarge: "L",
    fDefault: "System", fYahei: "Microsoft YaHei", fDengxian: "DengXian", fSource: "Source Han Sans", fSimsun: "SimSun", fKaiti: "KaiTi", fFangsong: "FangSong",
    secRemind: "Reminder presets", remindHint: "Pick the quick times shown in the note reminder popover",
    p_m5: "In 5 min", p_m10: "In 10 min", p_m15: "In 15 min", p_m30: "In 30 min", p_h1: "In 1 hour", p_h2: "In 2 hours", p_h3: "In 3 hours", p_tonight: "Tonight 20:00", p_tomorrow: "Tomorrow, same time", p_tomorrow9: "Tomorrow 9:00", p_nextweek: "Next week",
    secHelp: "How to use", secAbout: "About", save: "Save", cancel: "Cancel",
    history: "Update history", historySub: "What changed in each version (built in, works offline)", historyOpen: "View", historyBack: "‹ Back to settings", historyCur: "this version",
    version: "Version", checkUpdate: "Check for updates", updMode: "Automatic updates", updAuto: "Download automatically", updNotify: "Notify me", updOff: "Off",
    updModeSub: "Checks the GitHub releases page. Download automatically fetches it in the background and installs on restart (or when you quit); Notify me only shows a card and lets you decide",
    help: [
      ["Invoke", "Top edge: left = clipboard, right = notes; hold the flip key to swap. Or hotkeys."],
      ["Clips", "Click copies; double-click edits text, copies an image or opens a file; right-click for more."],
      ["Notes", "+ above the line adds one; click a note to read it in full, double-click to edit; when it doesn't fit, scroll it with the wheel."],
      ["Favourites", "Hover a card and click ☆: favourites stay at the left end and are kept from auto-cleanup."],
      ["Files/drag", "Copied files hang; drag a card out = copy, Shift-drag = move; drag files to the top edge to drop them on the line."],
      ["Screenshots", "Ctrl+Alt+S to snip a region, then hang, annotate, OCR or pin it; PrintScreen / Win+Shift+S also hang via the clipboard."],
    ],
    about: "ClipLine — a clothesline clipboard & notes app. Inspired by Tendedero (MIT) and Clothespeg (Apache-2.0); independent rewrite, original name and icon.",
  },
};
let LANG = "zh";
function pickLang(c) { const l = c.lang === "auto" ? c.sys_lang : c.lang; return l === "en" ? "en" : "zh"; }
const FONTS = {
  default: '-apple-system, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif',
  yahei: '"Microsoft YaHei", "Segoe UI", sans-serif',
  dengxian: '"DengXian", "Microsoft YaHei", sans-serif',
  source: '"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  simsun: '"SimSun", "Songti SC", serif',
  kaiti: '"KaiTi", "STKaiti", serif',
  fangsong: '"FangSong", "STFangsong", serif',
};
function previewFont(name) { document.documentElement.style.setProperty("--app-font", FONTS[name] || FONTS.default); }
const t = (k) => (I[LANG] && I[LANG][k] !== undefined ? I[LANG][k] : I.zh[k]);

let cfg = {};
let draft = {};
let monitors = [];
let capturing = null;
const $ = (id) => document.getElementById(id);

function section(title) { const s = document.createElement("div"); s.className = "set-section"; if (title) { const h = document.createElement("h3"); h.textContent = title; s.appendChild(h); } return s; }
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

const PAGES = [
  ["general", "⚙", "pgGeneral"], ["invoke", "⌨", "pgInvoke"], ["clip", "📋", "pgClip"],
  ["notes", "📝", "pgNotes"], ["look", "🎨", "pgLook"], ["about", "ℹ", "pgAbout"], ["donate", "☕", "pgDonate"],
];
let page = "general";
function goPage(p) { page = p; render(); $("sbody").scrollTop = 0; }

function render() {
  document.title = "ClipLine " + t("title");
  const nav = $("snav"); nav.innerHTML = "";
  const nt = document.createElement("div"); nt.className = "snav-title"; nt.textContent = t("title"); nav.appendChild(nt);
  PAGES.forEach(([id, ic, key]) => {
    const b = document.createElement("button"); b.className = "snav-item" + (page === id ? " on" : "");
    b.innerHTML = `<i>${ic}</i><span></span>`; b.lastChild.textContent = t(key);
    b.onclick = () => goPage(id);
    nav.appendChild(b);
  });
  const body = $("sbody"); body.innerHTML = "";
  const h = document.createElement("h2"); h.className = "spage-title"; h.textContent = t(PAGES.find((x) => x[0] === page)[2]); body.appendChild(h);
  ({ general: pageGeneral, invoke: pageInvoke, clip: pageClip, notes: pageNotes, look: pageLook, about: pageAbout, donate: pageDonate })[page](body);
  $("cancelBtn").textContent = t("cancel");
  $("saveBtn").textContent = t("save");
}
const setErr = (msg) => { const el = $("setErr"); if (el) el.textContent = msg || ""; };

function pageGeneral(body) {
  const s = section(null);
  const langSel = document.createElement("select"); langSel.className = "set-select";
  [["auto", t("langAuto")], ["zh", "中文"], ["en", "English"]].forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; if (draft.lang === v) o.selected = true; langSel.appendChild(o); });
  langSel.onchange = () => { draft.lang = langSel.value; LANG = pickLang(draft); render(); };
  s.appendChild(row(t("language"), langSel));
  s.appendChild(row(t("autostart"), switchEl(draft.autostart, (v) => draft.autostart = v)));
  const ldSel = document.createElement("select"); ldSel.className = "set-select";
  const ldOpts = [["cursor", t("ldCursor")], ["primary", t("ldPrimary")]];
  monitors.forEach((m) => {
    const num = (String(m.name).match(/(\d+)\s*$/) || [])[1] || "?";
    ldOpts.push([m.name, `${t("ldMon")} ${num} · ${m.w}×${m.h} · ${Math.round(m.scale * 100)}%${m.primary ? t("ldMain") : ""}`]);
  });
  const ld = draft.line_display || "cursor";
  if (!ldOpts.some(([v]) => v === ld)) {
    const num = (String(ld).match(/(\d+)\s*$/) || [])[1] || "?";
    ldOpts.push([ld, `${t("ldMon")} ${num}${t("ldMissing")}`]);
  }
  ldOpts.forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; if (ld === v) o.selected = true; ldSel.appendChild(o); });
  ldSel.onchange = () => { draft.line_display = ldSel.value; };
  s.appendChild(row(t("lineDisplay"), ldSel, t("ldSub")));
  s.appendChild(row(t("updMode"), seg(draft.update_mode || "notify", [["auto", t("updAuto")], ["notify", t("updNotify")], ["off", t("updOff")]], (v) => draft.update_mode = v), t("updModeSub")));
  body.appendChild(s);
}

function pageInvoke(body) {
  const s1 = section(t("secHotkeys"));
  const mkHk = (field) => {
    const inp = document.createElement("div"); inp.className = "hk-input"; inp.tabIndex = 0;
    inp.textContent = draft[field];
    inp.onclick = () => { if (capturing) capturing.el.classList.remove("capturing"); capturing = { field, el: inp }; inp.classList.add("capturing"); inp.textContent = "…"; inp.focus(); };
    return inp;
  };
  s1.appendChild(row(t("hkClip"), mkHk("hotkey_clip"), t("hkHint")));
  s1.appendChild(row(t("hkNotes"), mkHk("hotkey_notes")));
  s1.appendChild(row(t("hkShot"), mkHk("hotkey_shot"), t("hkShotSub")));
  const restore = document.createElement("button"); restore.className = "btn-mini"; restore.textContent = t("restoreDefault");
  restore.onclick = () => { draft.hotkey_clip = "Ctrl+Alt+C"; draft.hotkey_notes = "Ctrl+Alt+N"; draft.hotkey_shot = "Ctrl+Alt+S"; render(); };
  const rr = document.createElement("div"); rr.className = "set-row"; rr.style.justifyContent = "flex-end"; rr.appendChild(restore);
  s1.appendChild(rr);
  body.appendChild(s1);

  const s2 = section(t("secInvoke"));
  s2.appendChild(row(t("hoverOn"), switchEl(draft.hover_enabled, (v) => draft.hover_enabled = v)));
  s2.appendChild(row(t("dwell"), seg(draft.dwell_ms, [[150, "0.15s"], [250, "0.25s"], [400, "0.4s"]], (v) => draft.dwell_ms = parseInt(v, 10))));
  s2.appendChild(row(t("flip"), seg(draft.flip_mod, [["none", t("flipNone")], ["shift", t("mShift")], ["ctrl", t("mCtrl")], ["alt", t("mAlt")]], (v) => draft.flip_mod = v)));
  s2.appendChild(row(t("hangOn"), switchEl(draft.drop_to_hang, (v) => draft.drop_to_hang = v)));
  body.appendChild(s2);
}

function pageClip(body) {
  const s1 = section(t("secClean"));
  s1.appendChild(row(t("retention"), seg(draft.retention_days, [[7, "7"], [14, "14"], [30, "30"], [90, "90"]], (v) => draft.retention_days = parseInt(v, 10)), t("retentionSub")));
  s1.appendChild(row(t("foldDate"), switchEl(draft.fold_by_date !== false, (v) => draft.fold_by_date = v), t("foldDateSub")));
  body.appendChild(s1);

  const s2 = section(t("secDrag"));
  s2.appendChild(row(t("moveMod"), seg(draft.move_mod || "shift", [["shift", "Shift"], ["alt", "Alt"], ["ctrl", "Ctrl"]], (v) => draft.move_mod = v), t("moveModSub")));
  s2.appendChild(row(t("textExt"), seg(draft.text_drag_ext, [["txt", ".txt"], ["md", ".md"]], (v) => draft.text_drag_ext = v)));
  body.appendChild(s2);

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
  addBtn.onclick = () => {
    setErr("");
    invoke("pick_folder")
      .then((p) => { if (p) { draft.watch_folders = draft.watch_folders || []; if (!draft.watch_folders.includes(p)) draft.watch_folders.push(p); renderWatch(); } })
      .catch((e) => setErr((LANG === "en" ? "Could not pick a folder: " : "选择文件夹失败: ") + e));
  };
  sw.appendChild(addBtn);
  body.appendChild(sw);
}

function pageNotes(body) {
  const s1 = section(t("secBag"));
  s1.appendChild(row(t("bagDays"), seg(draft.history_days, [[7, "7"], [30, "30"], [90, "90"], [365, "365"], [0, t("forever")]], (v) => draft.history_days = parseInt(v, 10)), t("bagDaysSub")));
  body.appendChild(s1);

  const sr = section(t("secRemind"));
  const rh = document.createElement("div"); rh.className = "sub"; rh.style.marginBottom = "8px"; rh.textContent = t("remindHint"); sr.appendChild(rh);
  const cg = document.createElement("div"); cg.className = "check-grid";
  const ALL = ["m5", "m10", "m15", "m30", "h1", "h2", "h3", "tonight", "tomorrow", "tomorrow9", "nextweek"];
  draft.reminder_presets = Array.isArray(draft.reminder_presets) ? draft.reminder_presets : ["m15", "h1", "tomorrow"];
  ALL.forEach((id) => {
    const lab = document.createElement("label");
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = draft.reminder_presets.includes(id);
    cb.onchange = () => {
      const set = new Set(draft.reminder_presets);
      if (cb.checked) set.add(id); else set.delete(id);
      draft.reminder_presets = ALL.filter((x) => set.has(x)); // keep a stable order
    };
    lab.appendChild(cb); lab.appendChild(document.createTextNode(t("p_" + id)));
    cg.appendChild(lab);
  });
  sr.appendChild(cg);
  body.appendChild(sr);
}

function pageLook(body) {
  const st = section(t("secTheme"));
  const grid = document.createElement("div"); grid.className = "theme-grid";
  [["soft", t("tSoft")], ["silver", t("tSilver")], ["linen", t("tLinen")], ["porcelain", t("tPorcelain")], ["graphite", t("tGraphite")]].forEach(([v, name]) => {
    const th = document.createElement("div"); th.className = "theme-thumb" + ((draft.theme || "soft") === v ? " on" : ""); th.dataset.theme = v;
    th.innerHTML = `<svg viewBox="0 0 120 40" preserveAspectRatio="none"><path d="M0,10 Q60,26 120,10" style="fill:none;stroke:var(--rope);stroke-width:2.4"/></svg>
      <div class="tt-card" style="left:20px;top:22px;transform:rotate(-4deg)"><i class="tt-peg"></i></div>
      <div class="tt-card" style="left:68px;top:23px;transform:rotate(3deg)"><i class="tt-peg"></i></div>
      <div class="tt-name">${name}</div>`;
    th.onclick = () => { draft.theme = v; grid.querySelectorAll(".theme-thumb").forEach((z) => z.classList.remove("on")); th.classList.add("on"); emit("theme:preview", v); };
    grid.appendChild(th);
  });
  st.appendChild(grid);
  // Accent colour — combine freely with any theme
  const ar = document.createElement("div"); ar.className = "accent-row";
  [["terra", "#d97757", t("aTerra")], ["mint", "#58b980", t("aMint")], ["sky", "#5db2fc", t("aSky")], ["navy", "#193584", t("aNavy")], ["leica", "#d41f26", t("trRed")]].forEach(([v, c, name]) => {
    const sw = document.createElement("div"); sw.className = "accent-sw" + ((draft.accent || "terra") === v ? " on" : "");
    sw.innerHTML = `<i style="background:${c}"></i><span>${name}</span>`;
    sw.onclick = () => {
      draft.accent = v; ar.querySelectorAll(".accent-sw").forEach((z) => z.classList.remove("on")); sw.classList.add("on");
      document.documentElement.dataset.accent = v; emit("accent:preview", v);
    };
    ar.appendChild(sw);
  });
  st.appendChild(row(t("accent"), ar));
  // Tray icon colour (the exe icon is fixed; the tray one can change)
  const tr = document.createElement("div"); tr.className = "accent-row";
  [["a", t("aTerra")], ["b", t("trBlue")], ["c", t("trRed")], ["d", t("aSky")], ["e", t("aMint")]].forEach(([v, name]) => {
    const sw = document.createElement("div"); sw.className = "accent-sw tray-sw" + ((draft.tray_icon || "a") === v ? " on" : "");
    sw.innerHTML = `<img src="img/tray-${v}.png" width="30" height="30" alt=""><span>${name}</span>`;
    sw.onclick = () => { draft.tray_icon = v; tr.querySelectorAll(".accent-sw").forEach((z) => z.classList.remove("on")); sw.classList.add("on"); };
    tr.appendChild(sw);
  });
  st.appendChild(row(t("trayIcon"), tr, t("trayIconSub")));
  body.appendChild(st);

  const sf = section(t("secFont"));
  const fontSel = document.createElement("select"); fontSel.className = "set-select";
  [["default", t("fDefault")], ["yahei", t("fYahei")], ["dengxian", t("fDengxian")], ["source", t("fSource")], ["simsun", t("fSimsun")], ["kaiti", t("fKaiti")], ["fangsong", t("fFangsong")]].forEach(([v, l]) => {
    const o = document.createElement("option"); o.value = v; o.textContent = l; o.style.fontFamily = FONTS[v]; if ((draft.font_family || "default") === v) o.selected = true; fontSel.appendChild(o);
  });
  fontSel.onchange = () => { draft.font_family = fontSel.value; previewFont(fontSel.value); };
  sf.appendChild(row(t("fontFamily"), fontSel));
  sf.appendChild(row(t("fontSize"), seg(draft.font_size || "medium", [["small", t("fsSmall")], ["medium", t("fsMedium")], ["large", t("fsLarge")]], (v) => draft.font_size = v)));
  body.appendChild(sf);
}

function pageAbout(body) {
  const s6 = section(null);
  const verRow = document.createElement("div"); verRow.className = "set-row";
  verRow.innerHTML = `<div><div class="label">${t("version")}</div><div class="sub" id="verText">…</div></div>`;
  const cu = document.createElement("button"); cu.className = "btn-mini"; cu.textContent = t("checkUpdate");
  cu.onclick = () => invoke("open_update_window").catch((e) => setErr(String(e)));
  verRow.appendChild(cu); s6.appendChild(verRow);
  try { T.app.getVersion().then((v) => { const el = $("verText"); if (el) el.textContent = "v" + v; }); } catch (e) {}
  const hiRow = document.createElement("div"); hiRow.className = "set-row";
  hiRow.innerHTML = `<div><div class="label">${t("history")}</div><div class="sub">${t("historySub")}</div></div>`;
  const hb = document.createElement("button"); hb.className = "btn-mini"; hb.textContent = t("historyOpen");
  hb.onclick = showHistory;
  hiRow.appendChild(hb); s6.appendChild(hiRow);
  const dataRow = document.createElement("div"); dataRow.className = "set-row";
  dataRow.innerHTML = `<div><div class="label">${t("dataDir")}</div><div class="sub">%APPDATA%\\com.clipline.app</div></div>`;
  const ob = document.createElement("button"); ob.className = "btn-mini"; ob.textContent = t("openDataDir");
  ob.onclick = () => invoke("open_data_dir").catch((e) => setErr(String(e)));
  dataRow.appendChild(ob); s6.appendChild(dataRow);
  const ab = document.createElement("div"); ab.className = "set-about"; ab.style.marginTop = "10px"; ab.textContent = t("about");
  s6.appendChild(ab);
  body.appendChild(s6);

  const s5 = section(t("secHelp"));
  const help = document.createElement("div"); help.className = "set-help";
  const g = document.createElement("div"); g.className = "g";
  t("help").forEach(([k, v]) => { const kk = document.createElement("div"); kk.className = "k"; kk.textContent = k; const vv = document.createElement("div"); vv.textContent = v; g.appendChild(kk); g.appendChild(vv); });
  help.appendChild(g); s5.appendChild(help); body.appendChild(s5);
}

/* Tip jar: two QR codes, nothing to unlock. */
function pageDonate(body) {
  const s = section(null);
  const lead = document.createElement("div"); lead.className = "donate-lead"; lead.textContent = t("donateLead"); s.appendChild(lead);
  const row = document.createElement("div"); row.className = "donate-row";
  [["donate-wechat.png", t("donateWx")], ["donate-alipay.png", t("donateAli")]].forEach(([img, name]) => {
    const f = document.createElement("figure"); f.className = "donate-qr";
    f.innerHTML = `<img src="img/${img}" alt="" draggable="false"><figcaption></figcaption>`;
    f.lastChild.textContent = name;
    row.appendChild(f);
  });
  s.appendChild(row);
  const note = document.createElement("div"); note.className = "set-about"; note.textContent = t("donateNote"); s.appendChild(note);
  const thx = document.createElement("div"); thx.className = "set-about"; thx.style.marginTop = "6px"; thx.textContent = t("donateThanks"); s.appendChild(thx);
  body.appendChild(s);
}

/* Update history: every release from the CHANGELOG built into the app,
 * newest first, in a panel over the settings. */
async function showHistory() {
  if (page !== "about") goPage("about");
  const box = $("history"), list = $("historyList");
  $("historyBack").textContent = t("historyBack");
  $("historyTitle").textContent = t("history");
  let md = "", ver = "";
  try { md = await invoke("get_changelog", { lang: LANG }); } catch (e) {}
  try { ver = await T.app.getVersion(); } catch (e) {}
  list.innerHTML = "";
  MD.releases(md).forEach((r) => {
    const sec = document.createElement("div"); sec.className = "hist-rel";
    const head = document.createElement("div"); head.className = "hist-head";
    head.innerHTML = `<b>v${MD.esc(r.version)}</b>${r.date ? `<span class="hist-date">${MD.esc(r.date)}</span>` : ""}${r.version === ver ? `<span class="hist-cur">${MD.esc(t("historyCur"))}</span>` : ""}`;
    const body = document.createElement("div"); body.className = "hist-body md"; body.innerHTML = MD.render(r.body);
    body.querySelectorAll("a.md-a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); invoke("open_url", { url: a.dataset.href }).catch(() => {}); }));
    sec.appendChild(head); sec.appendChild(body); list.appendChild(sec);
  });
  box.hidden = false; list.scrollTop = 0;
}
function hideHistory() { $("history").hidden = true; }

function saveSettings() {
  invoke("update_settings", { data: JSON.stringify(draft) })
    .then((res) => { if (res) cfg = JSON.parse(res); emit("settings:changed"); try { getCurrentWindow().close(); } catch (e) {} })
    .catch((err) => setErr(String(err)));
}
function cancelSettings() { emit("theme:preview", cfg.theme || "soft"); emit("accent:preview", cfg.accent || "terra"); try { getCurrentWindow().close(); } catch (e) {} }

$("saveBtn").addEventListener("click", saveSettings);
$("cancelBtn").addEventListener("click", cancelSettings);
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !capturing) { if (!$("history").hidden) hideHistory(); else cancelSettings(); } });
$("historyBack").addEventListener("click", hideHistory);
try { T.event.listen("settings:goto", (ev) => { if (ev.payload === "history") showHistory(); }); } catch (e) {}

window.addEventListener("error", (e) => { const el = document.getElementById("setErr"); if (el) el.textContent = "错误: " + (e.message || e.error || e); });
window.addEventListener("unhandledrejection", (e) => { const el = document.getElementById("setErr"); if (el) { const r = e.reason; el.textContent = "错误: " + (r && r.toString ? r.toString() : r); } });
(async function boot() {
  try { const s = await invoke("get_settings"); if (s) cfg = JSON.parse(s); } catch (e) {}
  try { monitors = (await invoke("list_monitors")) || []; } catch (e) {}
  draft = Object.assign({ history_days: 30, hotkey_clip: "Ctrl+Alt+C", hotkey_notes: "Ctrl+Alt+N", hover_enabled: true, dwell_ms: 250, flip_mod: "shift", retention_days: 30, lang: "auto", autostart: false, theme: "soft", watch_folders: [], font_family: "default", font_size: "medium", reminder_presets: ["m15", "h1", "tomorrow"], drop_to_hang: true, text_drag_ext: "txt", accent: "terra", move_mod: "shift", fold_by_date: true, hotkey_shot: "Ctrl+Alt+S", tray_icon: "a", update_mode: "notify", skipped_version: "", line_display: "cursor" }, cfg);
  document.documentElement.dataset.accent = draft.accent || "terra";
  previewFont(draft.font_family);
  LANG = pickLang(draft);
  render();
  try { if ((await invoke("settings_goto")) === "history") showHistory(); } catch (e) {}
})();
