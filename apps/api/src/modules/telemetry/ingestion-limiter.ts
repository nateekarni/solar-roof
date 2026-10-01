import { observeValue } from '../../common/observability/metrics.js';

export function budget(name: string, fallback: number, ceiling = fallback): number {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new Error(`Invalid resource budget: ${name}`);
  return value;
}
type Work = { bytes: number; run: () => Promise<void> };
type Gateway = { tokens: number; at: number; queue: Work[] };
export class IngestionLimiter {
  private readonly gateways = new Map<string, Gateway>();
  private readonly ready: string[] = [];
  private running = 0;
  private pending = 0;
  private bytes = 0;
  private accepting = true;
  private drainDeadline = Infinity;
  private readonly concurrency: number;
  private readonly queueLimit: number;
  private readonly queueBytes: number;
  private readonly rate: number;
  private readonly burst: number;
  private readonly payloadBytes: number;
  constructor(options: { concurrency?: number; queueBytes?: number; rate?: number; burst?: number } = {}) {
    this.concurrency = options.concurrency ?? budget('INGEST_CONCURRENCY', 8);
    this.queueLimit = budget('INGEST_QUEUE_LIMIT', 1024);
    this.queueBytes = options.queueBytes ?? budget('INGEST_QUEUE_BYTES', 16777216);
    this.rate = options.rate ?? budget('INGEST_PER_GATEWAY_RATE', 50);
    this.burst = options.burst ?? budget('INGEST_PER_GATEWAY_BURST', 100);
    this.payloadBytes = budget('MQTT_MAX_PAYLOAD_BYTES', 131072);
  }
  snapshot() { return { running: this.running, pending: this.pending, bytes: this.bytes, gateways: this.gateways.size }; }
  withinDrainDeadline(): boolean { return performance.now() < this.drainDeadline; }
  submit(key: string, bytes: number, work: () => Promise<void>): 'queued' | 'rejected' {
    const reject = () => { observeValue('ingress_rejected', 1); return 'rejected' as const; };
    if (!this.accepting || !Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.payloadBytes || this.pending >= this.queueLimit || (this.running >= this.concurrency && this.bytes + bytes > this.queueBytes)) return reject();
    const now = performance.now();
    let gateway = this.gateways.get(key);
    if (!gateway) {
      // Evict only fully refilled idle buckets: eviction must never reset a live rate budget.
      for (const [id, state] of this.gateways) if (!state.queue.length && now - state.at >= this.burst / this.rate * 1000) this.gateways.delete(id);
      if (this.gateways.size >= this.queueLimit) return reject();
      gateway = { tokens: this.burst, at: now, queue: [] }; this.gateways.set(key, gateway);
    }
    gateway.tokens = Math.min(this.burst, gateway.tokens + (now - gateway.at) * this.rate / 1000); gateway.at = now;
    if (gateway.tokens < 1) return reject();
    gateway.tokens--;
    if (!gateway.queue.length) this.ready.push(key);
    gateway.queue.push({ bytes, run: work }); this.pending++; this.bytes += bytes;
    this.pump(); return 'queued';
  }
  private pump() {
    while (this.running < this.concurrency && this.ready.length && this.withinDrainDeadline()) {
      const key = this.ready.shift()!; const gateway = this.gateways.get(key)!;
      const item = gateway.queue.shift()!;
      if (gateway.queue.length) this.ready.push(key);
      this.pending--; this.bytes -= item.bytes; this.running++;
      this.metrics();
      // A failed transaction emits no application ACK; log no payload or exception details.
      void item.run().catch(() => observeValue('ingress_failed', 1)).finally(() => { this.running--; this.metrics(); this.pump(); });
    }
    this.metrics();
  }
  private metrics() {
    observeValue('ingress_backlog', this.pending); observeValue('ingress_running', this.running); observeValue('ingress_queue_bytes', this.bytes);
  }
  async shutdown(deadlineMs: number): Promise<boolean> {
    this.accepting = false;
    this.drainDeadline = Math.min(this.drainDeadline, performance.now() + deadlineMs);
    while (true) {
      if (!this.withinDrainDeadline()) {
        observeValue('ingress_shutdown_abandoned', this.pending);
        for (const gateway of this.gateways.values()) gateway.queue.length = 0;
        this.ready.length = 0; this.pending = 0; this.bytes = 0; this.metrics();
        return false;
      }
      if (!this.running && !this.pending) return true;
      await new Promise(resolve => setTimeout(resolve, Math.min(10, Math.max(1, this.drainDeadline - performance.now()))));
    }
  }
}

// Scan the bounded wire representation before parsing or recursive canonicalization.
export function parseBoundedPayload(input: string | Buffer): unknown {
  if (Buffer.byteLength(input) > budget('MQTT_MAX_PAYLOAD_BYTES', 131072)) throw new Error('Telemetry payload limit');
  const text = input.toString(); let depth = 0, quoted = false, escaped = false;
  const maximum = budget('MQTT_MAX_JSON_DEPTH', 16);
  for (const char of text) {
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true;
    else if (char === '{' || char === '[') { if (++depth > maximum) throw new Error('Telemetry nesting limit'); }
    else if (char === '}' || char === ']') depth--;
  }
  return JSON.parse(text);
}
