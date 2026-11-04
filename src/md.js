"use strict";
/* A tiny, safe Markdown renderer shared by the note cards, the note editor's
 * preview and the reminder card. Everything is escaped first; only the
 * markup below is produced. Notes are line-oriented, so each source line
 * becomes one block (no paragraph re-flowing), which keeps line numbers
 * stable for ticking checkboxes.
 *
 *   # / ## / ###   headings          **bold**  __bold__   *italic*  _italic_
 *   - item / * item / 1. item        ~~strike~~  `code`   [text](url)  bare URLs
 *   - [ ] / [ ] / [] / [x]  to-dos   > quote    --- rule  ``` code block ```
 */
(function (g) {
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // A to-do line: optional indent, optional list bullet, then [ ] / [x] / [].
  const TASK = /^(\s*)(?:[-*+]\s+)?\[( |x|X)?\]\s?(.*)$/;
  function task(line) {
    const m = String(line || "").match(TASK);
    return m ? { indent: m[1].length, done: (m[2] || "").toLowerCase() === "x", text: m[3] } : null;
  }

  function inline(src) {
    const keep = [];
    const hold = (html) => "\u0001" + (keep.push(html) - 1) + "\u0002";
    let s = String(src || "");
    s = s.replace(/`([^`]+)`/g, (_, c) => hold("<code>" + esc(c) + "</code>"));
    s = s.replace(/\[([^\]\n]+)\]\(\s*([^)\s]+)\s*\)/g, (_, txt, url) => hold(`<a class="md-a" data-href="${esc(url)}" title="${esc(url)}">${inlineText(txt)}</a>`));
    s = s.replace(/\b((?:https?:\/\/|www\.)[^\s<>"'，。；、）)]+[^\s<>"'，。；、）).,;:!?])/gi, (_, url) => hold(`<a class="md-a" data-href="${esc(url)}">${esc(url)}</a>`));
    s = inlineText(s);
    return s.replace(/\u0001(\d+)\u0002/g, (_, i) => keep[+i]);
  }
  function inlineText(s) {
    s = esc(s);
    s = s.replace(/\*\*(?=\S)(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^\w])__(?=\S)(.+?)__(?=[^\w]|$)/g, "$1<b>$2</b>");
    s = s.replace(/~~(?=\S)(.+?)~~/g, "<s>$1</s>");
    s = s.replace(/(^|[^*\w])\*(?=[^\s*])(.+?)\*(?!\*)/g, "$1<i>$2</i>").replace(/(^|[^\w])_(?=[^\s_])(.+?)_(?=[^\w]|$)/g, "$1<i>$2</i>");
    return s;
  }

  /* The note title: first non-empty line, minus heading / to-do / bullet marks. */
  function titleOf(body) {
    const lines = String(body || "").split("\n");
    const i = lines.findIndex((l) => l.trim());
    if (i < 0) return { index: -1, text: "" };
    return { index: i, text: plainLine(lines[i]) };
  }
  function plainLine(l) {
    const t = task(l);
    if (t) return t.text;
    return String(l).replace(/^\s*#{1,6}\s+/, "").replace(/^\s*>\s?/, "").replace(/^\s*[-*+]\s+/, "").trim();
  }

  /* Render `src` (or only lines >= opts.from) into block HTML.
   * To-do boxes carry data-idx = their line number in `src`. */
  function render(src, opts) {
    opts = opts || {};
    const lines = String(src || "").replace(/\r/g, "").split("\n");
    const from = opts.from || 0;
    let out = "", gap = false, fence = null;
    const pad = (n) => (n >= 2 ? ` style="margin-left:${Math.min(4, Math.floor(n / 2)) * 14}px"` : "");
    for (let i = from; i < lines.length; i++) {
      const l = lines[i];
      if (fence !== null) {
        if (/^\s*```/.test(l)) { out += `<pre class="md-pre">${esc(fence.join("\n"))}</pre>`; fence = null; }
        else fence.push(l);
        continue;
      }
      if (/^\s*```/.test(l)) { fence = []; gap = false; continue; }
      if (!l.trim()) { if (out && !gap) { out += '<div class="md-gap"></div>'; gap = true; } continue; }
      gap = false;
      let m;
      const tk = task(l);
      if (tk) {
        out += `<div class="md-li md-task${tk.done ? " done" : ""}"${pad(tk.indent)}><span class="box" data-idx="${i}">${tk.done ? "✓" : ""}</span><span class="md-tx">${inline(tk.text)}</span></div>`;
      } else if ((m = l.match(/^\s*(#{1,6})\s+(.*)$/))) {
        out += `<div class="md-h md-h${Math.min(3, m[1].length)}">${inline(m[2])}</div>`;
      } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
        out += '<div class="md-hr"></div>';
      } else if ((m = l.match(/^\s*>\s?(.*)$/))) {
        out += `<div class="md-quote">${inline(m[1]) || "&nbsp;"}</div>`;
      } else if ((m = l.match(/^(\s*)[-*+]\s+(.*)$/))) {
        out += `<div class="md-li"${pad(m[1].length)}><span class="md-dot">•</span><span class="md-tx">${inline(m[2])}</span></div>`;
      } else if ((m = l.match(/^(\s*)(\d{1,3})[.)]\s+(.*)$/))) {
        out += `<div class="md-li"${pad(m[1].length)}><span class="md-num">${m[2]}.</span><span class="md-tx">${inline(m[3])}</span></div>`;
      } else {
        out += `<div class="md-p">${inline(l)}</div>`;
      }
    }
    if (fence !== null) out += `<pre class="md-pre">${esc(fence.join("\n"))}</pre>`;
    if (gap) out = out.replace(/<div class="md-gap"><\/div>$/, "");
    return out;
  }

  /* [done, total] of to-do lines (optionally from a given line on). */
  function progress(src, from) {
    let done = 0, total = 0;
    String(src || "").split("\n").forEach((l, i) => { if (i < (from || 0)) return; const t = task(l); if (t) { total++; if (t.done) done++; } });
    return [done, total];
  }

  /* Flip the to-do on line `idx`; returns the new text (unchanged if not a to-do). */
  function toggle(src, idx) {
    const lines = String(src || "").split("\n");
    const m = lines[idx] && lines[idx].match(/^(\s*(?:[-*+]\s+)?)\[( |x|X)?\](.*)$/);
    if (!m) return src;
    const done = (m[2] || "").toLowerCase() === "x";
    let rest = m[3];
    if (rest && !/^\s/.test(rest)) rest = " " + rest;
    lines[idx] = `${m[1]}[${done ? " " : "x"}]${rest}`;
    return lines.join("\n");
  }

  /* Markdown -> plain text (for one-line summaries / tooltips). */
  function plain(src) {
    return String(src || "").split("\n").map(plainLine).join("\n")
      .replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/~~(.+?)~~/g, "$1")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1$2");
  }

  /* CHANGELOG.md → [{ version: "1.7.0", date: "2026-11-04", body: "…" }], in
   * file order (newest first). Each release starts with "## v1.7.0 · date";
   * anything before the first one is the file's own preamble. */
  function releases(src) {
    const out = [];
    let cur = null;
    String(src || "").replace(/\r/g, "").split("\n").forEach((l) => {
      const m = l.match(/^##\s+v?(\d+\.\d+\.\d+)\s*(?:[·\-–—]\s*(.*))?$/);
      if (m) { cur = { version: m[1], date: (m[2] || "").trim(), lines: [] }; out.push(cur); return; }
      if (cur) cur.lines.push(l);
    });
    return out.map((r) => ({ version: r.version, date: r.date, body: r.lines.join("\n").trim() }));
  }

  g.MD = { esc, inline, render, titleOf, plainLine, task, progress, toggle, plain, releases };
})(window);
