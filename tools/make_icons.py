#!/usr/bin/env python3
"""Regenerate every ClipLine icon from one SVG template.

  python3 tools/make_icons.py      (needs rsvg-convert and Pillow)

Writes assets/icon.svg, src-tauri/icons/{32x32,128x128,128x128@2x,icon}.png,
icon.ico, and the tray variants (src-tauri/icons/tray + src/img).
"""
import os, subprocess, tempfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# id: (gradient top, gradient bottom, peg)
COLORS = {
    "a": ("#e07a52", "#c95a36", "#7a2e17"),  # terracotta (exe icon)
    "b": ("#2a4a9e", "#152c6e", "#0a1640"),  # deep-sea blue
    "c": ("#e0262e", "#bf111b", "#6e0a10"),  # Leica red
    "d": ("#4a9eea", "#2b7fd6", "#123f73"),  # sky
    "e": ("#46a874", "#2c8f5d", "#14472d"),  # mint
}

def svg(top, bot, peg):
    return f'''<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bot}"/></linearGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#000" flood-opacity="0.22"/></filter>
<clipPath id="ph"><rect x="128" y="196" width="122" height="112" rx="10"/></clipPath></defs>
<rect x="20" y="20" width="472" height="472" rx="108" fill="url(#bg)"/>
<g fill="none" stroke="#ffffff" stroke-opacity="0.85" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
<path d="M 72 128 V 96 Q 72 72 96 72 H 128"/><path d="M 384 72 H 416 Q 440 72 440 96 V 128"/>
<path d="M 72 384 V 416 Q 72 440 96 440 H 128"/><path d="M 440 384 V 416 Q 440 440 416 440 H 384"/></g>
<path d="M 98 170 Q 256 208 414 170" fill="none" stroke="#ffffff" stroke-opacity="0.92" stroke-width="13" stroke-linecap="round"/>
<g filter="url(#sh)" transform="rotate(-6 189 290)"><rect x="112" y="180" width="154" height="196" rx="18" fill="#ffffff"/>
<g clip-path="url(#ph)"><rect x="128" y="196" width="122" height="112" fill="{top}" fill-opacity="0.22"/>
<circle cx="220" cy="226" r="14" fill="{bot}" fill-opacity="0.55"/>
<path d="M 120 316 L 168 252 L 196 284 L 216 262 L 260 316 Z" fill="{bot}" fill-opacity="0.8"/></g>
<line x1="132" y1="340" x2="196" y2="340" stroke="{bot}" stroke-opacity="0.3" stroke-width="11" stroke-linecap="round"/></g>
<g filter="url(#sh)" transform="rotate(6 335 290)"><rect x="262" y="188" width="148" height="186" rx="18" fill="#fdf8f2" fill-opacity="0.97"/>
<line x1="286" y1="240" x2="386" y2="240" stroke="{bot}" stroke-opacity="0.5" stroke-width="12" stroke-linecap="round"/>
<line x1="286" y1="278" x2="386" y2="278" stroke="{bot}" stroke-opacity="0.32" stroke-width="12" stroke-linecap="round"/>
<line x1="286" y1="316" x2="350" y2="316" stroke="{bot}" stroke-opacity="0.32" stroke-width="12" stroke-linecap="round"/></g>
<rect x="176" y="156" width="26" height="66" rx="10" fill="{peg}"/><rect x="322" y="162" width="26" height="66" rx="10" fill="{peg}"/>
</svg>
'''

def svg_small(top, bot, peg):
    """Simplified drawing for 16–32 px (tray, small ico frames): no corner
    marks, fewer and bolder strokes, laid out on a 32-unit grid."""
    return f'''<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bot}"/></linearGradient></defs>
<rect x="0.5" y="0.5" width="31" height="31" rx="7" fill="url(#bg)"/>
<path d="M 2.5 8 Q 16 11 29.5 8" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
<g transform="rotate(-5 10 17)"><rect x="3.5" y="9.5" width="12" height="16" rx="1.6" fill="#ffffff"/>
<rect x="5" y="11.5" width="9" height="8" rx="0.8" fill="{top}" fill-opacity="0.35"/>
<path d="M 5 19.5 L 8.4 14 L 11 17 L 12.4 15.6 L 14 17.4 L 14 19.5 Z" fill="{peg}" fill-opacity="0.85"/></g>
<g transform="rotate(5 22 17)"><rect x="16.5" y="10" width="12" height="15.5" rx="1.6" fill="#fdf8f2"/>
<path d="M 18.8 14 H 26.2 M 18.8 17.5 H 26.2 M 18.8 21 H 23.4" stroke="{bot}" stroke-opacity="0.85" stroke-width="2" stroke-linecap="round"/></g>
<rect x="8.6" y="6.2" width="2.4" height="6" rx="0.9" fill="{peg}"/><rect x="20.6" y="6.8" width="2.4" height="6" rx="0.9" fill="{peg}"/>
</svg>
'''

def render(src, size, out):
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), src, "-o", out], check=True)

def main():
    tmp = tempfile.mkdtemp()
    for k, c in COLORS.items():
        p = os.path.join(tmp, f"{k}.svg")
        open(p, "w").write(svg(*c))
        ps = os.path.join(tmp, f"{k}-small.svg")
        open(ps, "w").write(svg_small(*c))
        # the tray shows at 16–32 px, so it uses the simplified drawing
        for d in ("src-tauri/icons/tray", "src/img"):
            render(ps, 64, os.path.join(ROOT, d, f"tray-{k}.png"))
        if k == "a":
            open(os.path.join(ROOT, "assets/icon.svg"), "w").write(svg(*c))
            ic = os.path.join(ROOT, "src-tauri/icons")
            render(ps, 32, os.path.join(ic, "32x32.png"))
            for size, name in ((128, "128x128.png"), (256, "128x128@2x.png"), (512, "icon.png")):
                render(p, size, os.path.join(ic, name))
            # .ico: simplified frames up to 32 px, the full drawing from 48 px
            frames = []
            for size in (16, 24, 32, 48, 64, 128, 256):
                f = os.path.join(tmp, f"ico{size}.png")
                render(ps if size <= 32 else p, size, f)
                frames.append(Image.open(f).convert("RGBA"))
            frames[-1].save(os.path.join(ic, "icon.ico"), format="ICO",
                            sizes=[im.size for im in frames], append_images=frames[:-1])

if __name__ == "__main__":
    main()
