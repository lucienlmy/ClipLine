# ClipLine 开发交接说明

给接手开发的人（或新开的 AI 会话）快速上手用。用户可见的说明在 `使用说明.md`，更新历史在 `CHANGELOG.md`（中文）/ `CHANGELOG.en.md`（英文），GitHub 发布页的说明在 `RELEASE_NOTES.md`。

## 结构
- `src-tauri/`：Rust（Tauri v2）。
  - `main.rs`：命令、窗口、托盘、设置（`Settings` 带 `#[serde(default)]`，新字段必须给默认值）、光标线程（顶边悬停、拖文件到顶部接住、自动收起）、文件夹监听。
  - `native.rs`：剪贴板（arboard / clipboard-win）、光标、粘贴回原应用、图片卡保存 `save_rgba_card`。
  - `winx.rs`：低级鼠标钩子、自研 OLE 拖出（文字卡：资源管理器得到文件 / 其它应用得到文字；文件卡：shell 数据对象）、自研拖入目标（替代 wry 失效的那个）、资源管理器选中项兜底、诊断日志 `dlog`。
  - `shot.rs`：GDI 截全虚拟屏、Windows 自带 OCR（Windows.Media.Ocr）。截屏前先用 `window_rects` 记下可见顶层窗口（`EnumWindows` 的 z 序，前面的在前；跳过最小化、cloaked、点击穿透的窗口和桌面 Progman/WorkerW；矩形取 DWM 的 `EXTENDED_FRAME_BOUNDS`，不含阴影），存进 `Capture.wins`。截图界面**每块显示器一个窗口**（标签 `shot-0`、`shot-1`…，`SHOT_MONS` 记着每个窗口在整张截图里的区域 `[x,y,w,h]`；`close_shot` 一次关掉全部，任何一个被关掉也会连带全关）。`get_shot_region` / `get_shot_image` / `get_shot_windows` 都按调用窗口的标签取自己那一块；`get_shot_windows` 把窗口矩形换成这块屏的坐标、末尾补上这块屏本身，供选区吸附；页面调 `shot_patch` / `finish_shot` 时加上区域偏移换回整张截图的坐标。各屏之间用 `shot:sync` 事件同步：开始框选时通知别的屏取消选区，取色模式也一起开关；鼠标移进哪块屏就 `shot_focus` 把键盘焦点给它。`shot_patch` 给取色放大镜返回原始像素（背景图是 JPEG，颜色不准，取色一律问 Rust）；`finish_color` 复制 `#RRGGBB` 并发一张文字卡（前端 `classify` 认成颜色卡）。
  - `display.rs`：显示器列表（Win32 `EnumDisplayMonitors` + `GetDpiForMonitor`，缓存 1 秒，插拔后自动更新）、系统界面语言。`main.rs` 里 `target_monitor` 按设置 `line_display`（`cursor` / `primary` / 设备名如 `\\.\DISPLAY2`）选屏，`fit_line_to` 按那块屏的缩放重算绳子尺寸，`place_window` 先移位再改尺寸再移位（跨缩放比例移动时 Windows 会先自动缩放一次）。提醒 / 更新卡片用 `place_corner_card` 放在同一块屏右下角。
  - 更新历史：`get_changelog(lang)` 用 `include_str!` 把仓库根目录的 `CHANGELOG.md` / `CHANGELOG.en.md` 编进 exe（离线可看，改了要重新编译）。启动时 `note_version_seen` 比较设置里的 `seen_version` 和当前版本：新装（没有 settings.json 也没有 data.json）不弹，降级不弹，`seen_version` 为空（v1.7.0 之前存的设置）算升级；需要弹时约 2.5 秒后开 `news.html`（标签 `news`，右下角）。「全部更新历史」走 `open_changelog`：设置窗口已开就发 `settings:goto`，没开就先记在 `SETTINGS_GOTO`，`settings.js` 启动时用 `settings_goto` 取走。
  - `update.rs`：检查更新。用系统的 `URLDownloadToFileW` 访问 GitHub API（`releases/latest`）和下载安装文件，不引入 TLS 库，走系统代理；状态集中在 `STATUS`，每次变化由 `main.rs` 广播 `update:status`，`update.html` 负责显示。
- `src/md.js`：小型 Markdown 渲染器（先整体转义再生成标记，链接只给 `data-href`，由页面自己 `invoke("open_url")`）。便签卡片、阅读视图、编辑器预览、提醒卡片、更新历史共用；`MD.releases` 把 CHANGELOG 按 `## v1.2.3 · 日期` 切成各个版本；按行渲染，待办方框带 `data-idx`（源文本行号），打勾用 `MD.toggle`。待办写法兼容 `- [ ]` / `[ ]` / `[]`。提醒卡片收到整篇便签和正文起始行号 `from`（`MD.render(body, {from})`），方框的 `data-idx` 就是便签里的行号；打勾时卡片自己 `emit("remind:toggle", {id, idx, line})`，主窗口核对该行原文没变再 `toggleCheck`。提醒卡片和「已更新」卡片里各有一份同样的 Markdown 样式（`remind.html`、`news.html` 不加载 `styles.css`），改样式时几处一起改。
- 设置窗口（`settings.html` / `settings.js`）：左侧分类栏 + 右侧单页，`PAGES` 列出七页（general / invoke / clip / notes / look / about / donate；打赏页的收款码在 `src/img/donate-*.png`，是 `assets/` 里同名文件的副本），每页一个 `pageXxx(body)` 函数，`goPage` 切页后整页重绘。所有页共用一份 `draft`，「保存」一次提交；错误提示统一写在底部的 `#setErr`（`setErr()`）。打开「更新历史」时会先切到「关于」页。新增设置项时放进对应的页函数，别再加新的长区块。窗口尺寸在 `create_settings_window`（720×540，最小 600×420）。
- `src/`：前端静态页。`app.js` 主界面（绳子布局：收藏区 / 今天 / 日期叠、卡片、便签、提醒、整理），`settings.*`、`pin.html`、`shot.html`（截图选区：先选后截——拖动框选或单击选窗口，选区可拖柄调整 / 移动 / 方向键微调，回车或双击才执行；浮条是图标 + 快捷键角标，主题为 graphite 时用深色，强调色从设置读，色值表 `ACCENTS` 要和 `styles.css` 的 `data-accent` 同步；`C` 进入取色）、`annotate.html`（标注）、`remind.html`（提醒卡片）、`update.html`（更新卡片）、`news.html`（「已更新到 vX」卡片）。
  - 便签分类：分类就是「有名字的底色」，存在 `data.json` 的 `state.cats`（`[{tint, name}]`，`name` 为空时用默认名 `cat_<tint>` 翻译）；便签仍然只存 `tint`，`catOf(tint)` 查分类，不在 `cats` 里的算未分类。`TINTS` 共 12 色（含无色），所以最多 11 个分类。删除分类时把绳上和收纳袋里对应 `tint` 的便签改成 `null`。底部筛选用 `ui.cat`（`""` 全部 / tint / `"none"`），分类不到两种时不显示。
  - 收纳袋：挂在绳子右端（`updateBasket` 按 `ropeY` 定位），便签布局时右侧留出 `BAG_ROOM`。数据在 `state.done`，便签取下时复制一份加 `doneAt`（去掉提醒字段）。`cleanup` 按设置 `history_days`（默认 30，0 = 永久）清理。`#tidy` 按钮两边共用：剪贴板绳是「失效文件卡」，便签绳是「待办全部打勾的便签」（`updateNoteTidy` / `runNoteTidy`）。统计里的「项」是打勾的待办数（`MD.progress` 的第一个数）。
  - 收纳袋保留天数：收纳袋底部的「保留 N 天 ▾」由 `fillBasketKeep` 生成，点开就地选天数；改短会删掉便签时先显示「清理 N 张？」（`keepArmed`），确认后 `setHistoryDays` 先 `cleanup()`，再按 `get_settings` → 改 `history_days` → `update_settings` 写回（与「按日期」按钮同一做法）。
  - 提醒时间选择器：`showReminderPanel` 里的「自定义时间…」打开 `openTimePicker`，在同一个 `#ctx` 浮层里换成月历 + 时分（`#ctx.tp`，样式在 `styles.css` 的 `.tp-*`），不用系统的 `datetime-local`（WebView2 的弹窗没有确定按钮）。浮层里按钮的点击都要 `stopPropagation`：点击后浮层内容会重建，事件冒泡到 document 时 `closest("#ctx")` 已找不到，会被当成点在外面。Esc 由浮层自己的 `onkeydown` 处理（返回提醒面板）；全局 Esc 也改为先关 `#ctx`，再关编辑器。
  - 托盘菜单：`tray_menu(app, en)` 按 `lang` 生成，`update_settings` 里 `apply_tray_lang` 重建，所以改语言不用重启。
  - 便签卡片（`buildNoteCard`）：内容放在 `.note-clip > .note-lines`，渲染后 `measureNotes` 量高度，放不下就加 `.over`（可滚动、细滚动条）和 `.fade`（底部渐隐），`updateNoteMore` 数没完整露出来的块写进「还有 N 行」。滚动位置存在 `noteScroll`，打勾重绘后恢复，放下绳子时清空。窗口的 wheel 处理里，鼠标在 `.over` 的便签上就滚便签、不翻屏。单击便签等 250 ms 再开阅读视图（`#reader`，`openReader`），期间来了双击就取消、进编辑器。按住正文拖动（`attachNoteDragOut`，避开方框、链接、底栏、滚动条）走 `drag_text`，带 `name` = 标题纯文本作文件名，扩展名跟文字卡共用 `text_drag_ext`；夹子仍是排序。
  - 编辑器打勾：`Ctrl+Enter` 走 `tickLines`（`edLines` 改选中各行），单击落在 `[ ]` 方括号**里面**（不含两端）才切换；都经 `edReplace`，`Ctrl+Z` 可撤销。剪贴板文字卡的编辑模式（`editing._clip`）不启用。

## 踩过的坑（务必遵守）
1. **创建窗口的命令必须是 `async`**：同步命令在 Windows 上会让主线程死锁，表现为白色「未响应」窗口。
2. 绳子窗口隐藏再显示后，**wry 的拖放目标会失效**，所以每次放下绳子都会调用 `install_drop_target` 重新注册。拖到顶部接住还有兜底：松手时问资源管理器拿当前选中的文件。
3. OLE 拖出：Windows 在拖动开始时就会调用 `EnumFormatEtc` 并**缓存格式列表**，所以要列出全部格式，真正取数据时再按目标过滤；资源管理器会在松手**之后**才在后台取数据，所以要锁定最后一次判断的结果（`LAST_EXPLORER`）。
4. 截图选区页里的 `<img>` 必须禁止原生拖动（`draggable=false` + `pointer-events:none`），否则框选拖不动。
5. 前端要显示图片时，用 `read_image_data` 返回的 base64，**不要用 asset 协议**（之前出现过白屏）。
6. 自动更新靠**发布文件名**找安装文件：便携版必须含 `_portable_`、安装版必须以 `-setup.exe` 结尾（Release 工作流现在就是这样命名，改工作流时别动）。程序判断自己是哪种版本的依据是 exe 旁边有没有 `uninstall.exe`。
7. 便携版更新：运行中的 exe 可以改名但不能覆盖，所以先把自己改名为 `*.exe.old`，新文件放到原路径，再带 `--after-update <pid>` 启动新版（新版先等旧进程退出，再清理 `.old`）。安装版更新：运行 setup 带 `/P /UPDATE /R`（免打扰、保留自启动项、装完重新打开）。
8. 语言设置 `lang` 可为 `auto`：`get_settings` / `update_settings` 返回的 JSON 额外带 `sys_lang`（zh / en），前端用 `pickLang` 解析；`Settings` 默认值是 `auto`，但已存的 settings.json 保留原值。
9. 提醒卡片 / 更新卡片自带中英文表：提醒卡片的语言由主窗口随数据传过来（`lang`），缺省时自己读设置；更新卡片读 `get_settings`。更新出错的文字来自 Rust（中文），`update.html` 的 `ERR_EN` 按前缀翻译——在 `update.rs` 新增或修改错误文字时，记得同步这张表。
10. **截图界面调用的命令一律 `async`**：同步命令跑在主线程上，等 `SHOT` 锁（背景 JPEG 编码时被占着）会把全屏置顶的截图窗口冻住，表现为鼠标能动、什么都点不了。拿 `SHOT` 用 `shot_lock()`（锁中毒也能取回），拷出数据就放锁，别在锁里做慢活。截图页的诊断写进 `clipline-debug.log`（`shot_log`，带窗口标签）。
11. **截图界面用软件绘制**（`--disable-gpu`，单独的 WebView2 数据目录 `EBWebView-shot`——浏览器参数不同的窗口必须用不同的数据目录，还要自己带上 wry 默认的 `--disable-features=…`）：显卡绘制时，框选后整个桌面连指针一起卡住，只有键盘能用（v1.10.0～v1.10.2，迷你主机核显 + 双屏上复现，加 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--disable-gpu` 启动就好了）。别改回去。截图界面每块屏一个窗口；遮罩用四块面板而不是 `box-shadow: 0 0 0 9999px`；`pointermove` 按 `requestAnimationFrame` 合并。
12. 版本比较只看 `主.次.修订` 三段数字；发布时 `tauri.conf.json`、`Cargo.toml` 的版本号和标签必须一致，否则会反复提示更新。

## 在 Linux 上检查 Windows 代码
```bash
# 一次性：把 rust 标准库源码放进 sysroot（rustup 下载不了时，从 GitHub 拉对应版本的 library/）
RUSTC_BOOTSTRAP=1 cargo check -Zbuild-std=std,panic_abort --target x86_64-pc-windows-msvc
```
拉源码的做法：`git clone --depth 1 --branch <rustc 版本号> --filter=blob:none --sparse https://github.com/rust-lang/rust.git`，`git sparse-checkout set library`；`library/backtrace` 是子模块，要按 `git ls-tree HEAD library/backtrace` 给出的提交号从 `rust-lang/backtrace-rs` 单独拉下来放进去；最后把 `library` 链接到 `$(rustc --print sysroot)/lib/rustlib/src/rust/library`。

## 发布
- 改 `src-tauri/tauri.conf.json` 和 `Cargo.toml` 的版本号（`Cargo.lock` 里 clipline 的版本跟着变），更新 `RELEASE_NOTES.md`，并在 `CHANGELOG.md` 和 `CHANGELOG.en.md` 最上面各加一节 `## vX.Y.Z · 日期`——「已更新」卡片按版本号找这一节，找不到就显示「没有写更新说明」。
- 工作流里的 Actions 都已是 Node.js 24 版本（checkout@v7、setup-node@v7、upload-artifact@v7、action-gh-release@v3、rust-cache@v2.9+）。
- 运行 Actions → **Release** 工作流：默认直接发布（`publish=true`）；想先试再发，取消勾选 `publish` 即生成草稿。推送 `v*` 标签也会直接发布。标签会自动打在当前提交上。
- 注意：在 Claude 会话里无法编辑或发布已有的 Release（GitHub 接口拒绝），草稿只能由仓库主人在网页上点「Publish release」。
- 只改发布说明不用重新编译：运行 **Release notes** 工作流，填上标签即可。
- 排查问题：在 exe 旁边放一个空的 `clipline-debug.log`，程序就会写诊断日志。
- 截图：`使用说明.md` 用的配图在 `assets/guide-*.png`，界面改了要记得重截；README 首图是 `assets/screenshot.png`。
- 图标：全部由 `tools/make_icons.py` 从一份 SVG 模板生成（需要 `rsvg-convert` 和 Pillow）：`assets/icon.svg`、`src-tauri/icons/` 下的 png / ico、五种托盘图标（`src-tauri/icons/tray/` 和设置页预览用的 `src/img/tray-*.png`）。托盘图标和 ico 里 32 像素及以下的帧用简化画法 `svg_small`（16 像素下取景框和细线会糊成一片），48 像素起用完整画法。改图标只改脚本里的模板或颜色表，再运行一次。
- 外观页的托盘图标按强调色的顺序排（陶土橙、薄荷绿、晴空蓝、深海蓝、徕卡红），设置里存的 id（a–e）不变。

## 设计决定
已经定下的取舍，改之前先想清楚当初为什么这样定。

- **剪贴板绳上的文字卡不渲染 Markdown**：复制来的东西要原样显示、原样复制，`**` `#` 之类的符号本来就是内容的一部分。只有便签（自己写的）和提醒卡片按 Markdown 显示。
- **链接备注限 100 字**：备注是认出这个链接用的一句话，卡片上最多显示两行；更长的内容请写便签。
- **便签不做悬浮放大**：绳子窗口高度是固定的，放大的卡片会被截掉，还会挡住相邻卡片，也和按住夹子拖动排序冲突。看全文用单击打开的阅读视图。
- **显示不全时用渐隐 +「还有 N 行」+ 滚轮滚动**，不改卡片大小：卡片整齐划一，绳子的排布不受内容长短影响。滚轮只在鼠标停在放不下的便签上时滚便签，滚到底也不翻屏（免得一不小心跳页）；其他地方照旧翻屏。
- **「还有 N 行」按显示出来的块计数**：一段自动折行的长文字算一行，代码块按它自己的行数算。数的是读者看到的「行」，不去算折行。
- **单击便签 = 阅读视图，双击 = 编辑**：阅读视图能打勾、点链接，但不能改文字，免得看的时候误改。单击要等约 250 ms 确认不是双击，这点延迟是有意的。
- **阅读视图是绳子窗口里的浮层，不是独立窗口**：不碰 Rust、不抢焦点，打勾直接改主窗口里的数据；代价是高度受绳子窗口限制（约 360px），长便签在里面滚动。
- **便签分类 = 有名字的颜色，一张便签只属于一个分类**：不做多标签。多标签要做标签管理和组合筛选，对挂在绳上的便签太重；单分类像记账软件，选起来最省事，而且老便签按颜色自然归类，不用迁移。
- **便签取下 = 完成，进收纳袋**：「取下」默认留记录，方便按月统计；真的不想留的走右键「删除（不进收纳袋）」。收纳袋只做计数，不做图表，免得变成另一个待办软件。
- **截图先选后截**：拖动、单击窗口都只是「选」，回车 / 双击 / ✓ 才「拍」。同一个手势在成为图片之前还能改，不必拍完再重来。
- **截图暂不支持跨屏框选**（v1.11.0 评估后搁置）：要把选区坐标改成以整个桌面为准，跨窗口拖动时换算不同缩放，拖柄、工具条也要跨屏，等于重写刚稳定下来的截图界面。真要做，先考虑便宜的「一键截整个桌面」。
- **截图不做翻译、长图**：Windows 没有系统自带的离线翻译，要做就得接在线服务（Key、联网、隐私），和本程序轻量离线的定位冲突；长图要模拟滚动再拼接，各应用表现差异大。以后要做也是可选功能。
- **不做便签录音**：麦克风权限、音频存储、波形与续录的成本高，离剪贴板 + 便签的核心用途远。
- **更新历史打包进程序、只维护一份**：`CHANGELOG.md` / `CHANGELOG.en.md` 编译时嵌入，不联网也能看，也不必再维护一份网页或 JSON。
- **「已更新」卡片每个版本只弹一次，新装和降级不弹**：新用户还没用过旧版，没有「更新了什么」可言；降级多半是在排查问题，不打扰。
- **设置用分类栏而不是一长页**：设置项越来越多，一长页要一路往下拖；分类栏每页一屏，和 Windows 自己的设置一致。
- **提醒时间用月历 + 数字，不用表盘**：表盘要分两步拨（先时后分），鼠标操作比滚轮或直接输入慢，而且绳子窗口只有约 360px 高，放不下够大的表盘。
- **便签「复制内容」复制 Markdown 原文**：粘回便签还是原样；要纯文本的话打开阅读视图选中复制。
- **更新卡片里的说明来自 GitHub 发布页，「已更新」卡片的说明来自程序自带的 CHANGELOG**：前者是还没装上的新版本，只能联网取；后者是已经装上的版本，用自带的。
