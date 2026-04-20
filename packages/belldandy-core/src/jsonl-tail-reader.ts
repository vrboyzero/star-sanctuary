import fs from "node:fs/promises";

const DEFAULT_JSONL_TAIL_CHUNK_BYTES = 64 * 1024;

export async function readRecentJsonlRecords<T>(input: {
  filePath: string;
  limit: number;
  maxChunkBytes?: number;
}): Promise<T[]> {
  const requestedMaxChunkBytes = input.maxChunkBytes;
  const safeLimit = Number.isFinite(input.limit)
    ? Math.max(1, Math.min(100, Math.floor(input.limit)))
    : 20;
  const maxChunkBytes =
    typeof requestedMaxChunkBytes === "number" && Number.isFinite(requestedMaxChunkBytes)
    ? Math.max(1024, Math.floor(requestedMaxChunkBytes))
    : DEFAULT_JSONL_TAIL_CHUNK_BYTES;

  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(input.filePath, "r");
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0) {
      return [];
    }

    let position = stat.size;
    let buffers: Buffer[] = [];
    let bufferedBytes = 0;
    let lines: string[] = [];

    while (position > 0 && lines.length <= safeLimit) {
      const chunkBytes = Math.min(maxChunkBytes, position);
      position -= chunkBytes;
      const chunk = Buffer.allocUnsafe(chunkBytes);
      const { bytesRead } = await handle.read(chunk, 0, chunkBytes, position);
      if (bytesRead <= 0) {
        break;
      }
      const nextChunk = bytesRead === chunkBytes ? chunk : chunk.subarray(0, bytesRead);
      buffers.unshift(nextChunk);
      bufferedBytes += nextChunk.length;
      lines = Buffer.concat(buffers, bufferedBytes)
        .toString("utf-8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    }

    const items: T[] = [];
    for (let index = lines.length - 1; index >= 0 && items.length < safeLimit; index -= 1) {
      try {
        const parsed = JSON.parse(lines[index]) as T;
        if (!parsed || typeof parsed !== "object") {
          continue;
        }
        items.push(parsed);
      } catch {
        continue;
      }
    }
    return items;
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "ENOENT") {
      return [];
    }
    throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}
