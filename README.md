<p align="center">
  <img src="src-tauri/icons/128x128.png" width="96" alt="ClipLine" />
</p>

<h1 align="center">ClipLine 晾衣绳</h1>

<p align="center">
  一根晾衣绳，穿起剪贴板、便签和截图 —— Windows 版<br/>
  <a href="https://github.com/sjzy137/ClipLine/releases/latest"><b>⬇ 下载最新版</b></a> · 免安装 · 4 MB 左右 · 不联网 · 无广告
</p>

<p align="center">
  <img src="assets/screenshot.png" alt="ClipLine 截图" />
</p>

复制过的文字、链接、颜色、图片、文件，各自成一张卡片，晾在屏幕顶端的一根绳子上；便签挂在另一根绳上。鼠标顶到屏幕最上沿，绳子就滑下来，左半边是剪贴板绳，右半边是便签绳；鼠标移开，它就收起，不打断手头的事。

## 下载

到 [Releases](https://github.com/sjzy137/ClipLine/releases/latest) 下载：

- `ClipLine_x.y.z_portable_x64.exe`：**免安装便携版**，双击即用
- `ClipLine_x.y.z_x64-setup.exe`：安装版

适用于 Windows 10 / 11（x64），需要系统自带的 WebView2，Win10/11 一般已内置。

## 功能一览

**剪贴板绳**
- 自动收集复制的文字、链接、颜色、图片、文件；同样的内容不会重复挂。
- 单击复制，双击编辑或打开；卡片可以拖出：文字拖到输入框直接插入，拖到文件夹生成 .txt/.md；文件拖出默认是复制，按住 Shift 拖是移动。
- 从资源管理器把文件拖到屏幕顶端，绳子会滑下来接住。
- **收藏区**固定在左端；**今天**的卡片散挂在中间；更早的自动折成「三日内 / 一周内 / 更早」三叠。
- 多个文件挂成一叠，可以展开后单独复制或拖出；文件按类型显示彩色图标。
- **整理**：一键取下原文件已经不在的卡片，可以撤销。

**截图 · 标注 · 识别文字**
- `Ctrl+Alt+S` 框选截图，可直接挂上绳、标注、识别文字或钉在桌面。
- 标注工具：画笔、箭头、方框、椭圆、文字、马赛克、序号。
- OCR 用的是 Windows 自带的文字识别：不联网，也不用下载模型。

**便签绳**
- 第一行是标题，以 `[]` 开头的行是勾选项；可设一次或重复的提醒（每天 / 每周 / 每月）。

**其它**
- 主题 5 种，强调色 4 种，可以自由搭配；托盘图标有 5 种颜色可选。
- 快捷键可以自定义；可监听指定文件夹；支持开机自启；中英双语。
- 数据只存在本机：`%APPDATA%\com.clipline.app`，设置里有「打开数据文件夹」按钮。

详细用法见 [使用说明.md](使用说明.md)。

## 常用操作

| 操作 | 方式 |
|---|---|
| 呼出剪贴板绳 / 便签绳 | 鼠标顶到屏幕上沿左半 / 右半，或 `Ctrl+Alt+C` / `Ctrl+Alt+N` |
| 截图上绳 | `Ctrl+Alt+S`，或底部栏「✂ 截图」 |
| 收起 | 鼠标移开、`Esc`，或再按一次快捷键 |
| 收藏 | 悬停卡片，点右下角 ☆ |
| 移动文件 | 开始拖动时按住 Shift（可在设置里改成 Alt 或 Ctrl） |

## 隐私

ClipLine 不联网、不上传、不需要账号。剪贴板内容、便签、截图只保存在你自己的电脑上，删除 `%APPDATA%\com.clipline.app` 文件夹即可彻底清除。

## 从源码构建

需要 Rust 工具链（MSVC）和 Visual Studio C++ 生成工具。

```powershell
cd src-tauri
cargo build --release          # 便携版：target\release\clipline.exe
# 或：npm i -g @tauri-apps/cli@2 && tauri build   # 同时生成安装包
```

推送版本号后，也可以在 Actions 里运行 **Release** 工作流，自动编译并发布。

## 致谢与许可

- 灵感来自 macOS 应用 Clothespeg（Apache-2.0）及其上游 Tendedero（MIT）；截图、标注、OCR 的功能取舍参考了 [截图吧](https://github.com/1003129155/jietuba)（MIT）。ClipLine 为独立重写，名称与图标均为原创，详见 [NOTICE.md](NOTICE.md)。
- 本项目以 [Apache-2.0](LICENSE) 许可发布。

---

<sub>English: ClipLine is a lightweight Windows clipboard manager and sticky-notes app with a clothesline metaphor — cards hang on a rope that drops from the top edge of the screen. Includes region screenshots with annotation and offline OCR. Portable single exe (~4 MB), no network, no accounts. Built with Tauri (Rust + WebView2).</sub>
