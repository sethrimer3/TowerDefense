/** Procedural 24×24 rank badges. Black outlines and upper-left highlights. */
import { rankOf,type SiegeRank,RANKS } from '../campaign/siege-ranks.ts';
const PALETTES=[['#784323','#c78b51','#f0c58b'],['#647785','#b8cbd3','#eff6ed'],['#946523','#e6b84d','#fff0ab'],['#3c7c81','#86c7c2','#d6fff2'],['#455d9b','#80b5e2','#e7faff'],['#713d91','#bc7cdc','#f4d4ff'],['#943c32','#e97d4a','#ffe6a1']];
const NUMERALS:Record<string,string[]>= {V:['101','101','101','101','010'],IV:['10101','10101','10101','10101','10010'],III:['10101','10101','10101','10101','10101'],II:['101','101','101','101','101'],I:['1','1','1','1','1']};
export function emblemPixels(rank:SiegeRank,division:string){
 const index=RANKS.indexOf(rank),palette=['#101319',...PALETTES[index]],pixels=new Map<number,string>();
 const put=(x:number,y:number,c:number)=>{if(x>=0&&x<24&&y>=0&&y<24)pixels.set(y*24+x,palette[c]);};
 const rect=(x:number,y:number,w:number,h:number,c:number)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)put(xx,yy,c);};
 // The shield grows a wing for each higher rank; crown and gem distinguish the summit.
 if(index>0)for(const side of [0,1])for(let row=0;row<Math.min(5,index+1);row++){const x=side?18:5-row;rect(x,5+row,1+row,2,0);rect(side?19:6-row,5+row,Math.max(1,row),1,2);}
 for(let y=4;y<=17;y++){const taper=Math.max(0,y-12),left=6+Math.floor(taper/2),right=17-Math.floor(taper/2);rect(left,y,right-left+1,1,0);if(y>4&&y<17){rect(left+1,y,right-left-1,1,2);put(left+1,y,3);put(right-1,y,1);}}
 rect(8,6,8,6,1);rect(9,6,6,1,3);rect(9,7,6,4,2);
 if(index>=3){rect(10,7,4,3,0);put(11,7,3);put(12,8,2);put(11,9,1);}
 if(index>=5){rect(7,1,2,4,0);rect(11,0,2,5,0);rect(15,1,2,4,0);rect(8,3,8,2,0);rect(8,3,8,1,2);put(8,1,3);put(12,1,3);put(16,1,3);}
 if(index===6){for(const side of [0,1]){rect(side?20:2,11,2,5,0);put(side?20:3,11,3);put(side?21:2,13,2);}rect(10,17,4,2,0);rect(11,18,2,1,3);}
 // The division remains readable at a small size, on its own dark ribbon.
 rect(5,18,14,6,0);rect(6,18,12,1,1);
 const rows=NUMERALS[division]??NUMERALS.I,w=rows[0].length,x0=Math.floor((24-w)/2);
 for(let y=0;y<rows.length;y++)for(let x=0;x<w;x++)if(rows[y][x]==='1')put(x0+x,19+y,3);
 return pixels;
}
export function paintRankEmblem(canvas:HTMLCanvasElement,mmr:number){
 const r=rankOf(mmr);canvas.width=canvas.height=72;const c=canvas.getContext('2d')!;c.clearRect(0,0,72,72);c.imageSmoothingEnabled=false;
 for(const [pixel,color] of emblemPixels(r.rank,r.division)){c.fillStyle=color;c.fillRect(pixel%24*3,Math.floor(pixel/24)*3,3,3);}
}
