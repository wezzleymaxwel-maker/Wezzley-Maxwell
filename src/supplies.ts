import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { surfaceMaterial } from "./materials";
/** Recognisable physical equipment with owned meshes and cached shared surface maps. */
export function createSupply(type: number) {
  const root = new T.Group();
  const cloth = surfaceMaterial(
    "fabric",
    type === 6 ? 0x8c2e26 : 0x606442,
  ).clone();
  const metal = surfaceMaterial("metal", 0x414b40).clone();
  const rubber = new T.MeshStandardMaterial({
    color: 0x242b26,
    roughness: 0.85,
  });
  const white = new T.MeshStandardMaterial({ color: 0xe4e0cd, roughness: 0.7 });
  const add = (
    w: number,
    h: number,
    d: number,
    m: T.Material,
    x = 0,
    y = 0,
    z = 0,
    round = 0.025,
  ) => {
    const mesh = new T.Mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(round, w / 4, h / 4, d / 4)),
      m,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };
  if (type === 5) {
    const wood = surfaceMaterial("wood", 0x807246).clone();
    add(0.48, 0.23, 0.3, wood);
    for (const x of [-0.17, 0.17]) {
      add(0.025, 0.25, 0.32, metal, x);
      add(0.05, 0.06, 0.025, metal, x, 0.03, 0.166);
    }
    add(0.2, 0.013, 0.13, metal, 0, 0.129);
    for (let i = 0; i < 5; i++) {
      const bullet = new T.Mesh(
        new T.CylinderGeometry(0.008, 0.009, 0.085, 7),
        new T.MeshStandardMaterial({
          color: 0xb6994f,
          metalness: 0.75,
          roughness: 0.4,
        }),
      );
      bullet.rotation.z = Math.PI / 2;
      bullet.position.set(-0.075 + i * 0.035, 0.14, 0.005);
      root.add(bullet);
    }
  } else if (type === 6) {
    add(0.4, 0.2, 0.24, cloth);
    for (const x of [-0.13, 0.13]) add(0.025, 0.215, 0.25, rubber, x);
    add(0.16, 0.016, 0.035, white, 0, 0.111);
    add(0.035, 0.016, 0.13, white, 0, 0.112);
    add(0.14, 0.025, 0.025, rubber, 0, 0.16);
    add(0.025, 0.055, 0.025, rubber, -0.065, 0.14);
    add(0.025, 0.055, 0.025, rubber, 0.065, 0.14);
  } else if (type === 7) {
    add(0.41, 0.075, 0.43, cloth);
    add(0.31, 0.035, 0.32, metal, 0, 0.055);
    for (const x of [-0.15, 0.15]) {
      add(0.055, 0.06, 0.17, rubber, x, 0.03, -0.22);
      add(0.1, 0.055, 0.11, cloth, x, 0.06, 0.06);
    }
    for (let i = 0; i < 4; i++)
      add(0.27, 0.008, 0.013, rubber, 0, 0.08, -0.1 + i * 0.07);
  } else {
    add(0.32, 0.23, 0.45, cloth);
    add(0.25, 0.1, 0.18, cloth, 0, 0.12, 0.1);
    for (const x of [-0.12, 0.12]) {
      add(0.025, 0.025, 0.42, rubber, x, 0.13);
      add(0.04, 0.018, 0.065, metal, x, 0.16, 0.04);
    }
    add(0.1, 0.05, 0.025, rubber, 0, 0.145, -0.2);
  }
  root.rotation.y = 0.2;
  return root;
}
