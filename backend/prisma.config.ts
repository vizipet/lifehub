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
    url: directUrl || env("DATABASE_URL"),
  },
});