// Native sprite and live ice-trail gallery, isolated from player saves.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless:true, executablePath:process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage({viewport:{width:960,height:780}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/')+'tests/performance.html');
  const result = await page.evaluate(async () => {
    const { drawIceEnemy } = await import('/src/defend/ice-enemy-art.ts');
    const { DefendSim } = await import('/src/defend/sim.ts');
    const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
    const { generateCity } = await import('/src/defend/citygen.ts');
    const { UPGRADES } = await import('/src/defend/catalog.ts');
    const { stepEnemy } = await import('/src/defend/enemies.ts');
    const { cellIndex } = await import('/src/defend/grid.ts');
    const { FloodArt } = await import('/src/defend/flood-art.ts');
    const { iceAt } = await import('/src/defend/boats.ts');
    const sim = new DefendSim(generateCity(fitLayout(defaultLayout()),3),Object.fromEntries(UPGRADES.map(u=>[u.id,0])),4);
    const canvas=document.querySelector('canvas'); canvas.width=940;canvas.height=740;
    canvas.style.cssText='width:940px;height:740px';document.body.style.cssText='margin:10px;background:#101a28';
    const c=canvas.getContext('2d'); c.fillStyle='#16283c';c.fillRect(0,0,940,740);
    c.font='18px sans-serif';c.fillStyle='#dbf5ff';c.fillText('Frozen Vault · new enemy sprites',24,30);
    const probe=document.createElement('canvas');probe.width=probe.height=128;
    const pc=probe.getContext('2d'), results=[];
    for(const [row,kind] of ['iceGolem','iceCube'].entries()) {
      for(const [col,state] of ['intact','damaged','hit','marked'].entries()) {
        const e=sim.newEnemy(kind,(110+col*230)/100,(130+row*180)/100);
        if(state==='damaged')e.hp=e.maxHp*.3;
        if(state==='hit')e.flash=.1;
        if(state==='marked')e.marked=true;
        drawIceEnemy({c,px:100},e);
        c.fillStyle='#dbf5ff';c.fillText(`${row?'Ice Cube':'Ice Golem'} · ${state}`,30+col*230,210+row*180);
        for(const px of [6,24,64]) {
          pc.clearRect(0,0,128,128);drawIceEnemy({c:pc,px},{...e,x:64/px,y:64/px});
          const pixels=new Uint32Array(pc.getImageData(0,0,128,128).data.buffer);
          const visible=pixels.filter(v=>v>>>24).length;
          if(!visible)throw Error(`${kind}/${state}/${px} invisible`);
          results.push({kind,state,px,visible});
        }
      }
    }
    sim.solid.fill(0);sim.field.fill(1000);sim.wave=101;
    for(let x=4;x<=16;x++)sim.field[cellIndex(x,12)]=30-x;
    for(let y=13;y<=16;y++)sim.field[cellIndex(16,y)]=26-y;
    const cube=sim.spawnAuxiliary('iceCube',4.5,12.5);
    for(let n=0;n<180;n++){stepEnemy(sim,cube,1/30);sim.time+=1/30;}
    const layer=document.createElement('canvas');layer.width=940;layer.height=740;
    c.save();c.translate(0,50);
    new FloodArt().draw({c,px:32,sim,rain:false,reduceMotion:true,reflections:false,layer,layerScale:1,area:'frozen'});
    drawIceEnemy({c,px:32},cube);
    c.restore();
    c.fillStyle='#dbf5ff';c.fillText('An orthogonal slide leaves a persistent, meltable ice trail',24,680);
    return {results,trail:sim.floods.length,frozen:iceAt(sim,8.5,12.5),position:[cube.x,cube.y]};
  });
  assert.equal(result.results.length,24);assert.ok(result.trail>10&&result.frozen);
  assert.deepEqual(errors,[]);
  mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/defend-ice-enemies.png'});
  console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
