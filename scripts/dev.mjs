import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build, createServer } from 'vite';

const project = fileURLToPath(new URL('..', import.meta.url));
const directory = resolve(process.argv[2] ?? process.env.GLADE_MEDIA_DIR ?? '.');
const backendPort = process.env.GLADE_BACKEND_PORT ?? '49193';
process.chdir(project);
// Rust embeds these assets; development requests use Vite instead.
if (!existsSync('dist/index.html')) await build();
const backend = spawn('cargo', ['run', '--locked', '--', directory, '--port', backendPort, '--no-open'], { stdio: 'inherit' });
let server, stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await server?.close();
  backend.kill('SIGINT');
  process.exitCode = code;
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
backend.on('error', error => { console.error(error.message); void stop(1); });
backend.on('exit', code => { if (!stopping) void stop(code || 1); });
try {
  // Wait for Cargo and the API so the first browser load is ready.
  while (!stopping) {
    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/config`);
      if (response.ok) break;
    } catch { /* Backend is still compiling or starting. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!stopping) {
    server = await createServer();
    await server.listen();
    server.printUrls();
  }
} catch (error) {
  console.error(error);
  await stop(1);
}
