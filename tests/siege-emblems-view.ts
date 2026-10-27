import '../src/style.css';import '../src/theme.css';
import { RANKS,DIVISIONS,rankLabel } from '../src/campaign/siege-ranks.ts';
import { paintRankEmblem } from '../src/ui/rank-emblems.ts';
document.documentElement.classList.add('pixel-font');
for(const [i] of RANKS.entries()){
 const card=document.createElement('article');card.style.cssText='background:var(--wood);padding:12px;border:2px solid var(--brass-nails);text-align:center;display:grid;grid-template-columns:repeat(5,1fr);gap:4px';
 const heading=document.createElement('h2');heading.textContent=rankLabel(i*400).split(' ').slice(0,-1).join(' ');heading.style.gridColumn='1 / -1';card.append(heading);
 for(let division=0;division<5;division++){const mmr=i*400+division*80,canvas=document.createElement('canvas');canvas.style.cssText='width:48px;height:48px;image-rendering:pixelated';canvas.setAttribute('aria-label',rankLabel(mmr));paintRankEmblem(canvas,mmr);const cell=document.createElement('div');cell.style.cssText='display:grid;justify-items:center;gap:4px';const label=document.createElement('small');label.textContent=DIVISIONS[division];cell.append(canvas,label);card.append(cell);}
 document.querySelector('#gallery')!.append(card);
}
