import { describe, expect, it } from "vitest";
import { extractBestContent, isReadabilityContentUsable } from "./utils.js";

describe("browser content extraction", () => {
  it("falls back to bilibili search list extraction instead of footer-only readability content", () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>openclaw_哔哩哔哩_bilibili</title>
        </head>
        <body>
          <div class="search-page">
            <div class="bili-video-card">
              <a href="https://www.bilibili.com/video/BV1xx411c7mD" title="OpenClaw 完整流程试玩">
                <h3 class="bili-video-card__info--tit">OpenClaw 完整流程试玩</h3>
              </a>
              <div class="bili-video-card__info--author">UP主A</div>
              <div class="bili-video-card__info--desc">经典平台跳跃游戏 OpenClaw 的完整流程。</div>
            </div>
            <div class="bili-video-card">
              <a href="https://www.bilibili.com/video/BV2xx411c7mE" title="OpenClaw 速通记录">
                <h3 class="bili-video-card__info--tit">OpenClaw 速通记录</h3>
              </a>
              <div class="bili-video-card__info--author">UP主B</div>
              <div class="bili-video-card__info--desc">高难路线与捷径演示。</div>
            </div>
            <div class="bili-video-card">
              <a href="https://www.bilibili.com/video/BV3xx411c7mF" title="OpenClaw 隐藏关卡解析">
                <h3 class="bili-video-card__info--tit">OpenClaw 隐藏关卡解析</h3>
              </a>
              <div class="bili-video-card__info--author">UP主C</div>
              <div class="bili-video-card__info--desc">地图与隐藏机关整理。</div>
            </div>
          </div>
          <footer>
            <p>增值电信业务经营许可证</p>
            <p>备案号 浙ICP备000000号</p>
          </footer>
        </body>
      </html>
    `;

    const result = extractBestContent({
      html,
      url: "https://search.bilibili.com/all?keyword=openclaw",
      title: "openclaw_哔哩哔哩_bilibili",
      bodyText: [
        "OpenClaw 完整流程试玩",
        "OpenClaw 速通记录",
        "OpenClaw 隐藏关卡解析",
        "增值电信业务经营许可证",
        "备案号 浙ICP备000000号",
      ].join("\n"),
    });

    expect(result).not.toBeNull();
    expect(result?.content).toContain("## Search Results");
    expect(result?.content).toContain("OpenClaw 完整流程试玩");
    expect(result?.content).toContain("OpenClaw 速通记录");
    expect(result?.content).toContain("OpenClaw 隐藏关卡解析");
    expect(result?.content).not.toContain("备案号");
  });

  it("marks footer-dominated readability content as unusable when body text is much longer", () => {
    const readable = {
      title: "示例页面",
      content: "增值电信业务经营许可证 备案号",
    };

    const usable = isReadabilityContentUsable(
      readable,
      "这里应该是正文内容 ".repeat(80),
    );

    expect(usable).toBe(false);
  });
});
