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
  /** Wall-clock time in ms (the Smithy's upgrades run on it). */
  clock(): number;
  /** The names of the mine's smiths (who work the Smithy's upgrades). */
  smiths(): string[];
  /** A dev option changed: applies what it grants, saves and refreshes. */
  devChanged(): void;
  /** Dev: adds `ms` of idle time, as if the game had been closed that long. */
  addIdle(ms: number): void;
  /** Replaces the save with a fresh one. */
  eraseAll(): void;
}
