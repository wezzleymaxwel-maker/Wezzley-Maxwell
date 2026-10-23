import * as T from "three";
import { World } from "./world";
import { WEAPONS, SafeZone, applyDamage, reloadMagazine } from "./rules";
import { Sound } from "./audio";
import { lineClear, traceShot, prepareWorldQueries } from "./combat";
import "./style.css";
import { batchScenery, disposeObject } from "./rendering";
import { readPreferences, writePreferences } from "./settings";
import { tickTimer, FixedStep } from "./lifecycle";
import { Navigation } from "./navigation";
import {
  createWeapon,
  createArms,
  createOperator,
  animateOperator,
  updateOperatorDetail,
  updateOperatorAppearance,
} from "./models";
import { createSupply } from "./supplies";
import { setupAtmosphere } from "./atmosphere";
import { AdaptiveResolution } from "./performance";
import { gasMaterial } from "./gas-visual";
function bootstrap() {
  const preferences = readPreferences();
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = `<div id="menu"><div class="eyebrow">Operação 01 / Vale do silêncio</div><h1>ÚLTIMA<br><span>ZONA.</span></h1><div class="tag">SINGLE PLAYER · 25 SOBREVIVENTES · UMA CHANCE</div><p>O silêncio não significa segurança.<br>Explore o vale, encontre seu equipamento e seja o último a sair de pé.</p><nav><button class="primary" id="play">Jogar agora ↗</button><button id="custom">Zezé</button><button id="settings">Configurações</button><button id="how">Como jogar</button></nav><div class="footer">VALE DO SILÊNCIO / EDIÇÃO 0.3</div><div class="badge"><strong>24</strong>ADVERSÁRIOS.<br>NENHUM ALIADO.</div></div><div id="hud"><div id="compass"></div><div id="zone"></div><div id="stats"></div><canvas id="radar" width="360" height="360"></canvas><div id="feed"></div><div id="cross">+</div><div id="prompt"></div><div id="vitals"></div><div id="weapon"></div><div id="help">WASD MOVER · SHIFT CORRER · CTRL AGACHAR · E COLETAR · R RECARREGAR · F CURAR · TAB INVENTÁRIO · M MAPA · ESC PAUSA</div></div><div id="scope"></div><div id="overlay"></div>`;
  const $ = (id: string) => document.getElementById(id)!;
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.domElement.className = "game";
  app.prepend(renderer.domElement);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0xa2b7b3);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const scene = new T.Scene();
  scene.background = new T.Color(0x9fb9b7);
  scene.fog = new T.Fog(0x9fb9b7, 160, 650);
  const camera = new T.PerspectiveCamera(
    75,
    innerWidth / innerHeight,
    0.08,
    800,
  );
  camera.rotation.order = "YXZ";
  scene.add(camera);
  scene.add(new T.HemisphereLight(0xc5e4ee, 0x55633d, 2));
  const sun = new T.DirectionalLight(0xffedc5, 3);
  sun.position.set(80, 140, 70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -100,
    right: 100,
    top: 100,
    bottom: -100,
    far: 350,
  });
  sun.shadow.bias = -0.001;
  scene.add(sun, sun.target);
  const world = new World(scene);
  batchScenery(scene);
  prepareWorldQueries(world.solids);
  const atmosphere = setupAtmosphere(scene, renderer, camera, sun);
  const governor = new AdaptiveResolution(
    preferences.quality,
    devicePixelRatio,
  );
  const sound = new Sound();
  const up = new T.Vector3(0, 1, 0);
  const view = new T.Group();
  camera.add(view);
  const gun = (type: number) => createWeapon(type);
  let viewGun = gun(0);
  let arms = createArms(preferences.skin, preferences.outfit);
  view.add(viewGun, arms);
  view.position.set(0.24, -0.25, -0.55);
  view.scale.setScalar(0.72);
  const flash = new T.PointLight(0xffc65e, 0, 7);
  view.add(flash);
  flash.position.set(0, 0, -1);
  const gas = new T.Mesh(
    new T.CylinderGeometry(1, 1, 90, 96, 1, true),
    gasMaterial(),
  );
  scene.add(gas);
  type State =
    | "explorar"
    | "saquear"
    | "investigar"
    | "procurar"
    | "atacar"
    | "cobertura"
    | "recuar"
    | "curar"
    | "gas"
    | "reposicionar";
  type Actor = {
    id: number;
    name: string;
    pos: T.Vector3;
    hp: number;
    armor: number;
    alive: boolean;
    weapon: number;
    mag: number[];
    reserve: number[];
    owned: boolean[];
    meds: number;
    kills: number;
    damage: number;
    model?: T.Group;
    legs?: T.Mesh[];
    yaw: number;
    pitch: number;
    cool: number;
    reload: number;
    heal: number;
    tier: number;
    personality: number;
    state: State;
    goal: T.Vector3;
    memory?: T.Vector3;
    memoryTime: number;
    perceive: number;
    target?: Actor;
    reaction: number;
    stuck: number;
    previous: T.Vector3;
    previousYaw: number;
    moving: boolean;
  };
  let actors: Actor[] = [],
    player: Actor,
    zone = new SafeZone(),
    running = false,
    paused = false,
    elapsed = 0,
    last = performance.now(),
    yaw = 0,
    pitch = 0,
    vy = 0,
    grounded = true,
    ads = false,
    trigger = false,
    semi = false,
    bob = 0,
    recoil = 0,
    hitTime = 0,
    hurtTime = 0,
    feed: string[] = [],
    sensitivity = preferences.sensitivity,
    quality = preferences.quality,
    mapOpen = false;
  const simulation = new FixedStep();
  let contextLost = false,
    failed = false,
    portraitCleanup: (() => void) | undefined;
  const keys = new Set<string>();
  let loot: { pos: T.Vector3; type: number; ammo: number; mesh: T.Group }[] =
    [];
  let noises: { pos: T.Vector3; life: number; range: number }[] = [];
  const effects: { mesh: T.Object3D; life: number }[] = [];
  function clearInput() {
    keys.clear();
    trigger = false;
    semi = false;
    ads = false;
    vx = 0;
    vz = 0;
  }
  function lockMouse() {
    try {
      const request = renderer.domElement.requestPointerLock();
      if (request) void request.catch(lockDenied);
    } catch {
      lockDenied();
    }
  }
  function lockDenied() {
    if (!running) return;
    pause();
    const p = document.createElement("p");
    p.textContent =
      "Clique em Continuar para liberar o mouse. Se o navegador bloquear, permita a captura de mouse ou reabra o jogo em Chrome, Edge ou Firefox.";
    document.querySelector("#overlay .panel")?.append(p);
  }
  function actor(id: number, pos: T.Vector3): Actor {
    return {
      id,
      name: id === 0 ? "Zezé" : `Operador ${String(id).padStart(2, "0")}`,
      pos: pos.clone(),
      hp: 100,
      armor: id === 0 ? 0 : 30,
      alive: true,
      weapon: 0,
      mag: WEAPONS.map((w) => w.mag),
      reserve: WEAPONS.map((w) => w.mag * 2),
      owned: WEAPONS.map((_, i) => i === 0),
      meds: 2,
      kills: 0,
      damage: 0,
      yaw: 0,
      pitch: 0,
      cool: 0,
      reload: 0,
      heal: 0,
      tier: id <= 8 ? 0 : id <= 18 ? 1 : 2,
      personality: id % 6,
      state: "explorar",
      goal: pos.clone(),
      memoryTime: 0,
      perceive: 0,
      reaction: 0,
      stuck: 0,
      previous: pos.clone(),
      previousYaw: 0,
      moving: false,
    };
  }
  function model(a: Actor) {
    const g = createOperator({
      skin:
        a.id === 0
          ? preferences.skin
          : ["#9c7352", "#be9473", "#74543e"][a.id % 3],
      outfit:
        a.id === 0
          ? preferences.outfit
          : ["#58654e", "#6b6652", "#475b55"][a.tier],
      weapon: a.weapon,
    });
    g.position.copy(a.pos);
    g.userData.equippedWeapon = a.weapon;
    scene.add(g);
    a.model = g;
  }
  function randomPoint() {
    for (let i = 0; i < 100; i++) {
      const p = new T.Vector3(
        (Math.random() - 0.5) * 590,
        0,
        (Math.random() - 0.5) * 590,
      );
      p.y = world.ground(p.x, p.z);
      if (
        !world.boxes.some(
          (b) =>
            p.x > b.minX - 0.6 &&
            p.x < b.maxX + 0.6 &&
            p.z > b.minZ - 0.6 &&
            p.z < b.maxZ + 0.6,
        )
      )
        return p;
    }
    return new T.Vector3(0, world.ground(0, 0), 0);
  }
  function addLoot(
    pos: T.Vector3,
    type: number,
    ammo = WEAPONS[type]?.mag ?? 0,
  ) {
    const g = new T.Group();
    const colors = [
      0xe2be63, 0xe2be63, 0xe2be63, 0xe2be63, 0xe2be63, 0x9fc8d2, 0xe47e6a,
      0x8cb3d6, 0xb4d67d,
    ];
    if (type < 5) {
      const w = gun(type);
      w.rotation.z = Math.PI / 2;
      g.add(w);
    } else g.add(createSupply(type));
    const marker = new T.Mesh(
      new T.RingGeometry(0.18, 0.21, 24),
      new T.MeshBasicMaterial({ color: colors[type] }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = -0.15;
    g.add(marker);
    g.position.copy(pos);
    scene.add(g);
    loot.push({ pos: pos.clone(), type, ammo, mesh: g });
  }
  function start() {
    for (const a of actors) if (a.model) disposeObject(a.model);
    for (const l of loot) disposeObject(l.mesh);
    for (const e of effects) disposeObject(e.mesh);
    effects.length = 0;
    loot = [];
    actors = [];
    noises = [];
    zone = new SafeZone();
    elapsed = 0;
    feed = [];
    yaw = Math.PI;
    pitch = 0;
    vy = 0;
    vx = 0;
    vz = 0;
    paths.clear();
    navTimers.clear();
    directPaths.clear();
    keys.clear();
    clearInput();
    grounded = true;
    bob = 0;
    recoil = 0;
    hitTime = 0;
    hurtTime = 0;
    hudTimer = 0;
    footTimer = 0;
    flash.intensity = 0;
    camera.fov = 75;
    simulation.reset();
    player = actor(0, new T.Vector3(-12, world.ground(-12, 12), 12));
    actors.push(player);
    for (let i = 1; i <= 24; i++) {
      let p = randomPoint();
      const overlaps = (point: T.Vector3) =>
        zone.outside(point.x, point.z) ||
        actors.some(
          (other) =>
            Math.hypot(point.x - other.pos.x, point.z - other.pos.z) <
            (other === player ? 120 : 35),
        );
      for (let attempt = 0; attempt < 200 && overlaps(p); attempt++)
        p = randomPoint();
      const a = actor(i, p);
      a.weapon = i % 5;
      a.owned[a.weapon] = true;
      a.goal = randomPoint();
      a.perceive = (i % 8) * 0.04;
      model(a);
      actors.push(a);
    }
    world.lootPoints.forEach((p) => addLoot(p, Math.floor(Math.random() * 9)));
    for (let i = 0; i < 5; i++)
      addLoot(player.pos.clone().add(new T.Vector3((i - 2) * 1.5, 0.35, 3)), i);
    running = true;
    paused = false;
    $("menu").style.display = "none";
    $("overlay").style.display = "none";
    $("hud").style.display = "block";
    equip(0);
    sound.play(5);
    lockMouse();
  }
  function equip(i: number) {
    if (!player.owned[i]) return;
    player.weapon = i;
    player.reload = 0;
    disposeObject(viewGun);
    viewGun = gun(i);
    disposeObject(arms);
    arms = createArms(preferences.skin, preferences.outfit, i);
    view.add(viewGun, arms);
    recoil = 0.025;
  }
  function panel(html: string) {
    portraitCleanup?.();
    portraitCleanup = undefined;
    $("overlay").innerHTML = `<div class="panel">${html}</div>`;
    $("overlay").style.display = "flex";
  }
  function pause() {
    if (!running) return;
    paused = true;
    clearInput();
    simulation.reset();
    document.exitPointerLock();
    panel(
      '<small>Operação suspensa</small><h2>Pausa</h2><button class="primary" id="resume">Continuar</button><button id="opts">Configurações</button><button id="restart">Reiniciar partida</button><button id="exit">Voltar ao menu</button>',
    );
    $("resume").onclick = resume;
    $("opts").onclick = settings;
    $("restart").onclick = start;
    $("exit").onclick = menu;
  }
  function resume() {
    if (!running || contextLost) return;
    clearInput();
    simulation.reset();
    last = performance.now();
    paused = false;
    mapOpen = false;
    $("overlay").style.display = "none";
    lockMouse();
  }
  function menu() {
    clearInput();
    simulation.reset();
    running = false;
    paused = false;
    document.exitPointerLock();
    $("menu").style.display = "flex";
    camera.position.set(18, 12, 117);
    camera.lookAt(0, 3, 74);
    $("hud").style.display = "none";
    $("overlay").style.display = "none";
    $("scope").style.display = "none";
  }
  function settings() {
    panel(
      `<h2>Configurações</h2><label>Sensibilidade <input id="sens" type="range" min="0.0005" max="0.006" step="0.0001" value="${sensitivity}"></label><label>Volume <input id="volume" type="range" min="0" max="1" step=".05" value="${sound.volume}"></label><label>Qualidade <select id="quality"><option value="baixo">Baixo</option><option value="medio">Médio</option><option value="alto">Alto</option></select></label><p>Baixo reduz sombras e vegetação decorativa. A resolução se ajusta ao desempenho durante a partida.</p><button id="back">Concluir</button>`,
    );
    ($("quality") as HTMLSelectElement).value = quality;
    $("back").onclick = () => {
      sensitivity = +($("sens") as HTMLInputElement).value;
      sound.volume = +($("volume") as HTMLInputElement).value;
      quality = ($("quality") as HTMLSelectElement).value as typeof quality;
      Object.assign(preferences, {
        sensitivity,
        volume: sound.volume,
        quality,
      });
      applyPreferences();
      writePreferences(preferences);
      running ? pause() : ($("overlay").style.display = "none");
    };
  }
  $("play").onclick = start;
  $("settings").onclick = settings;
  $("how").onclick = () => {
    panel(
      '<small>Manual de campo</small><h2>Sobreviva ao vale.</h2><p>25 participantes. Uma vida. Explore as construções e colete armas com E. O gás fecha em seis fases: acompanhe o mapa e alcance o próximo círculo. Os operadores escutam disparos, mas precisam de linha de visão para acertar.</p><p>WASD mover · Mouse olhar · Clique atirar · Botão direito mirar · Shift correr · Ctrl agachar · Espaço pular · R recarregar · E coletar · F curar · 1–5 armas · Tab inventário · M mapa · Esc pausa.</p><button id="close">Entendi</button>',
    );
    $("close").onclick = () => {
      $("overlay").style.display = "none";
    };
  };
  $("custom").onclick = () => {
    panel(
      `<small>Operador / Zezé</small><h2>Personalização</h2><p>Escolha as cores de Zezé.</p><label>Uniforme e luvas <input id="outfit" type="color" value="${preferences.outfit}"></label><label>Pele <input id="skin" type="color" value="${preferences.skin}"></label><canvas id="portrait" width="260" height="260"></canvas><button id="done">Salvar</button>`,
    );
    const s = new T.Scene();
    s.background = new T.Color(0x25352c);
    s.add(new T.HemisphereLight(0xffffff, 0x334433, 3));
    const a = actor(0, new T.Vector3());
    model(a);
    s.add(a.model!);
    s.environment = scene.environment;
    s.environmentIntensity = 0.5;
    const portraitLight = new T.DirectionalLight(0xffe5ca, 2);
    portraitLight.position.set(-2, 4, 3);
    s.add(portraitLight);
    const c = new T.PerspectiveCamera(40, 1, 0.1, 20);
    c.position.set(1.2, 1.18, 2.4);
    c.lookAt(0, 0.98, 0);
    const r = new T.WebGLRenderer({
      canvas: $("portrait") as HTMLCanvasElement,
      antialias: true,
    });
    r.setSize(260, 260);
    const preview = () => {
      const cloth = ($("outfit") as HTMLInputElement).value,
        skin = ($("skin") as HTMLInputElement).value;
      updateOperatorAppearance(a.model!, skin, cloth);
      r.render(s, c);
    };
    preview();
    $("outfit").oninput = preview;
    $("skin").oninput = preview;
    portraitCleanup = () => {
      disposeObject(a.model!);
      r.dispose();
      r.forceContextLoss();
    };
    $("done").onclick = () => {
      preferences.outfit = ($("outfit") as HTMLInputElement).value;
      preferences.skin = ($("skin") as HTMLInputElement).value;
      updateOperatorAppearance(arms, preferences.skin, preferences.outfit);
      writePreferences(preferences);
      portraitCleanup?.();
      portraitCleanup = undefined;
      $("overlay").style.display = "none";
    };
  };
  function applyPreferences() {
    renderer.setPixelRatio(governor.setQuality(quality, devicePixelRatio));
    world.setQuality(quality);
    renderer.shadowMap.enabled = quality !== "baixo";
    renderer.shadowMap.needsUpdate = true;
    camera.far = quality === "baixo" ? 420 : quality === "medio" ? 650 : 800;
    sun.shadow.mapSize.set(
      quality === "alto" ? 2048 : 1024,
      quality === "alto" ? 2048 : 1024,
    );
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    camera.updateProjectionMatrix();
    sound.volume = preferences.volume;
  }
  applyPreferences();
  function reload(a: Actor) {
    if (
      !a.alive ||
      !a.owned[a.weapon] ||
      a.reload > 0 ||
      a.heal > 0 ||
      a.mag[a.weapon] >= WEAPONS[a.weapon].mag ||
      a.reserve[a.weapon] <= 0
    )
      return;
    a.reload = WEAPONS[a.weapon].reload;
    if (a === player) sound.play(6);
  }
  function heal(a: Actor) {
    if (a.meds > 0 && a.hp < 100 && !a.heal) {
      a.heal = 3;
      a.reload = 0;
      if (a === player) sound.play(6);
    }
  }
  function damage(a: Actor, amount: number, source?: Actor) {
    if (!a.alive) return;
    const oldHp = a.hp;
    const result = applyDamage(a.hp, a.armor, amount, !source);
    a.hp = result.health;
    a.armor = result.armor;
    if (source) {
      source.damage += oldHp - a.hp;
      if (source === player) hitTime = 0.16;
    }
    if (a === player) hurtTime = 0.25;
    if (a.hp <= 0) {
      a.hp = 0;
      a.alive = false;
      a.reload = 0;
      a.heal = 0;
      if (source) source.kills++;
      if (a.model) {
        a.model.rotation.z = Math.PI / 2;
        a.model.position.y += 0.25;
      }
      addLoot(
        a.pos.clone().add(new T.Vector3(0, 0.25, 0)),
        a.weapon,
        a.mag[a.weapon],
      );
      addLoot(a.pos.clone().add(new T.Vector3(0.5, 0.25, 0)), 5);
      feed.unshift(`${source?.name ?? "Gás"} ▸ ${a.name}`);
      feed = feed.slice(0, 5);
      if (a === player) end(false);
      else if (
        running &&
        actors.filter((b) => b.alive).length === 1 &&
        player.alive
      )
        end(true);
    }
  }
  function end(won: boolean) {
    if (!running) return;
    clearInput();
    simulation.reset();
    running = false;
    paused = false;
    document.exitPointerLock();
    $("scope").style.display = "none";
    const alive = actors.filter((a) => a.alive).length;
    panel(
      `<small>${won ? "Extração concluída" : "Operador eliminado"}</small><h2>${won ? "ÚLTIMO SOBREVIVENTE." : "FIM DA OPERAÇÃO."}</h2><p>Posição #${won ? 1 : alive + 1} / 25<br>${player.kills} eliminações · ${Math.floor(player.damage)} de dano<br>Sobrevivência ${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s</p><p>${feed.join("<br>")}</p><button class="primary" id="again">Jogar novamente</button><button id="home">Menu</button>`,
    );
    $("again").onclick = start;
    $("home").onclick = menu;
  }
  function visible(from: T.Vector3, to: T.Vector3) {
    return lineClear(from, to, world.solids);
  }
  function shoot(a: Actor) {
    const w = WEAPONS[a.weapon];
    if (
      !running ||
      !a.alive ||
      a.cool > 0 ||
      a.reload > 0 ||
      a.heal > 0 ||
      !a.owned[a.weapon]
    )
      return;
    if (a.mag[a.weapon] <= 0) {
      reload(a);
      return;
    }
    a.mag[a.weapon]--;
    a.cool = w.interval;
    const origin = a.pos
      .clone()
      .add(
        new T.Vector3(
          0,
          a === player ? (keys.has("ControlLeft") ? 1.05 : 1.65) : 1.55,
          0,
        ),
      );
    noises.push({
      pos: a.pos.clone(),
      life: 1.5,
      range: a.weapon === 4 ? 220 : 140,
    });
    sound.play(
      a.weapon,
      player.pos.distanceTo(a.pos),
      Math.sin(
        Math.atan2(-(a.pos.x - player.pos.x), -(a.pos.z - player.pos.z)) - yaw,
      ),
    );
    if (a === player) {
      recoil += w.recoil;
      flash.intensity = 3;
      pitch = Math.max(-1.5, pitch - w.recoil * 0.4);
    }
    let direction = new T.Vector3();
    if (a === player) camera.getWorldDirection(direction);
    else if (a.target)
      direction
        .copy(a.target.pos)
        .add(new T.Vector3(0, 1.25, 0))
        .sub(origin)
        .normalize();
    else return;
    for (let i = 0; i < w.pellets && running; i++) {
      const spread =
        w.spread *
        (a === player ? (ads ? 0.4 : 1) : 2.8 - a.tier * 0.65) *
        (1 + (a === player ? recoil * 6 : 0));
      const dir = direction
        .clone()
        .add(
          new T.Vector3(
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread,
          ),
        )
        .normalize();
      const result = traceShot(
        origin,
        dir,
        w.range,
        world.solids,
        actors
          .filter((b) => b !== a && b.alive)
          .map((b) => ({
            id: b.id,
            pos: b.pos,
            crouched: b === player && keys.has("ControlLeft"),
          })),
      );
      const max = result.distance,
        hit = actors.find((b) => b.id === result.targetId),
        head = result.head;
      const dest = origin.clone().addScaledVector(dir, max);
      if (a === player || a.pos.distanceToSquared(player.pos) < 160 * 160) {
        const line = new T.Line(
          new T.BufferGeometry().setFromPoints([origin, dest]),
          new T.LineBasicMaterial({
            color: 0xffd899,
            transparent: true,
            opacity: 0.6,
          }),
        );
        if (effects.length >= 128) {
          const oldest = effects.shift();
          if (oldest) disposeObject(oldest.mesh);
        }
        scene.add(line);
        effects.push({ mesh: line, life: 0.065 });
      }
      if (hit) {
        const fall =
          a.weapon === 1
            ? Math.max(0.12, 1 - max / 65)
            : Math.max(0.45, 1 - max / (w.range * 2));
        damage(hit, w.damage * fall * (head ? 1.8 : 1), a);
      } else if (
        max < w.range &&
        dest.distanceToSquared(player.pos) < 110 * 110
      ) {
        const mark = new T.Mesh(
          new T.SphereGeometry(0.055, 4, 4),
          new T.MeshBasicMaterial({ color: 0xffcf8a }),
        );
        mark.position.copy(dest);
        scene.add(mark);
        effects.push({ mesh: mark, life: 0.3 });
      }
    }
  }
  function collect(a: Actor, index: number) {
    const l = loot[index];
    if (!l) return;
    if (l.type < 5) {
      if (a.owned[l.type]) a.reserve[l.type] += l.ammo;
      else a.mag[l.type] = l.ammo;
      a.owned[l.type] = true;
      if (a !== player) {
        a.weapon = l.type;
        a.reload = 0;
      } else equip(l.type);
    } else if (l.type === 5)
      a.reserve = a.reserve.map((n, i) => n + WEAPONS[i].mag);
    else if (l.type === 6) a.meds++;
    else if (l.type === 7) a.armor = 100;
    else {
      a.meds += 2;
    }
    disposeObject(l.mesh);
    loot.splice(index, 1);
    if (a === player) sound.play(5);
  }
  function inventory() {
    paused = true;
    clearInput();
    simulation.reset();
    document.exitPointerLock();
    panel(
      `<h2>Equipamento de Zezé</h2><div class="slots">${WEAPONS.map((w, i) => `<div class="slot">${i + 1}. ${w.name}<p>${player.owned[i] ? `${player.mag[i]} / ${player.reserve[i]}` : "Não encontrado"}</p>${player.owned[i] ? `<button data-drop="${i}">Descartar</button>` : ""}</div>`).join("")}</div><p>${player.meds} kits de cura · Colete ${Math.ceil(player.armor)}</p><button id="return">Voltar</button>`,
    );
    document.querySelectorAll<HTMLButtonElement>("[data-drop]").forEach(
      (b) =>
        (b.onclick = () => {
          const i = +b.dataset.drop!;
          if (!player.owned[i]) return;
          player.owned[i] = false;
          player.reload = 0;
          const transferredAmmo = player.mag[i];
          player.mag[i] = 0;
          addLoot(
            player.pos.clone().add(new T.Vector3(1, 0.3, 0)),
            i,
            transferredAmmo,
          );
          const next = player.owned.findIndex(Boolean);
          if (next >= 0) equip(next);
          inventory();
        }),
    );
    $("return").onclick = resume;
  }
  function showMap() {
    paused = true;
    clearInput();
    simulation.reset();
    mapOpen = true;
    document.exitPointerLock();
    panel(
      '<h2>Mapa tático</h2><canvas id="bigmap" width="600" height="600" style="width:min(65vh,80vw);height:auto"></canvas><p>Você: branco · Área atual: verde · Próxima zona: tracejada. Inimigos não são revelados.</p><button id="return">Voltar</button>',
    );
    drawMap($("bigmap") as HTMLCanvasElement);
    $("return").onclick = resume;
  }
  const hudHTML = new Map<string, string>();
  function setHTML(id: string, html: string) {
    if (hudHTML.get(id) === html) return;
    hudHTML.set(id, html);
    $(id).innerHTML = html;
  }
  let mapBackground: HTMLCanvasElement | undefined;
  function drawMap(canvas: HTMLCanvasElement) {
    const c = canvas.getContext("2d")!,
      size = canvas.width,
      s = size / 700,
      px = (x: number) => (x + 350) * s;
    if (!mapBackground) {
      mapBackground = document.createElement("canvas");
      mapBackground.width = mapBackground.height = 700;
      const base = mapBackground.getContext("2d")!;
      base.fillStyle = "#233b30";
      base.fillRect(0, 0, 700, 700);
      base.strokeStyle = "#54705a";
      for (let i = 0; i < 700; i += 50) {
        base.beginPath();
        base.moveTo(i, 0);
        base.lineTo(i, 700);
        base.moveTo(0, i);
        base.lineTo(700, i);
        base.stroke();
      }
      base.fillStyle = "#728071";
      for (const b of world.boxes)
        base.fillRect(
          b.minX + 350,
          b.minZ + 350,
          b.maxX - b.minX,
          b.maxZ - b.minZ,
        );
      base.fillStyle = "#c6ceab";
      base.font = "bold 10px sans-serif";
      base.textAlign = "center";
      for (const r of world.regions)
        base.fillText(r.name, r.x + 350, r.z + 350);
    }
    c.clearRect(0, 0, size, size);
    c.drawImage(mapBackground, 0, 0, size, size);
    c.strokeStyle = "#cbe76c";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(px(zone.x), px(zone.z), zone.radius * s, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([5, 5]);
    c.strokeStyle = "#e9eee0";
    c.beginPath();
    c.arc(px(zone.nextX), px(zone.nextZ), zone.nextRadius * s, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.save();
    c.translate(px(player.pos.x), px(player.pos.z));
    c.rotate(-yaw);
    c.fillStyle = "white";
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(-4, 5);
    c.lineTo(4, 5);
    c.closePath();
    c.fill();
    c.restore();
  }
  window.addEventListener("keydown", (e) => {
    if (["Tab", "Space", "ControlLeft", "KeyM"].includes(e.code))
      e.preventDefault();
    if (e.repeat) return;
    if (e.code === "Escape") {
      if (running) {
        if (!paused) pause();
      }
      return;
    }
    if (!running || paused) return;
    keys.add(e.code);
    if (e.code === "KeyR") reload(player);
    if (e.code === "KeyF") heal(player);
    if (e.code === "Tab") inventory();
    if (e.code === "KeyM") showMap();
    if (e.code.startsWith("Digit")) {
      const i = +e.code.slice(-1) - 1;
      if (i >= 0 && i < 5) equip(i);
    }
    if (e.code === "KeyE") {
      let nearest = -1,
        dist = 3;
      loot.forEach((l, i) => {
        const d = l.pos.distanceTo(camera.position);
        if (d < dist) {
          dist = d;
          nearest = i;
        }
      });
      if (
        nearest >= 0 &&
        visible(
          player.pos.clone().add(new T.Vector3(0, 1.4, 0)),
          loot[nearest].pos,
        )
      )
        collect(player, nearest);
    }
    if (e.code === "Space" && grounded) {
      vy = 6;
      grounded = false;
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  document.addEventListener("mousemove", (e) => {
    if (
      running &&
      !paused &&
      document.pointerLockElement === renderer.domElement
    ) {
      yaw -= e.movementX * sensitivity;
      pitch = T.MathUtils.clamp(pitch - e.movementY * sensitivity, -1.5, 1.5);
    }
  });
  window.addEventListener("mousedown", (e) => {
    if (
      !running ||
      paused ||
      document.pointerLockElement !== renderer.domElement
    )
      return;
    if (e.button === 0) {
      trigger = true;
      semi = true;
    }
    if (e.button === 2) ads = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) trigger = false;
    if (e.button === 2) ads = false;
  });
  window.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("pointerlockerror", lockDenied);
  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement && running && !paused) pause();
  });
  window.addEventListener("blur", () => {
    if (running && !paused) pause();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && running && !paused) pause();
  });
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    contextLost = true;
    if (running) pause();
    panel(
      '<h2>Gráficos interrompidos</h2><p>A conexão com a placa gráfica foi interrompida. Aguarde a restauração ou recarregue a página.</p><button id="restore">Reabrir jogo</button>',
    );
    $("restore").onclick = () => location.reload();
  });
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    last = performance.now();
    running ? pause() : menu();
  });
  window.addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });
  const paths = new Map<number, T.Vector3[]>(),
    navTimers = new Map<number, number>();
  const directPaths = new Map<
    number,
    { goal: T.Vector3; direct: boolean; time: number }
  >();
  let navigationBudget = 2;
  const navigation = new Navigation(
    world.boxes.filter(
      (b) =>
        (b.minY ?? 0) <
        world.ground((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2) + 1.65,
    ),
  );
  function walk(
    a: Actor,
    goal: T.Vector3,
    speed: number,
    dt: number,
    faceMovement = true,
  ) {
    const dist = a.pos.distanceTo(goal);
    if (dist < 1) return;
    let path = paths.get(a.id);
    let timer = (navTimers.get(a.id) ?? 0) - dt;
    let cached = directPaths.get(a.id);
    if (cached) cached.time -= dt;
    if (
      !cached ||
      cached.time <= 0 ||
      cached.goal.distanceToSquared(goal) > 9 ||
      a.stuck > 0.5
    ) {
      cached = {
        goal: goal.clone(),
        direct: navigation.canTraverse(a.pos, goal),
        time: 0.4 + (a.id % 3) * 0.03,
      };
      directPaths.set(a.id, cached);
    }
    const direct = cached.direct;
    if (!direct && timer <= 0 && navigationBudget > 0) {
      navigationBudget--;
      path = navigation.route(a.pos, goal);
      paths.set(a.id, path);
      timer = 2 + Math.random();
    }
    navTimers.set(a.id, timer);
    let target = direct ? goal : (path?.[0] ?? goal);
    if (
      a.pos.distanceTo(new T.Vector3(target.x, a.pos.y, target.z)) < 0.45 &&
      path?.length
    ) {
      path.shift();
      target = path[0] ?? goal;
    }
    const delta = new T.Vector3(target.x - a.pos.x, 0, target.z - a.pos.z)
      .normalize()
      .multiplyScalar(speed * dt);
    const p = world.move(a.pos, delta);
    const moved = p.distanceTo(a.pos);
    a.moving = moved > dt * 0.2;
    a.stuck = moved < dt * 0.2 ? a.stuck + dt : 0;
    if (a.stuck > 1) {
      a.goal = randomPoint();
      paths.delete(a.id);
      a.stuck = 0;
    }
    a.pos.copy(p);
    a.pos.y = world.ground(a.pos.x, a.pos.z);
    if (moved > 0.001 && faceMovement) {
      const want = Math.atan2(-delta.x, -delta.z);
      a.yaw += T.MathUtils.clamp(
        T.MathUtils.euclideanModulo(want - a.yaw + Math.PI, Math.PI * 2) -
          Math.PI,
        -dt * 4,
        dt * 4,
      );
    }
  }
  function bot(a: Actor, dt: number) {
    if (!a.alive) return;
    a.perceive -= dt;
    a.memoryTime -= dt;
    a.reaction = Math.max(0, a.reaction - dt);
    const eye = a.pos.clone().add(new T.Vector3(0, 1.55, 0));
    if (a.perceive <= 0) {
      a.perceive = 0.24 + Math.random() * 0.18;
      let found: Actor | undefined,
        closest = 140;
      for (const b of actors) {
        if (a === b || !b.alive) continue;
        const d = a.pos.distanceTo(b.pos);
        if (d > closest || d > (a.tier === 2 ? 135 : 105)) continue;
        const dir = b.pos.clone().sub(a.pos).normalize();
        const forward = new T.Vector3(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
        if (d > 2.5 && forward.dot(dir) < 0.35) continue;
        const targetEye = b.pos
          .clone()
          .add(
            new T.Vector3(
              0,
              b === player && keys.has("ControlLeft") ? 1 : 1.5,
              0,
            ),
          );
        if (visible(eye, targetEye)) {
          closest = d;
          found = b;
        }
      }
      if (found) {
        if (a.target !== found)
          a.reaction = [0.95, 0.6, 0.32][a.tier] + Math.random() * 0.3;
        a.target = found;
        a.memory = found.pos.clone();
        a.memoryTime = 6;
      } else {
        a.target = undefined;
        const noise = noises.find((n) => a.pos.distanceTo(n.pos) < n.range);
        if (noise) {
          a.memory = noise.pos
            .clone()
            .add(
              new T.Vector3(
                (Math.random() - 0.5) * 18,
                0,
                (Math.random() - 0.5) * 18,
              ),
            );
          a.memoryTime = 5;
          a.state = "investigar";
        }
      }
    }
    if (
      zone.outside(a.pos.x, a.pos.z) ||
      (Math.hypot(a.pos.x - zone.nextX, a.pos.z - zone.nextZ) >
        zone.nextRadius &&
        zone.time < 30)
    ) {
      a.state = "gas";
      a.goal.set(zone.nextX, 0, zone.nextZ);
      walk(a, a.goal, 5.2, dt);
      return;
    }
    if (
      a.hp < 38 &&
      a.meds &&
      (!a.target || a.pos.distanceTo(a.target.pos) > 35)
    ) {
      a.state = "curar";
      heal(a);
      return;
    }
    if (a.target?.alive) {
      const t = a.target,
        d = a.pos.distanceTo(t.pos);
      if (
        !visible(
          eye,
          t.pos
            .clone()
            .add(
              new T.Vector3(
                0,
                t === player && keys.has("ControlLeft") ? 1 : 1.3,
                0,
              ),
            ),
        )
      ) {
        a.target = undefined;
        a.state = "investigar";
        if (a.memory) walk(a, a.memory, 3.2, dt);
        return;
      }
      a.state = a.hp < 30 ? "recuar" : "atacar";
      const wanted = Math.atan2(-(t.pos.x - a.pos.x), -(t.pos.z - a.pos.z));
      a.yaw += T.MathUtils.clamp(
        T.MathUtils.euclideanModulo(wanted - a.yaw + Math.PI, Math.PI * 2) -
          Math.PI,
        -dt * 3,
        dt * 3,
      );
      if (
        a.reaction <= 0 &&
        Math.abs(
          T.MathUtils.euclideanModulo(wanted - a.yaw + Math.PI, Math.PI * 2) -
            Math.PI,
        ) < 0.22
      )
        shoot(a);
      if (a.mag[a.weapon] === 0) reload(a);
      if (a.reserve[a.weapon] === 0 && a.mag[a.weapon] === 0) {
        const other = a.owned.findIndex(
          (v, i) => v && a.mag[i] + a.reserve[i] > 0,
        );
        if (other >= 0) {
          a.weapon = other;
          a.reload = 0;
        }
      }
      const desired = a.weapon === 1 ? 13 : a.weapon === 4 ? 85 : 38;
      const flank = new T.Vector3(
        t.pos.x + Math.cos(elapsed * 0.2 + a.id) * desired,
        0,
        t.pos.z + Math.sin(elapsed * 0.2 + a.id) * desired,
      );
      if (d < 12 || a.hp < 30) {
        flank
          .copy(a.pos)
          .add(a.pos.clone().sub(t.pos).normalize().multiplyScalar(15));
        a.state = "recuar";
      } else if (a.reload) {
        a.state = "cobertura";
        const cover = world.boxes.find(
          (b) =>
            Math.hypot(
              (b.minX + b.maxX) / 2 - a.pos.x,
              (b.minZ + b.maxZ) / 2 - a.pos.z,
            ) < 10,
        );
        if (cover) flank.set(cover.maxX + 1, 0, cover.maxZ + 1);
      }
      walk(a, flank, a.tier === 0 ? 2.1 : 3.4, dt, false);
      return;
    }
    if (a.memory && a.memoryTime > 0) {
      a.state = "investigar";
      walk(a, a.memory, 3.2, dt);
      return;
    }
    let nearest = -1,
      distance = 25;
    loot.forEach((l, i) => {
      const d = l.pos.distanceTo(a.pos);
      if (d < distance) {
        nearest = i;
        distance = d;
      }
    });
    if (nearest >= 0) {
      a.state = "saquear";
      if (
        eye.distanceTo(loot[nearest].pos) < 2.5 &&
        visible(eye, loot[nearest].pos)
      )
        collect(a, nearest);
      else walk(a, loot[nearest].pos, 3.3, dt);
    } else {
      a.state = "explorar";
      if (a.pos.distanceTo(a.goal) < 5 || a.stuck > 1) a.goal = randomPoint();
      walk(a, a.goal, 3.1 + (a.personality === 0 ? 0.5 : 0), dt);
    }
  }
  let vx = 0,
    vz = 0,
    hudTimer = 0,
    footTimer = 0;
  function update(dt: number) {
    for (const actor of actors) {
      actor.previous.copy(actor.pos);
      actor.previousYaw = actor.yaw;
      actor.moving = false;
    }
    elapsed += dt;
    const oldState = zone.state;
    zone.update(dt);
    if (zone.state !== oldState) sound.play(7);
    gas.position.set(zone.x, 35, zone.z);
    gas.scale.set(Math.max(0.01, zone.radius), 1, Math.max(0.01, zone.radius));
    for (const a of actors) {
      if (!a.alive) continue;
      a.cool = Math.max(0, a.cool - dt);
      if (a.reload > 0) {
        a.reload = tickTimer(a.reload, dt);
        if (a.reload <= 0) {
          const w = a.weapon,
            result = reloadMagazine(a.mag[w], a.reserve[w], WEAPONS[w].mag);
          a.mag[w] = result.loaded;
          a.reserve[w] = result.reserve;
        }
      }
      if (a.heal > 0) {
        a.heal = tickTimer(a.heal, dt);
        if (a.heal <= 0) {
          a.hp = Math.min(100, a.hp + 60);
          a.meds--;
        }
      }
      if (zone.outside(a.pos.x, a.pos.z)) damage(a, zone.damage * dt);
      if (!running) return;
    }
    if (!running) return;
    const crouch = keys.has("ControlLeft"),
      speed = ads ? 2.2 : crouch ? 2.5 : keys.has("ShiftLeft") ? 7 : 4.5;
    const direction = new T.Vector3(
      Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
      0,
      Number(keys.has("KeyS")) - Number(keys.has("KeyW")),
    )
      .normalize()
      .applyAxisAngle(up, yaw);
    const smooth = 1 - Math.exp(-dt * 12);
    vx = T.MathUtils.lerp(vx, direction.x * speed, smooth);
    vz = T.MathUtils.lerp(vz, direction.z * speed, smooth);
    vy -= 17 * dt;
    const expectedY = player.pos.y + vy * dt;
    const moved = world.move(
      player.pos,
      new T.Vector3(vx * dt, vy * dt, vz * dt),
      0.4,
      crouch ? 1.05 : 1.65,
    );
    if (Math.abs(moved.y - expectedY) > 0.001) {
      grounded = vy < 0;
      vy = 0;
    } else grounded = false;
    player.pos.copy(moved);
    const ground = world.ground(player.pos.x, player.pos.z);
    if (player.pos.y <= ground + 0.04) {
      player.pos.y = ground;
      vy = 0;
      grounded = true;
    }
    bob += dt * Math.hypot(vx, vz) * 2;
    camera.position
      .copy(player.pos)
      .add(new T.Vector3(0, crouch ? 1.05 : 1.65, 0));
    camera.position.y +=
      Math.sin(bob) * 0.025 * Math.min(1, Math.hypot(vx, vz));
    camera.rotation.set(pitch, yaw, 0);
    player.yaw = yaw;
    camera.fov = T.MathUtils.lerp(
      camera.fov,
      ads ? (player.weapon === 4 ? 24 : 52) : 75,
      dt * 10,
    );
    camera.updateProjectionMatrix();
    view.visible = player.owned[player.weapon] && !(ads && player.weapon === 4);
    view.position.set(
      ads ? 0.12 : 0.28,
      -0.28 + Math.sin(bob) * 0.012 - (player.reload > 0 ? 0.2 : 0),
      -0.65 + recoil * 2,
    );
    view.rotation.set(
      player.reload > 0 ? Math.sin(player.reload * 4) * 0.3 : recoil * 2,
      0,
      player.heal > 0 ? -0.6 : 0,
    );
    recoil = Math.max(0, recoil - dt * 0.3);
    flash.intensity = Math.max(0, flash.intensity - dt * 80);
    $("scope").style.display = ads && player.weapon === 4 ? "block" : "none";
    if (
      player.owned[player.weapon] &&
      (WEAPONS[player.weapon].auto ? trigger : semi)
    ) {
      shoot(player);
      semi = false;
    }
    footTimer -= dt;
    if (Math.hypot(vx, vz) > 1 && grounded && footTimer < 0) {
      footTimer = keys.has("ShiftLeft") ? 0.28 : 0.45;
      sound.play(7);
      noises.push({
        pos: player.pos.clone(),
        life: 0.25,
        range: crouch ? 4 : keys.has("ShiftLeft") ? 30 : 14,
      });
    }
    for (const a of actors.slice(1)) {
      bot(a, dt);
      if (!running) return;
    }
    for (const n of noises) n.life -= dt;
    noises = noises.filter((n) => n.life > 0);
    if (noises.length > 100) noises.splice(0, noises.length - 100);
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.life -= dt;
      if (e.life <= 0) {
        scene.remove(e.mesh);
        if (e.mesh instanceof T.Line || e.mesh instanceof T.Mesh) {
          e.mesh.geometry.dispose();
          (e.mesh.material as T.Material).dispose();
        }
        effects.splice(i, 1);
      }
    }
    hitTime = Math.max(0, hitTime - dt);
    hurtTime = Math.max(0, hurtTime - dt);
    $("hud").className =
      hurtTime > 0
        ? "hurt"
        : zone.outside(player.pos.x, player.pos.z)
          ? "gas"
          : "";
    $("cross").textContent = hitTime > 0 ? "×" : "+";
    $("cross").style.color = hitTime > 0 ? "#d4ee66" : "#fff";
    const alive = actors.filter((a) => a.alive).length;
    if (alive === 1 && player.alive) {
      end(true);
      return;
    }
    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.1;
      $("stats").textContent = `${alive} VIVOS / ${player.kills} ELIMINAÇÕES`;
      $("zone").textContent =
        `FASE ${Math.min(6, zone.phase + 1)} · ${zone.state === "waiting" ? "FECHA EM" : zone.state === "closing" ? "FECHANDO" : "ZONA FINAL"} ${Math.ceil(zone.time)}s ${zone.outside(player.pos.x, player.pos.z) ? `· GÁS! ${Math.ceil(zone.distance(player.pos.x, player.pos.z))}m ATÉ A ZONA` : ""}`;
      $("compass").textContent =
        `N · ${T.MathUtils.euclideanModulo((-yaw * 180) / Math.PI, 360).toFixed(0)}° · L · S · O`;
      setHTML(
        "vitals",
        `<small>ZEZÉ / OPERADOR 01</small><p>${Math.ceil(player.hp)} VIDA · ${Math.ceil(player.armor)} COLETE</p><progress value="${player.hp}" max="100"></progress><p>${player.meds} KITS ${player.heal > 0 ? `· CURANDO ${player.heal.toFixed(1)}s` : ""}</p>`,
      );
      setHTML(
        "weapon",
        !player.owned[player.weapon]
          ? "<small>SEM ARMA</small><p>Encontre equipamento e colete com E</p>"
          : `<small>${WEAPONS[player.weapon].name}</small><br><b>${player.mag[player.weapon]}</b> / ${player.reserve[player.weapon]}<br>${player.reload > 0 ? `RECARREGANDO ${player.reload.toFixed(1)}s` : "1 — 5 / EQUIPAMENTO"}`,
      );
      setHTML("feed", feed.join("<br>"));
      const nearby = loot.find(
        (l) =>
          l.pos.distanceTo(camera.position) < 3 &&
          visible(camera.position, l.pos),
      );
      $("prompt").textContent = nearby
        ? `[E] ${nearby.type < 5 ? WEAPONS[nearby.type].name : ["Munição", "Kit médico", "Colete", "Suprimentos"][nearby.type - 5]}`
        : "";
      drawMap($("radar") as HTMLCanvasElement);
    }
  }
  function frame(now: number) {
    if (failed) return;
    requestAnimationFrame(frame);
    try {
      gas.visible = running;
      view.visible =
        running &&
        player.owned[player.weapon] &&
        !(ads && player?.weapon === 4);
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      if (contextLost || failed) return;
      navigationBudget = 2;
      if (running && !paused)
        simulation.advance(dt, (step) => {
          if (running && !paused) update(step);
        });
      else simulation.reset();
      if (!running && $("menu").style.display !== "none") {
        camera.position.set(18, 12, 117);
        camera.lookAt(0, 3, 74);
      }
      const changedScale = governor.update(
        dt * 1000,
        running && !paused && !document.hidden,
      );
      if (changedScale !== null) renderer.setPixelRatio(changedScale);
      if (running && player) {
        if (!paused) {
          camera.position.lerpVectors(
            player.previous,
            player.pos,
            simulation.alpha,
          );
          camera.position.y +=
            (keys.has("ControlLeft") ? 1.05 : 1.65) +
            Math.sin(bob) * 0.025 * Math.min(1, Math.hypot(vx, vz));
          camera.rotation.set(pitch, yaw, 0);
        }
        for (const a of actors) {
          if (!a.model || !a.alive) continue;
          if (a.model.userData.equippedWeapon !== a.weapon) {
            const held = a.model.getObjectByName("heldWeapon");
            if (held) disposeObject(held);
            const replacement = gun(a.weapon);
            replacement.name = "heldWeapon";
            replacement.position.set(0.22, 1.12, -0.24);
            a.model.getObjectByName("detail")?.add(replacement);
            a.model.userData.equippedWeapon = a.weapon;
          }
          const distance = player.pos.distanceTo(a.pos);
          updateOperatorDetail(a.model, distance, quality);
          if (!paused) {
            a.model.position.lerpVectors(a.previous, a.pos, simulation.alpha);
            a.model.rotation.y =
              a.previousYaw +
              (T.MathUtils.euclideanModulo(
                a.yaw - a.previousYaw + Math.PI,
                Math.PI * 2,
              ) -
                Math.PI) *
                simulation.alpha;
            animateOperator(a.model, elapsed, a.moving);
          }
        }
        for (const l of loot)
          l.mesh.visible =
            l.pos.distanceToSquared(camera.position) <
            (quality === "baixo" ? 45 * 45 : 75 * 75);
      }
      atmosphere.update(camera);
      (gas.material as T.ShaderMaterial).uniforms.time.value = elapsed;
      const shadowTexel = 200 / sun.shadow.mapSize.x;
      const shadowX = Math.round(camera.position.x / shadowTexel) * shadowTexel,
        shadowZ = Math.round(camera.position.z / shadowTexel) * shadowTexel;
      const shadowMoved =
        Math.abs(sun.target.position.x - shadowX) > 0.01 ||
        Math.abs(sun.target.position.z - shadowZ) > 0.01;
      sun.position.set(shadowX + 80, 140, shadowZ + 70);
      sun.target.position.set(shadowX, 0, shadowZ);
      renderer.shadowMap.autoUpdate = running && !paused;
      if (shadowMoved || renderer.shadowMap.autoUpdate)
        renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
    } catch (error) {
      failed = true;
      showFatal(error);
    }
  }
  requestAnimationFrame(frame);
  // Read-only diagnostics for browser smoke tests, without exposing hidden enemy positions to the HUD.
  Object.assign(window, {
    ultimaZona: {
      get status() {
        return {
          running,
          paused,
          elapsed,
          alive: actors.filter((a) => a.alive).length,
          health: player?.hp,
          ammo: player?.mag[player.weapon],
          loot: loot.length,
          zoneRadius: zone.radius,
          graphics: { ...renderer.info.memory },
          render: {
            calls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
          },
          frameMs: governor.frameMs,
          fps: governor.fps,
          resolution: governor.scale,
          reloading: player?.reload ?? 0,
          healing: player?.heal ?? 0,
          equipped: player ? player.owned[player.weapon] : false,
          quality,
          sensitivity,
        };
      },
    },
  });
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("test")) {
    Object.assign((window as unknown as { ultimaZona: object }).ultimaZona, {
      advance(seconds: number) {
        for (let t = 0; t < seconds && running; t += 0.1) {
          navigationBudget = 2;
          update(0.1);
        }
        return {
          elapsed,
          alive: actors.filter((a) => a.alive).length,
          running,
          health: player.hp,
          kills: actors.slice(1).reduce((n, a) => n + a.kills, 0),
          states: actors
            .slice(1)
            .filter((a) => a.alive)
            .map((a) => a.state),
        };
      },
      scenario(name: string) {
        if (name === "mechanics") {
          for (const a of actors.slice(1)) {
            a.cool = 999;
            a.reaction = 999;
            a.perceive = 999;
            a.target = undefined;
            a.memory = a.pos.clone();
            a.memoryTime = 999;
          }
          return;
        }
        if (name === "hurt") {
          player.hp = 40;
          player.meds = 2;
          return;
        }
        if (name === "duel") {
          clearInput();
          yaw = 0;
          pitch = 0;
          vy = 0;
          player.pos.set(-12, world.ground(-12, 12), 12);
          player.previous.copy(player.pos);
          player.hp = 100;
          player.armor = 0;
          player.cool = 0;
          player.reload = 0;
          player.heal = 0;
          player.owned[0] = true;
          player.mag[0] = 15;
          equip(0);
          for (const a of actors.slice(2)) {
            a.alive = false;
            if (a.model) a.model.visible = false;
          }
          const opponent = actors[1];
          opponent.alive = true;
          opponent.hp = 1;
          opponent.armor = 0;
          opponent.pos.copy(player.pos).add(new T.Vector3(0, 0, -8));
          opponent.meds = 0;
          opponent.memory = opponent.pos.clone();
          opponent.memoryTime = 999;
          opponent.previous.copy(opponent.pos);
          opponent.cool = 60;
          opponent.reaction = 60;
          opponent.perceive = 60;
          opponent.target = undefined;
          opponent.goal.copy(opponent.pos);
          if (opponent.model) {
            opponent.model.visible = true;
            opponent.model.position.copy(opponent.pos);
            opponent.model.rotation.z = 0;
          }
          camera.position.copy(player.pos).add(new T.Vector3(0, 1.65, 0));
          camera.rotation.set(0, 0, 0);
          camera.updateMatrixWorld(true);
          return;
        }
        if (name === "gas") {
          zone.update(780);
          player.pos.set(zone.x, world.ground(zone.x, zone.z), zone.z);
          return;
        }
        throw new Error("Unknown regression fixture");
      },
      inspect() {
        return {
          pos: player.pos.toArray(),
          owned: player.owned,
          mag: player.mag,
          reserve: player.reserve,
          bots: actors.slice(1).map((a) => ({
            alive: a.alive,
            hp: a.hp,
            pos: a.pos.toArray(),
            state: a.state,
          })),
          feed,
          reload: player.reload,
          heal: player.heal,
          grounded,
        };
      },
    });
  }
}
function showFatal(error: unknown) {
  console.error(error);
  const root = document.querySelector<HTMLDivElement>("#app")!;
  root.innerHTML =
    '<div class="fatal panel"><h2>Não foi possível continuar</h2><p>Feche outras abas que usam gráficos e tente novamente. Use Chrome, Edge ou Firefox atualizado com aceleração de hardware e WebGL2 habilitados.</p><button id="retry">Reabrir jogo</button></div>';
  document.getElementById("retry")!.onclick = () => location.reload();
}
try {
  bootstrap();
} catch (error) {
  showFatal(error);
}
