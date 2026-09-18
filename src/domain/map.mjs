/** @typedef {import('../content/generated/map.js').MapDefinition} MapDefinition */
/** @typedef {{width: number, height: number, cellCount: number, blockedCells: number, canEnter: (x: number, y: number) => boolean}} CollisionGrid */

/** Compile validated solid-cell data once. No renderer, DOM, or mutable grid escapes.
 * @param {MapDefinition} map
 * @returns {Readonly<CollisionGrid>}
 */
export function createCollision(map) {
  const { width, height } = map;
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) cells[y * width + x] = map.collision[y]?.[x] === '.' ? 0 : 1;
  }
  for (const object of map.objects) {
    if (object.solid && object.x < width && object.y < height) cells[object.y * width + object.x] = 1;
  }
  return Object.freeze({
    width, height, cellCount: cells.length,
    blockedCells: cells.reduce((sum, cell) => sum + cell, 0),
    canEnter: (/** @type {number} */ x, /** @type {number} */ y) =>
      Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height && cells[y * width + x] === 0,
  });
}
