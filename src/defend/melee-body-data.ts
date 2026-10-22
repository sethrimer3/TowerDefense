/** Native body drawings reused for directional PNGs and their procedural fallback. */
import type { Facing } from "./melee-facing.ts";
const mirror = (rows: readonly string[]) => rows.map(row => [...row].reverse().join(""));
const views = (south: readonly string[], north: readonly string[], east: readonly string[]): Record<Facing, readonly string[]> => ({ south, north, east, west: mirror(east) });
export const HERO_FRONT = [
  "....000....",
  "...0PPP0...",
  "...0HhH0...",
  "..0HHhHH0..",
  "..0HvvvH0..",
  "0GGGAAAaGG0",
  "0CCAAgAacc0",
  "0CCAgggacc0",
  "0CC0AAa0cc0",
  ".0C0A0a0c0.",
  ".000b0b000.",
];
export const HERO_COLORS : Record<string,string> = { "0": "#120e0a", H: "#e9c46a", h: "#fff4c8", G: "#c9a24e", v: "#1c1a22", A: "#dfe4ec", a: "#8e98ac", g: "#d2a640", b: "#4a3626" };
export const HERO_CAPES: Record<string, [string,string,string]> = {
  "": ["#b8302e", "#7a1e1e", "#e8483e"],
  whirlwind: ["#3e64a8", "#26406e", "#9fd8f4"],
  bladeDance: ["#2a1c24", "#140e12", "#e04a3a"],
  legend: ["#f4f3f6", "#b8b9c8", "#e9c46a"],
};
export const VALK_FRONT = [
  "0W0.0H0.0W0",
  "0WW0HhH0WW0",
  "0WWw0s0wWW0",
  ".0wwAAAaww0",
  "..00AAAa00.",
  "...0Aaa0...",
  "...0ggg0...",
  "...0g0g0...",
  "...0b0b0...",
];
export const VALK_COLORS : Record<string,string> = {
  "0": "#120e0a", W: "#fbfaf4", w: "#c9cbd8", H: "#e9c46a", h: "#fff4c8", s: "#f0d2ae", A: "#e2e6ee", a: "#9aa2b4", g: "#d2a640", b: "#5a4632",
};
export const NECRO_ROWS = {
  warrior: [
    "..ooo..o.",
    ".owwwooso",
    ".ogwgooso",
    "..owo.oso",
    ".owlwooso",
    "owlwlwhhh",
    ".owlwo.h.",
    "..owo....",
    ".ow.wo...",
    ".oo.oo...",
  ],
  archer: [
    ".o..ooo..",
    "ob.owwwo.",
    "ob.ogwgo.",
    "ob..owo..",
    "ob.owlwo.",
    "obowlwlwo",
    "ob.owlwo.",
    "ob..owo..",
    ".o.ow.wo.",
    "...oo.oo.",
  ],
  amalgam: [
    "....ooooooo....",
    "...owwwwwwlo...",
    "..owwwwwwwwlo..",
    "..owggwwwggwlo.",
    "..owgowwwgowlo.",
    ".ooowwwoowwlooo",
    "owwwolwlwlwowwo",
    "owgwolwlwlwogwo",
    "owwwowlwlwlowwo",
    ".ooowlwlwlwooo.",
    "...owlwlwlwo...",
    "..owwwolowwwo..",
    ".owlwo...owlwo.",
    ".owwo.....owwo.",
    ".ooo.......ooo.",
  ],
} as const;
export const NECRO_COLORS : Record<string,string> = { o: "#0b0907", w: "#e8e2cf", l: "#a39a82", g: "#8dffa6", s: "#a7b0b8", h: "#6b4a2a", b: "#7a5a34" };
export const CALLED_ROWS = {
  knight: [
    "..ooo..o.",
    ".ollloolo",
    ".odddoolo",
    "..olo.olo",
    "oobbbooso",
    "osbybyhhh",
    "osbbbo.h.",
    ".obbbo...",
    ".os.so...",
    ".oo.oo...",
  ],
  archer: [
    ".o..ooo..",
    "ow.ogggo.",
    "ow.okkko.",
    "ow..oko..",
    "ow.ogggo.",
    "owogggggo",
    "ow.ogggo.",
    "ow..ogo..",
    ".o.os.so.",
    "...oo.oo.",
  ],
  champion: [
    "....ooooo...ooo",
    "...oyyyyyo..oso",
    "...oyldlyo..oso",
    "...odddddo..ooo",
    "....oyyyo...oho",
    ".ooooyyyoooooho",
    "orrylllllyrroho",
    "orrylyyylyrroho",
    "orrylyyylyrroho",
    ".orylllllyrooho",
    ".ooylllllyoooho",
    "...oyyoyyo..oho",
    "...olloollo.ooo",
    "...oooooooo....",
  ],
};
export const CALLED_COLORS : Record<string,string> = {
  o: "#0b0907", l: "#d8dee6", s: "#a7b0b8", d: "#4a5466", b: "#3d6fc4", y: "#f6c75a", h: "#6b4a2a",
  g: "#4f8a3a", k: "#e0b48a", w: "#7a5a34", r: "#b8302a",
};

export const HERO_VIEWS = views(HERO_FRONT, [
 '....000....','...0PPP0...','...0HhH0...','..0HHhHH0..','..0HHHHH0..',
 '0GGGCCCCGG0','0CCCcCcCCC0','0CCCcCcCCC0','0CCCcCcCCC0','.0CCbCbCC0.','.000b0b000.',
], [
 '....000....','...0PPP0...','...0HhH0...','...0HHhH0..','...0HHvv0..',
 '..0GAAAaG0.','..0CAgAaG0.','..0CAgga0..','..0C0Aa0...','...00b0b0..','....00.00..',
]);
export const VALK_VIEWS = views(VALK_FRONT, VALK_FRONT.map(row=>row.replaceAll('s','H')), [
 '..0W00H0...','..0WW0hH0..','..0Ww0s0...','...0wAAa0..','...0wAAa0..',
 '....0Aa0...','....0gg0...','....0g0g0..','.....0b0b0.',
]);
export const WARRIOR_VIEWS = views(NECRO_ROWS.warrior,mirror(NECRO_ROWS.warrior.map(row=>row.replaceAll('g','l'))),[
 '...ooo.o.','..owwwoso','..owlgoso','...owooso','..owlwoso',
 '.owlwlhhh','..owlw.h.','...owo...','...owwo..','...oooo..',
]);
export const AMALGAM_VIEWS = views(NECRO_ROWS.amalgam,NECRO_ROWS.amalgam.map(row=>row.replaceAll('g','l')),[
 '......ooooo....','.....owwwwlo...','....owwwwwwlo..','....owlwwwglo..','....owlwwogolo.',
 '...oowlwwwwlo..','..owwwolwlwlo..','..owgwolwwlo...','..owwwowlwlo...',
 '...ooowlwlo....','.....owlwlo....','....owwwlo.....','...owlwowlo....','...owwo.owwo...','...ooo...ooo...',
]);
export const KNIGHT_VIEWS = views(CALLED_ROWS.knight,mirror(CALLED_ROWS.knight.map((row,y)=>row.replaceAll(y<4?'d':'y',y<4?'s':'b'))),[
 '...ooo.o.','..olllolo','..olddolo','...olooso','..obbboso','.obbbyhhh','..obbb.h.','...obo...','...osso..','...oooo..',
]);
export const CHAMPION_VIEWS = views(CALLED_ROWS.champion,mirror(CALLED_ROWS.champion.map((row,y)=>y<4?row.replaceAll('d','s'):row)),[
 '......ooooo..oo','.....oyyyyyooso','.....oylddyooso','.....oddddo..oo','......oyyyo..ho',
 '...ooooyyyoo.ho','..orryllyyro.ho','..orrylyyroo.ho','..orrylyyroo.ho','...oryllyroo.ho',
 '...ooyllyooo.ho','.....oyoyyo..ho','.....ollollo.oo','.....ooooooo...',
]);
export const SWORD_VIEWS = views([
 '..00000..','.0lllll0.','.0ldddl0.','..0lll0..','.00AAA00.','0lAaaaAl0','.0AagaA0.','..0aaa0..','..0b.b0..','..00.00..',
],[
 '..00000..','.0lllll0.','.0lllll0.','..0lll0..','.00AAA00.','0lAaaaAl0','.0AaaaA0.','..0aaa0..','..0b.b0..','..00.00..',
],[
 '...0000..','..0llll0.','..0lldd0.','...0ll0..','..0AAA0..','.0AaaaA0.','..0Aga0..','...0aa0..','...0b0b0.','....0.0..',
]);
export type BodyKind = 'hero'|'valkyrie'|'warrior'|'amalgam'|'knight'|'champion'|'sword';
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
 frame('sword',SWORD_VIEWS,{'0':'#1c2a40',l:'#c2ccd0',d:'#252d36',A:'#5b8fd9',a:'#465260',g:'#bd925b',b:'#34271e'},{struck});
 for(const stood of [false,true]){frame('knight',KNIGHT_VIEWS,CALLED_COLORS,{struck,stood});frame('champion',CHAMPION_VIEWS,CALLED_COLORS,{struck,stood});}
}
frame('valkyrie',VALK_VIEWS,VALK_COLORS,{ghost:true});
export const BODY_CELL=18;
export const BODY_DIRECTIONS:Facing[]=['south','west','north','east'];
