import { describe, expect, it } from "vitest";

import { parseDreamModelOutput } from "./dream-prompt.js";

describe("dream prompt parsing", () => {
  it("parses pure JSON output", () => {
    const result = parseDreamModelOutput(JSON.stringify({
      headline: "Dream ready",
      summary: "纯 JSON 输出可以正常解析。",
      narrative: "dream 会直接读取 JSON 字段。",
      stableInsights: ["保持现有 dream 写回边界。"],
      corrections: [],
      openQuestions: [],
      shareCandidates: [],
      nextFocus: ["继续观察自动 dream。"],
    }));

    expect(result.headline).toBe("Dream ready");
    expect(result.nextFocus).toEqual(["继续观察自动 dream。"]);
  });

  it("parses JSON wrapped by think tags and markdown fence", () => {
    const raw = [
      "<think>",
      "让我先整理一下输入。",
      "这部分不要进入最终输出。",
      "</think>",
      "```json",
      "{",
      "  \"headline\": \"Dream runtime ready\",",
      "  \"summary\": \"即使模型先输出 think，再给 JSON，也应该能解析。\",",
      "  \"narrative\": \"解析层应跳过推理包裹，只读取 JSON 对象。\",",
      "  \"stableInsights\": [\"dream 不应因 think 包装直接失败。\"],",
      "  \"corrections\": [],",
      "  \"openQuestions\": [],",
      "  \"shareCandidates\": [],",
      "  \"nextFocus\": [\"继续验证自动 dream 运行。\"]",
      "}",
      "```",
    ].join("\n");

    const result = parseDreamModelOutput(raw);
    expect(result.headline).toBe("Dream runtime ready");
    expect(result.stableInsights).toEqual(["dream 不应因 think 包装直接失败。"]);
  });

  it("parses JSON object embedded in explanatory prose", () => {
    const raw = [
      "下面是最终 JSON：",
      "{",
      "  \"headline\": \"Embedded JSON\",",
      "  \"summary\": \"前后有说明文字时也应提取对象。\",",
      "  \"narrative\": \"只要能找到首个完整 JSON 对象，就不应直接失败。\",",
      "  \"stableInsights\": [],",
      "  \"corrections\": [],",
      "  \"openQuestions\": [],",
      "  \"shareCandidates\": [],",
      "  \"nextFocus\": []",
      "}",
      "请按此写入。",
    ].join("\n");

    const result = parseDreamModelOutput(raw);
    expect(result.summary).toBe("前后有说明文字时也应提取对象。");
  });
});
