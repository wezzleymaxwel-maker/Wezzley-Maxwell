/** All distances are metres; timings use seconds. */
export interface WeaponConfig {
  name: string;
  mag: number;
  damage: number;
  range: number;
  interval: number;
  spread: number;
  reload: number;
  pellets: number;
  auto: boolean;
  recoil: number;
}
export const WEAPONS: readonly WeaponConfig[] = [
  {
    name: "Pistola",
    mag: 15,
    damage: 24,
    range: 95,
    interval: 0.24,
    spread: 0.009,
    reload: 1.3,
    pellets: 1,
    auto: false,
    recoil: 0.018,
  },
  {
    name: "Espingarda 12",
    mag: 6,
    damage: 15,
    range: 42,
    interval: 0.88,
    spread: 0.065,
    reload: 3,
    pellets: 8,
    auto: false,
    recoil: 0.065,
  },
  {
    name: "Metralhadora",
    mag: 60,
    damage: 19,
    range: 155,
    interval: 0.095,
    spread: 0.019,
    reload: 4.1,
    pellets: 1,
    auto: true,
    recoil: 0.022,
  },
  {
    name: "Compacta",
    mag: 20,
    damage: 20,
    range: 75,
    interval: 0.14,
    spread: 0.012,
    reload: 1.1,
    pellets: 1,
    auto: false,
    recoil: 0.012,
  },
  {
    name: "Sniper",
    mag: 5,
    damage: 82,
    range: 420,
    interval: 1.5,
    spread: 0.0012,
    reload: 3.4,
    pellets: 1,
    auto: false,
    recoil: 0.085,
  },
];

/** The next circle is wholly contained within the circle it replaces. */
export class SafeZone {
  radius = 345;
  x = 0;
  z = 0;
  nextX = 0;
  nextZ = 0;
  nextRadius = 260;
  phase = 0;
  /** Seconds until the next state transition. */
  time = 70;
  state: "waiting" | "closing" | "final" = "waiting";
  private fromX = 0;
  private fromZ = 0;
  private fromRadius = 345;
  private elapsed = 0;
  private readonly radii = [260, 185, 120, 70, 30, 0];
  readonly waitDuration = 70;
  readonly closeDuration = 60;
  constructor(private readonly random: () => number = Math.random) {
    this.plan();
  }
  private plan() {
    this.nextRadius = this.radii[this.phase] ?? 0;
    // Use only 65% of available displacement, avoiding circles tangent to previous edge.
    const angle = this.random() * Math.PI * 2;
    const offset =
      Math.sqrt(this.random()) *
      Math.max(0, this.radius - this.nextRadius) *
      0.65;
    this.nextX = this.x + Math.cos(angle) * offset;
    this.nextZ = this.z + Math.sin(angle) * offset;
  }
  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0 || this.state === "final") return;
    // Consume transitions individually so fast-forward and real-time simulations agree.
    while (dt > 0 && this.state !== ("final" as string)) {
      const step = Math.min(dt, this.time);
      dt -= step;
      this.time = Math.max(0, this.time - step);
      if (this.state === "closing") {
        this.elapsed += step;
        const t = Math.min(1, this.elapsed / this.closeDuration);
        this.x = this.fromX + (this.nextX - this.fromX) * t;
        this.z = this.fromZ + (this.nextZ - this.fromZ) * t;
        this.radius = this.fromRadius + (this.nextRadius - this.fromRadius) * t;
      }
      if (this.time <= 0) {
        if (this.state === "waiting") {
          this.state = "closing";
          this.time = this.closeDuration;
          this.elapsed = 0;
          this.fromX = this.x;
          this.fromZ = this.z;
          this.fromRadius = this.radius;
        } else {
          this.phase++;
          if (this.phase >= this.radii.length) {
            this.state = "final";
            this.time = 0;
          } else {
            this.state = "waiting";
            this.time = this.waitDuration;
            this.plan();
          }
        }
      }
    }
  }
  get damage() {
    return [2, 3, 5, 7, 10, 15, 30][Math.min(this.phase, 6)];
  }
  outside(x: number, z: number) {
    return (
      this.state === "final" || Math.hypot(x - this.x, z - this.z) > this.radius
    );
  }
  distance(x: number, z: number) {
    return Math.max(0, Math.hypot(x - this.x, z - this.z) - this.radius);
  }
}

export function reloadMagazine(
  loaded: number,
  reserve: number,
  capacity: number,
) {
  const transferred = Math.min(
    Math.max(0, capacity - loaded),
    Math.max(0, reserve),
  );
  return { loaded: loaded + transferred, reserve: reserve - transferred };
}
/** Armor absorbs 60% of ordinary damage until depleted. Gas bypasses armor. */
export function applyDamage(
  health: number,
  armor: number,
  amount: number,
  gas = false,
) {
  const damage = Math.max(0, amount);
  const absorbed = gas ? 0 : Math.min(Math.max(0, armor), damage * 0.6);
  return {
    health: Math.max(0, health - damage + absorbed),
    armor: Math.max(0, armor - absorbed),
  };
}
