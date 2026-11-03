# ClipLine 开发交接说明

给接手开发的人（或新开的 AI 会话）快速上手用。用户可见的说明在 `使用说明.md`，发布说明在 `RELEASE_NOTES.md`。

## 结构
- `src-tauri/`：Rust（Tauri v2）。
  - `main.rs`：命令、窗口、托盘、设置（`Settings` 带 `#[serde(default)]`，新字段必须给默认值）、光标线程（顶边悬停、拖文件到顶部接住、自动收起）、文件夹监听。
  - `native.rs`：剪贴板（arboard / clipboard-win）、光标、粘贴回原应用、图片卡保存 `save_rgba_card`。
  - `winx.rs`：低级鼠标钩子、自研 OLE 拖出（文字卡：资源管理器得到文件 / 其它应用得到文字；文件卡：shell 数据对象）、自研拖入目标（替代 wry 失效的那个）、资源管理器选中项兜底、诊断日志 `dlog`。
  - `shot.rs`：GDI 截全虚拟屏、Windows 自带 OCR（Windows.Media.Ocr）。
  - `update.rs`：检查更新。用系统的 `URLDownloadToFileW` 访问 GitHub API（`releases/latest`）和下载安装文件，不引入 TLS 库，走系统代理；状态集中在 `STATUS`，每次变化由 `main.rs` 广播 `update:status`，`update.html` 负责显示。
- `src/`：前端静态页。`app.js` 主界面（绳子布局：收藏区 / 今天 / 日期叠、卡片、便签、提醒、整理），`settings.*`、`pin.html`、`shot.html`（截图选区）、`annotate.html`（标注）、`remind.html`（提醒卡片）、`update.html`（更新卡片）。

## 踩过的坑（务必遵守）
1. **创建窗口的命令必须是 `async`**：同步命令在 Windows 上会让主线程死锁，表现为白色「未响应」窗口。
2. 绳子窗口隐藏再显示后，**wry 的拖放目标会失效**，所以每次放下绳子都会调用 `install_drop_target` 重新注册。拖到顶部接住还有兜底：松手时问资源管理器拿当前选中的文件。
3. OLE 拖出：Windows 在拖动开始时就会调用 `EnumFormatEtc` 并**缓存格式列表**，所以要列出全部格式，真正取数据时再按目标过滤；资源管理器会在松手**之后**才在后台取数据，所以要锁定最后一次判断的结果（`LAST_EXPLORER`）。
4. 截图选区页里的 `<img>` 必须禁止原生拖动（`draggable=false` + `pointer-events:none`），否则框选拖不动。
5. 前端要显示图片时，用 `read_image_data` 返回的 base64，**不要用 asset 协议**（之前出现过白屏）。
6. 自动更新靠**发布文件名**找安装文件：便携版必须含 `_portable_`、安装版必须以 `-setup.exe` 结尾（Release 工作流现在就是这样命名，改工作流时别动）。程序判断自己是哪种版本的依据是 exe 旁边有没有 `uninstall.exe`。
7. 便携版更新：运行中的 exe 可以改名但不能覆盖，所以先把自己改名为 `*.exe.old`，新文件放到原路径，再带 `--after-update <pid>` 启动新版（新版先等旧进程退出，再清理 `.old`）。安装版更新：运行 setup 带 `/P /UPDATE /R`（免打扰、保留自启动项、装完重新打开）。
8. 版本比较只看 `主.次.修订` 三段数字；发布时 `tauri.conf.json`、`Cargo.toml` 的版本号和标签必须一致，否则会反复提示更新。

## 在 Linux 上检查 Windows 代码
```bash
# 一次性：把 rust 标准库源码放进 sysroot（rustup 下载不了时，从 GitHub 拉对应版本的 library/）
RUSTC_BOOTSTRAP=1 cargo check -Zbuild-std=std,panic_abort --target x86_64-pc-windows-msvc
```
拉源码的做法：`git clone --depth 1 --branch <rustc 版本号> --filter=blob:none --sparse https://github.com/rust-lang/rust.git`，`git sparse-checkout set library`；`library/backtrace` 是子模块，要按 `git ls-tree HEAD library/backtrace` 给出的提交号从 `rust-lang/backtrace-rs` 单独拉下来放进去；最后把 `library` 链接到 `$(rustc --print sysroot)/lib/rustlib/src/rust/library`。

## 发布
- 改 `src-tauri/tauri.conf.json` 和 `Cargo.toml` 的版本号，更新 `RELEASE_NOTES.md`。
- 运行 Actions → **Release** 工作流：默认直接发布（`publish=true`）；想先试再发，取消勾选 `publish` 即生成草稿。推送 `v*` 标签也会直接发布。标签会自动打在当前提交上。
- 注意：在 Claude 会话里无法编辑或发布已有的 Release（GitHub 接口拒绝），草稿只能由仓库主人在网页上点「Publish release」。
- 只改发布说明不用重新编译：运行 **Release notes** 工作流，填上标签即可。
- 排查问题：在 exe 旁边放一个空的 `clipline-debug.log`，程序就会写诊断日志。
