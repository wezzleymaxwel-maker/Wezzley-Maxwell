import * as THREE from "three";
import {
  surfaceMaterial,
  repeatUV,
  foliageMaterial,
  grassMaterial,
  type Surface,
} from "./materials";

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
  private boxGeometries = new Map<string, THREE.BoxGeometry>();
  private grassMesh?: THREE.InstancedMesh;
  private leafMesh?: THREE.InstancedMesh;
  private ramps: {
    x: number;
    z: number;
    width: number;
    length: number;
    rise: number;
    base: number;
  }[] = [];
  constructor(public scene: THREE.Scene) {
    scene.background = new THREE.Color(0xc2cdce);
    scene.fog = new THREE.FogExp2(0xc2cdce, 0.0015);
    const terrain = new THREE.PlaneGeometry(700, 700, 120, 120);
    terrain.rotateX(-Math.PI / 2);
    const positions = terrain.attributes.position;
    const colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        z = positions.getZ(i),
        y = this.terrainHeight(x, z);
      positions.setY(i, y);
      const color = new THREE.Color(y > 5 ? 0x969477 : 0x9a9f75);
      color.multiplyScalar(
        0.91 + 0.12 * Math.sin(x * 0.12) * Math.cos(z * 0.1),
      );
      colors.push(color.r, color.g, color.b);
    }
    terrain.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    terrain.computeVertexNormals();
    const groundMaterial = surfaceMaterial("grass", 0xd5d2b0).clone();
    groundMaterial.vertexColors = true;
    const uv = terrain.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) * 230, uv.getY(i) * 230);
    const ground = new THREE.Mesh(terrain, groundMaterial);
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
      for (const side of [-1, 1]) {
        this.trim(x, 3.25, z + side * 2.53, 11, 0.1, 0.12, 0x343c3b, "metal");
        this.trim(x, 0.12, z + side * 2.53, 11, 0.16, 0.12, 0x343c3b, "metal");
      }
      for (const dz of [-1.8, -0.6, 0.6, 1.8])
        this.trim(x + 5.55, 1.6, z + dz, 0.1, 2.9, 0.07, 0x86877e, "metal");
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
        this.rockGeometry(size, i),
        this.material(0x9c9b8d, "stone"),
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
    this.groundVegetation();
    for (const region of this.regions)
      this.label(region.name, region.x, region.z);
  }
  setQuality(quality: "baixo" | "medio" | "alto") {
    if (this.grassMesh)
      this.grassMesh.count =
        quality === "baixo"
          ? 0
          : Math.min(
              this.grassMesh.userData.fullCount,
              quality === "medio" ? 900 : 1900,
            );
    if (this.leafMesh) this.leafMesh.castShadow = quality === "alto";
  }
  private material(color: number, kind?: Surface) {
    const palette: Record<number, Surface> = {
      0x78796a: "asphalt",
      0x645745: "bark",
      0x777c73: "stone",
      0x66695c: "roof",
      0x4c6264: "roof",
      0x967c56: "wood",
      0x71604a: "wood",
      0x85877b: "concrete",
      0x9b9788: "concrete",
      0x6b7770: "metal",
      0x758a8d: "metal",
      0x476f70: "metal",
      0x9c674a: "metal",
      0x7c8554: "metal",
      0xb27851: "metal",
      0x687160: "metal",
    };
    return surfaceMaterial(kind ?? palette[color] ?? "plaster", color);
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
    kind?: Surface,
  ) {
    const key = [w, h, d].join(",");
    if (!this.boxGeometries.has(key))
      this.boxGeometries.set(
        key,
        repeatUV(new THREE.BoxGeometry(w, h, d), w, h, d),
      );
    const mesh = new THREE.Mesh(
      this.boxGeometries.get(key)!,
      this.material(color, kind),
    );
    mesh.position.set(x, y, z);
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
  private trim(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color = 0x686b62,
    kind: Surface = "wood",
  ) {
    const m = this.block(x, y, z, w, h, d, color, false, kind);
    m.castShadow = false;
    return m;
  }
  private rockGeometry(size: number, seed: number) {
    const geometry = new THREE.SphereGeometry(size, 10, 7);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      const n =
        0.88 +
        0.13 * Math.sin(x * 2.7 + seed) +
        0.09 * Math.cos(z * 3.3 + y * 2.4);
      p.setXYZ(i, x * n, y * (0.8 + 0.13 * Math.sin(z * 2.5 + seed)), z * n);
    }
    geometry.computeVertexNormals();
    return geometry;
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
    for (const offset of [-5, 5]) {
      const wx = x + offset,
        fz = z + d / 2;
      this.block(wx - 2.35, h / 2, fz, 2.3, h, 0.5, color);
      this.block(wx + 2.35, h / 2, fz, 2.3, h, 0.5, color);
      this.block(wx, 0.55, fz, 2.4, 1.1, 0.5, color);
      this.block(wx, (h + 2.75) / 2, fz, 2.4, h - 2.75, 0.5, color);
      this.trim(wx, 1.08, fz + 0.15, 2.65, 0.16, 0.8, 0xb0aa91, "concrete");
      this.trim(wx, 2.77, fz + 0.05, 2.6, 0.13, 0.62, 0x625f50, "wood");
      for (const sign of [-1, 1])
        this.trim(
          wx + sign * 1.23,
          1.94,
          fz + 0.1,
          0.13,
          1.7,
          0.6,
          0x625f50,
          "wood",
        );
      // Open timber shutters: the central aperture remains transparent to real sight and bullets.
      const shutter = this.trim(
        wx - 1.6,
        1.92,
        fz + 0.3,
        0.6,
        1.6,
        0.09,
        0x596154,
        "wood",
      );
      shutter.rotation.y = -0.3;
      if (upper) {
        this.trim(wx, 5.8, fz + 0.28, 2.2, 1.65, 0.08, 0x293731, "metal");
        for (const sign of [-1, 1])
          this.trim(
            wx + sign * 1.15,
            5.8,
            fz + 0.35,
            0.13,
            1.8,
            0.16,
            0xb8b09a,
            "wood",
          );
        this.trim(wx, 4.96, fz + 0.35, 2.5, 0.16, 0.35, 0xb8b09a, "concrete");
      }
    }
    this.block(x, h / 2 + 1.5, z + d / 2, 3, h - 3, 0.5, color);
    this.block(x, h + 0.16, z, w + 0.8, 0.32, d + 0.8, 0x66695c);
    // Shallow pitched sheet roof, ridge, gutters, and courses break the box silhouette.
    for (const side of [-1, 1]) {
      const roof = this.block(
        x + side * 4.7,
        h + 1.27,
        z,
        10,
        0.16,
        d + 1.2,
        0x797970,
        false,
        "roof",
      );
      roof.rotation.z = -side * 0.23;
      this.solids.push(roof);
      this.trim(
        x + side * 9.5,
        h + 0.2,
        z,
        0.14,
        0.15,
        d + 1.2,
        0x3e4744,
        "metal",
      );
      this.trim(
        x + side * 8.81,
        h * 0.5,
        z + d / 2 + 0.3,
        0.18,
        h,
        0.23,
        0xa8a28e,
        "concrete",
      );
    }
    const triangle = new THREE.Shape();
    triangle.moveTo(-9.45, 0);
    triangle.lineTo(9.45, 0);
    triangle.lineTo(0, 2.2);
    triangle.closePath();
    for (const side of [-1, 1]) {
      const gable = new THREE.Mesh(
        new THREE.ExtrudeGeometry(triangle, {
          depth: 0.13,
          bevelEnabled: false,
        }),
        this.material(color),
      );
      gable.position.set(x, h + 0.25, z + side * 9.4);
      gable.castShadow = true;
      this.scene.add(gable);
      this.solids.push(gable);
    }
    this.trim(x, h + 2.42, z, 0.25, 0.18, d + 1.3, 0x515b57, "metal");
    for (const dz of [-9.29, 9.29])
      this.trim(x, 0.3, z + dz, 17.5, 0.55, 0.12, 0x817f70, "concrete");
    this.trim(x + 6.7, h + 1.6, z - 4, 0.9, 2.9, 1.1, 0x9a8c77, "brick");
    this.trim(x - 1.58, 1.5, z + 9.25, 0.16, 3, 0.25, 0x625f50, "wood");
    this.trim(x + 1.58, 1.5, z + 9.25, 0.16, 3, 0.25, 0x625f50, "wood");
    this.trim(x, 3.04, z + 9.25, 3.4, 0.18, 0.25, 0x625f50, "wood");
    // Furniture as cover with reachable items at tabletop height.
    const table = this.block(x - 4, 0.55, z - 4, 3, 1.1, 1.8, 0x71604a);
    table.visible = false;
    this.solids.splice(this.solids.indexOf(table), 1);
    this.solids.push(
      this.trim(x - 4, 1.02, z - 4, 3.1, 0.16, 1.9, 0x7c654d, "wood"),
    );
    for (const dx of [-1.35, 1.35])
      for (const dz of [-0.72, 0.72])
        this.trim(
          x - 4 + dx,
          0.48,
          z - 4 + dz,
          0.12,
          0.96,
          0.12,
          0x59554b,
          "wood",
        );
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
    for (const side of [-1, 1])
      for (let zz = -14; zz <= 14; zz += 3.5)
        this.trim(
          x + side * 13.37,
          4,
          z + zz,
          0.12,
          8,
          0.14,
          0x4e5c59,
          "metal",
        );
    this.trim(x, 7.85, z + 15.4, 15, 0.3, 0.3, 0x4d5450, "metal");
    for (const dx of [-7.3, 7.3])
      this.trim(x + dx, 3.8, z + 15.4, 0.2, 7.6, 0.3, 0x4d5450, "metal");
    this.trim(x, 7.1, z + 15.38, 8, 0.75, 0.04, 0x363f3c, "metal");
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
    this.car(x + 20, z + 15);
    for (const dx of [-6, 6]) {
      this.trim(x + dx, 1.48, z + 15.57, 0.65, 0.3, 0.035, 0x182322, "metal");
      this.trim(x + dx, 0.7, z + 15.55, 1.2, 0.14, 0.05, 0x8b4f36, "metal");
      const hose = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x + dx + 0.72, 1.7, z + 15),
        new THREE.Vector3(x + dx + 1, 1.3, z + 15.1),
        new THREE.Vector3(x + dx + 1.1, 0.4, z + 15.15),
        new THREE.Vector3(x + dx + 0.75, 0.25, z + 15.2),
      ]);
      const hoseMesh = new THREE.Mesh(
        new THREE.TubeGeometry(hose, 9, 0.035, 4, false),
        this.material(0x252b29, "metal"),
      );
      this.scene.add(hoseMesh);
    }
  }
  private tower(x: number, z: number) {
    for (const dx of [-2, 2])
      for (const dz of [-2, 2])
        this.block(x + dx, 3, z + dz, 0.45, 6, 0.45, 0x687160);
    this.block(x, 6, z, 5, 0.4, 5, 0x687160);
    this.block(x, 8.6, z, 6, 0.3, 6, 0x687160);
    for (const side of [-1, 1]) {
      this.trim(x + side * 2.35, 6.9, z, 0.1, 0.1, 4.8, 0x92958b, "metal");
      this.trim(x, 6.9, z + side * 2.35, 4.8, 0.1, 0.1, 0x92958b, "metal");
      for (const dz of [-2.3, 0, 2.3])
        this.trim(
          x + side * 2.35,
          6.5,
          z + dz,
          0.07,
          1,
          0.07,
          0x92958b,
          "metal",
        );
    }
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
      const dirX = (x2 - x1) / length,
        dirZ = (z2 - z1) / length;
      if (i % 3 !== 2) {
        const marking = this.trim(
          x,
          this.terrainHeight(x, z) + 0.043,
          z,
          0.13,
          0.01,
          2.8,
          0xbcb99d,
          "concrete",
        );
        marking.rotation.y = mesh.rotation.y;
      }
      for (const side of [-1, 1]) {
        const mx = x + dirZ * side * 3.12,
          mz = z - dirX * side * 3.12;
        const marking = this.trim(
          mx,
          this.terrainHeight(mx, mz) + 0.047,
          mz,
          0.1,
          0.01,
          length / count + 0.04,
          0xc3c3ac,
          "concrete",
        );
        marking.rotation.y = mesh.rotation.y;
      }
    }
  }
  private forest() {
    const count = 230,
      trunk = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.3, 0.55, 5.7, 9, 3),
        this.material(0x8a7b66, "bark"),
        count,
      ),
      branches = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.08, 0.19, 3.5, 6),
        this.material(0x8a7b66, "bark"),
        count * 3,
      ),
      leaves = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(4.5, 4.5),
        foliageMaterial(),
        count * 18,
      );
    const dummy = new THREE.Object3D();
    let written = 0;
    for (let i = 0; written < count && i < 1800; i++) {
      const x = Math.sin(i * 127.1) * 321,
        z = Math.sin(i * 311.7 + 3) * 321;
      if (
        this.regions.some((r) => Math.hypot(x - r.x, z - r.z) < r.radius + 12)
      )
        continue;
      const y = this.terrainHeight(x, z),
        height = 0.85 + (i % 7) * 0.065;
      dummy.position.set(x, y + 2.85 * height, z);
      dummy.rotation.set(0.025 * Math.sin(i), 0, 0.025 * Math.cos(i));
      dummy.scale.set(0.8 + (i % 3) * 0.12, height, 0.8 + (i % 3) * 0.12);
      dummy.updateMatrix();
      trunk.setMatrixAt(written, dummy.matrix);
      for (let b = 0; b < 3; b++) {
        const a = (b * Math.PI * 2) / 3 + i;
        dummy.position.set(
          x + Math.sin(a) * 1.1,
          y + 5.1 * height,
          z + Math.cos(a) * 1.1,
        );
        dummy.rotation.set(Math.cos(a) * 0.8, 0, -Math.sin(a) * 0.8);
        dummy.scale.setScalar(height);
        dummy.updateMatrix();
        branches.setMatrixAt(written * 3 + b, dummy.matrix);
      }
      for (let card = 0; card < 18; card++) {
        const a = card * 2.39996 + i,
          r = 1.4 + Math.sin(card * 4.8) * 0.65;
        dummy.position.set(
          x + Math.sin(a) * r * height,
          y + (5.4 + (card % 5) * 0.5) * height,
          z + Math.cos(a) * r * height,
        );
        dummy.rotation.set(Math.sin(a) * 1.05, a, Math.cos(a) * 0.5);
        dummy.scale.setScalar(height * (0.78 + (card % 4) * 0.14));
        dummy.updateMatrix();
        leaves.setMatrixAt(written * 18 + card, dummy.matrix);
      }
      this.boxes.push({
        minX: x - 0.5,
        maxX: x + 0.5,
        minZ: z - 0.5,
        maxZ: z + 0.5,
        height: y + 6 * height,
        minY: y,
      });
      written++;
    }
    trunk.count = written;
    branches.count = written * 3;
    leaves.count = written * 18;
    trunk.castShadow = true;
    branches.castShadow = true;
    leaves.castShadow = false;
    leaves.receiveShadow = true;
    this.leafMesh = leaves;
    this.scene.add(trunk, branches, leaves);
    this.solids.push(trunk);
  }
  private groundVegetation() {
    // Decorative tufts use one instanced draw; they never become invisible bulletproof squares.
    const geometry = new THREE.PlaneGeometry(0.7, 0.55);
    const grass = new THREE.InstancedMesh(geometry, grassMaterial(), 1900);
    const dummy = new THREE.Object3D();
    let written = 0;
    for (let i = 0; i < 4200 && written < 1900; i++) {
      const x = Math.sin(i * 91.7) * 315,
        z = Math.cos(i * 37.3) * 315;
      if (this.regions.some((r) => Math.hypot(x - r.x, z - r.z) < r.radius + 4))
        continue;
      const y = this.terrainHeight(x, z);
      dummy.position.set(x, y + 0.15, z);
      dummy.rotation.set(0, i * 2.39, 0);
      dummy.scale.set(0.7 + (i % 3) * 0.3, 0.65 + (i % 5) * 0.11, 1);
      dummy.updateMatrix();
      grass.setMatrixAt(written++, dummy.matrix);
    }
    grass.count = written;
    grass.userData.fullCount = written;
    this.grassMesh = grass;
    grass.receiveShadow = true;
    this.scene.add(grass);
  }
  private car(x: number, z: number) {
    // Shaped body, cabin, glass, rubber wheels, grille and lights: a recognizable abandoned sedan.
    const shape = new THREE.Shape();
    shape.moveTo(-2.25, 0.45);
    shape.lineTo(-2.12, 1.1);
    shape.lineTo(-1.25, 1.2);
    shape.lineTo(-0.75, 1.86);
    shape.lineTo(0.85, 1.86);
    shape.lineTo(1.38, 1.18);
    shape.lineTo(2.13, 1.1);
    shape.lineTo(2.27, 0.48);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 1.9,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.07,
      bevelThickness: 0.05,
    });
    geometry.translate(x, 0, z - 0.95);
    const body = new THREE.Mesh(geometry, this.material(0x7c8986, "metal"));
    body.castShadow = true;
    body.receiveShadow = true;
    this.scene.add(body);
    this.solids.push(body);
    this.boxes.push({
      minX: x - 2.3,
      maxX: x + 2.3,
      minZ: z - 1,
      maxZ: z + 1,
      height: 1.9,
      minY: 0,
    });
    const glass = this.material(0x34423f, "metal");
    for (const side of [-1, 1]) {
      const window = this.trim(
        x + 0.02,
        1.48,
        z + side * 1.02,
        1.55,
        0.57,
        0.025,
        0x34423f,
        "metal",
      );
      window.material = glass;
      this.trim(x, 1.48, z + side * 1.04, 0.08, 0.58, 0.03, 0x80857c, "metal");
      this.trim(
        x + 0.2,
        1.08,
        z + side * 1.07,
        0.25,
        0.04,
        0.04,
        0xc2c3b3,
        "metal",
      );
      for (const dx of [-1.4, 1.4]) {
        const tyre = new THREE.Mesh(
          new THREE.CylinderGeometry(0.43, 0.43, 0.26, 14),
          this.material(0x2c302d, "concrete"),
        );
        tyre.rotation.x = Math.PI / 2;
        tyre.position.set(x + dx, 0.43, z + side * 1.01);
        tyre.castShadow = true;
        this.scene.add(tyre);
        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.23, 0.23, 0.28, 10),
          this.material(0x9e9d8b, "metal"),
        );
        hub.rotation.x = Math.PI / 2;
        hub.position.copy(tyre.position);
        this.scene.add(hub);
      }
    }
    for (const end of [-1, 1]) {
      this.trim(x + end * 2.28, 0.65, z, 0.1, 0.16, 1.85, 0x6c7470, "metal");
      for (const dz of [-0.64, 0.64])
        this.trim(
          x + end * 2.29,
          0.98,
          z + dz,
          0.08,
          0.18,
          0.38,
          end > 0 ? 0xd0bd87 : 0x874c38,
          "metal",
        );
    }
    for (let grille = 0; grille < 5; grille++)
      this.trim(
        x + 2.3,
        0.87,
        z - 0.4 + grille * 0.2,
        0.05,
        0.22,
        0.05,
        0x222b28,
        "metal",
      );
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
