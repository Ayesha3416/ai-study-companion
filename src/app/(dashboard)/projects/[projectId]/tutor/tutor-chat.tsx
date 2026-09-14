"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { sendMessage } from "./actions";

type Citation = { fileName: string; pageNumber: number | null };
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  is_unsupported: boolean;
  created_at: string;
};

export function TutorChat({
  projectId,
  conversationId,
  initialMessages,
}: {
  projectId: string;
  conversationId: string;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || isPending) return;

    setError(null);
    setInput("");

    // Optimistically show the user's message right away.
    const optimisticUserMessage: Message = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: question,
      citations: null,
      is_unsupported: false,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMessage]);

    startTransition(async () => {
      const result = await sendMessage(projectId, conversationId, question);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: result.answer,
          citations: result.citations,
          is_unsupported: result.isUnsupported,
          created_at: new Date().toISOString(),
        },
      ]);
    });
  }

  return (
    <div className="flex h-[70vh] max-h-[600px] min-h-[360px] flex-col rounded-lg border">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Ask a question about this project&apos;s materials to get started.
          </p>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-neutral-900 text-white"
                  : m.is_unsupported
                    ? "bg-amber-50 text-amber-900 border border-amber-200"
                    : "bg-neutral-100 text-neutral-900"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.citations && m.citations.length > 0 && (
                <div className="mt-2 space-y-0.5 border-t border-neutral-300/50 pt-2 text-xs text-neutral-500">
                  {m.citations.map((c, i) => (
                    <p key={i}>
                      Source: {c.fileName}
                      {c.pageNumber != null ? ` — Page ${c.pageNumber}` : ""}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isPending && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-400">
              Thinking...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="border-t px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 border-t p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this project..."
          disabled={isPending}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
