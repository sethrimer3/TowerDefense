/** How long a tapped notice takes to fade out. */
const FADE_MS = 220;

/** Fades a notice out quickly (its `fading` class), then lets `done` put it
 * away. */
export function fadeAway(el: HTMLElement, done: () => void) {
  if (el.classList.contains("fading")) return;
  el.classList.add("fading");
  setTimeout(() => {
    done();
    el.classList.remove("fading");
  }, FADE_MS);
}
