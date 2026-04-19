import { spawn } from 'node:child_process';
import http from 'node:http';

/**
 * Spawn `node server.js` with the given env on the given port and resolve when
 * `/api/ping` replies 200. Rejects after `timeoutMs`. Returns the child process.
 */
export async function startServer({ port, env, timeoutMs = 20_000 }) {
  const childEnv = { ...process.env, PORT: String(port), ...env };
  const child = spawn('node', ['server.js'], {
    stdio: 'inherit',
    env: childEnv,
    shell: process.platform === 'win32'
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ping(port)) return child;
    await sleep(100);
  }
  child.kill();
  throw new Error(`Server on port ${port} did not become ready within ${timeoutMs}ms`);
}

function ping(port) {
  return new Promise(resolve => {
    const req = http.get({ host: 'localhost', port, path: '/api/ping', timeout: 500 }, res => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
