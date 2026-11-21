// Liga tudo com um comando: banco local, API (porta 3000) e site (porta 5173).
// Ctrl+C desliga os três.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const backend = join(root, 'backend');
const frontend = join(root, 'frontend');

if (!existsSync(join(backend, 'dist', 'main.js')) || !existsSync(join(frontend, 'node_modules'))) {
  console.error('Rode primeiro:  npm run setup');
  process.exit(1);
}

const { startDb } = await import(new URL('../backend/scripts/db.mjs', import.meta.url).href);
const cluster = await startDb();

const children = [];
function start(name, command, cwd, color) {
  const child = spawn(command, { cwd, shell: true, env: { ...process.env, FORCE_COLOR: '1' } });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const relay = (stream, out) =>
    stream.on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) out.write(prefix + line + '\n');
    });
  relay(child.stdout, process.stdout);
  relay(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`${prefix}parou (código ${code}). Encerrando o restante...`);
      void shutdown(1);
    }
  });
  children.push(child);
}

let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  await cluster.stop().catch(() => undefined);
  process.exit(code);
}
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

start('api', 'node dist/main.js', backend, '36');
start('site', 'npm run dev', frontend, '35');

setTimeout(() => {
  console.log(`
\x1b[1m LifeHub rodando\x1b[0m
   Site:          http://localhost:5173
   API (docs):    http://localhost:3000/api/docs
   E-mails:       pasta backend/mailbox

   Contas de demonstração (senha: LifeHub2026)
     Paciente:    mariana@lifehub.local   (ou CPF 529.982.247-25)
     Médica:      helena@lifehub.local
     Admin:       admin@lifehub.local

   Ctrl+C para desligar tudo.
`);
}, 6000);
