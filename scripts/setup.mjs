// Prepara o LifeHub do zero neste computador:
// instala dependências, gera o .env com chaves aleatórias, cria o banco,
// aplica as migrations e carrega os dados de demonstração.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const backend = join(root, 'backend');
const frontend = join(root, 'frontend');

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.error(`É preciso Node.js 22 ou mais novo (você tem ${process.version}). Baixe em https://nodejs.org`);
  process.exit(1);
}

function run(title, command, cwd) {
  console.log(`\n▶ ${title}`);
  const result = spawnSync(command, { cwd, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`\n✖ Falhou: ${title}`);
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(join(backend, 'node_modules'))) run('Instalando dependências do backend', 'npm ci --no-audit --no-fund', backend);
if (!existsSync(join(frontend, 'node_modules'))) run('Instalando dependências do frontend', 'npm ci --no-audit --no-fund', frontend);

const { ensureEnv } = await import(new URL('../backend/scripts/env.mjs', import.meta.url).href);
const env = ensureEnv();
console.log(env.created ? '\n✔ Arquivo backend/.env criado com chaves novas' : '\n✔ backend/.env mantido');

const { startDb } = await import(new URL('../backend/scripts/db.mjs', import.meta.url).href);
console.log('\n▶ Ligando o banco PostgreSQL local (a primeira vez demora um pouco)');
const cluster = await startDb();
try {
  run('Gerando o cliente do banco', 'npx prisma generate', backend);
  run('Criando as tabelas', 'npx prisma migrate deploy', backend);
  run('Carregando dados de demonstração', 'npx prisma db seed', backend);
  run('Compilando a API', 'npx nest build', backend);
} finally {
  await cluster.stop();
}

console.log(`
✔ Pronto! Agora rode:  npm run dev
  Depois abra http://localhost:5173
`);
process.exit(0);
