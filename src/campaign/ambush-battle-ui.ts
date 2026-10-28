/** Native board, pointer transactions and controls; rules live in AmbushSim. */
import { BattleSound } from "../defend/battle-sound.ts";
import { play } from "../sound.ts";
import { sparksOver } from "../ui/flourish.ts";
import { stepName } from "../specializations.ts";
import { artLook } from "../defend/tower-art.ts";
import type { AmbushBuilding } from "./ambush-sim.ts";
import { SpellBar } from "../ui/spell-bar.ts";
import { KeepBricks } from "../defend/keep-bricks.ts";
import { levelUnlocked } from "./levels.ts";
import { drawFlierWarning } from "./flier-warning.ts";
import { DefendRenderer } from "../defend/render.ts";
import { BoardPointers } from "../defend/board-pointers.ts";
import { paintIcon } from "../defend/structure-art.ts";
import { STRUCTURES, type StructureKind } from "../defend/catalog.ts";
import { hasForest } from "../defend/forest.ts";
import type { PlacedKind } from "../defend/layout.ts";
import type { Drop } from "../defend/edit-session.ts";
import type { CampaignHost } from "./host.ts";
import { AmbushSim, AMBUSH_PALETTE, type AmbushSpell } from "./ambush-sim.ts";
import { AmbushDrag } from "./ambush-drag.ts";
import { buildingRect } from "./ambush-grid.ts";
import { drawEntryArrow } from "./entry-arrow.ts";
import { recordStars } from "./levels.ts";
import { t } from "../i18n/index.ts";
export class AmbushBattlePage {
  sim: AmbushSim;
  readonly canvas = document.createElement("canvas");
  readonly renderer: DefendRenderer;
  private pointers: BoardPointers;
  private last = 0;
  private paused = false;
  private picked: number | undefined;
  private notice = "";
  private now = 0;
  /** When the flier warning went up, on the wall clock; unset while none shows. */
  private warnedAt: number | undefined;
  private settled = false;
  private resetCamera = true;
  private cleared = new Map<number, string>();
  private sounds = new BattleSound();
  private spellBar?: SpellBar;
  private health = new KeepBricks();
  private sideOpen = true;
  private panelKey = "";
  private statsAt = 0;
  constructor(
    private root: HTMLElement,
    private index: number,
    private host: CampaignHost,
  ) {
    this.sim = new AmbushSim(index, host.save());
    this.renderer = new DefendRenderer(this.canvas);
    this.canvas.setAttribute("aria-label", "Ambush battlefield");
    this.pointers = new BoardPointers({
      renderer: () => this.renderer,
      paletteSelector: "#ambush-palette",
      raise: () => host.save().settings.raiseDrag,
      magnify: () => host.save().settings.magnifier,
      pickUp: (e) => this.lift(e),
      drop: (d) => this.drop(d),
      tap: (e) => this.tap(e),
    });
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
    this.render();
  }
  selectLevel(index: number) {
    this.index = index;
    this.reset();
  }
  show() {
    this.last = 0;
    this.render();
  }
  pause() {
    this.last = 0;
    this.pointers.end();
    this.spellBar?.cancel();
  }
  reset() {
    this.pause();
    this.sim = new AmbushSim(this.index, this.host.save());
    this.paused = false;
    this.picked = undefined;
    this.spellBar?.cancel();
    this.notice = "";
    this.settled = false;
    this.resetCamera = true;
    this.cleared.clear();
    this.render();
  }
  private render() {
    this.panelKey = "";
    this.pointers.end();
    this.root.classList.add("native-campaign");
    const ended = this.sim.phase === "won" || this.sim.phase === "lost";
    const s = this.sim,
      outcome = t(s.phase === "won" ? "ambush.victory" : "ambush.defeat"),
      award = !this.host.save().settings.reduceMotion;
    const result = ended
      ? `<div class="ambush-result" role="dialog" aria-label="${outcome}"><h2>${outcome}</h2>
          <div class="ambush-result-stars">${[0, 1, 2]
            .map((i) => `<span class="${i < s.stars && award ? "star-award" : ""}" style="--star-delay:${i * 0.14}s">${i < s.stars ? "★" : "☆"}</span>`)
            .join("")}</div>
          <p>${t("ambush.kills")}: ${s.kills} · ${t("ambush.goldEarned")}: ${Math.floor(s.goldEarned)}</p>
          <button data-action="retry">${t("ambush.retry")}</button>
          <button data-action="next" ${s.phase === "won" && this.index < 29 ? "" : "hidden"}>${t("ambush.next")}</button>
          <button data-action="result-select">${t("ambush.levelSelect")}</button>
        </div>`
      : "";
    this.root.innerHTML = `
      <div class="campaign-head defend-head">
        <span class="ambush-level-name">${s.level.name}</span>
        <button data-action="level-select">${t("ambush.levelSelect")}</button>
        <div class="campaign-actions">
          <button data-action="start">${t("ambush.sendWave")}</button>
          <button data-action="pause">${this.paused ? t("ambush.resume") : t("ambush.pause")}</button>
          <button data-action="speed">${s.speed}×</button>
          <label><input type="checkbox" data-action="auto" ${s.autoSend ? "checked" : ""}>${t("ambush.autoSend")}</label>
          <button data-action="side" aria-pressed="${this.sideOpen}">☰ ${t("ambush.buildings")}</button>
        </div>
        <p class="campaign-status" role="status" aria-live="polite"></p>
      </div>
      <div class="campaign-stage defend-stage ${this.sideOpen ? "side-open" : ""}">
        <aside class="defend-side ambush-side">
          <div class="ambush-side-head">
            <strong id="ambush-health-label"></strong><div id="ambush-health"></div><span id="ambush-health-number"></span>
            <p class="ambush-wallet"><i class="metal-icon gold" aria-hidden="true"></i> <b id="ambush-gold"></b> ${t("ambush.gold")}</p>
            <div class="ambush-hud-stars" aria-label="${t("ambush.stars", { stars: s.stars, total: 3 })}">${[0, 1, 2].map((i) => `<span data-star="${i}">★</span>`).join("")}</div>
          </div>
          <div class="ambush-side-content">
            <div class="campaign-roster defend-palette" id="ambush-palette"></div>
            <div id="ambush-inspect" hidden>
              <div class="ambush-building-details"></div>
              <div class="campaign-inspect-actions"><button data-action="close">${t("ambush.close")}</button><button data-action="sell"></button></div>
            </div>
          </div>
        </aside>
        <div class="campaign-board defend-board"><div class="campaign-spells"></div>${result}</div>
      </div>`;
    this.root.querySelector(".campaign-board")!.prepend(this.canvas);
    this.root.querySelector("#ambush-health")!.append(this.health.canvas);
    const button = (action: string) => this.root.querySelector<HTMLButtonElement>('[data-action="' + action + '"]')!;
    button("level-select").onclick = () => this.host.levelSelect?.();
    if (ended) {
      button("retry").onclick = () => this.reset();
      button("result-select").onclick = () => this.host.levelSelect?.();
      button("next").onclick = () => {
        if (this.index < 29 && levelUnlocked(this.host.save().campaigns.ambush, this.index + 1)) this.selectLevel(this.index + 1);
      };
    }
    button("start").onclick = () => {
      if (!this.sim.send()) this.notice = t("ambush.placeFirst");
      else {
        this.notice = "";
        if (this.sim.wave === 1) {
          const p = this.host.save().campaigns.ambush,
            id = this.sim.level.id;
          (p.attempts ??= {})[id] = Math.min(1e9, (p.attempts?.[id] ?? 0) + 1);
          this.host.store();
        }
      }
      this.refresh();
    };
    button("pause").onclick = () => {
      this.paused = !this.paused;
      this.render();
    };
    button("speed").onclick = () => {
      const save = this.host.save().defend;
      this.sim.speed = this.sim.speed >= (save.speed3 ? 3 : 2) ? 1 : ((this.sim.speed + 1) as 1 | 2 | 3);
      save.battleSpeed = this.sim.speed;
      this.host.store();
      this.refresh();
    };
    button("side").onclick = () => {
      this.sideOpen = !this.sideOpen;
      this.render();
    };
    this.root.querySelector<HTMLInputElement>('[data-action="auto"]')!.onchange = (e) => {
      this.sim.autoSend = (e.target as HTMLInputElement).checked;
      const progress = this.host.save().campaigns.ambush;
      if (this.sim.autoSend) progress.autoSend = true;
      else delete progress.autoSend;
      this.host.store();
    };
    button("sell").onclick = () => {
      if (this.picked !== undefined) this.sim.remove(this.picked);
      this.picked = undefined;
      this.refresh();
    };
    button("close").onclick = () => {
      this.picked = undefined;
      this.refresh();
    };
    this.spellBar = new SpellBar(this.sim.spells);
    this.root.querySelector(".campaign-spells")!.replaceWith(this.spellBar.el);
    this.palette();
    this.refresh();
    this.draw();
  }
  private palette() {
    const roster = this.root.querySelector<HTMLElement>(".campaign-roster")!;
    roster.innerHTML = AMBUSH_PALETTE.map(
      (kind) =>
        `<button class="defend-item" data-kind="${kind}"><canvas width="48" height="48"></canvas><span>${STRUCTURES[kind].name}</span><small>${this.sim.price(kind)} ${t("ambush.gold")}</small></button>`,
    ).join("");
    roster.querySelectorAll<HTMLButtonElement>("[data-kind]").forEach((b) => {
      const kind = b.dataset.kind as PlacedKind;
      paintIcon(b.querySelector("canvas")!, kind);
      b.onpointerdown = (e) => {
        if (b.disabled || e.button !== 0) return;
        this.picked = undefined;
        this.pointers.begin(new AmbushDrag(kind, this.sim.grid, this.sim.buildings), e, false);
      };
    });
  }
  private lift(e: PointerEvent) {
    if (this.spellBar?.armed || this.sim.phase !== "build") return false;
    const p = this.renderer.toCell(e.clientX, e.clientY);
    const b = this.at(p.fx, p.fy);
    if (!b) return false;
    this.picked = b.id;
    this.pointers.begin(new AmbushDrag(b.kind as PlacedKind, this.sim.grid, this.sim.buildings, b.id), e, false);
    return true;
  }
  private drop(drop: Drop) {
    if (drop.kind !== "build") return;
    const p = drop.layout.structures[0];
    if (p) {
      const ok = p.uid < 0 ? this.sim.placeAt(p.kind, p.qx, p.qy) : this.sim.moveTo(p.uid, p.qx, p.qy);
      this.notice = ok ? "" : "That building cannot be placed here.";
    } else if (drop.message) this.notice = drop.message;
    this.refresh();
  }
  private at(x: number, y: number) {
    return this.sim.buildings.find((b) => {
      const r = buildingRect(b);
      return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    });
  }
  private tap(e: PointerEvent) {
    const p = this.renderer.toCell(e.clientX, e.clientY),
      b = this.at(p.fx, p.fy);
    if (this.spellBar?.armed) {
      if (this.sim.cast(this.spellBar.armed, { x: p.fx, y: p.fy })) this.spellBar.cancel();
      this.refresh();
      return;
    }
    // A tap only picks a building or puts the panel away; buildings are dragged in from the palette, as in Defend.
    this.picked = b?.id;
    this.refresh();
  }
  frame(now: number) {
    this.now = now;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (!this.paused) {
      this.sim.step(dt);
      if (dt > 0) this.sounds.hear(this.sim.engine);
    }
    this.health.step(this.host.save().settings.reduceMotion ? 0 : dt);
    if (!this.settled && (this.sim.phase === "won" || this.sim.phase === "lost")) {
      this.settled = true;
      if (this.sim.phase === "won") {
        recordStars(this.host.save().campaigns.ambush, this.sim.level, this.sim.stars);
        this.host.store();
      }
      this.render();
      play(this.sim.phase === "won" ? "record" : "fallen");
      if (this.sim.phase === "won" && !this.host.save().settings.reduceMotion) sparksOver(this.root.querySelector(".ambush-result-stars"), "gold");
    }
    this.refresh();
    this.draw();
  }
  private refresh() {
    const s = this.sim,
      b = s.buildings.find((b) => b.id === this.picked),
      ended = s.phase === "won" || s.phase === "lost";
    const gold = this.root.querySelector("#ambush-gold")!,
      wallet = String(Math.floor(s.gold));
    if (gold.textContent !== wallet) gold.textContent = wallet;
    const post = s.outposts.posts.find((p) => !p.fallen),
      fraction = post ? post.health : s.engine.keepHp() / s.engine.keepMaxHp();
    this.root.querySelector("#ambush-health-label")!.textContent = t(
      post ? (s.outposts.posts.indexOf(post) === 0 ? "ambush.outpost1" : "ambush.outpost2") : "ambush.keep",
    );
    this.root.querySelector("#ambush-health-number")!.textContent = post
      ? Math.ceil(fraction * 100) + "%"
      : Math.ceil(s.engine.keepHp()) + "/" + Math.ceil(s.engine.keepMaxHp());
    this.health.set(fraction);
    this.root.querySelectorAll<HTMLElement>("[data-star]").forEach((el) => el.classList.toggle("star-lost", Number(el.dataset.star) >= s.stars));
    this.root.querySelector(".ambush-hud-stars")!.setAttribute("aria-label", t("ambush.stars", { stars: s.stars, total: 3 }));
    this.root.querySelector(".campaign-status")!.textContent =
      this.notice ||
      t("ambush.wave", { wave: s.wave, total: 20 }) +
        (s.waves[s.wave - 1]?.boss ? " · " + t("ambush.boss") : "") +
        " · " +
        t("ambush.enemiesLeft", { count: s.enemiesLeft });
    this.root.querySelector<HTMLElement>("#ambush-inspect")!.hidden = !b;
    this.root.querySelector<HTMLElement>("#ambush-palette")!.hidden = !!b;
    const sell = this.root.querySelector<HTMLButtonElement>('[data-action="sell"]')!;
    if (b) {
      this.panel(b);
      sell.textContent = t("ambush.sell", { gold: s.refund(b.id) });
      sell.disabled = ended;
    }
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-kind]")
      .forEach((button) => (button.disabled = ended || s.price(button.dataset.kind as StructureKind) > s.gold));
    this.root.querySelector<HTMLButtonElement>('[data-action="start"]')!.disabled = !s.canSend;
    this.root.querySelector<HTMLButtonElement>('[data-action="pause"]')!.disabled = s.phase !== "battle";
    this.root.querySelector<HTMLButtonElement>('[data-action="speed"]')!.textContent = s.speed + "×";
    this.spellBar?.update(s.engine, s.phase === "battle", this.host.save().settings.reduceMotion, s.perks.cooldown);
  }
  private panel(b: AmbushBuilding) {
    const detail = this.root.querySelector<HTMLElement>(".ambush-building-details")!;
    const key = this.sim.buildings.map((o) => [o.id, o.kind, o.wear?.path, o.wear?.rank].join(":")).join(",") + "@" + b.id;
    if (key !== this.panelKey) {
      this.panelKey = key;
      this.statsAt = -Infinity;
      detail.innerHTML =
        '<canvas class="ambush-portrait" width="96" height="96"></canvas><strong>' +
        STRUCTURES[b.kind].name +
        "</strong>" +
        "<dl><dt>" +
        t("ambush.kills") +
        '</dt><dd data-stat="kills"></dd><dt>' +
        t("ambush.damage") +
        '</dt><dd data-stat="damage"></dd><dt>' +
        t("ambush.dps") +
        '</dt><dd data-stat="dps"></dd></dl>' +
        '<div class="ambush-upgrades"></div>';
      paintIcon(detail.querySelector("canvas")!, b.kind);
      detail.querySelector(".ambush-upgrades")!.innerHTML = this.sim
        .upgrades(b.id)
        .map((o, i) => '<button data-upgrade="' + i + '">' + stepName(o.step) + "<small>" + o.cost + " " + t("ambush.gold") + "</small></button>")
        .join("");
      detail.querySelectorAll<HTMLButtonElement>("[data-upgrade]").forEach(
        (button) =>
          (button.onclick = () => {
            const offer = this.sim.upgrades(b.id)[Number(button.dataset.upgrade)];
            if (offer && !this.sim.upgrade(b.id, offer.step)) this.notice = offer.reason || "Not enough gold.";
            this.refresh();
          }),
      );
    }
    if (this.now - this.statsAt < 250) return;
    this.statsAt = this.now;
    const stats = this.sim.tallies.get(b.id);
    for (const stat of ["kills", "damage", "dps"] as const)
      detail.querySelector('[data-stat="' + stat + '"]')!.textContent = stat === "kills" ? String(stats[stat]) : stats[stat].toFixed(1);
    const offers = this.sim.upgrades(b.id),
      active = ["build", "battle"].includes(this.sim.phase);
    detail.querySelectorAll<HTMLButtonElement>("[data-upgrade]").forEach((button) => {
      const offer = offers[Number(button.dataset.upgrade)];
      button.disabled = !active || !offer?.ready || offer.cost > this.sim.gold;
      button.title = offer?.reason ?? "";
    });
  }
  private draw() {
    const r = this.renderer,
      box = this.canvas.getBoundingClientRect();
    r.resize(box.width, box.height);
    if (this.resetCamera) {
      r.resetCam();
      this.resetCamera = false;
    }
    const s = this.sim,
      settings = this.host.save().settings,
      reduced = settings.reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (hasForest(s.level.area)) {
      r.forest.sync(s.map, s.engine);
      for (const b of s.buildings) {
        const rect = buildingRect(b),
          key = [rect.x, rect.y, rect.w, rect.h].join(",");
        if (this.cleared.get(b.id) !== key) {
          r.forest.clearBuilding(rect);
          this.cleared.set(b.id, key);
        }
      }
    }
    const looks: Record<number, string> = {};
    for (const b of s.buildings) {
      const look = artLook(b.kind, b.wear?.path);
      if (look) looks[b.id] = look;
    }
    r.draw(s.map, s.engine, this.pointers.session?.overlay() ?? this.spellBar?.overlay(s.engine) ?? null, {
      area: s.level.area,
      grid: 0,
      weather: null,
      night: 0,
      now: this.now,
      reduceMotion: reduced,
      effects: !settings.effectsOff,
      healthbars: settings.showHealthbars,
      simpleEnemies: settings.simpleEnemies,
      simpleTroops: settings.simpleTroops,
      mergedOutlines: settings.mergedOutlines,
      looks,
      ...(this.picked !== undefined ? { inspect: { id: this.picked, armed: s.engine } } : {}),
    });
    const c = this.canvas.getContext("2d")!;
    c.save();
    c.setTransform(r.cam.s, 0, 0, r.cam.s, r.cam.x, r.cam.y);
    // The flier warning plays once from when it goes up.
    if (!s.warning) this.warnedAt = undefined;
    else this.warnedAt ??= this.now;
    for (const lane of s.field.lanes) {
      drawEntryArrow(c, lane[0], lane[1], r.px, this.now, reduced);
      if (this.warnedAt !== undefined) drawFlierWarning(c, lane[0], s.field.track.keep, r.px, this.now - this.warnedAt, reduced);
    }
    c.restore();
    this.pointers.drawLoupe(r);
  }
}
