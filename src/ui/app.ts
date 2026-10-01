import type { Save } from "../save.ts";
import type { Tab } from "./dom.ts";

/** What pages need from the app around them. */
export interface AppContext {
  /** The save, read live (erasing progress replaces it). */
  save(): Save;
  /** The one shared dialog element. */
  readonly modal: HTMLDialogElement;
  /** Persists the save and refreshes the currency bar. */
  update(): void;
  /** Re-renders the current page. */
  renderPage(): void;
  navigate(tab: Tab): void;
  /** Wall-clock time in ms (Training runs on it). */
  clock(): number;
  /** Replaces the save with a fresh one. */
  eraseAll(): void;
}
