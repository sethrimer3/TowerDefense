/** The spendable metals made by the Mine's smiths. Prices and wallets share
 * these units across the Mine, Library, Tiles and Smithy. */
import type { Metals } from "./mine/sim.ts";

export type MetalPrice = Partial<Metals>;
const NAMES = { copper: "Copper", silver: "Silver", gold: "Gold" } as const;
const KEYS = ["copper", "silver", "gold"] as const;

export const canAffordMetals = (wallet: Readonly<Metals>, price: MetalPrice, free = false) =>
  free || KEYS.every(k => wallet[k] >= (price[k] ?? 0));

/** Checks the entire price before spending anything. Unlimited money is free. */
export function spendMetals(wallet: Metals, price: MetalPrice, free = false): boolean {
  if (!canAffordMetals(wallet, price, free)) return false;
  if (!free) for (const k of KEYS) wallet[k] -= price[k] ?? 0;
  return true;
}

export const metalPriceText = (price: MetalPrice) =>
  KEYS.filter(k => price[k]).map(k => `${price[k]} ${NAMES[k]}`).join(" · ") || "Free";

/** A page reads the shared wallet live, then commits successful purchases. */
export interface MetalHost {
  metals(): Readonly<Metals>;
  free(): boolean;
  spendMetals(price: MetalPrice): void;
}
