import { el } from "./dom.ts";

/** The Library: shelves waiting for their books. */
export function renderLibraryPage() {
  el("library").innerHTML = `<div class="page-title"><small>THE KEEP'S ARCHIVE</small><h2>Library</h2>
    <p>Dusty shelves climb into the dark above a reading desk and a cold brazier.</p></div>
    <div class="library-shelf" aria-hidden="true">${"<i></i>".repeat(14)}</div>
    <div class="library-note"><h3>The archive is not yet open</h3><p>The scribes are still cataloguing these stacks. Return when the Library opens its doors.</p></div>`;
}
