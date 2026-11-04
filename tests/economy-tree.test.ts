import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, decode } from '../src/save.ts';
import { placeCityTile, placeStructure } from '../src/defend/layout.ts';
import { economyTree, economySkills, economyNode, startEconomyResearch, economyCard } from '../src/ui/economy-tree.ts';
import { graftedGraph } from '../src/ui/specialty.ts';
import { tileTree } from '../src/tiles.ts';
import { settleResearch } from '../src/research-jobs.ts';
import { skillCost } from '../src/skill-trees.ts';
function fixture(){
 const s=defaults(),k=s.defend.layout.keep;s.knowledge=10000;
 for(const [n,kind] of (['mine','library'] as const).entries()){
  s.defend.layout=placeCityTile(s.defend.layout,k.tx+n+1,k.ty)!;
  s.defend.layout=placeStructure(s.defend.layout,kind,k.tx+n+1,k.ty)!;
 }
 return s;
}
for(const kind of ['mine','library'] as const)test(`${kind}: city and Study share one connected tree with ordered ranks`,()=>{
 const s=fixture(),nodes=economyTree(s,kind),byId=new Map(nodes.map(n=>[n.id,n]));
 assert.deepEqual(graftedGraph(s,kind,undefined),nodes);
 assert.equal(nodes.filter(n=>!n.parent).length,1);
 for(const n of nodes){let current=n,seen=new Set();while(current.parent){assert.ok(!seen.has(current.id));seen.add(current.id);assert.ok(byId.has(current.parent));current=byId.get(current.parent)!;}assert.equal(current.id,`k:${kind}`);}
 for(const id of economySkills(kind))assert.ok(byId.has(economyNode(id,1)));
 const uid=s.defend.layout.structures.find(b=>b.kind===kind)!.uid;
 assert.deepEqual(tileTree(s,kind,`${kind}:${uid}`),{uid});
 assert.ok(tileTree(s,kind,null));
});
test('economy purchases enforce placement, staff, prerequisites, next rank and one lab job',()=>{
 const s=fixture(),id=economyNode('coffee',1),before=s.knowledge;
 assert.equal(startEconomyResearch(s,'mine',economyNode('tactician',1),1000,1),false);
 assert.equal(startEconomyResearch(s,'mine',economyNode('coffee',2),1000,1),false);
 assert.equal(startEconomyResearch(s,'library',id,1000,1),false);
 assert.equal(startEconomyResearch(s,'mine',id,1000,0),false);
 const library=s.defend.layout.structures.find(b=>b.kind==='library')!;
 s.defend.layout.structures=s.defend.layout.structures.filter(b=>b!==library);
 assert.equal(startEconomyResearch(s,'mine',id,1000,1),false);s.defend.layout.structures.push(library);
 assert.ok(startEconomyResearch(s,'mine',id,1000,1));assert.equal(s.skills.coffee,0);
 assert.equal(s.knowledge,before-skillCost('coffee',0));
 assert.equal(startEconomyResearch(s,'mine',id,1000,1),false);
 assert.match(economyCard(s,'mine',id,1),/Researching/);
 assert.equal(settleResearch(s,151000,1),false);
 const restored=decode(JSON.stringify(s));assert.ok(settleResearch(restored,301000,1));
 assert.equal(restored.skills.coffee,1);assert.equal(restored.knowledge,s.knowledge);
 const nodes=economyTree(restored,'mine');
 assert.equal(nodes.find(n=>n.id===id)!.state,'owned');
 assert.equal(nodes.find(n=>n.id===economyNode('coffee',2))!.parent,id);
 assert.equal(nodes.find(n=>n.id===economyNode('coffee',2))!.state,'next');
 assert.deepEqual(economyTree(decode(JSON.stringify(restored)),'mine'),nodes);
});
