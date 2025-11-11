import { Mastra } from "@mastra/core";
import { recipeAgent } from "./agents/recipe-agent";
import { recipeChatWorkflow } from "./workflows/recipe-workflow";

// 应用唯一的 Mastra 实例，供 API 与前端共享。
export const mastra = new Mastra({
  agents: { recipeAgent }, // 注册可被调用的 Agent。
  workflows: { recipeChatWorkflow }, // 注册工作流，方便通过 mastra.getWorkflows() 访问。
});
