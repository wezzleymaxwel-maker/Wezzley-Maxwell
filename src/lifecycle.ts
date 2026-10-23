/** Exact zero matters: a negative completed timer must never keep an action blocked. */
export function tickTimer(remaining: number, dt: number) {
  return Math.max(0, remaining - Math.max(0, dt));
}
export class FixedStep {
  private accumulated = 0;
  readonly step = 1 / 60;
  reset() {
    this.accumulated = 0;
  }
  advance(delta: number, update: (dt: number) => void) {
    if (!Number.isFinite(delta) || delta <= 0) return;
    this.accumulated += Math.min(0.1, delta);
    let steps = 0;
    while (this.accumulated + 1e-9 >= this.step && steps < 6) {
      this.accumulated -= this.step;
      update(this.step);
      steps++;
    }
  }
}
