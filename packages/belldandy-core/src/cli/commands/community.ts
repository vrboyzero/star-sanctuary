/**
 * Community command - 社区配置管理
 */
import { defineCommand } from "citty";
import { runCommunityWizard } from "../../community/wizard.js";

export default defineCommand({
  meta: {
    name: "community",
    description: "配置 office.goddess.ai 社区连接",
  },
  async run() {
    await runCommunityWizard();
  },
});
