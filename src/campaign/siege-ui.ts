import { worldSky } from "../daylight.ts";
import { SquadBar } from "./siege-squad-bar.ts";
import { SiegeSquads } from "./siege-squads.ts";
import { SiegeVictory } from "./siege-victory.ts";
import { play } from "../sound.ts";
import { SiegeFlags } from "./siege-flags.ts";
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
import { CampaignSim, SIEGE_SECONDS } from "./sim.ts";
import { CELLS_W } from "../defend/grid.ts";
import { siegeSky, SIEGE_CLEAR } from "./siege-sky.ts";
import { siegeSides } from "./siege-colors.ts";
import { buildingLevel, type LeveledKind } from "../building-level.ts";
import { STRUCTURES } from "../defend/catalog.ts";
import type { Building } from "../defend/citygen.ts";
/** Which of the board's buildings carry a level: not houses. */
const NO_COLLAPSE:ReadonlySet<number>=new Set();
const leveled = (kind: Building["kind"]): LeveledKind | undefined => (kind in STRUCTURES || kind === "wall" || kind === "gate" || kind === "wallBallista" ? (kind as LeveledKind) : undefined);
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
  private victory?: SiegeVictory;
  private inspection: number | undefined;
  private spellBar?: SpellBar;
  private squadBar?: SquadBar;
  private flags?: SiegeFlags;
  private flagsSim?: CampaignSim;
  private spellGate?: SpellBarGate;
  private manaCounter?: ManaCounter;
  private notice = "";
  private freshCamera = true;
  private readonly banners = new Banners();
  private readonly troops = new TroopBox();
  /** The tapped building's level, hung over it. */
  private readonly level = document.createElement("div");
  constructor(
    private root: HTMLElement,
    private host: CampaignHost,
  ) {
    if (host.save().siege?.raid.state === "started" && settleRaid(host.save().siege!, false)) queueMicrotask(() => host.store());
    this.sim = this.make();
    this.renderer = new DefendRenderer(this.canvas);
    this.canvas.tabIndex=0;
    this.canvas.setAttribute("aria-label", t("siege.board"));
    this.pointers = new BoardPointers({
      renderer: () => this.renderer,
      pickUp: () => false,
      drop: () => {},
      tap: (e) => this.tap(e),
    });
    this.canvas.onpointerdown = (e) => {
      this.canvas.focus({preventScroll:true});
      this.plateFocus(e);
      this.pointers.down(e);
    };
    this.canvas.onpointerleave = () => this.root.querySelectorAll(".aim-under").forEach((p) => p.classList.remove("aim-under"));
    this.canvas.onpointermove = (e) => {
      this.plateFocus(e);
      if (this.spellBar) {
        const p = this.renderer.toCell(e.clientX, e.clientY);
        this.spellBar.point = { x: p.fx, y: p.fy };
        if(this.squadBar)this.squadBar.point={x:p.fx,y:p.fy};
      }
    };
    this.root.addEventListener("keydown", (e) => {
      if (this.victory && (e.key === "Escape" || e.key === "Enter")){this.victory.skip();this.finishVictory();return;}
      if (e.key === "Escape") {this.spellBar?.cancel();this.squadBar?.cancel();}
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
    this.squadBar?.cancel();
    this.disposeEntry?.();
    this.disposeEntry = undefined;
  }
  reset() {
    this.pause();
    this.view = "entry";
    this.sim = this.make();
    this.paused = false;
    this.rewarded = false;
    this.victory = undefined;
    this.canvas.style.transform="";
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
          this.victory = undefined;
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
          this.victory = undefined;
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
      '<div class="campaign-spells"></div><p class="campaign-status" role="status" aria-live="polite"><span></span><time class="siege-timer"></time></p></div>' +
      '<div class="campaign-stage defend-stage"><div class="campaign-board defend-board"></div></div>';
    this.root.querySelector(".campaign-board")!.append(this.canvas);
    const board = this.root.querySelector(".campaign-board")!;
    const opponent = { name: raid.castle.owner.name, flag: raid.castle.owner.flag ?? botFlag(raid.castle.seed) },
      you = profile ?? { name: t("siege.you"), flag: defaultFlag() };
    board.insertAdjacentHTML("beforeend", bannerPlate(opponent, raid.defender, "top") + bannerPlate(you, siege.mmr, "bottom"));
    this.banners.attach(this.root, { top: opponent.flag, bottom: you.flag });
    this.troops.update(this.sim.allies);
    board.append(this.troops.el);
    this.level.className = "siege-level";
    this.level.hidden = true;
    board.append(this.level);
    const skip=document.createElement('button');skip.type='button';skip.dataset.action='skip-victory';skip.hidden=!this.victory;skip.textContent=t('siege.skipVictory');
    skip.onclick=()=>{this.victory?.skip();this.finishVictory();};this.root.querySelector('.campaign-actions')!.append(skip);
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
      } else if (this.sim.phase === "battle" || this.victory) this.paused = !this.paused;
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
    this.squadBar=new SquadBar(new SiegeSquads(this.sim.engine,this.sim.raid.field.attackerIds),()=>this.spellBar?.cancel());
    this.root.querySelector('.campaign-head')!.append(this.squadBar.el);
    this.spellBar.el.addEventListener('click',()=>{if(this.spellBar?.armed)this.squadBar?.cancel();});
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
    if (!this.paused) {
      this.sim.step(dt);
      if(this.victory)for(const b of this.victory.advance(dt))play(b.kind==='keep'?'keepFall':b.kind==='house'?'houseFall':'stoneFall');
    }
    if (!this.rewarded && (this.sim.phase === "won" || this.sim.phase === "lost")) {
      this.rewarded = true;
      if (settleRaid(this.host.save().siege!, this.sim.phase === "won")) this.host.store();
      if(this.sim.phase==='won'){
        this.victory=new SiegeVictory(this.sim.map,this.sim.raid.defense.hp,this.host.save().siege!.raid.castle.seed,this.host.save().settings.reduceMotion,[...(this.flags?.poles.filter(p=>p.snapped===undefined)??[]),...(this.flags?.dropped??[]),...this.sim.raid.defense.soldiers.filter(u=>u.kind==='flagBearer')]);
        play('keepFall');this.spellBar?.cancel();
      }else{this.finishVictory();return;}
    }
    if(this.victory && this.host.save().settings.reduceMotion)this.victory.skip();
    if(this.victory?.done){this.finishVictory();return;}
    this.refresh();
    this.draw();
  }
  private finishVictory(){this.view='entry';this.canvas.style.transform='';this.render();}
  private refresh() {
    const s = this.sim;
    const status = this.root.querySelector('.campaign-status')!, clock = status.querySelector('time')!;
    clock.hidden = s.phase !== 'battle' || !!this.notice;
    clock.textContent = t('siege.timeLeft', { seconds: Math.max(0, SIEGE_SECONDS - Math.floor(s.elapsed)) });
    clock.dataset.sky = (worldSky() ?? siegeSky(SIEGE_SECONDS - s.elapsed)).phase;
    status.querySelector('span')!.textContent =
      this.notice ||
      (s.phase === "build"
        ? t("siege.ready", { count: s.layout.length })
        : s.phase === "won"
          ? t("siege.won")
          : s.phase === "lost"
            ? t("siege.lost")
            : (this.paused ? t("siege.paused") : "") +
              t("siege.battleStatus", {
                hp: Math.ceil(s.raid.defense.keepHp()),
                max: Math.ceil(s.raid.defense.keepMaxHp()),
                troops: s.allies.length,
              }));
    this.root.querySelector<HTMLButtonElement>('[data-action="start"]')!.disabled = (s.phase === "won" || s.phase === "lost") && !this.victory;
    if(this.victory)this.root.querySelector<HTMLButtonElement>('[data-action="retry"]')!.textContent=t("siege.practiceAgain");
    this.spellBar?.update(s.engine, s.phase === "battle", this.host.save().settings.reduceMotion, 1, this.spellGate);
    if (s.mana) this.manaCounter?.update(s.mana.value, SIEGE_MANA.cap);
    this.troops.update(s.allies);
    this.squadBar?.update(s.phase==='battle');
    const skip=this.root.querySelector<HTMLButtonElement>('[data-action="skip-victory"]');if(skip)skip.hidden=!this.victory;
  }
  private plateFocus(e: PointerEvent) {
    for (const p of Array.from(this.root.querySelectorAll<HTMLElement>(".siege-name-plate"))) {
      const b = p.getBoundingClientRect();
      p.classList.toggle("aim-under", e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom);
    }
  }
  private tap(e: PointerEvent) {
    if(this.victory){this.victory.skip();this.finishVictory();return;}
    const p = this.renderer.toCell(e.clientX, e.clientY),
      at = { x: p.fx, y: p.fy },
      s = this.sim.engine;
    if(this.squadBar?.armed && this.sim.phase==='battle'){this.squadBar.plant(at);return;}
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
      const top = r.toClient(CELLS_W / 2, 0);
      r.zoomAt(top.x, top.y, 1.3);
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
    const sky = worldSky() ?? siegeSky(SIEGE_SECONDS - this.sim.elapsed);
    const face=this.host.save().siege!.raid.castle.owner.flag ?? botFlag(this.host.save().siege!.raid.castle.seed);
    if (this.flagsSim !== this.sim) { this.flagsSim=this.sim;this.flags=new SiegeFlags(this.sim.map,this.host.save().siege!.raid.castle.seed,face); }
    this.flags!.update(sim);
    this.flags!.victory=this.victory?{elapsed:this.victory.elapsed,origin:this.victory.origin,face:this.host.save().profile?.flag??defaultFlag(),reduced:settings.reduceMotion}:undefined;
    const shake=settings.effectsOff?undefined:this.victory?.shake;this.canvas.style.transform=shake?`translate(${shake.x}px,${shake.y}px)`:'';
    r.draw(this.sim.map, sim, this.spellBar?.overlay(this.sim.engine) ?? null, {
      area: "moss",
      grid: 0,
      weather: SIEGE_CLEAR,
      night: sky.night,
      tint: sky.tint,
      sun: sky.sun,
      keepFlag: this.victory ? null : face,
      hideBanner: true,
      collapsed: this.victory?.collapsed ?? NO_COLLAPSE,
      markers:(c,px)=>{if(this.sim.phase==='battle')this.squadBar?.draw(c,px,this.now,settings.reduceMotion);},
      scenery: (c,px)=>{this.flags!.draw(c,px,sim,this.now,settings.reduceMotion,!settings.effectsOff);if(!settings.effectsOff)this.victory?.draw(c,px);},
      sides: siegeSides(this.sim.raid.attack.soldiers, this.sim.raid.defense.soldiers),
      now: this.now,
      reduceMotion: settings.reduceMotion,
      effects: !settings.effectsOff,
      healthbars: settings.showHealthbars,
      simpleEnemies: settings.simpleEnemies,
      simpleTroops: settings.simpleTroops,
      mergedOutlines: settings.mergedOutlines,
      hdSand: settings.hdSand,
      looks,
      ...(this.inspection !== undefined ? { inspect: { id: this.inspection, armed: owner } } : {}),
    });
    this.placeLevel();
  }
  /** Shows the tapped building's level over its top edge: the castle's own
   * Smithy upgrades for the defense's buildings, the player's for theirs. */
  private placeLevel() {
    const b = this.inspection !== undefined ? this.sim.map.buildings[this.inspection] : undefined,
      kind = b && !b.hidden ? leveled(b.kind) : undefined,
      board = this.level.parentElement;
    if (!b || !kind || !board) return void (this.level.hidden = true);
    const save = this.host.save(),
      castle = save.siege!.raid.castle.castle,
      level = this.sim.raid.field.defenderIds.has(b.id) ? buildingLevel(kind, castle.levels, castle.training) : buildingLevel(kind, save.defend.levels, save.training),
      text = t("siege.level", { level });
    if (this.level.textContent !== text) {
      this.level.textContent = text;
      this.level.title = t("siege.levelHint", { level });
    }
    const at = this.renderer.toClient(b.rect.x + b.rect.w / 2, b.rect.y),
      box = board.getBoundingClientRect();
    this.level.style.left = Math.round(at.x - box.left) + "px";
    this.level.style.top = Math.round(at.y - box.top) + "px";
    this.level.hidden = false;
  }
}
