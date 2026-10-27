/** A bounded, declarative banner; no uploaded images or executable markup. */
export const FLAG_WIDTH=16, FLAG_HEIGHT=24, MAX_LAYERS=12;
export const PALETTE=[
  {name:'Ivory',hex:'#f0dfb1'},{name:'Coal',hex:'#252631'},{name:'Crimson',hex:'#a83240'},{name:'Gold',hex:'#e7b54a'},
  {name:'Azure',hex:'#3d71b5'},{name:'Forest',hex:'#3b7047'},{name:'Violet',hex:'#79539b'},{name:'White',hex:'#f4f1e5'},
  {name:'Copper',hex:'#b97741'},{name:'Rose',hex:'#d88491'},{name:'Sky',hex:'#77bccc'},{name:'Lime',hex:'#9db762'},
  {name:'Navy',hex:'#263d69'},{name:'Wine',hex:'#612f4a'},{name:'Stone',hex:'#94949a'},{name:'Orange',hex:'#df8240'},
] as const;
export const PATTERNS=['leftHalf','topHalf','diagonal','stripes','border','cross','saltire','chevron','diamond','roundel','crown','tower'] as const;
export type Pattern=typeof PATTERNS[number];
export const PATTERN_NAMES:Record<Pattern,string>={leftHalf:'Left half',topHalf:'Top half',diagonal:'Diagonal half',stripes:'Stripes',border:'Border',cross:'Cross',saltire:'Diagonal cross',chevron:'Chevron',diamond:'Diamond',roundel:'Roundel',crown:'Crown',tower:'Tower'};
export const OPACITIES=[25,50,75,100] as const;
export type Opacity=typeof OPACITIES[number];
export type FlagLayer={pattern:Pattern;color:number;opacity?:Opacity};
export type Flag={base:number;layers:FlagLayer[]};
export type PlayerProfile={name:string;flag:Flag};
export const defaultFlag=():Flag=>({base:12,layers:[]});
export function cleanName(raw:unknown):string|null {
  if(typeof raw!=='string')return null;
  const name=raw.normalize('NFC').trim().replace(/\s+/gu,' ');
  return [...name].length>=2&&[...name].length<=24&&/^[\p{L}\p{N}\p{M} ._'’-]+$/u.test(name)&&/[\p{L}\p{N}]/u.test(name)?name:null;
}
const color=(v:unknown):v is number=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<PALETTE.length;
export function decodeProfile(raw:unknown):PlayerProfile|undefined {
  if(!raw||typeof raw!=='object')return undefined;
  const p=raw as PlayerProfile,name=cleanName(p.name),flag=p.flag;
  if(!name||!flag||!color(flag.base)||!Array.isArray(flag.layers)||flag.layers.length>MAX_LAYERS)return undefined;
  const layers:FlagLayer[]=[];
  for(const layer of flag.layers){if(!layer||!PATTERNS.includes(layer.pattern)||!color(layer.color)||(layer.opacity!==undefined&&!OPACITIES.includes(layer.opacity)))return undefined;layers.push({pattern:layer.pattern,color:layer.color,...(layer.opacity!==undefined?{opacity:layer.opacity}:{})});}
  return {name,flag:{base:flag.base,layers}};
}
/** Every mask is defined on the native 16×24 pixel lattice. */
export function covers(pattern:Pattern,x:number,y:number) {
  const dx=Math.abs(x-7.5),dy=Math.abs(y-11.5);
  switch(pattern){
    case 'leftHalf':return x<8;
    case 'topHalf':return y<12;
    case 'diagonal':return x*24<=y*16;
    case 'stripes':return x%6<3;
    case 'border':return x<2||x>=14||y<2||y>=22;
    case 'cross':return dx<2||dy<2;
    case 'saltire':return Math.abs(x-y*15/23)<1.5||Math.abs(15-x-y*15/23)<1.5;
    case 'chevron':return y>=13-Math.abs(x-7.5)&&y<17-Math.abs(x-7.5);
    case 'diamond':return dx/6+dy/8<1;
    case 'roundel':return dx*dx+dy*dy<27;
    case 'crown':return y>=9&&y<=15&&x>=3&&x<=12&&(y>=13||x<=4||x>=11||x>=7&&x<=8);
    case 'tower':return x>=4&&x<=11&&y>=7&&y<=17&&(y>=10||x<=5||x>=10||x===7||x===8)&&!(x>=7&&x<=8&&y>=14);
  }
}
const paletteRgb=PALETTE.map(c=>parseInt(c.hex.slice(1),16));
const pixelHex=(rgb:number)=>`#${rgb.toString(16).padStart(6,'0')}`;
/** Opaque RGB pixels, composited bottom to top with per-layer opacity. */
export function flagPixels(flag:Flag) {
  const pixels=new Uint32Array(FLAG_WIDTH*FLAG_HEIGHT).fill(paletteRgb[flag.base]);
  for(const layer of flag.layers){
    const source=paletteRgb[layer.color],alpha=(layer.opacity??100)/100;
    for(let y=0;y<FLAG_HEIGHT;y++)for(let x=0;x<FLAG_WIDTH;x++)if(covers(layer.pattern,x,y)){
      const i=y*FLAG_WIDTH+x,dest=pixels[i];
      const r=Math.round((source>>>16)*alpha+(dest>>>16)*(1-alpha));
      const g=Math.round(((source>>>8)&255)*alpha+((dest>>>8)&255)*(1-alpha));
      const b=Math.round((source&255)*alpha+(dest&255)*(1-alpha));
      pixels[i]=(r<<16)|(g<<8)|b;
    }
  }
  return pixels;
}
export function drawFlag(canvas:HTMLCanvasElement,flag:Flag) {
  canvas.width=FLAG_WIDTH;canvas.height=FLAG_HEIGHT;
  const c=canvas.getContext('2d')!,pixels=flagPixels(flag);c.imageSmoothingEnabled=false;
  for(let y=0;y<FLAG_HEIGHT;y++)for(let x=0;x<FLAG_WIDTH;x++){c.fillStyle=pixelHex(pixels[y*FLAG_WIDTH+x]);c.fillRect(x,y,1,1);}
}
/** SVG uses only bounded composited RGB pixels, never player text. */
export function flagSvg(flag:Flag,className='profile-flag') {
  const pixels=flagPixels(flag);let rects='';
  for(let y=0;y<FLAG_HEIGHT;y++)for(let x=0;x<FLAG_WIDTH;){const color=pixels[y*FLAG_WIDTH+x];let end=x+1;while(end<FLAG_WIDTH&&pixels[y*FLAG_WIDTH+end]===color)end++;rects+=`<rect x="${x}" y="${y}" width="${end-x}" height="1" fill="${pixelHex(color)}"/>`;x=end;}
  return `<svg class="${className}" viewBox="0 0 16 24" role="img" aria-label="Player flag" shape-rendering="crispEdges">${rects}</svg>`;
}
export const escapeText=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
