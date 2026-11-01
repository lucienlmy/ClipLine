@echo off
REM 一键构建 ClipLine 免安装便携版（需已安装 Rust + VS C++ Build Tools）
setlocal
cd /d "%~dp0src-tauri"
echo === 正在构建 ClipLine（release），首次编译依赖较久，请稍候 ===
cargo build --release
if errorlevel 1 (
  echo.
  echo 构建失败。请确认已安装 Rust 工具链与 Visual Studio C++ Build Tools。
  pause
  exit /b 1
)
echo.
echo === 构建完成 ===
echo 便携版路径：%~dp0src-tauri\target\release\clipline.exe
echo 双击该 exe 即可运行。
pause
