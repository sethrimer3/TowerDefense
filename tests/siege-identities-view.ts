import '../src/style.css';import '../src/theme.css';
import {generateCastle} from '../src/campaign/castles.ts';import {flagSvg,escapeText} from '../src/profile/model.ts';
document.documentElement.classList.add('pixel-font');
for(let seed=0;seed<24;seed++){const c=generateCastle(seed,1000),card=document.createElement('article');card.style.cssText='background:var(--wood);border:2px solid var(--brass-nails);padding:12px;display:flex;gap:12px;align-items:center';card.innerHTML=flagSvg(c.owner.flag!)+'<strong>'+escapeText(c.owner.name)+'</strong>';document.querySelector('#gallery')!.append(card);}
