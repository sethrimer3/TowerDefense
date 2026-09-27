# TowerIncramental

An incremental dungeon RPG: the player climbs the Tower's puzzle floors and delves an endless labyrinth, earning lasting upgrades between runs.

## Language

### Tower clears

**Cleared floor**:
A Tower floor with no enemy or door left on it.
_Avoid_: empty room, finished floor

**Clear tier**:
A grade a cleared floor earns: silver for any clear, gold if the run has taken no damage, platinum if it has also spent no keys on that floor. Each tier is earned once per floor, for good.
_Avoid_: medal, rank

**Clear chest**:
A chest standing by the stairs of a cleared floor for one clear tier; opening it pays one Inspiration. Chests still standing when the player leaves the floor or the run are paid anyway.
_Avoid_: reward chest, clear reward

**Clear ledger**:
The lifetime record, per floor, of which clear tiers were earned and which were paid, so a tier pays exactly once however the run is undone, revived, reloaded or replaced.
_Avoid_: tower log, reward log

### The climb

**Visited floor**:
A Tower floor the player has stood on during this run. It stays as it was left, and the stairs lead back to it, unless it lies below a section's first floor.
_Avoid_: explored room, old floor

**Section**:
A run of ten Tower floors. Its first floor is sealed below, and the ATK/DEF gathered from items resets on entering it; each section remembers the best HP the player arrived with, and later ascents can start there.
_Avoid_: stage, chapter

### The character

**Loadout**:
What the character starts a run with: ATK, DEF, max HP, keys and how many undos it can store. It comes from the baseline, the upgrades bought, the character's level, the equipped gear and the provisions bought for that run.
_Avoid_: base stats, starting stats

**Provision**:
A one-run boost bought with Gold; it adds to the next run's loadout and is spent when that run starts.
_Avoid_: consumable (a crafted item used during a run), buff

### Progress

**Equivalent floor**:
The one scale both modes' progress maps onto: a Tower floor counts as itself, and every ten Delve depth count as one. Loot tables are gated on it, and each new equivalent floor reached pays one of the mode's currency.
_Avoid_: effective floor, tier

**Inspiration**:
The Tower's currency: one for each new floor reached and each clear tier paid, spent on upgrades in the skill trees.
_Avoid_: shards

**Courage**:
The Delve's currency: one for each new equivalent floor reached, spent on upgrades in the skill trees.
_Avoid_: essence

### The Delve

**Automove memory**:
What Delve Automove has seen of the labyrinth during this run, and how often the player has stood on each tile. Undo and Revive leave it as it is, since what was seen stays seen; it is forgotten when a run enters the labyrinth, when a milestone gate seals behind the player, and when the layout changes.
_Avoid_: known tiles, visit map
