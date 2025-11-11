// 聊天参与角色，供工作流 / API / UI 统一引用，避免魔法字符串。
export const chatRoles = ["user", "assistant", "system"] as const;

export type ChatRole = (typeof chatRoles)[number];

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatUsage = {
  // Mastra 返回的 Token 统计信息，可选地展示给用户。
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
};

export type ChatCompletion = {
  // 工作流输出的统一结构：回复消息 + 用量记录 + runId。
  message: ChatMessage;
  usage?: ChatUsage;
  runId?: string;
};

export type ChatApiResponse =
  | {
      // 成功响应
      message: ChatMessage;
      usage?: ChatUsage;
      runId: string;
    }
  | {
      // 错误响应
      error: string;
    };
