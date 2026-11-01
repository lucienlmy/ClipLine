#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod native;

use once_cell::sync::{Lazy, OnceCell};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
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
    native::remember_foreground();
    {
        let mut st = STATE.lock().unwrap();
        st.dropped = true;
        st.deck = deck;
        st.sticky = sticky;
    }
    with_window(|w| {
        let _ = w.set_ignore_cursor_events(false);
        let _ = w.show();
        let _ = w.set_focus();
    });
    if let Some(app) = APP.get() {
        let _ = app.emit(
            "line:drop",
            DropMsg {
                deck: deck_str(deck),
                sticky,
            },
        );
    }
}

fn rollup() {
    {
        let mut st = STATE.lock().unwrap();
        if !st.dropped {
            return;
        }
        st.dropped = false;
    }
    if let Some(app) = APP.get() {
        let _ = app.emit("line:rollup", ());
    }
    native::restore_foreground();
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
    rollup();
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
fn copy_image(path: String) {
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
fn save_to_desktop(
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
    apply_hotkeys(&app, &s.hotkey_clip, &s.hotkey_notes)?;
    let _ = if s.autostart {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    };
    apply_settings_to_state(&s);
    save_settings(&app, &s)?;
    *SETTINGS.lock().unwrap() = s.clone();
    serde_json::to_string(&s).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_state(app: AppHandle, data: String) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).ok();
    std::fs::write(dir.join("data.json"), data).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_state(app: AppHandle) -> String {
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

/// Read an image file and return it as a base64 data URL (so the webview can
/// show it without relying on the asset protocol).
#[tauri::command]
fn read_image_data(path: String) -> Result<String, String> {
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

fn percent_encode(s: &str) -> String {
    s.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
                (b as char).to_string()
            } else {
                format!("%{:02X}", b)
            }
        })
        .collect()
}

/// Open a floating, draggable, always-on-top window showing one image —
/// "pinned to the desktop".
#[tauri::command]
fn pin_image(app: AppHandle, path: String, w: Option<u32>, h: Option<u32>) -> Result<(), String> {
    let label = format!("pin{}", now_ms());
    let url = format!("pin.html?path={}", percent_encode(&path));

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

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
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
        loop {
            std::thread::sleep(std::time::Duration::from_millis(40));
            let Some((x, y)) = native::cursor_pos() else {
                std::thread::sleep(std::time::Duration::from_millis(400));
                continue;
            };
            let (dropped, sticky, deck, top, left, width, clip_h, notes_h, hover, dwell, flip) = {
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
                )
            };
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
                drop_line(Deck::Clipboard, true);
                let _ = app.emit("ui:settings", ());
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
        .plugin(tauri_plugin_drag::init())
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
            read_image_data,
            rollup_done,
            set_modal,
            set_sticky,
            pin_image,
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
            start_cursor_thread();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ClipLine");
}
