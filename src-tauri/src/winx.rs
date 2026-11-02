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

/// Diagnostic log: %TEMP%\\ClipLine\\debug.log (kept small).
pub fn dlog(msg: &str) {
    use std::io::Write;
    // Next to the exe (so it is easy to find); fall back to %TEMP%\\ClipLine.
    let p = std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(|d| d.join("clipline-debug.log")))
        .filter(|p| std::fs::OpenOptions::new().create(true).append(true).open(p).is_ok())
        .unwrap_or_else(|| {
            let dir = std::env::temp_dir().join("ClipLine");
            let _ = std::fs::create_dir_all(&dir);
            dir.join("clipline-debug.log")
        });
    if std::fs::metadata(&p).map(|m| m.len() > 512 * 1024).unwrap_or(false) {
        let _ = std::fs::remove_file(&p);
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&p) {
        let t = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() % 1_000_000)
            .unwrap_or(0);
        let _ = writeln!(f, "{t:>6} {msg}");
    }
}

#[cfg(target_os = "windows")]
mod imp {
    use super::dlog;
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
        DoDragDrop, IDropSource, IDropSource_Impl, IDropTarget, IDropTarget_Impl, OleInitialize,
        RegisterDragDrop, ReleaseStgMedium, RevokeDragDrop, CF_HDROP, CF_UNICODETEXT, DROPEFFECT,
        DROPEFFECT_COPY, DROPEFFECT_MOVE, DROPEFFECT_NONE,
    };
    use windows::Win32::Foundation::{BOOL as WBOOL, POINTL};
    use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};
    use windows::Win32::UI::WindowsAndMessaging::EnumChildWindows;
    use std::cell::{Cell, RefCell};
    use std::sync::OnceLock;
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

    static DRAG_ACTIVE: AtomicBool = AtomicBool::new(false);
    static LAST_EXPLORER: AtomicBool = AtomicBool::new(false);

    /// Is the drop target Explorer? Live while our drag runs; afterwards the
    /// last answer is frozen, because Explorer copies on a background thread
    /// and reads the data *after* the drop, when the cursor may be elsewhere.
    fn cursor_over_explorer() -> bool {
        if !DRAG_ACTIVE.load(Relaxed) {
            return LAST_EXPLORER.load(Relaxed);
        }
        let v = unsafe {
            let mut p = POINT::default();
            if GetCursorPos(&mut p).is_err() {
                false
            } else {
                point_is_explorer(p)
            }
        };
        LAST_EXPLORER.store(v, Relaxed);
        v
    }

    /// Does the window at screen point `p` belong to Explorer / the desktop?
    pub fn point_is_explorer_xy(x: i32, y: i32) -> bool {
        unsafe { point_is_explorer(POINT { x, y }) }
    }

    unsafe fn point_is_explorer(p: POINT) -> bool {
        {
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

    fn fcf(f: *const FORMATETC) -> u16 {
        unsafe { f.as_ref().map(|f| f.cfFormat).unwrap_or(0) }
    }
    fn ftymed(f: *const FORMATETC) -> u32 {
        unsafe { f.as_ref().map(|f| f.tymed).unwrap_or(0) }
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
            dlog(&format!("GetData cf={} tymed={}", fcf(f), ftymed(f)));
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
            let ex = cursor_over_explorer();
            let r = if ex {
                unsafe { self.file.QueryGetData(f) }
            } else if is_text(f) {
                S_OK
            } else {
                DV_E_FORMATETC
            };
            dlog(&format!("QueryGetData cf={} tymed={} explorer={} -> {:#x}", fcf(f), ftymed(f), ex, r.0));
            r
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
            // OLE asks this ONCE when the drag starts (cursor still over us)
            // and caches the list for every other process. So always list
            // everything — the file formats AND text — and filter in GetData.
            dlog(&format!("EnumFormatEtc dir={dir}"));
            let mut all: Vec<FORMATETC> = Vec::new();
            unsafe {
                if let Ok(e) = self.file.EnumFormatEtc(dir) {
                    loop {
                        let mut one = [FORMATETC::default()];
                        let mut got = 0u32;
                        if e.Next(&mut one, Some(&mut got)) != S_OK || got == 0 {
                            break;
                        }
                        one[0].ptd = std::ptr::null_mut();
                        all.push(one[0]);
                    }
                }
                all.push(FORMATETC {
                    cfFormat: CF_UNICODETEXT.0,
                    ptd: std::ptr::null_mut(),
                    dwAspect: DVASPECT_CONTENT.0,
                    lindex: -1,
                    tymed: TYMED_HGLOBAL.0 as u32,
                });
                dlog(&format!("  advertised {} formats", all.len()));
                SHCreateStdEnumFmtEtc(&all)
            }
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

    // ------------------------------------------------------------------
    // Our own drop target for the line window (wry registers one only once,
    // at creation; it goes stale after the window is hidden and shown).
    // ------------------------------------------------------------------

    static ENTERED: AtomicBool = AtomicBool::new(false);
    pub fn drop_entered() -> bool {
        ENTERED.load(Relaxed)
    }
    pub fn reset_entered() {
        ENTERED.store(false, Relaxed);
    }

    /// For diagnostics: "child-class / root-class" of the window under the cursor.
    pub fn window_under_cursor() -> String {
        unsafe {
            let mut p = POINT::default();
            let _ = GetCursorPos(&mut p);
            let h = WindowFromPoint(p);
            let root = GetAncestor(h, GA_ROOT);
            let mut a = [0u16; 64];
            let mut b = [0u16; 64];
            let na = GetClassNameW(h, &mut a).max(0) as usize;
            let nb = GetClassNameW(root, &mut b).max(0) as usize;
            format!(
                "({},{}) {} / {}",
                p.x,
                p.y,
                String::from_utf16_lossy(&a[..na]),
                String::from_utf16_lossy(&b[..nb])
            )
        }
    }

    type DropCb = Box<dyn Fn(&'static str, Vec<String>) + Send + Sync>;
    static DROP_CB: OnceLock<DropCb> = OnceLock::new();

    pub fn set_drop_callback(f: DropCb) {
        let _ = DROP_CB.set(f);
    }

    fn emit_drop(kind: &'static str, paths: Vec<String>) {
        if let Some(cb) = DROP_CB.get() {
            cb(kind, paths);
        }
    }

    unsafe fn read_hdrop(obj: &IDataObject) -> Vec<String> {
        let fmt = FORMATETC {
            cfFormat: CF_HDROP.0,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        let Ok(mut med) = obj.GetData(&fmt) else {
            return Vec::new();
        };
        let h = HDROP(med.u.hGlobal.0);
        let n = DragQueryFileW(h, 0xFFFF_FFFF, None);
        let mut out = Vec::new();
        for i in 0..n {
            let len = DragQueryFileW(h, i, None) as usize;
            let mut buf = vec![0u16; len + 1];
            let got = DragQueryFileW(h, i, Some(&mut buf)) as usize;
            out.push(String::from_utf16_lossy(&buf[..got.min(len)]));
        }
        ReleaseStgMedium(&mut med);
        out
    }

    #[implement(IDropTarget)]
    struct FileDrop {
        ok: Cell<bool>,
    }

    impl IDropTarget_Impl for FileDrop_Impl {
        fn DragEnter(
            &self,
            obj: Option<&IDataObject>,
            _k: MODIFIERKEYS_FLAGS,
            _pt: &POINTL,
            eff: *mut DROPEFFECT,
        ) -> Result<()> {
            let paths = obj.map(|o| unsafe { read_hdrop(o) }).unwrap_or_default();
            let ok = !paths.is_empty();
            self.ok.set(ok);
            dlog(&format!("droptarget enter files={}", paths.len()));
            unsafe { *eff = if ok { DROPEFFECT_COPY } else { DROPEFFECT_NONE } };
            if ok {
                ENTERED.store(true, Relaxed);
                emit_drop("enter", paths);
            }
            Ok(())
        }
        fn DragOver(&self, _k: MODIFIERKEYS_FLAGS, _pt: &POINTL, eff: *mut DROPEFFECT) -> Result<()> {
            unsafe { *eff = if self.ok.get() { DROPEFFECT_COPY } else { DROPEFFECT_NONE } };
            if self.ok.get() {
                emit_drop("over", Vec::new());
            }
            Ok(())
        }
        fn DragLeave(&self) -> Result<()> {
            if self.ok.get() {
                emit_drop("leave", Vec::new());
            }
            self.ok.set(false);
            Ok(())
        }
        fn Drop(
            &self,
            obj: Option<&IDataObject>,
            _k: MODIFIERKEYS_FLAGS,
            _pt: &POINTL,
            eff: *mut DROPEFFECT,
        ) -> Result<()> {
            let paths = obj.map(|o| unsafe { read_hdrop(o) }).unwrap_or_default();
            dlog(&format!("droptarget drop files={}", paths.len()));
            self.ok.set(false);
            unsafe { *eff = if paths.is_empty() { DROPEFFECT_NONE } else { DROPEFFECT_COPY } };
            if !paths.is_empty() {
                emit_drop("drop", paths);
            }
            Ok(())
        }
    }

    thread_local! {
        static TARGETS: RefCell<Vec<IDropTarget>> = RefCell::new(Vec::new());
    }

    unsafe extern "system" fn collect_child(h: HWND, l: LPARAM) -> WBOOL {
        let v = &mut *(l.0 as *mut Vec<HWND>);
        v.push(h);
        WBOOL(1)
    }

    /// (Re)register our drop target on the window and all its children.
    /// Must run on the window's (main) thread.
    pub fn install_drop_target(parent: isize) {
        init_ole();
        unsafe {
            let parent = HWND(parent as *mut core::ffi::c_void);
            let mut hwnds: Vec<HWND> = vec![parent];
            let _ = EnumChildWindows(
                parent,
                Some(collect_child),
                LPARAM(&mut hwnds as *mut Vec<HWND> as isize),
            );
            let mut n = 0;
            TARGETS.with(|t| {
                let mut t = t.borrow_mut();
                t.clear();
                for h in hwnds {
                    let target: IDropTarget = FileDrop { ok: Cell::new(false) }.into();
                    let _ = RevokeDragDrop(h);
                    if RegisterDragDrop(h, &target).is_ok() {
                        n += 1;
                        t.push(target);
                    }
                }
            });
            dlog(&format!("drop target installed on {n} window(s)"));
        }
    }

    // ------------------------------------------------------------------
    // Fallback for the top-edge catch: when a drag from Explorer is released
    // over the line but Windows never delivered it to our drop target, ask
    // Explorer which items are selected in the window the drag began in —
    // dragged items are always the selected ones.
    // ------------------------------------------------------------------

    pub fn explorer_selection_at(x: i32, y: i32) -> Vec<String> {
        use windows::core::{Interface, VARIANT};
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, IServiceProvider, CLSCTX_ALL,
            COINIT_APARTMENTTHREADED,
        };
        use windows::Win32::UI::Shell::{
            IFolderView2, IShellBrowser, IShellWindows, IWebBrowserApp, ShellWindows,
            SIGDN_FILESYSPATH, SID_STopLevelBrowser, SWC_DESKTOP, SWFO_NEEDDISPATCH,
        };
        use windows::Win32::UI::WindowsAndMessaging::IsWindowVisible;

        unsafe fn selection_of(disp: &windows::Win32::System::Com::IDispatch) -> Option<(HWND, Vec<String>)> {
            let sp: IServiceProvider = disp.cast().ok()?;
            let sb: IShellBrowser = sp.QueryService(&SID_STopLevelBrowser).ok()?;
            let view = sb.QueryActiveShellView().ok()?;
            let view_hwnd = view.GetWindow().unwrap_or_default();
            let fv: IFolderView2 = view.cast().ok()?;
            let arr = fv.GetSelection(false).ok()?;
            let n = arr.GetCount().ok()?;
            let mut out = Vec::new();
            for i in 0..n {
                if let Ok(item) = arr.GetItemAt(i) {
                    if let Ok(p) = item.GetDisplayName(SIGDN_FILESYSPATH) {
                        out.push(p.to_string().unwrap_or_default());
                        CoTaskMemFree(Some(p.0 as *const _));
                    }
                }
            }
            out.retain(|s| !s.is_empty());
            Some((view_hwnd, out))
        }

        // Run on a fresh STA thread so COM state never leaks into other threads.
        std::thread::spawn(move || unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let h = WindowFromPoint(POINT { x, y });
            let root = GetAncestor(h, GA_ROOT);
            let mut buf = [0u16; 64];
            let n = GetClassNameW(root, &mut buf).max(0) as usize;
            let cls = String::from_utf16_lossy(&buf[..n]);
            let Ok(sw) = CoCreateInstance::<_, IShellWindows>(&ShellWindows, None, CLSCTX_ALL) else {
                dlog("selection: no ShellWindows");
                return Vec::new();
            };
            if cls == "Progman" || cls == "WorkerW" {
                let loc = VARIANT::from(0i32); // CSIDL_DESKTOP
                let root_v = VARIANT::default();
                let mut hw = 0i32;
                if let Ok(d) = sw.FindWindowSW(&loc, &root_v, SWC_DESKTOP, &mut hw, SWFO_NEEDDISPATCH) {
                    if let Some((_, v)) = selection_of(&d) {
                        dlog(&format!("selection: desktop -> {} item(s)", v.len()));
                        return v;
                    }
                }
                return Vec::new();
            }
            // A folder window; with tabs several entries share the HWND —
            // take the one whose view is visible.
            let count = sw.Count().unwrap_or(0);
            let mut fallback = Vec::new();
            for i in 0..count {
                let Ok(d) = sw.Item(&VARIANT::from(i)) else { continue };
                let Ok(wb) = d.cast::<IWebBrowserApp>() else { continue };
                let Ok(wh) = wb.HWND() else { continue };
                if wh.0 as isize != root.0 as isize {
                    continue;
                }
                if let Some((vh, v)) = selection_of(&d) {
                    if IsWindowVisible(vh).as_bool() {
                        dlog(&format!("selection: folder window -> {} item(s)", v.len()));
                        return v;
                    }
                    if fallback.is_empty() {
                        fallback = v;
                    }
                }
            }
            dlog(&format!("selection: fallback {} item(s) (class {cls})", fallback.len()));
            fallback
        })
        .join()
        .unwrap_or_default()
    }

    /// Run a modal OLE drag of `text`, backed by `file` for Explorer drops.
    /// Must be called on the UI (main) thread. Returns true if dropped.
    pub fn drag_text(text: &str, file: &PathBuf) -> std::result::Result<bool, String> {
        init_ole();
        let mut wtext: Vec<u16> = text.encode_utf16().collect();
        wtext.push(0);
        let wfile: Vec<u16> = file.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        unsafe {
            dlog(&format!("drag_text start, file={}", file.display()));
            LAST_EXPLORER.store(false, Relaxed);
            DRAG_ACTIVE.store(true, Relaxed);
            let file = shell_file_object(&wfile).map_err(|e| { dlog(&format!("shell_file_object failed: {e}")); e.to_string() })?;
            let data: IDataObject = TextData { text: wtext, file }.into();
            let src: IDropSource = DropSource.into();
            let mut eff = DROPEFFECT::default();
            let hr = DoDragDrop(&data, &src, DROPEFFECT_COPY | DROPEFFECT_MOVE, &mut eff);
            DRAG_ACTIVE.store(false, Relaxed);
            dlog(&format!("DoDragDrop -> {:#x}, effect={}", hr.0, eff.0));
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
    pub fn point_is_explorer_xy(_x: i32, _y: i32) -> bool {
        false
    }
    pub fn set_drop_callback(_f: Box<dyn Fn(&'static str, Vec<String>) + Send + Sync>) {}
    pub fn install_drop_target(_parent: isize) {}
    pub fn drop_entered() -> bool {
        false
    }
    pub fn reset_entered() {}
    pub fn window_under_cursor() -> String {
        String::new()
    }
    pub fn explorer_selection_at(_x: i32, _y: i32) -> Vec<String> {
        Vec::new()
    }
}

pub use imp::*;
