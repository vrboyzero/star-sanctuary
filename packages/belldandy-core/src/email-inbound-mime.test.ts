import { describe, expect, it } from "vitest";

import { parseRawEmailMessage } from "./email-inbound-mime.js";

describe("parseRawEmailMessage", () => {
  it("decodes encoded headers, multipart bodies, and attachment metadata", () => {
    const rawMessage = Buffer.from([
      "Message-ID: <msg-encoded@example.com>",
      "Subject: =?UTF-8?B?5rWL6K+V5Y+R6YCB?=",
      "From: =?UTF-8?B?5byg5LiJ?= <alice@example.com>",
      "To: Team <team@example.com>",
      "In-Reply-To: <thread-root@example.com>",
      "References: <thread-root@example.com> <thread-parent@example.com>",
      "Content-Type: multipart/mixed; boundary=\"mix-1\"",
      "",
      "--mix-1",
      "Content-Type: multipart/alternative; boundary=\"alt-1\"",
      "",
      "--alt-1",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "hello=20plain=20text",
      "--alt-1",
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("<p>hello <strong>html</strong></p>", "utf8").toString("base64"),
      "--alt-1--",
      "--mix-1",
      "Content-Type: application/pdf; name=\"=?UTF-8?B?cmVwb3J0LnBkZg==?=\"",
      "Content-Disposition: attachment; filename=\"=?UTF-8?B?cmVwb3J0LnBkZg==?=\"",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("fake-pdf-content", "utf8").toString("base64"),
      "--mix-1",
      "Content-Type: image/png",
      "Content-Disposition: inline; filename=\"chart.png\"",
      "Content-ID: <cid-chart>",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("fake-image", "utf8").toString("base64"),
      "--mix-1--",
    ].join("\r\n"), "utf8");

    const parsed = parseRawEmailMessage(rawMessage);

    expect(parsed.subject).toBe("测试发送");
    expect(parsed.from).toEqual([{ address: "alice@example.com", name: "张三" }]);
    expect(parsed.threadId).toBe("<thread-root@example.com>");
    expect(parsed.inReplyToMessageId).toBe("<thread-root@example.com>");
    expect(parsed.references).toEqual(["<thread-root@example.com>", "<thread-parent@example.com>"]);
    expect(parsed.textBody).toContain("hello plain text");
    expect(parsed.htmlBody).toContain("<strong>html</strong>");
    expect(parsed.snippet).toContain("hello plain text");
    expect(parsed.attachments).toEqual([
      expect.objectContaining({
        filename: "report.pdf",
        contentType: "application/pdf",
        sizeBytes: Buffer.byteLength("fake-pdf-content", "utf8"),
        partId: "1.2",
      }),
      expect.objectContaining({
        filename: "chart.png",
        contentType: "image/png",
        inline: true,
        contentId: "cid-chart",
        sizeBytes: Buffer.byteLength("fake-image", "utf8"),
        partId: "1.3",
      }),
    ]);
    expect(parsed.inlineAttachmentCount).toBe(1);
  });
});
