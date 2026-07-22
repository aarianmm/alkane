/** Smallest angular gap between two directions, always in [0, 180]. */
export function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Angle normalized to (-180, 180], so canonical ordering is well-defined regardless of accumulated offset. */
export function toSignedAngle(angle: number): number {
  const normalized = ((angle % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

/** An axis is only defined mod 180 — a line, not a direction. */
function toAxis(angle: number): number {
  return ((angle % 180) + 180) % 180;
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  const withFirst = combinations(rest, size - 1).map((combo) => [first, ...combo]);
  return [...withFirst, ...combinations(rest, size)];
}

function minSeparation(angles: number[]): number {
  let min = Infinity;
  for (let i = 0; i < angles.length; i++) {
    for (let j = i + 1; j < angles.length; j++) {
      min = Math.min(min, angularDistance(angles[i], angles[j]));
    }
  }
  return min;
}

/** How far a candidate H subset is from mapping onto itself under reflection about the heavy-bond axis — 0 is perfectly symmetric. */
function symmetryScore(subset: number[], axis: number): number {
  let total = 0;
  for (const angle of subset) {
    const reflected = 2 * axis - angle;
    let nearest = Infinity;
    for (const other of subset) nearest = Math.min(nearest, angularDistance(reflected, other));
    total += nearest;
  }
  return total;
}

function compareSignatures(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

const EPSILON = 1e-6;

/**
 * Chooses which of an atom's free geometric slot angles get an implicit
 * hydrogen. Free slot count can exceed the hydrogen count (a double/triple
 * bond occupies one geometric slot while consuming more than one unit of
 * valency), so this is a real choice, not just "take everything free":
 *
 *   1. Maximise the minimum angular separation between every bond, real and
 *      hydrogen, together.
 *   2. Break ties by preferring the subset that is itself symmetric under
 *      reflection about the atom's existing heavy bonds.
 *   3. Break remaining ties deterministically (smallest signed angle first)
 *      so placement never depends on iteration order.
 *
 * Slot counts are at most 4 (the largest supported valency), so brute force
 * over every subset is trivial.
 */
export function placeHydrogens(
  freeSlotAngles: number[],
  hydrogenCount: number,
  heavyBondAngles: number[],
): number[] {
  if (hydrogenCount <= 0) return [];
  if (hydrogenCount >= freeSlotAngles.length) return [...freeSlotAngles];

  const axis = heavyBondAngles.length > 0 ? toAxis(heavyBondAngles[0]) : 0;

  let best: number[] | null = null;
  let bestMinSep = -Infinity;
  let bestSymmetry = Infinity;
  let bestSignature: number[] = [];

  for (const subset of combinations(freeSlotAngles, hydrogenCount)) {
    const sep = minSeparation([...heavyBondAngles, ...subset]);
    const symmetry = symmetryScore(subset, axis);
    const signature = subset.map(toSignedAngle).sort((a, b) => a - b);

    const isBetter =
      best === null ||
      sep > bestMinSep + EPSILON ||
      (Math.abs(sep - bestMinSep) <= EPSILON &&
        (symmetry < bestSymmetry - EPSILON ||
          (Math.abs(symmetry - bestSymmetry) <= EPSILON &&
            compareSignatures(signature, bestSignature) < 0)));

    if (isBetter) {
      best = subset;
      bestMinSep = sep;
      bestSymmetry = symmetry;
      bestSignature = signature;
    }
  }

  return best!;
}
