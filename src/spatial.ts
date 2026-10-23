import * as THREE from "three";

const CELL_SIZE = 28;
const MAX_CELL_SPAN = 64;
const axes = ["x", "y", "z"] as const;

interface Entry {
  object: THREE.Object3D;
  bounds: THREE.Box3;
  seen: number;
  near: number;
}

/** Conservative slab test. A segment touching a boundary remains a candidate. */
function segmentNear(
  bounds: THREE.Box3,
  ray: THREE.Ray,
  near: number,
  far: number,
) {
  let low = near,
    high = far;
  for (const axis of axes) {
    const origin = ray.origin[axis],
      delta = ray.direction[axis];
    if (Math.abs(delta) < 1e-12) {
      if (origin < bounds.min[axis] || origin > bounds.max[axis])
        return Infinity;
      continue;
    }
    const a = (bounds.min[axis] - origin) / delta,
      b = (bounds.max[axis] - origin) / delta;
    low = Math.max(low, Math.min(a, b));
    high = Math.min(high, Math.max(a, b));
    if (low > high) return Infinity;
  }
  return low;
}

/** Static world acceleration. Render geometry and its exact raycast are preserved. */
export class StaticRayIndex {
  readonly sourceLength: number;
  readonly entries: Entry[] = [];
  readonly sourceObjects: number;
  private buckets = new Map<string, Entry[]>();
  private global: Entry[] = [];
  private queryId = 0;
  private candidates: Entry[] = [];
  private start = new THREE.Vector3();
  private end = new THREE.Vector3();
  lastCandidates = 0;

  constructor(solids: readonly THREE.Object3D[]) {
    this.sourceLength = solids.length;
    const visited = new Set<THREE.Object3D>();
    for (const root of solids) {
      root.traverse((object) => {
        if (visited.has(object)) return;
        visited.add(object);
        if (object instanceof THREE.InstancedMesh) {
          const instance = new THREE.Matrix4(),
            matrix = new THREE.Matrix4();
          object.geometry.computeBoundingBox();
          for (let i = 0; i < object.count; i++) {
            object.getMatrixAt(i, instance);
            matrix.multiplyMatrices(object.matrixWorld, instance);
            const proxy = new THREE.Mesh(object.geometry, object.material);
            proxy.matrixAutoUpdate = false;
            proxy.matrixWorld.copy(matrix);
            proxy.layers.mask = object.layers.mask;
            this.add(
              proxy,
              object.geometry.boundingBox!.clone().applyMatrix4(matrix),
            );
          }
        } else if (object instanceof THREE.Mesh) {
          object.geometry.computeBoundingBox();
          const bounds = object.geometry
            .boundingBox!.clone()
            .applyMatrix4(object.matrixWorld);
          const size = bounds.getSize(new THREE.Vector3());
          // A heightfield otherwise tests every ground triangle for every eye ray.
          // Divide only collision queries into spatial triangle chunks, sharing
          // immutable vertex attributes and retaining the same material/winding.
          if (
            !Array.isArray(object.material) &&
            !(object instanceof THREE.SkinnedMesh) &&
            object.raycast === THREE.Mesh.prototype.raycast &&
            object.geometry.groups.length === 0 &&
            (object.geometry.index?.count ??
              object.geometry.attributes.position?.count ??
              0) >= 1536 &&
            Math.max(size.x, size.z) > CELL_SIZE * 3
          ) {
            this.addTriangleChunks(object);
          } else this.add(object, bounds);
        } else if (object.raycast !== THREE.Object3D.prototype.raycast) {
          // Unknown custom raycasters cannot be culled safely without knowing
          // their volume. Keep their exact callback in the global candidate set.
          if (object instanceof THREE.Line || object instanceof THREE.Points) {
            this.add(
              object,
              new THREE.Box3().setFromObject(object).expandByScalar(1),
            );
          } else if (!(object instanceof THREE.Group)) {
            this.add(
              object,
              new THREE.Box3(
                new THREE.Vector3(-Infinity, -Infinity, -Infinity),
                new THREE.Vector3(Infinity, Infinity, Infinity),
              ),
            );
          }
        }
      });
    }
    this.sourceObjects = visited.size;
  }

  private addTriangleChunks(source: THREE.Mesh) {
    const geometry = source.geometry,
      positions = geometry.attributes.position,
      index = geometry.index,
      count = index?.count ?? positions.count,
      start = Math.max(0, geometry.drawRange.start),
      end = Math.min(count, start + geometry.drawRange.count),
      chunks = new Map<string, { indices: number[]; bounds: THREE.Box3 }>();
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3(),
      centre = new THREE.Vector3();
    for (let i = start; i + 2 < end; i += 3) {
      const ia = index ? index.getX(i) : i,
        ib = index ? index.getX(i + 1) : i + 1,
        ic = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(positions, ia);
      b.fromBufferAttribute(positions, ib);
      c.fromBufferAttribute(positions, ic);
      centre
        .copy(a)
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3)
        .applyMatrix4(source.matrixWorld);
      const key = `${Math.floor(centre.x / CELL_SIZE)},${Math.floor(centre.z / CELL_SIZE)}`;
      let chunk = chunks.get(key);
      if (!chunk) {
        chunk = { indices: [], bounds: new THREE.Box3() };
        chunks.set(key, chunk);
      }
      chunk.indices.push(ia, ib, ic);
      chunk.bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
    }
    for (const chunk of chunks.values()) {
      const part = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(geometry.attributes))
        part.setAttribute(name, attribute);
      part.setIndex(chunk.indices);
      part.boundingBox = chunk.bounds;
      part.boundingSphere = chunk.bounds.getBoundingSphere(new THREE.Sphere());
      const proxy = new THREE.Mesh(part, source.material);
      proxy.matrixAutoUpdate = false;
      proxy.matrixWorld.copy(source.matrixWorld);
      proxy.layers.mask = source.layers.mask;
      this.add(proxy, chunk.bounds.clone().applyMatrix4(source.matrixWorld));
    }
  }

  private add(object: THREE.Object3D, bounds: THREE.Box3) {
    if (bounds.isEmpty()) return;
    const entry: Entry = { object, bounds, seen: 0, near: 0 };
    this.entries.push(entry);
    const minX = Math.floor(bounds.min.x / CELL_SIZE),
      maxX = Math.floor(bounds.max.x / CELL_SIZE),
      minZ = Math.floor(bounds.min.z / CELL_SIZE),
      maxZ = Math.floor(bounds.max.z / CELL_SIZE);
    if ((maxX - minX + 1) * (maxZ - minZ + 1) > MAX_CELL_SPAN) {
      this.global.push(entry);
      return;
    }
    for (let z = minZ; z <= maxZ; z++)
      for (let x = minX; x <= maxX; x++) {
        const key = `${x},${z}`,
          list = this.buckets.get(key) ?? [];
        list.push(entry);
        this.buckets.set(key, list);
      }
  }

  query(ray: THREE.Ray, near: number, far: number) {
    this.queryId++;
    this.candidates.length = 0;
    this.start.copy(ray.origin).addScaledVector(ray.direction, near);
    this.end.copy(ray.origin).addScaledVector(ray.direction, far);
    const visit = (entries: Entry[] | undefined) => {
      for (const entry of entries ?? []) {
        if (entry.seen === this.queryId) continue;
        entry.seen = this.queryId;
        entry.near = segmentNear(entry.bounds, ray, near, far);
        if (entry.near <= far) this.candidates.push(entry);
      }
    };
    visit(this.global);
    let x = Math.floor(this.start.x / CELL_SIZE),
      z = Math.floor(this.start.z / CELL_SIZE);
    const endX = Math.floor(this.end.x / CELL_SIZE),
      endZ = Math.floor(this.end.z / CELL_SIZE),
      dx = this.end.x - this.start.x,
      dz = this.end.z - this.start.z,
      stepX = Math.sign(dx),
      stepZ = Math.sign(dz),
      incrementX = dx === 0 ? Infinity : CELL_SIZE / Math.abs(dx),
      incrementZ = dz === 0 ? Infinity : CELL_SIZE / Math.abs(dz);
    let crossingX =
        dx === 0
          ? Infinity
          : ((x + (stepX > 0 ? 1 : 0)) * CELL_SIZE - this.start.x) / dx,
      crossingZ =
        dz === 0
          ? Infinity
          : ((z + (stepZ > 0 ? 1 : 0)) * CELL_SIZE - this.start.z) / dz;
    const span = Math.abs(endX - x) + Math.abs(endZ - z) + 3;
    if (!Number.isFinite(span) || span > 4096) {
      // Unusually long valid queries must stay correct without an unbounded DDA.
      visit(this.entries);
      this.candidates.sort((a, b) => a.near - b.near);
      this.lastCandidates = this.candidates.length;
      return this.candidates;
    }
    const limit = span;
    for (let i = 0; i < limit; i++) {
      visit(this.buckets.get(`${x},${z}`));
      if (x === endX && z === endZ) break;
      if (Math.abs(crossingX - crossingZ) < 1e-12) {
        // Include both cells touched by a corner; never miss a thin wall there.
        visit(this.buckets.get(`${x + stepX},${z}`));
        visit(this.buckets.get(`${x},${z + stepZ}`));
        x += stepX;
        z += stepZ;
        crossingX += incrementX;
        crossingZ += incrementZ;
      } else if (crossingX < crossingZ) {
        x += stepX;
        crossingX += incrementX;
      } else {
        z += stepZ;
        crossingZ += incrementZ;
      }
    }
    this.candidates.sort((a, b) => a.near - b.near);
    this.lastCandidates = this.candidates.length;
    return this.candidates;
  }
}
