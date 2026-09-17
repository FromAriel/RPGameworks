export interface RuntimeSnapshot {
  phase: 'booting' | 'ready' | 'error' | 'stopped';
  scene: string;
  starts: number;
  stops: number;
  actorTile: { x: number; y: number };
  actorPixel: { x: number; y: number };
  moving: boolean;
  facing: string;
  activeScenes: number;
  displayObjects: number;
  textureCount: number;
  aliveParticles: number;
  pooledParticles: number;
  burstRequests: number;
  effectsEnabled: boolean;
  renderer: string;
  phaser: string;
  fps: number;
}

export interface FoundationHandle {
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
