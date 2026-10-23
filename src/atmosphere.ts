import * as T from "three";
import { disposeObject } from "./rendering";

/** Offline daylight: one sky draw, distant terrain silhouette and a tiny prefiltered light map. */
export function setupAtmosphere(
  scene: T.Scene,
  renderer: T.WebGLRenderer,
  camera: T.PerspectiveCamera,
  sun: T.DirectionalLight,
) {
  const cloudCanvas = document.createElement("canvas");
  cloudCanvas.width = 1024;
  cloudCanvas.height = 512;
  const ctx = cloudCanvas.getContext("2d")!;
  // Feathered overlapping lobes resemble high, thin cloud banks rather than solid spheres.
  let seed = 1979;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let bank = 0; bank < 24; bank++) {
    const x = random() * 1024,
      y = 65 + random() * 140,
      width = 45 + random() * 100;
    for (let lobe = 0; lobe < 9; lobe++) {
      const px = x + (random() - 0.5) * width,
        py = y + (random() - 0.5) * 17,
        r = 18 + random() * 35;
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(2, 0.5);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      gradient.addColorStop(0, "rgba(255,255,255,.18)");
      gradient.addColorStop(0.55, "rgba(255,255,255,.09)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }
  }
  const cloudMap = new T.CanvasTexture(cloudCanvas);
  cloudMap.wrapS = T.RepeatWrapping;
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      cloudMap: { value: cloudMap },
      sunDirection: { value: new T.Vector3(0.45, 0.68, 0.42).normalize() },
      cloudOffset: { value: 0 },
    },
    vertexShader: `varying vec3 vDirection; varying vec2 vUv; void main(){vDirection=normalize(position);vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform sampler2D cloudMap;uniform vec3 sunDirection;uniform float cloudOffset;varying vec3 vDirection;varying vec2 vUv;
  void main(){vec3 dir=normalize(vDirection);float altitude=clamp(dir.y,0.0,1.0);
  vec3 horizon=vec3(.70,.78,.79);vec3 zenith=vec3(.23,.45,.65);vec3 sky=mix(horizon,zenith,pow(altitude,.45));
  float sunlight=max(0.0,dot(dir,sunDirection));sky+=vec3(1.0,.68,.33)*pow(sunlight,12.0)*.13;sky+=vec3(1.0,.9,.67)*pow(sunlight,800.0)*1.1;
  float clouds=texture2D(cloudMap,vec2(vUv.x+cloudOffset,vUv.y)).a;
  sky=mix(sky,vec3(.95,.94,.89),clouds*.7*smoothstep(-.03,.12,dir.y));
  gl_FragColor=vec4(sky,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  }`,
  });
  const sky = new T.Mesh(new T.SphereGeometry(1, 32, 16), material);
  sky.name = "daylight-sky";
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  scene.add(sky);
  const mountains = new T.Group();
  mountains.name = "distant-horizon";
  for (let layer = 0; layer < 3; layer++) {
    const radius = 435 + layer * 75,
      segments = 96,
      positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const color = new T.Color([0x748379, 0x899894, 0x9aabaa][layer]);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const peak =
        19 +
        layer * 8 +
        Math.pow(Math.sin(a * 3.7 + layer) * 0.5 + 0.5, 2) * 35 +
        Math.sin(a * 11 + layer) * 7;
      for (const y of [-12, peak]) {
        positions.push(Math.sin(a) * radius, y, Math.cos(a) * radius);
        const tint = color.clone().multiplyScalar(y < 0 ? 0.92 : 1.02);
        colors.push(tint.r, tint.g, tint.b);
      }
      if (i < segments) {
        const k = i * 2;
        indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const ridge = new T.Mesh(
      geometry,
      new T.MeshBasicMaterial({
        vertexColors: true,
        side: T.DoubleSide,
        fog: true,
      }),
    );
    ridge.name = "distant-ridge";
    ridge.renderOrder = -999;
    mountains.add(ridge);
  }
  scene.add(mountains);
  // Outdoor environmental reflections for metal/glass, generated once at 64px cube resolution.
  const envCanvas = document.createElement("canvas");
  envCanvas.width = 256;
  envCanvas.height = 128;
  const envCtx = envCanvas.getContext("2d")!;
  const gradient = envCtx.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, "#6b9cc1");
  gradient.addColorStop(0.45, "#c7d6d4");
  gradient.addColorStop(0.55, "#b9b9a0");
  gradient.addColorStop(1, "#4f5840");
  envCtx.fillStyle = gradient;
  envCtx.fillRect(0, 0, 256, 128);
  const sunGlow = envCtx.createRadialGradient(70, 35, 0, 70, 35, 14);
  sunGlow.addColorStop(0, "rgba(255,244,211,1)");
  sunGlow.addColorStop(0.3, "rgba(255,231,185,.9)");
  sunGlow.addColorStop(1, "rgba(255,231,185,0)");
  envCtx.fillStyle = sunGlow;
  envCtx.fillRect(45, 10, 50, 50);
  const envMap = new T.CanvasTexture(envCanvas);
  envMap.mapping = T.EquirectangularReflectionMapping;
  envMap.colorSpace = T.SRGBColorSpace;
  const generator = new T.PMREMGenerator(renderer);
  const environment = generator.fromEquirectangular(envMap);
  generator.dispose();
  envMap.dispose();
  const previousEnvironment = scene.environment;
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.45;
  scene.background = new T.Color(0xb1c6c9);
  scene.fog = new T.FogExp2(0xb1c6c9, 0.0019);
  scene.traverse((object) => {
    if (object instanceof T.HemisphereLight) {
      object.intensity = 0.9;
      object.color.set(0xc8dded);
      object.groundColor.set(0x77754f);
    }
  });
  sun.color.set(0xffe3ba);
  sun.intensity = 3.1;
  sun.shadow.normalBias = 0.035;
  renderer.toneMappingExposure = 0.95;
  const began = typeof performance !== "undefined" ? performance.now() : 0;
  const update = (view: T.PerspectiveCamera) => {
    sky.position.copy(view.position);
    sky.scale.setScalar(view.far * 0.93);
    material.uniforms.cloudOffset.value =
      ((typeof performance !== "undefined" ? performance.now() : 0) - began) *
      0.0000005;
  };
  update(camera);
  return {
    update,
    dispose() {
      disposeObject(sky);
      disposeObject(mountains);
      environment.dispose();
      if (scene.environment === environment.texture)
        scene.environment = previousEnvironment;
    },
  };
}
