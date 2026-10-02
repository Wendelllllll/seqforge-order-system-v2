import path from "node:path";

export function resultStorageDirectory() {
  return process.env.RESULT_STORAGE_PATH
    ? path.resolve(process.env.RESULT_STORAGE_PATH)
    : path.join(process.cwd(), "storage", "results");
}
