import { ENEMIES, type EnemyKind } from "./catalog.ts";

export function paintJournal(canvas: HTMLCanvasElement, unread: boolean) {
  const c = canvas.getContext("2d")!;
  c.clearRect(0, 0, 20, 20);
  c.fillStyle = "#1e1010"; c.fillRect(2, 3, 14, 16);
  c.fillStyle = "#7d3d30"; c.fillRect(3, 2, 12, 14);
  c.fillStyle = "#542b25"; c.fillRect(3, 3, 3, 13);
  c.fillStyle = "#a76a46"; c.fillRect(6, 3, 8, 1);
  c.fillStyle = "#c6a777"; c.fillRect(5, 16, 10, 2);
  c.fillStyle = "#ddb77a"; c.fillRect(10, 7, 2, 5); c.fillRect(8, 9, 6, 1);
  if (unread) {
    c.fillStyle = "#210b0b"; c.fillRect(15, 0, 5, 10);
    c.fillStyle = "#ff3939"; c.fillRect(16, 1, 3, 5); c.fillRect(16, 8, 3, 2);
  }
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
      if (d.unyielding) notes.push("Cannot be frozen or pushed back. Sweeps a wide crescent with its sword.");
      const tactics: Partial<Record<EnemyKind, string>> = {
        siegeBeetle: "Front armor takes only 25% damage; attacks from behind deal 150%. Surround it.",
        burrowingMole: "Tunnels beneath walls as a dirt mound, then surfaces on a city street. Cannot be hurt underground; maintain an interior garrison.",
        necromancer: "Raises up to four nearby corpses as weaker skeletons, one every three seconds. Kill the necromancer first.",
        skeleton: "A weak raised enemy. Cannot be raised again.",
        bannerCaptain: "Nearby enemies gain 25% speed and 30% damage within four cells. Auras do not stack; target the captain.",
        mirrorKnight: "Reflects 40% of incoming arrow, cannon shell and fireball damage back to its shooter. Melee is not reflected.",
        leechSwarm: "Heals for damage dealt to player units, up to its maximum health. Use burst damage or area attacks.",
        ashPhoenix: "Leaves a destructible egg on its first death. The egg revives it after five seconds; destroy it first. Can revive only once.",
        phoenixEgg: "Destroy this egg before its five-second hatch finishes.",
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
