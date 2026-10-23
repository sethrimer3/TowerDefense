/** Deterministic PNG delivery for the Archer Barracks' attunements. */
import { deflateSync } from "node:zlib";
import { mkdirSync,readFileSync,writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHER_ART,JAVELIN_SIZE,bowJavelinPixels } from "../../src/defend/archer-art-data.ts";
import { structurePixels,structureRubblePixels } from "../../src/defend/tower-art.ts";

function chunk(type:string,bytes:Uint8Array){
 const name=Buffer.from(type),out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);name.copy(out,4);out.set(bytes,8);
 let crc=0xffffffff;for(const b of Buffer.concat([name,bytes])){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}
 out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;
}
function png(w:number,h:number,data:Uint32Array){
 const head=Buffer.alloc(13);head.writeUInt32BE(w);head.writeUInt32BE(h,4);head[8]=8;head[9]=6;
 const scan=Buffer.alloc((w*4+1)*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const col=data[y*w+x],at=y*(w*4+1)+1+x*4;for(let c=0;c<4;c++)scan[at+c]=(col>>>(c*8))&255;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",head),chunk("IDAT",deflateSync(scan,{level:9})),chunk("IEND",new Uint8Array())]);
}
function paste(out:Uint32Array,w:number,p:Uint32Array,size:number,x:number,y:number){for(let row=0;row<size;row++)out.set(p.subarray(row*size,(row+1)*size),(y+row)*w+x);}
export function archerPngs(){
 const files=new Map<string,Buffer>();
 for(const a of ARCHER_ART){
  const world=new Uint32Array(64*160),ui=new Uint32Array(48*24);
  for(let col=0;col<2;col++){
   for(let stage=0;stage<5;stage++)paste(world,64,stage===4?structureRubblePixels(a.kind,4,4,0):structurePixels(a.kind,4,4,stage,0,col?a.path:"",true),32,col*32,stage*32);
   paste(ui,48,structurePixels(a.kind,3,3,0,0,col?a.path:"",true),24,col*24,0);
  }
  files.set(`v2/defend/${a.name}.png`,png(64,160,world));files.set(`v2/ui/${a.name}.png`,png(48,24,ui));
 }
 const javelins=new Uint32Array(JAVELIN_SIZE*16*JAVELIN_SIZE);
 for(let dir=0;dir<16;dir++)paste(javelins,JAVELIN_SIZE*16,bowJavelinPixels(dir),JAVELIN_SIZE,dir*JAVELIN_SIZE,0);
 files.set("v2/effects/bow-javelin.png",png(JAVELIN_SIZE*16,JAVELIN_SIZE,javelins));return files;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 for(const [name,bytes] of archerPngs()){
  const path=fileURLToPath(new URL(`../../public/assets/pixel/${name}`,import.meta.url));
  if(process.argv.includes("--check")){if(!readFileSync(path).equals(bytes))throw Error(`Rebuild archer PNG: ${name}`);}
  else{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);}
 }
 console.log("7 archer attunement PNGs verified/generated");
}
