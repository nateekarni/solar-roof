const allowed = new Set(['route-template', 'method', 'status']);
type Metric = { name: string; milliseconds?: number; value?: number; labels: Record<string, string>; count?: number };
const samples = new Map<string, Metric>();
let writable = true;
process.stdout.on('drain', () => { writable = true; });
const timer = setInterval(() => {
  if (writable && samples.size) writable = process.stdout.write(JSON.stringify({ event: 'metrics', samples: metricsSnapshot() }) + '\n');
}, 30_000);
timer.unref();
function record(metric: Metric): void {
  metric.labels = Object.fromEntries(Object.entries(metric.labels).filter(([key]) => allowed.has(key)));
  const key = JSON.stringify([metric.name, metric.labels]);
  const previous = samples.get(key);
  if (!previous && samples.size >= 256) return;
  metric.count = (previous?.count ?? 0) + 1;
  if (metric.milliseconds !== undefined) metric.milliseconds += previous?.milliseconds ?? 0;
  if (metric.value !== undefined && !/(?:_pool_waiting|_pool_connections|ingress_backlog|ingress_running|ingress_queue_bytes)$/.test(metric.name)) metric.value += previous?.value ?? 0;
  samples.set(key, metric);
}
export function observeDuration(name: string, milliseconds: number, labels: Record<string, string>): void {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
  record({ name, milliseconds, labels });
}
export function observeValue(name: string, value: number): void { record({ name, value, labels: {} }); }
export function metricsSnapshot(): Metric[] { return structuredClone([...samples.values()]); }
export function logRequest(requestId: string, method: string, route: string, status: number): void {
  if (writable) writable = process.stdout.write(JSON.stringify({ event: 'request', requestId, method, route, status }) + '\n');
}
