import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Original offline hard-surface and anatomical assets. Cached microtexture maps are shared;
 * every returned model owns its geometry and materials so match teardown remains bounded. */
export const MODEL_SHARED_RESOURCES = new Set<T.Texture>();
type Surface =
  "metal" | "polymer" | "wood" | "cloth" | "skin" | "glass" | "black" | "brass";
type Quality = "baixo" | "medio" | "alto" | string;
const textures = new Map<string, T.DataTexture>();
function texture(kind: string) {
  let cached = textures.get(kind);
  if (cached) return cached;
  const size = 128,
    data = new Uint8Array(size * size * 4);
  let seed = 419;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        n = random();
      let value = 0.86;
      if (kind === "wood")
        value =
          0.6 + 0.18 * Math.sin(x * 0.33 + Math.sin(y * 0.05) * 2) + n * 0.18;
      else if (kind === "cloth")
        value = 0.79 + (x % 4 === 0 || y % 4 === 0 ? -0.09 : 0) + n * 0.15;
      else value = 0.84 + n * 0.16 - (y % 23 === 0 ? 0.04 : 0);
      data[i] = data[i + 1] = data[i + 2] = Math.floor(value * 255);
      data[i + 3] = 255;
    }
  cached = new T.DataTexture(data, size, size, T.RGBAFormat);
  cached.wrapS = cached.wrapT = T.RepeatWrapping;
  cached.magFilter = T.LinearFilter;
  cached.minFilter = T.LinearMipmapLinearFilter;
  cached.generateMipmaps = true;
  cached.needsUpdate = true;
  cached.anisotropy = 4;
  cached.userData.sharedResource = true;
  MODEL_SHARED_RESOURCES.add(cached);
  textures.set(kind, cached);
  return cached;
}
function material(surface: Surface) {
  const values: Record<Surface, [number, number, number]> = {
    metal: [0x414a4d, 0.42, 0.82],
    polymer: [0x27302e, 0.82, 0.04],
    wood: [0x70533b, 0.72, 0.03],
    cloth: [0xffffff, 0.93, 0],
    skin: [0xffffff, 0.71, 0],
    glass: [0x30515c, 0.18, 0.55],
    black: [0x101614, 0.89, 0],
    brass: [0xa58b44, 0.35, 0.75],
  };
  const [color, roughness, metalness] = values[surface],
    m = new T.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      vertexColors: surface === "cloth" || surface === "skin",
    });
  m.name = surface;
  if (surface === "wood") {
    m.map = texture("wood");
    m.bumpMap = m.map;
    m.bumpScale = 0.002;
  } else if (surface === "cloth") {
    m.map = texture("cloth");
    m.bumpMap = m.map;
    m.bumpScale = 0.0015;
  } else if (surface === "metal" || surface === "polymer") {
    m.roughnessMap = texture("metal");
    m.bumpMap = m.roughnessMap;
    m.bumpScale = 0.0005;
  }
  return m;
}
function rounded(w: number, h: number, d: number, r = 0.015) {
  return new RoundedBoxGeometry(
    w,
    h,
    d,
    1,
    Math.min(r, w * 0.3, h * 0.3, d * 0.3),
  );
}
function sphere(w: number, h: number, d: number) {
  return new T.SphereGeometry(1, 10, 6).scale(w / 2, h / 2, d / 2);
}
function capsule(radius: number, length: number) {
  return new T.CapsuleGeometry(
    radius,
    Math.max(0.001, length - radius * 2),
    2,
    6,
  );
}
function segment(a: T.Vector3, b: T.Vector3, radius: number) {
  const g = capsule(radius, a.distanceTo(b));
  g.applyQuaternion(
    new T.Quaternion().setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    ),
  );
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
function cylinder(radius: number, length: number, other = radius) {
  const g = new T.CylinderGeometry(radius, other, length, 12, 1);
  g.rotateX(Math.PI / 2);
  return g;
}
function profile(points: number[][], width: number) {
  const shape = new T.Shape();
  shape.moveTo(-points[0][0], points[0][1]);
  for (const [z, y] of points.slice(1)) shape.lineTo(-z, y);
  shape.closePath();
  const g = new T.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelSize: 0.006,
    bevelThickness: 0.006,
    bevelSegments: 1,
    steps: 1,
  });
  g.translate(0, 0, -width / 2);
  g.rotateY(Math.PI / 2);
  return g;
}
interface Part {
  geometry: T.BufferGeometry;
  surface: Surface;
  color?: number;
  appearance?: number;
}
function push(
  parts: Part[],
  geometry: T.BufferGeometry,
  surface: Surface,
  x = 0,
  y = 0,
  z = 0,
  color?: number,
  appearance = 0,
) {
  geometry.translate(x, y, z);
  parts.push({ geometry, surface, color, appearance });
}
function attrs(g: T.BufferGeometry, color: number, appearance: number) {
  const count = g.attributes.position.count,
    c = new T.Color(color),
    colors = new Float32Array(count * 3),
    surfaces = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    surfaces[i] = appearance;
  }
  g.setAttribute("color", new T.BufferAttribute(colors, 3));
  g.setAttribute("surface", new T.BufferAttribute(surfaces, 1));
}
function build(parts: Part[], single = false) {
  const root = new T.Group(),
    groups = new Map<string, Part[]>();
  for (const p of parts) {
    const key = single ? "cloth" : p.surface;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  for (const [key, list] of groups) {
    const m = material(key as Surface),
      geometries: T.BufferGeometry[] = [];
    for (const p of list) {
      let g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry;
      const color =
        p.color ??
        (single ? (materialColors[p.surface] ?? 0xffffff) : 0xffffff);
      attrs(g, color, p.appearance ?? 0);
      if (single || key === "cloth" || key === "skin") {
      } else g.deleteAttribute("color");
      g.deleteAttribute("uv1");
      geometries.push(g);
    }
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error("Model geometry merge failed");
    const mesh = new T.Mesh(merged, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    for (const g of geometries) g.dispose();
  }
  return root;
}
const materialColors: Partial<Record<Surface, number>> = {
  metal: 0x414a4d,
  polymer: 0x27302e,
  wood: 0x70533b,
  glass: 0x30515c,
  black: 0x101614,
  brass: 0xa58b44,
};
function gunParts(type: number) {
  const p: Part[] = [];
  const body = (
    w: number,
    h: number,
    d: number,
    s: Surface,
    x: number,
    y: number,
    z: number,
  ) => push(p, rounded(w, h, d), s, x, y, z);
  const barrel = (
    r: number,
    len: number,
    x: number,
    y: number,
    z: number,
    s: Surface = "metal",
  ) => push(p, cylinder(r, len), s, x, y, z);
  const sight = (z: number, y: number) => {
    body(0.025, 0.035, 0.025, "black", 0, y, z);
    body(0.007, 0.008, 0.008, "brass", 0, y + 0.02, z);
  };
  const trigger = (z: number, y: number) => {
    const g = new T.TorusGeometry(0.045, 0.007, 5, 14);
    g.rotateY(Math.PI / 2);
    g.scale(1, 1.15, 0.78);
    push(p, g, "polymer", 0, y, z);
    body(0.013, 0.045, 0.012, "metal", 0, y + 0.012, z - 0.008);
  };
  const grip = (z: number) => {
    push(
      p,
      profile(
        [
          [z - 0.045, -0.045],
          [z + 0.035, -0.065],
          [z + 0.083, -0.245],
          [z - 0.015, -0.26],
          [z - 0.06, -0.085],
        ],
        0.074,
      ),
      "polymer",
    );
    for (let i = 0; i < 6; i++)
      body(
        0.078,
        0.006,
        0.041,
        "black",
        0,
        -0.11 - i * 0.019,
        z + 0.016 + i * 0.004,
      );
  };
  const rail = (z: number, len: number, y: number) => {
    body(0.05, 0.016, len, "metal", 0, y, z);
    for (let i = 0; i < Math.floor(len / 0.035); i++)
      body(
        0.065,
        0.008,
        0.011,
        "polymer",
        0,
        y + 0.012,
        z - len / 2 + i * 0.035,
      );
  };
  const stock = (wood: boolean) => {
    push(
      p,
      profile(
        [
          [0, -0.015],
          [0.13, -0.018],
          [0.18, -0.08],
          [0.43, -0.095],
          [0.43, -0.22],
          [0.28, -0.2],
          [0.13, -0.12],
          [0.035, -0.13],
        ],
        0.085,
      ),
      wood ? "wood" : "polymer",
    );
    body(0.092, 0.13, 0.035, "black", 0, -0.154, 0.43);
  };
  if (type === 0) {
    body(0.098, 0.105, 0.255, "metal", 0, 0.034, -0.13);
    body(0.085, 0.078, 0.2, "polymer", 0, -0.047, -0.1);
    barrel(0.019, 0.245, 0, 0.025, -0.15);
    barrel(0.012, 0.004, 0, 0.025, -0.275, "black");
    grip(0.015);
    trigger(-0.075, -0.105);
    sight(-0.235, 0.099);
    sight(-0.015, 0.099);
    body(0.003, 0.027, 0.058, "black", 0.05, 0.04, -0.126);
    for (let side of [-1, 1])
      for (let i = 0; i < 6; i++)
        body(
          0.003,
          0.06,
          0.005,
          "black",
          side * 0.05,
          0.04,
          -0.027 - i * 0.009,
        );
  } else if (type === 1) {
    body(0.096, 0.115, 0.265, "metal", 0, 0.002, -0.14);
    stock(true);
    barrel(0.021, 0.69, 0, 0.029, -0.6);
    barrel(0.013, 0.006, 0, 0.029, -0.948, "black");
    barrel(0.018, 0.53, 0, -0.026, -0.49);
    body(0.1, 0.088, 0.25, "wood", 0, -0.028, -0.48);
    for (let i = 0; i < 9; i++)
      body(0.105, 0.008, 0.01, "black", 0, -0.071, -0.585 + i * 0.026);
    trigger(-0.04, -0.1);
    sight(-0.88, 0.064);
    body(0.002, 0.034, 0.09, "black", 0.05, 0.012, -0.145);
  } else if (type === 2) {
    body(0.14, 0.14, 0.37, "metal", 0, 0.015, -0.21);
    body(0.1, 0.045, 0.3, "polymer", 0, 0.106, -0.21);
    barrel(0.025, 0.68, 0, 0.012, -0.72);
    barrel(0.038, 0.07, 0, 0.012, -1.08);
    barrel(0.018, 0.004, 0, 0.012, -1.118, "black");
    grip(0.015);
    trigger(-0.07, -0.11);
    body(0.17, 0.22, 0.2, "polymer", -0.025, -0.18, -0.24);
    rail(-0.24, 0.27, 0.14);
    stock(false);
    for (let i = 0; i < 9; i++) {
      body(0.012, 0.045, 0.027, "black", 0.073, 0.018, -0.33 - i * 0.033);
      body(0.012, 0.045, 0.027, "black", -0.073, 0.018, -0.33 - i * 0.033);
    }
    for (let i = 0; i < 6; i++)
      barrel(0.009, 0.055, -0.075 - i * 0.015, -0.04, -0.12, "brass");
    sight(-0.93, 0.07);
    for (let side of [-1, 1]) {
      const g = cylinder(0.008, 0.24);
      g.rotateY(side * 0.22);
      push(p, g, "metal", side * 0.025, -0.035, -0.81);
    }
  } else if (type === 3) {
    body(0.1, 0.125, 0.3, "metal", 0, 0.035, -0.15);
    body(0.09, 0.06, 0.25, "polymer", 0, -0.055, -0.12);
    barrel(0.02, 0.25, 0, 0.034, -0.36);
    barrel(0.012, 0.004, 0, 0.034, -0.488, "black");
    grip(0.008);
    trigger(-0.075, -0.105);
    body(0.07, 0.2, 0.08, "polymer", 0, -0.185, -0.23);
    body(0.074, 0.018, 0.085, "black", 0, -0.287, -0.23);
    rail(-0.18, 0.24, 0.115);
    sight(-0.29, 0.145);
    sight(-0.045, 0.145);
    for (let side of [-1, 1]) {
      body(0.016, 0.025, 0.23, "metal", side * 0.037, -0.04, 0.13);
      body(0.017, 0.12, 0.027, "polymer", side * 0.038, -0.09, 0.25);
    }
    for (let i = 0; i < 5; i++)
      body(0.004, 0.04, 0.008, "black", 0.052, 0.045, -0.25 + i * 0.022);
  } else {
    barrel(0.038, 0.37, 0, 0.022, -0.2);
    body(0.1, 0.09, 0.48, "polymer", 0, -0.038, -0.35);
    stock(false);
    barrel(0.019, 0.72, 0, 0.025, -0.8);
    barrel(0.029, 0.07, 0, 0.025, -1.145);
    barrel(0.012, 0.004, 0, 0.025, -1.183, "black");
    trigger(-0.02, -0.12);
    rail(-0.17, 0.22, 0.083);
    barrel(0.034, 0.29, 0, 0.16, -0.16);
    barrel(0.053, 0.09, 0, 0.16, -0.345);
    barrel(0.047, 0.004, 0, 0.16, -0.392, "glass");
    barrel(0.042, 0.065, 0, 0.16, 0.017);
    barrel(0.033, 0.004, 0, 0.16, 0.051, "glass");
    body(0.075, 0.012, 0.04, "black", 0, 0.108, -0.06);
    body(0.075, 0.012, 0.04, "black", 0, 0.108, -0.26);
    const turret = cylinder(0.024, 0.04);
    turret.rotateX(Math.PI / 2);
    push(p, turret, "metal", 0, 0.21, -0.15);
    body(0.09, 0.015, 0.02, "metal", 0.075, 0.01, -0.044);
    push(p, sphere(0.036, 0.036, 0.036), "polymer", 0.12, 0.012, -0.044);
    for (let side of [-1, 1]) {
      const g = cylinder(0.008, 0.24);
      g.rotateY(side * 0.18);
      push(p, g, "metal", side * 0.04, -0.09, -0.55);
    }
  }
  return p;
}
const gunTemplates = new Map<number, T.Group>();
function cloneOwned(template: T.Group) {
  const clone = template.clone(true),
    materials = new Map<T.Material, T.Material>();
  clone.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.geometry = o.geometry.clone();
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const copies = list.map((m) => {
        const cached = materials.get(m);
        if (cached) return cached;
        const fresh = m.clone() as T.Material;
        materials.set(m, fresh);
        return fresh;
      });
      o.material = Array.isArray(o.material) ? copies : copies[0];
    }
  });
  return clone;
}
export function createWeapon(type: number) {
  const index = Math.max(
    0,
    Math.min(4, Math.trunc(Number.isFinite(type) ? type : 0)),
  );
  let template = gunTemplates.get(index);
  if (!template) {
    template = build(gunParts(index));
    template.name = "weapon";
    template.userData.type = index;
    gunTemplates.set(index, template);
  }
  return cloneOwned(template);
}
function heldWeapon(type: number) {
  const p: Part[] = [];
  const body = (
    w: number,
    h: number,
    d: number,
    material: Surface,
    x: number,
    y: number,
    z: number,
  ) => push(p, rounded(w, h, d), material, x, y, z);
  const barrel = (radius: number, length: number, y: number, z: number) =>
    push(p, cylinder(radius, length), "metal", 0, y, z);
  if (type === 0) {
    body(0.096, 0.1, 0.255, "metal", 0, 0.03, -0.13);
    push(
      p,
      profile(
        [
          [-0.04, -0.05],
          [0.04, -0.06],
          [0.08, -0.24],
          [-0.02, -0.25],
        ],
        0.073,
      ),
      "polymer",
    );
    barrel(0.019, 0.25, 0.03, -0.16);
  } else {
    body(
      type === 2 ? 0.14 : 0.1,
      0.12,
      type === 3 ? 0.29 : 0.36,
      "metal",
      0,
      0.02,
      -0.18,
    );
    const length =
      type === 3 ? 0.35 : type === 1 ? 0.72 : type === 2 ? 0.91 : 1.05;
    barrel(0.022, length, 0.035, -length * 0.56 - 0.14);
    push(
      p,
      profile(
        [
          [0, -0.025],
          [0.16, -0.04],
          [0.4, -0.1],
          [0.4, -0.21],
          [0.17, -0.13],
          [0.04, -0.1],
        ],
        0.08,
      ),
      type === 1 ? "wood" : "polymer",
    );
    if (type === 1) {
      body(0.105, 0.095, 0.25, "wood", 0, -0.035, -0.48);
      barrel(0.018, 0.5, -0.025, -0.48);
    } else {
      body(
        type === 2 ? 0.16 : 0.07,
        type === 2 ? 0.2 : 0.19,
        0.12,
        "polymer",
        0,
        -0.16,
        -0.19,
      );
    }
    if (type === 4) {
      barrel(0.038, 0.32, 0.16, -0.15);
      barrel(0.052, 0.06, 0.16, -0.33);
    }
    if (type === 3) {
      body(0.08, 0.03, 0.21, "polymer", 0, 0.1, -0.16);
    }
  }
  const g = build(p, true);
  g.name = "heldWeapon";
  return g;
}
function humanPart(
  parts: Part[],
  g: T.BufferGeometry,
  color: number,
  appearance: number,
  x = 0,
  y = 0,
  z = 0,
) {
  push(parts, g, "cloth", x, y, z, color, appearance);
}
const V = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
function hand(parts: Part[], at: T.Vector3, scale = 1, skin = false) {
  const color = skin ? 0xb68465 : 0x3e4936,
    surface = skin ? 1 : 3;
  humanPart(
    parts,
    sphere(0.095 * scale, 0.13 * scale, 0.065 * scale),
    color,
    surface,
    at.x,
    at.y,
    at.z,
  );
  for (let finger = 0; finger < 4; finger++) {
    const x = at.x + (-0.032 + finger * 0.021) * scale,
      len = (finger === 0 ? 0.075 : finger === 3 ? 0.061 : 0.085) * scale;
    humanPart(
      parts,
      segment(
        V(x, at.y - 0.025 * scale, at.z - 0.019 * scale),
        V(x, at.y - 0.025 * scale - len, at.z - 0.035 * scale),
        0.012 * scale,
      ),
      color,
      surface,
    );
    humanPart(
      parts,
      sphere(0.024 * scale, 0.026 * scale, 0.022 * scale),
      skin ? 0xc29375 : 0x59634c,
      surface,
      x,
      at.y - 0.025 * scale - len,
      at.z - 0.035 * scale,
    );
  }
  humanPart(
    parts,
    segment(
      at.clone().add(V(0.042 * scale, 0.015 * scale, 0)),
      at.clone().add(V(0.065 * scale, -0.045 * scale, -0.04 * scale)),
      0.018 * scale,
    ),
    color,
    surface,
  );
}
function createArmParts(left: boolean, firstPerson = false, weapon = 0) {
  const p: Part[] = [],
    side = left ? -1 : 1;
  if (firstPerson) {
    const wrist = left
        ? V(-0.075, -0.125, weapon === 0 ? -0.045 : -0.38)
        : V(0.015, -0.17, 0.025),
      elbow = left ? V(-0.35, -0.3, 0.48) : V(0.15, -0.28, 0.52);
    humanPart(p, segment(elbow, wrist, 0.062), 0x74815d, 2);
    humanPart(
      p,
      segment(wrist.clone().add(V(0, -0.01, 0.04)), wrist, 0.049),
      0xb68465,
      1,
    );
    hand(p, wrist.clone().add(V(0, 0.035, -0.015)), 1.1);
    for (let i = 0; i < 3; i++)
      humanPart(
        p,
        rounded(0.1, 0.009, 0.03),
        0x303b2d,
        3,
        wrist.x,
        wrist.y - 0.05,
        wrist.z + 0.035 + i * 0.014,
      );
    return p;
  }
  const elbow = V(side * 0.055, -0.235, -0.04),
    wrist = left ? V(0.36, -0.31, -0.47) : V(-0.015, -0.31, -0.25);
  humanPart(p, segment(V(0, 0, 0), elbow, 0.075), 0x74815d, 2);
  humanPart(p, segment(elbow, wrist, 0.058), 0x74815d, 2);
  humanPart(p, sphere(0.15, 0.1, 0.13), 0x4b5841, 4, elbow.x, elbow.y, elbow.z);
  hand(p, wrist, 0.86);
  return p;
}
export function createArms(skinColor: string, outfitColor: string, weapon = 0) {
  const g = build(
    [
      ...createArmParts(false, true, weapon),
      ...createArmParts(true, true, weapon),
    ],
    true,
  );
  g.name = "arms";
  updateOperatorAppearance(g, skinColor, outfitColor);
  return g;
}
function torsoParts() {
  const p: Part[] = [];
  humanPart(p, sphere(0.48, 0.61, 0.29), 0x74815d, 2, 0, 0, 0);
  humanPart(p, sphere(0.39, 0.23, 0.28), 0x667451, 2, 0, -0.29, 0);
  humanPart(p, rounded(0.39, 0.4, 0.1, 0.035), 0x46523b, 4, 0, 0.015, -0.145);
  humanPart(p, rounded(0.36, 0.34, 0.06), 0x46523b, 4, 0, 0.02, 0.15);
  for (let side of [-1, 1]) {
    humanPart(
      p,
      rounded(0.055, 0.43, 0.025),
      0x3e4834,
      4,
      side * 0.145,
      0.05,
      -0.205,
    );
    humanPart(
      p,
      rounded(0.065, 0.06, 0.37),
      0x46523b,
      4,
      side * 0.16,
      0.245,
      0,
    );
  }
  for (let i = 0; i < 3; i++) {
    humanPart(
      p,
      rounded(0.095, 0.15, 0.052),
      0x596344,
      4,
      (i - 1) * 0.116,
      -0.075,
      -0.218,
    );
    humanPart(
      p,
      rounded(0.082, 0.025, 0.06),
      0x333c2c,
      4,
      (i - 1) * 0.116,
      -0.012,
      -0.22,
    );
  }
  humanPart(p, rounded(0.43, 0.045, 0.3), 0x282f26, 0, 0, -0.27, 0);
  humanPart(p, rounded(0.05, 0.04, 0.018), 0x778174, 0, 0, -0.27, -0.158);
  humanPart(p, rounded(0.13, 0.2, 0.1), 0x4b533d, 4, -0.23, -0.18, 0.08);
  humanPart(p, rounded(0.05, 0.22, 0.04), 0x252d25, 0, 0.18, 0.1, 0.2);
  humanPart(p, cylinder(0.008, 0.15), 0x151d17, 0, 0.19, 0.31, 0.2);
  // Backpack follows the back silhouette instead of a rectangular block.
  humanPart(p, sphere(0.32, 0.41, 0.16), 0x536045, 4, 0, 0.015, 0.22);
  humanPart(p, rounded(0.24, 0.17, 0.04), 0x3e4936, 4, 0, -0.04, 0.3);
  return p;
}
function headParts() {
  const p: Part[] = [];
  humanPart(p, capsule(0.055, 0.16), 0xb68465, 1, 0, -0.18, 0);
  humanPart(p, sphere(0.205, 0.285, 0.21), 0xb68465, 1, 0, -0.025, 0);
  // Cheeks, brow, shaped nose, lips and ears form an actual facial silhouette.
  humanPart(p, sphere(0.077, 0.13, 0.1), 0xb68465, 1, -0.064, -0.055, -0.08);
  humanPart(p, sphere(0.077, 0.13, 0.1), 0xb68465, 1, 0.064, -0.055, -0.08);
  humanPart(p, sphere(0.037, 0.073, 0.063), 0xb68465, 1, 0, -0.03, -0.116);
  humanPart(p, sphere(0.05, 0.031, 0.05), 0xb68465, 1, 0, -0.054, -0.132);
  for (let side of [-1, 1]) {
    humanPart(
      p,
      sphere(0.035, 0.07, 0.05),
      0xb68465,
      1,
      side * 0.104,
      -0.035,
      0,
    );
    humanPart(
      p,
      sphere(0.048, 0.017, 0.017),
      0xd0c8ae,
      0,
      side * 0.049,
      0.005,
      -0.103,
    );
    humanPart(
      p,
      sphere(0.018, 0.018, 0.009),
      0x242c27,
      0,
      side * 0.049,
      0.005,
      -0.114,
    );
    humanPart(
      p,
      rounded(0.056, 0.012, 0.016, 0.004),
      0x514532,
      0,
      side * 0.05,
      0.027,
      -0.106,
    );
  }
  humanPart(p, sphere(0.064, 0.014, 0.025), 0x775846, 0, 0, -0.089, -0.098);
  // Helmet is an open hemispherical shell with rim, NVG mount and chin straps.
  const helmet = new T.SphereGeometry(
    0.128,
    16,
    8,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.54,
  );
  helmet.scale(1, 0.87, 1.11);
  humanPart(p, helmet, 0x526148, 4, 0, 0.045, 0.01);
  const rim = new T.TorusGeometry(0.125, 0.009, 5, 24);
  rim.rotateX(Math.PI / 2);
  rim.scale(1, 1, 1.1);
  humanPart(p, rim, 0x323c2e, 4, 0, 0.025, 0.01);
  humanPart(p, rounded(0.038, 0.045, 0.018), 0x30382d, 0, 0, 0.063, -0.13);
  for (let side of [-1, 1])
    humanPart(
      p,
      segment(
        V(side * 0.09, 0.0, -0.005),
        V(side * 0.05, -0.125, -0.07),
        0.007,
      ),
      0x384333,
      4,
    );
  return p;
}
function thighParts() {
  const p: Part[] = [];
  humanPart(p, segment(V(0, 0, 0), V(0, -0.37, 0), 0.09), 0x74815d, 2);
  humanPart(p, sphere(0.18, 0.18, 0.17), 0x74815d, 2, 0, -0.08, 0);
  humanPart(p, rounded(0.065, 0.14, 0.15), 0x536244, 4, -0.072, -0.18, 0);
  return p;
}
function shinParts() {
  const p: Part[] = [];
  humanPart(p, segment(V(0, 0, 0), V(0, -0.31, 0.015), 0.063), 0x74815d, 2);
  humanPart(p, sphere(0.135, 0.14, 0.075), 0x46523d, 4, 0, -0.025, -0.048);
  humanPart(
    p,
    rounded(0.125, 0.14, 0.22, 0.022),
    0x302e26,
    0,
    0,
    -0.34,
    -0.041,
  );
  humanPart(
    p,
    rounded(0.13, 0.026, 0.24, 0.012),
    0x1c211b,
    0,
    0,
    -0.409,
    -0.05,
  );
  for (let i = 0; i < 4; i++)
    humanPart(
      p,
      rounded(0.08, 0.006, 0.011),
      0x726e55,
      0,
      0,
      -0.3 - i * 0.016,
      -0.13,
    );
  return p;
}
function part(name: string, parts: Part[], x: number, y: number, z: number) {
  const g = build(parts, true);
  g.name = name;
  g.position.set(x, y, z);
  return g;
}
function distantOperator(type: number) {
  const p: Part[] = [];
  const lowSphere = (w: number, h: number, d: number) =>
    new T.SphereGeometry(1, 8, 5).scale(w / 2, h / 2, d / 2);
  humanPart(p, lowSphere(0.48, 0.62, 0.3), 0x74815d, 2, 0, 1.18, 0);
  humanPart(p, lowSphere(0.22, 0.29, 0.22), 0xb68465, 1, 0, 1.66, 0);
  humanPart(p, lowSphere(0.26, 0.13, 0.29), 0x526148, 4, 0, 1.79, 0.01);
  for (const side of [-1, 1]) {
    humanPart(
      p,
      segment(V(side * 0.11, 0.85, 0), V(side * 0.11, 0.15, -0.02), 0.075),
      0x74815d,
      2,
    );
    humanPart(
      p,
      new T.BoxGeometry(0.12, 0.14, 0.21),
      0x302e26,
      0,
      side * 0.11,
      0.075,
      -0.04,
    );
    humanPart(
      p,
      segment(V(side * 0.27, 1.42, 0), V(side * 0.18, 1.11, -0.25), 0.065),
      0x74815d,
      2,
    );
  }
  humanPart(p, new T.BoxGeometry(0.36, 0.36, 0.1), 0x46523b, 4, 0, 1.2, -0.15);
  const gun = heldWeapon(type);
  gun.position.set(0.22, 1.12, -0.24);
  gun.updateMatrixWorld(true);
  // Preserve the weapon's vertex colors and anatomy tags rather than repainting it.
  const body = build(p, true),
    gunMesh = gun.children[0] as T.Mesh;
  body.updateMatrixWorld(true);
  const first = body.children[0] as T.Mesh;
  const weaponGeometry = gunMesh.geometry
    .clone()
    .applyMatrix4(gunMesh.matrixWorld);
  const geometry = mergeGeometries([first.geometry, weaponGeometry], false)!;
  first.geometry.dispose();
  weaponGeometry.dispose();
  for (const m of gun.children)
    if (m instanceof T.Mesh) {
      m.geometry.dispose();
      (m.material as T.Material).dispose();
    }
  first.geometry = geometry;
  first.name = "distant";
  first.castShadow = false;
  return first;
}
const operatorTemplates = new Map<number, T.Group>();
function operatorBase(weapon: number) {
  const root = new T.Group(),
    detail = new T.Group();
  detail.name = "detail";
  root.add(detail);
  detail.add(
    part("torso", torsoParts(), 0, 1.18, 0),
    part("head", headParts(), 0, 1.67, 0),
  );
  for (let side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right",
      leg = part(prefix + "Leg", thighParts(), side * 0.112, 0.865, 0),
      shin = part(prefix + "Shin", shinParts(), 0, -0.435, 0);
    leg.add(shin);
    detail.add(leg);
    detail.add(
      part(prefix + "Arm", createArmParts(side < 0), side * 0.27, 1.43, 0),
    );
  }
  const w = heldWeapon(weapon);
  w.position.set(0.22, 1.12, -0.24);
  w.name = "heldWeapon";
  detail.add(w);
  root.updateMatrixWorld(true);
  root.add(distantOperator(weapon));
  root.getObjectByName("distant")!.visible = false;
  return root;
}
export interface OperatorAppearance {
  skin: string;
  outfit: string;
  weapon: number;
}
export function createOperator(options: OperatorAppearance) {
  const type = Math.max(0, Math.min(4, Math.trunc(options.weapon)));
  let template = operatorTemplates.get(type);
  if (!template) {
    template = operatorBase(type);
    operatorTemplates.set(type, template);
  }
  const root = cloneOwned(template);
  root.name = "operator";
  root.userData.walkBlend = 0;
  updateOperatorAppearance(root, options.skin, options.outfit);
  return root;
}
export function updateOperatorAppearance(
  root: T.Object3D,
  skin: string,
  outfit: string,
) {
  const skinColor = new T.Color(skin),
    cloth = new T.Color(outfit);
  root.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    const surface = o.geometry.attributes.surface,
      colors = o.geometry.attributes.color;
    if (!surface || !colors) return;
    for (let i = 0; i < surface.count; i++) {
      const tag = surface.getX(i);
      if (tag === 0) continue;
      const color = tag === 1 ? skinColor : cloth;
      const shade = tag === 3 ? 0.58 : tag === 4 ? 0.68 : 1;
      colors.setXYZ(i, color.r * shade, color.g * shade, color.b * shade);
    }
    colors.needsUpdate = true;
  });
}
export function animateOperator(root: T.Group, time: number, moving: boolean) {
  const oldTime =
      typeof root.userData.lastAnimate === "number"
        ? root.userData.lastAnimate
        : time,
    dt = Math.max(0, Math.min(0.1, time - oldTime));
  root.userData.lastAnimate = time;
  const blend = T.MathUtils.lerp(
    root.userData.walkBlend ?? 0,
    moving ? 1 : 0,
    1 - Math.exp(-dt * 12),
  );
  root.userData.walkBlend = blend;
  if (!root.getObjectByName("detail")?.visible) return;
  const phase = time * 8.6;
  for (let side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right",
      leg = root.getObjectByName(prefix + "Leg"),
      shin = root.getObjectByName(prefix + "Shin"),
      arm = root.getObjectByName(prefix + "Arm");
    const s = Math.sin(phase + (side < 0 ? 0 : Math.PI));
    if (leg) leg.rotation.x = s * 0.48 * blend;
    if (shin) shin.rotation.x = Math.max(0, -s) * 0.66 * blend;
    if (arm) arm.rotation.x = -s * 0.055 * blend;
  }
  const torso = root.getObjectByName("torso");
  if (torso)
    torso.position.y = 1.18 + Math.abs(Math.sin(phase)) * 0.012 * blend;
}
export function updateOperatorDetail(
  root: T.Group,
  distance: number,
  quality: Quality,
) {
  const threshold = quality === "baixo" ? 38 : quality === "alto" ? 85 : 60;
  const detailed = distance < threshold;
  const near = root.getObjectByName("detail"),
    far = root.getObjectByName("distant");
  if (near) near.visible = detailed;
  if (far) far.visible = !detailed;
  root.visible =
    distance < (quality === "baixo" ? 230 : quality === "alto" ? 600 : 400);
}
