import { readFileSync } from "node:fs";
import { join } from "node:path";

let sampleEnvCache: Record<string, string> | null = null;
let sampleEnvCacheCwd: string | null = null;

export function getServerEnv(name: string) {
  const value = process.env[name] ?? getSampleEnv()[name];
  if (!value || isPlaceholderEnvValue(value)) {
    return undefined;
  }
  return value;
}

function getSampleEnv() {
  const cwd = process.cwd();
  if (sampleEnvCache && sampleEnvCacheCwd === cwd) {
    return sampleEnvCache;
  }

  try {
    sampleEnvCache = parseEnvFile(readFileSync(join(cwd, ".env.sample"), "utf8"));
  } catch {
    sampleEnvCache = {};
  }
  sampleEnvCacheCwd = cwd;

  return sampleEnvCache;
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
