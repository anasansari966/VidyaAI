import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

if (process.platform !== "win32" || process.arch !== "x64") {
  process.exit(0);
}

const pkgDir = join(process.cwd(), "node_modules", "@tailwindcss", "oxide-win32-x64-msvc");
const binary = join(pkgDir, "tailwindcss-oxide.win32-x64-msvc.node");

if (!existsSync(binary) && existsSync(join(pkgDir, "package.json"))) {
  const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const tarball = `tailwindcss-oxide-win32-x64-msvc-${version}.tgz`;

  execSync(`npm pack @tailwindcss/oxide-win32-x64-msvc@${version}`, { stdio: "inherit" });
  execSync(`tar -xzf ${tarball}`, { stdio: "inherit" });
  copyFileSync(join("package", "tailwindcss-oxide.win32-x64-msvc.node"), binary);
  rmSync("package", { recursive: true, force: true });
  rmSync(tarball, { force: true });
}
