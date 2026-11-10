import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js uses .env.local; Prisma CLI loads it explicitly for Supabase URLs.
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prisma CLI (migrate, db pull, studio) uses the direct/session pooler URL.
    url: process.env["DIRECT_URL"],
  },
});
