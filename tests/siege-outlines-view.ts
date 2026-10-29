import '../src/style.css';
import '../src/theme.css';
import { defaults } from '../src/save.ts';
import { CampaignSim } from '../src/campaign/sim.ts';
import { generateCastle } from '../src/campaign/castles.ts';
import { drawUnits } from '../src/defend/battle-art.ts';
import { UnitOutline } from '../src/defend/unit-outline.ts';
import { siegeSides } from '../src/campaign/siege-colors.ts';
import type { Soldier } from '../src/defend/sim.ts';
document.documentElement.classList.add('pixel-font');
const game = defaults(), sim = new CampaignSim('siege', 0, [], game.defend.owned, game.defend.levels, generateCastle(45, 100), game);
sim.start(); sim.step(1 / 30);
const kinds: Soldier['kind'][] = ['brawler', 'sword', 'archer', 'mage', 'valkyrie', 'darkWizard', 'hero', 'shade', 'assassin', 'spearman', 'hoplite', 'lancer', 'sniper', 'musketeer', 'gatlingGunner', 'railSniper'];
for (const night of [false, true]) for (const merged of [true, false]) for (const simple of [false, true]) {
  const card = document.createElement('article'), heading = document.createElement('h2');
  card.style.cssText = 'padding:8px;border:1px solid var(--brass);background:var(--wood);min-width:0';
  heading.style.fontSize = '16px';
  heading.textContent = `${simple ? 'Squares' : 'Sprites'} · ${merged ? 'Merged setting on' : 'Merged setting off'} · ${night ? 'Night' : 'Grass'}`;
  const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 360;
  canvas.style.cssText = 'width:100%;height:auto;image-rendering:pixelated';
  card.append(heading, canvas); document.querySelector('#gallery')!.append(card);
  const troops = kinds.flatMap((kind, index) => [0, 1].map(side => ({ ...sim.allies[0], id: 1000 + index * 2 + side, kind, home: sim.allies[0].home, x: 2 + index % 4 * 3.5 + side * 0.35, y: 1.5 + Math.floor(index / 4) * 2.8, path: [], cd: 0, thinkT: 0, target: -1, raidEnemy: !!side })));
  const sides = siegeSides(troops.filter(u => !u.raidEnemy), troops.filter(u => u.raidEnemy));
  const view = new Proxy(sim.renderSim, { get(target, key) {
    if (key === 'soldiers') return troops;
    if (key === 'enemies' || key === 'civilians') return [];
    return Reflect.get(target, key, target);
  } });
  const c = canvas.getContext('2d')!; c.fillStyle = night ? '#111a22' : '#465e31'; c.fillRect(0, 0, 480, 360);
  drawUnits({ c, px: 32 }, view, null, false, undefined, { troops: simple, enemies: simple, reduceMotion: true, merged }, new UnitOutline(), sides, {});
}
document.body.dataset.ready = 'true';
