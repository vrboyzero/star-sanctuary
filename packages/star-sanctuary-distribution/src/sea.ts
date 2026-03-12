import { createRequire } from "node:module";

type SeaAssetEncoding = "utf8" | "buffer";

type SeaModule = {
  isSea(): boolean;
  getAsset(key: string, encoding?: SeaAssetEncoding): string | ArrayBufferView | ArrayBuffer;
  getRawAsset(key: string): ArrayBufferView | ArrayBuffer;
};

const require = createRequire(process.execPath);

let cachedSeaModule: SeaModule | null | undefined;

export function getSeaModule(): SeaModule | null {
  if (cachedSeaModule !== undefined) {
    return cachedSeaModule;
  }

  try {
    cachedSeaModule = require("node:sea") as SeaModule;
  } catch {
    cachedSeaModule = null;
  }

  return cachedSeaModule;
}

export function isSeaRuntime(): boolean {
  return getSeaModule()?.isSea() ?? false;
}
