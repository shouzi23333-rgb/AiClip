import { readFileSync } from "node:fs";
import { join } from "node:path";

let fileEnvCache: Record<string, string> | null = null;
let fileEnvCacheCwd: string | null = null;

export function getServerEnv(name: string) {
  const value = process.env[name] ?? getFileEnv()[name];
  if (!value || isPlaceholderEnvValue(value)) {
    return undefined;
  }
  return value;
}

function getFileEnv() {
  const cwd = process.cwd();
  if (fileEnvCache && fileEnvCacheCwd === cwd) {
    return fileEnvCache;
  }

  fileEnvCache = {
    ...readEnvFile(join(cwd, ".env.sample")),
    ...readEnvFile(join(cwd, ".env.local")),
  };
  fileEnvCacheCwd = cwd;

  return fileEnvCache;
}

function readEnvFile(path: string) {
  try {
    return parseEnvFile(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function parseEnvFile(content: string) {
  const values: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());
    if (key) {
      values[key] = value;
    }
  }

  return values;
}

function unquoteEnvValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function isPlaceholderEnvValue(value: string) {
  return (
    value.includes("your-api-host.example") ||
    value.includes("your-image-api-host.example") ||
    value.includes("replace-with-")
  );
}
