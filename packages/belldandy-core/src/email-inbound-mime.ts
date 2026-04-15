import type { EmailInboundAddress, EmailInboundAttachmentMeta } from "./email-inbound-contract.js";

export type ParsedRawEmail = {
  messageId?: string;
  threadId?: string;
  subject?: string;
  from: EmailInboundAddress[];
  to: EmailInboundAddress[];
  cc: EmailInboundAddress[];
  bcc: EmailInboundAddress[];
  replyTo: EmailInboundAddress[];
  inReplyToMessageId?: string;
  references: string[];
  textBody?: string;
  htmlBody?: string;
  attachments: EmailInboundAttachmentMeta[];
  snippet?: string;
  headers: Record<string, string>;
  inlineAttachmentCount: number;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function splitHeadersAndBody(raw: Buffer): { headersRaw: Buffer; bodyRaw: Buffer } {
  const crlf = Buffer.from("\r\n\r\n", "latin1");
  const lf = Buffer.from("\n\n", "latin1");
  const crlfIndex = raw.indexOf(crlf);
  if (crlfIndex >= 0) {
    return {
      headersRaw: raw.subarray(0, crlfIndex),
      bodyRaw: raw.subarray(crlfIndex + crlf.length),
    };
  }
  const lfIndex = raw.indexOf(lf);
  if (lfIndex >= 0) {
    return {
      headersRaw: raw.subarray(0, lfIndex),
      bodyRaw: raw.subarray(lfIndex + lf.length),
    };
  }
  return {
    headersRaw: raw,
    bodyRaw: Buffer.alloc(0),
  };
}

function decodeQuotedPrintableToBuffer(input: string): Buffer {
  const normalized = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === "=" && /^[0-9A-Fa-f]{2}$/.test(normalized.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(normalized.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    bytes.push(normalized.charCodeAt(index) & 0xff);
  }
  return Buffer.from(bytes);
}

function normalizeCharset(value: string): BufferEncoding | undefined {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "utf-8" || normalized === "utf8") return "utf8";
  if (normalized === "us-ascii" || normalized === "ascii") return "ascii";
  if (normalized === "iso-8859-1" || normalized === "latin1" || normalized === "windows-1252") return "latin1";
  if (normalized === "utf-16le" || normalized === "utf16le") return "utf16le";
  return undefined;
}

function decodeMimeText(buffer: Buffer, charset?: string): string {
  const encoding = normalizeCharset(charset || "");
  if (encoding) {
    return buffer.toString(encoding);
  }
  try {
    return buffer.toString("utf8");
  } catch {
    return buffer.toString("latin1");
  }
}

function decodeHeaderEncodedWords(input: string): string {
  return input.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_match, charset: string, encoding: string, text: string) => {
    try {
      const buffer = encoding.toLowerCase() === "b"
        ? Buffer.from(text.replace(/\s+/g, ""), "base64")
        : decodeQuotedPrintableToBuffer(text.replace(/_/g, " "));
      return decodeMimeText(buffer, charset);
    } catch {
      return text;
    }
  });
}

function parseHeaders(rawHeaders: Buffer): Record<string, string> {
  const unfolded = rawHeaders.toString("latin1").replace(/\r?\n[ \t]+/g, " ");
  const headers: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = decodeHeaderEncodedWords(line.slice(separatorIndex + 1).trim());
    if (!key || !value) continue;
    headers[key] = value;
  }
  return headers;
}

function extractHeaderParam(headerValue: string | undefined, name: string): string | undefined {
  const input = normalizeString(headerValue);
  if (!input) return undefined;
  const encodedMatch = input.match(new RegExp(`${name}\\*=(?:\"([^\"]+)\"|([^;]+))`, "i"));
  const encodedValue = normalizeString(encodedMatch?.[1] || encodedMatch?.[2]);
  if (encodedValue) {
    const rfc2231 = encodedValue.match(/^([^']*)'[^']*'(.*)$/);
    if (rfc2231) {
      try {
        const decoded = Buffer.from(decodeURIComponent(rfc2231[2]), "latin1");
        return normalizeString(decodeMimeText(decoded, rfc2231[1]));
      } catch {
        return normalizeString(rfc2231[2]);
      }
    }
    return normalizeString(decodeHeaderEncodedWords(encodedValue));
  }
  const directMatch = input.match(new RegExp(`${name}=(?:\"([^\"]+)\"|([^;]+))`, "i"));
  return normalizeString(decodeHeaderEncodedWords(directMatch?.[1] || directMatch?.[2] || ""));
}

function parseAddressList(value: string | undefined): EmailInboundAddress[] {
  const input = normalizeString(value);
  if (!input) return [];
  const results: EmailInboundAddress[] = [];
  const parts = input.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  for (const part of parts) {
    const normalized = part.trim();
    if (!normalized) continue;
    const angleMatch = normalized.match(/^(.*?)(?:<([^<>]+)>)$/);
    if (angleMatch) {
      const name = normalizeString(decodeHeaderEncodedWords(angleMatch[1]).replace(/^"|"$/g, ""));
      const address = normalizeString(angleMatch[2]);
      if (address) {
        results.push(name ? { address, name } : { address });
      }
      continue;
    }
    const address = normalizeString(decodeHeaderEncodedWords(normalized.replace(/^"|"$/g, "")));
    if (address) {
      results.push({ address });
    }
  }
  return results;
}

function splitMultipartBody(bodyRaw: Buffer, boundary: string): Buffer[] {
  const marker = `--${boundary}`;
  const source = bodyRaw.toString("latin1");
  const segments = source.split(marker);
  const items: Buffer[] = [];
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed || trimmed === "--") continue;
    const normalized = trimmed.endsWith("--") ? trimmed.slice(0, -2).trim() : trimmed;
    if (!normalized) continue;
    items.push(Buffer.from(normalized, "latin1"));
  }
  return items;
}

function decodeBodyBuffer(bodyRaw: Buffer, transferEncoding: string): Buffer {
  const normalizedEncoding = normalizeString(transferEncoding).toLowerCase();
  if (normalizedEncoding === "base64") {
    try {
      return Buffer.from(bodyRaw.toString("latin1").replace(/\s+/g, ""), "base64");
    } catch {
      return bodyRaw;
    }
  }
  if (normalizedEncoding === "quoted-printable") {
    return decodeQuotedPrintableToBuffer(bodyRaw.toString("latin1"));
  }
  return bodyRaw;
}

function stripHtmlToText(value: string): string {
  return String(value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectBodyParts(
  headers: Record<string, string>,
  bodyRaw: Buffer,
  partPath = "1",
): {
  textBody?: string;
  htmlBody?: string;
  attachments: EmailInboundAttachmentMeta[];
  inlineAttachmentCount: number;
} {
  const contentType = normalizeString(headers["content-type"]);
  const contentTypeBase = contentType.split(";")[0].trim().toLowerCase();
  if (contentTypeBase.startsWith("multipart/")) {
    const boundary = extractHeaderParam(contentType, "boundary");
    if (!boundary) {
      const fallbackText = decodeMimeText(decodeBodyBuffer(bodyRaw, headers["content-transfer-encoding"] || ""));
      return { textBody: fallbackText, attachments: [], inlineAttachmentCount: 0 };
    }
    const textParts: string[] = [];
    const htmlParts: string[] = [];
    const attachments: EmailInboundAttachmentMeta[] = [];
    let inlineAttachmentCount = 0;
    const chunks = splitMultipartBody(bodyRaw, boundary);
    for (let index = 0; index < chunks.length; index += 1) {
      const part = splitHeadersAndBody(chunks[index]);
      const partHeaders = parseHeaders(part.headersRaw);
      const nested = collectBodyParts(partHeaders, part.bodyRaw, `${partPath}.${index + 1}`);
      if (nested.textBody) textParts.push(nested.textBody);
      if (nested.htmlBody) htmlParts.push(nested.htmlBody);
      attachments.push(...nested.attachments);
      inlineAttachmentCount += nested.inlineAttachmentCount;
    }
    return {
      ...(textParts.length > 0 ? { textBody: textParts.join("\n\n") } : {}),
      ...(htmlParts.length > 0 ? { htmlBody: htmlParts.join("\n\n") } : {}),
      attachments,
      inlineAttachmentCount,
    };
  }

  const disposition = normalizeString(headers["content-disposition"]);
  const filename = extractHeaderParam(disposition, "filename") || extractHeaderParam(contentType, "name");
  const contentId = normalizeString(headers["content-id"]).replace(/^<|>$/g, "");
  const decodedBody = decodeBodyBuffer(bodyRaw, headers["content-transfer-encoding"] || "");
  const charset = extractHeaderParam(contentType, "charset");
  const decodedText = decodeMimeText(decodedBody, charset).trim();
  const inline = disposition.toLowerCase().includes("inline") || Boolean(contentId);
  const isAttachment = disposition.toLowerCase().includes("attachment")
    || Boolean(filename)
    || (inline && !contentTypeBase.startsWith("text/"))
    || contentTypeBase === "message/rfc822";

  if (isAttachment) {
    return {
      attachments: [{
        ...(filename ? { filename } : {}),
        ...(contentTypeBase ? { contentType: contentTypeBase } : {}),
        ...(contentId ? { contentId } : {}),
        ...(inline ? { inline: true } : {}),
        ...(decodedBody.length > 0 ? { sizeBytes: decodedBody.length } : {}),
        partId: partPath,
      }],
      inlineAttachmentCount: inline ? 1 : 0,
    };
  }

  if (contentTypeBase === "text/html") {
    return {
      ...(decodedText ? { htmlBody: decodedText } : {}),
      attachments: [],
      inlineAttachmentCount: 0,
    };
  }
  return {
    ...(decodedText ? { textBody: decodedText } : {}),
    attachments: [],
    inlineAttachmentCount: 0,
  };
}

export function parseRawEmailMessage(rawMessage: Buffer | string): ParsedRawEmail {
  const rawBuffer = Buffer.isBuffer(rawMessage) ? rawMessage : Buffer.from(String(rawMessage ?? ""), "utf8");
  const { headersRaw, bodyRaw } = splitHeadersAndBody(rawBuffer);
  const headers = parseHeaders(headersRaw);
  const bodyParts = collectBodyParts(headers, bodyRaw);
  const textBody = normalizeString(bodyParts.textBody);
  const htmlBody = normalizeString(bodyParts.htmlBody);
  const snippetSource = textBody || stripHtmlToText(htmlBody);
  const messageId = normalizeString(headers["message-id"]);
  const inReplyToMessageId = normalizeString(headers["in-reply-to"]);
  const referencesHeader = normalizeString(headers.references);
  const references = referencesHeader
    ? referencesHeader.split(/\s+/).map((item) => item.trim()).filter(Boolean)
    : [];
  const threadId = references[0] || inReplyToMessageId || messageId;

  return {
    ...(messageId ? { messageId } : {}),
    ...(threadId ? { threadId } : {}),
    ...(normalizeString(headers.subject) ? { subject: normalizeString(headers.subject) } : {}),
    from: parseAddressList(headers.from),
    to: parseAddressList(headers.to),
    cc: parseAddressList(headers.cc),
    bcc: parseAddressList(headers.bcc),
    replyTo: parseAddressList(headers["reply-to"]),
    ...(inReplyToMessageId ? { inReplyToMessageId } : {}),
    references,
    ...(textBody ? { textBody } : {}),
    ...(htmlBody ? { htmlBody } : {}),
    attachments: bodyParts.attachments,
    ...(snippetSource ? { snippet: snippetSource.replace(/\s+/g, " ").trim().slice(0, 320) } : {}),
    headers,
    inlineAttachmentCount: bodyParts.inlineAttachmentCount,
  };
}
