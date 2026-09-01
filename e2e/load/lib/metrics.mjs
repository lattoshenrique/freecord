/** Latency series + percentile reporting for the load drivers. */

export class Series {
  constructor(name, unit = 'ms') {
    this.name = name;
    this.unit = unit;
    this.samples = [];
  }

  record(value) {
    this.samples.push(value);
  }

  percentile(p) {
    if (this.samples.length === 0) {
      return null;
    }
    const sorted = [...this.samples].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, index)];
  }

  summary() {
    const fmt = (v) => (v === null ? 'n/a' : `${v.toFixed(1)}${this.unit}`);
    return (
      `${this.name.padEnd(28)} n=${String(this.samples.length).padStart(6)}  ` +
      `p50=${fmt(this.percentile(50))}  p95=${fmt(this.percentile(95))}  ` +
      `p99=${fmt(this.percentile(99))}  max=${fmt(this.samples.length ? Math.max(...this.samples) : null)}`
    );
  }
}

export class ErrorTally {
  constructor() {
    this.counts = new Map();
  }

  bump(kind, detail) {
    this.counts.set(kind, (this.counts.get(kind) ?? 0) + 1);
    if (detail && (this.counts.get(kind) ?? 0) <= 3) {
      console.error(`  [error:${kind}] ${detail}`);
    }
  }

  get total() {
    return [...this.counts.values()].reduce((a, b) => a + b, 0);
  }

  summary() {
    if (this.total === 0) {
      return 'errors: none';
    }
    return `errors: ${[...this.counts.entries()].map(([k, v]) => `${k}=${v}`).join(' ')}`;
  }
}

/** Prints a budget verdict without failing the run (errors fail, budgets warn). */
export function budgetLine(name, valueMs, budgetMs) {
  if (valueMs === null) {
    return `${name}: no samples`;
  }
  const verdict = valueMs <= budgetMs ? 'WITHIN BUDGET' : 'OVER BUDGET (warn only)';
  return `${name}: ${valueMs.toFixed(1)}ms vs budget ${budgetMs}ms — ${verdict}`;
}
