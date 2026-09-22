import validateManifest from '../content/generated/character-pack-manifest-validator.mjs';
import { validatePackFraming, validateManifestLayout } from './character-pack-format.mjs';
import type { CharacterPackManifest } from '../content/generated/character-pack-manifest';

export type { CharacterPackManifest };

export interface PackPayload {
  readonly offset: number;
  readonly length: number;
  readonly decodedLength: number;
  readonly digest: string;
}

export interface CharacterPack {
  readonly manifest: CharacterPackManifest;
  /** Resolved per-cell layer → payload index bindings, keyed `animation|direction|frameIndex`. */
  readonly cells: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly payloads: readonly PackPayload[];
  /** Inflates one payload with a decoded-size bound and verifies its SHA-256 digest. */
  decodePayload(index: number, signal?: AbortSignal): Promise<Uint8Array>;
}

function toHex(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += byte.toString(16).padStart(2, '0');
  return text;
}

/**
 * Inflates zlib data through the browser/Node DecompressionStream with a hard byte
 * cap. The reader owns the cancellation: abort interrupts a pending read by
 * cancelling the reader (which holds the stream lock); `source` is never touched
 * because `pipeThrough` locked it and cancelling it would reject while discarded.
 */
async function inflateBounded(compressed: Uint8Array, decodedLength: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  const source = new Blob([compressed.slice()]).stream();
  const stream = source.pipeThrough(new DecompressionStream('deflate'));
  const reader = stream.getReader();
  let cancelled = false;
  const onAbort = (): void => {
    // Interrupt a pending read while this function still holds the reader lock;
    // the pending read then settles (done or error) and the loop rethrows the reason.
    if (!cancelled) void reader.cancel(signal?.reason).catch(() => { });
  };
  const output = new Uint8Array(decodedLength);
  let filled = 0;
  let reason: { throws: unknown } | undefined;
  try {
    signal?.addEventListener('abort', onAbort, { once: true });
    while (true) {
      if (signal?.aborted) throw signal.reason;
      const { done, value } = await reader.read();
      if (done) break;
      if (filled + value.length > decodedLength) throw new Error(`payload inflates past its declared ${decodedLength} bytes`);
      output.set(value, filled);
      filled += value.length;
    }
    if (filled !== decodedLength) throw new Error(`payload inflates to ${filled} bytes, declared ${decodedLength}`);
    return output;
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    reason = { throws: new Error(`payload failed to inflate (${error instanceof Error && error.message ? error.message : 'corrupt or truncated compressed data'})`, { cause: error }) };
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    cancelled = true;
    // Cancel through the reader we own; never through the pipeThrough-locked source.
    await reader.cancel(signal?.aborted ? signal.reason : undefined).catch(() => { });
    reader.releaseLock();
    if (reason) throw reason.throws;
  }
  throw new Error('internal: inflate loop ended without a result');
}

/**
 * Parses and fully validates a character pack blob before any pixel is exposed:
 * framing, strict UTF-8 JSON manifest, schema, cross-field structure, and per-payload
 * length bounds. Digest verification happens per decoded payload (decodePayload).
 */
export function readCharacterPack(bytes: Uint8Array): CharacterPack {
  const { manifestStart, manifestLength } = validatePackFraming(bytes);
  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(manifestStart, manifestStart + manifestLength)));
  } catch {
    throw new Error('pack manifest is not valid UTF-8 JSON');
  }
  if (!validateManifest(manifest)) {
    const detail = (validateManifest.errors ?? []).map((e) => `${e.instancePath}: ${e.message}`).slice(0, 5).join('; ');
    throw new Error(`pack manifest failed schema validation: ${detail}`);
  }
  const { manifest: checked, cellBytes } = validateManifestLayout(manifest);
  const payloads = /** @type {any} */ (checked.payloads) as PackPayload[];
  const bodyStart = manifestStart + manifestLength;
  const declaredBody = payloads.reduce((sum, payload) => sum + payload.length, 0);
  if (bodyStart + declaredBody !== bytes.length) {
    throw new Error(`pack payload body is ${bytes.length - bodyStart} bytes, header and manifest declare exactly ${declaredBody}`);
  }
  const cells = new Map<string, Map<string, number>>();
  for (const binding of /** @type {any} */ (checked.cells) as readonly { cell: { animation: string; direction: string | null; frameIndex: number }; layer: string; payload: number }[]) {
    const key = `${binding.cell.animation}|${binding.cell.direction}|${binding.cell.frameIndex}`;
    let layers = cells.get(key);
    if (!layers) { layers = new Map(); cells.set(key, layers); }
    layers.set(binding.layer, binding.payload);
  }
  return Object.freeze({
    manifest: checked as unknown as CharacterPackManifest,
    cells,
    payloads: Object.freeze(payloads),
    decodePayload: (index: number, signal?: AbortSignal): Promise<Uint8Array> => {
      const payload = payloads[index];
      if (!payload) return Promise.reject(new Error(`unknown payload index ${index}`));
      return inflateBounded(
        bytes.subarray(bodyStart + payload.offset, bodyStart + payload.offset + payload.length),
        payload.decodedLength,
        signal,
      ).then(async (decoded) => {
        if (decoded.length !== cellBytes) throw new Error(`payload ${index} decoded to ${decoded.length} bytes, expected ${cellBytes}`);
        const digest = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', decoded.slice().buffer)));
        signal?.throwIfAborted();
        if (digest !== payload.digest) throw new Error(`payload ${index}: digest mismatch (corrupt or hostile pack)`);
        return decoded;
      });
    },
  });
}

/** Convenience: decode every payload of a pack (bounded by manifest totals). */
export async function decodeAllPayloads(pack: CharacterPack, signal?: AbortSignal): Promise<Uint8Array[]> {
  const decoded: Uint8Array[] = [];
  for (let index = 0; index < pack.payloads.length; index += 1) {
    decoded.push(await pack.decodePayload(index, signal));
  }
  return decoded;
}
