import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const directUrl = process.env.DIRECT_URL?.trim();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // "prisma generate" roda sozinho ao instalar as dependências, antes de o
    // setup criar o .env. Ele não conecta no banco, então um endereço provisório
    // basta; migrate e seed só rodam depois que o .env existe.
    url: directUrl || (process.env.DATABASE_URL ? env("DATABASE_URL") : "postgresql://ainda-sem-env@localhost/lifehub"),
  },
});