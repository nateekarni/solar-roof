import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const [phase, command, ...args] = process.argv.slice(2);
if (!phase || !command || !/^[a-z-]+$/.test(phase)) {
  console.error('Usage: phase-timing.mjs phase command [args...]');
  process.exit(2);
}
const started = new Date().toISOString();
const clock = performance.now();
const child = spawn(command, args, { stdio: 'inherit' });
const signals = { SIGINT: 130, SIGTERM: 143 };
for (const signal of Object.keys(signals)) process.on(signal, () => child.kill(signal));
let spawnError;
child.on('error', error => { spawnError = error; console.error(error.message); });
child.on('close', (code, signal) => {
  const status = spawnError ? 127 : (code ?? signals[signal] ?? 1);
  const finished = new Date().toISOString();
  const duration = ((performance.now() - clock) / 1000).toFixed(3);
  const row = `| ${phase} | ${started} | ${finished} | ${duration}s | ${status} |\n`;
  console.log(row.trim());
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n| Phase | Start (UTC) | End (UTC) | Duration | Exit status |\n| --- | --- | --- | --- | --- |\n${row}`);
    } catch (error) { console.error(`Could not record timing: ${error.message}`); }
  }
  process.exitCode = status;
});
