//! Screenshots and OCR (Windows).
//!
//! * `capture_virtual_screen` grabs every monitor at once (GDI BitBlt over the
//!   virtual desktop, physical pixels) so the selection overlay can show a
//!   frozen picture and crop from it.
//! * `ocr_file` runs the OCR engine built into Windows (Windows.Media.Ocr):
//!   no model download, uses the languages installed on the system.
//!
//! Other platforms get stubs that return an error.

/// A captured desktop: RGBA pixels plus where the virtual screen starts.
pub struct Capture {
    pub img: image::RgbaImage,
    pub x: i32,
    pub y: i32,
}

#[cfg(target_os = "windows")]
mod imp {
    use super::Capture;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT,
        DIB_RGB_COLORS, SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN,
    };

    pub fn capture_virtual_screen() -> Result<Capture, String> {
        unsafe {
            let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
            let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
            let w = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            let h = GetSystemMetrics(SM_CYVIRTUALSCREEN);
            if w <= 0 || h <= 0 {
                return Err("无法获取屏幕尺寸".into());
            }
            let screen = GetDC(None);
            let mem = CreateCompatibleDC(screen);
            let bmp = CreateCompatibleBitmap(screen, w, h);
            let old = SelectObject(mem, bmp);
            let ok = BitBlt(mem, 0, 0, w, h, screen, x, y, SRCCOPY | CAPTUREBLT).is_ok();
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: w,
                    biHeight: -h, // top-down
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut buf = vec![0u8; (w as usize) * (h as usize) * 4];
            let lines = GetDIBits(
                mem,
                bmp,
                0,
                h as u32,
                Some(buf.as_mut_ptr() as *mut _),
                &mut info,
                DIB_RGB_COLORS,
            );
            SelectObject(mem, old);
            let _ = DeleteObject(bmp);
            let _ = DeleteDC(mem);
            ReleaseDC(None, screen);
            if !ok || lines == 0 {
                return Err("截屏失败".into());
            }
            // BGRA -> RGBA, opaque
            for px in buf.chunks_exact_mut(4) {
                px.swap(0, 2);
                px[3] = 255;
            }
            let img = image::RgbaImage::from_raw(w as u32, h as u32, buf)
                .ok_or_else(|| "截屏数据无效".to_string())?;
            Ok(Capture { img, x, y })
        }
    }

    /// Recognise text in an image file with the OCR built into Windows.
    pub fn ocr_file(path: &str) -> Result<String, String> {
        use windows::core::HSTRING;
        use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapDecoder, BitmapPixelFormat, SoftwareBitmap};
        use windows::Media::Ocr::OcrEngine;
        use windows::Storage::{FileAccessMode, StorageFile};
        use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

        // Small text recognises far better when enlarged first.
        let src = image::open(path).map_err(|e| format!("无法打开图片：{e}"))?;
        let (w, h) = (src.width(), src.height());
        let longest = w.max(h);
        let scale = if longest < 1000 { 2.0 } else { 1.0 };
        let max_dim = OcrEngine::MaxImageDimension().unwrap_or(10000) as f64;
        let mut s = scale;
        if (longest as f64) * s > max_dim {
            s = max_dim / longest as f64;
        }
        let tmp = std::env::temp_dir().join("ClipLine").join("ocr-input.png");
        let _ = std::fs::create_dir_all(tmp.parent().unwrap());
        let prepared = if (s - 1.0).abs() > 0.01 {
            src.resize(
                ((w as f64) * s).round().max(1.0) as u32,
                ((h as f64) * s).round().max(1.0) as u32,
                image::imageops::FilterType::CatmullRom,
            )
        } else {
            src
        };
        prepared
            .to_rgba8()
            .save(&tmp)
            .map_err(|e| format!("无法准备图片：{e}"))?;

        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        let run = || -> windows::core::Result<String> {
            let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(tmp.to_string_lossy().as_ref()))?.get()?;
            let stream = file.OpenAsync(FileAccessMode::Read)?.get()?;
            let decoder = BitmapDecoder::CreateAsync(&stream)?.get()?;
            let bmp = decoder.GetSoftwareBitmapAsync()?.get()?;
            let bmp = SoftwareBitmap::ConvertWithAlpha(&bmp, BitmapPixelFormat::Bgra8, BitmapAlphaMode::Premultiplied)?;
            let engine = OcrEngine::TryCreateFromUserProfileLanguages()?;
            let result = engine.RecognizeAsync(&bmp)?.get()?;
            let mut out: Vec<String> = Vec::new();
            for line in result.Lines()? {
                let mut text = String::new();
                for word in line.Words()? {
                    let wtxt = word.Text()?.to_string();
                    if let (Some(prev), Some(next)) = (text.chars().last(), wtxt.chars().next()) {
                        // No spaces between CJK characters; keep them between Latin words.
                        if !(is_cjk(prev) || is_cjk(next)) {
                            text.push(' ');
                        }
                    }
                    text.push_str(&wtxt);
                }
                out.push(text);
            }
            Ok(out.join("\n"))
        };
        match run() {
            Ok(t) => Ok(t),
            Err(e) => {
                let msg = e.message().to_string();
                if msg.is_empty() || e.code().0 == 0 {
                    Err("系统未安装可用的 OCR 语言（设置 → 时间和语言 → 语言，添加中文/英文的「光学字符识别」）".into())
                } else {
                    Err(format!("OCR 失败：{msg}"))
                }
            }
        }
    }

    fn is_cjk(c: char) -> bool {
        matches!(c as u32,
            0x2E80..=0x9FFF | 0xAC00..=0xD7AF | 0xF900..=0xFAFF | 0xFF00..=0xFFEF | 0x3000..=0x303F)
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use super::Capture;
    pub fn capture_virtual_screen() -> Result<Capture, String> {
        Err("截图仅支持 Windows".into())
    }
    pub fn ocr_file(_path: &str) -> Result<String, String> {
        Err("OCR 仅支持 Windows".into())
    }
}

pub use imp::*;
