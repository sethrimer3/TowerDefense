/** The story told on a scroll when the player starts a zone's first wave
 * (waves 1, 21, 41…): a proclamation, then letters from the realm's scouts,
 * captains and alchemists as the war goes deeper. Only the first pass through
 * the ten zones has a story; the endless laps after it start straight away. */
import { AREAS, WAVES_PER_AREA, type AreaId } from "./areas.ts";

export type ZoneStory = {
  /** The heading inked across the top. */
  title: string;
  /** Who it is to, or the line that opens a letter. */
  greeting?: string;
  paragraphs: readonly string[];
  /** The closing and the name signed under it. */
  signature: string;
};

export const ZONE_STORIES: Partial<Record<AreaId, ZoneStory>> = {
  moss: {
    title: "By Royal Proclamation",
    greeting: "Hear this, all who live beneath the banners of the realm.",
    paragraphs: [
      "The King is dead. He passed in the grey hour before dawn, his hand still on the hilt of the sword he never let rust.",
      "The crown now falls to you, his heir, and with it the keep, its walls, and every road that runs to its gates.",
      "You inherit all that he held: faithful servants who have kept these halls warm for three generations, loyal friends who bled beside him and will bleed beside you, and vaults heavy with the gold of good harvests.",
      "Yet no crown is made of gold alone. You inherit his oaths and his enemies too. Dark things stir beyond the old ruins, and the walls are older than anyone now living.",
      "From this day you are the steward of the kingdom and its shield. You will govern it with wisdom, and you will defend it with your life.",
      "Love this kingdom, and its people will honour you and follow you to the end of their days.",
    ],
    signature: "Sealed by the Royal Chancellor",
  },
  desert: {
    title: "A Letter from the Wastes",
    greeting: "Your Majesty,",
    paragraphs: [
      "I write on the ninth day out, though I can no longer tell east from west by the land alone. You sent me to find green fields or fresh water. I have found neither.",
      "Where the barley once rolled to the horizon there is only sand, amber and endless. The rivers are cracked clay. The orchards of Hollowmere are grey stumps, half buried in dunes that were not there at midsummer.",
      "This is the Dark One's work. Wherever the Blight passed, it drank the soil dry, and the wind did the rest.",
      "I followed a dead riverbed south for three days, hoping for a spring. I found only bones, and the tracks of things that walk on too many legs. The tracks turn north, toward the keep.",
      "Hold the walls, my liege. I will keep searching for as long as my waterskin lasts.",
    ],
    signature: "Your faithful scout, Edda",
  },
  drowned: {
    title: "A Letter Sealed in Haste",
    greeting: "Your Majesty,",
    paragraphs: [
      "I pray this finds you safe in the great cavern. Burn it once it is read.",
      "Three nights ago I lay hidden on the ridge above Deepdelve and watched the dwarf lords open their gates to the Blight. There was no battle. They clasped hands with the Dark One's heralds by torchlight, and by morning their siege engines rolled out beside the crawling host.",
      "Rams shod in iron. Catapults that hurl burning slag. Drills that bore through stone like a needle through cloth. The dwarves know every tunnel beneath these mountains, and they know how to find a cave that does not wish to be found.",
      "They have found ours. The whole army has turned toward the crystal hollows. I counted its fires until I could count no more.",
      "Wake the garrison and light every lamp among the crystals. They are coming for the heart of the kingdom.",
    ],
    signature: "Your scout, Edda",
  },
  ember: {
    title: "Orders of the War Council",
    greeting: "To the commander of the Cinder Outpost,",
    paragraphs: [
      "The council has decided. We will no longer wait in the dark for the dwarves to dig us out.",
      "You will hold this outpost before the Ember Forge, the great furnace at the heart of the dwarven realm, where their engines are cast and their king keeps his throne.",
      "Our envoys carry an offer of peace. The Dwarf King was once our friend; he swore his oaths on our grandfathers' anvils. We mean to remind him of them, if the Dark One's promises have not burned away all his sense.",
      "But hear this plainly. If he will not listen, the alliance ends here, by any means necessary. Break the engines. Bank the furnaces. Let no more iron leave this forge to march beside the Blight.",
      "The heat will be terrible and the slag runs in rivers. Hold the outpost.",
    ],
    signature: "By order of the Crown",
  },
  fungal: {
    title: "From the Alchemist's Journal",
    paragraphs: [
      "The forge has gone quiet, but the Blight did not die with the dwarves' alliance. It fled below, into the Fungal Hollow, where the caps grow taller than towers and the air glitters with spores.",
      "I have tested the spores in a glass alembic. They take root in anything that breathes. Have the soldiers bind damp cloth over their mouths, and burn whatever moves in the undergrowth.",
      "Something down here is feeding the Blight. If we can find its roots, we can cut them.",
    ],
    signature: "Master Alchemist Orrin",
  },
  frozen: {
    title: "A Warning from the North",
    greeting: "Your Majesty,",
    paragraphs: [
      "Beneath the northern glaciers lies the Frozen Vault, where the first kings sealed away the relics too dangerous to keep and too precious to destroy.",
      "The Blight has turned north. It does not come for our people this time. It comes for the Vault.",
      "The cold here kills slowly and the ice remembers every footstep. Whatever the first kings locked away, the Dark One wants it. Do not let the doors be opened.",
    ],
    signature: "Warden Halvard of the Northern March",
  },
  crystal: {
    title: "From the Alchemist's Journal",
    paragraphs: [
      "The violet geode sings. Every soldier hears it, a low hum beneath the ribs that does not stop at night.",
      "I believe the Dark One speaks through the crystal, and that his voice grows stronger with each shard the Blight swallows.",
      "Guard the heart of the geode. If his song reaches the surface, I fear what our own people might do to answer it.",
    ],
    signature: "Master Alchemist Orrin",
  },
  obsidian: {
    title: "A Letter from the Crypt Keeper",
    greeting: "Your Majesty,",
    paragraphs: [
      "The dead are restless in the Obsidian Crypt. Lids have slid from tombs that were sealed for a thousand years.",
      "I will not hide the worst of it from you. Your father's tomb stands open, and the black glass around it is warm to the touch.",
      "Whatever walks these halls now, it is not him. Remember him as he was, and do not hesitate.",
    ],
    signature: "Brother Aldous, Keeper of the Crypt",
  },
  astral: {
    title: "From the Alchemist's Journal",
    paragraphs: [
      "We have reached the Astral Sanctuary, the stargazers' last refuge, built so high that the night sky seems close enough to touch.",
      "Here the old alchemists completed their Great Work, a light that no darkness can swallow. The Dark One has always feared this place.",
      "Hold it, and we may yet turn that light upon him. Lose it, and the stars go out.",
    ],
    signature: "Master Alchemist Orrin",
  },
  nadir: {
    title: "The Final Letter",
    greeting: "My liege,",
    paragraphs: [
      "This is the Nadir, the lowest place in all the world, where the Dark One sits upon a throne of night.",
      "Look behind you. The servants who kept your halls are here. The friends who stood beside your father stand beside you still. Every soul who followed you down into the dark came because they chose to.",
      "You loved this kingdom, and it has followed you to the end. Now let us end this together.",
    ],
    signature: "Your Chancellor, as ever",
  },
};

/** The story to show before starting at `wave`, if it opens a zone on the
 * first pass through them. */
export function zoneStory(wave: number): ZoneStory | null {
  if (!Number.isInteger(wave) || wave < 1 || (wave - 1) % WAVES_PER_AREA !== 0) return null;
  const zone = (wave - 1) / WAVES_PER_AREA;
  const area = AREAS[zone];
  return area ? ZONE_STORIES[area.id] ?? null : null;
}
