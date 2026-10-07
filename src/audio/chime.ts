export type ChimeKind = "up" | "down" | "goal";

export class Chime {
  private ctx: AudioContext | null = null;
  enabled = true;

  unlock(): void {
    if (!this.enabled) return;
    const ctx = this.context();
    if (ctx.state === "suspended") void ctx.resume();
  }

  async play(kind: ChimeKind): Promise<void> {
    if (!this.enabled) return;
    const ctx = this.context();
    if (ctx.state === "suspended") await ctx.resume();
    const now = ctx.currentTime;
    if (kind === "up") {
      this.tone(ctx, 440, now, 0.18);
      this.tone(ctx, 554, now + 0.16, 0.22);
      return;
    }
    if (kind === "down") {
      this.tone(ctx, 554, now, 0.18);
      this.tone(ctx, 440, now + 0.16, 0.22);
      return;
    }
    this.tone(ctx, 523.25, now, 0.28);
    this.tone(ctx, 659.25, now, 0.34);
  }

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private tone(ctx: AudioContext, frequency: number, when: number, duration: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.05, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }
}
