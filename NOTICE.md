# NOTICE — 来源与改动说明

**ClipLine** 是一款 Windows 剪贴板 / 便签工具，灵感来自：

- **Tendedero** — Alejandro Buján，MIT 许可证。
  https://github.com/alejandrobujan/tendedero
- **Clothespeg** — VIZWISE (HONGKONG) LIMITED，Apache-2.0 许可证
  （Tendedero 的 fork，新增便签绳、盯住、胶囊工具条、截图收件箱等）。
  https://github.com/saodisir/Clothespeg

## 这是一次独立重写

ClipLine **没有**使用上述项目的任何源代码。原项目是 Swift / SwiftUI、面向
macOS，强依赖「刘海」等系统特性；ClipLine 以 Rust (Tauri) + HTML/CSS/JS
从零编写，针对 Windows 重新实现同类交互。所复用的只是公开可见的**观念与视觉语言**
（晾衣绳、衣夹、卡片落绳摆动、毛玻璃、暖纸配色），这类观念不受版权保护。

## 名称与图标

上游许可证明确将「名称与图标」排除在授权之外，并要求再分发版本换名换图标、
不得暗示得到原作者背书。为遵守此要求：

- 名称改为 **ClipLine**（非 Clothespeg / Tendedero）。
- 图标为原创（`assets/icon.svg`），非任一上游图标。
- ClipLine 与上述项目及其作者**无关联、未获其背书**。

## 许可证

本项目以 **Apache License 2.0** 发布，与上游 Clothespeg 的许可证一致且相容。
