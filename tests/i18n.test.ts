import assert from "node:assert/strict";
import test from "node:test";
import {LANGUAGES,MESSAGES,translate,setLanguage,getLanguage,type Language} from "../src/i18n/index.ts";
import {decode,defaults} from "../src/save.ts";

const placeholders=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
test("all nine language catalogs have complete, unique messages and matching placeholders",()=>{
  assert.equal(LANGUAGES.length,9);
  assert.equal(new Set(LANGUAGES.map(l=>l.code)).size,9);
  assert.equal(new Set(MESSAGES.map(r=>r[0])).size,MESSAGES.length);
  for(const row of MESSAGES){
    assert.equal(row.length,LANGUAGES.length+1,row[0]);
    for(const message of row.slice(1)){
      assert.ok(message.trim(),row[0]);
      assert.deepEqual(placeholders(message),placeholders(row[1]),row[0]);
      assert.ok(!/[<>]/.test(message),`${row[0]} must be plain text`);
    }
  }
});
test("messages interpolate literal values and unsupported locales use English",()=>{
  assert.equal(translate("es","nav.settings"),"Ajustes");
  assert.equal(translate("ja","nav.settings"),"設定");
  assert.equal(translate("de","common.level",{level:4}),"Stufe 4");
  assert.equal(translate("en","common.level"),"level {level}");
  assert.equal(translate("en","common.level",{level:"$&{test}"}),"level $&{test}");
  assert.equal(translate("unknown" as Language,"nav.settings"),"Settings");
  setLanguage("ko");assert.equal(getLanguage(),"ko");
  setLanguage("unknown");assert.equal(getLanguage(),"en");
});
test("language migrates to English, persists all choices, and leaves gameplay state intact",()=>{
  const original=defaults();
  assert.equal(original.settings.language,"en");
  for(const raw of [undefined,null,{},"xx",2])assert.equal(decode(JSON.stringify({version:1,settings:{language:raw}})).settings.language,"en");
  const reference=decode(JSON.stringify(original));
  for(const {code} of LANGUAGES){
    original.settings.language=code;
    const saved=decode(JSON.stringify(original));
    assert.equal(saved.settings.language,code);
    saved.settings.language="en";
    assert.deepEqual(saved,reference,"only the display preference changes");
  }
});
