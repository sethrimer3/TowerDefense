import '../src/style.css';
import '../src/theme.css';
import { DefendPage } from '../src/defend/ui.ts';
import { defaultDefendSave } from '../src/defend/progress.ts';
import { NO_BONUSES } from '../src/defend/catalog.ts';
import { stressScene } from './defend-stress-scene.ts';
// This developer page never imports main.ts or accesses localStorage.
const params = new URLSearchParams(location.search);
const { sim, layout } = stressScene(Math.max(100, Math.min(10000, Number(params.get('enemies')) || 2500)), params.get('mix') === 'heavy');
const save = { ...defaultDefendSave(), layout, levels: sim.levels };
const page = new DefendPage(document.querySelector('#stress')!, {
  save: () => save, wallet: () => ({ gold:0,copper:0,silver:0,free:true }), setWallet: () => {},
  bonuses: () => NO_BONUSES, earnKills: () => {}, earnWave: () => ({gold:0,copper:0,silver:0,knowledge:0,upgrade:0}),
  persist: () => {}, reduceMotion: () => false, effects: () => true, devMode: () => false,
});
page.show();
// Private fields are exposed only in this unbundled test fixture.
Object.assign(page, { sim, phase:'sim', weather:{rain:true}, night:1, sideOpen:{build:false,sim:false} });
(page as unknown as { renderChrome(): void }).renderChrome();
Object.assign(window, { stressPage:page, stressSim:sim });
(window as unknown as {defendFrameTimes(on:boolean):void}).defendFrameTimes(true);
if (!params.has('manual')) requestAnimationFrame(function frame(now) { page.frame(now); requestAnimationFrame(frame); });
