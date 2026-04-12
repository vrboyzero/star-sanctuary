import type { CLIContext } from "../../shared/context.js";
import type { AdvancedModule } from "../../wizard/advanced-modules-shared.js";
import type { AdvancedModulesWizardResult } from "../../wizard/advanced-modules.js";

export interface ConfigureCompletionSummary {
  changed: boolean;
  message: string;
}

export function describeConfigureCompletion(
  module: AdvancedModule,
  label: string,
  result: AdvancedModulesWizardResult,
): ConfigureCompletionSummary {
  const changed = result.configuredModules.includes(module);
  return {
    changed,
    message: changed ? `${label} configuration saved` : `${label} configuration unchanged`,
  };
}

export function printConfigureCompletion(
  ctx: CLIContext,
  module: AdvancedModule,
  label: string,
  result: AdvancedModulesWizardResult,
): void {
  const summary = describeConfigureCompletion(module, label, result);

  if (ctx.json) {
    ctx.output({
      module,
      label,
      changed: summary.changed,
      configuredModules: result.configuredModules,
      notes: result.notes,
    });
    return;
  }

  if (summary.changed) {
    ctx.success(summary.message);
  } else {
    ctx.log(summary.message);
  }
  for (const note of result.notes) {
    ctx.log(`  ${note}`);
  }
}
