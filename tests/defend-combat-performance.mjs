// Isolated browser workloads, no player saves. Run against npm run dev.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless:true, executablePath:process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage();
  await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/performance.html');
  const result = await page.evaluate(async () => {
    const { DefendSim } = await import('/src/defend/sim.ts');
    const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
    const { generateCity } = await import('/src/defend/citygen.ts');
    const { UPGRADES } = await import('/src/defend/catalog.ts');
    const { chainBolt } = await import('/src/defend/dark-wizards.ts');
    const { stepBlazes } = await import('/src/defend/mages.ts');
    const { assembleFortress, stepFortress } = await import('/src/defend/fortress.ts');
    const { drawBoat } = await import('/src/defend/boat-art.ts');
    const { drawFortress } = await import('/src/defend/fortress-art.ts');
    const map = generateCity(fitLayout(defaultLayout()), 3);
    const scene = () => new DefendSim(map, Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
    const median = a => a.sort((a,b) => a-b)[Math.floor(a.length/2)];
    function measure(tasks) {
      const samples = Object.fromEntries(Object.keys(tasks).map(k => [k, []]));
      for (const f of Object.values(tasks)) for (let i=0;i<4;i++) f();
      for (let round=0;round<9;round++) {
        const entries = Object.entries(tasks); if (round%2) entries.reverse();
        for (const [name, f] of entries) {
          const start = performance.now(); for (let i=0;i<5;i++) f();
          samples[name].push((performance.now()-start)/5);
        }
      }
      return Object.fromEntries(Object.entries(samples).map(([k,v]) => [k,median(v)]));
    }
    const rows = [];
    for (const count of [500, 2000, 10000]) {
      const sim = scene();
      for (let i=0;i<count;i++) { const e=sim.newEnemy('roach',10+(i%100)*.08,10+Math.floor(i/100)*.08); e.hp=1e12; sim.enemies.push(e); }
      sim.indexEnemies();
      const query = sim.chainTarget;
      const oldQuery = function(x,y,r,struck) {
        let best=null,bd=r*r;
        for (const e of this.enemiesNear(x,y,r)) {
          if(struck.has(e.id)) continue;
          const d=(e.x-x)*(e.x-x)+(e.y-y)*(e.y-y);
          if(d<bd || (d===bd && !best)){best=e;bd=d;}
        }
        return best;
      };
      const cast = () => { sim.bolts.length=0; chainBolt(sim,{x:9,y:9},sim.enemies[0],1,Math.min(count,1000),2); };
      const blasts = reuse => {
        sim.stationaryAttacks=reuse; sim.blastIndexReady=false;
        sim.effects.length=sim.scorches.length=0;
        for(let i=0;i<30;i++) sim.explode(12,12,{r:3,damage:1,friendlyFire:false});
        sim.stationaryAttacks=false;
      };
      sim.blazes = Array.from({length:30},(_,seed)=>({x:12,y:12,r:3,t:0,life:1e9,dps:1,seed}));
      rows.push({count,links:Math.min(count,1000),medianMs:measure({
        chainBefore:()=>{sim.chainTarget=oldQuery;cast();},
        chainAfter:()=>{sim.chainTarget=query;cast();},
        thirtyBlastsBefore:()=>blasts(false), thirtyBlastsAfter:()=>blasts(true),
        thirtyFires:()=>stepBlazes(sim,1/60),
      })});
    }
    const c=document.querySelector('canvas').getContext('2d'); c.canvas.width=720;c.canvas.height=840;
    const complex=[];
    for(const count of [100,500]) {
      const sim=scene(), boats=[], cores=[];
      for(let i=0;i<count;i++) {
        const x=3+(i%20)*3,y=3+Math.floor(i/20)*3;
        boats.push(sim.newEnemy(i%2?'boatCog':'boatLesser',x,y));
        const core=sim.newEnemy(i%2?'fortressHut':'fortressLesser',x,y);
        sim.enemies.push(core); assembleFortress(sim,core); cores.push(core);
      }
      const parts=sim.enemies.filter(e=>e.fortressPart);
      const lookup=sim.livingEnemy;
      const update=indexed=>{
        sim.livingEnemy=indexed?lookup:function(id){return this.enemies.find(e=>e.id===id&&e.hp>0);};
        sim.enemyLookupActive=indexed; sim.enemyLookup.clear();
        if(indexed)for(const e of sim.enemies)sim.enemyLookup.set(e.id,e);
        for(const part of parts){part.cd=99;stepFortress(sim,part,0);}
        sim.enemyLookupActive=false;sim.enemyLookup.clear();
      };
      complex.push({count,parts:parts.length,medianMs:measure({
        fortressPartsBefore:()=>update(false), fortressPartsAfter:()=>update(true),
        boatSprites:()=>{c.clearRect(0,0,720,840);for(const e of boats)drawBoat({c,px:10},e,2);},
        fortressSprites:()=>{c.clearRect(0,0,720,840);for(const e of cores)drawFortress({c,px:10},e,sim);},
      })});
    }
    return {note:'Headless Edge CPU submission microbenchmarks; sprite caches warmed; excludes full scene lighting, water and GPU presentation. Fortress lookup timings include map rebuild/clear.',rows,complex};
  });
  mkdirSync('test-results',{recursive:true});
  writeFileSync('test-results/defend-combat-performance.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
