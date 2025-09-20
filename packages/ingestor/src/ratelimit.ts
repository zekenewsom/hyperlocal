export class TokenBucket {
  private tokens: number;
  private lastRefill = Date.now();
  constructor(private capacity: number, private refillPerSec: number) {
    this.tokens = capacity;
  }
  take(cost = 1): boolean {
    this.refill();
    if (this.tokens >= cost) { this.tokens -= cost; return true; }
    return false;
  }
  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill)/1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed*this.refillPerSec);
    this.lastRefill = now;
  }
}
export const minMs = (n: number) => n * 60_000;
export const secMs = (n: number) => n * 1000;

