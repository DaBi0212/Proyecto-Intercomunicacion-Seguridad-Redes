/**
 * Apple Fluid Interfaces Physics Engine (WWDC 2018)
 * Implements §3 Interruptibility, §4 Damping + Response, §5 Velocity Handoff,
 * §6 Momentum Projection, and §9 Rubber-Banding.
 */
export class AppleSpring {
  public position: number;
  public target: number;
  public velocity = 0;
  public dampingRatio: number;
  public response: number;

  private rafId: number | null = null;
  private lastTime = 0;
  private onUpdate?: (pos: number, vel: number) => void;
  private onRest?: () => void;

  constructor(initialValue = 0, config: { damping?: number; response?: number } = {}) {
    this.position = initialValue;
    this.target = initialValue;
    this.dampingRatio = config.damping ?? 1.0;
    this.response = config.response ?? 0.35;
  }

  animateTo(
    target: number,
    options: {
      velocity?: number;
      damping?: number;
      response?: number;
      onUpdate?: (pos: number, vel: number) => void;
      onRest?: () => void;
    } = {}
  ): void {
    this.target = target;
    if (options.velocity !== undefined) this.velocity = options.velocity;
    if (options.damping !== undefined) this.dampingRatio = options.damping;
    if (options.response !== undefined) this.response = options.response;
    if (options.onUpdate) this.onUpdate = options.onUpdate;
    if (options.onRest) this.onRest = options.onRest;

    if (this.rafId === null) {
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame((t) => this.step(t));
    }
  }

  set(value: number): void {
    this.stop();
    this.position = value;
    this.target = value;
    this.velocity = 0;
    if (this.onUpdate) this.onUpdate(this.position, 0);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private step(now: number): void {
    const dt = Math.min((now - this.lastTime) / 1000, 0.032);
    this.lastTime = now;

    const omega = (2 * Math.PI) / this.response;
    const stiffness = omega * omega;
    const damping = 2 * this.dampingRatio * omega;

    const displacement = this.position - this.target;
    const acceleration = -stiffness * displacement - damping * this.velocity;

    this.velocity += acceleration * dt;
    this.position += this.velocity * dt;

    if (this.onUpdate) {
      this.onUpdate(this.position, this.velocity);
    }

    if (Math.abs(this.velocity) < 0.8 && Math.abs(this.target - this.position) < 0.4) {
      this.position = this.target;
      this.velocity = 0;
      this.rafId = null;
      if (this.onUpdate) this.onUpdate(this.position, 0);
      if (this.onRest) this.onRest();
      return;
    }

    this.rafId = requestAnimationFrame((t) => this.step(t));
  }
}

/**
 * §6 Momentum Projection formula from WWDC Designing Fluid Interfaces
 */
export function projectMomentum(initialVelocityPxPerSec: number, decelerationRate = 0.998): number {
  return ((initialVelocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * §9 UIScrollView Rubber-band progressive resistance formula
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  const sign = overshoot < 0 ? -1 : 1;
  const abs = Math.abs(overshoot);
  return sign * ((abs * dimension * constant) / (dimension + constant * abs));
}

export class VelocityTracker {
  private samples: { pos: number; time: number }[] = [];

  reset(): void {
    this.samples = [];
  }

  addSample(pos: number, time = performance.now()): void {
    this.samples.push({ pos, time });
    const cutoff = time - 100;
    while (this.samples.length > 2 && this.samples[0].time < cutoff) {
      this.samples.shift();
    }
  }

  getVelocity(): number {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const dt = (last.time - first.time) / 1000;
    if (dt <= 0.001) return 0;
    return (last.pos - first.pos) / dt;
  }
}

