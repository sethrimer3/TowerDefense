# Enemy migration tracker

Started 2026-10-29. This is the working checklist for replacing the old enemy lineups. **Absolute Defend waves 1–5 are updated.** All 30 Ambush levels (600 waves) and Defend waves 6–200 remain **outdated**. Later endless Defend waves remain outdated as well.

## Direction

- Most enemy forces belong to the Dark One; reserve independent factions for deliberate story exceptions.
- Aim for about **90% plain pixel bodies** in large crowds. Mini Darklings are the weakest filler; Darklings are larger filler.
- Medium enemies stay pixel bodies. A crown, sword, cape, shield, staff or similar equipment carries their personality and role. These variants are planned, not implemented yet.
- Complex sprites belong to high-strength, rare threats such as ships and walking fortresses.
- Updating a wave means intentionally replacing its enemy composition, checking offspring and total counts, reviewing combat, and recording its new enemies below. A color-drain effect alone does not mark a wave updated.

## New enemy log

| Introduced | Enemy | Body | HP | Attack / cooldown | Speed (cells/s) | Death behavior |
|---|---|---|---:|---|---:|---|
| Defend 1 | Mini Darkling | 1 × 1 black art pixel | 2 | 1 / 1 second | 1.7 | No split |
| Defend 1 | Darkling | 2 × 2 black art pixels | 6 | 2 / 1 second | 1.3 | Two Mini Darklings |
| Defend 4 | Large Darkling | 3 × 3 black art pixels | 18 | 4 / 1 second | 1 | Two Darklings; each then splits into two minis |

An art pixel is 1/8 of a board cell and scales with the camera. All three kinds use solid black square drawing under normal, Pixel Art, Simple enemies and merged-outline settings, without decorative sprites. The stats are initial tuning values.

## Change log

- **2026-10-29 — [x] Updated Defend wave 1 (Mossbound Ruins).** Starts with exactly **30 Mini Darklings + 5 Darklings**. Six minis then one Darkling, repeated five times over the native release period. The five parents yield ten additional minis: **40 minis encountered / 45 total bodies** if every parent and child is killed. The opening has an explicit 40-point accounting budget; wave 2 onward initially retained its existing curve and rosters (waves 2–5 are superseded by the entries below). No new species leaks into old procedural or Ambush lineups.
- **2026-10-29 — Dark crowd color drain.** Begins at approximately ten nearby living Dark One enemies, including a mix of all three sizes; reaches a grayscale core around sixty. Each local patch falls smoothly and radially to untouched color at the edge. At maximum strength, saturation is zero and contrast is reduced 30% toward neutral gray. Full grayscale already exceeds the requested 30% saturation reduction. Removed enemies stop contributing on the next sample (at most about 100 ms while the battle is advancing). Motion settings leave this steady accessibility cue visible.

- **2026-10-29 — [x] Updated Defend waves 2–5 (Mossbound Ruins).** Exact initial compositions and all offspring are listed below. Large Darklings introduce a third plain black pixel size and participate in the existing color drain. The native release period and split/death handling are retained; no larger sprite or per-enemy visual effects were added. Waves 6 onward and all Ambush lineups retain their legacy generators.

| Defend wave | Initial composition | Release grouping | Descendants generated on death | Total bodies encountered |
|---|---|---|---|---:|
| 2 | 45 Mini Darklings + 15 Darklings | Three minis, then one Darkling; repeated 15 times | 30 additional minis | 90 |
| 3 | 50 Darklings | 50 Darklings | 100 minis | 150 |
| 4 | 80 Darklings + 5 Large Darklings | Sixteen Darklings, then one Large; repeated five times | 10 additional Darklings; 180 minis from all 90 Darklings | 275 |
| 5 | 30 Large Darklings | 30 Large Darklings | 60 Darklings; then 120 minis | 210 |

Totals assume every parent and child is defeated. Large Darkling stats start at 18 HP, 4 attack each second, and speed 1 cell/second; these are initial tuning values. Authored accounting budgets sum the initial bodies' catalog costs (75/100/180/120 for waves 2/3/4/5), not the entire offspring tree or a monotonic combat-strength estimate. Every size counts as one living enemy for the existing approximate color-drain threshold.

## Color drain and performance rules

Faction is explicit in the enemy catalog; never infer darkness from a sprite's color. Currently tagged: Mini Darkling, Darkling, Large Darkling, Mother, Broodling, Dark Knight, Void Sparrow, Necromancer, Skeleton, Blink Imp, Crypt Hound and Grave Wisp. Future Dark One enemies must carry the same faction tag. Other species' allegiance is still pending their migration/story review. Friendly dark wizards and shades do not contribute; neither do dead enemies, fortress parts or Siege proxy objects.

The estimate uses fixed 4-cell buckets, neighboring buckets for density, and a reusable 144 × 208 alpha field, sampled at most ten times per second while simulation time advances. Each occupied bucket emits one smooth radial patch at its centroid; strongest-patch blending keeps overlapping groups from artificially multiplying their strength. There are no pairwise crowd queries. Two canvas blend passes desaturate and wash out the existing detailed world without scene copies, full-scene CPU pixel reads, blur or per-enemy filters. The field lookup avoids square roots in its inner loop. Mask memory and patch work are bounded by board size. The world-space mask follows pan and zoom; HUD and inspection overlays remain readable. Counts and neighborhood boundaries are intentionally approximate.

Headless Chromium validation checked nine enemies (no change), ten (onset), thirty-five (partial drain), and sixty (zero color difference between RGB channels at the center). A gray 20–220 test span became 52–192, exactly 70% contrast. Isolated density samples took roughly 4–5 ms for 5,000–10,000 enemies on this executor, at a maximum ten samples per second; the field stayed at 119,808 bytes. These are desktop measurements of the estimate, not whole-frame timings or phone hardware guarantees. The browser fixture also exercises phone-size layouts, camera pan/zoom, reduced motion, Simple enemies, Pixel Art and merged outlines.

## Updating this document

Change a wave's checkbox from '[ ] outdated' to '[x] updated' only after its roster is replaced. Add its exact new composition, introduced enemy names, offspring totals and date to the change log. A level is updated only when all twenty of its waves are checked. Keep later endless waves outdated until their generator or explicit overrides have been migrated.

## Ambush — all 30 levels

Each level currently has 20 waves from the existing procedural placeholder lineups. Every level and wave below is outdated; none has been changed by the Defend migration.

### Mossbound Ruins — Old Road (moss-1)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Mossbound Ruins — Mossy Ford (moss-2)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Mossbound Ruins — Ruin Gate (moss-3)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Amber Desert — Sandway (desert-1)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Amber Desert — Sunken Well (desert-2)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Amber Desert — Amber Pass (desert-3)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Ember Forge — Cinder Road (ember-1)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Ember Forge — Slag Crossing (ember-2)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Ember Forge — Forge Gate (ember-3)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Drowned Temple — Tidal Road (drowned-1)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Drowned Temple — Coral Crossing (drowned-2)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Drowned Temple — Temple Gate (drowned-3)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Fungal Hollow — Spore Trail (fungal-1)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Fungal Hollow — Mushroom Grove (fungal-2)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Fungal Hollow — Hollow Gate (fungal-3)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Frozen Vault — Ice Road (frozen-1)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Frozen Vault — Frost Crossing (frozen-2)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Frozen Vault — Vault Gate (frozen-3)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Violet Geode — Shard Trail (crystal-1)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Violet Geode — Prism Crossing (crystal-2)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Violet Geode — Geode Gate (crystal-3)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Obsidian Crypt — Ash Road (obsidian-1)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Obsidian Crypt — Grave Crossing (obsidian-2)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Obsidian Crypt — Crypt Gate (obsidian-3)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Astral Sanctuary — Star Road (astral-1)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Astral Sanctuary — Comet Crossing (astral-2)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Astral Sanctuary — Sanctuary Gate (astral-3)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Nadir — Last Road (nadir-1)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Nadir — Dark Crossing (nadir-2)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Nadir — Nadir Gate (nadir-3)

- [ ] Level: **outdated**

- [ ] Wave 1: **outdated**
- [ ] Wave 2: **outdated**
- [ ] Wave 3: **outdated**
- [ ] Wave 4: **outdated**
- [ ] Wave 5: **outdated**
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

## Defend — first 200-wave zone cycle

Defend is endless: these are its first ten 20-wave areas, not a finite level list. Only absolute waves 1–5 use the new authored lineups. In later cycles, area-local wave 1 (201, 401, …) still uses the legacy generator.

### Mossbound Ruins — waves 1–20

- [x] Wave 1: **updated** — 30 Mini Darklings + 5 Darklings; each Darkling splits into 2 minis.
- [x] Wave 2: **updated** — 45 Mini Darklings + 15 Darklings.
- [x] Wave 3: **updated** — 50 Darklings.
- [x] Wave 4: **updated** — 80 Darklings + 5 Large Darklings.
- [x] Wave 5: **updated** — 30 Large Darklings.
- [ ] Wave 6: **outdated**
- [ ] Wave 7: **outdated**
- [ ] Wave 8: **outdated**
- [ ] Wave 9: **outdated**
- [ ] Wave 10: **outdated**
- [ ] Wave 11: **outdated**
- [ ] Wave 12: **outdated**
- [ ] Wave 13: **outdated**
- [ ] Wave 14: **outdated**
- [ ] Wave 15: **outdated**
- [ ] Wave 16: **outdated**
- [ ] Wave 17: **outdated**
- [ ] Wave 18: **outdated**
- [ ] Wave 19: **outdated**
- [ ] Wave 20: **outdated**

### Amber Desert — waves 21–40

- [ ] Wave 21: **outdated**
- [ ] Wave 22: **outdated**
- [ ] Wave 23: **outdated**
- [ ] Wave 24: **outdated**
- [ ] Wave 25: **outdated**
- [ ] Wave 26: **outdated**
- [ ] Wave 27: **outdated**
- [ ] Wave 28: **outdated**
- [ ] Wave 29: **outdated**
- [ ] Wave 30: **outdated**
- [ ] Wave 31: **outdated**
- [ ] Wave 32: **outdated**
- [ ] Wave 33: **outdated**
- [ ] Wave 34: **outdated**
- [ ] Wave 35: **outdated**
- [ ] Wave 36: **outdated**
- [ ] Wave 37: **outdated**
- [ ] Wave 38: **outdated**
- [ ] Wave 39: **outdated**
- [ ] Wave 40: **outdated**

### Ember Forge — waves 41–60

- [ ] Wave 41: **outdated**
- [ ] Wave 42: **outdated**
- [ ] Wave 43: **outdated**
- [ ] Wave 44: **outdated**
- [ ] Wave 45: **outdated**
- [ ] Wave 46: **outdated**
- [ ] Wave 47: **outdated**
- [ ] Wave 48: **outdated**
- [ ] Wave 49: **outdated**
- [ ] Wave 50: **outdated**
- [ ] Wave 51: **outdated**
- [ ] Wave 52: **outdated**
- [ ] Wave 53: **outdated**
- [ ] Wave 54: **outdated**
- [ ] Wave 55: **outdated**
- [ ] Wave 56: **outdated**
- [ ] Wave 57: **outdated**
- [ ] Wave 58: **outdated**
- [ ] Wave 59: **outdated**
- [ ] Wave 60: **outdated**

### Drowned Temple — waves 61–80

- [ ] Wave 61: **outdated**
- [ ] Wave 62: **outdated**
- [ ] Wave 63: **outdated**
- [ ] Wave 64: **outdated**
- [ ] Wave 65: **outdated**
- [ ] Wave 66: **outdated**
- [ ] Wave 67: **outdated**
- [ ] Wave 68: **outdated**
- [ ] Wave 69: **outdated**
- [ ] Wave 70: **outdated**
- [ ] Wave 71: **outdated**
- [ ] Wave 72: **outdated**
- [ ] Wave 73: **outdated**
- [ ] Wave 74: **outdated**
- [ ] Wave 75: **outdated**
- [ ] Wave 76: **outdated**
- [ ] Wave 77: **outdated**
- [ ] Wave 78: **outdated**
- [ ] Wave 79: **outdated**
- [ ] Wave 80: **outdated**

### Fungal Hollow — waves 81–100

- [ ] Wave 81: **outdated**
- [ ] Wave 82: **outdated**
- [ ] Wave 83: **outdated**
- [ ] Wave 84: **outdated**
- [ ] Wave 85: **outdated**
- [ ] Wave 86: **outdated**
- [ ] Wave 87: **outdated**
- [ ] Wave 88: **outdated**
- [ ] Wave 89: **outdated**
- [ ] Wave 90: **outdated**
- [ ] Wave 91: **outdated**
- [ ] Wave 92: **outdated**
- [ ] Wave 93: **outdated**
- [ ] Wave 94: **outdated**
- [ ] Wave 95: **outdated**
- [ ] Wave 96: **outdated**
- [ ] Wave 97: **outdated**
- [ ] Wave 98: **outdated**
- [ ] Wave 99: **outdated**
- [ ] Wave 100: **outdated**

### Frozen Vault — waves 101–120

- [ ] Wave 101: **outdated**
- [ ] Wave 102: **outdated**
- [ ] Wave 103: **outdated**
- [ ] Wave 104: **outdated**
- [ ] Wave 105: **outdated**
- [ ] Wave 106: **outdated**
- [ ] Wave 107: **outdated**
- [ ] Wave 108: **outdated**
- [ ] Wave 109: **outdated**
- [ ] Wave 110: **outdated**
- [ ] Wave 111: **outdated**
- [ ] Wave 112: **outdated**
- [ ] Wave 113: **outdated**
- [ ] Wave 114: **outdated**
- [ ] Wave 115: **outdated**
- [ ] Wave 116: **outdated**
- [ ] Wave 117: **outdated**
- [ ] Wave 118: **outdated**
- [ ] Wave 119: **outdated**
- [ ] Wave 120: **outdated**

### Violet Geode — waves 121–140

- [ ] Wave 121: **outdated**
- [ ] Wave 122: **outdated**
- [ ] Wave 123: **outdated**
- [ ] Wave 124: **outdated**
- [ ] Wave 125: **outdated**
- [ ] Wave 126: **outdated**
- [ ] Wave 127: **outdated**
- [ ] Wave 128: **outdated**
- [ ] Wave 129: **outdated**
- [ ] Wave 130: **outdated**
- [ ] Wave 131: **outdated**
- [ ] Wave 132: **outdated**
- [ ] Wave 133: **outdated**
- [ ] Wave 134: **outdated**
- [ ] Wave 135: **outdated**
- [ ] Wave 136: **outdated**
- [ ] Wave 137: **outdated**
- [ ] Wave 138: **outdated**
- [ ] Wave 139: **outdated**
- [ ] Wave 140: **outdated**

### Obsidian Crypt — waves 141–160

- [ ] Wave 141: **outdated**
- [ ] Wave 142: **outdated**
- [ ] Wave 143: **outdated**
- [ ] Wave 144: **outdated**
- [ ] Wave 145: **outdated**
- [ ] Wave 146: **outdated**
- [ ] Wave 147: **outdated**
- [ ] Wave 148: **outdated**
- [ ] Wave 149: **outdated**
- [ ] Wave 150: **outdated**
- [ ] Wave 151: **outdated**
- [ ] Wave 152: **outdated**
- [ ] Wave 153: **outdated**
- [ ] Wave 154: **outdated**
- [ ] Wave 155: **outdated**
- [ ] Wave 156: **outdated**
- [ ] Wave 157: **outdated**
- [ ] Wave 158: **outdated**
- [ ] Wave 159: **outdated**
- [ ] Wave 160: **outdated**

### Astral Sanctuary — waves 161–180

- [ ] Wave 161: **outdated**
- [ ] Wave 162: **outdated**
- [ ] Wave 163: **outdated**
- [ ] Wave 164: **outdated**
- [ ] Wave 165: **outdated**
- [ ] Wave 166: **outdated**
- [ ] Wave 167: **outdated**
- [ ] Wave 168: **outdated**
- [ ] Wave 169: **outdated**
- [ ] Wave 170: **outdated**
- [ ] Wave 171: **outdated**
- [ ] Wave 172: **outdated**
- [ ] Wave 173: **outdated**
- [ ] Wave 174: **outdated**
- [ ] Wave 175: **outdated**
- [ ] Wave 176: **outdated**
- [ ] Wave 177: **outdated**
- [ ] Wave 178: **outdated**
- [ ] Wave 179: **outdated**
- [ ] Wave 180: **outdated**

### Nadir — waves 181–200

- [ ] Wave 181: **outdated**
- [ ] Wave 182: **outdated**
- [ ] Wave 183: **outdated**
- [ ] Wave 184: **outdated**
- [ ] Wave 185: **outdated**
- [ ] Wave 186: **outdated**
- [ ] Wave 187: **outdated**
- [ ] Wave 188: **outdated**
- [ ] Wave 189: **outdated**
- [ ] Wave 190: **outdated**
- [ ] Wave 191: **outdated**
- [ ] Wave 192: **outdated**
- [ ] Wave 193: **outdated**
- [ ] Wave 194: **outdated**
- [ ] Wave 195: **outdated**
- [ ] Wave 196: **outdated**
- [ ] Wave 197: **outdated**
- [ ] Wave 198: **outdated**
- [ ] Wave 199: **outdated**
- [ ] Wave 200: **outdated**

### Endless cycles — wave 201 onward

- [ ] Every subsequent Defend wave: **outdated**. The ten-area order repeats every 200 waves; its budget continues to grow. A future generator migration must explicitly update this entry and log any story exceptions.
