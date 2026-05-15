#!/usr/bin/env node

import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = join(root, "dist", "release");
const appDir = join(outRoot, "AiClip");

await assertPath(join(root, ".next", "standalone", "server.js"));

await rm(outRoot, { force: true, recursive: true });
await mkdir(appDir, { recursive: true });

await copy(join(root, ".next", "standalone"), appDir);
await removeLocalOnlyFiles(appDir);
await copy(join(root, ".next", "static"), join(appDir, ".next", "static"));
await copyIfExists(join(root, "public"), join(appDir, "public"));
await copy(join(root, "scripts", "process_chroma_icons.py"), join(appDir, "scripts", "process_chroma_icons.py"));
await copy(join(root, "requirements.txt"), join(appDir, "requirements.txt"));
await copy(join(root, ".env.sample"), join(appDir, ".env.sample"));
await copy(join(root, "README.md"), join(appDir, "README.md"));
await copy(join(root, "README.zh-CN.md"), join(appDir, "README.zh-CN.md"));
await copy(join(root, "LICENSE"), join(appDir, "LICENSE"));
await copy(join(root, "release", "start.command"), join(appDir, "start.command"));
await copy(join(root, "release", "start.bat"), join(appDir, "start.bat"));

await chmodExecutable(join(appDir, "start.command"));

const packageName = process.argv[2] ?? process.env.AICLIP_PACKAGE_NAME ?? "aiclip-release";
const zipPath = join(outRoot, `${packageName}.zip`);
await zipDirectory(appDir, zipPath);

console.log(`Packaged ${zipPath}`);

async function copy(from, to) {
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
}

async function copyIfExists(from, to) {
  try {
    await stat(from);
  } catch {
    return;
  }
  await copy(from, to);
}

async function assertPath(path) {
  try {
    await stat(path);
  } catch {
    throw new Error(`Missing ${path}. Run npm run build before packaging.`);
  }
}

async function chmodExecutable(path) {
  if (process.platform !== "win32") {
    await import("node:fs/promises").then(({ chmod }) => chmod(path, 0o755));
  }
}

async function removeLocalOnlyFiles(packageDir) {
  await rm(join(packageDir, ".env"), { force: true });
  await rm(join(packageDir, ".env.local"), { force: true });
  await rm(join(packageDir, ".env.development"), { force: true });
  await rm(join(packageDir, ".env.production"), { force: true });
  await rm(join(packageDir, "tmp"), { force: true, recursive: true });
}

async function zipDirectory(sourceDir, zipPath) {
  if (process.platform === "win32") {
    await spawnAsync("powershell", [
      "-NoProfile",
      "-Command",
      "Compress-Archive -Path AiClip -DestinationPath $args[0] -Force",
      zipPath,
    ], dirname(sourceDir));
    return;
  }

  await spawnAsync("zip", ["-qry", zipPath, "AiClip"], dirname(sourceDir));
}

async function spawnAsync(command, args, cwd) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`${command} failed with code ${code}: ${stderr}`));
      }
    });
  });
}
