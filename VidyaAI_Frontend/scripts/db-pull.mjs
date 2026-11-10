import { config } from "dotenv";
import { execSync } from "node:child_process";

config({ path: ".env.local" });
config();

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  console.error("DIRECT_URL is missing from .env.local");
  process.exit(1);
}

execSync(`npx prisma db pull --url "${directUrl}"`, { stdio: "inherit" });
