import type { SessionSnapshot } from './domain/session';

export interface RuntimeSnapshot {
  session: SessionSnapshot;
  phase: 'booting' | 'ready' | 'error' | 'stopped';
  /** Logical canvas size and world tile size from the game manifest. */
  view: { width: number; height: number; tileSize: number };
  inputMode: 'exploration' | 'message' | 'dialogue' | 'battle' | 'transition' | 'transition-error' | 'menu';
  /** The menu (decision 0016): the top screen and the focused entry, or null when closed. */
  menu: { screen: string; focused: string | null } | null;
  battle: { encounterId: string; phase: string; turn: number; active: string | null; playing: boolean; speed: number; windows: 'skin' | 'fallback'; menu: { level: string; cursor: number; target: string | null } | null; hp: Record<string, number>; timeline: string[]; art: Record<string, { source: 'creature' | 'frame'; frame: string; shields: number; x: number; y: number }> } | null;
  messageId: string | null;
  messagePage: number;
  interactionTarget: string | null;
  transitions: number;
  cancelledTransitions: number;
  failedTransitions: number;
  transitionError: string | null;
  scene: string;
  mapId: string;
  mapName: string;
  mapWidth: number;
  mapHeight: number;
  spawnId: string;
  loadedMaps: number;
  collisionCells: number;
  blockedCells: number;
  exits: number;
  placedObjects: number;
  camera: { x: number; y: number };
  starts: number;
  stops: number;
  actorTile: { x: number; y: number };
  actorPixel: { x: number; y: number };
  moving: boolean;
  facing: string;
  heroArt: 'static' | 'layered';
  heroFrame: string | null;
  heroMirrored: boolean;
  heroFeet: { x: number; y: number } | null;
  characterArtStatus: 'loading' | 'ready' | 'fallback';
  activeScenes: number;
  displayObjects: number;
  textureCount: number;
  aliveParticles: number;
  pooledParticles: number;
  activeEffects: number;
  droppedEffects: number;
  fallbackEffects: number;
  burstRequests: number;
  sessionSubscribers: number;
  activeObjectBindings: number;
  pendingSaveOperations: number;
  effectsEnabled: boolean;
  renderer: string;
  phaser: string;
  fps: number;
}

export interface FoundationHandle {
  /** Open the game menu (the hub), as the menu key does. */
  openMenu(): void;
  clearInput(): void;
  snapshot(): RuntimeSnapshot;
  destroy(): void;
}

declare global {
  const __APP_VERSION__: string;
  const __BUILD_ID__: string;
  interface Window {
    /** Read-only diagnostic snapshots; never exposes the live Phaser world. */
    __RPGAMEWORKS__?: { snapshot(): RuntimeSnapshot };
  }
}
