/** Damage is reported by native hurtEnemy after mitigation, clamped to live HP. */
export type BuildingTally={kills:number;damage:number;waveDamage:number;since:number;wave:number};
export class AmbushTallies {
 private rows=new Map<number,BuildingTally>();
 constructor(private clock:()=>{wave:number;elapsed:number;waveStarted:number}){}
 private row(id:number){
  const c=this.clock();let row=this.rows.get(id);
  if(!row){row={kills:0,damage:0,waveDamage:0,since:c.elapsed,wave:c.wave};this.rows.set(id,row);}
  if(row.wave!==c.wave){row.wave=c.wave;row.waveDamage=0;row.since=c.waveStarted;}
  return row;
 }
 add(id:number,damage:number,killed:boolean){const r=this.row(id);r.damage+=damage;r.waveDamage+=damage;if(killed)r.kills++;}
 placed(id:number){this.row(id);}
 get(id:number){const r=this.row(id);return {...r,dps:r.waveDamage/Math.max(1/30,this.clock().elapsed-r.since)};}
}
