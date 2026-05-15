import { getServerEnv } from "@/core/env";

export function getPythonBin() {
  return getServerEnv("PYTHON_BIN") ?? "python3";
}
