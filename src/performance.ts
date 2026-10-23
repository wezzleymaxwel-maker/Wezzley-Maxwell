import type { Quality } from "./settings";
/** Sustained frame time controls resolution only, never physics, damage or perception rules. */
export class AdaptiveResolution {
  scale = 1;
  frameMs = 16.67;
  fps = 60;
  private maximum = 1;
  private minimum = 0.6;
  private measured = 0;
  private slow = 0;
  private fast = 0;
  private cooldown = 0;
  constructor(quality: Quality = "medio", pixelRatio = 1) {
    this.setQuality(quality, pixelRatio);
  }
  setQuality(quality: Quality, pixelRatio = 1) {
    const dpr = Number.isFinite(pixelRatio) ? Math.max(0.5, pixelRatio) : 1;
    this.maximum = Math.min(
      dpr,
      quality === "baixo" ? 1 : quality === "medio" ? 1.25 : 1.75,
    );
    this.minimum = Math.min(this.maximum, quality === "alto" ? 0.75 : 0.6);
    this.scale =
      quality === "baixo" ? Math.min(this.maximum, 0.85) : this.maximum;
    this.measured = 0;
    this.slow = 0;
    this.fast = 0;
    this.cooldown = 0;
    return this.scale;
  }
  /** Call once per rendered frame using wall time, not once per fixed simulation step. */
  update(frameMs: number, active = true): number | null {
    if (!active) {
      this.slow = 0;
      this.fast = 0;
      this.measured = 0;
      return null;
    }
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 5000)
      return null;
    // A visible software-rendered frame may take a full second. It is a
    // real performance sample, not a hidden-tab sleep. Keep its actual value
    // for diagnostics but cap how much one stalled frame advances adaptation.
    const dt = Math.min(0.25, frameMs / 1000);
    this.frameMs += Math.min(1, dt * 2) * (frameMs - this.frameMs);
    this.fps = 1000 / this.frameMs;
    this.measured += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    // Shader compilation and initial uploads should not determine permanent quality.
    if (this.measured < 2) return null;
    if (this.frameMs > 24) {
      this.slow += dt;
      this.fast = 0;
    } else if (this.frameMs < 17.8) {
      this.fast += dt;
      this.slow = 0;
    } else {
      this.fast = 0;
      this.slow = 0;
    }
    if (this.cooldown > 0) return null;
    let next = this.scale;
    if (this.slow >= 1.5) next = Math.max(this.minimum, this.scale - 0.1);
    else if (this.fast >= 7) next = Math.min(this.maximum, this.scale + 0.05);
    if (Math.abs(next - this.scale) < 0.001) return null;
    this.scale = Math.round(next * 100) / 100;
    this.cooldown = 2;
    this.slow = 0;
    this.fast = 0;
    return this.scale;
  }
}
