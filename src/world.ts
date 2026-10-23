import * as THREE from "three";

export interface CollisionBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  minY?: number;
}
interface Region {
  x: number;
  z: number;
  radius: number;
  name: string;
}
/** Metres, Y-up. Procedural assets are original and require no downloads. */
export class World {
  solids: THREE.Mesh[] = [];
  boxes: CollisionBox[] = [];
  lootPoints: THREE.Vector3[] = [];
  spawnPoints: THREE.Vector3[] = [];
  readonly regions: Region[] = [
    { x: -130, z: -95, radius: 64, name: "VILA DAS PALMEIRAS" },
    { x: 105, z: -130, radius: 64, name: "DISTRITO INDUSTRIAL" },
    { x: 0, z: 65, radius: 68, name: "CENTRO" },
    { x: -205, z: 120, radius: 38, name: "POSTO AURORA" },
    { x: 190, z: 140, radius: 62, name: "BASE HORIZONTE" },
  ];
  private materials = new Map<number, THREE.MeshStandardMaterial>();
  private cube = new THREE.BoxGeometry(1, 1, 1);
  private ramps: {
    x: number;
    z: number;
    width: number;
    length: number;
    rise: number;
    base: number;
  }[] = [];
  constructor(public scene: THREE.Scene) {
    scene.background = new THREE.Color(0xa8c6cb);
    scene.fog = new THREE.FogExp2(0xa8c6cb, 0.0022);
    const terrain = new THREE.PlaneGeometry(700, 700, 120, 120);
    terrain.rotateX(-Math.PI / 2);
    const positions = terrain.attributes.position;
    const colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        z = positions.getZ(i),
        y = this.terrainHeight(x, z);
      positions.setY(i, y);
      const color = new THREE.Color(y > 5 ? 0x8e9872 : 0x74865c);
      color.multiplyScalar(
        0.91 + 0.12 * Math.sin(x * 0.12) * Math.cos(z * 0.1),
      );
      colors.push(color.r, color.g, color.b);
    }
    terrain.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    terrain.computeVertexNormals();
    const ground = new THREE.Mesh(
      terrain,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    );
    ground.receiveShadow = true;
    scene.add(ground);
    this.solids.push(ground);
    this.road(-130, -95, 0, 65);
    this.road(0, 65, 105, -130);
    this.road(0, 65, 190, 140);
    this.road(-130, -95, -205, 120);
    // Residential: offset doors keep a clear route through each building.
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 3; col++)
        this.house(
          -160 + col * 29,
          -120 + row * 43,
          col === 1 ? 0xd1c4a3 : 0xbeb9a4,
          col === 1,
        );
    // Town with traversable alleys and storefronts.
    for (let i = 0; i < 5; i++)
      this.house(-48 + i * 25, 35, i % 2 ? 0xc2ab94 : 0xadb9b7, i % 2 === 0);
    for (let i = 0; i < 4; i++) this.house(-42 + i * 28, 93, 0xb7b3a3, false);
    // Warehouses and lanes between shipping containers.
    this.warehouse(90, -144);
    this.warehouse(128, -144);
    for (let i = 0; i < 9; i++) {
      const x = 65 + (i % 3) * 18,
        z = -106 + Math.floor(i / 3) * 12;
      this.block(x, 1.6, z, 11, 3.2, 5, [0x476f70, 0x9c674a, 0x7c8554][i % 3]);
      this.lootPoints.push(new THREE.Vector3(x + 7, 0.5, z));
    }
    this.gasStation(-205, 120);
    // Military perimeter has gaps on all four sides, never an inescapable arena.
    for (const x of [167, 202])
      for (const z of [116, 151]) this.house(x, z, 0x76806a, false);
    for (const x of [147, 234]) for (const z of [98, 175]) this.tower(x, z);
    for (let i = 0; i < 10; i++) {
      if (i === 4 || i === 5) continue;
      this.block(145 + i * 10, 1.2, 94, 9, 2.4, 0.4, 0x777c64);
      this.block(145 + i * 10, 1.2, 182, 9, 2.4, 0.4, 0x777c64);
    }
    // Vegetation uses instancing; trunks and rocks remain physical cover.
    this.forest();
    for (let i = 0; i < 50; i++) {
      const a = i * 2.39996,
        r = 80 + ((i * 71) % 225),
        x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      if (
        this.regions.some((v) => Math.hypot(x - v.x, z - v.z) < v.radius + 10)
      )
        continue;
      const y = this.terrainHeight(x, z),
        size = 1.4 + (i % 4);
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(size, 0),
        this.material(0x777c73),
      );
      rock.position.set(x, y + size * 0.6, z);
      rock.scale.set(1.3, 0.8, 1);
      rock.castShadow = true;
      rock.receiveShadow = true;
      scene.add(rock);
      this.solids.push(rock);
      this.boxes.push({
        minX: x - size,
        maxX: x + size,
        minZ: z - size,
        maxZ: z + size,
        height: y + size * 1.4,
        minY: y,
      });
    }
    for (let i = 0; i < 25; i++) {
      const a = i * 2.39996,
        r = 50 + ((i * 37) % 225);
      const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      for (
        let attempt = 0;
        attempt < 80 &&
        this.boxes.some(
          (b) =>
            p.x > b.minX - 2 &&
            p.x < b.maxX + 2 &&
            p.z > b.minZ - 2 &&
            p.z < b.maxZ + 2,
        );
        attempt++
      ) {
        p.x = Math.sin(i * 73 + attempt * 3.1) * 300;
        p.z = Math.cos(i * 31 + attempt * 2.3) * 300;
      }
      p.y = this.ground(p.x, p.z);
      this.spawnPoints.push(p);
    }
    for (const region of this.regions)
      this.label(region.name, region.x, region.z);
  }
  private material(color: number) {
    if (!this.materials.has(color))
      this.materials.set(
        color,
        new THREE.MeshStandardMaterial({ color, roughness: 0.88 }),
      );
    return this.materials.get(color)!;
  }
  private block(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: number,
    collision = true,
  ) {
    const mesh = new THREE.Mesh(this.cube, this.material(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collision) {
      this.solids.push(mesh);
      this.boxes.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
        height: y + h / 2,
        minY: y - h / 2,
      });
    }
    return mesh;
  }
  private terrainHeight(x: number, z: number) {
    let mask = 1;
    for (const r of this.regions)
      mask = Math.min(
        mask,
        THREE.MathUtils.smoothstep(
          Math.hypot(x - r.x, z - r.z),
          r.radius,
          r.radius + 35,
        ),
      );
    return (
      mask *
      Math.max(
        0,
        Math.sin(x * 0.023) * Math.cos(z * 0.019) * 7 + Math.sin(z * 0.037) * 2,
      )
    );
  }
  ground(x: number, z: number): number {
    let h = this.terrainHeight(x, z);
    for (const r of this.ramps)
      if (
        Math.abs(x - r.x) <= r.width / 2 &&
        z >= r.z - r.length / 2 &&
        z <= r.z + r.length / 2
      )
        h = Math.max(h, r.base + ((z - r.z) / r.length + 0.5) * r.rise);
    return h;
  }
  move(
    pos: THREE.Vector3,
    delta: THREE.Vector3,
    radius = 0.4,
    bodyHeight = 1.65,
  ): THREE.Vector3 {
    const next = pos.clone();
    if (
      ![
        pos.x,
        pos.y,
        pos.z,
        delta.x,
        delta.y,
        delta.z,
        radius,
        bodyHeight,
      ].every(Number.isFinite) ||
      radius <= 0 ||
      bodyHeight <= 0
    )
      return next;
    // Sweep the body's vertical interval: jumping cannot pass through a roof,
    // and falling onto a platform cannot tunnel through it during a slow frame.
    let vertical = pos.y + delta.y;
    for (const b of this.boxes) {
      if (
        pos.x + radius <= b.minX ||
        pos.x - radius >= b.maxX ||
        pos.z + radius <= b.minZ ||
        pos.z - radius >= b.maxZ
      )
        continue;
      const bottom = b.minY ?? -Infinity;
      if (
        delta.y > 0 &&
        pos.y + bodyHeight <= bottom &&
        vertical + bodyHeight > bottom
      )
        vertical = Math.min(vertical, bottom - bodyHeight);
      if (delta.y < 0 && pos.y >= b.height && vertical < b.height)
        vertical = Math.max(vertical, b.height);
    }
    next.y = vertical;
    const blocked = (x: number, z: number) =>
      this.boxes.some(
        (b) =>
          x + radius > b.minX &&
          x - radius < b.maxX &&
          z + radius > b.minZ &&
          z - radius < b.maxZ &&
          next.y < b.height &&
          next.y + bodyHeight > (b.minY ?? -Infinity),
      );
    // Small swept steps prevent tunnelling even with a slow frame.
    const moveX = THREE.MathUtils.clamp(delta.x, -700, 700),
      moveZ = THREE.MathUtils.clamp(delta.z, -700, 700);
    const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(moveX), Math.abs(moveZ)) / 0.35),
    );
    for (let i = 0; i < steps; i++) {
      const x = THREE.MathUtils.clamp(next.x + moveX / steps, -347, 347);
      if (!blocked(x, next.z)) next.x = x;
      const z = THREE.MathUtils.clamp(next.z + moveZ / steps, -347, 347);
      if (!blocked(next.x, z)) next.z = z;
    }
    return next;
  }
  private house(x: number, z: number, color: number, upper: boolean) {
    const w = 17,
      d = 18,
      h = upper ? 8 : 4;
    this.solids.push(this.block(x, -0.1, z, w, 0.2, d, 0x9b9788, false));
    this.block(x - w / 2, h / 2, z, 0.5, h, d, color);
    this.block(x + w / 2, h / 2, z, 0.5, h, d, color);
    this.block(x, h / 2, z - d / 2, w, h, 0.5, color);
    // Front entrance with a true 3m opening and lintel.
    this.block(x - 5, h / 2, z + d / 2, 7, h, 0.5, color);
    this.block(x + 5, h / 2, z + d / 2, 7, h, 0.5, color);
    this.block(x, h / 2 + 1.5, z + d / 2, 3, h - 3, 0.5, color);
    this.block(x, h + 0.22, z, w + 1, 0.45, d + 1, 0x66695c);
    // Furniture as cover with reachable items at tabletop height.
    this.block(x - 4, 0.55, z - 4, 3, 1.1, 1.8, 0x71604a);
    this.block(x + 5, 0.65, z - 6, 3, 1.3, 2, 0x6b7770);
    this.lootPoints.push(
      new THREE.Vector3(x - 4, 1.3, z - 4),
      new THREE.Vector3(x + 5, 1.5, z - 6),
    );
    // Side room partition leaves a walkable opening.
    this.block(x + 1, 1.8, z - 5, 0.3, 3.6, 7, color);
    if (upper) {
      // External stairs lead to a roof-height fighting platform with a raised doorway.
      const sx = x + 12;
      for (let i = 0; i < 12; i++)
        this.solids.push(
          this.block(
            sx,
            (i + 1) * 0.16,
            z - 8 + i * 0.65,
            3,
            (i + 1) * 0.32,
            0.65,
            0x85877b,
            false,
          ),
        );
      this.ramps.push({
        x: sx,
        z: z - 4.1,
        width: 3,
        length: 7.8,
        rise: 3.84,
        base: 0,
      });
      this.solids.push(
        this.block(sx, 3.7, z + 1.5, 4, 0.3, 3.5, 0x85877b, false),
      );
      this.ramps.push({
        x: sx,
        z: z + 1.5,
        width: 4,
        length: 3.5,
        rise: 0,
        base: 3.85,
      });
      this.lootPoints.push(new THREE.Vector3(sx, 4.1, z + 1.5));
    }
  }
  private warehouse(x: number, z: number) {
    this.block(x - 13, 4, z, 0.6, 8, 30, 0x758a8d);
    this.block(x + 13, 4, z, 0.6, 8, 30, 0x758a8d);
    this.block(x, 4, z - 15, 26, 8, 0.6, 0x758a8d);
    this.block(x - 10, 4, z + 15, 6, 8, 0.6, 0x758a8d);
    this.block(x + 10, 4, z + 15, 6, 8, 0.6, 0x758a8d);
    this.block(x, 8.2, z, 27, 0.4, 31, 0x4c6264);
    for (let i = 0; i < 5; i++) {
      this.block(x - 8 + i * 4, 1.3, z - 8, 2.8, 2.6, 3, 0x967c56);
      this.lootPoints.push(new THREE.Vector3(x - 8 + i * 4, 2.8, z - 8));
    }
  }
  private gasStation(x: number, z: number) {
    this.house(x, z - 12, 0xbab7a0, false);
    this.block(x, 5, z + 15, 28, 0.6, 15, 0xb27851);
    for (const dx of [-12, 12])
      for (const dz of [10, 20])
        this.block(x + dx, 2.5, z + dz, 0.4, 5, 0.4, 0xa3a398);
    for (const dx of [-6, 6]) {
      this.block(x + dx, 1, z + 15, 1.6, 2, 1, 0xb8b9a6);
      this.block(x + dx, 1.4, z + 15.55, 0.9, 0.55, 0.1, 0x344747, false);
    }
    this.block(x + 20, 0.8, z + 15, 4, 1.6, 2, 0x59797b);
    this.block(x + 20, 1.8, z + 15, 2, 0.7, 1.8, 0x344747);
  }
  private tower(x: number, z: number) {
    for (const dx of [-2, 2])
      for (const dz of [-2, 2])
        this.block(x + dx, 3, z + dz, 0.45, 6, 0.45, 0x687160);
    this.block(x, 6, z, 5, 0.4, 5, 0x687160);
    this.block(x, 8.6, z, 6, 0.3, 6, 0x687160);
  }
  private road(x1: number, z1: number, x2: number, z2: number) {
    const length = Math.hypot(x2 - x1, z2 - z1),
      count = Math.ceil(length / 4);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count,
        x = THREE.MathUtils.lerp(x1, x2, t),
        z = THREE.MathUtils.lerp(z1, z2, t);
      const mesh = this.block(
        x,
        this.terrainHeight(x, z) + 0.015,
        z,
        7,
        0.04,
        length / count + 0.1,
        0x78796a,
        false,
      );
      mesh.rotation.y = Math.atan2(x2 - x1, z2 - z1);
    }
  }
  private forest() {
    const count = 230;
    const trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.38, 0.6, 5, 6),
      this.material(0x645745),
      count,
    );
    const leaves = new THREE.InstancedMesh(
      new THREE.ConeGeometry(3.2, 8, 6),
      this.material(0x405f4c),
      count,
    );
    const matrix = new THREE.Matrix4();
    let written = 0;
    for (let i = 0; written < count && i < 1800; i++) {
      const x = Math.sin(i * 127.1) * 321,
        z = Math.sin(i * 311.7 + 3) * 321;
      if (
        this.regions.some((r) => Math.hypot(x - r.x, z - r.z) < r.radius + 12)
      )
        continue;
      const y = this.terrainHeight(x, z);
      matrix.makeTranslation(x, y + 2.5, z);
      trunk.setMatrixAt(written, matrix);
      matrix.makeTranslation(x, y + 7, z);
      leaves.setMatrixAt(written, matrix);
      this.boxes.push({
        minX: x - 0.5,
        maxX: x + 0.5,
        minZ: z - 0.5,
        maxZ: z + 0.5,
        height: y + 6,
        minY: y,
      });
      written++;
    }
    trunk.count = leaves.count = written;
    trunk.castShadow = true;
    leaves.castShadow = true;
    this.scene.add(trunk, leaves);
    this.solids.push(trunk, leaves);
  }
  private label(text: string, x: number, z: number) {
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#263c38";
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = "#e5d9b7";
    ctx.font = "bold 25px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, 256, 41);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 1.5),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas),
        side: THREE.DoubleSide,
      }),
    );
    sign.position.set(x, 3, z + 23);
    this.scene.add(sign);
  }
}
