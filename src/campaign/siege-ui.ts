/** Siege controls over the native two-sided Defend battle. */
import { t } from "../i18n/index.ts";
import { ManaCounter } from "../ui/mana-counter.ts";
import { gravesNear } from "../defend/necromancy.ts";
import { cellAt } from "../defend/pathing.ts";
import { SIEGE_MANA, SPELL_MANA } from "./siege-mana.ts";
import { SpellBar, STRIKE_SPELLS, castStrike, type SpellBarGate } from "../ui/spell-bar.ts";
import type { CampaignHost } from "./host.ts";
import { DefendRenderer } from "../defend/render.ts";
import { BoardPointers } from "../defend/board-pointers.ts";
import { artLook } from "../defend/tower-art.ts";
import { renderSiegeEntry, paintRanks } from "./siege-entry.ts";
import { bannerPlate, Banners, TroopBox } from "./siege-hud.ts";
import { botFlag } from "./bot-identity.ts";
import { defaultFlag } from "../profile/model.ts";
import { newSiege, findMatch, settleRaid } from "./siege-progress.ts";
import { CampaignSim } from "./sim.ts";
export class SiegePage {
  sim: CampaignSim;
  private readonly canvas = document.createElement("canvas");
  private readonly renderer: DefendRenderer;
  private readonly pointers: BoardPointers;
  private view: "entry" | "match" | "battle" = "entry";
  private disposeEntry?: () => void;
  private last = 0;
  private now = 0;
  private paused = false;
  private rewarded = false;
  private inspection: number | undefined;
  private spellBar?: SpellBar;
  private spellGate?: SpellBarGate;
  private manaCounter?: ManaCounter;
  private notice = "";
  private freshCamera = true;
  private readonly banners = new Banners();
  private readonly troops = new TroopBox();
  constructor(
    private root: HTMLElement,
    private host: CampaignHost,
  ) {
    if (host.save().siege?.raid.state === "started" && settleRaid(host.save().siege!, false)) queueMicrotask(() => host.store());
    this.sim = this.make();
    this.renderer = new DefendRenderer(this.canvas);
    this.canvas.setAttribute("aria-label", t("siege.board"));
    this.pointers = new BoardPointers({
      renderer: () => this.renderer,
      pickUp: () => false,
      drop: () => {},
      tap: (e) => this.tap(e),
    });
    this.canvas.onpointerdown = (e) => {
      this.plateFocus(e);
      this.pointers.down(e);
    };
    this.canvas.onpointerleave = () => this.root.querySelectorAll(".aim-under").forEach((p) => p.classList.remove("aim-under"));
    this.canvas.onpointermove = (e) => {
      this.plateFocus(e);
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
    this.disposeEntry?.();
    this.disposeEntry = undefined;
  }
  reset() {
    this.pause();
    this.view = "entry";
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
    this.disposeEntry?.();
    this.disposeEntry = undefined;
    this.root.dataset.siegeView = this.view;
    const s = this.host.save(),
      siege = s.siege!,
      raid = siege.raid,
      profile = s.profile,
      finished = raid.state === "won" || raid.state === "lost";
    this.root.classList.add("native-campaign");
    if (this.view !== "battle") {
      const identity = profile ?? { name: t("siege.you"), flag: defaultFlag() };
      this.disposeEntry = renderSiegeEntry(this.root, siege, identity, this.view, s.settings.reduceMotion, {
        find: () => {
          this.notice = "";
          this.inspection = undefined;
          if (findMatch(siege)) {
            this.host.store();
            this.sim = this.make();
            this.freshCamera = true;
            this.view = "match";
            this.render();
          }
        },
        attack: () => {
          this.sim = this.make();
          if (!this.sim.start()) {
            this.notice = t("siege.buyInfantry");
            this.render();
            return;
          }
          if (raid.state === "offered") {
            raid.state = "started";
            this.host.store();
          }
          this.view = "battle";
          this.paused = false;
          this.rewarded = false;
          this.freshCamera = true;
          this.last = 0;
          this.render();
        },
        back: () => {
          this.view = "entry";
          this.render();
        },
        profile: () => this.host.editProfile?.(),
        practice: () => {
          this.sim = this.make();
          this.paused = false;
          this.rewarded = false;
          this.freshCamera = true;
          this.last = 0;
          this.view = "battle";
          this.render();
        },
      });
      if (this.notice) {
        const notice = document.createElement("p");
        notice.className = "siege-entry-notice";
        notice.setAttribute("role", "status");
        notice.textContent = this.notice;
        this.root.querySelector(".siege-entry")!.append(notice);
      }
      return;
    }
    this.root.innerHTML =
      '<div class="campaign-head defend-head"><button data-action="profile">' +
      t("siege.editProfile") +
      "</button>" +
      '<div class="campaign-actions"><button data-action="start">' +
      (this.sim.phase === "build" ? (finished ? t("siege.practice") : t("siege.ranked")) : this.paused ? t("siege.resume") : t("siege.pause")) +
      "</button>" +
      '<button data-action="retry">' +
      (raid.state === "started" ? t("siege.forfeit") : finished ? t("siege.practiceAgain") : t("siege.rebuild")) +
      '</button><button data-action="next" ' +
      (finished ? "" : "hidden") +
      ">" +
      t("siege.next") +
      "</button></div>" +
      '<div class="campaign-spells"></div><p class="campaign-status" role="status" aria-live="polite"></p></div>' +
      '<div class="campaign-stage defend-stage"><div class="campaign-board defend-board"></div></div>';
    this.root.querySelector(".campaign-board")!.append(this.canvas);
    const board = this.root.querySelector(".campaign-board")!;
    const opponent = { name: raid.castle.owner.name, flag: raid.castle.owner.flag ?? botFlag(raid.castle.seed) },
      you = profile ?? { name: t("siege.you"), flag: defaultFlag() };
    board.insertAdjacentHTML("beforeend", bannerPlate(opponent, raid.defender, "top") + bannerPlate(you, siege.mmr, "bottom"));
    this.banners.attach(this.root, { top: opponent.flag, bottom: you.flag });
    this.troops.update(this.sim.allies);
    board.append(this.troops.el);
    paintRanks(this.root);
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
          this.notice = t("siege.buyInfantry");
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
      this.view = "entry";
      this.render();
    };
    this.spellBar = new SpellBar(STRIKE_SPELLS.filter((spell) => this.sim.engine.bonuses[spell]));
    const mana = this.sim.mana;
    this.spellGate = mana
      ? {
          ready: (spell) => mana.canCast(spell),
          fill: (spell) => mana.value / SPELL_MANA[spell],
          badge: (spell) => SPELL_MANA[spell],
          description: (spell) => t("siege.manaCost", { cost: SPELL_MANA[spell] }),
        }
      : undefined;
    this.manaCounter = mana && this.spellBar.el.childElementCount ? new ManaCounter() : undefined;
    if (this.manaCounter) {
      this.spellBar.el.classList.add("siege-spells");
      this.spellBar.el.append(this.manaCounter.el);
    }
    this.root.querySelector(".campaign-spells")!.remove();
    this.root.querySelector(".campaign-board")!.append(this.spellBar.el);
    this.refresh();
    this.draw();
  }
  frame(now: number) {
    this.now = now;
    if (this.view !== "battle") {
      this.last = 0;
      return;
    }
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (!this.paused) this.sim.step(dt);
    if (!this.rewarded && (this.sim.phase === "won" || this.sim.phase === "lost")) {
      this.rewarded = true;
      if (settleRaid(this.host.save().siege!, this.sim.phase === "won")) this.host.store();
      this.view = "entry";
      this.render();
      return;
    }
    this.refresh();
    this.draw();
  }
  private refresh() {
    const s = this.sim;
    this.root.querySelector(".campaign-status")!.textContent =
      this.notice ||
      (s.phase === "build"
        ? t("siege.ready", { count: s.layout.length })
        : s.phase === "won"
          ? t("siege.won")
          : s.phase === "lost"
            ? t("siege.lost")
            : (this.paused ? t("siege.paused") : "") +
              t("siege.status", {
                hp: Math.ceil(s.raid.defense.keepHp()),
                max: Math.ceil(s.raid.defense.keepMaxHp()),
                troops: s.allies.length,
                seconds: Math.max(0, 240 - Math.floor(s.elapsed)),
              }));
    this.root.querySelector<HTMLButtonElement>('[data-action="start"]')!.disabled = s.phase === "won" || s.phase === "lost";
    this.spellBar?.update(s.engine, s.phase === "battle", this.host.save().settings.reduceMotion, 1, this.spellGate);
    if (s.mana) this.manaCounter?.update(s.mana.value, SIEGE_MANA.cap);
    this.troops.update(s.allies);
  }
  private plateFocus(e: PointerEvent) {
    for (const p of Array.from(this.root.querySelectorAll<HTMLElement>(".siege-name-plate"))) {
      const b = p.getBoundingClientRect();
      p.classList.toggle("aim-under", e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom);
    }
  }
  private tap(e: PointerEvent) {
    const p = this.renderer.toCell(e.clientX, e.clientY),
      at = { x: p.fx, y: p.fy },
      s = this.sim.engine;
    if (this.spellBar?.armed && this.sim.phase === "battle") {
      // Mana is scarce: a Necromancy with no grave in reach would spend it
      // for nothing, so the spell stays armed instead.
      if (this.sim.mana && this.spellBar.armed === "necromancy" && !gravesNear(s, at).some((g) => !s.solid[cellAt(g.x, g.y)])) return;
      if (castStrike(s, this.spellBar.armed, at)) this.spellBar.cancel();
      return;
    }
    this.inspection = this.sim.map.buildings.find(
      (b) => !b.hidden && p.fx >= b.rect.x && p.fx < b.rect.x + b.rect.w && p.fy >= b.rect.y && p.fy < b.rect.y + b.rect.h,
    )?.id;
  }
  private draw() {
    this.banners.draw(this.now, this.host.save().settings.reduceMotion);
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
