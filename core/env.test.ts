// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getServerEnv } from "./env";

describe("getServerEnv", () => {
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };
  let tempDir: string | null = null;

  afterEach(async () => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = null;
    }
  });

  it("prefers process.env over .env.sample", async () => {
    process.env.APIKEY = "real-env-key";

    expect(getServerEnv("APIKEY")).toBe("real-env-key");
  });

  it("falls back to .env.local before .env.sample when process.env is missing", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "env-local-"));
    process.chdir(tempDir);
    delete process.env.BASEURL;
    await writeFile(
      join(tempDir, ".env.local"),
      "BASEURL=https://local.example.test/v1\n",
    );
    await writeFile(
      join(tempDir, ".env.sample"),
      "BASEURL=https://sample.example.test/v1\n",
    );

    expect(getServerEnv("BASEURL")).toBe("https://local.example.test/v1");
  });

  it("falls back to .env.sample when process.env and .env.local are missing", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "env-sample-"));
    process.chdir(tempDir);
    delete process.env.BASEURL;
    await writeFile(
      join(tempDir, ".env.sample"),
      "BASEURL=https://sample.example.test/v1\n",
    );

    expect(getServerEnv("BASEURL")).toBe("https://sample.example.test/v1");
  });

  it("ignores placeholder values from .env.sample", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "env-sample-placeholder-"));
    process.chdir(tempDir);
    delete process.env.APIKEY;
    await writeFile(
      join(tempDir, ".env.sample"),
      "APIKEY=replace-with-your-api-key\n",
    );

    expect(getServerEnv("APIKEY")).toBeUndefined();
  });
});
