/** Browser chrome and keyboards can leave less visible space than 100dvh.
 * Follow that space at normal zoom; retain the layout while pinch-zooming. */
export function fitViewport() {
  const root = document.documentElement, viewport = window.visualViewport;
  let frame = 0, lastHeight = "", lastTop = "";
  const fit = () => {
    frame = 0;
    if (viewport && Math.abs(viewport.scale - 1) > .01) return;
    const height = viewport?.height ?? window.innerHeight, top = viewport?.offsetTop ?? 0;
    if (!Number.isFinite(height) || height <= 0) return;
    const h = `${Math.round(height * 100) / 100}px`, y = `${Math.round(Math.max(0, top) * 100) / 100}px`;
    if (h !== lastHeight) { root.style.setProperty("--app-height", h); lastHeight = h; }
    if (y !== lastTop) { root.style.setProperty("--app-offset-top", y); lastTop = y; }
  };
  const queue = () => { if (!frame) frame = requestAnimationFrame(fit); };
  fit();
  window.addEventListener("resize", queue);
  window.addEventListener("pageshow", queue);
  viewport?.addEventListener("resize", queue);
  viewport?.addEventListener("scroll", queue);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", queue);
    window.removeEventListener("pageshow", queue);
    viewport?.removeEventListener("resize", queue);
    viewport?.removeEventListener("scroll", queue);
  };
}
