import type { MapDefinition } from '../content/generated/map';
import type { Actor, Tile } from './movement';

export type MapExit = MapDefinition['exits'][number];
export type MapMessage = NonNullable<MapDefinition['messages']>[number];
export interface MessageTarget { objectId: string; message: MapMessage; chest?: MapDefinition['objects'][number] }
const offsets = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;

/** Build one lookup per resident room, not a per-frame scan of every object. */
export function createInteractionLookup(map: MapDefinition): (actor: Actor) => MessageTarget | null {
  const messages = new Map((map.messages ?? []).map((message) => [message.id, message]));
  const cells = new Map<string, MessageTarget>();
  for (const object of map.objects) {
    const messageId = object.chest?.openedMessageId ?? object.messageId;
    if (!messageId) continue;
    const message = messages.get(messageId);
    if (!message) throw new Error(`${map.id}: missing message ${object.messageId}`);
    cells.set(`${object.x},${object.y}`, { objectId: object.id, message, ...(object.chest ? {chest:object} : {}) });
  }
  return (actor) => {
    if (actor.motion) return null;
    const [dx, dy] = offsets[actor.facing];
    return cells.get(`${actor.tile.x + dx},${actor.tile.y + dy}`) ?? null;
  };
}

/** Enter-only triggers: spawn, failed loads and cancelled loads cannot bounce forever. */
export class ExitLatch {
  private occupied: string | null;
  constructor(private readonly exits: readonly MapExit[], spawn: Tile) {
    this.occupied = this.at(spawn)?.id ?? null;
  }
  private at(tile: Tile): MapExit | undefined {
    return this.exits.find((exit) => tile.x >= exit.x && tile.x < exit.x + exit.width &&
      tile.y >= exit.y && tile.y < exit.y + exit.height);
  }
  arrive(tile: Tile): MapExit | null {
    const exit = this.at(tile);
    const previous = this.occupied;
    this.occupied = exit?.id ?? null;
    return exit && exit.id !== previous ? exit : null;
  }
}

/** Only message progression is stateful. Authored content remains immutable. */
export class MessageSession {
  private index = 0;
  constructor(readonly target: MessageTarget, private readonly strings: Readonly<Record<string, string>>) {}
  get id(): string { return this.target.message.id; }
  get page(): number { return this.index + 1; }
  get total(): number { return this.target.message.pages.length; }
  get speaker(): string { return this.string(this.target.message.speakerKey); }
  get text(): string { return this.string(this.target.message.pages[this.index]!); }
  advance(): boolean { if (this.index + 1 >= this.total) return false; this.index += 1; return true; }
  private string(key: string): string {
    if (!Object.hasOwn(this.strings, key)) throw new Error(`Missing message string: ${key}`);
    return this.strings[key]!;
  }
}
