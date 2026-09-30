import { RESEARCH, type ResearchRecord } from "../archives.ts";

/** How long each notification shows before it leaves, and how long it
 * takes to slide away (its transition in `style.css`). */
const SHOWN_MS = 4000, LEAVE_MS = 450;

/** Announces each research level completed, one at a time: a box at the
 * top of the screen over everything else, "Research Complete!" over the
 * project and level, shown for four seconds and then sliding up out of
 * sight. Levels completed together (such as those finished while the game
 * was closed) wait their turn in order. With Reduce motion on, each box
 * leaves without sliding. */
export class ResearchToasts {
  private queue: ResearchRecord[] = [];
  private showing = false;

  constructor(private reduceMotion: () => boolean) {}

  add(done: readonly ResearchRecord[]) {
    this.queue.push(...done);
    if (!this.showing) this.next();
  }

  private next() {
    const record = this.queue.shift();
    this.showing = !!record;
    if (!record) return;
    const box = document.createElement("div");
    box.className = "research-toast";
    box.setAttribute("role", "status");
    box.innerHTML = `<b>Research Complete!</b><span>${RESEARCH[record.research].name} · Level ${record.level}</span>`;
    // Outside #app, and in the browser's top layer where it has one, so it
    // shows over open dialogs too.
    box.setAttribute("popover", "manual");
    document.body.append(box);
    if ("showPopover" in box) box.showPopover();
    setTimeout(() => {
      box.classList.add("leaving");
      setTimeout(() => {
        box.remove();
        this.next();
      }, this.reduceMotion() ? 0 : LEAVE_MS);
    }, SHOWN_MS);
  }
}
