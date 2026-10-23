/** Small procedural sounds, bounded so heavy bot combat cannot exhaust audio nodes. */
export class Sound {
  context?: AudioContext;
  volume = 0.3;
  private voices = 0;
  private readonly maxVoices = 24;

  play(kind: number, distance = 0, pan = 0) {
    const volume = Number.isFinite(this.volume)
      ? Math.max(0, Math.min(1, this.volume))
      : 0.3;
    const attenuation = Number.isFinite(distance)
      ? Math.max(0, Math.min(1, 1 - Math.max(0, distance) / 180))
      : 0;
    if (!volume || !attenuation || this.voices >= this.maxVoices) return;
    try {
      this.context ??= new AudioContext();
      const c = this.context;
      if (c.state === "closed") return;
      if (c.state === "suspended") {
        // Autoplay restrictions are asynchronous; a synchronous try/catch does
        // not catch a rejected resume promise. A later user interaction retries.
        void c.resume().catch(() => {});
        return;
      }
      const o = c.createOscillator(),
        g = c.createGain(),
        p = c.createStereoPanner();
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        o.disconnect();
        g.disconnect();
        p.disconnect();
        this.voices = Math.max(0, this.voices - 1);
      };
      o.type = kind < 5 ? "sawtooth" : "sine";
      o.frequency.setValueAtTime(
        [170, 65, 110, 240, 45, 700, 400, 180][kind] ?? 300,
        c.currentTime,
      );
      o.frequency.exponentialRampToValueAtTime(35, c.currentTime + 0.14);
      g.gain.setValueAtTime(volume * attenuation * 0.2, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.17);
      p.pan.value = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
      o.connect(g).connect(p).connect(c.destination);
      this.voices++;
      o.onended = cleanup;
      try {
        o.start();
        o.stop(c.currentTime + 0.18);
      } catch {
        cleanup();
      }
    } catch {
      // Audio is optional: unsupported or restricted Web Audio must not stop play.
    }
  }
}
