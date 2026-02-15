/**
 * CLI output helpers — colored human output + JSON machine output.
 */
import pc from "picocolors";

export function printSuccess(msg: string, json: boolean): void {
  if (!json) console.log(pc.green(`✓ ${msg}`));
}

export function printError(msg: string, json: boolean): void {
  console.error(json ? JSON.stringify({ error: msg }) : pc.red(`✗ ${msg}`));
}

export function printWarn(msg: string, json: boolean): void {
  if (!json) console.log(pc.yellow(`⚠ ${msg}`));
}

export function printInfo(msg: string, json: boolean): void {
  if (!json) console.log(msg);
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
