// Cria backend/.env com chaves aleatórias na primeira execução.
// Nunca sobrescreve um .env existente: as chaves de criptografia do CPF
// precisam continuar as mesmas, senão os dados já gravados ficam ilegíveis.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(backendDir, '.env');

const hex = (bytes) => randomBytes(bytes).toString('hex');

export function ensureEnv() {
  if (existsSync(envPath)) {
    return { created: false, path: envPath };
  }

  const dbPassword = hex(16);
  // Porta incomum para não colidir com um PostgreSQL já instalado (5432/5433).
  const dbPort = 55433;
  const content = `# Gerado automaticamente por scripts/env.mjs em ${new Date().toISOString()}
# NÃO versionar este arquivo. Ele contém as chaves deste computador.
NODE_ENV=development
PORT=3000

# Banco PostgreSQL embutido (roda só neste computador, em 127.0.0.1)
LIFEHUB_DB_PORT=${dbPort}
LIFEHUB_DB_USER=lifehub
LIFEHUB_DB_PASSWORD=${dbPassword}
LIFEHUB_DB_NAME=lifehub
DATABASE_URL=postgresql://lifehub:${dbPassword}@127.0.0.1:${dbPort}/lifehub

# Tokens de acesso
JWT_ACCESS_SECRET=${hex(48)}
JWT_REFRESH_SECRET=${hex(48)}

# Criptografia (AES-256-GCM) e hash (HMAC-SHA256) de dados sensíveis
PASSWORD_RESET_ENCRYPTION_KEY=${hex(32)}
CPF_ENCRYPTION_KEY=${hex(32)}
CPF_HASH_KEY=${hex(32)}
FILE_ENCRYPTION_KEY=${hex(32)}

APP_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Arquivos e e-mails ficam em pastas locais (sem serviços externos)
STORAGE_DIR=./storage
MAILBOX_DIR=./mailbox

# Tarefas automáticas (lembretes, e-mails, campanhas) rodando dentro da API
LOCAL_JOBS=true
CRON_SECRET=${hex(32)}

LOG_LEVEL=info
`;
  writeFileSync(envPath, content, { encoding: 'utf8', mode: 0o600 });
  return { created: true, path: envPath };
}

export function readEnv() {
  ensureEnv();
  const values = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }
  return values;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = ensureEnv();
  console.log(
    result.created
      ? `Arquivo .env criado em ${result.path}`
      : `Arquivo .env já existe em ${result.path} (mantido)`,
  );
}
