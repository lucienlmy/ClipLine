//! Update check against GitHub Releases, download, and apply.
//!
//! Transport is Windows' own URL moniker (`URLDownloadToFileW`), so no TLS
//! crate is added and the system proxy settings are honoured. The latest
//! release is read from the public GitHub API (no token, 60 req/h per IP —
//! plenty for a check every few hours).
//!
//! Applying an update:
//! * installer build (an `uninstall.exe` sits next to the exe): run the NSIS
//!   setup in passive mode with `/UPDATE` (keeps the autostart entry) and
//!   `/R` (relaunch afterwards), then exit.
//! * portable build: a running exe may be renamed on Windows, so the current
//!   exe is renamed to `*.old`, the new one takes its exact path (shortcuts
//!   and the autostart entry keep working), and it is started with
//!   `--after-update <pid>` so it waits for this process to exit first.
//!   The `.old` file is removed on the next start.

use once_cell::sync::Lazy;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

pub const RELEASES_PAGE: &str = "https://github.com/sjzy137/ClipLine/releases/latest";
const API_LATEST: &str = "https://api.github.com/repos/sjzy137/ClipLine/releases/latest";

#[derive(Serialize, Clone, Default)]
pub struct Info {
    pub current: String,
    pub latest: String,
    pub newer: bool,
    pub notes: String,
    pub page: String,
    pub asset: String,
    pub url: String,
    pub size: u64,
    pub kind: String, // portable | installer
}

/// Everything the update card needs to render itself.
#[derive(Serialize, Clone, Default)]
pub struct Status {
    /// idle | checking | uptodate | available | downloading | ready | installing | error
    pub phase: String,
    pub info: Option<Info>,
    pub error: String,
    pub done: u64,
    pub total: u64,
}

static STATUS: Lazy<Mutex<Status>> = Lazy::new(|| {
    Mutex::new(Status {
        phase: "idle".into(),
        ..Default::default()
    })
});
static DOWNLOADED: Lazy<Mutex<Option<(String, PathBuf)>>> = Lazy::new(|| Mutex::new(None));
static BUSY: AtomicBool = AtomicBool::new(false);

pub fn current() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

pub fn status() -> Status {
    STATUS.lock().unwrap().clone()
}

pub fn set_status<F: FnOnce(&mut Status)>(f: F) -> Status {
    let mut s = STATUS.lock().unwrap();
    f(&mut s);
    s.clone()
}

/// "v1.10.2" → (1, 10, 2); anything unparsable counts as 0.
fn parse_ver(s: &str) -> (u32, u32, u32) {
    let s = s.trim().trim_start_matches(['v', 'V']);
    let core = s.split(['-', '+']).next().unwrap_or("");
    let mut it = core.split('.').map(|p| p.trim().parse::<u32>().unwrap_or(0));
    (
        it.next().unwrap_or(0),
        it.next().unwrap_or(0),
        it.next().unwrap_or(0),
    )
}

pub fn is_newer(latest: &str, current: &str) -> bool {
    parse_ver(latest) > parse_ver(current)
}

/// The NSIS installer leaves `uninstall.exe` beside the program.
pub fn install_kind() -> &'static str {
    let installed = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("uninstall.exe").exists()))
        .unwrap_or(false);
    if installed {
        "installer"
    } else {
        "portable"
    }
}

fn update_dir() -> Result<PathBuf, String> {
    let d = std::env::temp_dir().join("ClipLine-update");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Ask GitHub for the latest release. Blocking; call off the main thread.
pub fn check() -> Result<Info, String> {
    let tmp = update_dir()?.join("latest.json");
    // The query string defeats the WinINet cache (the API ignores it).
    download(&format!("{API_LATEST}?t={}", now_secs()), &tmp, None)
        .map_err(|e| format!("无法连接 GitHub：{e}"))?;
    let txt = std::fs::read_to_string(&tmp).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&tmp);
    let v: serde_json::Value =
        serde_json::from_str(&txt).map_err(|_| "GitHub 返回的内容无法识别".to_string())?;
    let tag = v.get("tag_name").and_then(|x| x.as_str()).unwrap_or("");
    if tag.is_empty() {
        let msg = v.get("message").and_then(|x| x.as_str()).unwrap_or("没有找到已发布的版本");
        return Err(if msg.contains("rate limit") {
            "检查过于频繁，GitHub 暂时拒绝了请求，请稍后再试".into()
        } else {
            msg.to_string()
        });
    }
    let kind = install_kind();
    let mut asset = (String::new(), String::new(), 0u64);
    if let Some(list) = v.get("assets").and_then(|x| x.as_array()) {
        for a in list {
            let name = a.get("name").and_then(|x| x.as_str()).unwrap_or("");
            let lname = name.to_ascii_lowercase();
            let hit = match kind {
                "installer" => lname.ends_with("-setup.exe"),
                _ => lname.contains("_portable_") && lname.ends_with(".exe"),
            };
            if hit {
                asset = (
                    name.to_string(),
                    a.get("browser_download_url").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                    a.get("size").and_then(|x| x.as_u64()).unwrap_or(0),
                );
                break;
            }
        }
    }
    let latest = tag.trim_start_matches(['v', 'V']).to_string();
    Ok(Info {
        current: current().to_string(),
        newer: is_newer(&latest, current()),
        latest,
        notes: v.get("body").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        page: v
            .get("html_url")
            .and_then(|x| x.as_str())
            .unwrap_or(RELEASES_PAGE)
            .to_string(),
        asset: asset.0,
        url: asset.1,
        size: asset.2,
        kind: kind.to_string(),
    })
}

/// The downloaded installer / exe for `version`, if it is already here.
pub fn ready_for(version: &str) -> bool {
    DOWNLOADED
        .lock()
        .unwrap()
        .as_ref()
        .map(|(v, p)| v == version && p.exists())
        .unwrap_or(false)
}

/// Download the asset described by `info`. Blocking. `progress(done, total)`.
pub fn fetch(info: &Info, progress: Box<dyn Fn(u64, u64) + Send + Sync>) -> Result<PathBuf, String> {
    if ready_for(&info.latest) {
        return Ok(DOWNLOADED.lock().unwrap().as_ref().unwrap().1.clone());
    }
    if info.url.is_empty() {
        return Err("这个版本没有找到可用的安装文件，请到发布页手动下载".into());
    }
    if BUSY.swap(true, Ordering::SeqCst) {
        return Err("正在下载中".into());
    }
    let res = (|| {
        let dest = update_dir()?.join(&info.asset);
        download(&info.url, &dest, Some(progress)).map_err(|e| format!("下载失败：{e}"))?;
        let meta = std::fs::metadata(&dest).map_err(|e| e.to_string())?;
        if info.size > 0 && meta.len() != info.size {
            let _ = std::fs::remove_file(&dest);
            return Err("下载的文件不完整，请重试".to_string());
        }
        let mut head = [0u8; 2];
        let ok = std::fs::File::open(&dest)
            .and_then(|mut f| std::io::Read::read_exact(&mut f, &mut head))
            .is_ok()
            && &head == b"MZ";
        if !ok {
            let _ = std::fs::remove_file(&dest);
            return Err("下载的文件无效，请重试".to_string());
        }
        *DOWNLOADED.lock().unwrap() = Some((info.latest.clone(), dest.clone()));
        Ok(dest)
    })();
    BUSY.store(false, Ordering::SeqCst);
    res
}

/// Is a downloaded update waiting to be installed?
pub fn pending() -> bool {
    DOWNLOADED
        .lock()
        .unwrap()
        .as_ref()
        .map(|(v, p)| is_newer(v, current()) && p.exists())
        .unwrap_or(false)
}

/// Start installing the downloaded update. The caller must exit the app
/// right after this returns Ok. `restart`: launch the new version after.
pub fn apply(restart: bool) -> Result<(), String> {
    let file = DOWNLOADED
        .lock()
        .unwrap()
        .as_ref()
        .map(|(_, p)| p.clone())
        .ok_or("还没有下载更新")?;
    if !file.exists() {
        return Err("更新文件不见了，请重新下载".into());
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    if install_kind() == "installer" {
        let mut cmd = std::process::Command::new(&file);
        cmd.arg("/P").arg("/UPDATE");
        if restart {
            cmd.arg("/R");
        }
        cmd.spawn().map_err(|e| format!("无法启动安装程序：{e}"))?;
        return Ok(());
    }
    // Portable: swap the exe in place.
    let new = exe.with_extension("exe.new");
    let old = exe.with_extension("exe.old");
    let _ = std::fs::remove_file(&new);
    std::fs::copy(&file, &new).map_err(|e| {
        format!("无法写入程序所在的文件夹（{e}），请到发布页手动下载")
    })?;
    if old.exists() && std::fs::remove_file(&old).is_err() {
        // A leftover still in use: pick a unique name instead.
        let alt = exe.with_extension(format!("exe.{}.old", now_secs()));
        std::fs::rename(&exe, &alt).map_err(|e| e.to_string())?;
    } else {
        std::fs::rename(&exe, &old).map_err(|e| format!("无法替换程序文件：{e}"))?;
    }
    if let Err(e) = std::fs::rename(&new, &exe) {
        let _ = std::fs::rename(&old, &exe); // put the original back
        return Err(format!("无法替换程序文件：{e}"));
    }
    if restart {
        std::process::Command::new(&exe)
            .arg("--after-update")
            .arg(std::process::id().to_string())
            .spawn()
            .map_err(|e| format!("新版本已就位，但没能自动启动：{e}"))?;
    }
    Ok(())
}

/// Called first thing in main(): wait for the old process when started by
/// an update, then tidy up what the previous update left behind.
pub fn on_startup() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(i) = args.iter().position(|a| a == "--after-update") {
        if let Some(pid) = args.get(i + 1).and_then(|s| s.parse::<u32>().ok()) {
            wait_pid(pid);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let (Some(dir), Some(stem)) = (exe.parent(), exe.file_name().map(|n| n.to_string_lossy().to_string())) {
            if let Ok(rd) = std::fs::read_dir(dir) {
                for e in rd.flatten() {
                    let n = e.file_name().to_string_lossy().to_string();
                    if n.starts_with(&format!("{stem}.")) && (n.ends_with(".old") || n.ends_with(".new")) {
                        let _ = std::fs::remove_file(e.path());
                    }
                }
            }
        }
    }
    let _ = std::fs::remove_dir_all(std::env::temp_dir().join("ClipLine-update"));
}

// ---------------------------------------------------------------------------
// Windows transport
// ---------------------------------------------------------------------------

#[cfg(windows)]
fn wait_pid(pid: u32) {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE};
    unsafe {
        if let Ok(h) = OpenProcess(PROCESS_SYNCHRONIZE, false, pid) {
            let _ = WaitForSingleObject(h, 15_000);
            let _ = CloseHandle(h);
        }
    }
}

#[cfg(not(windows))]
fn wait_pid(_pid: u32) {}

#[cfg(windows)]
mod win {
    use windows::core::{implement, Result, HRESULT, PCWSTR};
    use windows::Win32::System::Com::{
        IBindStatusCallback, IBindStatusCallback_Impl, IBinding, BINDINFO,
        FORMATETC, STGMEDIUM,
    };
    use windows::Win32::System::Com::Urlmon::{BINDF_GETNEWESTVERSION, BINDSTATUS_DOWNLOADINGDATA, BINDSTATUS_ENDDOWNLOADDATA};

    #[implement(IBindStatusCallback)]
    pub struct Progress {
        pub f: Option<Box<dyn Fn(u64, u64) + Send + Sync>>,
    }

    impl IBindStatusCallback_Impl for Progress_Impl {
        fn OnStartBinding(&self, _r: u32, _pib: Option<&IBinding>) -> Result<()> {
            Ok(())
        }
        fn GetPriority(&self) -> Result<i32> {
            Ok(0)
        }
        fn OnLowResource(&self, _r: u32) -> Result<()> {
            Ok(())
        }
        fn OnProgress(&self, done: u32, total: u32, code: u32, _text: &PCWSTR) -> Result<()> {
            if code == BINDSTATUS_DOWNLOADINGDATA.0 as u32 || code == BINDSTATUS_ENDDOWNLOADDATA.0 as u32 {
                if let Some(f) = &self.f {
                    f(done as u64, total as u64);
                }
            }
            Ok(())
        }
        fn OnStopBinding(&self, _hr: HRESULT, _err: &PCWSTR) -> Result<()> {
            Ok(())
        }
        fn GetBindInfo(&self, grfbindf: *mut u32, _info: *mut BINDINFO) -> Result<()> {
            // Always go to the network, never serve a stale cached copy.
            if !grfbindf.is_null() {
                unsafe { *grfbindf |= BINDF_GETNEWESTVERSION.0 as u32 };
            }
            Ok(())
        }
        fn OnDataAvailable(&self, _f: u32, _n: u32, _fmt: *const FORMATETC, _med: *const STGMEDIUM) -> Result<()> {
            Ok(())
        }
        fn OnObjectAvailable(&self, _riid: *const windows::core::GUID, _punk: Option<&windows::core::IUnknown>) -> Result<()> {
            Ok(())
        }
    }

    pub fn download(url: &str, dest: &std::path::Path, progress: Option<Box<dyn Fn(u64, u64) + Send + Sync>>) -> std::result::Result<(), String> {
        use windows::core::HSTRING;
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
        use windows::Win32::System::Com::Urlmon::URLDownloadToFileW;
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        let _ = std::fs::remove_file(dest);
        let u = HSTRING::from(url);
        let d = HSTRING::from(dest.as_os_str());
        let cb: IBindStatusCallback = Progress { f: progress }.into();
        unsafe { URLDownloadToFileW(None, &u, &d, 0, &cb) }.map_err(|e| {
            let m = e.message().to_string();
            let m = m.trim();
            if m.is_empty() {
                format!("错误代码 0x{:08X}", e.code().0 as u32)
            } else {
                m.to_string()
            }
        })?;
        if !dest.exists() {
            return Err("没有收到文件".into());
        }
        Ok(())
    }
}

#[cfg(windows)]
fn download(url: &str, dest: &Path, progress: Option<Box<dyn Fn(u64, u64) + Send + Sync>>) -> Result<(), String> {
    win::download(url, dest, progress)
}

#[cfg(not(windows))]
fn download(_url: &str, _dest: &Path, _progress: Option<Box<dyn Fn(u64, u64) + Send + Sync>>) -> Result<(), String> {
    Err("仅支持 Windows".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn versions() {
        assert!(is_newer("1.5.0", "1.4.0"));
        assert!(is_newer("v1.10.0", "1.9.9"));
        assert!(!is_newer("v1.4.0", "1.4.0"));
        assert!(!is_newer("1.3.9", "1.4.0"));
        assert!(is_newer("2.0", "1.99.99"));
    }
}
