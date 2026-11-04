# ClipLine 开发交接说明

给接手开发的人（或新开的 AI 会话）快速上手用。用户可见的说明在 `使用说明.md`，更新历史在 `CHANGELOG.md`（中文）/ `CHANGELOG.en.md`（英文），GitHub 发布页的说明在 `RELEASE_NOTES.md`。

## 结构
- `src-tauri/`：Rust（Tauri v2）。
  - `main.rs`：命令、窗口、托盘、设置（`Settings` 带 `#[serde(default)]`，新字段必须给默认值）、光标线程（顶边悬停、拖文件到顶部接住、自动收起）、文件夹监听。
  - `native.rs`：剪贴板（arboard / clipboard-win）、光标、粘贴回原应用、图片卡保存 `save_rgba_card`。
  - `winx.rs`：低级鼠标钩子、自研 OLE 拖出（文字卡：资源管理器得到文件 / 其它应用得到文字；文件卡：shell 数据对象）、自研拖入目标（替代 wry 失效的那个）、资源管理器选中项兜底、诊断日志 `dlog`。
  - `shot.rs`：GDI 截全虚拟屏、Windows 自带 OCR（Windows.Media.Ocr）。
  - `display.rs`：显示器列表（Win32 `EnumDisplayMonitors` + `GetDpiForMonitor`，缓存 1 秒，插拔后自动更新）、系统界面语言。`main.rs` 里 `target_monitor` 按设置 `line_display`（`cursor` / `primary` / 设备名如 `\\.\DISPLAY2`）选屏，`fit_line_to` 按那块屏的缩放重算绳子尺寸，`place_window` 先移位再改尺寸再移位（跨缩放比例移动时 Windows 会先自动缩放一次）。提醒 / 更新卡片用 `place_corner_card` 放在同一块屏右下角。
  - 更新历史：`get_changelog(lang)` 用 `include_str!` 把仓库根目录的 `CHANGELOG.md` / `CHANGELOG.en.md` 编进 exe（离线可看，改了要重新编译）。启动时 `note_version_seen` 比较设置里的 `seen_version` 和当前版本：新装（没有 settings.json 也没有 data.json）不弹，降级不弹，`seen_version` 为空（v1.7.0 之前存的设置）算升级；需要弹时约 2.5 秒后开 `news.html`（标签 `news`，右下角）。「全部更新历史」走 `open_changelog`：设置窗口已开就发 `settings:goto`，没开就先记在 `SETTINGS_GOTO`，`settings.js` 启动时用 `settings_goto` 取走。
  - `update.rs`：检查更新。用系统的 `URLDownloadToFileW` 访问 GitHub API（`releases/latest`）和下载安装文件，不引入 TLS 库，走系统代理；状态集中在 `STATUS`，每次变化由 `main.rs` 广播 `update:status`，`update.html` 负责显示。
- `src/md.js`：小型 Markdown 渲染器（先整体转义再生成标记，链接只给 `data-href`，由页面自己 `invoke("open_url")`）。便签卡片、阅读视图、编辑器预览、提醒卡片、更新历史共用；`MD.releases` 把 CHANGELOG 按 `## v1.2.3 · 日期` 切成各个版本；按行渲染，待办方框带 `data-idx`（源文本行号），打勾用 `MD.toggle`。待办写法兼容 `- [ ]` / `[ ]` / `[]`。提醒卡片和「已更新」卡片里各有一份同样的 Markdown 样式（`remind.html`、`news.html` 不加载 `styles.css`），改样式时几处一起改。
- `src/`：前端静态页。`app.js` 主界面（绳子布局：收藏区 / 今天 / 日期叠、卡片、便签、提醒、整理），`settings.*`、`pin.html`、`shot.html`（截图选区）、`annotate.html`（标注）、`remind.html`（提醒卡片）、`update.html`（更新卡片）、`news.html`（「已更新到 vX」卡片）。
  - 便签分类：分类就是「有名字的底色」，存在 `data.json` 的 `state.cats`（`[{tint, name}]`，`name` 为空时用默认名 `cat_<tint>` 翻译）；便签仍然只存 `tint`，`catOf(tint)` 查分类，不在 `cats` 里的算未分类。`TINTS` 共 12 色（含无色），所以最多 11 个分类。删除分类时把绳上和篮子里对应 `tint` 的便签改成 `null`。底部筛选用 `ui.cat`（`""` 全部 / tint / `"none"`），分类不到两种时不显示。
  - 篮子：`state.done`，便签取下时复制一份加 `doneAt`（去掉提醒字段）。`cleanup` 按设置 `history_days`（默认 30，0 = 永久）清理。`#tidy` 按钮两边共用：剪贴板绳是「失效文件卡」，便签绳是「待办全部打勾的便签」（`updateNoteTidy` / `runNoteTidy`）。统计里的「项」是打勾的待办数（`MD.progress` 的第一个数）。
  - 托盘菜单：`tray_menu(app, en)` 按 `lang` 生成，`update_settings` 里 `apply_tray_lang` 重建，所以改语言不用重启。
  - 便签卡片（`buildNoteCard`）：内容放在 `.note-clip > .note-lines`，渲染后 `measureNotes` 量高度，放不下就加 `.over`（可滚动、细滚动条）和 `.fade`（底部渐隐），`updateNoteMore` 数没完整露出来的块写进「还有 N 行」。滚动位置存在 `noteScroll`，打勾重绘后恢复，放下绳子时清空。窗口的 wheel 处理里，鼠标在 `.over` 的便签上就滚便签、不翻屏。单击便签等 250 ms 再开阅读视图（`#reader`，`openReader`），期间来了双击就取消、进编辑器。

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
10. 版本比较只看 `主.次.修订` 三段数字；发布时 `tauri.conf.json`、`Cargo.toml` 的版本号和标签必须一致，否则会反复提示更新。

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
- **便签取下 = 完成，进篮子**：「取下」默认留记录，方便按月统计；真的不想留的走右键「删除（不进篮子）」。篮子只做计数，不做图表，免得变成另一个待办软件。
- **更新历史打包进程序、只维护一份**：`CHANGELOG.md` / `CHANGELOG.en.md` 编译时嵌入，不联网也能看，也不必再维护一份网页或 JSON。
- **「已更新」卡片每个版本只弹一次，新装和降级不弹**：新用户还没用过旧版，没有「更新了什么」可言；降级多半是在排查问题，不打扰。
- **更新卡片里的说明来自 GitHub 发布页，「已更新」卡片的说明来自程序自带的 CHANGELOG**：前者是还没装上的新版本，只能联网取；后者是已经装上的版本，用自带的。
