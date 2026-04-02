import type { ExtensionMarketplaceSource } from "@belldandy/plugins";
import type { CLIContext } from "../../shared/context.js";

export function failCli(ctx: CLIContext, message: string): never {
  ctx.error(message);
  process.exit(1);
}

function requireTrimmed(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

export function buildMarketplaceSourceFromArgs(args: Record<string, unknown>): ExtensionMarketplaceSource {
  const sourceType = requireTrimmed(args.source, "source").toLowerCase();

  switch (sourceType) {
    case "directory":
      return {
        source: "directory",
        path: requireTrimmed(args.path, "path"),
      };
    case "github":
      return {
        source: "github",
        repo: requireTrimmed(args.repo, "repo"),
        ref: typeof args.ref === "string" && args.ref.trim() ? args.ref.trim() : undefined,
        manifestPath: typeof args["manifest-path"] === "string" && args["manifest-path"].trim()
          ? args["manifest-path"].trim()
          : undefined,
      };
    case "git":
      return {
        source: "git",
        url: requireTrimmed(args.url, "url"),
        ref: typeof args.ref === "string" && args.ref.trim() ? args.ref.trim() : undefined,
        manifestPath: typeof args["manifest-path"] === "string" && args["manifest-path"].trim()
          ? args["manifest-path"].trim()
          : undefined,
      };
    case "url":
      return {
        source: "url",
        url: requireTrimmed(args.url, "url"),
      };
    case "npm":
      return {
        source: "npm",
        package: requireTrimmed(args.package, "package"),
        version: typeof args.version === "string" && args.version.trim() ? args.version.trim() : undefined,
      };
    default:
      throw new Error(`Unsupported source type: ${sourceType}`);
  }
}

