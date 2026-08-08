"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Download, Send, Sparkles, X } from "lucide-react";
import { http, downloadFile } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { LineChart } from "@/components/Chart";
import type { ChatReply } from "@/lib/types";

interface Message {
  role: "user" | "assistant";
  content: string;
  reply?: ChatReply;
}

/** Minimal inline-bold renderer for **text** in assistant replies. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-slate-900">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

function ReplyBody({ reply }: { reply: ChatReply }) {
  return (
    <div className="space-y-3">
      <RichText text={reply.reply} />
      {reply.chart && (
        <div className="rounded-lg border border-slate-100 bg-white p-2">
          <p className="mb-1 text-[11px] font-medium text-slate-500">{reply.chart.label}</p>
          <LineChart
            data={reply.chart.data}
            name="Visitors"
            color={reply.chart.color}
            height={160}
          />
        </div>
      )}
      {reply.rows && reply.columns && reply.rows.length > 0 && (
        <div className="max-h-64 overflow-auto rounded-lg border border-slate-100">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                {reply.columns.map((c) => (
                  <th key={c} className="px-2.5 py-1.5 font-semibold uppercase tracking-wide text-slate-500">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reply.rows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/60">
                  {reply.columns!.map((c) => (
                    <td key={c} className="px-2.5 py-1.5 tabular-nums text-slate-700">
                      {String(row[c] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {reply.reports && reply.reports.length > 0 && (
        <div className="max-h-48 space-y-1.5 overflow-auto">
          {reply.reports.map((r) => (
            <button
              key={r.url}
              onClick={() => void downloadFile(r.url, r.url.split("/").pop()?.split("?")[0] ?? "report")}
              className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              <Download className="h-3.5 w-3.5 text-blue-500" />
              <span className="flex-1 truncate">{r.label}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                {r.format}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminChat() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chips, setChips] = useState<{ label: string; prompt: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    http
      .get<{ label: string; prompt: string }[]>("/api/chat/help")
      .then(setChips)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open || messages.length === 0) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  if (!isAdmin) return null;

  const send = async (prompt?: string) => {
    const message = (prompt ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: message }]);
    setBusy(true);
    try {
      const reply = await http.post<ChatReply>("/api/chat", { message });
      setMessages((m) => [...m, { role: "assistant", content: reply.reply, reply }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: err instanceof Error ? err.message : "Something went wrong." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send();
  };

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className="fixed bottom-5 right-5 z-50 flex h-13 w-13 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 p-3.5 text-white shadow-xl shadow-blue-600/30 transition hover:scale-105 hover:shadow-blue-600/40"
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[min(560px,calc(100vh-7rem))] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-3 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
              <Sparkles className="h-4.5 w-4.5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">Analytics Assistant</p>
              <p className="text-[11px] text-blue-100">Answers from your live platform data</p>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
            {messages.length === 0 ? (
              <div className="space-y-3 pt-2">
                <div className="rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm ring-1 ring-slate-100">
                  <RichText text="Hi! I'm your analytics assistant. Ask me anything about your projects, deployments, visitors, usage or costs — I pull answers from your live data." />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <button
                      key={c.prompt}
                      onClick={() => void send(c.prompt)}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "ml-8 rounded-2xl rounded-tr-sm bg-blue-600 px-3 py-2 text-sm text-white shadow-sm"
                      : "rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm ring-1 ring-slate-100"
                  }
                >
                  {m.role === "user" ? <p className="whitespace-pre-line">{m.content}</p> : m.reply ? <ReplyBody reply={m.reply} /> : <RichText text={m.content} />}
                </div>
              ))
            )}
            {busy && (
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white p-3 text-xs text-slate-400 shadow-sm ring-1 ring-slate-100">
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                </span>
                Thinking…
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-slate-100 bg-white p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Ask e.g. "is my site down?" or "visitors this month"'
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="rounded-lg bg-blue-600 p-2.5 text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
