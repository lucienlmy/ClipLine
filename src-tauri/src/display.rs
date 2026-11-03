//! Monitors: which screen the line drops on, and where the reminder / update
//! cards appear. Queried straight from Win32 (works from any thread), cached
//! for a second so plugging / unplugging a display is picked up on its own.

use serde::Serialize;

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Mon {
    /// GDI device name, e.g. `\\.\DISPLAY2` — stored in the settings.
    pub name: String,
    /// Full monitor rectangle, physical pixels (virtual-desktop coordinates).
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    /// Work area (without the taskbar).
    pub wx: i32,
    pub wy: i32,
    pub ww: i32,
    pub wh: i32,
    pub primary: bool,
    /// 1.0 = 100 %, 1.5 = 150 % …
    pub scale: f64,
}

impl Mon {
    pub fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.x && x < self.x + self.w && y >= self.y && y < self.y + self.h
    }
    /// Squared distance from a point to this monitor (0 when inside).
    fn dist2(&self, x: i32, y: i32) -> i64 {
        let dx = if x < self.x { self.x - x } else if x >= self.x + self.w { x - (self.x + self.w - 1) } else { 0 } as i64;
        let dy = if y < self.y { self.y - y } else if y >= self.y + self.h { y - (self.y + self.h - 1) } else { 0 } as i64;
        dx * dx + dy * dy
    }
    /// The number Windows shows in Display settings (`\\.\DISPLAY2` → 2).
    pub fn number(&self) -> u32 {
        let digits: String = self.name.chars().rev().take_while(|c| c.is_ascii_digit()).collect();
        digits.chars().rev().collect::<String>().parse().unwrap_or(0)
    }
}

use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::time::{Duration, Instant};

static CACHE: Lazy<Mutex<Option<(Instant, Vec<Mon>)>>> = Lazy::new(|| Mutex::new(None));

/// All monitors, sorted by their Windows number.
pub fn list() -> Vec<Mon> {
    let mut c = CACHE.lock().unwrap();
    if let Some((t, v)) = c.as_ref() {
        if t.elapsed() < Duration::from_millis(1000) && !v.is_empty() {
            return v.clone();
        }
    }
    let mut v = imp::enumerate();
    v.sort_by_key(|m| (m.number(), m.x, m.y));
    *c = Some((Instant::now(), v.clone()));
    v
}

pub fn primary() -> Option<Mon> {
    let v = list();
    v.iter().find(|m| m.primary).cloned().or_else(|| v.first().cloned())
}

pub fn by_name(name: &str) -> Option<Mon> {
    list().into_iter().find(|m| m.name.eq_ignore_ascii_case(name))
}

/// The monitor under a point (or the nearest one, for points in a gap).
pub fn at(x: i32, y: i32) -> Option<Mon> {
    let v = list();
    v.iter()
        .find(|m| m.contains(x, y))
        .cloned()
        .or_else(|| v.iter().min_by_key(|m| m.dist2(x, y)).cloned())
}

/// Language of the Windows UI: true for any Chinese variant.
pub fn system_is_chinese() -> bool {
    imp::system_is_chinese()
}

#[cfg(target_os = "windows")]
mod imp {
    use super::Mon;
    use windows::Win32::Foundation::{BOOL, LPARAM, RECT};
    use windows::Win32::Globalization::GetUserDefaultUILanguage;
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
    };
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};

    const MONITORINFOF_PRIMARY: u32 = 1;

    unsafe extern "system" fn cb(h: HMONITOR, _hdc: HDC, _r: *mut RECT, data: LPARAM) -> BOOL {
        let out = &mut *(data.0 as *mut Vec<Mon>);
        let mut mi = MONITORINFOEXW::default();
        mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if GetMonitorInfoW(h, &mut mi as *mut MONITORINFOEXW as *mut MONITORINFO).as_bool() {
            let r = mi.monitorInfo.rcMonitor;
            let wa = mi.monitorInfo.rcWork;
            let len = mi.szDevice.iter().position(|&c| c == 0).unwrap_or(mi.szDevice.len());
            let name = String::from_utf16_lossy(&mi.szDevice[..len]);
            let (mut dx, mut dy) = (96u32, 96u32);
            let scale = if GetDpiForMonitor(h, MDT_EFFECTIVE_DPI, &mut dx, &mut dy).is_ok() && dx > 0 {
                dx as f64 / 96.0
            } else {
                1.0
            };
            out.push(Mon {
                name,
                x: r.left,
                y: r.top,
                w: r.right - r.left,
                h: r.bottom - r.top,
                wx: wa.left,
                wy: wa.top,
                ww: wa.right - wa.left,
                wh: wa.bottom - wa.top,
                primary: mi.monitorInfo.dwFlags & MONITORINFOF_PRIMARY != 0,
                scale,
            });
        }
        BOOL(1)
    }

    pub fn enumerate() -> Vec<Mon> {
        let mut v: Vec<Mon> = Vec::new();
        unsafe {
            let _ = EnumDisplayMonitors(HDC::default(), None, Some(cb), LPARAM(&mut v as *mut Vec<Mon> as isize));
        }
        v
    }

    pub fn system_is_chinese() -> bool {
        // PRIMARYLANGID(LANGID) == LANG_CHINESE (0x04)
        let id = unsafe { GetUserDefaultUILanguage() };
        (id & 0x3ff) == 0x04
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use super::Mon;
    pub fn enumerate() -> Vec<Mon> {
        Vec::new()
    }
    pub fn system_is_chinese() -> bool {
        std::env::var("LANG").map(|l| l.starts_with("zh")).unwrap_or(false)
    }
}
