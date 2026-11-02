#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod native;
mod winx;

use once_cell::sync::{Lazy, OnceCell};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt as _;

const CLIP_H: f64 = 262.0;
const NOTES_H: f64 = 392.0;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Deck {
    Clipboard,
    Notes,
}

fn deck_str(d: Deck) -> &'static str {
    match d {
        Deck::Clipboard => "clipboard",
        Deck::Notes => "notes",
    }
}

// ---------------------------------------------------------------------------
// Settings (persisted to settings.json; read at startup so hotkeys register
// before the frontend is up).
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
struct Settings {
    hotkey_clip: String,
    hotkey_notes: String,
    hover_enabled: bool,
    dwell_ms: u64,
    flip_mod: String, // none | shift | ctrl | alt
    retention_days: u32,
    lang: String, // zh | en
    autostart: bool,
    theme: String, // soft | silver | linen | porcelain | graphite
    watch_folders: Vec<String>,
    font_family: String,          // default | yahei | dengxian | simsun | kaiti | fangsong | source
    font_size: String,            // small | medium | large
    reminder_presets: Vec<String>, // ids shown in the reminder popover
    drop_to_hang: bool,            // dragging files to the top edge drops the line
    text_drag_ext: String,         // txt | md — file type when a text card is dragged to Explorer
    accent: String,                // terra | mint | sky | navy
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            hotkey_clip: "Ctrl+Alt+C".into(),
            hotkey_notes: "Ctrl+Alt+N".into(),
            hover_enabled: true,
            dwell_ms: 250,
            flip_mod: "shift".into(),
            retention_days: 30,
            lang: "zh".into(),
            autostart: false,
            theme: "soft".into(),
            watch_folders: Vec::new(),
            font_family: "default".into(),
            font_size: "medium".into(),
            reminder_presets: vec!["m15".into(), "h1".into(), "tomorrow".into()],
            drop_to_hang: true,
            text_drag_ext: "txt".into(),
            accent: "terra".into(),
        }
    }
}

struct LineState {
    dropped: bool,
    sticky: bool,
    deck: Deck,
    top: i32,
    left: i32,
    width: i32,
    clip_h: i32,
    notes_h: i32,
    hover_enabled: bool,
    dwell_ms: u64,
    flip_mod: String,
    drop_to_hang: bool,
}

impl Default for LineState {
    fn default() -> Self {
        LineState {
            dropped: false,
            sticky: false,
            deck: Deck::Clipboard,
            top: 0,
            left: 0,
            width: 1920,
            clip_h: 262,
            notes_h: 392,
            hover_enabled: true,
            dwell_ms: 250,
            flip_mod: "shift".into(),
            drop_to_hang: true,
        }
    }
}

static APP: OnceCell<AppHandle> = OnceCell::new();
static STATE: Lazy<Mutex<LineState>> = Lazy::new(|| Mutex::new(LineState::default()));
static SETTINGS: Lazy<Mutex<Settings>> = Lazy::new(|| Mutex::new(Settings::default()));
static CUR_CLIP: Lazy<Mutex<Option<Shortcut>>> = Lazy::new(|| Mutex::new(None));
static CUR_NOTES: Lazy<Mutex<Option<Shortcut>>> = Lazy::new(|| Mutex::new(None));
// While a menu / editor / preview / settings overlay is open, the line must
// not auto-roll-up even if the pointer leaves the panel to reach it.
/// True while the line was dropped to catch a file drag (until rollup).
static CATCHING: AtomicBool = AtomicBool::new(false);
static MODAL: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Clone)]
struct DropMsg {
    deck: &'static str,
    sticky: bool,
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Hotkey parsing ("Ctrl+Alt+C" -> Shortcut)
// ---------------------------------------------------------------------------

fn key_code(s: &str) -> Option<Code> {
    Some(match s {
        "a" => Code::KeyA,
        "b" => Code::KeyB,
        "c" => Code::KeyC,
        "d" => Code::KeyD,
        "e" => Code::KeyE,
        "f" => Code::KeyF,
        "g" => Code::KeyG,
        "h" => Code::KeyH,
        "i" => Code::KeyI,
        "j" => Code::KeyJ,
        "k" => Code::KeyK,
        "l" => Code::KeyL,
        "m" => Code::KeyM,
        "n" => Code::KeyN,
        "o" => Code::KeyO,
        "p" => Code::KeyP,
        "q" => Code::KeyQ,
        "r" => Code::KeyR,
        "s" => Code::KeyS,
        "t" => Code::KeyT,
        "u" => Code::KeyU,
        "v" => Code::KeyV,
        "w" => Code::KeyW,
        "x" => Code::KeyX,
        "y" => Code::KeyY,
        "z" => Code::KeyZ,
        "0" => Code::Digit0,
        "1" => Code::Digit1,
        "2" => Code::Digit2,
        "3" => Code::Digit3,
        "4" => Code::Digit4,
        "5" => Code::Digit5,
        "6" => Code::Digit6,
        "7" => Code::Digit7,
        "8" => Code::Digit8,
        "9" => Code::Digit9,
        "f1" => Code::F1,
        "f2" => Code::F2,
        "f3" => Code::F3,
        "f4" => Code::F4,
        "f5" => Code::F5,
        "f6" => Code::F6,
        "f7" => Code::F7,
        "f8" => Code::F8,
        "f9" => Code::F9,
        "f10" => Code::F10,
        "f11" => Code::F11,
        "f12" => Code::F12,
        "space" => Code::Space,
        "enter" | "return" => Code::Enter,
        "tab" => Code::Tab,
        _ => return None,
    })
}

fn parse_shortcut(s: &str) -> Option<Shortcut> {
    let mut mods = Modifiers::empty();
    let mut key: Option<Code> = None;
    for raw in s.split('+') {
        let t = raw.trim();
        if t.is_empty() {
            continue;
        }
        match t.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "alt" | "option" => mods |= Modifiers::ALT,
            "shift" => mods |= Modifiers::SHIFT,
            "super" | "win" | "cmd" | "command" | "meta" => mods |= Modifiers::SUPER,
            other => {
                key = key_code(other);
                key?;
            }
        }
    }
    let k = key?;
    Some(Shortcut::new(
        if mods.is_empty() { None } else { Some(mods) },
        k,
    ))
}

fn apply_hotkeys(app: &AppHandle, clip: &str, notes: &str) -> Result<(), String> {
    let scc = parse_shortcut(clip).ok_or_else(|| format!("无法识别快捷键：{clip}"))?;
    let scn = parse_shortcut(notes).ok_or_else(|| format!("无法识别快捷键：{notes}"))?;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    gs.register(scc.clone())
        .map_err(|e| format!("快捷键可能已被占用：{clip}（{e}）"))?;
    gs.register(scn.clone())
        .map_err(|e| format!("快捷键可能已被占用：{notes}（{e}）"))?;
    *CUR_CLIP.lock().unwrap() = Some(scc);
    *CUR_NOTES.lock().unwrap() = Some(scn);
    Ok(())
}

fn settings_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Settings {
    if let Some(p) = settings_path(app) {
        if let Ok(s) = std::fs::read_to_string(&p) {
            if let Ok(parsed) = serde_json::from_str::<Settings>(&s) {
                return parsed;
            }
        }
    }
    Settings::default()
}

fn save_settings(app: &AppHandle, s: &Settings) -> Result<(), String> {
    if let Some(p) = settings_path(app) {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let data = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
        std::fs::write(&p, data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn apply_settings_to_state(s: &Settings) {
    let mut st = STATE.lock().unwrap();
    st.hover_enabled = s.hover_enabled;
    st.dwell_ms = s.dwell_ms;
    st.drop_to_hang = s.drop_to_hang;
    st.flip_mod = s.flip_mod.clone();
}

// ---------------------------------------------------------------------------
// Drop / rollup
// ---------------------------------------------------------------------------

fn with_window<F: FnOnce(tauri::WebviewWindow) + Send + 'static>(f: F) {
    if let Some(app) = APP.get() {
        let app = app.clone();
        let app2 = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(w) = app2.get_webview_window("line") {
                f(w);
            }
        });
    }
}

fn drop_line(deck: Deck, sticky: bool) {
    drop_line_ex(deck, sticky, true);
}

/// `focus = false` is used when a file drag reaches the top edge: taking
/// focus in the middle of someone else's drag is unnecessary and jarring.
fn drop_line_ex(deck: Deck, sticky: bool, focus: bool) {
    native::remember_foreground();
    {
        let mut st = STATE.lock().unwrap();
        st.dropped = true;
        st.deck = deck;
        st.sticky = sticky;
    }
    with_window(move |w| {
        let _ = w.set_ignore_cursor_events(false);
        let _ = w.show();
        if focus {
            let _ = w.set_focus();
        }
        // Fresh drop target every time (the webview's own one goes stale
        // once the window has been hidden).
        install_drop_target_now(&w);
    });
    // WebView2 may (re)create its child windows a moment after showing;
    // register again shortly after so none of them is missed.
    std::thread::spawn(|| {
        for ms in [200u64, 700] {
            std::thread::sleep(std::time::Duration::from_millis(ms));
            if STATE.lock().unwrap().dropped {
                with_window(|w| install_drop_target_now(&w));
            }
        }
    });
    if let Some(app) = APP.get() {
        let _ = app.emit(
            "line:drop",
            DropMsg {
                deck: deck_str(deck),
                sticky,
            },
        );
        if !focus {
            winx::reset_entered();
            winx::dlog(&format!("catch: line dropped; cursor {}", winx::window_under_cursor()));
            CATCHING.store(true, Ordering::Relaxed);
            let _ = app.emit("line:catch", ());
        }
    }
}

fn emit_files(kind: &str, paths: Vec<String>) {
    if let Some(app) = APP.get() {
        let _ = app.emit(&format!("files:{kind}"), paths);
    }
}

fn install_drop_target_now(w: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    if let Ok(h) = w.hwnd() {
        winx::install_drop_target(h.0 as isize);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = w;
}

fn rollup() {
    rollup_ex(true);
}

/// `restore = false` after dropping something into another app: that app
/// should keep the focus.
fn rollup_ex(restore: bool) {
    winx::dlog("rollup");
    {
        let mut st = STATE.lock().unwrap();
        if !st.dropped {
            return;
        }
        st.dropped = false;
    }
    CATCHING.store(false, Ordering::Relaxed);
    if let Some(app) = APP.get() {
        let _ = app.emit("line:rollup", ());
    }
    if restore {
        native::restore_foreground();
    }
}

fn toggle_deck(deck: Deck) {
    let (dropped, cur) = {
        let st = STATE.lock().unwrap();
        (st.dropped, st.deck)
    };
    if dropped && cur == deck {
        rollup();
    } else {
        drop_line(deck, true);
    }
}

fn parse_deck(s: &str) -> Deck {
    if s == "notes" {
        Deck::Notes
    } else {
        Deck::Clipboard
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn set_passthrough(on: bool) {
    if on {
        let st = STATE.lock().unwrap();
        if st.dropped {
            return;
        }
    }
    with_window(move |w| {
        let _ = w.set_ignore_cursor_events(on);
    });
}

#[tauri::command]
fn rollup_now() {
    winx::dlog("rollup_now (frontend)");
    rollup();
}

#[tauri::command]
fn dbg_log(msg: String) {
    winx::dlog(&format!("[ui] {msg}"));
}

#[tauri::command]
fn toggle(deck: String) {
    toggle_deck(parse_deck(&deck));
}

#[tauri::command]
fn copy_text(text: String) {
    native::set_text(&text);
}

#[tauri::command]
async fn copy_image(path: String) {
    native::set_image_from_file(&path);
}

#[tauri::command]
fn copy_files(paths: Vec<String>) {
    native::set_files(&paths);
}

#[tauri::command]
fn paste_text(text: String) {
    rollup();
    std::thread::spawn(move || {
        native::paste_text(&text);
    });
}

/// Drag a text card out. Explorer / the desktop receive a .txt/.md file,
/// every other drop target receives the text itself.
#[tauri::command]
async fn drag_text(app: AppHandle, text: String) -> Result<bool, String> {
    let ext = {
        let s = SETTINGS.lock().unwrap();
        if s.text_drag_ext == "md" { "md" } else { "txt" }
    };
    let file = write_drag_temp(&text, ext)?;
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(winx::drag_text(&text, &file));
    })
    .map_err(|e| e.to_string())?;
    let r = rx.recv().map_err(|e| e.to_string())?;
    rollup_ex(false);
    r
}

/// Drag file / image cards out (copy, or move with Shift).
#[tauri::command]
async fn drag_files(app: AppHandle, paths: Vec<String>, mov: bool) -> Result<bool, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(winx::drag_files(&paths, mov));
    })
    .map_err(|e| e.to_string())?;
    let r = rx.recv().map_err(|e| e.to_string())?;
    rollup_ex(false);
    r
}

/// %TEMP%\ClipLine\drag\<stamp>\<first line>.<ext>
fn write_drag_temp(text: &str, ext: &str) -> Result<std::path::PathBuf, String> {
    let base = std::env::temp_dir().join("ClipLine").join("drag");
    // Housekeeping: forget drag files older than a day.
    if let Ok(rd) = std::fs::read_dir(&base) {
        for e in rd.flatten() {
            let old = e
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.elapsed().ok())
                .map(|d| d.as_secs() > 86_400)
                .unwrap_or(false);
            if old {
                let _ = std::fs::remove_dir_all(e.path());
            }
        }
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dir = base.join(stamp.to_string());
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = drag_file_stem(text);
    let path = dir.join(format!("{name}.{ext}"));
    // UTF-8 with BOM so old Notepad builds pick the right encoding.
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(text.replace("\r\n", "\n").replace('\n', "\r\n").as_bytes());
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path)
}

fn drag_file_stem(text: &str) -> String {
    let first = text.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    let mut out: String = first
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) || c.is_control() { '_' } else { c })
        .take(40)
        .collect();
    out = out.trim().trim_end_matches('.').to_string();
    if out.is_empty() {
        out = "ClipLine 文本".into();
    }
    out
}

#[tauri::command]
fn toggle_monitor() -> bool {
    !native::toggle_paused()
}

#[tauri::command]
fn monitor_active() -> bool {
    !native::paused()
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn reveal_path(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_to_desktop(
    app: AppHandle,
    kind: String,
    text: Option<String>,
    path: Option<String>,
) -> Result<String, String> {
    let desk = app.path().desktop_dir().map_err(|e| e.to_string())?;
    let _ = std::fs::create_dir_all(&desk);
    if kind == "image" {
        let p = path.ok_or("缺少图片路径")?;
        let src = std::path::PathBuf::from(&p);
        let name = src.file_name().ok_or("文件名无效")?;
        let dst = desk.join(name);
        std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
        Ok(dst.to_string_lossy().to_string())
    } else {
        let t = text.unwrap_or_default();
        let dst = desk.join(format!("clipline-{}.txt", now_ms()));
        std::fs::write(&dst, t).map_err(|e| e.to_string())?;
        Ok(dst.to_string_lossy().to_string())
    }
}

#[tauri::command]
fn get_settings() -> String {
    let s = SETTINGS.lock().unwrap().clone();
    serde_json::to_string(&s).unwrap_or_default()
}

#[tauri::command]
fn update_settings(app: AppHandle, data: String) -> Result<String, String> {
    let s: Settings = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    // Persist FIRST so a hotkey/autostart hiccup can never lose the user's
    // settings (theme, watched folders, etc.).
    save_settings(&app, &s)?;
    *SETTINGS.lock().unwrap() = s.clone();
    apply_settings_to_state(&s);
    // Side effects are best-effort and must not fail the save.
    let _ = apply_hotkeys(&app, &s.hotkey_clip, &s.hotkey_notes);
    let _ = if s.autostart {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    };
    serde_json::to_string(&s).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_state(app: AppHandle, data: String) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).ok();
    std::fs::write(dir.join("data.json"), data).map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_state(app: AppHandle) -> String {
    if let Ok(dir) = app.path().app_config_dir() {
        if let Ok(s) = std::fs::read_to_string(dir.join("data.json")) {
            return s;
        }
    }
    String::new()
}

#[tauri::command]
fn delete_file(path: String) {
    let _ = std::fs::remove_file(path);
}

/// Move files/folders to the Recycle Bin (recoverable), for "取下（删除原文件）".
#[tauri::command]
async fn trash_files(paths: Vec<String>) -> Result<(), String> {
    let existing: Vec<String> = paths
        .into_iter()
        .filter(|p| std::path::Path::new(p).exists())
        .collect();
    if existing.is_empty() {
        return Ok(());
    }
    trash::delete_all(&existing).map_err(|e| e.to_string())
}

/// Read an image file and return it as a base64 data URL (so the webview can
/// show it without relying on the asset protocol).
#[tauri::command]
async fn read_image_data(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        _ => "image/png",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

/// Called by the frontend after the roll-up animation finishes: hide the
/// whole window so nothing is left on screen (no stray band, nothing to block
/// the desktop or the taskbar).
#[tauri::command]
fn rollup_done() {
    let dropped = STATE.lock().unwrap().dropped;
    if !dropped {
        with_window(|w| {
            let _ = w.hide();
        });
    }
}

#[tauri::command]
fn set_modal(on: bool) {
    MODAL.store(on, Ordering::Relaxed);
}

/// Once the user interacts with the line (clicks a card, a pill, a filter),
/// stop auto-rolling-up so a hover-summoned line behaves like a pinned one.
#[tauri::command]
fn set_sticky(on: bool) {
    let mut st = STATE.lock().unwrap();
    if st.dropped {
        st.sticky = on;
    }
}

static PIN_PATHS: Lazy<Mutex<HashMap<String, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
fn get_pin_path(label: String) -> String {
    PIN_PATHS
        .lock()
        .unwrap()
        .get(&label)
        .cloned()
        .unwrap_or_default()
}

/// Open a floating, draggable, always-on-top window showing one image —
/// "pinned to the desktop". The image path is handed over by window label
/// (via get_pin_path), never through the URL, so long/Unicode paths are safe.
#[tauri::command]
async fn pin_image(app: AppHandle, path: String, w: Option<u32>, h: Option<u32>) -> Result<(), String> {
    let label = format!("pin{}", now_ms());
    PIN_PATHS
        .lock()
        .unwrap()
        .insert(label.clone(), path.clone());
    let url = "pin.html".to_string();

    let mut iw = w.unwrap_or(480) as f64;
    let mut ih = h.unwrap_or(360) as f64;
    let (maxw, maxh) = (900.0_f64, 680.0_f64);
    if iw > maxw {
        ih = ih * maxw / iw;
        iw = maxw;
    }
    if ih > maxh {
        iw = iw * maxh / ih;
        ih = maxh;
    }

    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App(url.into()))
        .title("ClipLine")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(true)
        .skip_taskbar(true)
        .inner_size(iw.max(180.0), ih.max(140.0) + 30.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Create (or focus) the Settings window. Must NOT be called from a
/// synchronous command handler: on Windows that deadlocks the main thread.
fn create_settings_window(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        app,
        "settings",
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("ClipLine 设置")
    .inner_size(580.0, 640.0)
    .min_inner_size(440.0, 420.0)
    .resizable(true)
    .center()
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn open_settings(app: AppHandle) -> Result<(), String> {
    create_settings_window(&app)
}

#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let mut b = app.dialog().file();
    if let Some(w) = app.get_webview_window("settings") {
        b = b.set_parent(&w);
    }
    b.blocking_pick_folder()
        .and_then(|p| p.into_path().ok())
        .map(|pb| pb.to_string_lossy().to_string())
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

static WATCH_SEQ: AtomicU64 = AtomicU64::new(0);
static WATCH_SEEN: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));
static WATCH_INIT: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));

/// Poll the user's watched folders; when a new file appears, hang it as a
/// file card. Existing files present when a folder is first seen are seeded,
/// not emitted, so only genuinely new files hang.
fn start_folder_watch() {
    std::thread::spawn(|| loop {
        std::thread::sleep(std::time::Duration::from_millis(1500));
        if native::paused() {
            continue;
        }
        let folders = SETTINGS.lock().unwrap().watch_folders.clone();
        for folder in folders {
            let first_time = !WATCH_INIT.lock().unwrap().contains(&folder);
            let entries = match std::fs::read_dir(&folder) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let ps = path.to_string_lossy().to_string();
                if WATCH_SEEN.lock().unwrap().contains(&ps) {
                    continue;
                }
                if first_time {
                    // Seed everything already present without hanging it.
                    WATCH_SEEN.lock().unwrap().insert(ps);
                    continue;
                }
                // Only hang a file once it has settled (≥2s since last write),
                // so a file still being downloaded/written isn't caught early.
                let stable = entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|mt| mt.elapsed().ok())
                    .map(|e| e.as_secs() >= 2)
                    .unwrap_or(true);
                if !stable {
                    continue; // re-check next cycle
                }
                WATCH_SEEN.lock().unwrap().insert(ps.clone());
                if let Some(app) = APP.get() {
                    let item = serde_json::json!({
                        "id": format!("w{}-{}", now_ms(), WATCH_SEQ.fetch_add(1, Ordering::Relaxed)),
                        "kind": "file",
                        "text": ps,
                        "files": [ps],
                        "ts": now_ms() as i64,
                    });
                    let _ = app.emit("clip:add", item);
                }
            }
            WATCH_INIT.lock().unwrap().insert(folder);
        }
    });
}

// ---------------------------------------------------------------------------
// Geometry + hover thread
// ---------------------------------------------------------------------------

fn setup_geometry(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("line") {
        if let Ok(Some(mon)) = w.current_monitor() {
            let pos = mon.position();
            let size = mon.size();
            let scale = mon.scale_factor();
            let clip_h = (CLIP_H * scale) as i32;
            let notes_h = (NOTES_H * scale) as i32;
            {
                let mut st = STATE.lock().unwrap();
                st.top = pos.y;
                st.left = pos.x;
                st.width = size.width as i32;
                st.clip_h = clip_h;
                st.notes_h = notes_h;
            }
            let _ = w.set_size(PhysicalSize::new(size.width, notes_h.max(1) as u32));
            let _ = w.set_position(PhysicalPosition::new(pos.x, pos.y));
        }
        // Start hidden; the window is only shown while the line is down.
        let _ = w.set_ignore_cursor_events(false);
        let _ = w.hide();
    }
}

fn flip_active(flip_mod: &str) -> bool {
    match flip_mod {
        "shift" => native::shift_down(),
        "ctrl" => native::ctrl_down(),
        "alt" => native::alt_down(),
        _ => false,
    }
}

fn start_cursor_thread() {
    std::thread::spawn(|| {
        let mut cand: Option<(Deck, std::time::Instant)> = None;
        let mut catch_since: Option<std::time::Instant> = None;
        let mut origin: Option<(i32, i32, bool)> = None;
        let mut released_at: Option<std::time::Instant> = None;
        let mut last_miss: Option<std::time::Instant> = None;
        let mut last_inside = false;
        let mut hover_on = false;
        let mut fallback_done = false;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(40));
            let Some((x, y)) = native::cursor_pos() else {
                std::thread::sleep(std::time::Duration::from_millis(400));
                continue;
            };
            let (dropped, sticky, deck, top, left, width, clip_h, notes_h, hover, dwell, flip, hang) = {
                let st = STATE.lock().unwrap();
                (
                    st.dropped,
                    st.sticky,
                    st.deck,
                    st.top,
                    st.left,
                    st.width,
                    st.clip_h,
                    st.notes_h,
                    st.hover_enabled,
                    st.dwell_ms,
                    st.flip_mod.clone(),
                    st.drop_to_hang,
                )
            };
            // A drag (left button held, started well below the top edge and
            // travelled) that reaches the top band: drop the line to catch it.
            if !dropped && hang && x >= left && x < left + width && y <= top + 2 {
                if let Some((dx, dy, age)) = winx::left_drag_info() {
                    let travelled = (dx - x).abs() + (dy - y).abs();
                    // Only drags that began in Explorer / on the desktop.
                    let from_explorer = match origin {
                        Some((ox, oy, v)) if ox == dx && oy == dy => v,
                        _ => {
                            let v = winx::point_is_explorer_xy(dx, dy);
                            origin = Some((dx, dy, v));
                            v
                        }
                    };
                    if from_explorer && dy > top + 60 && travelled > 40 && age > 150 {
                        match catch_since {
                            Some(t) if t.elapsed().as_millis() >= 120 => {
                                catch_since = None;
                                cand = None;
                                fallback_done = false;
                                hover_on = false;
                                last_inside = false;
                                released_at = None;
                                drop_line_ex(Deck::Clipboard, false, false);
                                continue;
                            }
                            Some(_) => {}
                            None => catch_since = Some(std::time::Instant::now()),
                        }
                        continue; // don't let the hover-dwell logic fire meanwhile
                    }
                }
            }
            catch_since = None;
            // Diagnostics: the pointer is pressed against the top edge but no
            // catch happened — say why (at most once a second).
            if !dropped && hang && x >= left && x < left + width && y <= top + 2
                && last_miss.map(|t| t.elapsed().as_millis() > 1000).unwrap_or(true)
            {
                last_miss = Some(std::time::Instant::now());
                match winx::left_drag_info() {
                    None => winx::dlog(&format!("top edge at ({x},{y}): left button not seen as held")),
                    Some((dx, dy, age)) => winx::dlog(&format!(
                        "top edge at ({x},{y}): no catch yet — drag from ({dx},{dy}) explorer={} age={age}ms",
                        winx::point_is_explorer_xy(dx, dy)
                    )),
                }
            }
            if !dropped {
                if hover && y <= top + 1 && x >= left && x < left + width {
                    let left_half = x < left + width / 2;
                    let target = if left_half ^ flip_active(&flip) {
                        Deck::Clipboard
                    } else {
                        Deck::Notes
                    };
                    match cand {
                        Some((d, since)) if d == target => {
                            if since.elapsed().as_millis() as u64 >= dwell {
                                cand = None;
                                drop_line(target, false);
                            }
                        }
                        _ => cand = Some((target, std::time::Instant::now())),
                    }
                } else {
                    cand = None;
                }
            } else {
                cand = None;
                // Caught a drag: stay down while it is in the air. Once the
                // button is released without a drop landing on us (a drop
                // clears CATCHING), go back up shortly after.
                if CATCHING.load(Ordering::Relaxed) {
                    let h = if deck == Deck::Notes { notes_h } else { clip_h };
                    let inside = x >= left && x < left + width && y >= top && y < top + notes_h.max(h);
                    if winx::left_drag_info().is_some() {
                        released_at = None;
                        last_inside = inside;
                        // Highlight the zone from the cursor position, in case
                        // the OLE drop target is not being fed.
                        if inside != hover_on {
                            hover_on = inside;
                            emit_files(if inside { "over" } else { "leave" }, Vec::new());
                        }
                    } else {
                        let t = *released_at.get_or_insert_with(std::time::Instant::now);
                        let ms = t.elapsed().as_millis();
                        // Released over the line but no OLE drop arrived:
                        // fetch the dragged (= selected) items from Explorer.
                        if ms >= 150 && last_inside && !fallback_done {
                            fallback_done = true;
                            if let Some((ox, oy, _)) = origin {
                                winx::dlog("catch: released over the line without an OLE drop; asking Explorer");
                                std::thread::spawn(move || {
                                    // Prefer the exact list Windows reported on drag-enter.
                                    let mut paths = winx::take_enter_paths();
                                    if paths.is_empty() {
                                        paths = winx::explorer_selection_at(ox, oy);
                                    } else {
                                        winx::dlog(&format!("catch: using {} path(s) from drag-enter", paths.len()));
                                    }
                                    if CATCHING.load(Ordering::Relaxed) && !paths.is_empty() {
                                        CATCHING.store(false, Ordering::Relaxed);
                                        emit_files("drop", paths);
                                    }
                                });
                            }
                        }
                        if ms > 1500 {
                            released_at = None;
                            winx::dlog("catch: released without a drop");
                            rollup();
                        }
                    }
                    continue;
                }
                fallback_done = false;
                hover_on = false;
                last_inside = false;
                released_at = None;
                if !sticky && !MODAL.load(Ordering::Relaxed) {
                    let h = if deck == Deck::Notes { notes_h } else { clip_h };
                    if y > top + h + 12 {
                        rollup();
                    }
                }
            }
        }
    });
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let item_clip = MenuItemBuilder::with_id("clip", "剪贴板绳 / Clipboard").build(app)?;
    let item_notes = MenuItemBuilder::with_id("notes", "便签绳 / Notes").build(app)?;
    let item_new = MenuItemBuilder::with_id("newnote", "新建便签 / New note").build(app)?;
    let item_mon = MenuItemBuilder::with_id("togglemon", "暂停 / 恢复监控").build(app)?;
    let item_set = MenuItemBuilder::with_id("settings", "设置 / Settings").build(app)?;
    let item_restart = MenuItemBuilder::with_id("restart", "重启 / Restart").build(app)?;
    let item_quit = MenuItemBuilder::with_id("quit", "退出 / Quit").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&item_clip, &item_notes])
        .separator()
        .items(&[&item_new, &item_mon, &item_set])
        .separator()
        .items(&[&item_restart, &item_quit])
        .build()?;

    let mut builder = TrayIconBuilder::with_id("tray")
        .tooltip("ClipLine 晾衣绳")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "clip" => toggle_deck(Deck::Clipboard),
            "notes" => toggle_deck(Deck::Notes),
            "newnote" => {
                drop_line(Deck::Notes, true);
                let _ = app.emit("ui:newnote", ());
            }
            "togglemon" => {
                let active = !native::toggle_paused();
                let _ = app.emit("ui:monitor", active);
            }
            "settings" => {
                let a = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = create_settings_window(&a);
                });
            }
            "restart" => app.restart(),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|_tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            {
                toggle_deck(Deck::Clipboard);
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::DragDrop(d) = e {
                winx::dlog(&format!("[rust] window {} drag event: {:?}", w.label(), d));
            }
        })
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|_app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let is_clip = CUR_CLIP.lock().unwrap().as_ref() == Some(shortcut);
                        let is_notes = CUR_NOTES.lock().unwrap().as_ref() == Some(shortcut);
                        if is_clip {
                            toggle_deck(Deck::Clipboard);
                        } else if is_notes {
                            toggle_deck(Deck::Notes);
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            set_passthrough,
            drag_text,
            drag_files,
            dbg_log,
            rollup_now,
            toggle,
            copy_text,
            copy_image,
            copy_files,
            paste_text,
            toggle_monitor,
            monitor_active,
            open_url,
            open_path,
            reveal_path,
            save_to_desktop,
            get_settings,
            update_settings,
            save_state,
            load_state,
            delete_file,
            trash_files,
            read_image_data,
            rollup_done,
            set_modal,
            set_sticky,
            pin_image,
            get_pin_path,
            pick_folder,
            open_settings,
            quit
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let _ = APP.set(handle.clone());

            if let Ok(dir) = app.path().app_data_dir() {
                let images = dir.join("images");
                let _ = std::fs::create_dir_all(&images);
                native::set_images_dir(images);
            }

            // Load settings and apply before anything else.
            let settings = load_settings(&handle);
            apply_settings_to_state(&settings);
            *SETTINGS.lock().unwrap() = settings.clone();

            setup_geometry(&handle);
            build_tray(&handle)?;

            if apply_hotkeys(&handle, &settings.hotkey_clip, &settings.hotkey_notes).is_err() {
                // Fall back to defaults if the saved hotkeys fail to register.
                let d = Settings::default();
                let _ = apply_hotkeys(&handle, &d.hotkey_clip, &d.hotkey_notes);
            }

            native::start_clipboard_watch(handle.clone());
            {
                let h = handle.clone();
                winx::set_drop_callback(Box::new(move |kind, paths| {
                    if kind == "drop" {
                        CATCHING.store(false, Ordering::Relaxed);
                    }
                    let _ = h.emit(&format!("files:{kind}"), paths);
                }));
            }
            winx::start_mouse_hook();
            start_cursor_thread();
            start_folder_watch();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ClipLine");
}
