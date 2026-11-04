import '../src/style.css';
import '../src/theme.css';
import { DefendPage } from '../src/defend/ui.ts';
import { defaultDefendSave } from '../src/defend/progress.ts';
import { NO_BONUSES } from '../src/defend/catalog.ts';
import { placeCityTile, placeStructureAt } from '../src/defend/layout.ts';
import type { Building, CityMap } from '../src/defend/citygen.ts';
import { paintStanding } from '../src/defend/city-layer.ts';
import { ART } from '../src/defend/art-scale.ts';
import { archerTowerRange } from '../src/defend/towers.ts';
import { deployCircle } from '../src/defend/deployment.ts';
import { drawRallyFlag } from '../src/defend/structure-art.ts';
import { structurePixels } from '../src/defend/tower-art.ts';
import { drawShimmerFlash, flashAlpha } from '../src/defend/placed-shimmer.ts';
import { clampToSquare, drawAimLine, drawCrosshairs, drawNearbySquare, drawSquareRange, type Square } from '../src/defend/square-range-art.ts';
import { buildingMenuBox, buildingMenuHtml, placeBuildingMenu, setMenuRange, type BuildingMenuSpec, type MenuControls, type TargetMode } from '../src/ui/building-menu.ts';
import { MENU_ICONS, menuIconUrl } from '../src/ui/building-menu-icons.ts';

// A developer page: never imports main.ts or touches localStorage. Only
// this fixture wires the menu's buttons, to show how they look pressed.
const save = defaultDefendSave();
let l = save.layout;
for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [-1, -1], [1, -1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
const k = l.keep;
l = placeStructureAt(l, 'archerTower', { qx: (k.tx - 1) * 4 + 1, qy: (k.ty - 1) * 4 + 1 }) ?? l;
l = placeStructureAt(l, 'meleeGuild', { qx: (k.tx + 1) * 4, qy: (k.ty - 1) * 4 }) ?? l;
save.layout = l;
const host = {
  save: () => save, wallet: () => ({ gold: 0, copper: 0, silver: 0, free: true }), setWallet: () => {},
  bonuses: () => NO_BONUSES, earnWave: () => ({ upgrade: 0 }),
  persist: () => {}, reduceMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches, effects: () => true, devMode: () => false,
};
const page = new DefendPage(document.querySelector('#live')!, host as never);
page.show();
const anyPage = page as unknown as { renderer: { px: number; cam: { s: number; x: number; y: number }; toClient(x: number, y: number): { x: number; y: number } } | null; currentMap(): CityMap };
const armed = { levels: save.levels, bonuses: NO_BONUSES };

type Live = { controls: MenuControls; b: Building; mode: TargetMode; range: number; aim: { x: number; y: number } | null } | null;
let live: Live = null, flashAt = -1;
const kinds: Record<MenuControls, string> = { shooter: 'archerTower', troops: 'meleeGuild', plain: 'keep' };
const names: Record<MenuControls, string> = { shooter: 'Archer tower', troops: 'Melee Guild', plain: 'Keep' };
let menuEl: HTMLElement | null = null;

function baseSquare(): Square | null {
  if (!live) return null;
  const r = live.b.rect, c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const base = live.controls === 'shooter' ? archerTowerRange(armed as never, live.b) : live.controls === 'troops' ? deployCircle(live.b, NO_BONUSES)?.r ?? 0 : 0;
  return base ? { ...c, r: (base * live.range) / 100 } : null;
}

function show(controls: MenuControls | 'none') {
  menuEl?.remove();
  menuEl = null;
  if (controls === 'none') { live = null; return; }
  const map = anyPage.currentMap(), b = map.buildings.find((o) => o.kind === kinds[controls]);
  if (!b) return;
  const r = b.rect, c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  live = { controls, b, mode: controls === 'shooter' ? 'strongest' : 'closest', range: controls === 'troops' ? 60 : 85, aim: controls === 'shooter' ? { x: c.x - 3, y: c.y - 6 } : controls === 'troops' ? { x: c.x + 4, y: c.y - 7 } : null };
  render();
}

function spec(): BuildingMenuSpec {
  return { controls: live!.controls, name: names[live!.controls], mode: live!.mode, range: live!.range, aimSet: !!live!.aim, remove: live!.controls === 'plain' ? null : { kind: 'inventory' } };
}

function render() {
  menuEl?.remove();
  const board = document.querySelector<HTMLElement>('#defend-board')!;
  board.insertAdjacentHTML('beforeend', buildingMenuHtml(spec()));
  menuEl = board.lastElementChild as HTMLElement;
  place();
  menuEl.querySelectorAll<HTMLElement>('[data-bm-mode]').forEach((el) => el.onclick = () => { live!.mode = el.dataset.bmMode as TargetMode; render(); });
  menuEl.querySelector<HTMLElement>('[data-bm="aim"]')!.onclick = () => {
    const r = live!.b.rect;
    live!.aim = live!.aim ? null : { x: r.x + r.w / 2 - 3, y: r.y - 5 };
    render();
  };
  const range = menuEl.querySelector<HTMLInputElement>('[data-bm="range"]');
  if (range) {
    range.oninput = () => { live!.range = Number(range.value); setMenuRange(menuEl!, live!.range); };
    // While the slider is held the rest of the menu thins out, so the range's edge shows.
    range.onpointerdown = () => menuEl!.classList.add('adjusting');
    range.onpointerup = range.onpointercancel = range.onblur = () => menuEl!.classList.remove('adjusting');
  }
  menuEl.style.animation = 'none';
}

function place() {
  if (!live || !menuEl || !anyPage.renderer) return;
  const board = document.querySelector<HTMLElement>('#defend-board')!, box = board.getBoundingClientRect(), r = live.b.rect;
  const a = anyPage.renderer.toClient(r.x, r.y), z = anyPage.renderer.toClient(r.x + r.w, r.y + r.h);
  placeBuildingMenu(menuEl, buildingMenuBox({ x: a.x - box.left, y: a.y - box.top, w: z.x - a.x, h: z.y - a.y }, { w: box.width, h: box.height }, live.controls));
}

document.querySelectorAll<HTMLElement>('[data-show]').forEach((el) => el.onclick = () => show(el.dataset.show as MenuControls | 'none'));
document.querySelector<HTMLElement>('[data-flash]')!.onclick = () => { flashAt = performance.now(); };

function overlay(now: number) {
  const renderer = anyPage.renderer, canvas = document.querySelector<HTMLCanvasElement>('#defend-canvas');
  if (!renderer || !canvas) return;
  const c = canvas.getContext('2d')!, px = renderer.px, cam = renderer.cam;
  c.save();
  c.setTransform(cam.s, 0, 0, cam.s, cam.x, cam.y);
  const map = anyPage.currentMap();
  if (flashAt >= 0) drawShimmerFlash(c, px, map, flashAlpha((now - flashAt) / 1000), (cc, b) => paintStanding(cc, ART, map, b));
  const sq = baseSquare();
  if (live && sq) {
    const middle = { x: sq.x, y: sq.y };
    drawSquareRange(c, px, sq, live.controls === 'shooter' ? 'reach' : 'deploy');
    if (live.aim) {
      const at = clampToSquare(sq, live.aim);
      if (live.controls === 'shooter') {
        drawNearbySquare(c, px, { x: at.x, y: at.y, r: 2 }, sq, now, false);
        drawAimLine(c, px, middle, at);
        drawCrosshairs(c, px, at, now, false);
      } else {
        drawAimLine(c, px, middle, at, '#cfe3ff');
        drawRallyFlag(c, px, at, { t: now / 1000, reduceMotion: false });
      }
    }
  }
  c.restore();
}

requestAnimationFrame(function frame(now) {
  page.frame(now);
  overlay(now);
  place();
  requestAnimationFrame(frame);
});
setTimeout(() => {
  // Zoom in on the city, as a player placing buildings would.
  const r = anyPage.renderer as unknown as { zoomAt(x: number, y: number, f: number): void; toClient(x: number, y: number): { x: number; y: number } } | null;
  const b = anyPage.currentMap().buildings.find((o) => o.kind === 'archerTower');
  if (r && b) { const at = r.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2); r.zoomAt(at.x, at.y, Number(new URLSearchParams(location.search).get('zoom')) || 2); }
  show('shooter');
}, 300);

// ── Standalone menus round a building sprite ─────────────────────────
function sprite(kind: 'archerTower' | 'meleeGuild' | 'cannonTower', cells: number, scale: number) {
  const n = cells * ART, px = structurePixels(kind, cells, cells), cv = document.createElement('canvas');
  cv.width = cv.height = n * scale;
  cv.className = 'building';
  cv.style.width = cv.style.height = `${n * scale}px`;
  const src = document.createElement('canvas');
  src.width = src.height = n;
  src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px.buffer), n, n), 0, 0);
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.drawImage(src, 0, 0, n * scale, n * scale);
  return cv;
}
const phone = innerWidth < 560;
const demos: [BuildingMenuSpec, 'archerTower' | 'meleeGuild' | 'cannonTower'][] = [
  [{ controls: 'shooter', name: 'Archer tower', mode: 'first', range: 75, remove: { kind: 'inventory' } }, 'archerTower'],
  [{ controls: 'troops', name: 'Melee Guild', mode: 'groups', range: 40, aimSet: true, remove: { kind: 'sell', gold: 140 } }, 'meleeGuild'],
  [{ controls: 'shooter', name: 'Cannon tower', mode: 'weakest', range: 100, aimSet: true, remove: { kind: 'inventory' }, removeBlocked: 'Not during a battle' }, 'cannonTower'],
  [{ controls: 'plain', name: 'Repair shop', remove: { kind: 'inventory' } }, 'archerTower'],
];
const menus = document.querySelector('#menus')!;
for (const [s, kind] of demos) {
  const view = { w: phone ? 300 : 340, h: phone ? 300 : 340 }, cells = 4, scale = phone ? 2 : 3, side = cells * ART * scale;
  const rect = { x: (view.w - side) / 2, y: (view.h - side) / 2, w: side, h: side };
  const box = buildingMenuBox(rect, view, s.controls);
  const demo = document.createElement('div');
  demo.className = 'menu-demo';
  demo.dataset.controls = s.controls;
  demo.style.width = `${view.w}px`;
  demo.style.height = `${s.controls === 'plain' ? box.size + 16 : view.h}px`;
  const cv = sprite(kind, cells, scale);
  cv.style.left = `${rect.x}px`;
  cv.style.top = `${s.controls === 'plain' ? box.size / 2 + 8 - side / 2 : rect.y}px`;
  demo.append(cv);
  demo.insertAdjacentHTML('beforeend', buildingMenuHtml(s));
  const el = demo.lastElementChild as HTMLElement;
  placeBuildingMenu(el, s.controls === 'plain' ? { ...box, top: 8 } : box);
  menus.append(demo);
}

// ── Icons ─────────────────────────────────────────────────────────────
document.querySelector('#icons')!.innerHTML = MENU_ICONS.map((icon) => `<figure data-icon="${icon}"><img src="${menuIconUrl(icon, 3)}" alt=""><figcaption>${icon}</figcaption></figure>`).join('');

// ── Square ranges, spells and the war banner on grass ────────────────
const sqCanvas = document.querySelector<HTMLCanvasElement>('#squares')!;
function squares(now: number) {
  const dpr = devicePixelRatio || 1, w = Math.round(sqCanvas.clientWidth * dpr), h = Math.round(sqCanvas.clientHeight * dpr);
  if (sqCanvas.width !== w || sqCanvas.height !== h) { sqCanvas.width = w; sqCanvas.height = h; }
  const c = sqCanvas.getContext('2d')!, px = w / 30;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#35532a';
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#3c5d2f';
  for (let y = 0; y < 20; y++) for (let x = 0; x < 30; x++) if ((x + y) % 2) c.fillRect(x * px, y * px, px, px);
  drawSquareRange(c, px, { x: 6, y: 6, r: 4.5 }, 'reach');
  drawNearbySquare(c, px, { x: 9.5, y: 3, r: 2 }, { x: 6, y: 6, r: 4.5 }, now, false);
  drawCrosshairs(c, px, { x: 9.5, y: 3 }, now, false);
  drawSquareRange(c, px, { x: 6, y: 15, r: 3.5 }, 'deploy', { march: now / 1000 });
  drawRallyFlag(c, px, { x: 8.5, y: 13 }, { t: now / 1000, reduceMotion: false });
  drawSquareRange(c, px, { x: 17, y: 10, r: 3 }, 'spell');
  drawSquareRange(c, px, { x: 25, y: 10, r: 4 }, 'banner');
  c.fillStyle = '#fff';
  c.font = `${Math.round(px * 0.8)}px var(--font, monospace)`;
  for (const [x, y, label] of [[1.6, 1.2, 'Tower reach + crosshairs'], [1.6, 11, 'Troop area + rally flag'], [14.2, 6.4, 'Spell area'], [21.2, 5.4, 'War banner']] as const) c.fillText(label, x * px, y * px);
  requestAnimationFrame(squares);
}
requestAnimationFrame(squares);
Object.assign(window, { buildingMenuGallery: { show, flash: () => (flashAt = performance.now()) } });
