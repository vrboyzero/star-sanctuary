import type { Tool, ToolCallResult } from "../../types.js";
import { OfficeSiteClient } from "./client.js";

function makeResult(name: string, start: number, success: boolean, payload: unknown, error?: string): ToolCallResult {
  return {
    id: "",
    name,
    success,
    output: success ? JSON.stringify(payload, null, 2) : "",
    error,
    durationMs: Date.now() - start,
  };
}

export const officeHomesteadGetTool: Tool = {
  definition: {
    name: "office_homestead_get",
    description: "获取自己或指定家园的详情与地块物品信息。",
    parameters: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "community.json 中已配置 apiKey 的 Agent 名称" },
        homestead_id: { type: "string", description: "指定家园 ID；不传则获取自己的家园" },
        mine: { type: "boolean", description: "是否获取自己的家园，默认 true" },
      },
      required: ["agent_name"],
    },
  },
  async execute(input): Promise<ToolCallResult> {
    const start = Date.now();
    const name = "office_homestead_get";
    try {
      const agentName = String(input.agent_name || "").trim();
      const homesteadId = String(input.homestead_id || "").trim();
      const mine = input.mine !== false;
      if (!agentName) return makeResult(name, start, false, null, "agent_name 参数必填");

      const client = new OfficeSiteClient(agentName);
      const payload = mine && !homesteadId
        ? await client.getJson<Record<string, unknown>>("/api/town-square/my-homestead")
        : await client.getJson<Record<string, unknown>>(`/api/town-square/homestead/${encodeURIComponent(homesteadId)}`);

      return makeResult(name, start, true, { success: true, ...payload });
    } catch (error) {
      return makeResult(name, start, false, null, error instanceof Error ? error.message : String(error));
    }
  },
};

export const officeHomesteadInventoryTool: Tool = {
  definition: {
    name: "office_homestead_inventory",
    description: "获取当前 Agent 主人用户家园仓库中的物品列表。",
    parameters: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "community.json 中已配置 apiKey 的 Agent 名称" },
      },
      required: ["agent_name"],
    },
  },
  async execute(input): Promise<ToolCallResult> {
    const start = Date.now();
    const name = "office_homestead_inventory";
    try {
      const agentName = String(input.agent_name || "").trim();
      if (!agentName) return makeResult(name, start, false, null, "agent_name 参数必填");

      const client = new OfficeSiteClient(agentName);
      const payload = await client.getJson<Record<string, unknown>>("/api/town-square/inventory");
      return makeResult(name, start, true, { success: true, ...payload });
    } catch (error) {
      return makeResult(name, start, false, null, error instanceof Error ? error.message : String(error));
    }
  },
};

export const officeHomesteadClaimTool: Tool = {
  definition: {
    name: "office_homestead_claim",
    description: "为当前 Agent 主人用户领取家园。通常在首次使用家园能力前调用。",
    parameters: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "community.json 中已配置 apiKey 的 Agent 名称" },
      },
      required: ["agent_name"],
    },
  },
  async execute(input): Promise<ToolCallResult> {
    const start = Date.now();
    const name = "office_homestead_claim";
    try {
      const agentName = String(input.agent_name || "").trim();
      if (!agentName) return makeResult(name, start, false, null, "agent_name 参数必填");

      const client = new OfficeSiteClient(agentName);
      const payload = await client.postJson<Record<string, unknown>>("/api/town-square/claim", {});
      return makeResult(name, start, true, { success: true, ...payload });
    } catch (error) {
      return makeResult(name, start, false, null, error instanceof Error ? error.message : String(error));
    }
  },
};

export const officeHomesteadPlaceTool: Tool = {
  definition: {
    name: "office_homestead_place",
    description: "将仓库物品放置到家园网格坐标。",
    parameters: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "community.json 中已配置 apiKey 的 Agent 名称" },
        inventory_id: { type: "number", description: "仓库物品 inventoryId" },
        x: { type: "number", description: "地块 X 坐标" },
        y: { type: "number", description: "地块 Y 坐标" },
      },
      required: ["agent_name", "inventory_id", "x", "y"],
    },
  },
  async execute(input): Promise<ToolCallResult> {
    const start = Date.now();
    const name = "office_homestead_place";
    try {
      const agentName = String(input.agent_name || "").trim();
      const inventoryId = Number(input.inventory_id);
      const x = Number(input.x);
      const y = Number(input.y);
      if (!agentName || !Number.isInteger(inventoryId) || !Number.isInteger(x) || !Number.isInteger(y)) {
        return makeResult(name, start, false, null, "agent_name、inventory_id、x、y 参数必填且必须为整数");
      }

      const client = new OfficeSiteClient(agentName);
      const payload = await client.postJson<Record<string, unknown>>("/api/town-square/place", {
        inventoryId,
        x,
        y,
      });
      return makeResult(name, start, true, { success: true, ...payload });
    } catch (error) {
      return makeResult(name, start, false, null, error instanceof Error ? error.message : String(error));
    }
  },
};

export const officeHomesteadRecallTool: Tool = {
  definition: {
    name: "office_homestead_recall",
    description: "收回地块上已放置的家园物品。",
    parameters: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "community.json 中已配置 apiKey 的 Agent 名称" },
        inventory_id: { type: "number", description: "已放置物品的 inventoryId" },
      },
      required: ["agent_name", "inventory_id"],
    },
  },
  async execute(input): Promise<ToolCallResult> {
    const start = Date.now();
    const name = "office_homestead_recall";
    try {
      const agentName = String(input.agent_name || "").trim();
      const inventoryId = Number(input.inventory_id);
      if (!agentName || !Number.isInteger(inventoryId)) {
        return makeResult(name, start, false, null, "agent_name 和 inventory_id 参数必填且 inventory_id 必须为整数");
      }

      const client = new OfficeSiteClient(agentName);
      const payload = await client.postJson<Record<string, unknown>>("/api/town-square/recall", {
        inventoryId,
      });
      return makeResult(name, start, true, { success: true, ...payload });
    } catch (error) {
      return makeResult(name, start, false, null, error instanceof Error ? error.message : String(error));
    }
  },
};

export const officeHomesteadMountTool: Tool = {
  definition: {
    name: "office_homestead_mount",
    description: "将装饰物挂载到已放置的宿主物品上，不再单独占用地块。",
    parameters: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "community.json 中已配置 apiKey 的 Agent 名称" },
        inventory_id: { type: "number", description: "要挂载的物品 inventoryId" },
        host_inventory_id: { type: "number", description: "宿主物品 inventoryId，必须已放置" },
        offset_x: { type: "number", description: "相对宿主图像左上角 X 偏移(px)" },
        offset_y: { type: "number", description: "相对宿主图像左上角 Y 偏移(px)" },
      },
      required: ["agent_name", "inventory_id", "host_inventory_id", "offset_x", "offset_y"],
    },
  },
  async execute(input): Promise<ToolCallResult> {
    const start = Date.now();
    const name = "office_homestead_mount";
    try {
      const agentName = String(input.agent_name || "").trim();
      const inventoryId = Number(input.inventory_id);
      const hostInventoryId = Number(input.host_inventory_id);
      const offsetX = Number(input.offset_x);
      const offsetY = Number(input.offset_y);
      if (!agentName || !Number.isInteger(inventoryId) || !Number.isInteger(hostInventoryId) || !Number.isInteger(offsetX) || !Number.isInteger(offsetY)) {
        return makeResult(name, start, false, null, "agent_name、inventory_id、host_inventory_id、offset_x、offset_y 参数必填且必须为整数");
      }

      const client = new OfficeSiteClient(agentName);
      const payload = await client.postJson<Record<string, unknown>>("/api/town-square/mount", {
        inventoryId,
        hostInventoryId,
        offsetX,
        offsetY,
      });
      return makeResult(name, start, true, { success: true, ...payload });
    } catch (error) {
      return makeResult(name, start, false, null, error instanceof Error ? error.message : String(error));
    }
  },
};

export const officeHomesteadUnmountTool: Tool = {
  definition: {
    name: "office_homestead_unmount",
    description: "将已挂载的装饰物从宿主物品上拆下，回收到仓库。",
    parameters: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "community.json 中已配置 apiKey 的 Agent 名称" },
        inventory_id: { type: "number", description: "挂载物品 inventoryId" },
      },
      required: ["agent_name", "inventory_id"],
    },
  },
  async execute(input): Promise<ToolCallResult> {
    const start = Date.now();
    const name = "office_homestead_unmount";
    try {
      const agentName = String(input.agent_name || "").trim();
      const inventoryId = Number(input.inventory_id);
      if (!agentName || !Number.isInteger(inventoryId)) {
        return makeResult(name, start, false, null, "agent_name 和 inventory_id 参数必填且 inventory_id 必须为整数");
      }

      const client = new OfficeSiteClient(agentName);
      const payload = await client.postJson<Record<string, unknown>>("/api/town-square/unmount", {
        inventoryId,
      });
      return makeResult(name, start, true, { success: true, ...payload });
    } catch (error) {
      return makeResult(name, start, false, null, error instanceof Error ? error.message : String(error));
    }
  },
};

export const officeHomesteadOpenBlindBoxTool: Tool = {
  definition: {
    name: "office_homestead_open_blind_box",
    description: "打开仓库中的盲盒物品，获取掉落奖励。",
    parameters: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "community.json 中已配置 apiKey 的 Agent 名称" },
        inventory_id: { type: "number", description: "仓库中盲盒物品的 inventoryId" },
      },
      required: ["agent_name", "inventory_id"],
    },
  },
  async execute(input): Promise<ToolCallResult> {
    const start = Date.now();
    const name = "office_homestead_open_blind_box";
    try {
      const agentName = String(input.agent_name || "").trim();
      const inventoryId = Number(input.inventory_id);
      if (!agentName || !Number.isInteger(inventoryId)) {
        return makeResult(name, start, false, null, "agent_name 和 inventory_id 参数必填且 inventory_id 必须为整数");
      }

      const client = new OfficeSiteClient(agentName);
      const payload = await client.postJson<Record<string, unknown>>("/api/town-square/open-blind-box", {
        inventoryId,
      });
      return makeResult(name, start, true, { success: true, ...payload });
    } catch (error) {
      return makeResult(name, start, false, null, error instanceof Error ? error.message : String(error));
    }
  },
};
