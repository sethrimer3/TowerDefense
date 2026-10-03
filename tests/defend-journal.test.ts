import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDefendSave, decodeDefendSave } from '../src/defend/progress.ts';
import { journalHTML } from '../src/defend/journal.ts';

test('journal discovery and unread entries persist and reject unknown save values', () => {
  const save = defaultDefendSave();
  save.discovered = ['roach', 'dragon'];
  save.journalRead = ['roach'];
  const loaded = decodeDefendSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(loaded.discovered, ['roach', 'dragon']);
  assert.deepEqual(loaded.journalRead, ['roach']);
  const invalid = decodeDefendSave({ ...save, discovered: ['roach', 'fake', 'roach'], journalRead: ['dragon', 'roach'] });
  assert.deepEqual(invalid.discovered, ['roach']);
  assert.deepEqual(invalid.journalRead, ['roach']);
  const legacy = { ...save } as any; delete legacy.discovered; delete legacy.journalRead;
  assert.deepEqual(decodeDefendSave(legacy).discovered, []);
});

test('journal shows only discovered enemies and describes their actual special abilities', () => {
  assert.match(journalHTML([]), /Encounter enemies/);
  const html = journalHTML(['roach', 'poisonSovereign', 'aegis']);
  assert.match(html, /Instantly kills player units/);
  assert.match(html, /Permanent shield/);
  assert.doesNotMatch(html, /Dragon/);
  assert.ok(html.indexOf('<h3>Roach') < html.indexOf('<h3>Invincible'));
});
