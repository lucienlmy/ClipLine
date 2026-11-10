/* Desktop-pin bookkeeping shared by pin.html (images) and pinnote.html
 * (text cards / notes). The line window keeps the list of pins in data.json
 * (state.desk) so they come back after a restart:
 *   pin:hello {label, spec, top}       — this window is open
 *   pin:geom  {label, x, y, w, h, top} — moved / resized / top toggled (physical px)
 *   pin:bye   {label}                  — closed by the user: forget it
 * Closing goes through PW.close() so the line window hears about it; when the
 * app quits the windows just go away and the pins stay saved. */
const PW = (() => {
  const T = window.__TAURI__;
  let w = null, label = "";
  try { w = T.window.getCurrentWindow(); label = w.label; } catch (e) {}
  let top = true, timer = null;
  async function geom() {
    if (!w) return;
    try {
      const p = await w.outerPosition(), s = await w.innerSize();
      await T.event.emit("pin:geom", { label, x: p.x, y: p.y, w: s.width, h: s.height, top });
    } catch (e) {}
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(geom, 400); };
  try { w.onMoved(later); w.onResized(later); } catch (e) {}
  return {
    label,
    win: w,
    get top() { return top; },
    async spec() {
      try { return (await T.core.invoke("get_pin", { label })) || {}; } catch (e) { return {}; }
    },
    hello(spec) {
      top = spec.top !== false;
      const s = Object.assign({}, spec); delete s.top; delete s.restored;
      try { T.event.emit("pin:hello", { label, spec: s, top }).catch(() => {}); } catch (e) {}
      setTimeout(geom, 300);
    },
    async setTop(on) {
      top = !!on;
      try { await w.setAlwaysOnTop(top); } catch (e) {}
      geom();
    },
    close() {
      const done = () => { try { w ? w.close() : window.close(); } catch (e) {} };
      try { T.event.emit("pin:bye", { label }).then(done, done); } catch (e) { done(); }
    },
  };
})();
