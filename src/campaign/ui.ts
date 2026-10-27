/** Siege controls over the native two-sided Defend battle. */
import { SpellBar, STRIKE_SPELLS, castStrike } from "../ui/spell-bar.ts";
import type { Save } from "../save.ts";
import { DefendRenderer } from "../defend/render.ts";
import { BoardPointers } from "../defend/board-pointers.ts";
import { artLook } from "../defend/tower-art.ts";
import { STRUCTURES, type PaletteItem } from "../defend/catalog.ts";
import { paintIcon } from "../defend/structure-art.ts";
import { flagSvg, escapeText } from "../profile/model.ts";
import { newSiege, nextOpponent, settleRaid } from "./siege-progress.ts";
import { CampaignSim } from "./sim.ts";
export type CampaignHost = { save: () => Save; store: () => void; editProfile?: () => void; levelSelect?: () => void };
export class CampaignPage {
  sim: CampaignSim;
  private readonly canvas = document.createElement("canvas");
  private readonly renderer: DefendRenderer;
  private readonly pointers: BoardPointers;
  private last = 0;
  private now = 0;
  private paused = false;
  private rewarded = false;
  private inspection: number | undefined;
  private spellBar?: SpellBar;
  private notice = "";
  private freshCamera = true;
  constructor(
    private root: HTMLElement,
    readonly mode: "siege",
    private host: CampaignHost,
  ) {
    if (host.save().siege?.raid.state === "started") settleRaid(host.save().siege!, false);
    this.sim = this.make();
    this.renderer = new DefendRenderer(this.canvas);
    this.canvas.setAttribute("aria-label", "Enemy castle and infantry muster ground");
    this.pointers = new BoardPointers({ renderer: () => this.renderer, pickUp: () => false, drop: () => {}, tap: (e) => this.tap(e) });
    this.canvas.onpointerdown = (e) => this.pointers.down(e);
    this.canvas.onpointermove = (e) => {
      if (this.spellBar) {
        const p = this.renderer.toCell(e.clientX, e.clientY);
        this.spellBar.point = { x: p.fx, y: p.fy };
      }
    };
    this.root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.spellBar?.cancel();
    });
    this.canvas.oncontextmenu = (e) => e.preventDefault();
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.renderer.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
  }
  private make() {
    const s = this.host.save();
    s.siege ??= newSiege(crypto.getRandomValues(new Uint32Array(1))[0]);
    return new CampaignSim("siege", 0, [], s.defend.owned, s.defend.levels, s.siege.raid.castle, s);
  }
  show() {
    this.last = 0;
    if (this.sim.phase === "build") this.sim = this.make();
    this.render();
  }
  pause() {
    this.last = 0;
    this.pointers.end();
    this.spellBar?.cancel();
  }
  reset() {
    this.pause();
    this.sim = this.make();
    this.paused = false;
    this.rewarded = false;
    this.spellBar?.cancel();
    this.inspection = undefined;
    this.notice = "";
    this.freshCamera = true;
    this.render();
  }
  private render() {
    this.pointers.end();
    const s = this.host.save(),
      siege = s.siege!,
      raid = siege.raid,
      profile = s.profile,
      finished = raid.state === "won" || raid.state === "lost";
    this.root.classList.add("native-campaign");
    this.root.innerHTML =
      '<div class="campaign-head defend-head">' +
      (profile
        ? '<div class="siege-profile">' +
          flagSvg(profile.flag) +
          '<div><strong class="siege-profile-name">' +
          escapeText(profile.name) +
          '</strong></div><button data-action="profile">Edit profile</button></div>'
        : "") +
      '<details class="siege-opponent"><summary><strong>' +
      raid.castle.owner.name +
      '</strong> <small class="siege-bot">BOT</small> · ' +
      raid.defender +
      " defense / " +
      siege.mmr +
      " MMR</summary>" +
      "<p>Your attack MMR: <b>" +
      siege.mmr +
      "</b> · " +
      siege.wins +
      "/" +
      siege.games +
      " wins</p><p>Castle defense rating: " +
      raid.defender +
      " (estimated).</p>" +
      "<p>Starting a ranked raid commits it: defeat, forfeit or reload counts as a loss.</p><small>Defense ratings are provisional until calibrated against raid results.</small>" +
      (finished
        ? "<p>Last rated result: " +
          (raid.state === "won" ? "Victory" : "Defeat") +
          " · MMR " +
          (raid.delta ?? 0) +
          ". This target is available for unrated practice.</p>"
        : "") +
      "</details>" +
      '<div class="campaign-actions"><button data-action="start">' +
      (this.sim.phase === "build" ? (finished ? "Start practice" : "Start ranked raid") : this.paused ? "Resume" : "Pause") +
      "</button>" +
      '<button data-action="retry">' +
      (raid.state === "started" ? "Forfeit / rebuild" : finished ? "Practice again" : "Rebuild") +
      '</button><button data-action="next" ' +
      (finished ? "" : "hidden") +
      ">Find next opponent</button></div>" +
      '<div class="campaign-spells"></div><p class="campaign-status" role="status" aria-live="polite"></p></div>' +
      '<div class="campaign-stage defend-stage side-open"><aside class="defend-side"><div class="campaign-roster defend-palette"></div></aside><div class="campaign-board defend-board"></div></div>';
    this.root.querySelector(".campaign-board")!.append(this.canvas);
    const profileButton = this.root.querySelector<HTMLButtonElement>('[data-action="profile"]');
    if (profileButton)
      profileButton.onclick = () => {
        if (this.sim.phase === "battle") {
          this.paused = true;
          this.render();
        }
        this.host.editProfile?.();
      };
    this.root.querySelector<HTMLButtonElement>('[data-action="start"]')!.onclick = () => {
      if (this.sim.phase === "build") {
        if (!this.sim.start()) {
          this.notice = "Buy an infantry building in Tiles before starting a raid.";
          this.refresh();
          return;
        }
        if (raid.state === "offered") {
          raid.state = "started";
          this.host.store();
        }
      } else if (this.sim.phase === "battle") this.paused = !this.paused;
      this.render();
    };
    this.root.querySelector<HTMLButtonElement>('[data-action="retry"]')!.onclick = () => {
      if (settleRaid(siege, false)) this.host.store();
      this.reset();
    };
    this.root.querySelector<HTMLButtonElement>('[data-action="next"]')!.onclick = () => {
      if (nextOpponent(siege)) {
        this.host.store();
        this.reset();
      }
    };
    const kinds = [...new Set(this.sim.layout.map((b) => b.kind))];
    this.root.querySelector(".campaign-roster")!.innerHTML =
      kinds
        .map(
          (kind) =>
            '<div class="siege-building"><canvas width="48" height="48" data-kind="' +
            kind +
            '"></canvas><span>' +
            STRUCTURES[kind].name +
            "</span><small>" +
            this.sim.layout.filter((b) => b.kind === kind).length +
            " deployed</small></div>",
        )
        .join("") || "<p>No infantry buildings owned. Buy a Melee Guild or Ranged Guild in Tiles.</p>";
    this.root.querySelectorAll<HTMLCanvasElement>("[data-kind]").forEach((c) => paintIcon(c, c.dataset.kind as PaletteItem));
    this.spellBar = new SpellBar(STRIKE_SPELLS.filter((spell) => this.sim.engine.bonuses[spell]));
    this.root.querySelector(".campaign-spells")!.remove();
    this.root.querySelector(".campaign-board")!.append(this.spellBar.el);
    this.refresh();
    this.draw();
  }
  frame(now: number) {
    this.now = now;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (!this.paused) this.sim.step(dt);
    if (!this.rewarded && (this.sim.phase === "won" || this.sim.phase === "lost")) {
      this.rewarded = true;
      if (settleRaid(this.host.save().siege!, this.sim.phase === "won")) this.host.store();
      this.render();
    }
    this.refresh();
    this.draw();
  }
  private refresh() {
    const s = this.sim;
    this.root.querySelector(".campaign-status")!.textContent =
      this.notice ||
      (s.phase === "build"
        ? s.layout.length + " infantry buildings deployed. Start the raid to release their troops."
        : s.phase === "won"
          ? "Victory! The keep has fallen."
          : s.phase === "lost"
            ? "Defeat. Rebuild your formation and try again."
            : (this.paused ? "Paused · " : "") +
              "Keep " +
              Math.ceil(s.raid.defense.keepHp()) +
              "/" +
              Math.ceil(s.raid.defense.keepMaxHp()) +
              " · " +
              s.allies.length +
              " troops · " +
              Math.max(0, 240 - Math.floor(s.elapsed)) +
              "s");
    this.root.querySelector<HTMLButtonElement>('[data-action="start"]')!.disabled = s.phase === "won" || s.phase === "lost";
    this.spellBar?.update(s.engine, s.phase === "battle", this.host.save().settings.reduceMotion);
  }
  private tap(e: PointerEvent) {
    const p = this.renderer.toCell(e.clientX, e.clientY),
      at = { x: p.fx, y: p.fy },
      s = this.sim.engine;
    if (this.spellBar?.armed && this.sim.phase === "battle") {
      if (castStrike(s, this.spellBar.armed, at)) this.spellBar.cancel();
      return;
    }
    this.inspection = this.sim.map.buildings.find(
      (b) => !b.hidden && p.fx >= b.rect.x && p.fx < b.rect.x + b.rect.w && p.fy >= b.rect.y && p.fy < b.rect.y + b.rect.h,
    )?.id;
  }
  private draw() {
    const r = this.renderer,
      box = this.canvas.getBoundingClientRect();
    r.resize(box.width, box.height);
    if (this.freshCamera) {
      r.resetCam();
      this.freshCamera = false;
    }
    const sim = this.sim.renderSim,
      settings = this.host.save().settings,
      looks: Record<number, string> = {};
    for (const b of this.sim.map.buildings) {
      const paths = b.structureUid !== undefined ? sim.bonuses.structurePaths?.[b.structureUid] : undefined;
      if (paths) {
        const look = artLook(b.kind, Object.values(paths)[0]?.path);
        if (look) looks[b.structureUid!] = look;
      }
    }
    const owner = this.inspection !== undefined && this.sim.raid.field.defenderIds.has(this.inspection) ? this.sim.raid.defense : this.sim.engine;
    r.draw(this.sim.map, sim, this.spellBar?.overlay(this.sim.engine) ?? null, {
      area: "moss",
      grid: 0,
      weather: null,
      night: 0,
      now: this.now,
      reduceMotion: settings.reduceMotion,
      effects: !settings.effectsOff,
      healthbars: settings.showHealthbars,
      simpleEnemies: settings.simpleEnemies,
      simpleTroops: settings.simpleTroops,
      mergedOutlines: settings.mergedOutlines,
      looks,
      ...(this.inspection !== undefined ? { inspect: { id: this.inspection, armed: owner } } : {}),
    });
  }
}
