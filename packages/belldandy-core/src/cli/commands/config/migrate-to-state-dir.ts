import path from "node:path";

import { defineCommand } from "citty";

import { createCLIContext } from "../../shared/context.js";
import { migrateEnvFilesToStateDir } from "../../shared/env-migration.js";

export default defineCommand({
  meta: { name: "migrate-to-state-dir", description: "Migrate legacy project-root env files into the state directory" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
    "dry-run": { type: "boolean", description: "Preview migration without changing files" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const projectRoot = path.resolve(process.cwd());

    if (ctx.envSource === "explicit") {
      const message = `Explicit env dir override is active (${ctx.envDir}). Unset BELLDANDY_ENV_DIR / STAR_SANCTUARY_ENV_DIR before migrating.`;
      if (ctx.json) {
        ctx.output({ ok: false, reason: "explicit_env_dir", message, envDir: ctx.envDir });
      } else {
        ctx.error(message);
      }
      process.exit(1);
    }

    const result = await migrateEnvFilesToStateDir({
      sourceEnvDir: projectRoot,
      targetEnvDir: ctx.stateDir,
      dryRun: args["dry-run"] ?? false,
    });

    if (ctx.json) {
      ctx.output(result);
      if (result.status === "conflict") process.exit(1);
      return;
    }

    if (result.status === "no_source") {
      if (ctx.envSource === "state_dir") {
        ctx.warn(`Already using state-dir config (${ctx.stateDir}); no legacy project-root env files found.`);
      } else {
        ctx.warn(`No legacy project-root env files found in ${projectRoot}.`);
      }
      return;
    }

    if (result.status === "already_target") {
      ctx.warn(`Project root and state directory are the same path (${ctx.stateDir}); no migration is needed.`);
      return;
    }

    if (result.status === "conflict") {
      ctx.error("Migration aborted because conflicting env files already exist in the state directory.");
      for (const conflict of result.conflicts) {
        ctx.log(`  source: ${conflict.sourcePath}`);
        ctx.log(`  target: ${conflict.targetPath}`);
      }
      ctx.log("Resolve the conflicting files manually, then rerun the command.");
      process.exit(1);
    }

    const title = result.status === "dry_run"
      ? "Dry run: migration plan"
      : "Migration completed";
    ctx.log(title);
    ctx.log(`  from: ${result.sourceEnvDir}`);
    ctx.log(`  to:   ${result.targetEnvDir}`);

    if (result.copied.length > 0) {
      ctx.log("");
      ctx.log("Copied:");
      for (const filePath of result.copied) {
        ctx.log(`  ${filePath}`);
      }
    }

    if (result.backedUp.length > 0) {
      ctx.log("");
      ctx.log(result.status === "dry_run" ? "Will back up:" : "Backed up:");
      for (const filePath of result.backedUp) {
        ctx.log(`  ${filePath}`);
      }
    }

    if (result.unchanged.length > 0) {
      ctx.log("");
      ctx.log("Unchanged target files:");
      for (const filePath of result.unchanged) {
        ctx.log(`  ${filePath}`);
      }
    }

    if (result.status === "dry_run") {
      ctx.log("");
      ctx.log("Rerun without --dry-run to perform the migration.");
      return;
    }

    ctx.log("");
    ctx.log("Next start will use state-dir config as long as no explicit ENV_DIR override is set.");
  },
});
