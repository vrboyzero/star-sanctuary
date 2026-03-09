import readline from "node:readline";
import {
  loadCommunityConfig,
  saveCommunityConfig,
  addAgentConfig,
  removeAgentConfig,
  listAgentConfigs,
  getAgentConfig,
  getCommunityConfigPath,
  type CommunityAgentConfig,
} from "@belldandy/channels";

export interface CommunityWizardOptions {
  showWelcome?: boolean;
}

export async function runCommunityWizard(options: CommunityWizardOptions = {}): Promise<void> {
  const { showWelcome = true } = options;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });

  async function addAgent(): Promise<void> {
    console.log("\n--- 添加/更新 Agent 配置 ---");

    const name = await question("Agent 名称: ");
    if (!name) {
      console.log("Agent 名称不能为空");
      return;
    }

    const apiKey = await question("API Key: ");
    if (!apiKey) {
      console.log("API Key 不能为空");
      return;
    }

    const hasRoom = await question("是否配置房间? (y/N): ");

    let room: { name: string; password?: string } | undefined;
    if (hasRoom.toLowerCase() === "y") {
      const roomName = await question("房间名称: ");
      if (!roomName) {
        console.log("房间名称不能为空");
        return;
      }

      const password = await question("房间密码 (无密码直接回车): ");
      room = {
        name: roomName,
        password: password || undefined,
      };
    }

    const existingAgent = getAgentConfig(name);
    const agentConfig: CommunityAgentConfig = {
      name,
      apiKey,
      office: existingAgent?.office,
      room,
    };

    try {
      addAgentConfig(agentConfig);
      console.log(`\n✓ Agent "${name}" 配置已保存`);
      if (room) {
        console.log(`  房间: ${room.name}`);
        console.log(`  密码: ${room.password ? "已设置" : "无"}`);
      }
    } catch (error) {
      console.error("保存配置失败:", error);
    }
  }

  async function removeAgent(): Promise<void> {
    console.log("\n--- 删除 Agent 配置 ---");

    const agents = listAgentConfigs();
    if (agents.length === 0) {
      console.log("当前没有配置任何 Agent");
      return;
    }

    console.log("\n当前配置的 Agent:");
    agents.forEach((agent, index) => {
      console.log(`${index + 1}. ${agent.name} (房间: ${agent.room?.name || "未配置"})`);
    });

    const choice = await question("\n请选择要删除的 Agent (序号): ");
    const index = parseInt(choice, 10) - 1;
    if (Number.isNaN(index) || index < 0 || index >= agents.length) {
      console.log("无效选择");
      return;
    }

    const agentName = agents[index].name;
    const confirm = await question(`确认删除 "${agentName}"? (y/N): `);
    if (confirm.toLowerCase() !== "y") {
      console.log("已取消");
      return;
    }

    try {
      removeAgentConfig(agentName);
      console.log(`\n✓ Agent "${agentName}" 已删除`);
    } catch (error) {
      console.error("删除配置失败:", error);
    }
  }

  async function viewConfig(): Promise<void> {
    console.log("\n--- 当前配置 ---");

    const config = loadCommunityConfig();
    console.log(`\n服务端点: ${config.endpoint}`);
    console.log(`\n重连配置:`);
    console.log(`  启用: ${config.reconnect?.enabled ? "是" : "否"}`);
    console.log(`  最大重试次数: ${config.reconnect?.maxRetries}`);
    console.log(`  重试间隔: ${config.reconnect?.backoffMs}ms`);

    console.log(`\nAgent 配置 (${config.agents.length}):`);
    if (config.agents.length === 0) {
      console.log("  (无)");
    } else {
      config.agents.forEach((agent, index) => {
        console.log(`\n  ${index + 1}. ${agent.name}`);
        console.log(`     API Key: ${agent.apiKey.substring(0, 10)}...`);
        if (agent.room) {
          console.log(`     房间名称: ${agent.room.name}`);
          console.log(`     房间密码: ${agent.room.password ? "已设置" : "无"}`);
        } else {
          console.log(`     房间: 未配置`);
        }
        if (agent.office?.downloadDir) {
          console.log(`     默认下载目录: ${agent.office.downloadDir}`);
        }
        if (agent.office?.uploadRoots?.length) {
          console.log(`     上传白名单: ${agent.office.uploadRoots.join(", ")}`);
        }
      });
    }

    await question("\n按回车继续...");
  }

  async function updateEndpoint(): Promise<void> {
    console.log("\n--- 修改服务端点 ---");

    const config = loadCommunityConfig();
    console.log(`当前端点: ${config.endpoint}`);

    const newEndpoint = await question("新端点 (直接回车保持不变): ");
    if (!newEndpoint) {
      console.log("未修改");
      return;
    }

    config.endpoint = newEndpoint;
    try {
      saveCommunityConfig(config);
      console.log(`\n✓ 服务端点已更新为: ${newEndpoint}`);
    } catch (error) {
      console.error("保存配置失败:", error);
    }
  }

  async function mainMenu(): Promise<void> {
    while (true) {
      console.log("\n=== Belldandy 社区配置向导 ===");
      console.log(`配置文件: ${getCommunityConfigPath()}\n`);
      console.log("1. 添加/更新 Agent 配置");
      console.log("2. 删除 Agent 配置");
      console.log("3. 查看当前配置");
      console.log("4. 修改服务端点");
      console.log("5. 退出");

      const choice = await question("\n请选择操作 (1-5): ");
      switch (choice) {
        case "1":
          await addAgent();
          break;
        case "2":
          await removeAgent();
          break;
        case "3":
          await viewConfig();
          break;
        case "4":
          await updateEndpoint();
          break;
        case "5":
          console.log("再见！");
          return;
        default:
          console.log("无效选择，请重试");
      }
    }
  }

  try {
    if (showWelcome) {
      console.log("欢迎使用 Belldandy 社区配置向导！");
    }
    await mainMenu();
  } finally {
    rl.close();
  }
}
