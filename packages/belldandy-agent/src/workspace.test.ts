import { describe, expect, it } from "vitest";

import { getWorkspaceDocumentBody, parseWorkspaceDocument } from "./workspace.js";

describe("workspace frontmatter parsing", () => {
  it("parses structured frontmatter and strips the body", () => {
    const content = [
      "---",
      "summary: \"Agent persona\"",
      "read_when:",
      "  - session start",
      "  - identity check",
      "layer: persona",
      "priority: 10",
      "cache: sticky",
      "role: system",
      "---",
      "# Body",
      "real content",
    ].join("\n");

    const document = parseWorkspaceDocument(content);

    expect(document.hasFrontmatter).toBe(true);
    expect(document.frontmatter).toMatchObject({
      summary: "Agent persona",
      readWhen: ["session start", "identity check"],
      layer: "persona",
      priority: 10,
      cache: "sticky",
      role: "system",
    });
    expect(document.body).toBe("# Body\nreal content");
  });

  it("falls back to raw content when frontmatter is absent or invalid", () => {
    const plain = parseWorkspaceDocument("# Plain body");
    expect(plain.hasFrontmatter).toBe(false);
    expect(plain.body).toBe("# Plain body");

    const invalid = parseWorkspaceDocument(["---", "this is not valid frontmatter", "---", "# Body"].join("\n"));
    expect(invalid.hasFrontmatter).toBe(false);
    expect(invalid.body).toContain("this is not valid frontmatter");
  });

  it("prefers parsed document body when reading workspace prompt content", () => {
    const content = ["---", "summary: \"guide\"", "---", "# Stripped body"].join("\n");
    const body = getWorkspaceDocumentBody({
      content,
      document: parseWorkspaceDocument(content),
    });

    expect(body).toBe("# Stripped body");
  });
});
