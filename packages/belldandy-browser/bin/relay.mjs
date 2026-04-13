#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";

const relayEntryPath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
  "..",
  "dist",
  "bin",
  "relay.js",
);

try {
  await import(pathToFileURL(relayEntryPath).href);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[belldandy-relay] Failed to load ${relayEntryPath}. Build @belldandy/browser first. ${message}`);
  process.exit(1);
}
