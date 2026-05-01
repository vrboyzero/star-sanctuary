// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { createAttachmentsFeature } from "./attachments.js";

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = unitIndex === 0 ? String(Math.round(value)) : String(Math.round(value * 10) / 10).replace(/\.0$/u, "");
  return `${rounded} ${units[unitIndex]}`;
}

describe("attachments feature", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="composer">
        <textarea id="prompt"></textarea>
        <button id="attachBtn" type="button"></button>
        <input id="fileInput" type="file" />
        <div id="attachmentsPreview"></div>
      </div>
    `;
  });

  it("updates the attachment hint after syncing runtime limits from config", () => {
    const attachmentsPreviewEl = document.getElementById("attachmentsPreview");
    const feature = createAttachmentsFeature({
      refs: {
        attachmentsPreviewEl,
        attachBtn: document.getElementById("attachBtn"),
        fileInput: document.getElementById("fileInput"),
        composerSection: document.getElementById("composer"),
        promptEl: document.getElementById("prompt"),
      },
      defaultLimits: {
        maxFileBytes: 30 * 1024 * 1024,
        maxTotalBytes: 60 * 1024 * 1024,
      },
      imageCompression: {
        triggerBytes: 800 * 1024,
        targetBytes: 1200 * 1024,
        maxEdge: 2048,
        resizeFactor: 0.85,
        qualities: [0.86, 0.78],
      },
      estimateDataUrlBytes: () => 0,
      formatBytes,
      t: (_key, params, fallback) => fallback
        ?.replace("{fileLimit}", params?.fileLimit ?? "")
        .replace("{totalLimit}", params?.totalLimit ?? "")
        .replace("{count}", params?.count ?? "")
        .replace("{totalBytes}", params?.totalBytes ?? "") ?? "",
    });

    feature.renderAttachmentsPreview();
    const hintEl = document.getElementById("attachmentHint");
    expect(hintEl?.textContent).toContain("30 MB");
    expect(hintEl?.textContent).toContain("60 MB");

    feature.syncLimitsFromConfig({
      BELLDANDY_ATTACHMENT_MAX_FILE_BYTES: "104857600",
      BELLDANDY_ATTACHMENT_MAX_TOTAL_BYTES: "314572800",
    });

    expect(hintEl?.textContent).toContain("100 MB");
    expect(hintEl?.textContent).toContain("300 MB");
  });
});
