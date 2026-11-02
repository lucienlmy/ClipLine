//! Extra Windows-only plumbing:
//!
//! * a low-level mouse hook that tracks the left button globally, so the
//!   cursor thread can tell "a drag is in progress and has reached the top
//!   edge" (GetAsyncKeyState is unreliable while another app runs an OLE
//!   drag loop);
//! * a native OLE drag source for text cards: dropped on Explorer / the
//!   desktop it becomes a .txt/.md file, dropped anywhere else it is plain
//!   text.
//!
//! On other platforms everything here is a no-op stub.

#[cfg(target_os = "windows")]
mod imp {
    use std::os::windows::ffi::OsStrExt;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU64, Ordering::Relaxed};
    use std::sync::Once;
    use std::time::{SystemTime, UNIX_EPOCH};

    use windows::core::{implement, Error, Result};
    use windows::Win32::Foundation::{
        BOOL, DRAGDROP_S_CANCEL, DRAGDROP_S_DROP, DRAGDROP_S_USEDEFAULTCURSORS, DV_E_FORMATETC,
        E_NOTIMPL, HGLOBAL, HWND, LPARAM, LRESULT, OLE_E_ADVISENOTSUPPORTED, POINT, S_OK, WPARAM,
    };
    use windows::Win32::System::Com::{
        IAdviseSink, IDataObject, IDataObject_Impl, IEnumFORMATETC, IEnumSTATDATA, DVASPECT_CONTENT,
        FORMATETC, STGMEDIUM, STGMEDIUM_0, TYMED_HGLOBAL,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::System::Ole::{
        DoDragDrop, IDropSource, IDropSource_Impl, OleInitialize, CF_UNICODETEXT, DROPEFFECT,
        DROPEFFECT_COPY, DROPEFFECT_MOVE,
    };
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::Shell::{
        ILCreateFromPathW, ILFree, SHCreateShellItemArrayFromIDLists, BHID_DataObject,
    };
    use windows::core::PCWSTR;
    use windows::Win32::System::SystemServices::{MK_LBUTTON, MODIFIERKEYS_FLAGS};
    use windows::Win32::UI::Shell::SHCreateStdEnumFmtEtc;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetAncestor, GetClassNameW, GetCursorPos, GetMessageW,
        GetWindowThreadProcessId, SetWindowsHookExW,
        WindowFromPoint, GA_ROOT, MSG, MSLLHOOKSTRUCT, WH_MOUSE_LL, WM_LBUTTONDOWN, WM_LBUTTONUP,
    };

    // ------------------------------------------------------------------
    // Global left-button tracking
    // ------------------------------------------------------------------

    static LDOWN: AtomicBool = AtomicBool::new(false);
    static DOWN_X: AtomicI32 = AtomicI32::new(0);
    static DOWN_Y: AtomicI32 = AtomicI32::new(0);
    static DOWN_AT: AtomicU64 = AtomicU64::new(0);
    static HOOK_STARTED: Once = Once::new();

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let msg = wparam.0 as u32;
            if msg == WM_LBUTTONDOWN {
                let info = &*(lparam.0 as *const MSLLHOOKSTRUCT);
                DOWN_X.store(info.pt.x, Relaxed);
                DOWN_Y.store(info.pt.y, Relaxed);
                DOWN_AT.store(now_ms(), Relaxed);
                LDOWN.store(true, Relaxed);
            } else if msg == WM_LBUTTONUP {
                LDOWN.store(false, Relaxed);
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    /// Install the low-level mouse hook on its own message-loop thread.
    pub fn start_mouse_hook() {
        HOOK_STARTED.call_once(|| {
            std::thread::spawn(|| unsafe {
                let hmod = GetModuleHandleW(None).ok();
                let hook = SetWindowsHookExW(
                    WH_MOUSE_LL,
                    Some(mouse_proc),
                    windows::Win32::Foundation::HINSTANCE(hmod.map(|m| m.0).unwrap_or(std::ptr::null_mut())),
                    0,
                );
                if hook.is_err() {
                    return;
                }
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).as_bool() {}
            });
        });
    }

    /// `Some((down_x, down_y, ms_since_down))` while the left button is held.
    pub fn left_drag_info() -> Option<(i32, i32, u64)> {
        if !LDOWN.load(Relaxed) {
            return None;
        }
        let age = now_ms().saturating_sub(DOWN_AT.load(Relaxed));
        // Safety net in case a button-up was ever missed.
        if age > 60_000 {
            LDOWN.store(false, Relaxed);
            return None;
        }
        Some((DOWN_X.load(Relaxed), DOWN_Y.load(Relaxed), age))
    }

    // ------------------------------------------------------------------
    // Text drag source
    // ------------------------------------------------------------------

    static OLE_INIT: Once = Once::new();

    fn init_ole() {
        OLE_INIT.call_once(|| unsafe {
            let _ = OleInitialize(None);
        });
    }

    /// Is the window under the cursor Explorer (a folder window or the desktop)?
    fn cursor_over_explorer() -> bool {
        unsafe {
            let mut p = POINT::default();
            if GetCursorPos(&mut p).is_err() {
                return false;
            }
            let h = WindowFromPoint(p);
            if h.0.is_null() {
                return false;
            }
            let root: HWND = GetAncestor(h, GA_ROOT);
            let mut buf = [0u16; 64];
            let n = GetClassNameW(root, &mut buf);
            if n <= 0 {
                return false;
            }
            let cls = String::from_utf16_lossy(&buf[..n as usize]);
            if matches!(
                cls.as_str(),
                "CabinetWClass" | "ExploreWClass" | "Progman" | "WorkerW"
            ) {
                return true;
            }
            // Fallback: any window that belongs to explorer.exe.
            process_is_explorer(root)
        }
    }

    unsafe fn process_is_explorer(h: HWND) -> bool {
        let mut pid = 0u32;
        GetWindowThreadProcessId(h, Some(&mut pid));
        if pid == 0 {
            return false;
        }
        let Ok(ph) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return false;
        };
        let mut buf = [0u16; 520];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            ph,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
        .is_ok();
        let _ = CloseHandle(ph);
        if !ok {
            return false;
        }
        String::from_utf16_lossy(&buf[..len as usize])
            .to_ascii_lowercase()
            .ends_with("\\explorer.exe")
    }

    /// The same shell data object Explorer itself produces for a file —
    /// this is what image/file card drags use, and Explorer accepts it.
    unsafe fn shell_file_object(file: &[u16]) -> Result<IDataObject> {
        let pidl = ILCreateFromPathW(PCWSTR(file.as_ptr()));
        if pidl.is_null() {
            return Err(Error::from_win32());
        }
        let arr = SHCreateShellItemArrayFromIDLists(&[pidl as *const _]);
        let r = arr.and_then(|a| a.BindToHandler::<_, IDataObject>(None, &BHID_DataObject));
        ILFree(Some(pidl as *const _));
        r
    }

    #[implement(IDropSource)]
    struct DropSource;

    impl IDropSource_Impl for DropSource_Impl {
        fn QueryContinueDrag(&self, esc: BOOL, keys: MODIFIERKEYS_FLAGS) -> windows::core::HRESULT {
            if esc.as_bool() {
                DRAGDROP_S_CANCEL
            } else if (keys & MK_LBUTTON) == MODIFIERKEYS_FLAGS(0) {
                DRAGDROP_S_DROP
            } else {
                S_OK
            }
        }
        fn GiveFeedback(&self, _effect: DROPEFFECT) -> windows::core::HRESULT {
            DRAGDROP_S_USEDEFAULTCURSORS
        }
    }

    /// Over Explorer / the desktop this object *is* the shell file object
    /// (everything is forwarded); over anything else it only offers text.
    #[implement(IDataObject)]
    struct TextData {
        text: Vec<u16>,     // UTF-16 incl. trailing NUL
        file: IDataObject,  // shell data object for the temp .txt/.md
    }

    fn is_text(f: *const FORMATETC) -> bool {
        match unsafe { f.as_ref() } {
            Some(f) => {
                f.cfFormat == CF_UNICODETEXT.0
                    && (f.tymed & TYMED_HGLOBAL.0 as u32) != 0
                    && f.dwAspect == DVASPECT_CONTENT.0
            }
            None => false,
        }
    }

    fn alloc_bytes(header: &[u8], wide: &[u16]) -> Result<HGLOBAL> {
        let size = header.len() + wide.len() * 2;
        unsafe {
            let h = GlobalAlloc(GMEM_MOVEABLE, size)?;
            let p = GlobalLock(h) as *mut u8;
            if p.is_null() {
                return Err(Error::from_win32());
            }
            std::ptr::copy_nonoverlapping(header.as_ptr(), p, header.len());
            std::ptr::copy_nonoverlapping(
                wide.as_ptr() as *const u8,
                p.add(header.len()),
                wide.len() * 2,
            );
            let _ = GlobalUnlock(h);
            Ok(h)
        }
    }

    fn medium(h: HGLOBAL) -> STGMEDIUM {
        STGMEDIUM {
            tymed: TYMED_HGLOBAL.0 as u32,
            u: STGMEDIUM_0 { hGlobal: h },
            pUnkForRelease: std::mem::ManuallyDrop::new(None),
        }
    }

    impl IDataObject_Impl for TextData_Impl {
        fn GetData(&self, f: *const FORMATETC) -> Result<STGMEDIUM> {
            if cursor_over_explorer() {
                return unsafe { self.file.GetData(f) };
            }
            if is_text(f) {
                return Ok(medium(alloc_bytes(&[], &self.text)?));
            }
            Err(Error::from(DV_E_FORMATETC))
        }

        fn GetDataHere(&self, f: *const FORMATETC, m: *mut STGMEDIUM) -> Result<()> {
            if cursor_over_explorer() {
                return unsafe { self.file.GetDataHere(f, m) };
            }
            Err(Error::from(DV_E_FORMATETC))
        }

        fn QueryGetData(&self, f: *const FORMATETC) -> windows::core::HRESULT {
            if cursor_over_explorer() {
                return unsafe { self.file.QueryGetData(f) };
            }
            if is_text(f) {
                S_OK
            } else {
                DV_E_FORMATETC
            }
        }

        fn GetCanonicalFormatEtc(
            &self,
            _i: *const FORMATETC,
            o: *mut FORMATETC,
        ) -> windows::core::HRESULT {
            if let Some(o) = unsafe { o.as_mut() } {
                o.ptd = std::ptr::null_mut();
            }
            E_NOTIMPL
        }

        fn SetData(&self, f: *const FORMATETC, m: *const STGMEDIUM, release: BOOL) -> Result<()> {
            unsafe { self.file.SetData(f, m, release) }
        }

        fn EnumFormatEtc(&self, dir: u32) -> Result<IEnumFORMATETC> {
            if cursor_over_explorer() {
                return unsafe { self.file.EnumFormatEtc(dir) };
            }
            let fmt = FORMATETC {
                cfFormat: CF_UNICODETEXT.0,
                ptd: std::ptr::null_mut(),
                dwAspect: DVASPECT_CONTENT.0,
                lindex: -1,
                tymed: TYMED_HGLOBAL.0 as u32,
            };
            unsafe { SHCreateStdEnumFmtEtc(&[fmt]) }
        }

        fn DAdvise(&self, _f: *const FORMATETC, _a: u32, _s: Option<&IAdviseSink>) -> Result<u32> {
            Err(Error::from(OLE_E_ADVISENOTSUPPORTED))
        }
        fn DUnadvise(&self, _c: u32) -> Result<()> {
            Err(Error::from(OLE_E_ADVISENOTSUPPORTED))
        }
        fn EnumDAdvise(&self) -> Result<IEnumSTATDATA> {
            Err(Error::from(OLE_E_ADVISENOTSUPPORTED))
        }
    }

    /// Run a modal OLE drag of `text`, backed by `file` for Explorer drops.
    /// Must be called on the UI (main) thread. Returns true if dropped.
    pub fn drag_text(text: &str, file: &PathBuf) -> std::result::Result<bool, String> {
        init_ole();
        let mut wtext: Vec<u16> = text.encode_utf16().collect();
        wtext.push(0);
        let wfile: Vec<u16> = file.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        unsafe {
            let file = shell_file_object(&wfile).map_err(|e| e.to_string())?;
            let data: IDataObject = TextData { text: wtext, file }.into();
            let src: IDropSource = DropSource.into();
            let mut eff = DROPEFFECT::default();
            let hr = DoDragDrop(&data, &src, DROPEFFECT_COPY | DROPEFFECT_MOVE, &mut eff);
            Ok(hr == DRAGDROP_S_DROP)
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use std::path::PathBuf;
    pub fn start_mouse_hook() {}
    pub fn left_drag_info() -> Option<(i32, i32, u64)> {
        None
    }
    pub fn drag_text(_text: &str, _file: &PathBuf) -> Result<bool, String> {
        Err("text drag is only available on Windows".into())
    }
}

pub use imp::*;
