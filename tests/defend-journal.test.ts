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


test('journal groups shared species and offspring into zones, sorted by difficulty', () => {
  const html = journalHTML(['ogre', 'roach', 'orc', 'broodling', 'iceGolem']);
  const moss = html.split('data-zone="moss"')[1].split('</section>')[0];
  assert.ok(moss.indexOf('data-portrait="roach"') < moss.indexOf('data-portrait="orc"'));
  assert.ok(moss.indexOf('data-portrait="orc"') < moss.indexOf('data-portrait="ogre"'));
  assert.match(moss, /data-portrait="broodling"/);
  const frozen = html.split('data-zone="frozen"')[1].split('</section>')[0];
  assert.match(frozen, /data-portrait="iceGolem"/);
  assert.match(frozen, /data-portrait="ogre"/);
  assert.doesNotMatch(frozen, /data-portrait="roach"/);
});

test('battle speed preference survives saves and rejects invalid or locked speeds', () => {
  for (const speed of [1, 2, 3] as const) {
    const save = defaultDefendSave();
    save.speed3 = true; save.battleSpeed = speed;
    assert.equal(decodeDefendSave(JSON.parse(JSON.stringify(save))).battleSpeed, speed);
  }
  for (const speed of [undefined, null, 0, 4, 2.5, '2', 3]) {
    assert.equal(decodeDefendSave({ ...defaultDefendSave(), battleSpeed: speed }).battleSpeed, 1);
  }
});
