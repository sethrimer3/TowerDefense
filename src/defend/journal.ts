import { ENEMIES, type EnemyKind } from "./catalog.ts";

/** The enemy journal's button: a bestiary bound in oxblood leather, a
 * skull with burning eyes on its cover and gold on its corners, outlined in
 * black; a wax seal marked "!" while there are new enemies to read about.
 * Drawn on a 20 × 20 canvas shown at twice that. */
const COVER = [
  "GhhhhhhhhhG",
  "CCCKKKKKCCC",
  "CCKWWWWWKCC",
  "CKWWWWWWwKC",
  "CKWKKWKKwKC",
  "CKWKEWKEwKC",
  "CKWWWKWWwKC",
  "CCKWWWWwKCC",
  "CCKWKWKwKCC",
  "CCCKKKKKCCC",
  "CCCCCCCCCCC",
  "cCCCCCCCCCc",
  "GcccccccccG"
];
const BAND_ROWS = [2, 6, 10];
const BOOK = [
  "KKKKKKKKKKKKKK..",
  ...COVER.map((row, i) => `K${BAND_ROWS.includes(i) ? "s" : "S"}${row}K${i === 0 ? "K." : `${i % 2 ? "p" : "P"}K`}`),
  "KKKKKKKKKKKKKKPK",
  ".KPPPPPPPPPPPPpK",
  "..KKKKKKKKKKKKKK"
];
const SEAL = [
  ".KKKKK.",
  "KRRWRRK",
  "KRRWRRK",
  "KRRWRrK",
  "KRRRRrK",
  "KRRWRrK",
  ".KrrrK.",
  "..KKK.."
];
const JOURNAL_COLOURS: Record<string, string> = {
  K: "#0b0706", C: "#6e2b22", c: "#4f1d17", h: "#93432f", S: "#3a1410", s: "#c9973f",
  G: "#e8b955", P: "#ead8a8", p: "#b39869", W: "#ece3c7", w: "#a89c7c", E: "#ff5a2a",
  R: "#d42e28", r: "#82130f"
};

function paintRows(c: CanvasRenderingContext2D, rows: string[], x0: number, y0: number) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const colour = JOURNAL_COLOURS[row[x]];
      if (!colour) continue;
      c.fillStyle = colour;
      c.fillRect(x0 + x, y0 + y, 1, 1);
    }
  });
}

export function paintJournal(canvas: HTMLCanvasElement, unread: boolean) {
  const c = canvas.getContext("2d")!;
  c.clearRect(0, 0, 20, 20);
  paintRows(c, BOOK, 1, 2);
  if (unread) paintRows(c, SEAL, 13, 0);
}

export function journalHTML(discovered: EnemyKind[]): string {
  const entries = [...discovered].sort((a, b) => ENEMIES[a].cost - ENEMIES[b].cost || ENEMIES[a].name.localeCompare(ENEMIES[b].name));
  return `<h2 id="defend-journal-title">Enemy journal</h2><p>${entries.length} enemies discovered</p>
    <div class="defend-journal-entries">${entries.length ? entries.map(k => {
      const d = ENEMIES[k];
      const notes: string[] = [d.flying ? "Flies over walls." : "Travels on the ground."];
      if (d.fortress) notes.push(`Walking structure with ${d.fortress.turrets} independently destroyable turrets, ${d.fortress.legs} legs and ${d.fortress.armor} armor plates. Destroy every armor plate to expose the core. Each lost leg slows movement, down to 25% speed with all legs gone. Destroyed turrets stop firing. Dismantle its parts before attacking the core.`);
      if (d.chainLength) notes.push(`${d.chainLength} individually damageable segments; cuts create independent worms.`);
      if (d.splits) notes.push(`Hatches ${d.splits.count} ${ENEMIES[d.splits.into].name}s when killed.`);
      if (d.shield) notes.push(`Shields itself and nearby enemies against ranged damage within ${d.shield.radius} cells. ${Number.isFinite(d.shield.hp) ? `${d.shield.hp.toLocaleString()} shield HP; shatters when depleted.` : "Permanent shield; only melee damage gets through."}`);
      if (d.poison) notes.push(`Poison cloud reaches ${d.poison.radius} cells. ${d.poison.lethal ? "Instantly kills player units on contact." : `${d.poison.damage} damage every 0.1 seconds to player units.`} The cloud leaves buildings unharmed and does not block ranged attacks.`);
      if (d.siege) notes.push(`Self-driving siege engine: no crew, it rolls toward the keep and stops to shoot whatever blocks its way from ${d.siege.range} cells, the keep once it is in range${d.siege.people ? ", and your people before either" : ", or your people when nothing else is"}. It never fights hand to hand.`);
      if (d.boat) {
        notes.push(`Magic boat: sails toward the keep in a pool of conjured water ${d.boat.water} cells round its hull, which dries up in a trail behind it.`);
        notes.push("In winter its wake freezes. Ice persists until fire or explosions melt it, blocks rebuilding, and makes those on foot slide and skid farther from blasts. Meltwater then dries away.");
        notes.push(d.boat.decorativeWater
          ? "Its water is purely visual: it does not sink buildings, hurt units, extinguish fires or block splash damage. The boat rams buildings and walls in its way, and the keep, with ordinary damage."
          : `Its water sinks every house and structure it reaches${d.boat.keep ? ", every wall stone, and the keep itself, ending the defense at once" : d.boat.walls ? " and every wall stone; it rams the keep" : "; it rams the walls and the keep"}. The water hurts only fire mages, puts out fires and stops splash damage: blasts in it fizzle, and anyone standing in it is safe from blasts. Bring arrows, blades and lightning.`);
      }
      if (d.unyielding) notes.push("Cannot be frozen or pushed back. Sweeps a wide crescent with its sword.");
      const tactics: Partial<Record<EnemyKind, string>> = {
        iceGolem: "A slow, heavy ice guardian. Takes double damage from fire, burning ground and explosions; arrows, melee and lightning deal normal damage.",
        iceCube: "Slides only horizontally or vertically, turning sharply. Leaves persistent ice that makes ground units skid and blocks rebuilding. Fire and explosions melt the trail. Its own slide cannot be bent by blast impulses.",
        siegeBeetle: "Front armor takes only 25% damage; attacks from behind deal 150%. Surround it.",
        burrowingMole: "Tunnels beneath walls as a dirt mound, then surfaces on a city street. Cannot be hurt underground; maintain an interior garrison.",
        necromancer: "Raises up to four nearby corpses as weaker skeletons, one every three seconds. Kill the necromancer first.",
        skeleton: "A weak raised enemy. Cannot be raised again.",
        bannerCaptain: "Nearby enemies gain 25% speed and 30% damage within four cells. Auras do not stack; target the captain.",
        mirrorKnight: "Reflects 40% of incoming arrow, cannon shell and fireball damage back to its shooter. Melee is not reflected.",
        leechSwarm: "Heals for damage dealt to player units, up to its maximum health. Use burst damage or area attacks.",
        ashPhoenix: "Leaves a destructible egg on its first death. The egg revives it after five seconds; destroy it first. Can revive only once.",
        phoenixEgg: "Destroy this egg before its five-second hatch finishes.",
        rollingCannon: "Lobs an iron ball that bursts on landing. Cheap and fragile; archers outrange it.",
        ballista: "Its bolt runs through every soldier and civilian on its line, then strikes the building behind.",
        fireworkLauncher: "Fires a volley of six rockets that scatter round its mark and burst in showers of sparks.",
        trebuchet: "Hurls a boulder from eleven cells, far past most defenses, crushing walls in a wide burst. Slow to reload; meet it outside the walls.",
        bombard: "A huge iron cannon on a heavy sledge whose shells blow open whole stretches of wall. Very tough.",
        rocketBattery: "Looses sixteen rockets at once over a wide area from ten cells. Kill it before it reaches range.",
        blinkImp: "Telegraphs a destination for 0.6 seconds, then jumps up to three cells. Use layered defenses."
      };
      if (tactics[k]) notes.push(tactics[k]!);
      if (k === "dragon") notes.push("Breathes flame in a five-cell cone.");
      if (k === "bombOrc") notes.push("Carries dynamite and explodes on contact in a two-cell radius.");
      if (k === "bombBird") notes.push("Dives for 0.6 seconds, then explodes in a 2.5-cell radius. Kill it before it lands.");
      if (k === "voidSparrow") notes.push("Creates a black hole 1.5 tiles across: 300 damage every half-second for eight seconds.");
      return `<article><h3>${d.name}</h3><p class="defend-journal-stats">Difficulty ${d.cost.toLocaleString()} · HP ${d.hp.toLocaleString()} · Attack ${d.damage} · Speed ${d.speed}</p><p>${notes.join(" ")}</p></article>`;
    }).join("") : "<p>Encounter enemies during a defense to record them here.</p>"}</div>
    <div class="dialog-actions"><button data-journal-close autofocus>Close journal</button></div>`;
}
