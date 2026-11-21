// PostgreSQL embutido: roda sem instalar nada no computador.
// Uso:
//   node scripts/db.mjs          -> liga o banco e mantém ligado (Ctrl+C para parar)
//   node scripts/db.mjs --reset  -> apaga os dados locais (pede confirmação)
import EmbeddedPostgres from 'embedded-postgres';
import { execFile } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readEnv } from './env.mjs';

const execFileAsync = promisify(execFile);

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
export const dataDir = join(backendDir, '.data', 'postgres');

function createCluster(env) {
  return new EmbeddedPostgres({
    databaseDir: dataDir,
    port: Number(env.LIFEHUB_DB_PORT),
    user: env.LIFEHUB_DB_USER,
    password: env.LIFEHUB_DB_PASSWORD,
    authMethod: 'scram-sha-256',
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    // Só aceita conexões deste computador.
    postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
    onLog: (message) => {
      if (process.env.DEBUG_DB) console.log(`[banco] ${String(message).trim()}`);
    },
    onError: (error) => {
      const text = String(error ?? '');
      if (process.env.DEBUG_DB || /error|fatal|panic/i.test(text)) {
        console.error(`[banco] ${text.trim()}`);
      }
    },
  });
}

/** Pacote com os programas do PostgreSQL para este sistema (o mesmo que a biblioteca usa). */
function binaryPackage() {
  const os = process.platform === 'win32' ? 'windows' : process.platform;
  return `@embedded-postgres/${os}-${process.arch}`;
}

/**
 * Desliga o banco do jeito oficial (pg_ctl stop), esperando todos os processos
 * do PostgreSQL terminarem e soltarem a porta.
 * A biblioteca, no Windows, mata o processo principal à força e não espera os
 * filhos: um deles podia ficar preso na porta e o próximo "npm run dev" falhava
 * com "porta em uso". Só usamos o jeito da biblioteca se o pg_ctl não funcionar.
 */
async function stopGracefully(cluster) {
  try {
    const { pg_ctl } = await import(binaryPackage());
    await execFileAsync(pg_ctl, ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '30'], { windowsHide: true });
    return;
  } catch {
    // Já estava desligado (ex.: Ctrl+C chegou nele primeiro) ou o pg_ctl falhou.
  }
  const child = cluster.process;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  // Espera no máximo 10 s para não travar o terminal.
  await Promise.race([cluster.stop(), new Promise((resolve) => setTimeout(resolve, 10_000))]);
}

function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () =>
      reject(
        new Error(
          `A porta ${port} já está em uso por outro programa. ` +
            'Se for um LifeHub que ficou ligado, rode "npm run stop-db" na pasta do projeto. ' +
            'Se for outro programa, feche-o ou troque LIFEHUB_DB_PORT (e a porta em DATABASE_URL) no arquivo backend/.env.',
        ),
      ),
    );
    probe.once('listening', () => probe.close(() => resolve()));
    probe.listen(port, '127.0.0.1');
  });
}

export async function startDb() {
  const env = readEnv();
  await assertPortFree(Number(env.LIFEHUB_DB_PORT));
  const cluster = createCluster(env);
  if (!existsSync(join(dataDir, 'PG_VERSION'))) {
    console.log('[banco] Criando banco local pela primeira vez...');
    await cluster.initialise();
  }
  await cluster.start();

  const client = cluster.getPgClient('postgres', '127.0.0.1');
  await client.connect();
  const name = env.LIFEHUB_DB_NAME;
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
  }
  await client.end();

  console.log(`[banco] PostgreSQL pronto em 127.0.0.1:${env.LIFEHUB_DB_PORT}/${name}`);
  // Quem chama só precisa desligar; o desligamento sempre passa pelo pg_ctl.
  return { stop: () => stopGracefully(cluster) };
}

/** Desliga um banco do LifeHub que ficou ligado (ex.: terminal fechado no meio). */
async function stopLeftover() {
  const { pg_ctl } = await import(binaryPackage());
  try {
    await execFileAsync(pg_ctl, ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '30'], { windowsHide: true });
    console.log('[banco] Desligado.');
  } catch (error) {
    const text = `${error?.stdout ?? ''}${error?.stderr ?? ''}`;
    console.log(/no server running|não está rodando|PID file|arquivo do PID|is not running/i.test(text) ? '[banco] Já estava desligado.' : `[banco] ${text.trim() || error}`);
  }
}

async function resetData() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `Isto apaga TODOS os dados locais em ${dataDir}. Digite APAGAR para confirmar: `,
  );
  rl.close();
  if (answer.trim() !== 'APAGAR') {
    console.log('Cancelado. Nada foi apagado.');
    return;
  }
  rmSync(dataDir, { recursive: true, force: true });
  console.log('Dados locais apagados. Rode "npm run setup" para recriar.');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes('--reset')) {
    await resetData();
  } else if (process.argv.includes('--stop')) {
    await stopLeftover();
  } else {
    const cluster = await startDb();
    const stop = async () => {
      console.log('\n[banco] Desligando...');
      await cluster.stop();
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    // Mantém o processo vivo enquanto o banco estiver ligado.
    setInterval(() => {}, 1 << 30);
  }
}
