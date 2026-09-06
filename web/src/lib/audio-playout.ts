/** A bounded clock adapter: arrival jitter grows the lead, recovery shrinks slowly. */
export class AudioPlayoutClock {
  private anchorTimestamp: number | null = null;
  private anchorTime = 0;
  private previousTimestamp = 0;
  private previousArrival = 0;
  private jitter = 0;
  private lastScheduled = -Infinity;
  underruns = 0;
  late = 0;
  lead = 0.06;
  playoutDelayMs: number | null = null;
  get jitterMs(): number { return Math.round(this.jitter * 1000); }
  observe(timestamp: number, arrival: number): void {
    if (this.previousArrival && timestamp > this.previousTimestamp) {
      const deviation = Math.abs(arrival - this.previousArrival - (timestamp - this.previousTimestamp) / 1e6);
      this.jitter += (Math.min(deviation, 0.2) - this.jitter) / 16;
      const target = Math.min(0.16, Math.max(0.06, 0.04 + 4 * this.jitter));
      this.lead = target > this.lead ? target : Math.max(target, this.lead - 0.0001);
    }
    this.previousTimestamp = Math.max(timestamp, this.previousTimestamp);
    this.previousArrival = arrival;
    if (this.anchorTimestamp === null) { this.anchorTimestamp = timestamp; this.anchorTime = arrival + this.lead; }
  }
  schedule(timestamp: number, now: number): number | null {
    if (this.anchorTimestamp === null) this.observe(timestamp, now);
    if (timestamp <= this.lastScheduled) { this.late++; return null; }
    let at = this.anchorTime + (timestamp - this.anchorTimestamp!) / 1e6;
    if (at < now + 0.005 || at > now + 0.25) {
      // Recover clock drift or a real gap instead of growing latency forever.
      this.underruns++;
      this.anchorTimestamp = timestamp; this.anchorTime = now + this.lead; at = this.anchorTime;
    }
    this.lastScheduled = timestamp;
    this.playoutDelayMs = Math.round((at - now) * 1000);
    return at;
  }
}
