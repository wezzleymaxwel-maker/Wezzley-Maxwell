import * as T from "three";
export type Surface =
  | "plaster"
  | "brick"
  | "concrete"
  | "asphalt"
  | "wood"
  | "bark"
  | "metal"
  | "roof"
  | "grass"
  | "stone"
  | "fabric";
const materials = new Map<string, T.MeshStandardMaterial>();
const maps = new Map<
  Surface,
  { map: T.DataTexture; bump: T.DataTexture; rough: T.DataTexture }
>();
const noise = (x: number, y: number, seed = 1) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
};
function smoothNoise(x: number, y: number, seed = 1) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  return T.MathUtils.lerp(
    T.MathUtils.lerp(noise(ix, iy, seed), noise(ix + 1, iy, seed), u),
    T.MathUtils.lerp(noise(ix, iy + 1, seed), noise(ix + 1, iy + 1, seed), u),
    v,
  );
}
function texture(bytes: Uint8Array, size: number, color = false) {
  const t = new T.DataTexture(bytes, size, size, T.RGBAFormat);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
  t.userData.sharedResource = true;
  t.needsUpdate = true;
  return t;
}
function generate(kind: Surface) {
  if (maps.has(kind)) return maps.get(kind)!;
  const size = 256,
    rgba = new Uint8Array(size * size * 4),
    bump = new Uint8Array(size * size * 4),
    rough = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const fine = noise(x, y, 12),
        medium = smoothNoise(x / 9, y / 9, 2),
        large = smoothNoise(x / 38, y / 38, 8);
      let value = 0.72 + fine * 0.12 + medium * 0.12,
        relief = 0.4 + fine * 0.2 + medium * 0.25,
        r = 1,
        g = 1,
        b = 1,
        roughness = 0.88;
      if (kind === "plaster") {
        const chipped = large > 0.72 && medium > 0.56;
        value = chipped
          ? 0.59 + fine * 0.13
          : 0.75 + fine * 0.1 + medium * 0.08;
        relief = chipped ? 0.26 : 0.63 + fine * 0.08;
        const crack =
          Math.abs(Math.sin(x * 0.033 + Math.sin(y * 0.026) * 3)) < 0.018 &&
          large > 0.5;
        if (crack) value *= 0.78;
      }
      if (kind === "concrete" || kind === "stone") {
        value = 0.48 + medium * 0.21 + large * 0.2 + fine * 0.16;
        relief = 0.25 + medium * 0.4 + fine * 0.3;
        const vein = Math.abs(Math.sin(x * 0.055 + y * 0.035 + large * 7));
        if (vein < 0.05) {
          value *= 0.72;
          relief *= 0.65;
        }
        r = 1.02;
        g = 1.01;
        b = 0.94;
      }
      if (kind === "brick") {
        const row = Math.floor(y / 32),
          col = (x + (row % 2) * 32) % 64,
          mortar = y % 32 < 3 || col < 3;
        value = mortar
          ? 0.45 + fine * 0.13
          : 0.62 +
            noise(Math.floor((x + (row % 2) * 32) / 64), row, 5) * 0.23 +
            fine * 0.11;
        relief = mortar ? 0.14 : 0.64 + medium * 0.17;
        r = mortar ? 0.96 : 1.1;
        g = mortar ? 0.99 : 0.93;
        b = mortar ? 1 : 0.8;
      }
      if (kind === "asphalt") {
        value = 0.32 + fine * 0.26 + medium * 0.17;
        relief = 0.2 + fine * 0.7;
        roughness = 0.96;
        const fissure =
          Math.abs(Math.sin(x * 0.02 + Math.cos(y * 0.045) * 3)) < 0.015;
        if (fissure) value *= 0.35;
      }
      if (kind === "wood" || kind === "bark") {
        const grain = Math.sin(
          x * (kind === "bark" ? 0.3 : 0.16) +
            Math.sin(y * 0.038) * 2 +
            large * 5,
        );
        value = 0.47 + medium * 0.19 + grain * 0.09 + fine * 0.15;
        relief = 0.35 + grain * 0.18 + medium * 0.18;
        const knot = Math.sin(Math.hypot((x - 140) * 0.7, y - 120) * 0.16);
        if (kind === "wood" && Math.hypot((x - 140) * 1.5, y - 120) < 26)
          value += knot * 0.12;
        r = 1.07;
        g = 0.96;
        b = 0.82;
      }
      if (kind === "metal" || kind === "roof") {
        const line = Math.cos(x * 0.2945);
        value = 0.67 + medium * 0.15 + fine * 0.07 + line * 0.035;
        relief = 0.5 + line * 0.24;
        roughness = 0.6;
        const rust = large > 0.63 && medium > 0.46;
        if (rust) {
          value = 0.38 + fine * 0.25;
          r = 1.45;
          g = 0.8;
          b = 0.42;
          roughness = 0.97;
        }
        if (kind === "roof" && y % 52 < 2) {
          value *= 0.5;
          relief = 0.13;
        }
      }
      if (kind === "grass") {
        value = 0.65 + medium * 0.09 + large * 0.08 + fine * 0.06;
        relief = 0.42 + fine * 0.15 + medium * 0.09;
        const dry = large > 0.6;
        r = dry ? 1.05 : 0.97;
        g = dry ? 1 : 1.025;
        b = 0.88;
        if (fine > 0.92) value *= 0.94;
        roughness = 1;
      }
      if (kind === "fabric") {
        const weave = x % 3 === 0 || y % 3 === 0 ? 0.12 : 0;
        value = 0.72 + fine * 0.12 + weave;
        relief = 0.4 + weave * 2;
      }
      const i = (y * size + x) * 4;
      rgba[i] = Math.min(255, value * r * 255);
      rgba[i + 1] = Math.min(255, value * g * 255);
      rgba[i + 2] = Math.min(255, value * b * 255);
      rgba[i + 3] = 255;
      bump[i] = bump[i + 1] = bump[i + 2] = Math.min(255, relief * 255);
      bump[i + 3] = 255;
      rough[i] = rough[i + 1] = rough[i + 2] = roughness * 255;
      rough[i + 3] = 255;
    }
  const result = {
    map: texture(rgba, size, true),
    bump: texture(bump, size),
    rough: texture(rough, size),
  };
  maps.set(kind, result);
  return result;
}
/** Original, embedded surface maps. A shared palette keeps batches small and needs no asset downloads. */
export function surfaceMaterial(kind: Surface, color = 0xffffff) {
  const key = kind + color;
  if (materials.has(key)) return materials.get(key)!;
  const t = generate(kind);
  const m = new T.MeshStandardMaterial({
    color,
    map: t.map,
    bumpMap: t.bump,
    bumpScale: kind === "bark" ? 0.13 : kind === "grass" ? 0.055 : 0.035,
    roughnessMap: t.rough,
    roughness: 1,
    metalness: kind === "metal" || kind === "roof" ? 0.35 : 0,
  });
  m.userData.surface = kind;
  materials.set(key, m);
  return m;
}
/** Box UVs stay at a physical scale instead of stretching a single texel tile across a whole facade. */
export function repeatUV(
  geometry: T.BoxGeometry,
  w: number,
  h: number,
  d: number,
  metresPerTile = 3,
) {
  const uv = geometry.attributes.uv;
  const widths = [d, d, w, w, w, w],
    heights = [h, h, d, d, h, h];
  for (let face = 0; face < 6; face++)
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(
        i,
        (uv.getX(i) * widths[face]) / metresPerTile,
        (uv.getY(i) * heights[face]) / metresPerTile,
      );
    }
  return geometry;
}
let foliage: T.MeshStandardMaterial | undefined;
/** A branch filled with individual leaf silhouettes, shared by instanced crown cards. */
export function foliageMaterial() {
  if (foliage) return foliage;
  const size = 256,
    bytes = new Uint8Array(size * size * 4);
  for (let leaf = 0; leaf < 190; leaf++) {
    const n = leaf + 1,
      cx = 128 + Math.sin(n * 11.7) * 105,
      cy = 128 + Math.cos(n * 7.3) * 100;
    const radius = 4 + noise(n, 2) * 8;
    const shade = 0.6 + noise(n, 3) * 0.4;
    for (
      let y = Math.max(0, Math.floor(cy - radius * 0.7));
      y < Math.min(size, cy + radius * 0.7);
      y++
    )
      for (
        let x = Math.max(0, Math.floor(cx - radius));
        x < Math.min(size, cx + radius);
        x++
      ) {
        const dx = (x - cx) / radius,
          dy = (y - cy) / (radius * 0.55);
        if (dx * dx + dy * dy > 1) continue;
        const i = (y * size + x) * 4;
        const vein = Math.abs(dy) < 0.09 ? 0.8 : 1;
        bytes[i] = Math.round((71 + noise(x, y) * 20) * shade * vein);
        bytes[i + 1] = Math.round((97 + noise(x, y) * 24) * shade * vein);
        bytes[i + 2] = Math.round((44 + noise(x, y) * 14) * shade * vein);
        bytes[i + 3] = 255;
      }
  }
  const map = texture(bytes, size, true);
  map.wrapS = map.wrapT = T.ClampToEdgeWrapping;
  foliage = new T.MeshStandardMaterial({
    map,
    alphaTest: 0.4,
    side: T.DoubleSide,
    roughness: 1,
    alphaToCoverage: true,
  });
  return foliage;
}
let tufts: T.MeshStandardMaterial | undefined;
export function grassMaterial() {
  if (tufts) return tufts;
  const size = 128,
    bytes = new Uint8Array(size * size * 4);
  for (let blade = 0; blade < 19; blade++) {
    const base = 8 + noise(blade, 1) * 112,
      tip = base + (noise(blade, 2) - 0.5) * 52,
      height = 30 + noise(blade, 3) * 94;
    for (let y = 0; y < height; y++) {
      const t = y / height,
        x = base + (tip - base) * t * t,
        width = Math.max(0.6, 2.4 * (1 - t));
      for (
        let px = Math.max(0, Math.floor(x - width));
        px < Math.min(size, x + width);
        px++
      ) {
        const i = ((size - 1 - y) * size + px) * 4;
        const shade = 0.65 + noise(blade, 4) * 0.35;
        bytes[i] = (112 + t * 22) * shade;
        bytes[i + 1] = (117 + t * 27) * shade;
        bytes[i + 2] = (61 + t * 13) * shade;
        bytes[i + 3] = 255;
      }
    }
  }
  const map = texture(bytes, size, true);
  map.wrapS = map.wrapT = T.ClampToEdgeWrapping;
  tufts = new T.MeshStandardMaterial({
    map,
    alphaTest: 0.5,
    side: T.DoubleSide,
    roughness: 1,
    alphaToCoverage: true,
  });
  return tufts;
}
