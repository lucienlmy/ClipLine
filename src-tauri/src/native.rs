//! Platform-native helpers.
//!
//! The real implementations are Windows-only (clipboard access including
//! images, global cursor polling for the top-edge "drop", and paste-into-
//! the-previous-app). On every other platform these are no-op stubs so the
//! project still type-checks and runs for development on Linux/macOS.

#[cfg(target_os = "windows")]
mod imp {
    use base64::Engine;
    use serde::Serialize;
    use std::ffi::c_void;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering::Relaxed};
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    use once_cell::sync::Lazy;
    use tauri::{AppHandle, Emitter};

    use clipboard_win::{formats, get_clipboard, raw, Clipboard};

    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_MENU, VK_SHIFT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetForegroundWindow, SetForegroundWindow,
    };
    use windows::Win32::Foundation::POINT;

    static PAUSED: AtomicBool = AtomicBool::new(false);
    static PREV_HWND: AtomicIsize = AtomicIsize::new(0);
    static IMAGES_DIR: Lazy<Mutex<PathBuf>> = Lazy::new(|| Mutex::new(PathBuf::from(".")));
    static LAST_SET_TEXT: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new(String::new()));
    static LAST_SET_FILES: Lazy<Mutex<Vec<String>>> = Lazy::new(|| Mutex::new(Vec::new()));

    #[derive(Serialize, Clone)]
    struct ClipItem {
        id: String,
        kind: String,
        text: Option<String>,
        thumb: Option<String>,
        path: Option<String>,
        files: Option<Vec<String>>,
        w: Option<u32>,
        h: Option<u32>,
        ts: i64,
    }

    fn now_ms() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }

    fn new_id() -> String {
        format!("{}-{}", now_ms(), fastrand())
    }

    // A tiny xorshift so we don't pull in the `rand` crate.
    fn fastrand() -> u32 {
        use std::cell::Cell;
        thread_local!(static S: Cell<u32> = Cell::new(0x4F6CDD1Du32 ^ (now_ms() as u32)));
        S.with(|s| {
            let mut x = s.get().wrapping_add(0x9E3779B9);
            if x == 0 {
                x = 0xDEADBEEF;
            }
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            s.set(x);
            x
        })
    }

    pub fn set_images_dir(p: PathBuf) {
        if let Ok(mut g) = IMAGES_DIR.lock() {
            *g = p;
        }
    }

    pub fn paused() -> bool {
        PAUSED.load(Relaxed)
    }

    pub fn toggle_paused() -> bool {
        let v = !PAUSED.load(Relaxed);
        PAUSED.store(v, Relaxed);
        v
    }

    pub fn cursor_pos() -> Option<(i32, i32)> {
        unsafe {
            let mut p = POINT::default();
            if GetCursorPos(&mut p).is_ok() {
                Some((p.x, p.y))
            } else {
                None
            }
        }
    }

    pub fn shift_down() -> bool {
        unsafe { (GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0 }
    }

    pub fn ctrl_down() -> bool {
        unsafe { (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0 }
    }

    pub fn alt_down() -> bool {
        unsafe { (GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000) != 0 }
    }

    pub fn remember_foreground() {
        unsafe {
            let h = GetForegroundWindow();
            PREV_HWND.store(h.0 as isize, Relaxed);
        }
    }

    pub fn restore_foreground() {
        let h = PREV_HWND.load(Relaxed);
        if h != 0 {
            unsafe {
                let _ = SetForegroundWindow(HWND(h as *mut c_void));
            }
        }
    }

    pub fn get_files() -> Vec<String> {
        get_clipboard(formats::FileList).unwrap_or_default()
    }

    pub fn set_files(paths: &[String]) {
        if let Ok(mut g) = LAST_SET_FILES.lock() {
            *g = paths.to_vec();
        }
        if let Ok(_c) = Clipboard::new_attempts(10) {
            let _ = raw::set_file_list(paths);
        }
    }

    fn files_sig(files: &[String]) -> u64 {
        let mut h: u64 = 1469598103934665603;
        for f in files {
            for b in f.bytes() {
                h ^= b as u64;
                h = h.wrapping_mul(1099511628211);
            }
            h ^= 0x2f;
            h = h.wrapping_mul(1099511628211);
        }
        h
    }

    pub fn set_text(s: &str) {
        if let Ok(mut g) = LAST_SET_TEXT.lock() {
            *g = s.to_string();
        }
        if let Ok(mut cb) = arboard::Clipboard::new() {
            let _ = cb.set_text(s.to_string());
        }
    }

    pub fn set_image_from_file(path: &str) {
        if let Ok(dynimg) = image::open(path) {
            let rgba = dynimg.to_rgba8();
            let (w, h) = (rgba.width() as usize, rgba.height() as usize);
            let data = arboard::ImageData {
                width: w,
                height: h,
                bytes: std::borrow::Cow::from(rgba.into_raw()),
            };
            if let Ok(mut cb) = arboard::Clipboard::new() {
                let _ = cb.set_image(data);
            }
        }
    }

    pub fn paste_text(s: &str) {
        set_text(s);
        restore_foreground();
        std::thread::sleep(std::time::Duration::from_millis(90));
        send_ctrl_v();
    }

    fn send_ctrl_v() {
        use enigo::{
            Direction::{Click, Press, Release},
            Enigo, Key, Keyboard, Settings,
        };
        if let Ok(mut e) = Enigo::new(&Settings::default()) {
            let _ = e.key(Key::Control, Press);
            let _ = e.key(Key::Unicode('v'), Click);
            let _ = e.key(Key::Control, Release);
        }
    }

    fn img_sig(img: &arboard::ImageData) -> u64 {
        let bytes = &img.bytes;
        let mut h: u64 = 1469598103934665603;
        let mix = |h: &mut u64, b: u8| {
            *h ^= b as u64;
            *h = h.wrapping_mul(1099511628211);
        };
        mix(&mut h, (img.width & 0xff) as u8);
        mix(&mut h, (img.height & 0xff) as u8);
        let len = bytes.len();
        mix(&mut h, (len & 0xff) as u8);
        mix(&mut h, ((len >> 8) & 0xff) as u8);
        mix(&mut h, ((len >> 16) & 0xff) as u8);
        let step = (len / 512).max(1);
        let mut i = 0;
        while i < len {
            mix(&mut h, bytes[i]);
            i += step;
        }
        h
    }

    fn save_image(img: &arboard::ImageData) -> Option<ClipItem> {
        let w = img.width as u32;
        let h = img.height as u32;
        if w == 0 || h == 0 {
            return None;
        }
        let raw = img.bytes.clone().into_owned();
        let rgba = image::RgbaImage::from_raw(w, h, raw)?;

        let dir = IMAGES_DIR.lock().ok()?.clone();
        let _ = std::fs::create_dir_all(&dir);
        let id = new_id();
        let path = dir.join(format!("{id}.png"));
        rgba.save(&path).ok()?;

        // A small thumbnail carried inline as a data URL so the card can be
        // redrawn after a restart without touching the file again.
        let maxw: u32 = 300;
        let (tw, th) = if w > maxw {
            (maxw, (h as f64 * maxw as f64 / w as f64).round() as u32)
        } else {
            (w, h)
        };
        let thumb = image::imageops::resize(&rgba, tw, th.max(1), image::imageops::FilterType::Triangle);
        let dynimg = image::DynamicImage::ImageRgba8(thumb);
        let mut buf = std::io::Cursor::new(Vec::new());
        dynimg.write_to(&mut buf, image::ImageFormat::Png).ok()?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(buf.get_ref());

        Some(ClipItem {
            id,
            kind: "image".into(),
            text: None,
            thumb: Some(format!("data:image/png;base64,{b64}")),
            path: Some(path.to_string_lossy().to_string()),
            files: None,
            w: Some(w),
            h: Some(h),
            ts: now_ms(),
        })
    }

    pub fn start_clipboard_watch(app: AppHandle) {
        std::thread::spawn(move || {
            let mut cb = match arboard::Clipboard::new() {
                Ok(c) => c,
                Err(_) => return,
            };
            let mut last_text = String::new();
            let mut last_img: u64 = 0;
            let mut last_files: u64 = 0;
            loop {
                std::thread::sleep(std::time::Duration::from_millis(650));
                if PAUSED.load(Relaxed) {
                    continue;
                }

                // Files copied in Explorer (CF_HDROP) take priority.
                let files: Vec<String> = get_clipboard(formats::FileList).unwrap_or_default();
                if !files.is_empty() {
                    let sig = files_sig(&files);
                    if sig != last_files {
                        last_files = sig;
                        let ours = LAST_SET_FILES.lock().map(|g| *g == files).unwrap_or(false);
                        if !ours {
                            let item = ClipItem {
                                id: new_id(),
                                kind: "file".into(),
                                text: Some(files.join("\n")),
                                thumb: None,
                                path: None,
                                files: Some(files.clone()),
                                w: None,
                                h: None,
                                ts: now_ms(),
                            };
                            let _ = app.emit("clip:add", item);
                        }
                    }
                    continue;
                }

                if let Ok(t) = cb.get_text() {
                    let trimmed = t.trim();
                    if !trimmed.is_empty() && t != last_text {
                        let ours = LAST_SET_TEXT
                            .lock()
                            .map(|g| *g == t)
                            .unwrap_or(false);
                        last_text = t.clone();
                        if !ours {
                            let item = ClipItem {
                                id: new_id(),
                                kind: "text".into(),
                                text: Some(t),
                                thumb: None,
                                path: None,
                                files: None,
                                w: None,
                                h: None,
                                ts: now_ms(),
                            };
                            let _ = app.emit("clip:add", item);
                        }
                        continue;
                    }
                }

                if let Ok(img) = cb.get_image() {
                    let sig = img_sig(&img);
                    if sig != 0 && sig != last_img {
                        last_img = sig;
                        if let Some(item) = save_image(&img) {
                            let _ = app.emit("clip:add", item);
                        }
                    }
                }
            }
        });
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use std::path::PathBuf;
    use tauri::AppHandle;

    pub fn set_images_dir(_p: PathBuf) {}
    pub fn paused() -> bool {
        false
    }
    pub fn toggle_paused() -> bool {
        false
    }
    pub fn cursor_pos() -> Option<(i32, i32)> {
        None
    }
    pub fn shift_down() -> bool {
        false
    }
    pub fn ctrl_down() -> bool {
        false
    }
    pub fn alt_down() -> bool {
        false
    }
    pub fn remember_foreground() {}
    pub fn restore_foreground() {}
    pub fn set_text(_s: &str) {}
    pub fn set_image_from_file(_path: &str) {}
    pub fn get_files() -> Vec<String> {
        Vec::new()
    }
    pub fn set_files(_paths: &[String]) {}
    pub fn paste_text(_s: &str) {}
    pub fn start_clipboard_watch(_app: AppHandle) {}
}

pub use imp::*;
