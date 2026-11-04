/**
 * Three.js compatible Timer API implementation.
 * Replaces deprecated THREE.Clock with high-resolution performance.now() tracking.
 */
export class Timer {
  private _previousTime: number;
  private _currentTime: number;
  private _startTime: number;
  private _delta: number;
  private _elapsed: number;
  private _timescale: number;
  private _useFixedDelta: boolean;
  private _fixedDelta: number;

  constructor() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this._previousTime = now;
    this._currentTime = now;
    this._startTime = now;
    this._delta = 0;
    this._elapsed = 0;
    this._timescale = 1;
    this._useFixedDelta = false;
    this._fixedDelta = 16.67;
  }

  getDelta(): number {
    return this._delta / 1000;
  }

  getElapsed(): number {
    return this._elapsed / 1000;
  }

  getElapsedTime(): number {
    return this.getElapsed();
  }

  setTimescale(timescale: number): this {
    this._timescale = timescale;
    return this;
  }

  reset(): this {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this._currentTime = now;
    this._startTime = now;
    this._previousTime = now;
    this._delta = 0;
    this._elapsed = 0;
    return this;
  }

  update(timestamp?: number): this {
    if (this._useFixedDelta) {
      this._delta = this._fixedDelta;
      this._elapsed += this._fixedDelta * this._timescale;
      this._currentTime += this._fixedDelta;
    } else {
      this._previousTime = this._currentTime;
      this._currentTime = timestamp !== undefined ? timestamp : (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this._delta = (this._currentTime - this._previousTime) * this._timescale;
      this._elapsed += this._delta;
    }
    return this;
  }
}
