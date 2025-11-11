import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { mastra } from "@/mastra";
import { chatRoles } from "@/types/chat";

// 基础请求体验证：确保每条消息满足角色 + 内容要求。
const messageSchema = z.object({
  role: z.enum(chatRoles),
  content: z.string().min(1, "内容不能为空"),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1, "至少需要一条消息"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = requestSchema.parse(body);

    // 通过 Mastra 获取已经注册的工作流实例。
    const workflow = mastra.getWorkflows().recipeChatWorkflow;
    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow recipeChatWorkflow 未注册" },
        { status: 500 }
      );
    }

    // createRunAsync 会触发持久化，方便日后观察/追踪。
    const run = await workflow.createRunAsync();
    const execution = await run.start({ inputData: input });

    if (execution.status !== "success") {
      return NextResponse.json(
        {
          error: "Workflow 执行失败",
          status: execution.status,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: execution.result.message,
      usage: execution.result.usage,
      runId: execution.result.runId ?? run.runId,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues.map((issue) => issue.message).join(", ") },
        { status: 400 }
      );
    }

    console.error("[chat-api]", error);
    return NextResponse.json(
      { error: "服务暂时不可用，请稍后重试" },
      { status: 500 }
    );
  }
}
