import test from "node:test";
import assert from "node:assert/strict";
import { AREAS, isTestArea } from "../src/defend/areas.ts";
import { ZONE_STORIES, zoneStory } from "../src/defend/zone-stories.ts";

test("each of the ten zones opens with a story on its first wave", () => {
  const zones = AREAS.filter((a) => !isTestArea(a));
  zones.forEach((area, i) => {
    const story = zoneStory(1 + i * 20);
    assert.ok(story, `${area.name} has a story`);
    assert.equal(story, ZONE_STORIES[area.id]);
    assert.ok(story.title && story.signature && story.paragraphs.length > 0);
  });
  assert.equal(zoneStory(1)?.title, "By Royal Proclamation");
});

test("other waves, and the endless laps after the ten zones, have no story", () => {
  for (const wave of [0, 2, 20, 22, 40, 199, 200, 201, 221, 1.5, NaN]) assert.equal(zoneStory(wave), null, `wave ${wave}`);
});
