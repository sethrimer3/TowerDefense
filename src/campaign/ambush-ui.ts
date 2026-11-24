/** Level selection owns navigation; active battles still use the native campaign page. */
import { AmbushStarTree } from "./ambush-star-tree.ts";
import { ambushPool } from "../ambush-upgrades.ts";
import { iconImg } from "./ambush-icons.ts";
import { WorldMapView } from "./world-map-view.ts";
import { visibleLevels } from "./world-map.ts";
import { type CampaignHost } from "./host.ts";
import { AmbushBattlePage } from "./ambush-battle-ui.ts";
import { levelUnlocked, totalStars } from "./levels.ts";
import { t } from "../i18n/index.ts";
export class AmbushPage {
  private battle?: AmbushBattlePage;
  private running = false;
  private tree?: AmbushStarTree;
  private map?: WorldMapView;
  constructor(
    private root: HTMLElement,
    private host: CampaignHost,
  ) {}
  get sim() {
    return this.battle?.sim;
  }
  show() {
    if (this.running) this.battle!.show();
    else this.select();
  }
  reset() {
    this.battle?.pause();
    this.running = false;
    this.select();
  }
  pause() {
    this.battle?.pause();
    this.map?.destroy();
    this.map = undefined;
    this.tree?.destroy();
    this.tree = undefined;
  }
  frame(now: number) {
    if (this.running) this.battle!.frame(now);
  }
  private select() {
    this.tree?.destroy();
    this.tree = undefined;
    this.map?.destroy();
    this.running = false;
    this.battle?.pause();
    this.root.classList.remove("native-campaign");
    this.root.classList.add("ambush-select");
    const progress = this.host.save().campaigns.ambush;
    this.root.innerHTML = `<div class="ambush-select-head"><span class="ambush-total" aria-label="${t("ambush.stars", { stars: totalStars(progress), total: 90 })}">${iconImg("star", 2)} ${totalStars(progress)}/90</span><button data-star-tree>${t("ambush.starTree")} (${ambushPool(progress)} ★)</button></div><div class="ambush-map"></div>`;
    this.root.querySelector<HTMLButtonElement>("[data-star-tree]")!.onclick = () => {
      this.tree?.destroy();
      this.tree = new AmbushStarTree(
        this.root,
        progress,
        () => {
          this.host.store();
          this.root.querySelector("[data-star-tree]")!.textContent = t("ambush.starTree") + " (" + ambushPool(progress) + " ★)";
        },
        () => this.host.save().settings.reduceMotion,
      );
    };
    this.map = new WorldMapView(this.root.querySelector<HTMLElement>(".ambush-map")!, progress, {
      reduceMotion: () => this.host.save().settings.reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches,
      open: (index) => this.open(index),
      seen: () => {
        const count = visibleLevels(progress).length;
        if (progress.seen !== count) {
          progress.seen = count;
          this.host.store();
        }
      },
    });
  }
  private open(index: number) {
    if (!levelUnlocked(this.host.save().campaigns.ambush, index)) return;
    this.tree?.destroy();
    this.tree = undefined;
    this.map?.destroy();
    this.map = undefined;
    this.root.classList.remove("ambush-select");
    this.running = true;
    if (this.battle) this.battle.selectLevel(index);
    else this.battle = new AmbushBattlePage(this.root, index, { ...this.host, levelSelect: () => this.select() });
  }
}
