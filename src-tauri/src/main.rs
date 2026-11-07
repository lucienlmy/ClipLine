#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod display;
mod native;
mod shot;
mod update;
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

const CLIP_H: f64 = 306.0;
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
    history_days: u32, // finished notes kept in the basket; 0 = forever
    lang: String, // auto (follow Windows) | zh | en
    autostart: bool,
    theme: String, // soft | silver | linen | porcelain | graphite
    watch_folders: Vec<String>,
    font_family: String,          // default | yahei | dengxian | simsun | kaiti | fangsong | source
    font_size: String,            // small | medium | large
    reminder_presets: Vec<String>, // ids shown in the reminder popover
    drop_to_hang: bool,            // dragging files to the top edge drops the line
    text_drag_ext: String,         // txt | md — file type when a text card is dragged to Explorer
    accent: String,                // terra | mint | sky | navy | leica
    move_mod: String,              // shift | alt | ctrl — held when a card drag starts = move
    fold_by_date: bool,            // fold older clips into date stacks
    hotkey_shot: String,           // region screenshot ("" = off)
    tray_icon: String,             // a terracotta | b deep-sea blue | c leica red | d sky | e mint
    update_mode: String,           // auto | notify | off — background check against GitHub Releases
    skipped_version: String,       // "Skip this version" — not offered again by the background check
    line_display: String,          // cursor | primary | a monitor device name (\\.\DISPLAY2)
    seen_version: String,          // last version whose "updated to vX" card was shown ("" = before v1.7.0)
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
            history_days: 30,
            // New installs follow Windows; a saved settings.json keeps its value.
            lang: "auto".into(),
            autostart: false,
            theme: "soft".into(),
            watch_folders: Vec::new(),
            font_family: "default".into(),
            font_size: "medium".into(),
            reminder_presets: vec!["m15".into(), "h1".into(), "tomorrow".into()],
            drop_to_hang: true,
            text_drag_ext: "txt".into(),
            accent: "terra".into(),
            move_mod: "shift".into(),
            fold_by_date: true,
            hotkey_shot: "Ctrl+Alt+S".into(),
            tray_icon: "a".into(),
            update_mode: "notify".into(),
            skipped_version: String::new(),
            line_display: "cursor".into(),
            seen_version: String::new(),
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
    line_display: String,
    mon: String, // device name of the monitor the line is laid out on
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
            line_display: "cursor".into(),
            mon: String::new(),
        }
    }
}

static APP: OnceCell<AppHandle> = OnceCell::new();
static STATE: Lazy<Mutex<LineState>> = Lazy::new(|| Mutex::new(LineState::default()));
static SETTINGS: Lazy<Mutex<Settings>> = Lazy::new(|| Mutex::new(Settings::default()));
static CUR_CLIP: Lazy<Mutex<Option<Shortcut>>> = Lazy::new(|| Mutex::new(None));
static CUR_NOTES: Lazy<Mutex<Option<Shortcut>>> = Lazy::new(|| Mutex::new(None));
static CUR_SHOT: Lazy<Mutex<Option<Shortcut>>> = Lazy::new(|| Mutex::new(None));
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

fn apply_hotkeys(app: &AppHandle, clip: &str, notes: &str, shot_key: &str) -> Result<(), String> {
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
    // Screenshot hotkey is optional and must never block the other two.
    *CUR_SHOT.lock().unwrap() = None;
    if !shot_key.trim().is_empty() {
        match parse_shortcut(shot_key) {
            Some(scs) => match gs.register(scs.clone()) {
                Ok(_) => *CUR_SHOT.lock().unwrap() = Some(scs),
                Err(e) => winx::dlog(&format!("screenshot hotkey {shot_key} unavailable: {e}")),
            },
            None => winx::dlog(&format!("screenshot hotkey {shot_key} not recognised")),
        }
    }
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
            if let Ok(mut parsed) = serde_json::from_str::<Settings>(&s) {
                // Saved before "follow system" existed without a language:
                // that user has been seeing Chinese — keep it.
                let has_lang = serde_json::from_str::<serde_json::Value>(&s)
                    .ok()
                    .map(|v| v.get("lang").is_some())
                    .unwrap_or(true);
                if !has_lang {
                    parsed.lang = "zh".into();
                }
                return parsed;
            }
        }
        // No settings yet but the app has been used (cards saved): an
        // existing user on the old default — keep Chinese. Only a truly new
        // install follows the system language.
        if let Some(dir) = p.parent() {
            if dir.join("data.json").exists() {
                let mut d = Settings::default();
                d.lang = "zh".into();
                return d;
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
    st.line_display = s.line_display.clone();
}

// ---------------------------------------------------------------------------
// Which monitor
// ---------------------------------------------------------------------------

/// The monitor the line should drop on, per the "line appears on" setting.
/// `at` = a cursor position to use instead of polling it. A chosen monitor
/// that is not plugged in falls back to the primary one.
fn target_monitor(at: Option<(i32, i32)>) -> Option<display::Mon> {
    let mode = STATE.lock().unwrap().line_display.clone();
    match mode.as_str() {
        "primary" => display::primary(),
        "cursor" | "" => at
            .or_else(native::cursor_pos)
            .and_then(|(x, y)| display::at(x, y))
            .or_else(display::primary),
        name => display::by_name(name).or_else(display::primary),
    }
}

/// Lay the line state out on `m` (physical pixels, that monitor's scale).
/// Returns the window rectangle to apply.
fn fit_line_to(m: &display::Mon) -> (i32, i32, u32, u32) {
    let clip_h = (CLIP_H * m.scale) as i32;
    let notes_h = (NOTES_H * m.scale) as i32;
    let mut st = STATE.lock().unwrap();
    st.top = m.y;
    st.left = m.x;
    st.width = m.w;
    st.clip_h = clip_h;
    st.notes_h = notes_h;
    st.mon = m.name.clone();
    (m.x, m.y, m.w.max(1) as u32, notes_h.max(1) as u32)
}

/// Move + size a window onto another monitor. Crossing into a monitor with
/// a different scale makes Windows resize it on the way (WM_DPICHANGED), so
/// position first, then set the size, then pin the position again.
fn place_window(w: &tauri::WebviewWindow, x: i32, y: i32, pw: u32, ph: u32) {
    let _ = w.set_position(PhysicalPosition::new(x, y));
    let _ = w.set_size(PhysicalSize::new(pw, ph));
    let _ = w.set_position(PhysicalPosition::new(x, y));
}

/// Where a reminder / update card goes: the line's monitor while it is down,
/// otherwise the monitor the line would drop on now.
fn card_monitor() -> Option<display::Mon> {
    let (dropped, mon) = {
        let st = STATE.lock().unwrap();
        (st.dropped, st.mon.clone())
    };
    if dropped && !mon.is_empty() {
        if let Some(m) = display::by_name(&mon) {
            return Some(m);
        }
    }
    target_monitor(None)
}

/// Bottom-right corner of that monitor's work area; `stack` = how many cards
/// are already showing there (each next one goes above).
fn place_corner_card(win: &tauri::WebviewWindow, lw: f64, lh: f64, stack: f64) {
    let area = card_monitor().map(|m| (m.wx, m.wy, m.ww, m.wh, m.scale)).or_else(|| {
        win.primary_monitor().ok().flatten().map(|mon| {
            let wa = mon.work_area();
            (wa.position.x, wa.position.y, wa.size.width as i32, wa.size.height as i32, mon.scale_factor())
        })
    });
    if let Some((ax, ay, aw, ah, sf)) = area {
        let (pw, ph) = ((lw * sf) as i32, (lh * sf) as i32);
        let margin = (14.0 * sf) as i32;
        let x = ax + aw - pw - margin;
        let y = (ay + ah - ph - margin - (stack * (lh + 10.0) * sf) as i32).max(ay);
        place_window(win, x, y, pw.max(1) as u32, ph.max(1) as u32);
    }
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
    // Lay the line out on the right monitor before it shows (the hover thread
    // reads the new geometry right away).
    let rect = target_monitor(None).map(|m| fit_line_to(&m));
    {
        let mut st = STATE.lock().unwrap();
        st.dropped = true;
        st.deck = deck;
        st.sticky = sticky;
    }
    with_window(move |w| {
        if let Some((x, y, pw, ph)) = rect {
            place_window(&w, x, y, pw, ph);
        }
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

/// For each path: [exists, is_dir].
#[tauri::command]
fn path_info(paths: Vec<String>) -> Vec<[bool; 2]> {
    paths
        .iter()
        .map(|p| {
            let m = std::fs::metadata(p);
            [m.is_ok(), m.map(|m| m.is_dir()).unwrap_or(false)]
        })
        .collect()
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
fn open_data_dir(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let _ = std::fs::create_dir_all(&dir);
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Tray icon in the chosen colour (the exe icon itself is fixed at build time).
fn tray_icon_image(id: &str) -> Option<tauri::image::Image<'static>> {
    let bytes: &'static [u8] = match id {
        "b" => include_bytes!("../icons/tray/tray-b.png"),
        "c" => include_bytes!("../icons/tray/tray-c.png"),
        "d" => include_bytes!("../icons/tray/tray-d.png"),
        "e" => include_bytes!("../icons/tray/tray-e.png"),
        _ => include_bytes!("../icons/tray/tray-a.png"),
    };
    tauri::image::Image::from_bytes(bytes).ok()
}

fn apply_tray_icon(app: &AppHandle, id: &str) {
    if let (Some(tray), Some(img)) = (app.tray_by_id("tray"), tray_icon_image(id)) {
        let _ = tray.set_icon(Some(img));
    }
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

/// Settings as JSON for the pages, plus `sys_lang` (what "follow system"
/// resolves to). Unknown fields sent back on save are ignored.
fn settings_json(s: &Settings) -> String {
    let mut v = serde_json::to_value(s).unwrap_or(serde_json::Value::Null);
    if let Some(o) = v.as_object_mut() {
        let sys = if display::system_is_chinese() { "zh" } else { "en" };
        o.insert("sys_lang".into(), serde_json::Value::from(sys));
    }
    v.to_string()
}

#[tauri::command]
fn get_settings() -> String {
    let s = SETTINGS.lock().unwrap().clone();
    settings_json(&s)
}

/// Monitors for the "line appears on" picker.
#[tauri::command]
fn list_monitors() -> Vec<display::Mon> {
    display::list()
}

#[tauri::command]
fn update_settings(app: AppHandle, data: String) -> Result<String, String> {
    let mut s: Settings = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    // Only the update card sets this; a settings window opened earlier must
    // not overwrite it with a stale copy.
    s.skipped_version = SETTINGS.lock().unwrap().skipped_version.clone();
    s.seen_version = SETTINGS.lock().unwrap().seen_version.clone();
    // Persist FIRST so a hotkey/autostart hiccup can never lose the user's
    // settings (theme, watched folders, etc.).
    save_settings(&app, &s)?;
    *SETTINGS.lock().unwrap() = s.clone();
    apply_settings_to_state(&s);
    // Side effects are best-effort and must not fail the save.
    let _ = apply_hotkeys(&app, &s.hotkey_clip, &s.hotkey_notes, &s.hotkey_shot);
    apply_tray_icon(&app, &s.tray_icon);
    apply_tray_lang(&app, &s);
    let _ = if s.autostart {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    };
    Ok(settings_json(&s))
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

// ---------------------------------------------------------------------------
// Screenshot → selection overlay → card; annotation window; OCR
// ---------------------------------------------------------------------------

static SHOT: Lazy<Mutex<Option<shot::Capture>>> = Lazy::new(|| Mutex::new(None));
/// Lock the capture; a panic elsewhere must never wedge the overlay.
fn shot_lock() -> std::sync::MutexGuard<'static, Option<shot::Capture>> {
    SHOT.lock().unwrap_or_else(|e| e.into_inner())
}
/// A screenshot overlay is open: no hover-drop / drag-catch meanwhile.
static SHOOTING: AtomicBool = AtomicBool::new(false);

/// One overlay window per monitor (label `shot-N`) → that monitor's part of
/// the capture, in capture-image pixels `[x, y, w, h]`. A single window
/// spanning several displays had to be recomposited across them on every
/// mouse move — on a laptop with an external screen (another GPU) that
/// stalled the whole desktop, pointer included.
static SHOT_MONS: Lazy<Mutex<HashMap<String, [i32; 4]>>> = Lazy::new(|| Mutex::new(HashMap::new()));

fn is_shot_label(l: &str) -> bool {
    l.starts_with("shot-")
}

fn shot_windows(app: &AppHandle) -> Vec<tauri::WebviewWindow> {
    app.webview_windows().into_iter().filter(|(l, _)| is_shot_label(l)).map(|(_, w)| w).collect()
}

/// Close every overlay window and forget the capture.
fn close_shot(app: &AppHandle) {
    *shot_lock() = None;
    SHOOTING.store(false, Ordering::Relaxed);
    SHOT_MONS.lock().unwrap().clear();
    for w in shot_windows(app) {
        let _ = w.close();
    }
}

fn shot_region(label: &str) -> Option<[i32; 4]> {
    SHOT_MONS.lock().unwrap().get(label).copied()
}

/// Hide the line, freeze the desktop, open the selection overlays.
#[tauri::command]
async fn start_shot(app: AppHandle) -> Result<(), String> {
    if let Some(w) = shot_windows(&app).into_iter().next() {
        let _ = w.set_focus();
        return Ok(());
    }
    SHOOTING.store(true, Ordering::Relaxed);
    rollup();
    // let the line and any menu finish disappearing
    tokio_sleep(280).await;
    let cap = match tauri::async_runtime::spawn_blocking(shot::capture_virtual_screen).await {
        Ok(Ok(c)) => c,
        Ok(Err(e)) => { SHOOTING.store(false, Ordering::Relaxed); return Err(e); }
        Err(e) => { SHOOTING.store(false, Ordering::Relaxed); return Err(e.to_string()); }
    };
    let (cx, cy, cw, ch) = (cap.x, cap.y, cap.img.width() as i32, cap.img.height() as i32);
    *shot_lock() = Some(cap);
    // each monitor's rectangle inside the capture (clipped, just in case)
    let mut regions: Vec<(i32, i32, [i32; 4])> = Vec::new();
    for m in display::list() {
        let (x0, y0) = ((m.x - cx).max(0), (m.y - cy).max(0));
        let (x1, y1) = ((m.x - cx + m.w).min(cw), (m.y - cy + m.h).min(ch));
        if x1 - x0 >= 8 && y1 - y0 >= 8 {
            regions.push((x0 + cx, y0 + cy, [x0, y0, x1 - x0, y1 - y0]));
        }
    }
    if regions.is_empty() {
        regions.push((cx, cy, [0, 0, cw, ch]));
    }
    let cursor = native::cursor_pos();
    let mut focus: Option<tauri::WebviewWindow> = None;
    for (i, (sx, sy, r)) in regions.iter().enumerate() {
        let label = format!("shot-{i}");
        SHOT_MONS.lock().unwrap().insert(label.clone(), *r);
        let win = match tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("shot.html".into()))
            .title("ClipLine 截图")
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .shadow(false)
            .build()
        {
            Ok(w) => w,
            Err(e) => { close_shot(&app); return Err(e.to_string()); }
        };
        place_window(&win, *sx, *sy, r[2] as u32, r[3] as u32);
        let _ = win.show();
        let under = cursor.map_or(i == 0, |(px, py)| px >= *sx && px < sx + r[2] && py >= *sy && py < sy + r[3]);
        if under || focus.is_none() {
            focus = Some(win);
        }
    }
    if let Some(w) = focus {
        let _ = w.set_focus();
    }
    Ok(())
}

async fn tokio_sleep(ms: u64) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(std::time::Duration::from_millis(ms))).await;
}

/// This overlay window's part of the capture, in capture-image pixels.
#[tauri::command]
async fn get_shot_region(window: tauri::WebviewWindow) -> Option<[i32; 4]> {
    shot_region(window.label())
}

/// The overlay window under the pointer takes the keyboard.
#[tauri::command]
async fn shot_focus(window: tauri::WebviewWindow) {
    let _ = window.set_focus();
}

/// This monitor's frozen desktop for the overlay background (JPEG data URL — fast to encode).
#[tauri::command]
async fn get_shot_image(window: tauri::WebviewWindow) -> Result<String, String> {
    let r = shot_region(window.label()).ok_or("没有截图")?;
    tauri::async_runtime::spawn_blocking(move || {
        use base64::Engine;
        // copy the pixels and let go of the lock before the slow encode
        let img = shot_lock()
            .as_ref()
            .map(|c| image::imageops::crop_imm(&c.img, r[0] as u32, r[1] as u32, r[2] as u32, r[3] as u32).to_image())
            .ok_or("没有截图")?;
        let rgb = image::DynamicImage::ImageRgba8(img).to_rgb8();
        let mut buf = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 88)
            .encode_image(&rgb)
            .map_err(|e| e.to_string())?;
        Ok::<String, String>(format!(
            "data:image/jpeg;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&buf)
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Where to snap in this overlay, in pixels of its own background image:
/// the windows that were visible (front first), then the monitor itself.
#[tauri::command]
async fn get_shot_windows(window: tauri::WebviewWindow) -> Vec<[i32; 4]> {
    // async: runs off the main thread, so waiting for the capture lock (held
    // while a background JPEG is encoded) can never freeze the overlay.
    let Some([rx, ry, rw, rh]) = shot_region(window.label()) else { return Vec::new() };
    let (ox, oy, wins) = {
        let guard = shot_lock();
        let Some(cap) = guard.as_ref() else { return Vec::new() };
        (cap.x + rx, cap.y + ry, cap.wins.clone())
    };
    let clip = |r: [i32; 4]| -> Option<[i32; 4]> {
        let (x0, y0) = ((r[0] - ox).max(0), (r[1] - oy).max(0));
        let (x1, y1) = ((r[0] - ox + r[2]).min(rw), (r[1] - oy + r[3]).min(rh));
        (x1 - x0 >= 8 && y1 - y0 >= 8).then_some([x0, y0, x1 - x0, y1 - y0])
    };
    let mut out: Vec<[i32; 4]> = wins.iter().filter_map(|r| clip(*r)).collect();
    out.push([0, 0, rw, rh]);
    winx::dlog(&format!("shot {}: {} snap targets, region ({rx},{ry}) {rw}x{rh}", window.label(), out.len()));
    out
}

/// Diagnostics from the screenshot overlay (only written when
/// clipline-debug.log exists next to the exe).
#[tauri::command]
async fn shot_log(window: tauri::WebviewWindow, msg: String) {
    winx::dlog(&format!("{}: {msg}", window.label()));
}

/// Exact pixels around (x, y) for the colour picker's loupe: a square of
/// side 2r+1, row by row, RGB triplets (outside the screen = 0).
#[tauri::command]
async fn shot_patch(x: i32, y: i32, r: i32) -> Vec<u8> {
    let r = r.clamp(1, 12);
    let guard = shot_lock();
    let mut out = Vec::with_capacity(((2 * r + 1) * (2 * r + 1) * 3) as usize);
    let Some(cap) = guard.as_ref() else { return out };
    let (iw, ih) = (cap.img.width() as i32, cap.img.height() as i32);
    for yy in y - r..=y + r {
        for xx in x - r..=x + r {
            if xx >= 0 && yy >= 0 && xx < iw && yy < ih {
                let p = cap.img.get_pixel(xx as u32, yy as u32);
                out.extend_from_slice(&[p[0], p[1], p[2]]);
            } else {
                out.extend_from_slice(&[0, 0, 0]);
            }
        }
    }
    out
}

/// Colour picked in the overlay: copy `#RRGGBB` and hang it as a colour card.
#[tauri::command]
async fn finish_color(app: AppHandle, hex: String) -> Result<(), String> {
    close_shot(&app);
    let item = serde_json::json!({ "id": format!("c{}", now_ms()), "kind": "text", "text": hex, "ts": now_ms() as u64 });
    native::set_text(&hex);
    let _ = app.emit("clip:add", item);
    drop_line_ex(Deck::Clipboard, false, true);
    Ok(())
}

#[tauri::command]
async fn cancel_shot(app: AppHandle) -> Result<(), String> {
    close_shot(&app);
    Ok(())
}

/// Crop the selection (image pixels), hang it as a card, copy it, then do
/// the follow-up the user picked: hang | annotate | ocr | pin.
#[tauri::command]
async fn finish_shot(app: AppHandle, x: u32, y: u32, w: u32, h: u32, action: String) -> Result<(), String> {
    // take the capture BEFORE closing the overlays (closing clears it)
    let cap = shot_lock().take();
    close_shot(&app);
    let cap = cap.ok_or("没有截图")?;
    let (iw, ih) = cap.img.dimensions();
    let x = x.min(iw.saturating_sub(1));
    let y = y.min(ih.saturating_sub(1));
    let w = w.max(1).min(iw - x);
    let h = h.max(1).min(ih - y);
    let crop = image::imageops::crop_imm(&cap.img, x, y, w, h).to_image();
    drop(cap);
    let item = tauri::async_runtime::spawn_blocking(move || native::save_rgba_card(crop))
        .await
        .map_err(|e| e.to_string())?
        .ok_or("保存截图失败")?;
    let path = item.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let _ = app.emit("clip:add", item.clone());
    {
        let p = path.clone();
        std::thread::spawn(move || native::set_image_from_file(&p));
    }
    match action.as_str() {
        "pin" => pin_image(app.clone(), path, Some(w), Some(h)).await?,
        "annotate" => annotate_image(app.clone(), path, Some(w), Some(h)).await?,
        "ocr" => ocr_to_line(app.clone(), path).await?,
        _ => drop_line_ex(Deck::Clipboard, false, true),
    }
    Ok(())
}

/// Annotation editor for an image (its own window).
#[tauri::command]
async fn annotate_image(app: AppHandle, path: String, w: Option<u32>, h: Option<u32>) -> Result<(), String> {
    rollup();
    let label = format!("ann{}", now_ms());
    PIN_PATHS.lock().unwrap().insert(label.clone(), path);
    let (mut iw, mut ih) = (w.unwrap_or(800) as f64, h.unwrap_or(600) as f64);
    let (maxw, maxh) = (1180.0_f64, 760.0_f64);
    if iw > maxw { ih = ih * maxw / iw; iw = maxw; }
    if ih > maxh { iw = iw * maxh / ih; ih = maxh; }
    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("annotate.html".into()))
        .title("标注 — ClipLine")
        .resizable(true)
        .always_on_top(true)
        .inner_size((iw + 40.0).max(680.0), (ih + 110.0).max(460.0))
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Save the annotated picture (PNG data URL) as a new card and copy it.
#[tauri::command]
async fn save_annotated(app: AppHandle, data: String) -> Result<(), String> {
    let item = tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value, String> {
        use base64::Engine;
        let b64 = data.split(',').nth(1).ok_or("数据无效")?;
        let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
        let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?.to_rgba8();
        native::save_rgba_card(img).ok_or_else(|| "保存失败".to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    let path = item.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let _ = app.emit("clip:add", item);
    std::thread::spawn(move || native::set_image_from_file(&path));
    Ok(())
}

/// OCR an image file; returns the text.
#[tauri::command]
async fn ocr_image(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || shot::ocr_file(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// OCR, then show the result on the line (as an editable text card).
#[tauri::command]
async fn ocr_to_line(app: AppHandle, path: String) -> Result<(), String> {
    let r = ocr_image(path).await;
    drop_line_ex(Deck::Clipboard, true, true);
    let _ = match r {
        Ok(text) => app.emit("ocr:done", serde_json::json!({ "text": text })),
        Err(e) => app.emit("ocr:done", serde_json::json!({ "error": e })),
    };
    Ok(())
}

// ---------------------------------------------------------------------------
// Reminder cards: a small always-on-top window per due reminder
// ---------------------------------------------------------------------------

static REMIND_DATA: Lazy<Mutex<HashMap<String, serde_json::Value>>> = Lazy::new(|| Mutex::new(HashMap::new()));

/// Pop up a reminder card (bottom-right, above the taskbar). `data` carries
/// the note id, title, body, colours and time text for remind.html.
#[tauri::command]
async fn show_reminder(app: AppHandle, data: serde_json::Value) -> Result<(), String> {
    let id = data.get("id").and_then(|v| v.as_str()).unwrap_or("x").to_string();
    let safe: String = id.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let label = format!("remind{safe}");
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.close();
    }
    REMIND_DATA.lock().unwrap().insert(label.clone(), data);
    let open = app
        .webview_windows()
        .keys()
        .filter(|k| k.starts_with("remind"))
        .count() as f64;
    let (lw, lh) = (340.0_f64, 216.0_f64);
    let win = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("remind.html".into()))
        .title("ClipLine 提醒")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .inner_size(lw, lh)
        .build()
        .map_err(|e| e.to_string())?;
    place_corner_card(&win, lw, lh, open);
    let _ = win.show();
    Ok(())
}

#[tauri::command]
fn get_reminder(label: String) -> serde_json::Value {
    REMIND_DATA.lock().unwrap().get(&label).cloned().unwrap_or(serde_json::Value::Null)
}

/// From a reminder card: ack | snooze | open. The main window updates the
/// note; "open" also drops the notes line.
#[tauri::command]
async fn reminder_action(app: AppHandle, label: String, id: String, action: String) -> Result<(), String> {
    REMIND_DATA.lock().unwrap().remove(&label);
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.close();
    }
    if action == "open" {
        drop_line(Deck::Notes, true);
    }
    let _ = app.emit("remind:action", serde_json::json!({ "id": id, "action": action }));
    Ok(())
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
    .inner_size(720.0, 540.0)
    .min_inner_size(600.0, 420.0)
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
    quit_app(&app);
}

/// Quit; in "auto" update mode a downloaded update is installed on the way
/// out (without relaunching).
fn quit_app(app: &AppHandle) {
    let auto = SETTINGS.lock().unwrap().update_mode == "auto";
    if auto && update::pending() {
        if let Err(e) = update::apply(false) {
            winx::dlog(&format!("[update] apply on quit failed: {e}"));
        }
    }
    app.exit(0);
}

// ---------------------------------------------------------------------------
// Updates (GitHub Releases). State lives in update.rs; every change is
// broadcast as `update:status` and rendered by update.html.
// ---------------------------------------------------------------------------

fn publish_status(s: &update::Status) {
    if let Some(app) = APP.get() {
        let _ = app.emit("update:status", s);
    }
}

#[tauri::command]
fn update_status() -> update::Status {
    update::status()
}

/// Check now (manual). Ignores "skip this version".
#[tauri::command]
async fn check_update() -> update::Status {
    run_check().await;
    update::status()
}

async fn run_check() -> Option<update::Info> {
    let ph = update::status().phase;
    if ph == "downloading" || ph == "installing" || ph == "checking" {
        return update::status().info;
    }
    publish_status(&update::set_status(|s| {
        s.phase = "checking".into();
        s.error.clear();
    }));
    let res = tauri::async_runtime::spawn_blocking(update::check)
        .await
        .unwrap_or_else(|e| Err(e.to_string()));
    let st = update::set_status(|s| match &res {
        Ok(info) => {
            s.phase = if !info.newer {
                "uptodate"
            } else if update::ready_for(&info.latest) {
                "ready"
            } else {
                "available"
            }
            .into();
            s.info = Some(info.clone());
            s.error.clear();
        }
        Err(e) => {
            s.phase = "error".into();
            s.error = e.clone();
        }
    });
    publish_status(&st);
    res.ok()
}

#[tauri::command]
async fn download_update() -> update::Status {
    run_download().await;
    update::status()
}

async fn run_download() -> bool {
    let Some(info) = update::status().info.filter(|i| i.newer) else {
        return false;
    };
    publish_status(&update::set_status(|s| {
        s.phase = "downloading".into();
        s.done = 0;
        s.total = info.size;
        s.error.clear();
    }));
    let last = std::sync::Arc::new(AtomicU64::new(0));
    let res = tauri::async_runtime::spawn_blocking(move || {
        update::fetch(
            &info,
            Box::new(move |done, total| {
                // throttle to ~10 updates/s
                let t = now_ms() as u64;
                if done < total && t.saturating_sub(last.load(Ordering::Relaxed)) < 100 {
                    return;
                }
                last.store(t, Ordering::Relaxed);
                publish_status(&update::set_status(|s| {
                    s.done = done;
                    if total > 0 {
                        s.total = total;
                    }
                }));
            }),
        )
    })
    .await
    .unwrap_or_else(|e| Err(e.to_string()));
    let ok = res.is_ok();
    publish_status(&update::set_status(|s| match res {
        Ok(_) => {
            s.phase = "ready".into();
            s.done = s.total;
        }
        Err(e) => {
            s.phase = "error".into();
            s.error = e;
        }
    }));
    ok
}

/// Install the downloaded update and relaunch.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    publish_status(&update::set_status(|s| s.phase = "installing".into()));
    match update::apply(true) {
        Ok(()) => {
            tokio_sleep(300).await;
            app.exit(0);
            Ok(())
        }
        Err(e) => {
            publish_status(&update::set_status(|s| {
                s.phase = "error".into();
                s.error = e.clone();
            }));
            Err(e)
        }
    }
}

#[tauri::command]
async fn skip_update(app: AppHandle, version: String) -> Result<(), String> {
    let s = {
        let mut g = SETTINGS.lock().unwrap();
        g.skipped_version = version;
        g.clone()
    };
    save_settings(&app, &s)?;
    if let Some(w) = app.get_webview_window("update") {
        let _ = w.close();
    }
    Ok(())
}

#[tauri::command]
fn open_release_page(app: AppHandle) -> Result<(), String> {
    let url = update::status()
        .info
        .map(|i| i.page)
        .unwrap_or_else(|| update::RELEASES_PAGE.to_string());
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Show the update card (bottom-right). `check`: also run a check now.
async fn show_update_window(app: &AppHandle, check: bool) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("update") {
        let _ = w.show();
        let _ = w.set_focus();
    } else {
        let (lw, lh) = (380.0_f64, 330.0_f64);
        let win = tauri::WebviewWindowBuilder::new(app, "update", tauri::WebviewUrl::App("update.html".into()))
            .title("ClipLine 更新")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .visible(false)
            .inner_size(lw, lh)
            .build()
            .map_err(|e| e.to_string())?;
        place_corner_card(&win, lw, lh, 0.0);
        let _ = win.show();
    }
    if check {
        run_check().await;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Update history: CHANGELOG.md / CHANGELOG.en.md are compiled in (offline).
// After an update, the first start pops a one-off "updated to vX" card.
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_changelog(lang: String) -> &'static str {
    if lang == "en" {
        include_str!("../../CHANGELOG.en.md")
    } else {
        include_str!("../../CHANGELOG.md")
    }
}

/// Decide at startup whether this run is the first one after an update.
/// `existed`: settings or data were already there (not a fresh install).
/// Fresh installs and downgrades get no card; settings saved before v1.7.0
/// have no `seen_version`, which counts as an update.
fn note_version_seen(app: &AppHandle, existed: bool) -> bool {
    let cur = update::current();
    let seen = SETTINGS.lock().unwrap().seen_version.clone();
    if seen == cur {
        return false;
    }
    let show = existed && (seen.is_empty() || update::is_newer(cur, &seen));
    let s = {
        let mut g = SETTINGS.lock().unwrap();
        g.seen_version = cur.to_string();
        g.clone()
    };
    let _ = save_settings(app, &s);
    show
}

async fn show_news_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window("news").is_some() {
        return Ok(());
    }
    let (lw, lh) = (380.0_f64, 360.0_f64);
    let win = tauri::WebviewWindowBuilder::new(app, "news", tauri::WebviewUrl::App("news.html".into()))
        .title("ClipLine")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .inner_size(lw, lh)
        .build()
        .map_err(|e| e.to_string())?;
    place_corner_card(&win, lw, lh, 0.0);
    let _ = win.show();
    Ok(())
}

/// Page the Settings window should open at ("history"); taken once.
static SETTINGS_GOTO: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new(String::new()));

#[tauri::command]
fn settings_goto() -> String {
    std::mem::take(&mut *SETTINGS_GOTO.lock().unwrap())
}

/// From the "updated" card: open Settings at the update history.
#[tauri::command]
async fn open_changelog(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window("settings").is_some() {
        let _ = app.emit_to("settings", "settings:goto", "history");
    } else {
        *SETTINGS_GOTO.lock().unwrap() = "history".into();
    }
    create_settings_window(&app)
}

/// From the tray / settings: open the card and check right away.
#[tauri::command]
async fn open_update_window(app: AppHandle) -> Result<(), String> {
    let ph = update::status().phase;
    let busy = ph == "downloading" || ph == "ready" || ph == "installing";
    show_update_window(&app, !busy).await
}

/// Background check: shortly after start, then every 6 hours. Pops the card
/// once per new version per run; in "auto" mode downloads first.
fn start_update_thread(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(25));
        let mut shown = String::new();
        loop {
            let (mode, skipped) = {
                let s = SETTINGS.lock().unwrap();
                (s.update_mode.clone(), s.skipped_version.clone())
            };
            if mode != "off" {
                let found = tauri::async_runtime::block_on(async move {
                    let info = run_check().await?;
                    if !info.newer || info.latest == skipped {
                        return None;
                    }
                    if mode == "auto" && !run_download().await {
                        return None;
                    }
                    Some(info.latest)
                });
                if let Some(v) = found {
                    if v != shown {
                        shown = v;
                        let a = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = show_update_window(&a, false).await;
                        });
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_secs(6 * 3600));
        }
    });
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
        if let Some(m) = target_monitor(None) {
            let (x, y, pw, ph) = fit_line_to(&m);
            place_window(&w, x, y, pw, ph);
        } else if let Ok(Some(mon)) = w.current_monitor() {
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
            if SHOOTING.load(Ordering::Relaxed) {
                cand = None;
                catch_since = None;
                continue;
            }
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
            // While up, the top edge to watch is the target monitor's (in
            // "follow the mouse" mode: the monitor the pointer is on). While
            // down, the line's own geometry applies.
            let (top, left, width) = if dropped {
                (top, left, width)
            } else {
                match target_monitor(Some((x, y))) {
                    Some(m) => (m.y, m.x, m.w),
                    None => (top, left, width),
                }
            };
            // The line's monitor was unplugged while it was down: roll up
            // (the next drop lays it out on a monitor that exists).
            if dropped {
                let mon = STATE.lock().unwrap().mon.clone();
                if !mon.is_empty() && !display::list().is_empty() && display::by_name(&mon).is_none() {
                    winx::dlog(&format!("monitor {mon} went away; rolling up"));
                    rollup();
                    with_window(|w| {
                        let _ = w.hide();
                    });
                    continue;
                }
            }
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
                    // below the line, or off to the side onto another monitor
                    if y > top + h + 12 || x < left - 12 || x >= left + width + 12 {
                        rollup();
                    }
                }
            }
        }
    });
}

/// Tray menu follows the app language (`lang`: zh / en / auto → Windows UI).
fn tray_is_en(s: &Settings) -> bool {
    match s.lang.as_str() {
        "en" => true,
        "auto" => !display::system_is_chinese(),
        _ => false,
    }
}

fn tray_menu(app: &AppHandle, en: bool) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let l = |zh: &'static str, e: &'static str| if en { e } else { zh };
    let item_clip = MenuItemBuilder::with_id("clip", l("剪贴板绳", "Clipboard")).build(app)?;
    let item_notes = MenuItemBuilder::with_id("notes", l("便签绳", "Notes")).build(app)?;
    let item_new = MenuItemBuilder::with_id("newnote", l("新建便签", "New note")).build(app)?;
    let item_mon = MenuItemBuilder::with_id("togglemon", l("暂停 / 恢复监控", "Pause / resume monitoring")).build(app)?;
    let item_set = MenuItemBuilder::with_id("settings", l("设置", "Settings")).build(app)?;
    let item_shot = MenuItemBuilder::with_id("shot", l("截图上绳", "Screenshot")).build(app)?;
    let item_upd = MenuItemBuilder::with_id("update", l("检查更新", "Check for updates")).build(app)?;
    let item_restart = MenuItemBuilder::with_id("restart", l("重启", "Restart")).build(app)?;
    let item_quit = MenuItemBuilder::with_id("quit", l("退出", "Quit")).build(app)?;
    MenuBuilder::new(app)
        .items(&[&item_clip, &item_notes])
        .separator()
        .items(&[&item_shot, &item_new, &item_mon, &item_set])
        .separator()
        .items(&[&item_upd, &item_restart, &item_quit])
        .build()
}

fn tray_tooltip(en: bool) -> &'static str {
    if en { "ClipLine" } else { "ClipLine 晾衣绳" }
}

/// Rebuild the tray menu after the language setting changes.
fn apply_tray_lang(app: &AppHandle, s: &Settings) {
    let en = tray_is_en(s);
    if let Some(tray) = app.tray_by_id("tray") {
        if let Ok(menu) = tray_menu(app, en) {
            let _ = tray.set_menu(Some(menu));
        }
        let _ = tray.set_tooltip(Some(tray_tooltip(en)));
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let en = tray_is_en(&SETTINGS.lock().unwrap().clone());
    let menu = tray_menu(app, en)?;

    let mut builder = TrayIconBuilder::with_id("tray")
        .tooltip(tray_tooltip(en))
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
            "shot" => {
                let a = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = start_shot(a).await;
                });
            }
            "settings" => {
                let a = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = create_settings_window(&a);
                });
            }
            "update" => {
                let a = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = open_update_window(a).await;
                });
            }
            "restart" => app.restart(),
            "quit" => quit_app(app),
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

    let chosen = SETTINGS.lock().unwrap().tray_icon.clone();
    if let Some(icon) = tray_icon_image(&chosen).or_else(|| app.default_window_icon().cloned()) {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

fn main() {
    update::on_startup();
    tauri::Builder::default()
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::Destroyed = e {
                // one overlay gone (e.g. Alt+F4) → close them all
                if is_shot_label(w.label()) && SHOOTING.load(Ordering::Relaxed) {
                    close_shot(w.app_handle());
                }
            }
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
                        let is_shot = CUR_SHOT.lock().unwrap().as_ref() == Some(shortcut);
                        if is_shot {
                            let a = _app.clone();
                            tauri::async_runtime::spawn(async move {
                                let _ = start_shot(a).await;
                            });
                        } else if is_clip {
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
            show_reminder,
            get_reminder,
            reminder_action,
            open_data_dir,
            start_shot,
            get_shot_image,
            get_shot_region,
            shot_focus,
            get_shot_windows,
            shot_log,
            shot_patch,
            finish_color,
            cancel_shot,
            finish_shot,
            annotate_image,
            save_annotated,
            ocr_image,
            ocr_to_line,
            path_info,
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
            list_monitors,
            update_status,
            check_update,
            download_update,
            install_update,
            skip_update,
            open_release_page,
            open_update_window,
            get_changelog,
            settings_goto,
            open_changelog,
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
            let existed = settings_path(&handle)
                .map(|p| p.exists() || p.with_file_name("data.json").exists())
                .unwrap_or(false);
            let settings = load_settings(&handle);
            apply_settings_to_state(&settings);
            *SETTINGS.lock().unwrap() = settings.clone();

            setup_geometry(&handle);
            build_tray(&handle)?;

            if apply_hotkeys(&handle, &settings.hotkey_clip, &settings.hotkey_notes, &settings.hotkey_shot).is_err() {
                // Fall back to defaults if the saved hotkeys fail to register.
                let d = Settings::default();
                let _ = apply_hotkeys(&handle, &d.hotkey_clip, &d.hotkey_notes, &d.hotkey_shot);
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
            start_update_thread(handle.clone());
            if note_version_seen(&handle, existed) {
                let h = handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio_sleep(2500).await;
                    let _ = show_news_window(&h).await;
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ClipLine");
}
