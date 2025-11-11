import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import type { MessageInput } from "@mastra/core/agent/message-list";

import { recipeAgent } from "../agents/recipe-agent";
import { chatRoles } from "@/types/chat";

// Zod 校验：确保每条消息都符合角色 + 内容的基本要求。
const chatMessageSchema = z.object({
  role: z.enum(chatRoles),
  content: z.string().min(1, "内容不能为空"),
});

// 工作流输出结构：文本回复 + 运行 ID。
const workflowOutputSchema = z.object({
  message: chatMessageSchema,
  runId: z.string().optional(),
});

// 定义工作流
const workflow = createWorkflow({
  id: "recipe-chat-workflow",
  description: "将聊天记录交给菜谱 Agent 生成下一轮回复",
  inputSchema: z.object({
    messages: z
      .array(chatMessageSchema)
      .min(1, "至少需要一条消息才能触发工作流"),
  }),
  outputSchema: workflowOutputSchema,
});

// 单步：把对话上下文交由菜谱 Agent 处理。
const delegateToAgent = createStep({
  id: "delegate-to-recipe-agent",
  description: "根据当前聊天记录调用菜谱 Agent",
  inputSchema: z.object({
    messages: z.array(chatMessageSchema),
  }),
  outputSchema: workflowOutputSchema,
  execute: async ({ inputData }) => {
    // 将简易的角色/内容结构映射到 Mastra 认可的消息格式。
    const agentMessages: MessageInput[] = inputData.messages.map(
      ({ role, content }) =>
        ({
          role,
          content,
        } as MessageInput)
    );

    const result = await recipeAgent.generate(agentMessages);
    const text = result.text ?? "";

    // 归一化返回值，方便前端直接消费。
    return {
      message: {
        role: "assistant" as const,
        content: text,
      },
      usage: result.usage,
      runId: result.response?.id ?? result.traceId,
    };
  },
});

// 将步骤链式挂载到工作流上，并 commit 成可执行实例。
export const recipeChatWorkflow = workflow.then(delegateToAgent).commit();
