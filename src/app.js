"use strict";

/* ---------- Tauri bridge (with a browser fallback for dev) ---------- */
const TAURI = window.__TAURI__;
const invoke = TAURI ? TAURI.core.invoke : async () => {};
const listen = TAURI ? TAURI.event.listen : async () => () => {};
const convertFileSrc = (p) => { try { return TAURI ? TAURI.core.convertFileSrc(p) : p; } catch (e) { return p; } };
const isImagePath = (p) => /\.(png|jpe?g|gif|bmp|webp)$/i.test(p || "");
const FILE_SVG = '<svg width="40" height="44" viewBox="0 0 40 44" xmlns="http://www.w3.org/2000/svg"><path d="M7 2h18l9 9v29a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#f1efe8" stroke="#c9b79a" stroke-width="2"/><path d="M25 2v9h9" fill="none" stroke="#c9b79a" stroke-width="2"/><line x1="11" y1="20" x2="29" y2="20" stroke="#d8d3c8" stroke-width="2.5" stroke-linecap="round"/><line x1="11" y1="27" x2="29" y2="27" stroke="#d8d3c8" stroke-width="2.5" stroke-linecap="round"/><line x1="11" y1="34" x2="23" y2="34" stroke="#d8d3c8" stroke-width="2.5" stroke-linecap="round"/></svg>';

/* ---------- file-type icons: colour band + extension, like Office/Explorer ---------- */
const FILE_KINDS = [
  ["#2b579a", "doc docx rtf odt wps dot dotx"],
  ["#217346", "xls xlsx xlsm csv ods et"],
  ["#d24726", "ppt pptx pps ppsx odp dps"],
  ["#e5252a", "pdf"],
  ["#8e5bd8", "png jpg jpeg gif bmp webp svg ico tif tiff heic psd ai"],
  ["#e0457b", "mp4 mkv avi mov wmv flv webm m4v"],
  ["#f0a020", "mp3 wav flac aac m4a ogg wma"],
  ["#8d6e63", "zip rar 7z tar gz bz2 xz iso cab"],
  ["#455a64", "js ts jsx tsx py rs java c cpp h hpp cs go rb php html htm css scss json xml yml yaml toml sh bat cmd ps1 sql md"],
  ["#78909c", "txt log ini cfg conf"],
  ["#37474f", "exe msi apk lnk dll appx msix"],
];
function extOf(p) { const b = baseName(p); const m = b.match(/\.([^.\\/]{1,8})$/); return m ? m[1].toLowerCase() : ""; }
function kindColor(ext) { for (const [c, list] of FILE_KINDS) if ((" " + list + " ").includes(" " + ext + " ")) return c; return "#9e9e9e"; }
function fileIconSvg(p, isDir, size) {
  const w = size || 40, h = Math.round(w * 1.1);
  if (isDir) {
    return `<svg width="${w + 4}" height="${h}" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg"><path d="M3 9a3 3 0 0 1 3-3h10l4 4h18a3 3 0 0 1 3 3v22a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" fill="#f2c14e"/><path d="M3 15h38v20a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" fill="#f7d675"/></svg>`;
  }
  const ext = extOf(p), c = kindColor(ext), label = (ext || "file").toUpperCase().slice(0, 4);
  const fs = label.length > 3 ? 7.5 : 9;
  return `<svg width="${w}" height="${h}" viewBox="0 0 40 44" xmlns="http://www.w3.org/2000/svg"><path d="M7 2h18l9 9v29a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#fbfaf6" stroke="#cfc7b8" stroke-width="1.6"/><path d="M25 2v7a2 2 0 0 0 2 2h7" fill="#ece6da" stroke="#cfc7b8" stroke-width="1.6"/><rect x="2" y="23" width="30" height="13" rx="2.5" fill="${c}"/><text x="17" y="32.6" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${fs}" font-weight="700" fill="#fff">${label}</text></svg>`;
}
/* exists / is-folder, cached per path for this session */
const pathInfoCache = new Map();
function withPathInfo(paths, cb) {
  const need = paths.filter((p) => !pathInfoCache.has(p));
  if (!need.length) { cb(paths.map((p) => pathInfoCache.get(p))); return; }
  invoke("path_info", { paths: need }).then((r) => {
    need.forEach((p, i) => pathInfoCache.set(p, r[i] || [true, false]));
    cb(paths.map((p) => pathInfoCache.get(p)));
  }).catch(() => {});
}
/* which modifier means "move" when a card drag starts (settings) */
function moveHeld(e) { const m = cfg.move_mod || "shift"; return m === "alt" ? e.altKey : m === "ctrl" ? e.ctrlKey : e.shiftKey; }
/* after a move: drop the paths that are gone from the card (or the whole card) */
function afterMove(item, paths, tries) {
  // Explorer may finish the move a moment later (copy engine) — check again.
  tries = tries || 0;
  pathInfoCache.clear();
  withPathInfo(paths, (info) => {
    if (!paths.some((p, i) => info[i] && !info[i][0])) { if (tries < 2) setTimeout(() => afterMove(item, paths, tries + 1), tries ? 2500 : 600); return; }
    const gone = paths.filter((p, i) => info[i] && !info[i][0]);
    if (!gone.length) return;
    if (item.vis === "image") { state.clips = state.clips.filter((c) => c !== item); }
    else {
      item.files = (item.files || []).filter((p) => !gone.includes(p));
      if (!item.files.length) state.clips = state.clips.filter((c) => c !== item);
      else item.text = item.files.join("\n");
    }
    save(); render(); toast(t("moved"));
  });
}
const DRAG_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADgAAAA4CAYAAACohjseAAAABmJLR0QA/wD/AP+gvaeTAAADMklEQVRoge2azWsTQRjGf7NJbJN+6KEqQooIfvQg9mCt7aFi9aL2rv9B8T/opVI/QNCLnu3Nk2gRWpAKNgpeKsEPBCmkaAUteolF25pNm2TGy6aINDqbmY1p2N8lG9h53nl23uwDmYGQkJCQkJCKCD83z06Pn4ygxhQcA1oCmtNPIC3hdv/Z4SlTMW2D6ek7owquAI5pUV2E4GrvmeExIw2dm2anx086qJRwIk7yQA+7kl1EYttM6lakVFgn+2WeT5k0SpakkHKwd+ji82r1tFbDQV0GnOSBHvbsOxKYOYBIbBu79x4muf8ogKMc57KJnm67HQXYlewyqeWLnZ0btXpMdHQNtuI93VoRjTWVL9tMdGr2wvhfNLzBqA2R3MIcSzMT5Bc/INfXbEgCsMP7zIxcUOV8VErc7rp5TzsfjVdw6elDFsevkVuYs2puE1qAQSHUZGbkwhXdQUYrmFuYI/vkASISoXVgiER3H6I5YSJZEZXP4b57yfKzSSgVR+dHzqcO3rj/z3w0WsFvMxOgFK0DQ7QcPxWYOQDRnCDRc4K2gXMAjkJo5aORwbXFBQAS3X0mMr6Id/eXL7Xy0cigXM+D93RrhRPfqKWVjw0fE6HBrY6VoP+T5ewixbW8Fa1oUzPtHcnqx1uZxW/8yH7m6/s3VjUViu0dnVWNDVvUL9s7OhEI8u6yFb3meHt9tShAe0eS9iCEq6DhWzQ0uNUJ5Dfo5laRxZIVLScaIZ5orXq8dYNubpXvS1nbslWbDFvUL+UnXSgWrOjForH6alE8k/EghKug4Vs0NLjVqZscNM27StRdDto2GbaoX6rNQdO8q4SuwRWgrVRY19oj3HI5KOAVQPbLfOATso2WwRLcAviUSfP141uKhUB3kayiZbD/7PCUEFxVsiQ/Z9K8Tt0l/Xg8+NlZQPst2ntmeExIOQg8BVaDnZY9fL1FvfMqp8vfvZ3XuqbhczA0+A9W8LaXa4V0N2pp/bNsZLCcj+67lyYyvnDfznpXSquo2Q6vErcAlp9Nsvoihcy7JnJ/r+Xm+PkixcrzRwASqXeGzdd50c3wjnSM1vD3LEFcOnTj3nWdm38BEHbzQzZC4kIAAAAASUVORK5CYII=";

/* Keep the line from auto-rolling-up while a menu / overlay is open. */
function refreshModal() {
  const open = !$("ctx").hidden || !$("preview").hidden || !$("reader").hidden || !$("editor").hidden || !$("settings").hidden || !$("stackPop").hidden || !$("basketView").hidden || !$("catPop").hidden;
  invoke("set_modal", { on: open }).catch(() => {});
}

/* ---------- i18n ---------- */
const I18N = {
  zh: {
    cat_blue: "工作", cat_orange: "待办", cat_yellow: "灵感", cat_green: "生活", cat_cream: "资料", cat_black: "稍后看", cat_red: "要紧", catNone: "未分类",
    catNew: "＋ 新建分类", catManage: "管理分类…", catTitle: "便签分类", catNamePh: "新分类名称", catAdd: "添加", catDel: "删除分类", catDelAsk: "确认删除？", catFull: "颜色已经用完了，删掉一个分类才能再加", catHint: "改名直接在框里改；删除分类不会删除便签，只是改为未分类", catNotes: "{n} 张", catPick: "选个颜色",
    basketTip: "收纳袋：已完成的便签", bagCap: "已完成", basketTitle: "已完成的便签", basketEmpty: "收纳袋是空的。\n便签上点 ✕（或「整理」）后，完成的便签会放进这里，按月统计。", monthDone: "本月完成 ", statN: "{n} 张", statK: "{k} 项", putBack: "↩ 放回绳上", delOne: "删除", clearBasket: "清空收纳袋", clearAsk: "确认清空？", keepDays: "保留 {n} 天", keepForever: "永久保留", keepTip: "点击修改收纳袋的保留天数", keepPick: "保留：", keepForeverOpt: "永久", keepPurge: "清理 {n} 张？", keepSet: "已改为保留 {n} 天", keepSetForever: "已改为永久保留", keepPurged: "，清理了 {n} 张", copyNote: "复制内容", toBasket: "已放进收纳袋", toBasketN: "已把 {n} 张放进收纳袋", restored: "已放回绳上", doneOn: "{d} 完成",
    takeNote: "完成，放进收纳袋", deleteNote: "删除（不进收纳袋）", deletedNote: "已删除", noteTidyTip: "把待办全部打勾的便签放进收纳袋", confirmDone: "钉住的便签，确认放进收纳袋？",
    all: "全部", text: "文字", link: "链接", color: "颜色", image: "图片", file: "文件",
    search: "搜索…", copied: "已复制", editText: "编辑文字", annotate: "✎ 标注", ocr: "文 识别文字（OCR）", ocrRunning: "正在识别文字…", ocrFail: "识别失败：", ocrNone: "没有识别到文字", ocrDone: "已识别 {n}，已复制，可在这里修改", cntZi: "{n} 字", cntWord: "{n} 词", shotTip: "截图上绳", favMore: "其余收藏", favZone: "左边是收藏区", g3: "三日内", g7: "一周内", gOld: "更早", cards: "张", total: "共", groupOpen: "展开这一叠", groupHint: "单击复制 · 拖出 · 双击编辑/打开 · 右键更多", takeAll: "全部取下", tookN: "已取下 {n} 张", undo: "撤销", favKeep: "收藏的卡片请先取消收藏", tidy: "整理", tidyTip: "取下原文件已不在的卡片", tidied: "已取下 {n} 张失效卡片", foldTip: "按日期折叠：今天散挂，更早的折成「三日内 / 一周内 / 更早」", foldOnT: "已按日期折叠", foldLabel: "按日期", foldOffT: "已全部散挂", moved: "已移动，卡片已取下", stackOpen: "展开这一叠", stackTitle: "这一叠共 {n} 个文件", stackSplit: "拆成单张", stackHint: "单击复制 · 拖出单个文件 · 双击打开", missing: "原文件已不在（被移动或删除了）", already: "已在绳上，已移到最前", pasteBack: "粘贴到当前应用", savedEdit: "已保存修改", dragFail: "拖出失败: ", catchHint: "松手挂上绳", editorPhClip: "编辑这段文字…", savedTo: "已保存到桌面", hung: "已挂上绳",
    emptyClip: "绳上还空着 — 复制点什么试试",
    emptyNotes: "绳上还没有便签 — 点上方的 + 写一张",
    plus: "新建便签", gear: "设置", prev: "上一屏", next: "下一屏", pinOnly: "只看收藏（钉住）的卡片",
    take: "取下", preview: "预览", edit: "编辑", confirmTake: "确认取下钉住的卡？", dragSort: "按住夹子左右拖动排序", takeDelete: "取下（删除原文件）", confirmTrash: "将 {n} 个原文件移到回收站，并从绳上取下？", toTrash: "移到回收站", trashed: "已移到回收站", trashFail: "删除失败: ",
    copy: "复制", copyImg: "复制图片", copyPath: "复制文件地址",
    pin: "收藏（钉住）", unpin: "取消收藏", favOn: "已收藏，不会被自动清理", favOff: "已取消收藏", noFav: "还没有收藏：鼠标移到卡片上，点右下角 ☆", reveal: "在资源管理器中显示", openIt: "打开",
    openLink: "在浏览器打开", saveDesktop: "保存到桌面", toNote: "转为便签",
    editorPh: "写点什么…\n第一行是标题，支持 Markdown（**粗体**、# 标题、- 列表）\n点上方 ☑ 或输入 - [ ] 加待办，卡片上点方框打勾",
    nextPage: "下一屏", shotLabel: "截图", blankNote: "（空白便签）", todoProg: "待办完成进度",
    moreLines: "还有 {n} 行", moreTip: "滚轮查看其余内容 · 单击打开阅读视图", readEdit: "✎ 编辑", readEditTip: "编辑这张便签（也可以双击便签）", readHint: "Esc 或点空白处关闭 · 双击便签直接编辑",
    tbTodo: "待办清单（单击 [ ] 或 Ctrl+Enter 勾选）", tbBold: "粗体（Ctrl+B）", tbItalic: "斜体（Ctrl+I）", tbStrike: "删除线", tbHead: "标题", tbList: "列表", tbNum: "编号列表", tbQuote: "引用", tbCode: "代码", tbLink: "链接", tbPreview: "预览", tbEdit: "编辑", phText: "文字", phLink: "链接文字",
    linkNote: "备注", linkNotePh: "给这个链接写个备注，例如「报销系统入口」", addNote: "添加备注", editNote: "编辑备注",
    editorHint: "Ctrl+S 保存 · Esc 关闭", editorHintNote: "Ctrl+Enter 勾选 · Ctrl+S 保存 · Esc 关闭", tbTodoLabel: "待办清单", save: "保存", remind: "提醒",
    r15: "15 分钟后", r1h: "1 小时后", rtm: "明天此时", rclr: "清除提醒",
    p_m5: "5 分钟后", p_m10: "10 分钟后", p_m15: "15 分钟后", p_m30: "30 分钟后", p_h1: "1 小时后", p_h2: "2 小时后", p_h3: "3 小时后", p_tonight: "今晚 20:00", p_tomorrow: "明天此时", p_tomorrow9: "明早 9:00", p_nextweek: "下周此时",
    pinDesktop: "钉到桌面", custom: "自定义时间", setTime: "设为提醒", ok: "确定", tpPast: "这个时间已经过了",
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
      ["便签", "点绳中上方 + 新建；第一行为标题；支持 Markdown；☑ 按钮或 - [ ] 加待办，卡上点方框打勾；页脚 🔔 设提醒。"],
      ["截图", "按 PrintScreen 或 Win+Shift+S 截图会进剪贴板，自动挂上绳。"],
    ],
  },
  en: {
    all: "All", text: "Text", link: "Link", color: "Color", image: "Image", file: "File",
    cat_blue: "Work", cat_orange: "To-do", cat_yellow: "Ideas", cat_green: "Life", cat_cream: "Reference", cat_black: "Later", cat_red: "Urgent", catNone: "No category",
    catNew: "＋ New category", catManage: "Manage categories…", catTitle: "Note categories", catNamePh: "New category name", catAdd: "Add", catDel: "Delete", catDelAsk: "Sure?", catFull: "All colours are in use — delete a category to add another", catHint: "Rename in the box; deleting a category keeps its notes (they become uncategorised)", catNotes: "{n}", catPick: "Pick a colour",
    basketTip: "Done bag: finished notes", bagCap: "DONE", basketTitle: "Finished notes", basketEmpty: "The bag is empty.\nClick ✕ on a note (or Tidy) and finished notes go in here, counted by month.", monthDone: "This month: ", statN: "{n} notes", statK: "{k} items", putBack: "↩ Put back", delOne: "Delete", clearBasket: "Empty the bag", clearAsk: "Sure?", keepDays: "Kept {n} days", keepForever: "Kept forever", keepTip: "Click to change how long the bag keeps notes", keepPick: "Keep:", keepForeverOpt: "Forever", keepPurge: "Remove {n}?", keepSet: "Now kept {n} days", keepSetForever: "Now kept forever", keepPurged: "; removed {n}", copyNote: "Copy text", toBasket: "Put in the bag", toBasketN: "Put {n} in the bag", restored: "Put back on the line", doneOn: "Done {d}",
    takeNote: "Done — into the bag", deleteNote: "Delete (skip the bag)", deletedNote: "Deleted", noteTidyTip: "Put notes whose to-dos are all ticked into the bag", confirmDone: "Pinned note — put it in the bag?",
    search: "Search…", copied: "Copied", editText: "Edit text", annotate: "✎ Annotate", ocr: "Recognise text (OCR)", ocrRunning: "Recognising text…", ocrFail: "OCR failed: ", ocrNone: "No text found", ocrDone: "Recognised {n} — copied; edit here if needed", cntZi: "{n} CJK characters", cntWord: "{n} words", shotTip: "Screenshot to the line", favMore: "More favourites", favZone: "Favourites are on the left", g3: "Last 3 days", g7: "This week", gOld: "Older", cards: "", total: "Total", groupOpen: "Open this stack", groupHint: "Click to copy · drag out · double-click to edit/open · right-click for more", takeAll: "Take all down", tookN: "Took down {n}", undo: "Undo", favKeep: "Remove it from favourites first", tidy: "Tidy", tidyTip: "Take down cards whose files are gone", tidied: "Took down {n} broken card(s)", foldTip: "Fold by date: today loose, older folded into stacks", foldOnT: "Folded by date", foldLabel: "By date", foldOffT: "All cards loose", moved: "Moved — card taken down", stackOpen: "Open this stack", stackTitle: "{n} files in this stack", stackSplit: "Split into cards", stackHint: "Click to copy · drag one out · double-click to open", missing: "The original file is gone (moved or deleted)", already: "Already on the line — moved to front", pasteBack: "Paste into the current app", savedEdit: "Changes saved", dragFail: "Drag failed: ", catchHint: "Release to hang it", editorPhClip: "Edit this text…", savedTo: "Saved to Desktop", hung: "Hung on the line",
    emptyClip: "The line is empty — copy something",
    emptyNotes: "No notes yet — click + above to write one",
    plus: "New note", gear: "Settings", prev: "Previous", next: "Next", pinOnly: "Favourites (pinned) only",
    take: "Remove", preview: "Preview", edit: "Edit", confirmTake: "Remove pinned card?", dragSort: "Hold the clip and slide to reorder", takeDelete: "Remove & delete original", confirmTrash: "Move {n} original file(s) to the Recycle Bin and take the card down?", toTrash: "Move to Recycle Bin", trashed: "Moved to Recycle Bin", trashFail: "Delete failed: ",
    copy: "Copy", copyImg: "Copy image", copyPath: "Copy file path",
    pin: "Favourite (pin)", unpin: "Remove favourite", favOn: "Favourited — kept from auto-cleanup", favOff: "Removed from favourites", noFav: "No favourites yet: hover a card and click ☆ at the bottom right", reveal: "Show in Explorer", openIt: "Open",
    openLink: "Open in browser", saveDesktop: "Save to Desktop", toNote: "Turn into note",
    editorPh: "Write something…\nFirst line is the title; Markdown works (**bold**, # heading, - list)\nClick ☑ above or type - [ ] for a to-do, then tick it on the card",
    nextPage: "Next", shotLabel: "Snip", blankNote: "(Blank note)", todoProg: "To-dos done",
    moreLines: "{n} more lines", moreTip: "Scroll for the rest · click to open the reading view", readEdit: "✎ Edit", readEditTip: "Edit this note (or double-click the note)", readHint: "Esc or click outside to close · double-click a note to edit it",
    tbTodo: "To-do list (click [ ] or Ctrl+Enter to tick)", tbBold: "Bold (Ctrl+B)", tbItalic: "Italic (Ctrl+I)", tbStrike: "Strikethrough", tbHead: "Heading", tbList: "Bullet list", tbNum: "Numbered list", tbQuote: "Quote", tbCode: "Code", tbLink: "Link", tbPreview: "Preview", tbEdit: "Edit", phText: "text", phLink: "link text",
    linkNote: "Note", linkNotePh: "Add a note for this link, e.g. \"Expense system login\"", addNote: "Add note", editNote: "Edit note",
    editorHint: "Ctrl+S save · Esc close", editorHintNote: "Ctrl+Enter tick · Ctrl+S save · Esc close", tbTodoLabel: "To-do list", save: "Save", remind: "Remind",
    r15: "In 15 min", r1h: "In 1 hour", rtm: "Tomorrow", rclr: "Clear reminder",
    p_m5: "In 5 min", p_m10: "In 10 min", p_m15: "In 15 min", p_m30: "In 30 min", p_h1: "In 1 hour", p_h2: "In 2 hours", p_h3: "In 3 hours", p_tonight: "Tonight 20:00", p_tomorrow: "Tomorrow, same time", p_tomorrow9: "Tomorrow 9:00", p_nextweek: "Next week",
    pinDesktop: "Pin to desktop", custom: "Custom time", setTime: "Set reminder", ok: "OK", tpPast: "That time has passed",
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
      ["Notes", "Click + to add; first line is the title; Markdown works; ☑ or - [ ] adds a to-do you tick on the card; 🔔 sets a reminder."],
      ["Screenshots", "PrintScreen or Win+Shift+S goes to the clipboard and hangs automatically."],
    ],
  },
};
let LANG = "zh";
// "auto" follows Windows (sys_lang comes from the backend: zh for any Chinese UI, else en).
function pickLang(c) { const l = c.lang === "auto" ? c.sys_lang : c.lang; return l === "en" ? "en" : "zh"; }
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
  { key: "purple", bg: "#ddd5e6", ink: "#292624" },
  { key: "pink",   bg: "#efd8df", ink: "#292624" },
  { key: "teal",   bg: "#cfe4e1", ink: "#292624" },
  { key: "brown",  bg: "#ddd0c0", ink: "#292624" },
];
/* Note categories are named tints: one colour per category, so existing
 * notes fall into a category by their colour and cards render unchanged. */
const CAT_DEFAULTS = ["blue", "orange", "yellow", "green", "cream", "black", "red"];
const catOf = (tint) => (tint ? state.cats.find((c) => c.tint === tint) || null : null);
const catLabel = (c) => (c ? c.name || t("cat_" + c.tint) : t("catNone"));
const catKey = (note) => (catOf(note.tint) ? note.tint : "none");
const tintOf = (k) => TINTS.find((x) => x.key === k) || TINTS[0];

/* ---------- state ---------- */
let state = { clips: [], notes: [], done: [], cats: null, ordered: true };
let cfg = { history_days: 30, hotkey_clip: "Ctrl+Alt+C", hotkey_notes: "Ctrl+Alt+N", hover_enabled: true, dwell_ms: 250, flip_mod: "shift", retention_days: 30, lang: "auto", autostart: false, theme: "soft", watch_folders: [], font_family: "default", font_size: "medium", reminder_presets: ["m15", "h1", "tomorrow"] };
const FONTS = {
  default: '-apple-system, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif',
  yahei: '"Microsoft YaHei", "Segoe UI", sans-serif',
  dengxian: '"DengXian", "Microsoft YaHei", sans-serif',
  source: '"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  simsun: '"SimSun", "Songti SC", serif',
  kaiti: '"KaiTi", "STKaiti", serif',
  fangsong: '"FangSong", "STFangsong", serif',
};
const FONT_SCALE = { small: 0.9, medium: 1, large: 1.15 };
function applyFont(c) {
  const root = document.documentElement;
  root.style.setProperty("--app-font", FONTS[c.font_family] || FONTS.default);
  root.style.setProperty("--fs", String(FONT_SCALE[c.font_size] || 1));
}
// Reminder quick presets: id -> () => timestamp
function atTime(dayOffset, h, m) { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d.getTime(); }
const PRESETS = {
  m5: () => Date.now() + 5 * 60000,
  m10: () => Date.now() + 10 * 60000,
  m15: () => Date.now() + 15 * 60000,
  m30: () => Date.now() + 30 * 60000,
  h1: () => Date.now() + 3600000,
  h2: () => Date.now() + 2 * 3600000,
  h3: () => Date.now() + 3 * 3600000,
  tonight: () => { const t = atTime(0, 20, 0); return t > Date.now() ? t : atTime(1, 20, 0); },
  tomorrow: () => Date.now() + 24 * 3600000,
  tomorrow9: () => atTime(1, 9, 0),
  nextweek: () => Date.now() + 7 * 24 * 3600000,
};
function applyTheme(name) { stage.dataset.theme = name || "soft"; }
function applyAccent(name) { document.documentElement.dataset.accent = name || "terra"; }
const ui = { deck: "clipboard", filter: "all", search: "", pinnedOnly: false, page: 0, cat: "" };

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
      state.done = Array.isArray(d.done) ? d.done : [];
      state.cats = Array.isArray(d.cats) ? d.cats : null;
      state.ordered = !!d.ordered;
    }
  } catch (e) {}
  try {
    const s = await invoke("get_settings");
    if (s) cfg = Object.assign(cfg, JSON.parse(s));
  } catch (e) {}
  LANG = pickLang(cfg);
  if (!state.cats) state.cats = CAT_DEFAULTS.map((k) => ({ tint: k, name: "" }));
  // Every card needs a stable id (used for reordering / removal).
  state.clips.forEach((c, i) => { if (!c.id) c.id = "c" + Date.now() + "-" + i; });
  state.notes.forEach((n, i) => { if (!n.id) n.id = "n" + Date.now() + "-" + i; });
  // One-time migration: order used to be by time; keep that look, then the
  // array order becomes the user's manual order.
  if (!state.ordered) {
    const byTs = (a, b) => (b.ts || 0) - (a.ts || 0);
    state.clips.sort(byTs); state.notes.sort(byTs);
    state.ordered = true; save();
  }
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
  // Finished notes stay in the basket for history_days (0 = forever).
  const hd = cfg.history_days === undefined ? 30 : cfg.history_days;
  if (hd > 0) state.done = state.done.filter((n) => now - (n.doneAt || now) < hd * 86400000);
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
  if (it.vis === "file" || it.kind === "file") return "file:" + normPaths(it.files);
  return "txt:" + (it.text || "");
}
/* Same file set regardless of order, letter case or trailing slashes. */
function normPaths(list) {
  return (list || []).map((p) => String(p).trim().replace(/[\\/]+$/, "").replace(/\//g, "\\").toLowerCase()).sort().join("|");
}
function addClip(item) {
  if (item.kind === "text") item.vis = classify(item.text || "");
  else if (item.kind === "image") item.vis = "image";
  else if (item.kind === "file") item.vis = "file";
  // Same content already on the line → drop the old one and re-hang at front.
  const sig = clipSig(item);
  const idx = state.clips.findIndex((c) => clipSig(c) === sig);
  if (idx >= 0) { item.pinned = state.clips[idx].pinned || false; if (state.clips[idx].note && !item.note) item.note = state.clips[idx].note; state.clips.splice(idx, 1); }
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
    if (ui.cat && !catFilterKeys().includes(ui.cat)) ui.cat = "";
    if (ui.cat) arr = arr.filter((n) => catKey(n) === ui.cat);
    if (ui.search) { const q = ui.search.toLowerCase(); arr = arr.filter((n) => (n.body || "").toLowerCase().includes(q)); }
    return arr.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }
  let arr = state.clips.slice();
  if (ui.filter !== "all") {
    if (ui.filter === "text") arr = arr.filter((c) => c.vis === "text" || c.vis === "code");
    else arr = arr.filter((c) => c.vis === ui.filter);
  }
  if (ui.pinnedOnly) arr = arr.filter((c) => c.pinned);
  if (ui.search) { const q = ui.search.toLowerCase(); arr = arr.filter((c) => ((c.text || "") + "\n" + (c.note || "")).toLowerCase().includes(q)); }
  return arr.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
}

/* ---------- clipboard layout: favourites zone · today loose · date stacks ---------- */
const FAV_SLOTS = 3;
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
function foldOn() { return cfg.fold_by_date !== false; }
function clipZones(list) {
  if (ui.search || ui.pinnedOnly) return { favs: [], favStack: null, loose: list, stacks: [] };
  const favs = list.filter((c) => c.pinned), rest = list.filter((c) => !c.pinned);
  let favShown = favs, favStack = null;
  if (favs.length > FAV_SLOTS) {
    favShown = favs.slice(0, FAV_SLOTS - 1);
    favStack = { key: "fav", fav: true, label: t("favMore"), items: favs.slice(FAV_SLOTS - 1) };
  }
  if (!foldOn()) return { favs: favShown, favStack, loose: rest, stacks: [] };
  const t0 = startOfToday(), d3 = t0 - 2 * 864e5, d7 = t0 - 6 * 864e5;
  const loose = [], g3 = [], g7 = [], gOld = [];
  rest.forEach((c) => { const ts = c.ts || 0; if (ts >= t0) loose.push(c); else if (ts >= d3) g3.push(c); else if (ts >= d7) g7.push(c); else gOld.push(c); });
  const stacks = [["d3", t("g3"), g3], ["d7", t("g7"), g7], ["old", t("gOld"), gOld]]
    .filter((x) => x[2].length).map(([key, label, items]) => ({ key, label, items }));
  return { favs: favShown, favStack, loose, stacks };
}
function renderClips() {
  $("tidy").title = t("tidyTip");
  const cardsEl = $("cards");
  cardsEl.innerHTML = "";
  const list = visibleList();
  const Z = clipZones(list);
  const W = window.innerWidth, pitch = 188, cardW = 170, GW = 146, GCARD = 128, KW = 70;
  const fixedW = Z.favs.length * pitch + (Z.favStack ? GW : 0);
  const knot = fixedW > 0 && (Z.loose.length || Z.stacks.length);
  const fixed = fixedW + (knot ? KW : 0) + Z.stacks.length * GW;
  const perPage = Math.max(1, Math.floor((W - 60 - fixed) / pitch));
  const pages = Math.max(1, Math.ceil(Z.loose.length / perPage));
  if (ui.page >= pages) ui.page = pages - 1;
  if (ui.page < 0) ui.page = 0;
  const looseSlice = Z.loose.slice(ui.page * perPage, ui.page * perPage + perPage);

  const entries = [];
  Z.favs.forEach((it) => entries.push({ kind: "card", item: it, zone: "fav", w: pitch }));
  if (Z.favStack) entries.push({ kind: "group", group: Z.favStack, w: GW });
  if (knot) entries.push({ kind: "knot", w: KW });
  looseSlice.forEach((it) => entries.push({ kind: "card", item: it, zone: "loose", w: pitch }));
  Z.stacks.forEach((g) => entries.push({ kind: "group", group: g, w: GW }));
  const total = entries.reduce((n, e) => n + e.w, 0);
  let x0 = Math.max(20, (W - total) / 2);
  entries.forEach((e) => { e.x = x0 + e.w / 2; x0 += e.w; });

  cardsEl.classList.toggle("no-anim", !!ui.noAnim);
  ui.noAnim = false;
  if (list.length === 0) {
    const e = document.createElement("div"); e.className = "empty"; e.textContent = t("emptyClip"); cardsEl.appendChild(e);
  }
  entries.forEach((e, i) => {
    if (e.kind === "knot") {
      const k = document.createElement("div"); k.className = "knot"; k.title = t("favZone");
      k.style.left = `${e.x - 7}px`; k.style.top = `${ropeY(e.x) - 9}px`;
      cardsEl.appendChild(k); return;
    }
    const el = e.kind === "group" ? buildGroupCard(e.group) : buildClipCard(e.item);
    el.style.left = `${e.x - (e.kind === "group" ? GCARD : cardW) / 2}px`;
    el.style.top = `${ropeY(e.x)}px`;
    el.style.setProperty("--swing", `${(i % 2 ? 1 : -1) * (5 + (i % 3) * 2)}deg`);
    el.dataset.id = e.kind === "group" ? "group:" + e.group.key : e.item.id;
    e.el = el;
    cardsEl.appendChild(el);
  });
  ui.layout = { pitch, cardW, entries, isNotes: false };
  attachZoneReorder(entries, "fav");
  attachZoneReorder(entries, "loose");

  const n = Z.loose.length;
  const from = n ? ui.page * perPage + 1 : 0, to = Math.min(n, ui.page * perPage + perPage);
  $("count").textContent = pages > 1 ? `${from}–${to} / ${n} · ${t("total")} ${list.length}` : `${t("total")} ${list.length}`;
  $("prev").style.visibility = ui.page > 0 ? "visible" : "hidden";
  $("next").style.visibility = ui.page < pages - 1 ? "visible" : "hidden";
  renderFilters();
  $("foldBtn").classList.toggle("on", foldOn());
  $("foldBtn").hidden = false;
  if (stackGroupKey) refreshGroup();
  updateTidy();
}

/* reorder by the clip, within one zone (favourites, or today's loose cards) */
function attachZoneReorder(entries, zone) {
  const zs = entries.filter((e) => e.kind === "card" && e.zone === zone);
  if (zs.length < 2) return;
  const xs = zs.map((z) => z.x), cardW = 170;
  zs.forEach((e, idx) => {
    const card = e.el, peg = card.querySelector(".peg");
    if (!peg) return;
    peg.classList.add("grab"); peg.title = t("dragSort");
    peg.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      ev.stopPropagation(); ev.preventDefault();
      const startLeft = parseFloat(card.style.left) || 0, sx = ev.clientX;
      let target = idx;
      try { peg.setPointerCapture(ev.pointerId); } catch (x) {}
      card.classList.add("dragging");
      zs.forEach((z) => { if (z.el !== card) z.el.classList.add("reflow"); });
      invoke("set_modal", { on: true }).catch(() => {});
      const move = (mv) => {
        const left = startLeft + (mv.clientX - sx), cx = left + cardW / 2;
        card.style.left = left + "px";
        card.style.top = ropeY(Math.max(0, Math.min(window.innerWidth, cx))) + "px";
        let best = 0, bd = 1e9;
        xs.forEach((x, i) => { const d = Math.abs(x - cx); if (d < bd) { bd = d; best = i; } });
        if (best === target) return;
        target = best;
        let slot = 0;
        zs.forEach((z) => {
          if (z.el === card) return;
          if (slot === target) slot++;
          z.el.style.left = xs[slot] - cardW / 2 + "px"; z.el.style.top = ropeY(xs[slot]) + "px";
          slot++;
        });
      };
      const up = () => {
        peg.removeEventListener("pointermove", move); peg.removeEventListener("pointerup", up); peg.removeEventListener("pointercancel", up);
        card.classList.remove("dragging"); refreshModal();
        if (target !== idx) reorderSubset(zs.map((z) => z.item), idx, target);
        ui.noAnim = true; render();
      };
      peg.addEventListener("pointermove", move); peg.addEventListener("pointerup", up); peg.addEventListener("pointercancel", up);
    });
  });
}
function reorderSubset(items, from, to) {
  const arr = state.clips, next = items.slice();
  const [m] = next.splice(from, 1); next.splice(to, 0, m);
  const ids = new Set(items.map((x) => x.id)), slots = [];
  arr.forEach((x, i) => { if (ids.has(x.id)) slots.push(i); });
  slots.forEach((pos, k) => { arr[pos] = next[k]; });
  save();
}

/* a folded stack on the rope (other favourites, or a date group) */
function buildGroupCard(g) {
  const card = document.createElement("div");
  card.className = "card stack group" + (g.fav ? " favgroup pinned" : "");
  const top = g.items[0] || {};
  const peek = top.vis === "image" ? t("image") : top.vis === "file" ? baseName((top.files || [])[0] || "") : (top.text || "").trim().slice(0, 24);
  card.innerHTML = `<div class="peg"></div><div class="card-body"><div class="c-group">
    <div class="g-label">${g.fav ? "★ " : ""}${escapeHtml(g.label)}</div>
    <div class="g-count">${g.items.length}<span>${t("cards")}</span></div>
    <div class="g-peek">${escapeHtml(peek)}</div></div></div>`;
  card.title = t("groupOpen");
  card.querySelector(".card-body").addEventListener("click", () => openGroup(g, card));
  card.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const ctx = $("ctx"); ctx.innerHTML = ""; ctx.classList.remove("remind", "tp"); ctx.onkeydown = null;
    const add = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.onclick = () => { hideCtx(); fn(); }; ctx.appendChild(b); };
    add(t("groupOpen"), () => openGroup(g, card));
    if (!g.fav) { add(t("takeAll"), () => removeItems(g.items.slice(), t("tookN"))); ctx.lastChild.style.color = "#c0392b"; }
    ctx.hidden = false; refreshModal();
    ctx.style.left = Math.min(e.clientX, window.innerWidth - 170) + "px";
    ctx.style.top = Math.min(e.clientY, window.innerHeight - (ctx.offsetHeight || 80)) + "px";
  });
  return card;
}

/* the popover for a folded stack: every card as a tile with its usual actions */
let stackGroupKey = null, stackAnchor = null;
function openGroup(g, card) {
  stackItem = null; stackGroupKey = g.key;
  const r = card.getBoundingClientRect(); stackAnchor = r.left + r.width / 2;
  fillGroup(g);
  $("stackPop").hidden = false;
  placeStack();
  refreshModal();
}
function placeStack() {
  const pop = $("stackPop"), w = pop.offsetWidth;
  pop.style.left = Math.max(8, Math.min((stackAnchor || 0) - w / 2, window.innerWidth - w - 8)) + "px";
}
function refreshGroup() {
  if (!stackGroupKey || $("stackPop").hidden) return;
  const Z = clipZones(visibleList());
  const g = stackGroupKey === "fav" ? Z.favStack : Z.stacks.find((x) => x.key === stackGroupKey);
  if (!g || !g.items.length) { closeStack(); return; }
  fillGroup(g);
}
function fillGroup(g) {
  $("spTitle").textContent = `${g.fav ? "★ " : ""}${g.label} · ${g.items.length} ${t("cards")}`;
  $("spSplit").textContent = t("takeAll");
  $("spSplit").hidden = !!g.fav;
  $("spHint").textContent = t("groupHint");
  const box = $("spItems"); box.innerHTML = "";
  g.items.forEach((it) => box.appendChild(buildTile(it)));
}
function buildTile(item) {
  const d = document.createElement("div"); d.className = "sp-item tile" + (item.pinned ? " fav" : "");
  if (item.vis === "image") d.innerHTML = `<div class="sp-ico"><img src="${item.thumb || ""}" alt=""></div><div class="sp-name">${t("image")}</div>`;
  else if (item.vis === "file") {
    const f = item.files || [], first = f[0] || "";
    d.innerHTML = `<div class="sp-ico">${fileIconSvg(first, false)}</div><div class="sp-name">${escapeHtml(baseName(first))}${f.length > 1 ? " +" + (f.length - 1) : ""}</div>`;
    withPathInfo([first], ([inf]) => { if (inf && inf[1]) d.querySelector(".sp-ico").innerHTML = fileIconSvg(first, true); if (inf && !inf[0]) d.classList.add("missing"); });
  } else if (item.vis === "color") {
    const v = (item.text || "").trim();
    d.innerHTML = `<div class="sp-ico"><i class="sp-sw" style="background:${escapeHtml(v)}"></i></div><div class="sp-name">${escapeHtml(v)}</div>`;
  } else d.innerHTML = `<div class="sp-text${item.vis === "link" ? " link" : ""}">${item.vis === "link" && item.note ? `<b class="sp-note">${escapeHtml(item.note)}</b>` : ""}${escapeHtml((item.text || "").slice(0, 140))}</div>`;
  const x = document.createElement("button"); x.className = "sp-x"; x.textContent = "✕"; x.title = t("take");
  x.addEventListener("click", (e) => { e.stopPropagation(); if (item.pinned) { toast(t("favKeep")); return; } removeItems([item], t("tookN")); });
  x.addEventListener("pointerdown", (e) => e.stopPropagation());
  d.appendChild(x);
  // drag out
  let sx = 0, sy = 0, armed = false;
  d.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; armed = true; sx = e.clientX; sy = e.clientY; });
  d.addEventListener("pointerup", () => { armed = false; });
  d.addEventListener("pointermove", (e) => {
    if (!armed || (Math.abs(e.clientX - sx) < 6 && Math.abs(e.clientY - sy) < 6)) return;
    armed = false;
    suppressClickUntil = Date.now() + 500; selfDragUntil = Date.now() + 60000;
    const done = () => { selfDragUntil = Date.now() + 400; };
    if (item.vis === "image" || item.vis === "file") {
      const paths = item.vis === "image" ? (item.path ? [item.path] : []) : (item.files || []);
      const mov = moveHeld(e);
      invoke("drag_files", { paths, mov }).catch((err) => toast(String(err).includes("不存在") ? t("missing") : t("dragFail") + err))
        .then(() => { if (mov) afterMove(item, paths); }).finally(done);
    } else invoke("drag_text", { text: item.text || "" }).catch((err) => toast(t("dragFail") + err)).finally(done);
  });
  d.addEventListener("click", () => { if (dragSuppressed()) return; copyClip(item, d); });
  d.addEventListener("dblclick", () => {
    if (item.vis === "file") { if ((item.files || []).length > 1) return; invoke("open_path", { path: item.files[0] }).catch(() => {}); return; }
    closeStack();
    if (item.vis === "image") openPreview(item); else openClipEditor(item);
  });
  d.addEventListener("contextmenu", (e) => { closeStack(); showCtx(e, item, false); });
  return d;
}

/* remove several cards with an Undo (image cache files are deleted only once Undo expires) */
function removeItems(items, msgTpl) {
  const ids = new Set(items.map((x) => x.id));
  const snapshot = state.clips.slice();
  state.clips = state.clips.filter((c) => !ids.has(c.id));
  save(); render();
  let undone = false;
  toastAction(msgTpl.replace("{n}", items.length), t("undo"), () => { undone = true; state.clips = snapshot; save(); render(); }, 5000, () => {
    if (undone) return;
    items.forEach((it) => { if (it.path) invoke("delete_file", { path: it.path }).catch(() => {}); });
  });
}
let toastActTimer = null;
function toastAction(msg, label, onAction, ms, onExpire) {
  const el = $("toast");
  el.innerHTML = ""; el.appendChild(document.createTextNode(msg + "  "));
  const b = document.createElement("button"); b.className = "toast-act"; b.textContent = label;
  let fired = false;
  b.onclick = () => { if (fired) return; fired = true; onAction(); el.classList.remove("show", "act"); };
  el.appendChild(b);
  el.classList.add("show", "act");
  clearTimeout(toastTimer); clearTimeout(toastActTimer);
  toastActTimer = setTimeout(() => { el.classList.remove("show", "act"); if (!fired && onExpire) onExpire(); }, ms);
}

/* ---------- 整理: take down cards whose original files are gone ---------- */
let tidyList = [];
function updateTidy() {
  const btn = $("tidy");
  const cands = state.clips.filter((c) => c.vis === "file" && !c.pinned && (c.files || []).length);
  if (!cands.length) { tidyList = []; btn.hidden = true; return; }
  const all = [...new Set(cands.flatMap((c) => c.files))];
  withPathInfo(all, (info) => {
    const exists = new Map(all.map((p, i) => [p, info[i] ? info[i][0] : true]));
    tidyList = cands.filter((c) => c.files.every((p) => exists.get(p) === false));
    btn.hidden = !tidyList.length;
    btn.textContent = `${t("tidy")} ${tidyList.length}`;
  });
}
function runTidy() {
  if (!tidyList.length) return;
  const items = tidyList.slice(), ids = new Set(items.map((x) => x.id));
  $("cards").querySelectorAll(".card").forEach((el) => { if (ids.has(el.dataset.id)) el.classList.add("falling"); });
  setTimeout(() => removeItems(items, t("tidied")), 420);
}

/* ---------- note categories: filter chips on the notes line ---------- */
// Keys of the categories that have notes on the line ("none" = uncategorised).
function catFilterKeys() {
  const used = new Set(state.notes.map(catKey));
  const keys = state.cats.map((c) => c.tint).filter((k) => used.has(k));
  if (used.has("none")) keys.push("none");
  return keys;
}
function catDot(tint) { return `<i class="cat-dot" style="background:${tintOf(tint).bg}"></i>`; }
function renderCatFilters(el) {
  el.innerHTML = "";
  const keys = catFilterKeys();
  if (keys.length < 2 && !ui.cat) return; // one colour only: nothing to filter
  const mk = (key, html) => {
    const b = document.createElement("button");
    b.innerHTML = html;
    if (ui.cat === key) b.classList.add("on");
    b.onclick = () => { ui.cat = key; ui.page = 0; render(); };
    b.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); openCatPop(); });
    el.appendChild(b);
  };
  mk("", escapeHtml(t("all")));
  keys.forEach((k) => mk(k, catDot(k === "none" ? null : k) + escapeHtml(catLabel(k === "none" ? null : catOf(k)))));
}

/* ---------- category picker in the editor ---------- */
function applyEditorTint(note) {
  const tt = tintOf(note.tint), sheet = document.querySelector(".editor-sheet");
  sheet.style.setProperty("--editor-bg", tt.bg); sheet.style.setProperty("--editor-ink", tt.ink);
}
function renderCatChip(note) {
  const tc = $("tints"); tc.innerHTML = "";
  const b = document.createElement("button"); b.className = "cat-chip"; b.type = "button";
  b.innerHTML = catDot(catOf(note.tint) ? note.tint : null) + `<span>${escapeHtml(catLabel(catOf(note.tint)))}</span><b>▾</b>`;
  b.onclick = (e) => { e.stopPropagation(); showCatMenu(b, note); };
  tc.appendChild(b);
}
function showCatMenu(anchor, note) {
  const ctx = $("ctx"); ctx.innerHTML = ""; ctx.classList.remove("remind", "tp"); ctx.onkeydown = null;
  const cur = catOf(note.tint) ? note.tint : null;
  const item = (tint, label) => {
    const b = document.createElement("button");
    b.innerHTML = catDot(tint) + escapeHtml(label) + (cur === tint ? ' <span class="cat-check">✓</span>' : "");
    b.onclick = () => { hideCtx(); note.tint = tint; applyEditorTint(note); renderCatChip(note); };
    ctx.appendChild(b);
  };
  item(null, t("catNone"));
  state.cats.forEach((c) => item(c.tint, catLabel(c)));
  const s = document.createElement("div"); s.className = "sep"; ctx.appendChild(s);
  const m = document.createElement("button"); m.textContent = t("catManage");
  m.onclick = () => { hideCtx(); openCatPop(); };
  ctx.appendChild(m);
  ctx.hidden = false; refreshModal();
  const r = anchor.getBoundingClientRect(), h = ctx.offsetHeight;
  ctx.style.left = Math.min(r.left, window.innerWidth - 180) + "px";
  ctx.style.top = Math.max(4, Math.min(r.bottom + 4, window.innerHeight - h - 4)) + "px";
}

/* ---------- manage categories: rename, delete, add ---------- */
let catNewTint = null, catDelArmed = null;
function freeTints() { return TINTS.map((x) => x.key).filter((k) => k && !state.cats.some((c) => c.tint === k)); }
function openCatPop() { catDelArmed = null; fillCatPop(); $("catPop").hidden = false; refreshModal(); }
function closeCatPop() { $("catPop").hidden = true; refreshModal(); }
function catsChanged() {
  save(); render();
  if (!$("editor").hidden && editing && !editing._clip) { applyEditorTint(editing); renderCatChip(editing); }
}
function fillCatPop() {
  $("catTitle").textContent = t("catTitle");
  $("catHint").textContent = t("catHint");
  const list = $("catList"); list.innerHTML = "";
  state.cats.forEach((c) => {
    const row = document.createElement("div"); row.className = "cat-row";
    const n = state.notes.filter((x) => x.tint === c.tint).length;
    row.innerHTML = catDot(c.tint) + `<input type="text" maxlength="12" spellcheck="false"><span class="cat-n"></span><button class="cat-del"></button>`;
    const inp = row.querySelector("input");
    inp.value = catLabel(c);
    inp.addEventListener("change", () => {
      const v = inp.value.trim();
      c.name = !v || v === t("cat_" + c.tint) ? "" : v;
      inp.value = catLabel(c); catsChanged();
    });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); e.stopPropagation(); });
    row.querySelector(".cat-n").textContent = n ? t("catNotes").replace("{n}", n) : "";
    const del = row.querySelector(".cat-del");
    del.textContent = catDelArmed === c.tint ? t("catDelAsk") : t("catDel");
    del.classList.toggle("armed", catDelArmed === c.tint);
    del.onclick = () => {
      if (catDelArmed !== c.tint) { catDelArmed = c.tint; fillCatPop(); return; }
      catDelArmed = null;
      state.cats = state.cats.filter((x) => x !== c);
      state.notes.concat(state.done).forEach((x) => { if (x.tint === c.tint) x.tint = null; });
      if (ui.cat === c.tint) ui.cat = "";
      fillCatPop(); catsChanged();
    };
    list.appendChild(row);
  });
  const free = freeTints(), add = $("catAddRow");
  $("catFull").textContent = t("catFull");
  $("catFull").hidden = free.length > 0;
  add.hidden = !free.length;
  if (!free.length) return;
  if (!free.includes(catNewTint)) catNewTint = free[0];
  const dots = $("catAddDots"); dots.innerHTML = ""; dots.title = t("catPick");
  free.forEach((k) => {
    const d = document.createElement("button"); d.type = "button";
    d.className = "tint" + (k === catNewTint ? " on" : ""); d.style.background = tintOf(k).bg;
    d.onclick = () => { catNewTint = k; dots.querySelectorAll(".tint").forEach((z) => z.classList.toggle("on", z === d)); };
    dots.appendChild(d);
  });
  $("catNewName").placeholder = t("catNamePh");
  $("catAddBtn").textContent = t("catAdd");
}
function addCat() {
  const v = $("catNewName").value.trim();
  if (!v) { $("catNewName").focus(); return; }
  if (!freeTints().includes(catNewTint)) return;
  state.cats.push({ tint: catNewTint, name: v });
  $("catNewName").value = "";
  fillCatPop(); catsChanged();
}

/* ---------- the basket: finished notes, kept for a while, counted by month ---------- */
function doneItems(n) { const tl = MD.titleOf(n.body); return MD.progress(n.body, tl.index + 1)[0]; }
function toBasket(notes) {
  if (!notes.length) return;
  const ids = new Set(notes.map((n) => n.id));
  const snapN = state.notes.slice(), snapD = state.done.slice();
  const now = Date.now();
  state.notes = state.notes.filter((n) => !ids.has(n.id));
  // Pending reminders end with the note; the copy in the basket keeps the text.
  notes.forEach((n) => { const c = Object.assign({}, n, { doneAt: now }); delete c.remindAt; delete c.fired; delete c.acked; state.done.unshift(c); });
  save(); render(); bounceBasket();
  const msg = notes.length > 1 ? t("toBasketN").replace("{n}", notes.length) : t("toBasket");
  toastAction(msg, t("undo"), () => { state.notes = snapN; state.done = snapD; save(); render(); }, 5000);
}
function deleteNotes(notes) {
  const ids = new Set(notes.map((n) => n.id)), snap = state.notes.slice();
  state.notes = state.notes.filter((n) => !ids.has(n.id));
  save(); render();
  toastAction(t("deletedNote"), t("undo"), () => { state.notes = snap; save(); render(); }, 5000);
}
// The bag hangs on the rope at the right end; notes are laid out to its left.
const BAG_ROOM = 180;
function updateBasket() {
  const b = $("basket"), n = state.done.length;
  b.querySelector(".bk-n").textContent = n > 999 ? "999+" : String(n);
  b.querySelector(".bk-cap").textContent = t("bagCap");
  b.classList.toggle("empty", !n);
  b.title = t("basketTip");
  const x = window.innerWidth - 96;
  b.style.left = x - 79 + "px";
  b.style.top = ropeY(x) - 6 + "px";
}
function bounceBasket() { const b = $("basket"); b.classList.remove("bounce"); void b.offsetWidth; b.classList.add("bounce"); }

/* tidy on the notes line: notes whose to-dos are all ticked */
let noteTidyList = [];
function updateNoteTidy() {
  noteTidyList = state.notes.filter((n) => { if (n.pinned) return false; const tl = MD.titleOf(n.body); const [d, tot] = MD.progress(n.body, tl.index + 1); return tot > 0 && d === tot; });
  const btn = $("tidy");
  btn.hidden = !noteTidyList.length;
  btn.textContent = `${t("tidy")} ${noteTidyList.length}`;
  btn.title = t("noteTidyTip");
}
function runNoteTidy() {
  if (!noteTidyList.length) return;
  const items = noteTidyList.slice(), ids = new Set(items.map((x) => x.id));
  $("cards").querySelectorAll(".card").forEach((el) => { if (ids.has(el.dataset.id)) el.classList.add("falling"); });
  setTimeout(() => toBasket(items), 420);
}

function monthKey(ts) { const d = new Date(ts); return d.getFullYear() * 100 + d.getMonth(); }
function monthName(key) {
  const y = Math.floor(key / 100), m = key % 100;
  return LANG === "en" ? new Date(y, m, 1).toLocaleString("en-GB", { month: "short", year: "numeric" }) : `${y}年${m + 1}月`;
}
// "12 张 · 47 项 · 工作 8 · 生活 3" for a set of finished notes.
function statParts(list, withCats) {
  const k = list.reduce((s, n) => s + doneItems(n), 0);
  const parts = [t("statN").replace("{n}", list.length)];
  if (k) parts.push(t("statK").replace("{k}", k));
  if (withCats) {
    const m = new Map();
    list.forEach((n) => { const c = catOf(n.tint); if (c) m.set(c, (m.get(c) || 0) + 1); });
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([c, v]) => parts.push(`${catLabel(c)} ${v}`));
  }
  return parts.join(" · ");
}
let basketClearArmed = false;
/* The "kept N days" line at the bottom of the bag: click it to pick another
 * period right here. A shorter period that would drop notes asks once. */
let keepOpen = false, keepArmed = null;
function fillBasketKeep() {
  const foot = $("bkKeep"); foot.innerHTML = "";
  const hd = cfg.history_days === undefined ? 30 : cfg.history_days;
  if (!keepOpen) {
    const b = document.createElement("button"); b.className = "bk-keep";
    b.textContent = (hd > 0 ? t("keepDays").replace("{n}", hd) : t("keepForever")) + " ▾";
    b.title = t("keepTip");
    b.onclick = (e) => { e.stopPropagation(); keepOpen = true; keepArmed = null; fillBasketKeep(); };
    foot.appendChild(b); return;
  }
  const lab = document.createElement("span"); lab.className = "bk-keep-lab"; lab.textContent = t("keepPick"); foot.appendChild(lab);
  [7, 30, 90, 365, 0].forEach((v) => {
    const b = document.createElement("button"); b.className = "bk-keep-opt" + (v === hd ? " on" : "");
    const drop = v > 0 ? state.done.filter((n) => Date.now() - (n.doneAt || Date.now()) >= v * 86400000).length : 0;
    if (keepArmed === v) { b.classList.add("armed"); b.textContent = t("keepPurge").replace("{n}", drop); }
    else b.textContent = v > 0 ? String(v) : t("keepForeverOpt");
    b.onclick = (e) => {
      e.stopPropagation();
      if (v === hd) { keepOpen = false; fillBasketKeep(); return; }
      if (drop > 0 && keepArmed !== v) { keepArmed = v; fillBasketKeep(); return; }
      setHistoryDays(v);
    };
    foot.appendChild(b);
  });
  const dl = document.createElement("span"); dl.className = "bk-keep-lab"; dl.textContent = t("days"); foot.insertBefore(dl, foot.lastChild);
}
async function setHistoryDays(v) {
  const before = state.done.length;
  cfg.history_days = v; keepOpen = false; keepArmed = null;
  cleanup(); save(); updateBasket(); fillBasket();
  const gone = before - state.done.length;
  toast((v > 0 ? t("keepSet").replace("{n}", v) : t("keepSetForever")) + (gone > 0 ? t("keepPurged").replace("{n}", gone) : ""));
  try {
    const cur = JSON.parse((await invoke("get_settings")) || "{}");
    cur.history_days = v;
    await invoke("update_settings", { data: JSON.stringify(cur) });
  } catch (e) {}
}
function openBasket() { basketClearArmed = false; keepOpen = false; keepArmed = null; fillBasket(); $("basketView").hidden = false; refreshModal(); }
function closeBasket() { $("basketView").hidden = true; refreshModal(); }
function fillBasket() {
  $("bkTitle").textContent = t("basketTitle");
  $("bkClose").title = t("close");
  const thisMonth = state.done.filter((n) => monthKey(n.doneAt) === monthKey(Date.now()));
  $("bkStat").textContent = t("monthDone") + statParts(thisMonth, true);
  fillBasketKeep();
  const clr = $("bkClear");
  clr.hidden = !state.done.length;
  clr.textContent = basketClearArmed ? t("clearAsk") : t("clearBasket");
  clr.classList.toggle("armed", basketClearArmed);
  const body = $("bkBody"); body.innerHTML = "";
  if (!state.done.length) { const e = document.createElement("div"); e.className = "bk-empty"; e.textContent = t("basketEmpty"); body.appendChild(e); return; }
  const groups = new Map();
  state.done.slice().sort((a, b) => b.doneAt - a.doneAt).forEach((n) => {
    const k = monthKey(n.doneAt); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n);
  });
  groups.forEach((list, k) => {
    const h = document.createElement("div"); h.className = "bk-month";
    h.innerHTML = `<b>${escapeHtml(monthName(k))}</b><span>${escapeHtml(statParts(list, true))}</span>`;
    body.appendChild(h);
    list.forEach((n) => {
      const tl = MD.titleOf(n.body), [pd, pt] = MD.progress(n.body, tl.index + 1);
      const c = catOf(n.tint), d = new Date(n.doneAt);
      const when = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const row = document.createElement("div"); row.className = "bk-item";
      row.style.setProperty("--bk-bg", tintOf(n.tint).bg);
      row.title = (n.body || "").slice(0, 400);
      row.innerHTML = `<div class="bk-main"><div class="bk-t">${tl.index < 0 ? escapeHtml(t("blankNote")) : MD.inline(tl.text)}</div>
        <div class="bk-meta">${c ? `<span class="bk-cat">${escapeHtml(catLabel(c))}</span>` : ""}${pt ? `<span>☑ ${pd}/${pt}</span>` : ""}<span>${escapeHtml(t("doneOn").replace("{d}", when))}</span></div></div>
        <button class="bk-back"></button><button class="bk-del"></button>`;
      row.querySelectorAll("a.md-a").forEach((a) => a.replaceWith(document.createTextNode(a.textContent)));
      const back = row.querySelector(".bk-back"); back.textContent = t("putBack");
      back.onclick = () => {
        state.done = state.done.filter((x) => x !== n);
        const r = Object.assign({}, n); delete r.doneAt; r.ts = Date.now();
        state.notes.unshift(r); save(); render(); fillBasket(); toast(t("restored"));
      };
      const del = row.querySelector(".bk-del"); del.textContent = "✕"; del.title = t("delOne");
      del.onclick = () => { state.done = state.done.filter((x) => x !== n); save(); updateBasket(); fillBasket(); };
      body.appendChild(row);
    });
  });
}
function clearBasket() {
  if (!basketClearArmed) { basketClearArmed = true; fillBasket(); return; }
  basketClearArmed = false; state.done = []; save(); updateBasket(); fillBasket();
}
$("basket").addEventListener("click", (e) => { e.stopPropagation(); openBasket(); });
$("bkClose").addEventListener("click", closeBasket);
$("bkClear").addEventListener("click", clearBasket);
$("basketView").addEventListener("click", (e) => { if (e.target.id === "basketView") closeBasket(); });
$("catClose").addEventListener("click", closeCatPop);
$("catPop").addEventListener("click", (e) => { if (e.target.id === "catPop") closeCatPop(); });
$("catAddBtn").addEventListener("click", addCat);
$("catNewName").addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") addCat(); });

/* ---------- render ---------- */
function render() {
  drawRope();
  if (ui.deck !== "notes") { renderClips(); return; }
  $("foldBtn").hidden = true; updateNoteTidy(); updateBasket();
  const isNotes = ui.deck === "notes";
  const pitch = isNotes ? 240 : 188;
  const cardsEl = $("cards");
  cardsEl.innerHTML = "";

  const list = visibleList();
  const W = window.innerWidth;
  const room = isNotes ? BAG_ROOM : 0; // keep the bag's spot free
  const perPage = Math.max(1, Math.floor((W - 120 - room) / pitch));
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  if (ui.page >= pages) ui.page = pages - 1;
  if (ui.page < 0) ui.page = 0;
  const slice = list.slice(ui.page * perPage, ui.page * perPage + perPage);
  const count = slice.length;
  const marginX = Math.max(70, (W - room - count * pitch) / 2);
  ui.layout = { marginX, pitch, cardW: isNotes ? 220 : 170, slice, start: ui.page * perPage, isNotes };
  cardsEl.classList.toggle("no-anim", !!ui.noAnim);
  ui.noAnim = false;

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
    el.dataset.id = item.id;
    cardsEl.appendChild(el);
    attachReorder(el, item, isNotes);
  });

  const total = list.length;
  const from = total ? ui.page * perPage + 1 : 0;
  const to = Math.min(total, ui.page * perPage + perPage);
  $("count").textContent = total ? `${from}–${to} / ${total}` : "0";
  $("prev").style.visibility = ui.page > 0 ? "visible" : "hidden";
  $("next").style.visibility = ui.page < pages - 1 ? "visible" : "hidden";
  renderFilters();
  requestAnimationFrame(measureNotes);
}

function renderFilters() {
  const el = $("filters");
  if (ui.deck === "notes") { renderCatFilters(el); return; }
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
    const note = (item.note || "").trim();
    if (note) { d.classList.add("has-note"); card.title = note; }
    d.innerHTML = (note ? `<div class="ln">${escapeHtml(note)}</div>` : "") + `<div class="u">${escapeHtml(url)}</div><div class="host">${escapeHtml(host)}</div>`;
    body.appendChild(d);
  } else if (item.vis === "file") {
    const files = item.files || [];
    const first = files[0] || "";
    const base = first.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || first;
    const more = files.length > 1 ? `<div class="fcount" title="${t("stackOpen")}">+${files.length - 1}</div>` : "";
    if (files.length > 1) card.classList.add("stack");
    if (files.length === 1 && isImagePath(first)) {
      const d = document.createElement("div"); d.className = "c-image";
      d.innerHTML = `<img alt="">${more}`;
      body.appendChild(d);
      invoke("read_image_data", { path: first }).then((data) => { if (data) d.querySelector("img").src = data; }).catch(() => {});
    } else {
      const d = document.createElement("div"); d.className = "c-file";
      d.innerHTML = `<div class="ico">${fileIconSvg(first, false, 50)}</div><div class="fname">${escapeHtml(base)}</div>${more}`;
      body.appendChild(d);
      withPathInfo([first], ([inf]) => {
        if (!inf) return;
        if (inf[1]) d.querySelector(".ico").innerHTML = fileIconSvg(first, true, 50);
        if (!inf[0]) { card.classList.add("missing"); card.title = t("missing"); }
      });
    }
  } else {
    const d = document.createElement("div"); d.className = "c-text" + (item.vis === "code" ? " code" : "");
    d.textContent = item.text || ""; body.appendChild(d);
  }

  addCorners(card, body, item, false);
  const isStack = item.vis === "file" && (item.files || []).length > 1;
  if (isStack) {
    const mag = body.querySelector(".corner.mag"); if (mag) { mag.textContent = "☰"; mag.title = t("stackOpen"); }
  }
  body.addEventListener("click", (e) => {
    if (e.target.closest(".corner")) return; if (dragSuppressed()) return;
    if (isStack && e.target.closest(".fcount")) { openStack(item, card); return; }
    copyClip(item, card);
  });
  body.addEventListener("dblclick", (e) => {
    if (e.target.closest(".corner")) return;
    if (item.vis === "image") { invoke("copy_image", { path: item.path }).catch(()=>{}); invoke("rollup_now"); }
    else if (item.vis === "file") { if (isStack) openStack(item, card); else if ((item.files || [])[0]) invoke("open_path", { path: item.files[0] }).catch(()=>{}); }
    else openClipEditor(item);
  });
  card.addEventListener("contextmenu", (e) => showCtx(e, item, false));
  attachDragOut(card, item);
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
  // Markdown: the first non-empty line is the title, the rest renders as
  // blocks; to-do boxes carry their source line index for ticking.
  const tl = MD.titleOf(note.body);
  const [pd, pt] = MD.progress(note.body, tl.index + 1);
  const prog = pt ? `<span class="note-prog${pd === pt ? " all" : ""}" title="${t("todoProg")}">${pd === pt ? "✓ " : ""}${pd}/${pt}</span>` : "";
  let html = `<div class="note-head"><div class="note-title">${tl.index < 0 ? escapeHtml(t("blankNote")) : MD.inline(tl.text)}</div>${prog}</div>`;
  html += `<div class="note-clip"><div class="note-lines md">${tl.index < 0 ? "" : MD.render(note.body, { from: tl.index + 1 })}</div><button class="note-more" hidden></button>`;
  const due = note.fired && !note.acked;
  // Reminder chip: "🔔 下次 11-04 09:00" on one line, the repeat (每天/每周/每月) on
  // the next; always visible when a reminder is set. Editing is the ✎ corner
  // or a double-click, so the foot no longer carries an Edit button.
  const rep = { daily: t("rDaily"), weekly: t("rWeekly"), monthly: t("rMonthly") }[note.repeat] || "";
  const line1 = due ? t("arrived") : (note.remindAt ? t("next") + " " + fmtWhen(note.remindAt) : t("remind"));
  const hasRem = due || !!note.remindAt;
  html += `</div><div class="note-foot${hasRem ? " has-rem" : ""}">
      <button data-act="bell" class="bell${due ? " dot" : ""}${rep && !due ? " two" : ""}"><span class="b1">🔔 ${escapeHtml(line1)}</span>${rep && !due ? `<span class="b2">${escapeHtml(rep)}</span>` : ""}</button>
      ${due ? `<button data-act="ack">${t("gotit")}</button>` : ""}
    </div>`;
  inner.innerHTML = html;
  body.appendChild(inner);

  inner.querySelectorAll(".box").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); toggleCheck(note, parseInt(b.dataset.idx, 10)); }));
  inner.querySelectorAll(".box").forEach((b) => b.addEventListener("dblclick", (e) => e.stopPropagation()));
  wireLinks(inner);
  inner.querySelector('[data-act="bell"]').addEventListener("click", (e) => { e.stopPropagation(); showReminderPanel(e, note, () => { save(); render(); }); });
  const ackBtn = inner.querySelector('[data-act="ack"]');
  if (ackBtn) ackBtn.addEventListener("click", (e) => { e.stopPropagation(); note.acked = true; note.fired = false; note.remindAt = null; save(); render(); });

  // Content taller than the card: fade + "N more lines"; the wheel scrolls it
  // (see the window wheel handler); positions survive re-renders.
  const lines = inner.querySelector(".note-lines"), more = inner.querySelector(".note-more");
  lines.addEventListener("scroll", () => { noteScroll.set(note.id, lines.scrollTop); updateNoteMore(lines, more); }, { passive: true });
  more.title = t("moreTip");
  more.addEventListener("click", (e) => { e.stopPropagation(); clearTimeout(noteClickTimer); openReader(note); });
  more.addEventListener("dblclick", (e) => e.stopPropagation());

  addCorners(card, body, note, true);
  // Single click = reading view, double click = editor. The single click
  // waits a moment so the first click of a double-click doesn't open it.
  body.addEventListener("click", (e) => {
    if (e.target.closest(".corner, .box, a.md-a, .note-foot button, .note-more")) return;
    if (dragSuppressed() || e.detail > 1) { clearTimeout(noteClickTimer); return; }
    clearTimeout(noteClickTimer);
    noteClickTimer = setTimeout(() => openReader(note), 250);
  });
  body.addEventListener("dblclick", () => { clearTimeout(noteClickTimer); openEditor(note); });
  attachNoteDragOut(body, note);
  card.addEventListener("contextmenu", (e) => showCtx(e, note, true));
  return card;
}

/* ---------- note overflow ---------- */
let noteClickTimer = null;
const noteScroll = new Map(); // note id -> scrollTop, kept while the line is down
function measureNotes() {
  document.querySelectorAll("#cards .card.note").forEach((card) => {
    const lines = card.querySelector(".note-lines"), more = card.querySelector(".note-more");
    if (!lines || !more) return;
    lines.classList.remove("over");
    if (lines.scrollHeight > lines.clientHeight + 2) {
      lines.classList.add("over"); // thin scrollbar on the right (narrows the text, so measure after)
      const top = noteScroll.get(card.dataset.id);
      if (top) lines.scrollTop = top;
    }
    updateNoteMore(lines, more);
  });
}
/* Count the rendered lines that are not fully visible below the fold. A
 * wrapped paragraph is one line; a code block counts its own lines. */
function updateNoteMore(lines, more) {
  if (!lines.classList.contains("over")) { more.hidden = true; lines.classList.remove("fade"); return; }
  const bottom = lines.scrollTop + lines.clientHeight + 1;
  let n = 0;
  for (const el of lines.children) {
    if (el.classList.contains("md-gap")) continue;
    if (el.offsetTop + el.offsetHeight > bottom) n += el.classList.contains("md-pre") ? (el.textContent.match(/\n/g) || []).length + 1 : 1;
  }
  more.hidden = n === 0;
  lines.classList.toggle("fade", n > 0);
  if (n) more.textContent = t("moreLines").replace("{n}", n);
}

/* ---------- reading view: the whole note, tickable, links live, no editing ---------- */
let reading = null;
function openReader(note) {
  if (!note || !state.notes.includes(note)) return;
  reading = note;
  const tt = tintOf(note.tint);
  const sheet = $("readerSheet");
  sheet.style.setProperty("--reader-bg", tt.bg);
  sheet.style.setProperty("--reader-ink", tt.ink);
  $("readerEdit").textContent = t("readEdit"); $("readerEdit").title = t("readEditTip");
  $("readerClose").title = t("close"); $("readerHint").textContent = t("readHint");
  fillReader(true);
  $("reader").hidden = false; refreshModal();
}
function fillReader(reset) {
  const note = reading; if (!note) return;
  const tl = MD.titleOf(note.body);
  const [pd, pt] = MD.progress(note.body, tl.index + 1);
  $("readerTitle").innerHTML = tl.index < 0 ? escapeHtml(t("blankNote")) : MD.inline(tl.text);
  const pg = $("readerProg");
  pg.hidden = !pt; pg.className = "note-prog" + (pt && pd === pt ? " all" : ""); pg.title = t("todoProg");
  pg.textContent = pt ? (pd === pt ? "✓ " : "") + pd + "/" + pt : "";
  const body = $("readerBody"), keep = reset ? 0 : body.scrollTop;
  body.innerHTML = tl.index < 0 ? "" : MD.render(note.body, { from: tl.index + 1 });
  body.scrollTop = keep;
  body.querySelectorAll(".box").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCheck(note, parseInt(b.dataset.idx, 10));
    fillReader(false);
  }));
  wireLinks(body);
  wireLinks($("readerTitle"));
}
function closeReader() { reading = null; $("reader").hidden = true; refreshModal(); }

function toggleCheck(note, lineIdx) {
  const nb = MD.toggle(note.body || "", lineIdx);
  if (nb === note.body) return;
  note.body = nb; note.ts = Date.now();
  save(); render();
}
/* Links inside rendered Markdown open in the browser (not on drag/double-click). */
function wireLinks(root) {
  root.querySelectorAll("a.md-a").forEach((a) => {
    a.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (dragSuppressed()) return; invoke("open_url", { url: normUrl(a.dataset.href) }).catch(() => {}); });
    a.addEventListener("dblclick", (e) => e.stopPropagation());
  });
}

/* ---------- corners ---------- */
function addCorners(card, body, item, isNote) {
  const x = document.createElement("button");
  x.className = "corner x"; x.textContent = "✕"; x.title = isNote ? t("takeNote") : t("take");
  x.addEventListener("click", (e) => { e.stopPropagation(); if (item.pinned) confirmRemove(e, item, isNote); else removeItem(item, isNote); });
  body.appendChild(x);
  const mag = document.createElement("button");
  mag.className = "corner mag"; mag.textContent = isNote ? "✎" : "🔍"; mag.title = isNote ? t("edit") : t("preview");
  mag.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isNote) openEditor(item);
    else if (item.vis === "file" && (item.files || []).length > 1) openStack(item, card);
    else openPreview(item);
  });
  body.appendChild(mag);
  const fav = document.createElement("button");
  fav.className = "corner fav"; fav.textContent = item.pinned ? "★" : "☆"; fav.title = item.pinned ? t("unpin") : t("pin");
  fav.addEventListener("click", (e) => { e.stopPropagation(); item.pinned = !item.pinned; save(); render(); toast(item.pinned ? t("favOn") : t("favOff")); });
  body.appendChild(fav);
}

/* ---------- copy / remove ---------- */
function copyClip(item, card) {
  if (item.vis === "image") invoke("copy_image", { path: item.path }).catch((e) => toast("复制失败: " + e));
  else if (item.vis === "file") invoke("copy_files", { paths: item.files || [] }).catch((e) => toast("复制失败: " + e));
  else invoke("copy_text", { text: item.text || "" }).catch((e) => toast("复制失败: " + e));
  flash(card);
}

/* ---------- stack: pick single files out of a multi-file card ---------- */
let stackItem = null;
function baseName(p) { const q = String(p).replace(/[\\/]+$/, ""); return q.split(/[\\/]/).pop() || q; }
function openStack(item, card) {
  stackItem = item; stackGroupKey = null; $("spSplit").hidden = false;
  const files = item.files || [];
  $("spTitle").textContent = t("stackTitle").replace("{n}", files.length);
  $("spSplit").textContent = t("stackSplit");
  $("spHint").textContent = t("stackHint");
  const box = $("spItems"); box.innerHTML = "";
  files.forEach((p) => {
    const d = document.createElement("div"); d.className = "sp-item"; d.title = p;
    d.innerHTML = `<div class="sp-ico">${fileIconSvg(p, false)}</div><div class="sp-name">${escapeHtml(baseName(p))}</div>`;
    withPathInfo([p], ([inf]) => { if (inf && inf[1]) d.querySelector(".sp-ico").innerHTML = fileIconSvg(p, true); if (inf && !inf[0]) d.classList.add("missing"); });
    if (isImagePath(p)) {
      invoke("read_image_data", { path: p }).then((data) => {
        if (data) d.querySelector(".sp-ico").innerHTML = `<img src="${data}" alt="">`;
      }).catch(() => {});
    }
    // drag one file out
    let sx = 0, sy = 0, armed = false;
    d.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; armed = true; sx = e.clientX; sy = e.clientY; });
    d.addEventListener("pointermove", (e) => {
      if (!armed || (Math.abs(e.clientX - sx) < 6 && Math.abs(e.clientY - sy) < 6)) return;
      armed = false;
      suppressClickUntil = Date.now() + 500;
      selfDragUntil = Date.now() + 60000;
      const mov = moveHeld(e);
      invoke("drag_files", { paths: [p], mov }).catch((err) => toast(String(err).includes("不存在") ? t("missing") : t("dragFail") + err))
        .then(() => { if (mov && stackItem) { const it = stackItem; closeStack(); afterMove(it, [p]); } })
        .finally(() => { selfDragUntil = Date.now() + 400; });
    });
    d.addEventListener("pointerup", () => { armed = false; });
    d.addEventListener("click", () => {
      if (dragSuppressed()) return;
      invoke("copy_files", { paths: [p] }).catch((e) => toast("复制失败: " + e));
      d.classList.add("copied"); setTimeout(() => d.classList.remove("copied"), 900);
      toast(t("copied"));
    });
    d.addEventListener("dblclick", () => invoke("open_path", { path: p }).catch(() => {}));
    box.appendChild(d);
  });
  const pop = $("stackPop");
  pop.hidden = false;
  const r = card.getBoundingClientRect();
  const w = pop.offsetWidth;
  pop.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)) + "px";
  refreshModal();
}
function closeStack() { stackItem = null; stackGroupKey = null; $("spSplit").hidden = false; $("stackPop").hidden = true; refreshModal(); }
function splitStack() {
  const it = stackItem; if (!it) return;
  const idx = state.clips.indexOf(it); if (idx < 0) { closeStack(); return; }
  const now = Date.now();
  const singles = (it.files || []).map((p, i) => ({ id: "f" + now + "-" + i + "-" + Math.floor(Math.random() * 1e6), kind: "file", vis: "file", files: [p], text: p, pinned: false, ts: now }));
  state.clips.splice(idx, 1, ...singles.filter((x) => !state.clips.some((c) => c !== it && clipSig(c) === clipSig(x))));
  save(); closeStack(); render();
}

/* ---------- drag out (card -> other apps / folders) ---------- */
let suppressClickUntil = 0;
/* While one of our own cards is being dragged out, a drop that lands back on
   the line is our own drag — never hang it again. */
let selfDragUntil = 0;
function selfDragging() { return Date.now() < selfDragUntil; }
function dragSuppressed() { return Date.now() < suppressClickUntil; }
function attachDragOut(card, item) {
  let sx = 0, sy = 0, armed = false, started = false;
  card.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; if (e.target.closest(".corner") || e.target.closest(".peg")) return; armed = true; started = false; sx = e.clientX; sy = e.clientY; });
  card.addEventListener("pointermove", (e) => {
    if (!armed || started) return;
    if (Math.abs(e.clientX - sx) < 6 && Math.abs(e.clientY - sy) < 6) return;
    started = true; armed = false;
    if (item.vis !== "image" && item.vis !== "file") {
      // Text: Explorer gets a .txt/.md file, any other app gets the text.
      if (!(item.text || "").length) return;
      suppressClickUntil = Date.now() + 500;
      selfDragUntil = Date.now() + 60000;
      invoke("drag_text", { text: item.text }).catch((err) => toast(t("dragFail") + err))
        .finally(() => { selfDragUntil = Date.now() + 400; });
      return;
    }
    const paths = item.vis === "image" ? (item.path ? [item.path] : []) : (item.files || []);
    if (!paths.length) return;
    const mov = moveHeld(e); // default Shift = move (Windows habit); configurable
    suppressClickUntil = Date.now() + 500;
    selfDragUntil = Date.now() + 60000;
    invoke("drag_files", { paths, mov }).catch((err) => toast(String(err).includes("不存在") ? t("missing") : t("dragFail") + err))
      .then(() => { if (mov) afterMove(item, paths); })
      .finally(() => { selfDragUntil = Date.now() + 400; });
  });
  card.addEventListener("pointerup", () => { armed = false; });
  card.addEventListener("pointercancel", () => { armed = false; });
}

/* A note dragged by its body (the clip still reorders) leaves as a file in
 * Explorer / on the desktop, named after its title, .txt or .md as set for
 * text cards; other apps get the Markdown text. The note stays on the line. */
function attachNoteDragOut(body, note) {
  let sx = 0, sy = 0, armed = false;
  body.addEventListener("pointerdown", (e) => {
    armed = false;
    if (e.button !== 0 || e.target.closest(".corner, .box, a.md-a, .note-foot, .note-more")) return;
    const lines = e.target.closest(".note-lines");
    if (lines && e.offsetX >= lines.clientWidth) return; // on the scrollbar
    armed = true; sx = e.clientX; sy = e.clientY;
  });
  body.addEventListener("pointermove", (e) => {
    if (!armed || (Math.abs(e.clientX - sx) < 6 && Math.abs(e.clientY - sy) < 6)) return;
    armed = false;
    if (!(note.body || "").trim()) return;
    clearTimeout(noteClickTimer);
    suppressClickUntil = Date.now() + 500;
    selfDragUntil = Date.now() + 60000;
    const name = MD.plain(MD.titleOf(note.body).text);
    invoke("drag_text", { text: note.body, name }).catch((err) => toast(t("dragFail") + err))
      .finally(() => { selfDragUntil = Date.now() + 400; });
  });
  body.addEventListener("pointerup", () => { armed = false; });
  body.addEventListener("pointercancel", () => { armed = false; });
}

/* ---------- reorder: hold an unpinned card's clip and slide it ---------- */
function attachReorder(card, item, isNote) {
  const peg = card.querySelector(".peg");
  if (!peg || item.pinned) return;
  peg.classList.add("grab");
  peg.title = t("dragSort");
  peg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const L = ui.layout; if (!L) return;
    const cards = Array.from($("cards").querySelectorAll(".card"));
    const fromIdx = cards.indexOf(card);
    if (fromIdx < 0) return;
    const pinnedCount = L.slice.filter((x) => x.pinned).length;
    const startLeft = parseFloat(card.style.left) || 0;
    const sx = e.clientX;
    let target = fromIdx;
    const slotLeft = (i) => L.marginX + (i + 0.5) * L.pitch - L.cardW / 2;
    const slotTop = (i) => ropeY(L.marginX + (i + 0.5) * L.pitch);
    try { peg.setPointerCapture(e.pointerId); } catch (x) {}
    card.classList.add("dragging");
    cards.forEach((c) => { if (c !== card) c.classList.add("reflow"); });
    invoke("set_modal", { on: true }).catch(() => {});

    const move = (ev) => {
      const left = startLeft + (ev.clientX - sx);
      const cx = left + L.cardW / 2;
      card.style.left = left + "px";
      card.style.top = ropeY(Math.max(0, Math.min(window.innerWidth, cx))) + "px";
      let tIdx = Math.round((cx - L.marginX) / L.pitch - 0.5);
      tIdx = Math.max(pinnedCount, Math.min(cards.length - 1, tIdx));
      if (tIdx === target) return;
      target = tIdx;
      let slot = 0;
      cards.forEach((c) => {
        if (c === card) return;
        if (slot === target) slot++;
        c.style.left = slotLeft(slot) + "px";
        c.style.top = slotTop(slot) + "px";
        slot++;
      });
    };
    const up = () => {
      peg.removeEventListener("pointermove", move);
      peg.removeEventListener("pointerup", up);
      peg.removeEventListener("pointercancel", up);
      card.classList.remove("dragging");
      refreshModal();
      if (target !== fromIdx) applyReorder(L.start + fromIdx, L.start + target);
      ui.noAnim = true;
      render();
    };
    peg.addEventListener("pointermove", move);
    peg.addEventListener("pointerup", up);
    peg.addEventListener("pointercancel", up);
  });
}

// Move one visible card from position `from` to `to` (indices into
// visibleList()). Only the visible, unpinned cards change places; hidden
// (filtered-out) cards keep their slots in the underlying array.
function applyReorder(from, to) {
  const arr = ui.deck === "notes" ? state.notes : state.clips;
  const vis = visibleList();
  const moved = vis[from];
  if (!moved || moved.pinned) return;
  const next = vis.slice();
  next.splice(from, 1);
  next.splice(to, 0, moved);
  const visU = vis.filter((x) => !x.pinned);
  const newU = next.filter((x) => !x.pinned);
  const ids = new Set(visU.map((x) => x.id));
  const slots = [];
  arr.forEach((x, i) => { if (ids.has(x.id)) slots.push(i); });
  slots.forEach((pos, k) => { arr[pos] = newU[k]; });
  save();
}

/* ---------- drag in (files dropped onto the line) ---------- */
function addDroppedFiles(paths) {
  if (!paths || !paths.length) return;
  // Already on the line (same files) → don't hang a second copy; bring the
  // existing card to the front instead.
  const sig = "file:" + normPaths(paths);
  const idx = state.clips.findIndex((c) => clipSig(c) === sig);
  if (idx >= 0) {
    const old = state.clips.splice(idx, 1)[0];
    old.ts = Date.now();
    state.clips.unshift(old); save();
    if (ui.deck !== "clipboard") setDeck("clipboard");
    if (!stage.classList.contains("up")) render();
    toast(t("already"));
    return;
  }
  const item = { id: "f" + Date.now() + "-" + Math.floor(Math.random() * 1e6), kind: "file", vis: "file", files: paths.slice(), text: paths.join("\n"), pinned: false, ts: Date.now() };
  state.clips.unshift(item); cleanup(); save();
  if (ui.deck !== "clipboard") setDeck("clipboard");
  if (!stage.classList.contains("up")) render();
  toast(t("hung"));
}
function flash(card) {
  const f = document.createElement("div"); f.className = "copied-flash"; f.textContent = t("copied");
  card.querySelectorAll(".copied-flash").forEach((x) => x.remove());
  card.appendChild(f); setTimeout(() => f.remove(), 1100);
}
function confirmRemove(e, item, isNote) {
  const ctx = $("ctx"); ctx.innerHTML = ""; ctx.classList.remove("remind", "tp"); ctx.onkeydown = null;
  const b = document.createElement("button");
  b.textContent = t("confirmTake"); b.style.color = "#c0392b";
  b.onclick = () => { hideCtx(); removeItem(item, isNote); };
  ctx.appendChild(b);
  ctx.hidden = false; refreshModal();
  ctx.style.left = Math.min(e.clientX, window.innerWidth - 150) + "px";
  ctx.style.top = Math.min(e.clientY, window.innerHeight - 60) + "px";
}
// "取下（删除原文件）": confirm, move the original files to the Recycle Bin,
// then take the card down.
function confirmTrash(e, item) {
  const ctx = $("ctx"); ctx.innerHTML = ""; ctx.classList.remove("remind", "tp"); ctx.onkeydown = null;
  const n = (item.files || []).length;
  const tip = document.createElement("div");
  tip.textContent = t("confirmTrash").replace("{n}", n);
  tip.style.cssText = "padding:8px 12px 4px;font-size:12px;color:#6b6862;max-width:240px;";
  ctx.appendChild(tip);
  const b = document.createElement("button");
  b.textContent = t("toTrash"); b.style.color = "#c0392b";
  b.onclick = () => {
    hideCtx();
    invoke("trash_files", { paths: item.files || [] })
      .then(() => { state.clips = state.clips.filter((c) => c.id !== item.id); save(); render(); toast(t("trashed")); })
      .catch((err) => toast(t("trashFail") + err));
  };
  ctx.appendChild(b);
  ctx.hidden = false; refreshModal();
  const h = ctx.offsetHeight || 80;
  ctx.style.left = Math.min(e.clientX, window.innerWidth - 250) + "px";
  ctx.style.top = Math.max(8, Math.min(e.clientY, window.innerHeight - h - 8)) + "px";
}
function removeItem(item, isNote) {
  if (isNote) { toBasket([item]); return; }
  else { state.clips = state.clips.filter((c) => c.id !== item.id); if (item.path) invoke("delete_file", { path: item.path }).catch(()=>{}); }
  save(); render();
}

/* ---------- context menu ---------- */
function showCtx(e, item, isNote) {
  e.preventDefault();
  const ctx = $("ctx"); ctx.innerHTML = ""; ctx.classList.remove("remind", "tp"); ctx.onkeydown = null;
  const add = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.onclick = () => { hideCtx(); fn(); }; ctx.appendChild(b); };
  const sep = () => { const s = document.createElement("div"); s.className = "sep"; ctx.appendChild(s); };

  if (!isNote) {
    const imgP = imagePathOf(item);
    if (imgP) {
      add(t("annotate"), () => invoke("annotate_image", { path: imgP, w: item.w || null, h: item.h || null }).catch((e) => toast(String(e))));
      add(t("ocr"), () => runOcr(imgP));
      sep();
    }
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
      add(t("pasteBack"), () => invoke("paste_text", { text: item.text || "" }).catch(()=>{}));
      add(t("editText"), () => openClipEditor(item));
      if (item.vis === "link") {
        add(t("openLink"), () => invoke("open_url", { url: normUrl(item.text) }).catch(()=>{}));
        add(item.note ? t("editNote") : t("addNote"), () => openClipEditor(item, true));
      }
      add(t("toNote"), () => convertToNote(item));
      add(t("saveDesktop"), () => saveDesktop(item));
    }
  }
  if (isNote) {
    add(t("copyNote"), () => { invoke("copy_text", { text: item.body || "" }).then(() => toast(t("copied"))).catch((err) => toast(String(err))); });
    add(t("pasteBack"), () => invoke("paste_text", { text: item.body || "" }).catch(()=>{}));
  }
  add(item.pinned ? t("unpin") : t("pin"), () => { item.pinned = !item.pinned; save(); render(); });
  sep();
  add(isNote ? t("takeNote") : t("take"), () => removeItem(item, isNote));
  if (isNote) { add(t("deleteNote"), () => deleteNotes([item])); ctx.lastChild.style.color = "#c0392b"; }
  if (!isNote && item.vis === "file" && (item.files || []).length) {
    add(t("takeDelete"), () => confirmTrash(e, item));
    ctx.lastChild.style.color = "#c0392b";
  }

  ctx.hidden = false; refreshModal();
  const w = 170, h = ctx.offsetHeight || 160;
  ctx.style.left = Math.min(e.clientX, window.innerWidth - w) + "px";
  ctx.style.top = Math.min(e.clientY, window.innerHeight - h) + "px";
}
function hideCtx() { const c = $("ctx"); c.hidden = true; c.classList.remove("remind", "tp"); c.onkeydown = null; refreshModal(); }
function normUrl(u) { u = (u || "").trim(); return /^https?:\/\//i.test(u) ? u : "http://" + u; }

function saveDesktop(item) {
  const kind = item.vis === "image" ? "image" : "text";
  invoke("save_to_desktop", { kind, text: item.text || "", path: item.path || "" })
    .then(() => toast(t("savedTo"))).catch(() => {});
}
function convertToNote(item) {
  const note = { id: "n" + Date.now() + "-" + Math.floor(Math.random() * 1e6), tint: null, body: item.text || "", pinned: false, ts: Date.now(), remindAt: null, reminded: false };
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
  inner.textContent = (item.vis === "link" && item.note ? item.note.trim() + "\n\n" : "") + (txt || "（空）");
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
/* Text clip cards open the same sheet in a larger, plain "clip" mode. */
function openClipEditor(item, focusNote) { editing = { _clip: item, body: item.text || "", tint: null, _focusNote: !!focusNote }; openEditorFor(editing); }
function openEditorFor(note) {
  const tt = tintOf(note.tint);
  const sheet = document.querySelector(".editor-sheet");
  sheet.classList.toggle("clip-mode", !!note._clip);
  const isLink = !!(note._clip && note._clip.vis === "link");
  sheet.classList.toggle("link-mode", isLink);
  $("linkNoteRow").hidden = !isLink;
  if (isLink) { $("linkNoteLab").textContent = t("linkNote"); $("linkNote").placeholder = t("linkNotePh"); $("linkNote").value = note._clip.note || ""; linkNoteCount(); }
  buildTools(); setPreview(false);
  sheet.style.setProperty("--editor-bg", tt.bg); sheet.style.setProperty("--editor-ink", tt.ink);
  const ta = $("editorBody"); ta.value = note.body || ""; ta.placeholder = note._clip ? t("editorPhClip") : t("editorPh");
  $("bellText").textContent = note.remindAt ? fmtWhen(note.remindAt) : t("remind");
  renderCatChip(note);
  const hint = document.querySelector(".editor-foot .hint"); if (hint) hint.textContent = t(note._clip ? "editorHint" : "editorHintNote");
  $("editor").hidden = false; refreshModal();
  setTimeout(() => (note._focusNote ? $("linkNote") : $("editorBody")).focus(), 30);
}
function closeEditor() {
  // A line dropped "sticky" for editing (reminder → open, OCR result, new note
  // from the tray) returns to normal auto-retract once editing is done.
  invoke("set_sticky", { on: false }).catch(() => {});
  if (!editing) { $("editor").hidden = true; return; }
  setPreview(false);
  if (editing._clip) {
    const it = editing._clip, v = $("editorBody").value;
    let changed = false;
    if (it.vis === "link") {
      const nv = $("linkNote").value.trim().slice(0, 100);
      if (nv !== (it.note || "")) { if (nv) it.note = nv; else delete it.note; changed = true; }
    }
    if (v.trim() && v !== it.text) { it.text = v; it.vis = classify(v); changed = true; }
    if (changed) toast(t("savedEdit"));
    editing = null; $("editor").hidden = true; refreshModal(); save(); render();
    return;
  }
  editing.body = $("editorBody").value; editing.ts = Date.now();
  const has = editing.body.trim().length > 0;
  if (editing._new) { delete editing._new; if (has) state.notes.unshift(editing); }
  else if (!has) { state.notes = state.notes.filter((n) => n.id !== editing.id); }
  editing = null; $("editor").hidden = true; refreshModal(); save(); render();
}

/* ---------- editor toolbar: Markdown helpers ---------- */
const TOOLS = [["todo", "☑"], ["|"], ["bold", "B"], ["italic", "I"], ["strike", "S"], ["|"], ["head", "H"], ["list", "•"], ["num", "1."], ["quote", "❝"], ["code", "</>"], ["link", "🔗"], ["~"], ["preview", ""]];
const TOOL_TIP = { todo: "tbTodo", bold: "tbBold", italic: "tbItalic", strike: "tbStrike", head: "tbHead", list: "tbList", num: "tbNum", quote: "tbQuote", code: "tbCode", link: "tbLink", preview: "tbPreview" };
function buildTools() {
  const box = $("edTools"); box.innerHTML = "";
  TOOLS.forEach(([id, label]) => {
    if (id === "|") { const i = document.createElement("i"); i.className = "tsep"; box.appendChild(i); return; }
    if (id === "~") { const i = document.createElement("span"); i.className = "tgrow"; box.appendChild(i); return; }
    const b = document.createElement("button"); b.type = "button"; b.className = "tb tb-" + id; b.dataset.tool = id;
    b.textContent = id === "preview" ? "👁 " + t("tbPreview") : label; b.title = t(TOOL_TIP[id]);
    if (id === "todo") b.innerHTML = `☑ <span>${escapeHtml(t("tbTodoLabel"))}</span>`;
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep the textarea's selection
    b.addEventListener("click", () => runTool(id));
    box.appendChild(b);
  });
}
/* Replace a range through execCommand so Ctrl+Z still works. */
function edReplace(start, end, text, selS, selE) {
  const ta = $("editorBody"); ta.focus(); ta.setSelectionRange(start, end);
  let ok = false;
  try { ok = text ? document.execCommand("insertText", false, text) : document.execCommand("delete"); } catch (e) {}
  if (!ok) ta.setRangeText(text, start, end, "end");
  ta.setSelectionRange(selS, selE);
}
function edWrap(a, b, ph) {
  const ta = $("editorBody"), v = ta.value, s = ta.selectionStart, e = ta.selectionEnd, sel = v.slice(s, e);
  if (sel.length >= a.length + b.length && sel.startsWith(a) && sel.endsWith(b)) { const inn = sel.slice(a.length, sel.length - b.length); edReplace(s, e, inn, s, s + inn.length); return; }
  if (v.slice(s - a.length, s) === a && v.slice(e, e + b.length) === b) { edReplace(s - a.length, e + b.length, sel, s - a.length, s - a.length + sel.length); return; }
  const inn = sel || ph;
  edReplace(s, e, a + inn + b, s + a.length, s + a.length + inn.length);
}
/* Apply fn(lines) to every line touched by the selection. */
function edLines(fn) {
  const ta = $("editorBody"), v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
  const ls = v.lastIndexOf("\n", s - 1) + 1;
  let le = v.indexOf("\n", e > s && v[e - 1] === "\n" ? e - 1 : e); if (le < 0) le = v.length;
  const src = v.slice(ls, le), out = fn(src.split("\n")).join("\n");
  if (out === src) return;
  if (s === e) { const c = Math.max(ls, Math.min(ls + out.length, s + out.length - src.length)); edReplace(ls, le, out, c, c); }
  else edReplace(ls, le, out, ls, ls + out.length);
}
const RE_TASK = /^(\s*)(?:[-*+]\s+)?\[( |x|X)?\]\s?/, RE_UL = /^(\s*)[-*+]\s+(?!\[( |x|X)?\])/, RE_OL = /^(\s*)\d{1,3}[.)]\s+/, RE_Q = /^(\s*)>\s?/, RE_H = /^(\s*)#{1,6}\s+/;
const RE_ANYLIST = /^(\s*)(?:[-*+]\s+\[( |x|X)?\]\s?|\[( |x|X)?\]\s?|[-*+]\s+|\d{1,3}[.)]\s+)/;
function toggleLines(re, make) {
  edLines((lines) => {
    const real = lines.filter((l) => l.trim());
    const all = real.length > 0 && real.every((l) => re.test(l));
    let n = 0;
    return lines.map((l) => {
      if (!l.trim() && lines.length > 1) return l;
      if (all) return l.replace(re, "$1");
      n++; return make(l, n);
    });
  });
}
function runTool(id) {
  if (id === "preview") { setPreview(!edPreview); return; }
  if (edPreview) setPreview(false);
  const ta = $("editorBody");
  switch (id) {
    case "todo": toggleLines(RE_TASK, (l) => (RE_TASK.test(l) ? l : l.replace(RE_ANYLIST, "$1").replace(/^(\s*)/, "$1- [ ] "))); break;
    case "list": toggleLines(RE_UL, (l) => l.replace(RE_ANYLIST, "$1").replace(/^(\s*)/, "$1- ")); break;
    case "num": toggleLines(RE_OL, (l, n) => l.replace(RE_ANYLIST, "$1").replace(/^(\s*)/, `$1${n}. `)); break;
    case "quote": toggleLines(RE_Q, (l) => l.replace(/^(\s*)/, "$1> ")); break;
    case "head": toggleLines(RE_H, (l) => l.replace(/^(\s*)/, "$1## ")); break;
    case "bold": edWrap("**", "**", t("phText")); break;
    case "italic": edWrap("*", "*", t("phText")); break;
    case "strike": edWrap("~~", "~~", t("phText")); break;
    case "code": {
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      if (sel.includes("\n")) edWrap("```\n", "\n```", ""); else edWrap("`", "`", "code");
      break;
    }
    case "link": {
      const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e);
      if (/^(https?:\/\/|www\.)\S+$/i.test(sel.trim())) { const txt = t("phLink"), out = `[${txt}](${sel.trim()})`; edReplace(s, e, out, s + 1, s + 1 + txt.length); }
      else { const txt = sel || t("phLink"), out = `[${txt}](https://)`; edReplace(s, e, out, s + txt.length + 3, s + txt.length + 11); }
      break;
    }
  }
}
let edPreview = false;
function setPreview(on) {
  edPreview = !!on;
  const ta = $("editorBody"), pv = $("editorPreview");
  if (edPreview) {
    const v = ta.value, tl = MD.titleOf(v);
    pv.innerHTML = tl.index < 0 ? `<div class="md-p" style="opacity:.5">${escapeHtml(t("blankNote"))}</div>`
      : `<div class="pv-title">${MD.inline(tl.text)}</div>` + MD.render(v, { from: tl.index + 1 });
    pv.querySelectorAll(".box").forEach((b) => b.addEventListener("click", () => { ta.value = MD.toggle(ta.value, parseInt(b.dataset.idx, 10)); setPreview(true); }));
    wireLinks(pv);
  }
  ta.hidden = edPreview; pv.hidden = !edPreview;
  document.querySelectorAll("#edTools .tb").forEach((b) => { b.disabled = edPreview && b.dataset.tool !== "preview"; });
  const pb = document.querySelector("#edTools .tb-preview");
  if (pb) { pb.classList.toggle("on", edPreview); pb.textContent = edPreview ? "✎ " + t("tbEdit") : "👁 " + t("tbPreview"); }
  if (!edPreview && !$("editor").hidden) ta.focus();
}
/* Lists continue on Enter (an empty item ends the list); Tab / Shift+Tab indent. */
$("editorBody").addEventListener("keydown", (e) => {
  if (!editing || editing._clip || e.isComposing || e.keyCode === 229) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && !e.shiftKey && !e.altKey && (k === "b" || k === "i")) { e.preventDefault(); runTool(k === "b" ? "bold" : "italic"); return; }
  if (mod && !e.shiftKey && !e.altKey && e.key === "Enter") { e.preventDefault(); tickLines(); return; }
  const ta = e.target, v = ta.value, s = ta.selectionStart;
  const ls = v.lastIndexOf("\n", s - 1) + 1;
  if (e.key === "Tab" && !mod && !e.altKey) {
    let le = v.indexOf("\n", s); if (le < 0) le = v.length;
    if (!RE_ANYLIST.test(v.slice(ls, le)) && ta.selectionStart === ta.selectionEnd) return;
    e.preventDefault();
    edLines((lines) => lines.map((l) => (e.shiftKey ? l.replace(/^ {1,2}/, "") : (l.trim() ? "  " + l : l))));
    return;
  }
  if (e.key !== "Enter" || e.shiftKey || mod || e.altKey || s !== ta.selectionEnd) return;
  const line = v.slice(ls, s);
  let m, prefix = null, empty = false;
  if ((m = line.match(/^(\s*)([-*+]\s+)?\[( |x|X)?\]\s?(.*)$/))) { prefix = m[1] + (m[2] || "") + "[ ] "; empty = !m[4].trim(); }
  else if ((m = line.match(/^(\s*)([-*+])\s+(.*)$/))) { prefix = m[1] + m[2] + " "; empty = !m[3].trim(); }
  else if ((m = line.match(/^(\s*)(\d{1,3})([.)])\s+(.*)$/))) { prefix = m[1] + (+m[2] + 1) + m[3] + " "; empty = !m[4].trim(); }
  else if ((m = line.match(/^(\s*>\s?)(.*)$/))) { prefix = m[1]; empty = !m[2].trim(); }
  if (prefix === null) return;
  e.preventDefault();
  if (empty) edReplace(ls, s, "", ls, ls);
  else edReplace(s, s, "\n" + prefix, s + 1 + prefix.length, s + 1 + prefix.length);
});
/* Ticking while typing. Ctrl+Enter flips the to-dos on the caret's line (or
 * every selected line: if any is open they all get ticked, otherwise all are
 * cleared); a plain click inside "[ ]" flips that one. Both go through
 * edReplace, so Ctrl+Z undoes them. */
const RE_BOX = /^(\s*(?:[-*+]\s+)?)\[( |x|X)?\]/;
function tickLines() {
  edLines((lines) => {
    const tasks = lines.filter((l) => RE_BOX.test(l));
    if (!tasks.length) return lines;
    const tick = tasks.some((l) => !/^x$/i.test(l.match(RE_BOX)[2] || ""));
    return lines.map((l) => l.replace(RE_BOX, (_, pre) => pre + (tick ? "[x]" : "[ ]")));
  });
}
$("editorBody").addEventListener("click", (e) => {
  if (!editing || editing._clip || e.detail !== 1 || e.shiftKey || e.ctrlKey || e.altKey) return;
  const ta = $("editorBody"), p = ta.selectionStart;
  if (p !== ta.selectionEnd) return;
  const v = ta.value, ls = v.lastIndexOf("\n", p - 1) + 1;
  const m = v.slice(ls).match(RE_BOX);
  if (!m) return;
  const bs = ls + m[1].length, be = ls + m[0].length;
  if (p <= bs || p >= be) return; // only a click inside the brackets ticks
  const done = /^x$/i.test(m[2] || "");
  edReplace(bs, be, done ? "[ ]" : "[x]", p, p);
});
function linkNoteCount() { $("linkNoteCnt").textContent = `${$("linkNote").value.length}/100`; }
$("linkNote").addEventListener("input", linkNoteCount);
$("linkNote").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); closeEditor(); } });

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
  const ctx = $("ctx"); ctx.innerHTML = ""; ctx.classList.remove("remind", "tp"); ctx.onkeydown = null;
  const commit = () => { save(); if (after) after(); };

  const btn = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.onclick = fn; return b; };
  ctx.classList.add("remind");
  const presets = (cfg.reminder_presets && cfg.reminder_presets.length) ? cfg.reminder_presets : ["m15", "h1", "tomorrow"];
  presets.forEach((id) => {
    const fn = PRESETS[id]; if (!fn) return;
    ctx.appendChild(btn(t("p_" + id), () => { setReminder(note, fn()); hideCtx(); commit(); }));
  });

  // custom date & time: opens our own picker in the same popover
  const cb = btn("📅 " + t("custom") + "…", (ev) => { ev.stopPropagation(); openTimePicker(e, note, commit, () => showReminderPanel(e, note, after)); });
  if (note.remindAt) { const sm = document.createElement("span"); sm.className = "tp-cur"; sm.textContent = fmtWhen(note.remindAt); cb.appendChild(sm); }
  ctx.appendChild(cb);

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

/* Custom reminder time: a small month calendar plus hour : minute fields.
 * Replaces the system datetime-local control, which has no OK button.
 * Wheel / ▲▼ / typing set the time; Enter or 确定 confirms, Esc goes back. */
function openTimePicker(e, note, commit, back) {
  const ctx = $("ctx"); ctx.innerHTML = ""; ctx.classList.remove("remind", "tp"); ctx.classList.add("remind", "tp");
  const now = new Date();
  let base = note.remindAt && note.remindAt > Date.now() ? new Date(note.remindAt) : null;
  if (!base) { base = new Date(Date.now() + 60 * 60000); base.setMinutes(Math.ceil(base.getMinutes() / 15) * 15, 0, 0); }
  let sel = { y: base.getFullYear(), m: base.getMonth(), d: base.getDate() };
  let view = { y: sel.y, m: sel.m };
  let hh = base.getHours(), mm = base.getMinutes();
  const pad = (n) => String(n).padStart(2, "0");
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt !== undefined) x.textContent = txt; return x; };
  const chosen = () => new Date(sel.y, sel.m, sel.d, hh, mm, 0, 0).getTime();

  const wrap = el("div", "tp-wrap");
  // calendar
  const cal = el("div", "tp-cal");
  const head = el("div", "tp-head");
  const prev = el("button", "tp-nav", "‹"), next = el("button", "tp-nav", "›"), title = el("div", "tp-title");
  head.append(prev, title, next);
  const grid = el("div", "tp-grid");
  cal.append(head, grid);
  // time
  const tm = el("div", "tp-time");
  const mkField = (get, set, max, wheelStep) => {
    const box = el("div", "tp-field");
    const up = el("button", "tp-step", "▲"), dn = el("button", "tp-step", "▼");
    up.tabIndex = -1; dn.tabIndex = -1;
    const inp = el("input", "tp-num"); inp.maxLength = 2; inp.inputMode = "numeric";
    const show = () => { inp.value = pad(get()); refresh(); };
    const bump = (d) => { set((get() + d + max + 1) % (max + 1)); show(); };
    up.onclick = (ev) => { ev.stopPropagation(); bump(1); };
    dn.onclick = (ev) => { ev.stopPropagation(); bump(-1); };
    box.addEventListener("wheel", (ev) => { ev.preventDefault(); ev.stopPropagation(); const st = ev.shiftKey ? 1 : wheelStep; const v = get(); const nv = ev.deltaY < 0 ? Math.floor(v / st) * st + st : Math.ceil(v / st) * st - st; set(((nv % (max + 1)) + max + 1) % (max + 1)); show(); }, { passive: false });
    inp.addEventListener("focus", () => inp.select());
    inp.addEventListener("input", () => { const v = parseInt(inp.value.replace(/\D/g, ""), 10); if (!isNaN(v) && v <= max) { set(v); refresh(); } });
    inp.addEventListener("blur", show);
    inp.addEventListener("keydown", (ev) => { if (ev.key === "ArrowUp") { ev.preventDefault(); bump(1); } else if (ev.key === "ArrowDown") { ev.preventDefault(); bump(-1); } });
    box.append(up, inp, dn);
    return { box, show, inp };
  };
  const fh = mkField(() => hh, (v) => hh = v, 23, 1);
  const fm = mkField(() => mm, (v) => mm = v, 59, 5);
  const hm = el("div", "tp-hm"); hm.append(fh.box, el("div", "tp-colon", ":"), fm.box);
  const quick = el("div", "tp-quick");
  [0, 15, 30, 45].forEach((q) => { const b = el("button", "tp-q", pad(q)); b.onclick = (ev) => { ev.stopPropagation(); mm = q; fm.show(); }; quick.appendChild(b); });
  const when = el("div", "tp-when");
  tm.append(hm, quick, when);
  wrap.append(cal, tm);
  // footer
  const foot = el("div", "tp-foot");
  const cancel = el("button", "tp-btn", t("cancel")), ok = el("button", "tp-btn primary", t("ok"));
  foot.append(cancel, ok);
  ctx.append(wrap, foot);

  function drawCal() {
    title.textContent = LANG === "en" ? new Date(view.y, view.m, 1).toLocaleDateString("en", { year: "numeric", month: "short" }) : `${view.y} 年 ${view.m + 1} 月`;
    grid.innerHTML = "";
    (LANG === "en" ? ["M", "T", "W", "T", "F", "S", "S"] : ["一", "二", "三", "四", "五", "六", "日"]).forEach((w) => grid.appendChild(el("div", "tp-wd", w)));
    const first = new Date(view.y, view.m, 1);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    for (let i = 0; i < lead; i++) grid.appendChild(el("div"));
    for (let d = 1; d <= days; d++) {
      const b = el("button", "tp-day", String(d));
      const t0 = new Date(view.y, view.m, d).getTime();
      if (t0 < today0) b.disabled = true;
      if (t0 === today0) b.classList.add("today");
      if (view.y === sel.y && view.m === sel.m && d === sel.d) b.classList.add("on");
      b.onclick = (ev) => { ev.stopPropagation(); sel = { y: view.y, m: view.m, d }; drawCal(); refresh(); };
      grid.appendChild(b);
    }
    prev.disabled = view.y === now.getFullYear() && view.m === now.getMonth();
  }
  function refresh() {
    const ms = chosen(), past = ms <= Date.now();
    when.textContent = past ? t("tpPast") : fmtWhen(ms);
    when.classList.toggle("bad", past);
    ok.disabled = past;
  }
  const confirm = () => { const ms = chosen(); if (ms <= Date.now()) { refresh(); return; } setReminder(note, ms); hideCtx(); commit(); };
  prev.onclick = (ev) => { ev.stopPropagation(); view.m--; if (view.m < 0) { view.m = 11; view.y--; } drawCal(); };
  next.onclick = (ev) => { ev.stopPropagation(); view.m++; if (view.m > 11) { view.m = 0; view.y++; } drawCal(); };
  cancel.onclick = (ev) => { ev.stopPropagation(); back(); };
  ok.onclick = (ev) => { ev.stopPropagation(); confirm(); };
  ctx.onkeydown = (ev) => {
    if (!ctx.classList.contains("tp")) return;
    if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); fh.inp.blur(); fm.inp.blur(); confirm(); }
    else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); back(); }
  };
  drawCal(); fh.show(); fm.show();
  ctx.hidden = false; refreshModal();
  const w = ctx.offsetWidth || 320, h = ctx.offsetHeight || 260;
  const r = ctx.getBoundingClientRect();
  ctx.style.left = Math.max(8, Math.min(r.left || e.clientX, window.innerWidth - w - 8)) + "px";
  ctx.style.top = Math.max(8, Math.min(r.top || e.clientY, window.innerHeight - h - 8)) + "px";
  setTimeout(() => fh.inp.focus(), 0);
}

/* A due reminder pops up as its own card window (bottom-right, with a chime). */
function popReminder(n) {
  // The card renders Markdown itself (md.js): it gets the whole note and the
  // line the body starts at, so its to-do boxes carry the note's own line
  // numbers and can be ticked from the card (remind:toggle).
  const tl = MD.titleOf(n.body);
  const title = tl.index < 0 ? t("remind") : tl.text;
  const body = tl.index < 0 ? "" : (n.body || "");
  const from = tl.index < 0 ? 0 : tl.index + 1;
  const tt = tintOf(n.tint);
  const rep = { daily: t("rDaily"), weekly: t("rWeekly"), monthly: t("rMonthly") }[n.repeat] || "";
  const when = fmtWhen(n.remindAt) + (rep ? " · " + rep : "");
  invoke("show_reminder", { data: { id: n.id, title, body, from, when, bg: tt.bg, ink: tt.ink, repeat: !!rep, lang: LANG } })
    .catch(() => { toast("🔔 " + MD.plainLine(title)); });
}
/* A to-do ticked on a reminder card. `line` is the line as the card saw it;
 * if the note was edited meanwhile and that line moved, nothing is changed. */
function onRemindToggle(p) {
  const n = state.notes.find((x) => x.id === (p && p.id));
  if (!n) return;
  const idx = +p.idx, lines = (n.body || "").split("\n");
  if (lines[idx] !== p.line) return;
  toggleCheck(n, idx);
}
function onRemindAction(p) {
  const n = state.notes.find((x) => x.id === (p && p.id));
  if (!n) return;
  if (p.action === "snooze") { n.remindAt = Date.now() + 10 * 60000; n.fired = false; n.acked = false; }
  else if (p.action === "ack") { if (!n.repeat || n.repeat === "none") { n.acked = true; n.fired = false; n.remindAt = null; } }
  else if (p.action === "open") { if (!n.repeat || n.repeat === "none") { n.acked = true; n.fired = false; n.remindAt = null; } save(); setTimeout(() => { setDeck("notes"); render(); openEditor(n); }, 150); return; }
  save(); if (!stage.classList.contains("up") && ui.deck === "notes") render();
}

setInterval(() => {
  const now = Date.now(); let changed = false;
  state.notes.forEach((n) => {
    if (n.remindAt && !n.fired && now >= n.remindAt) {
      popReminder(n);
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
}, 10000);

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg) { const el = $("toast"); clearTimeout(toastActTimer); el.classList.remove("act"); el.textContent = msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 1800); }

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
  [["auto", LANG === "en" ? "Follow system" : "跟随系统"], ["zh", "中文"], ["en", "English"]].forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; if (draft.lang === v) o.selected = true; langSel.appendChild(o); });
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
      LANG = pickLang(cfg);
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
  $("next").title = t("nextPage");
  $("pinOnly").title = t("pinOnly");
  $("shotBtn").title = t("shotTip"); $("shotBtn").textContent = "✂ " + t("shotLabel"); $("tidy").textContent = t("tidy"); $("tidy").title = t("tidyTip"); $("foldBtn").title = t("foldTip"); $("foldBtn").textContent = t("foldLabel");
  $("basket").title = t("basketTip");
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
function onDrop(deck) { pathInfoCache.clear(); noteScroll.clear(); cleanup(); setDeck(deck); stage.classList.remove("up"); render(); }
function onRollup() {
  closeStack();
  stopCatch();
  hideCtx(); closePreview(); clearTimeout(noteClickTimer);
  if (!$("reader").hidden) closeReader();
  if (!$("basketView").hidden) closeBasket();
  if (!$("catPop").hidden) closeCatPop();
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
    if (!$("ctx").hidden) { hideCtx(); return; }
    if (!$("catPop").hidden) { closeCatPop(); return; }
    if (!$("settings").hidden) { closeSettings(); return; }
    if (!$("editor").hidden) { closeEditor(); return; }
    if (!$("basketView").hidden) { closeBasket(); return; }
    if (!$("reader").hidden) { closeReader(); return; }
    if (!$("preview").hidden) { closePreview(); return; }
    if (!$("stackPop").hidden) { closeStack(); return; }
    invoke("rollup_now").catch(() => {});
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !$("editor").hidden) { e.preventDefault(); closeEditor(); }
});
document.addEventListener("click", (e) => {
  if (!$("ctx").hidden && !pointerInCtx && !e.target.closest("#ctx")) hideCtx();
  if (pointerInsideLine) return;
  if (e.target.closest(".card") || e.target.closest("#pill") || e.target.closest("#plus") ||
      e.target.closest("#editor") || e.target.closest("#preview") || e.target.closest("#reader") || e.target.closest("#ctx") || e.target.closest("#settings") || e.target.closest("#basket") || e.target.closest("#basketView") || e.target.closest("#catPop")) return;
  if (!stage.classList.contains("up")) invoke("rollup_now").catch(() => {});
});
// Track (at pointerdown, before any re-render detaches the target) whether the
// interaction began inside the line/overlays. The click handler uses this
// instead of inspecting the click target, which may already be detached.
let pointerInsideLine = false;
let pointerInCtx = false;
document.addEventListener("pointerdown", (e) => {
  pointerInCtx = !!e.target.closest("#ctx");
  if (stage.classList.contains("up")) { pointerInsideLine = false; return; }
  // Only real UI counts as "inside": a click on empty rope / panel space closes the line.
  pointerInsideLine = !!(e.target.closest(".card") || e.target.closest("#pill") || e.target.closest("#plus") || e.target.closest(".knot") ||
    e.target.closest("#editor") || e.target.closest("#preview") || e.target.closest("#reader") || e.target.closest("#ctx") || e.target.closest("#stackPop") ||
    e.target.closest("#basket") || e.target.closest("#basketView") || e.target.closest("#catPop"));
}, true);
$("preview").addEventListener("click", (e) => { if (e.target.id === "preview") closePreview(); });
$("reader").addEventListener("click", (e) => { if (e.target.id === "reader") closeReader(); });
$("readerClose").addEventListener("click", closeReader);
$("readerEdit").addEventListener("click", () => { const n = reading; closeReader(); if (n) openEditor(n); });
$("spClose").addEventListener("click", closeStack);
$("spSplit").addEventListener("click", () => {
  if (stackItem) { splitStack(); return; }
  if (!stackGroupKey) return;
  const Z = clipZones(visibleList());
  const g = Z.stacks.find((x) => x.key === stackGroupKey);
  if (g) { closeStack(); removeItems(g.items.slice(), t("tookN")); }
});
$("tidy").addEventListener("click", () => (ui.deck === "notes" ? runNoteTidy() : runTidy()));
$("shotBtn").addEventListener("click", () => invoke("start_shot").catch((e) => toast(String(e))));
$("foldBtn").addEventListener("click", async () => {
  cfg.fold_by_date = !foldOn(); ui.page = 0; render();
  toast(foldOn() ? t("foldOnT") : t("foldOffT"));
  try {
    const cur = JSON.parse((await invoke("get_settings")) || "{}");
    cur.fold_by_date = cfg.fold_by_date;
    await invoke("update_settings", { data: JSON.stringify(cur) });
  } catch (e) {}
});
document.addEventListener("pointerdown", (e) => {
  if (!$("stackPop").hidden && !e.target.closest("#stackPop") && !e.target.closest(".card.stack") && !e.target.closest("#ctx")) closeStack();
});
$("settings").addEventListener("click", (e) => { if (e.target.id === "settings") closeSettings(); });
$("setClose").addEventListener("click", closeSettings);
$("editorClose").addEventListener("click", closeEditor);
$("editorSave").addEventListener("click", closeEditor);
$("plus").addEventListener("click", newNote);
$("gear").addEventListener("click", () => { invoke("rollup_now").catch(() => {}); invoke("open_settings").catch(() => {}); });
$("bell").addEventListener("click", (e) => { e.stopPropagation(); if (editing) showReminderPanel(e, editing, () => { $("bellText").textContent = editing.remindAt ? fmtWhen(editing.remindAt) : t("remind"); }); });
$("prev").addEventListener("click", () => { ui.page--; render(); });
$("next").addEventListener("click", () => { ui.page++; render(); });
$("pinOnly").addEventListener("click", () => {
  ui.pinnedOnly = !ui.pinnedOnly; $("pinOnly").classList.toggle("on", ui.pinnedOnly); ui.page = 0; render();
  const list = ui.deck === "notes" ? state.notes : state.clips;
  if (ui.pinnedOnly && !list.some((x) => x.pinned)) toast(t("noFav"));
});
$("searchInput").addEventListener("input", (e) => { ui.search = e.target.value; ui.page = 0; render(); });
window.addEventListener("wheel", (e) => {
  if (stage.classList.contains("up")) return;
  if (!$("settings").hidden || !$("preview").hidden || !$("reader").hidden || !$("editor").hidden || !$("ctx").hidden) return;
  // Over a note whose content doesn't fit, the wheel scrolls that note (never
  // flips the page, even at the end); everywhere else it flips as before.
  const nc = e.target.closest && e.target.closest(".card.note");
  const nl = nc && nc.querySelector(".note-lines.over");
  if (nl) { if (!e.target.closest(".note-lines")) nl.scrollTop += e.deltaY; return; }
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX > 0 : e.deltaY > 0) ui.page++; else ui.page--;
  render();
}, { passive: true });
window.addEventListener("resize", () => { if (!stage.classList.contains("up")) render(); });

/* ---------- OCR: recognise text in an image, hang it as an editable text card ---------- */
function runOcr(path) {
  toast(t("ocrRunning"));
  invoke("ocr_to_line", { path }).catch((e) => toast(t("ocrFail") + e));
}
function onOcrDone(p) {
  if (!p || p.error) { toast(t("ocrFail") + (p && p.error ? p.error : "")); return; }
  const text = (p.text || "").trim();
  if (!text) { toast(t("ocrNone")); return; }
  const item = { id: "o" + Date.now() + "-" + Math.floor(Math.random() * 1e6), kind: "text", text, ts: Date.now() };
  addClip(item);
  invoke("copy_text", { text }).catch(() => {});
  setDeck("clipboard"); stage.classList.remove("up"); render();
  // let the user check / correct what was recognised
  setTimeout(() => { openClipEditor(item); toast(t("ocrDone").replace("{n}", countText(text))); }, 120);
}
/* Count the way each script is read: CJK by character (字), everything else by word (词). */
function countText(text) {
  const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
  const zi = (text.match(CJK) || []).length;
  const words = (text.replace(CJK, " ").match(/[\p{L}\p{N}]+(?:['’.\-][\p{L}\p{N}]+)*/gu) || []).length;
  const parts = [];
  if (zi) parts.push(t("cntZi").replace("{n}", zi));
  if (words || !zi) parts.push(t("cntWord").replace("{n}", words));
  return parts.join(" · ");
}

/* ---------- drag files to the top edge: the line comes down to catch them ----------
   Rust decides when to go back up (button released without a drop). */
let catching = false;
function startCatch() {
  catching = true;
  $("catchZone").textContent = t("catchHint");
  stage.classList.add("catching");
}
function stopCatch() {
  catching = false;
  stage.classList.remove("catching", "catch-over");
}

/* ---------- events from Rust ---------- */
async function wire() {
  await listen("clip:add", (ev) => addClip(ev.payload));
  await listen("line:drop", (ev) => onDrop(ev.payload.deck));
  // The line can move to another monitor (different width / scale) right
  // before it drops: lay the rope out again once the new size lands.
  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => { if (!stage.classList.contains("up")) render(); });
  });
  await listen("line:rollup", () => onRollup());
  await listen("ui:newnote", () => { setDeck("notes"); stage.classList.remove("up"); render(); newNote(); });
  await listen("theme:preview", (ev) => applyTheme(ev.payload || "soft"));
  await listen("accent:preview", (ev) => applyAccent(ev.payload || "terra"));
  await listen("settings:changed", async () => {
    try { const s = await invoke("get_settings"); if (s) cfg = Object.assign(cfg, JSON.parse(s)); } catch (e) {}
    LANG = pickLang(cfg);
    applyLang(); applyTheme(cfg.theme); applyAccent(cfg.accent); applyFont(cfg); cleanup(); render();
  });
  await listen("line:catch", () => startCatch());
  await listen("ocr:done", (ev) => onOcrDone(ev.payload));
  await listen("remind:action", (ev) => onRemindAction(ev.payload));
  await listen("remind:toggle", (ev) => onRemindToggle(ev.payload));
  await listen("files:enter", () => stage.classList.add("catch-over"));
  await listen("files:over", () => stage.classList.add("catch-over"));
  await listen("files:leave", () => stage.classList.remove("catch-over"));
  await listen("files:drop", (ev) => {
    stopCatch();
    if (selfDragging()) return; // our own card dropped back on the line
    const paths = Array.isArray(ev.payload) ? ev.payload : [];
    if (paths.length) addDroppedFiles(paths);
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
  applyAccent(cfg.accent);
  applyFont(cfg);
  await wire();
  render();
})();
