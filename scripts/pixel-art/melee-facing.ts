/** Build native directional body PNGs from the shared glyph source. */
import { deflateSync } from "node:zlib";
import { mkdirSync,readFileSync,writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BODY_CELL,BODY_DIRECTIONS,BODY_FRAMES } from "../../src/defend/melee-body-data.ts";
const w=BODY_CELL*4,h=BODY_CELL*BODY_FRAMES.length,data=Buffer.alloc(w*h*4);
BODY_FRAMES.forEach((f,i)=>BODY_DIRECTIONS.forEach((dir,col)=>f.views[dir].forEach((row,y)=>[...row].forEach((ch,x)=>{
 if(ch===".")return;
 const hex=f.palette[ch];if(!hex)throw Error(`Unknown glyph ${ch} in ${f.key}`);
 const at=((i*BODY_CELL+1+y)*w+col*BODY_CELL+1+x)*4;
 for(let k=0;k<3;k++)data[at+k]=parseInt(hex.slice(1+k*2,3+k*2),16);data[at+3]=255;
}))));
function chunk(type:string,bytes:Uint8Array){
 const name=Buffer.from(type),out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);name.copy(out,4);out.set(bytes,8);
 let crc=0xffffffff;for(const b of Buffer.concat([name,bytes])){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}
 out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;
}
const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;
const scan=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++)scan.set(data.subarray(y*w*4,(y+1)*w*4),y*(w*4+1)+1);
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(scan,{level:9})),chunk("IEND",new Uint8Array())]);
const path=fileURLToPath(new URL("../../public/assets/pixel/v2/units/melee-facing.png",import.meta.url));
if(process.argv.includes("--check")){if(!readFileSync(path).equals(png))throw Error("Directional melee PNG needs rebuilding");}
else{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,png);}
console.log(`${BODY_FRAMES.length*4} native directional frames: ${w}×${h}`);
