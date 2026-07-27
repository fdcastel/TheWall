import { spawn } from 'node:child_process';
import http from 'node:http';
import { test } from './_fixtures.js';

const LOCAL_ENV = { THEWALL_PROVIDER: 'local', THEWALL_LOCAL_FOLDER: './samples' };
const DEFAULT_PORT = 3100;

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

/**
 * Register the beforeAll/afterAll hooks that boot a Fastify server for the
 * current test file and point its baseURL at it. Call at file scope.
 *
 * The suite runs with `workers: 1` and `fullyParallel: false`, so files take
 * turns on the same port rather than each needing its own.
 */
export function useServer({ env, port = DEFAULT_PORT }) {
  let serverProcess;

  test.beforeAll(async () => {
    serverProcess = await startServer({ port, env });
  });

  test.afterAll(async () => {
    if (serverProcess) serverProcess.kill();
  });

  test.use({ baseURL: `http://localhost:${port}` });
}

/** The local-provider server, used by every test that doesn't need a real API key. */
export function useLocalServer(port = DEFAULT_PORT) {
  useServer({ env: LOCAL_ENV, port });
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
