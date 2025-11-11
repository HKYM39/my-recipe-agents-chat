"use client";

// 前端聊天面板：直接请求 Next.js API，再由 API 触发 Mastra Workflow。

import { type FormEvent, useEffect, useRef, useState } from "react";

import type { ChatApiResponse, ChatMessage, ChatUsage } from "@/types/chat";

type UIMessage = ChatMessage & { id: string; usage?: ChatUsage };

// 确保每条消息都有稳定的 key。
const generateId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const STORAGE_KEY = "mastra-recipe-chat-history";
const createWelcomeMessage = (): UIMessage => ({
  id: generateId(),
  role: "assistant",
  content: "你好！告诉我今天想吃什么，我来为你定制菜谱 🍳",
});

type MessageSegment =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "divider" };

const parseMessageContent = (content: string): MessageSegment[] => {
  const lines = content.split(/\r?\n/);
  const segments: MessageSegment[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length) {
      segments.push({ type: "list", items: listBuffer });
      listBuffer = [];
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }
    if (line === "---") {
      flushList();
      segments.push({ type: "divider" });
      return;
    }
    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      segments.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      return;
    }
    if (/^[-*]\s+/.test(line)) {
      listBuffer.push(line.replace(/^[-*]\s+/, ""));
      return;
    }
    if (/^\d+\.\s+/.test(line)) {
      listBuffer.push(line.replace(/^\d+\.\s+/, ""));
      return;
    }
    flushList();
    segments.push({ type: "paragraph", text: line });
  });

  flushList();
  return segments;
};

const renderMessageSegments = (segments: MessageSegment[]) =>
  segments.map((segment, index) => {
    switch (segment.type) {
      case "heading":
        return (
          <p
            key={`heading-${index}`}
            className={`font-semibold text-rose-600 ${
              segment.level === 1
                ? "text-xl"
                : segment.level === 2
                ? "text-lg"
                : "text-base"
            }`}
          >
            {segment.text}
          </p>
        );
      case "paragraph":
        return (
          <p key={`paragraph-${index}`} className="text-sm leading-relaxed">
            {segment.text}
          </p>
        );
      case "list":
        return (
          <ul
            key={`list-${index}`}
            className="list-disc space-y-1 pl-5 text-sm"
          >
            {segment.items.map((item, itemIndex) => (
              <li key={`list-${index}-${itemIndex}`}>{item}</li>
            ))}
          </ul>
        );
      case "divider":
        return (
          <div
            key={`divider-${index}`}
            className="my-1 h-px w-full bg-linear-to-r from-transparent via-rose-200 to-transparent"
          />
        );
      default:
        return null;
    }
  });

export default function Home() {
  // 消息列表、输入框状态以及错误/加载指示。
  const [messages, setMessages] = useState<UIMessage[]>([
    createWelcomeMessage(),
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // 加载 localStorage 中的历史对话。
    try {
      const cached = window.localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as UIMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        } else {
          setMessages([createWelcomeMessage()]);
        }
      }
    } catch {
      setMessages([createWelcomeMessage()]);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    // 每次对话更新后写回 localStorage。
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages, isHydrated]);

  useEffect(() => {
    // 每次有新消息自动滚动到底部，提升体验。
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 先本地乐观更新，再将对话交给服务端。
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: UIMessage = {
      id: generateId(),
      role: "user",
      content: input.trim(),
    };

    const optimisticMessages = [...messages, userMessage];
    setMessages(optimisticMessages);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: optimisticMessages.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });

      const payload = (await response.json()) as ChatApiResponse;
      
      if ("error" in payload) {
        // 这里 payload 被收窄为错误分支
        throw new Error(payload.error ?? "服务暂时不可用");
      }

      // 这里 payload 被收窄为成功分支
      const assistantMessage: UIMessage = {
        id: payload.runId ?? generateId(),
        role: payload.message?.role ?? "assistant",
        content:
          payload.message?.content ?? "抱歉，我暂时无法给出答案，请稍后重试。",
        usage: payload.usage,
      };

      setMessages([...optimisticMessages, assistantMessage]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "发送失败，请重试。";
      setError(message);
      setMessages((prev) => prev.filter((msg) => msg.id !== userMessage.id));
      setInput(userMessage.content);
    } finally {
      setIsLoading(false);
    }
  }

  const handleClearHistory = () => {
    if (isLoading) return;
    const welcome = createWelcomeMessage();
    setMessages([welcome]);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([welcome]));
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-rose-50 via-white to-amber-50 px-4 py-8 text-zinc-900">
      <div className="pointer-events-none absolute inset-x-10 top-16 h-64 rounded-[32px] bg-gradient-to-r from-rose-200/40 via-amber-100/30 to-emerald-100/30 blur-3xl" />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col rounded-3xl border border-rose-100 bg-white/80 p-6 shadow-xl shadow-rose-100/60 backdrop-blur">
        <header className="mb-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.4em] text-rose-400">
                Mastra Workflow Demo
              </p>
              <h1 className="text-3xl font-semibold text-rose-950">
                定制你的今日菜谱
              </h1>
            </div>
            <button
              type="button"
              onClick={handleClearHistory}
              className="rounded-full border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-500 transition hover:border-rose-300 hover:bg-rose-50"
            >
              清空对话
            </button>
          </div>
          <p className="text-sm text-zinc-500">
            输入口味偏好、已有食材或饮食限制，我会直接调用 Mastra Workflow
            中的菜谱 Agent 为你生成可执行的菜单。
          </p>
        </header>

        <section className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col gap-4 overflow-y-auto rounded-2xl border border-zinc-100 bg-white/70 p-4">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "self-end rounded-br-sm bg-rose-500 text-white"
                    : "self-start rounded-bl-sm bg-zinc-100 text-zinc-800"
                }`}
              >
                <div className="space-y-2">
                  {message.role === "assistant"
                    ? renderMessageSegments(
                        parseMessageContent(message.content)
                      )
                    : message.content}
                </div>
                {message.role === "assistant" && message.usage ? (
                  <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-500">
                    Tokens · in {message.usage.inputTokens ?? 0} · out{" "}
                    {message.usage.outputTokens ?? 0}
                  </p>
                ) : null}
              </article>
            ))}
            <div ref={endOfMessagesRef} />
          </div>
        </section>

        <form
          onSubmit={handleSubmit}
          className="mt-6 flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm"
        >
          <label className="text-sm font-medium text-zinc-600" htmlFor="prompt">
            今天想吃什么？
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="prompt"
              name="prompt"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="例如：想吃清爽一点，家里有鸡胸肉和西兰花..."
              className="flex-1 rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:text-zinc-400"
              disabled={isLoading}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="rounded-xl bg-rose-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-rose-200"
            >
              {isLoading ? "生成中..." : "生成菜谱"}
            </button>
          </div>
          {error ? (
            <p className="text-sm text-rose-500">{error}</p>
          ) : (
            <p className="text-xs text-zinc-400">
              输入越具体，菜谱越贴合。比如「无麸质」或「一锅出」等限制。
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
