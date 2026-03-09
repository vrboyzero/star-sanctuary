import fs from "node:fs/promises";
import path from "node:path";

const IDENTITY_FILENAME = "IDENTITY.md";

export async function extractOwnerUuid(dir: string): Promise<string | undefined> {
  try {
    const identityPath = path.join(dir, IDENTITY_FILENAME);
    const identityContent = await fs.readFile(identityPath, "utf-8");
    const match = identityContent.match(/\*\*主人UUID\*\*[：:]\s*(.+?)(?:\r?\n|$)/);
    return match?.[1]?.trim() || undefined;
  } catch {
    return undefined;
  }
}
