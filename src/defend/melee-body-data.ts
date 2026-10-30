/** Established procedural body drawings, including their directional views. */
import type { Facing } from "./melee-facing.ts";
const mirror = (rows: readonly string[]) => rows.map(row => [...row].reverse().join(""));
const views = (south: readonly string[], north: readonly string[], east: readonly string[]): Record<Facing, readonly string[]> => ({ south, north, east, west: mirror(east) });
export const HERO_FRONT = [
  "...........",
  "....PPP....",
  "....HhH....",
  "...HHhHH...",
  "...HvvvH...",
  ".GGGAAAaGG.",
  ".CCAAgAacc.",
  ".CCAgggacc.",
  ".CC.AAa.cc.",
  "..C.A.a.c..",
  "....b.b....",
];
export const HERO_COLORS : Record<string,string> = { "0": "#120e0a", H: "#e9c46a", h: "#fff4c8", G: "#c9a24e", v: "#1c1a22", A: "#dfe4ec", a: "#8e98ac", g: "#d2a640", b: "#4a3626" };
export const HERO_CAPES: Record<string, [string,string,string]> = {
  "": ["#b8302e", "#7a1e1e", "#e8483e"],
  whirlwind: ["#3e64a8", "#26406e", "#9fd8f4"],
  bladeDance: ["#2a1c24", "#140e12", "#e04a3a"],
  legend: ["#f4f3f6", "#b8b9c8", "#e9c46a"],
};
export const VALK_FRONT = [
  ".W...H...W.",
  ".WW.HhH.WW.",
  ".WWw0s0wWW.",
  "..wwAAAaww.",
  "....AAAa...",
  "....Aaa....",
  "....ggg....",
  "....g.g....",
  "....b.b....",
];
export const VALK_COLORS : Record<string,string> = {
  "0": "#120e0a", W: "#fbfaf4", w: "#c9cbd8", H: "#e9c46a", h: "#fff4c8", s: "#f0d2ae", A: "#e2e6ee", a: "#9aa2b4", g: "#d2a640", b: "#5a4632",
};
export const NECRO_ROWS = {
  warrior: [
  ".........",
  "..www..s.",
  "..gwg..s.",
  "...w...s.",
  "..wlw..s.",
  ".wlwlwhhh",
  "..wlw..h.",
  "...w.....",
  "..w.w....",
  ".........",
],
  archer: [
  ".........",
  ".b..www..",
  ".b..gwg..",
  ".b...w...",
  ".b..wlw..",
  ".b.wlwlw.",
  ".b..wlw..",
  ".b...w...",
  "....w.w..",
  ".........",
],
  amalgam: [
  "...............",
  "....wwwwwwl....",
  "...wwwwwwwwl...",
  "...wggwwwggwl..",
  "...wgowwwgowl..",
  "....wwwoowwl...",
  ".wwwolwlwlw.ww.",
  ".wgwolwlwlw.gw.",
  ".wwwowlwlwl.ww.",
  "....wlwlwlw....",
  "....wlwlwlw....",
  "...www.l.www...",
  "..wlw.....wlw..",
  "..ww.......ww..",
  "...............",
],
} as const;
export const NECRO_COLORS : Record<string,string> = { o: "#0b0907", w: "#e8e2cf", l: "#a39a82", g: "#8dffa6", s: "#a7b0b8", h: "#6b4a2a", b: "#7a5a34" };
export const CALLED_ROWS = {
  knight: [
  ".........",
  "..lll..l.",
  "..ddd..l.",
  "...l...l.",
  "..bbb..s.",
  ".sbybyhhh",
  ".sbbb..h.",
  "..bbb....",
  "..s.s....",
  ".........",
],
  archer: [
  ".........",
  ".w..ggg..",
  ".w..kkk..",
  ".w...k...",
  ".w..ggg..",
  ".w.ggggg.",
  ".w..ggg..",
  ".w...g...",
  "....s.s..",
  ".........",
],
  champion: [
  "...............",
  "....yyyyy....s.",
  "....yldly....s.",
  "....ddddd......",
  ".....yyy.....h.",
  ".....yyy.....h.",
  ".rrylllllyrr.h.",
  ".rrylyyylyrr.h.",
  ".rrylyyylyrr.h.",
  "..rylllllyr..h.",
  "...yllllly...h.",
  "....yy.yy....h.",
  "....ll..ll.....",
  "...............",
],
};
export const CALLED_COLORS : Record<string,string> = {
  o: "#0b0907", l: "#d8dee6", s: "#a7b0b8", d: "#4a5466", b: "#3d6fc4", y: "#f6c75a", h: "#6b4a2a",
  g: "#4f8a3a", k: "#e0b48a", w: "#7a5a34", r: "#b8302a",
};

export const HERO_VIEWS = views(HERO_FRONT, [
  "...........",
  "....PPP....",
  "....HhH....",
  "...HHhHH...",
  "...HHHHH...",
  ".GGGCCCCGG.",
  ".CCCcCcCCC.",
  ".CCCcCcCCC.",
  ".CCCcCcCCC.",
  "..CCbCbCC..",
  "....b.b....",
], [
  "...........",
  "....PPP....",
  "....HhH....",
  "....HHhH...",
  "....HHvv...",
  "...GAAAaG..",
  "...CAgAaG..",
  "...CAgga...",
  "...C.Aa....",
  ".....b.b...",
  "...........",
]);
export const VALK_VIEWS = views(VALK_FRONT, VALK_FRONT.map(row=>row.replaceAll('s','H')), [
  "...W..H....",
  "...WW.hH...",
  "...Ww.s....",
  "....wAAa...",
  "....wAAa...",
  ".....Aa....",
  ".....gg....",
  ".....g0g...",
  "......b.b..",
]);
export const WARRIOR_VIEWS = views(NECRO_ROWS.warrior,mirror(NECRO_ROWS.warrior.map(row=>row.replaceAll('g','l'))),[
  ".........",
  "...www.s.",
  "...wlg.s.",
  "....w..s.",
  "...wlw.s.",
  "..wlwlhhh",
  "...wlw.h.",
  "....w....",
  "....ww...",
  ".........",
]);
export const AMALGAM_VIEWS = views(NECRO_ROWS.amalgam,NECRO_ROWS.amalgam.map(row=>row.replaceAll('g','l')),[
  "...............",
  "......wwwwl....",
  ".....wwwwwwl...",
  ".....wlwwwgl...",
  ".....wlwwogol..",
  ".....wlwwwwl...",
  "...wwwolwlwl...",
  "...wgwolwwl....",
  "...wwwowlwl....",
  "......wlwl.....",
  "......wlwl.....",
  ".....wwwl......",
  "....wlw.wl.....",
  "....ww...ww....",
  "...............",
]);
export const KNIGHT_VIEWS = views(CALLED_ROWS.knight,mirror(CALLED_ROWS.knight.map((row,y)=>row.replaceAll(y<4?'d':'y',y<4?'s':'b'))),[
  ".........",
  "...lll.l.",
  "...ldd.l.",
  "....l..s.",
  "...bbb.s.",
  "..bbbyhhh",
  "...bbb.h.",
  "....b....",
  "....ss...",
  ".........",
]);
export const CHAMPION_VIEWS = views(CALLED_ROWS.champion,mirror(CALLED_ROWS.champion.map((row,y)=>y<4?row.replaceAll('d','s'):row)),[
  "...............",
  "......yyyyy..s.",
  "......ylddy..s.",
  "......dddd.....",
  ".......yyy...h.",
  ".......yyy...h.",
  "...rryllyyr..h.",
  "...rrylyyr...h.",
  "...rrylyyr...h.",
  "....ryllyr...h.",
  ".....ylly....h.",
  "......yoyy...h.",
  "......ll.ll....",
  "...............",
]);
export type BodyKind = 'hero'|'valkyrie'|'warrior'|'amalgam'|'knight'|'champion';
export type BodyOptions = {look?:string;struck?:boolean;ghost?:boolean;stood?:boolean};
export type BodyFrame = {key:string;views:Record<Facing,readonly string[]>;palette:Record<string,string>};
const blend=(hex:string,t:number,to=255)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-t)+to*t).toString(16).padStart(2,'0')).join('');
export function bodyKey(kind:BodyKind,o:BodyOptions={}) {return `${kind}:${kind==='hero'&&!o.ghost?o.look??'':''}:${!!o.struck}:${!!o.ghost}:${!!o.stood}`;}
export const BODY_FRAMES:BodyFrame[]=[];
function frame(kind:BodyKind, v:Record<Facing,readonly string[]>,palette:Record<string,string>,o:BodyOptions={}){
 const colors={...palette};
 for(const ch in colors){
  const edge=ch==='o'||ch==='0';
  if(o.ghost) colors[ch]=kind==='hero'?(edge?'#5a6478':'hAP'.includes(ch)?'#ffffff':'#c9d2e0'):(edge?'#9a7428':'Wwh'.includes(ch)?'#fff4c8':'#e9c46a');
  else if(edge&&o.stood) colors[ch]='#f6c75a';
  else if(!edge&&o.struck) colors[ch]=kind==='hero'?blend(colors[ch],.67):'#ffffff';
 }
 BODY_FRAMES.push({key:bodyKey(kind,o),views:v,palette:colors});
}
for(const look of Object.keys(HERO_CAPES)) for(const struck of [false,true]){
 const [C,c,P]=HERO_CAPES[look];frame('hero',HERO_VIEWS,{...HERO_COLORS,C,c,P},{look,struck});
}
frame('hero',HERO_VIEWS,{...HERO_COLORS,C:'#b8302e',c:'#7a1e1e',P:'#e8483e'},{ghost:true});
for(const struck of [false,true]){
 frame('valkyrie',VALK_VIEWS,VALK_COLORS,{struck});
 frame('warrior',WARRIOR_VIEWS,NECRO_COLORS,{struck});frame('amalgam',AMALGAM_VIEWS,NECRO_COLORS,{struck});
 for(const stood of [false,true]){frame('knight',KNIGHT_VIEWS,CALLED_COLORS,{struck,stood});frame('champion',CHAMPION_VIEWS,CALLED_COLORS,{struck,stood});}
}
frame('valkyrie',VALK_VIEWS,VALK_COLORS,{ghost:true});
