import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { PIXEL_SPRITES, drawPixel, drawPixelFrame, drawRoof, pixelSprite, preloadPixelArt, pixelArtOn, pixelKey, setPixelArt, onPixelArt } from "../src/defend/pixel-sprites.ts";

test("the retained checkbox never loads or draws replacement PNGs in either state", () => {
  const original=Object.getOwnPropertyDescriptor(globalThis,"Image");let requested=0;
  Object.defineProperty(globalThis,"Image",{configurable:true,value:class {constructor(){requested++;}}});
  const canvas=new Proxy({},{get(){throw Error("A removed PNG probe touched the legacy canvas");}}) as CanvasRenderingContext2D;
  try {
    assert.deepEqual(PIXEL_SPRITES,[]);
    for(const on of [true,false,true]){
      setPixelArt(on);preloadPixelArt();
      for(const id of ["defend-keep","archer","floor-1","v2/defend/barracks","v2/units/melee-facing","v2/effects/bow-javelin"]){
        assert.equal(pixelSprite(id),null);
        assert.equal(drawPixel(canvas,id,0,0,32),false);
        assert.equal(drawPixelFrame(canvas,id,{sx:0,sy:0,sw:32,sh:32},0,0,32,32),false);
      }
      assert.equal(drawRoof(canvas,0,{x:0,y:0,w:32,h:32},8),false);
    }
    assert.equal(requested,0,"no Image constructors or network requests");
    assert.equal(existsSync(new URL("../public/assets/pixel/",import.meta.url)),false);
    assert.equal(existsSync(new URL("../scripts/pixel-art/",import.meta.url)),false);
  } finally {
    if(original)Object.defineProperty(globalThis,"Image",original);else delete (globalThis as {Image?:unknown}).Image;
    setPixelArt(true);
  }
});

test("procedural visual preferences still notify caches when the checkbox changes", () => {
  setPixelArt(true);const before=pixelKey(),events:string[]=[];onPixelArt(()=>events.push(pixelKey()));
  setPixelArt(false);assert.equal(pixelArtOn(),false);assert.equal(pixelKey(),"off");
  setPixelArt(false);assert.equal(events.length,1,"unchanged setting does not redraw");
  setPixelArt(true);assert.equal(pixelArtOn(),true);assert.notEqual(pixelKey(),before);assert.equal(events.length,2);
});
