/** Bevel profiles: a 1-D list of heights from the outer edge (depth 0) inward. Ported from Pixel Frame `profile.js`. */

export type Profile = readonly number[];

export function parseProfile(text: string): number[] {
  return String(text)
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter(n => Number.isFinite(n))
    .map(n => Math.max(0, Math.min(9, Math.round(n))));
}

/** Outside the profile (open space on either side) is height 0. */
export function profileHeight(profile: Profile, d: number): number {
  return d >= 0 && d < profile.length ? profile[d]! : 0;
}

/** Central difference along depth. Positive = rising inward = facing outward. */
export function profileSlope(profile: Profile, d: number): number {
  return (profileHeight(profile, d + 1) - profileHeight(profile, d - 1)) / 2;
}

export function ridgeIndices(profile: Profile): number[] {
  const max = Math.max(...profile);
  return profile.map((h, i) => (h === max ? i : -1)).filter(i => i >= 0);
}
