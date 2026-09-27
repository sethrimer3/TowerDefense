import type { Run, Tile } from "./entities.ts";
import { predict } from "./combat.ts";
import type { RoomWorld } from "./generation.ts";
import { doorCost } from "./doors.ts";
import { stairsOn, TowerClimb } from "./tower/climb.ts";

const DIRS = [[1,0], [-1,0], [0,1], [0,-1]];
/** Tiles the player can always step onto and take. */
const PICKUPS = new Set<Tile["kind"]>(["potion", "attack", "defense", "key", "treasure", "reward"]);

type Spot = { h: number; x: number; y: number };

/** Conservative deadlock check across every visited Tower floor plus one
 * step of unexplored space above the highest reached stairs. Each floor is
 * read through the climb, as the same board play shows. */
export function isDeadlocked(run: Run): boolean {
  // Every reachable space across all visited floors (and the one step of
  // unexplored space above) explored with no items, no unlocked doors, no
  // survivable enemies, and no unexplored stairway found -> deadlocked.
  return !new ActionSearch(run).findsAction();
}

/** A breadth-first walk over the visited floors' open tiles, through their
 * stairways, looking for anything the player could still do. */
class ActionSearch {
  private climb: TowerClimb;
  private boards = new Map<number, RoomWorld>();
  private queue: Spot[] = [];
  private seen = new Set<string>();

  constructor(private run: Run) {
    this.climb = new TowerClimb(run);
  }

  findsAction() {
    this.enqueue(this.run.height, this.run.player.x, this.run.player.y);
    while (this.queue.length > 0) {
      const { h, x, y } = this.queue.shift()!;
      // Only floors actually visited (or the one step above a reachable
      // stairway, handled in `up`) are explored — never an arbitrarily
      // deep unvisited floor.
      if (!this.climb.visited(h)) continue;
      for (const [dx, dy] of DIRS) if (this.offersAction(h, x + dx, y + dy)) return true;
    }
    return false;
  }

  /** Looks at tile (x, y) of floor `h`: true when it offers an action, and
   * otherwise queues whatever it leads on to. */
  private offersAction(h: number, x: number, y: number): boolean {
    const key = `${h},${x},${y}`;
    if (this.seen.has(key)) return false;
    const t = this.board(h).tile(x, y);
    if (PICKUPS.has(t.kind)) return true;
    switch (t.kind) {
      case "wall":
        return false;
      case "door":
        return doorCost(t, this.run.player) !== null;
      case "enemy": {
        const pred = predict(this.run.player, t.enemy!);
        return !pred.impervious && pred.survivable;
      }
      case "stairs":
        return this.up(h);
      case "stairsDown":
        this.down(h);
        return false;
      default:
        // Floor, oneway
        this.enqueue(h, x, y);
        return false;
    }
  }

  /** Stairs up from floor `h`. Unexplored floors above are always
   * reachable-in-principle: the player can always climb to generate a new
   * room, so reaching stairs to one means the run is not deadlocked. A
   * visited floor above is searched from its stairs down. */
  private up(h: number) {
    if (!this.climb.visited(h + 1)) return true;
    const down = stairsOn(this.board(h + 1), "stairsDown");
    if (down) this.enqueue(h + 1, down.x, down.y);
    return false;
  }

  /** Stairs down from floor `h` lead on to its stairs up, if it was visited. */
  private down(h: number) {
    if (h <= 0 || !this.climb.visited(h - 1)) return;
    const up = stairsOn(this.board(h - 1), "stairs");
    if (up) this.enqueue(h - 1, up.x, up.y);
  }

  private enqueue(h: number, x: number, y: number) {
    const key = `${h},${x},${y}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.queue.push({ h, x, y });
  }

  private board(h: number) {
    let board = this.boards.get(h);
    if (!board) {
      board = this.climb.board(h);
      this.boards.set(h, board);
    }
    return board;
  }
}
