import type { SessionSnapshot } from './domain/session';

export interface RuntimeSnapshot {
  session: SessionSnapshot;
  phase: 'booting' | 'ready' | 'error' | 'stopped';
  inputMode: 'exploration' | 'message' | 'dialogue' | 'transition' | 'transition-error' | 'inventory' | 'save';
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
  openInventory(): void;
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
