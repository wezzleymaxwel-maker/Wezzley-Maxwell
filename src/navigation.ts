import { Vector3 } from "three";
type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
const CLEARANCE = 0.45;
/** A bounded A* search. Every edge is checked, so a thin wall between grid cells cannot be crossed. */
export class Navigation {
  readonly step = 3;
  readonly n = 234;
  blocked = new Set<number>();
  private buckets = new Map<number, Box[]>();
  private readonly count = this.n * this.n;
  constructor(boxes: Box[]) {
    for (const box of boxes) {
      if (![box.minX, box.maxX, box.minZ, box.maxZ].every(Number.isFinite))
        continue;
      const expanded = {
        minX: box.minX - CLEARANCE,
        maxX: box.maxX + CLEARANCE,
        minZ: box.minZ - CLEARANCE,
        maxZ: box.maxZ + CLEARANCE,
      };
      const minX = this.index(expanded.minX),
        maxX = this.index(expanded.maxX),
        minZ = this.index(expanded.minZ),
        maxZ = this.index(expanded.maxZ);
      for (let z = minZ; z <= maxZ; z++)
        for (let x = minX; x <= maxX; x++) {
          const key = z * this.n + x,
            list = this.buckets.get(key) ?? [];
          list.push(expanded);
          this.buckets.set(key, list);
        }
      const firstX = Math.max(0, Math.ceil((expanded.minX + 350) / this.step)),
        lastX = Math.min(
          this.n - 1,
          Math.floor((expanded.maxX + 350) / this.step),
        );
      const firstZ = Math.max(0, Math.ceil((expanded.minZ + 350) / this.step)),
        lastZ = Math.min(
          this.n - 1,
          Math.floor((expanded.maxZ + 350) / this.step),
        );
      for (let z = firstZ; z <= lastZ; z++)
        for (let x = firstX; x <= lastX; x++) this.blocked.add(z * this.n + x);
    }
  }
  private index(value: number) {
    return Math.max(
      0,
      Math.min(this.n - 1, Math.floor((value + 350) / this.step)),
    );
  }
  /** Uses a spatial broad phase and a slab test against the actor's expanded obstacles. */
  canTraverse(from: Vector3, to: Vector3): boolean {
    if (![from.x, from.z, to.x, to.z].every(Number.isFinite)) return false;
    if (Math.abs(to.x) > 347 || Math.abs(to.z) > 347) return false;
    const tested = new Set<Box>(),
      dx = to.x - from.x,
      dz = to.z - from.z;
    let x = this.index(from.x),
      z = this.index(from.z);
    const endX = this.index(to.x),
      endZ = this.index(to.z),
      stepX = Math.sign(dx),
      stepZ = Math.sign(dz);
    let crossingX =
      dx === 0
        ? Infinity
        : (-350 + (x + (stepX > 0 ? 1 : 0)) * this.step - from.x) / dx;
    let crossingZ =
      dz === 0
        ? Infinity
        : (-350 + (z + (stepZ > 0 ? 1 : 0)) * this.step - from.z) / dz;
    const incrementX = dx === 0 ? Infinity : this.step / Math.abs(dx),
      incrementZ = dz === 0 ? Infinity : this.step / Math.abs(dz);
    // Visit only the buckets crossed by the segment, never its full bounding rectangle.
    for (let visits = 0; visits < this.n * 2 + 2; visits++) {
      for (const b of this.buckets.get(z * this.n + x) ?? []) {
        if (tested.has(b)) continue;
        tested.add(b);
        let low = 0,
          high = 1;
        for (const [origin, delta, min, max] of [
          [from.x, dx, b.minX, b.maxX],
          [from.z, dz, b.minZ, b.maxZ],
        ]) {
          if (Math.abs(delta) < 1e-9) {
            if (origin <= min || origin >= max) {
              low = 2;
              break;
            }
          } else {
            const a = (min - origin) / delta,
              c = (max - origin) / delta;
            low = Math.max(low, Math.min(a, c));
            high = Math.min(high, Math.max(a, c));
            if (low > high) break;
          }
        }
        if (low <= high && low <= 1 && high >= 0) return false;
      }
      if (x === endX && z === endZ) break;
      if (crossingX < crossingZ) {
        x += stepX;
        crossingX += incrementX;
      } else {
        z += stepZ;
        crossingZ += incrementZ;
      }
    }
    return true;
  }
  route(from: Vector3, to: Vector3): Vector3[] {
    if (![from.x, from.z, to.x, to.z].every(Number.isFinite)) return [];
    const cell = (p: Vector3) =>
      Math.max(0, Math.min(this.n - 1, Math.round((p.z + 350) / 3))) * this.n +
      Math.max(0, Math.min(this.n - 1, Math.round((p.x + 350) / 3)));
    const start = cell(from),
      end = cell(to),
      came = new Int32Array(this.count).fill(-1),
      scores = new Float32Array(this.count).fill(Infinity),
      closed = new Uint8Array(this.count);
    const h = (key: number) =>
      Math.abs((key % this.n) - (end % this.n)) +
      Math.abs(Math.floor(key / this.n) - Math.floor(end / this.n));
    const heap: { key: number; score: number }[] = [];
    const push = (key: number, score: number) => {
      heap.push({ key, score });
      let i = heap.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heap[parent].score <= score) break;
        [heap[i], heap[parent]] = [heap[parent], heap[i]];
        i = parent;
      }
    };
    const pop = () => {
      const top = heap[0],
        last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        while (true) {
          let child = i * 2 + 1;
          if (child >= heap.length) break;
          if (
            child + 1 < heap.length &&
            heap[child + 1].score < heap[child].score
          )
            child++;
          if (heap[i].score <= heap[child].score) break;
          [heap[i], heap[child]] = [heap[child], heap[i]];
          i = child;
        }
      }
      return top.key;
    };
    scores[start] = 0;
    push(start, h(start));
    let best = start,
      iterations = 0;
    const position = (key: number) =>
      new Vector3(
        (key % this.n) * 3 - 350,
        0,
        Math.floor(key / this.n) * 3 - 350,
      );
    while (heap.length && iterations < 1600) {
      const cur = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      iterations++;
      if (h(cur) < h(best)) best = cur;
      if (cur === end) {
        best = cur;
        break;
      }
      for (const d of [-1, 1, -this.n, this.n]) {
        const next = cur + d;
        if (
          next < 0 ||
          next >= this.count ||
          closed[next] ||
          this.blocked.has(next) ||
          Math.abs((next % this.n) - (cur % this.n)) > 1
        )
          continue;
        const currentPosition = cur === start ? from : position(cur),
          nextPosition = position(next);
        if (!this.canTraverse(currentPosition, nextPosition)) continue;
        const score = scores[cur] + 1;
        if (score >= scores[next]) continue;
        came[next] = cur;
        scores[next] = score;
        push(next, score + h(next));
      }
    }
    const path: Vector3[] = [];
    while (best !== start && came[best] !== -1) {
      path.push(position(best));
      best = came[best];
    }
    path.reverse();
    return path;
  }
}
