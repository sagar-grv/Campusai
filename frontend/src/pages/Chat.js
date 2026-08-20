import React from "react";
import { toast } from "sonner";
import { Send, Sparkles, RotateCw, MessageSquare, ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { streamChat, chatAsk, useChat } from "../lib/api";
import FormattedMarkdown from "../components/FormattedMarkdown";
import { EASE, Stagger, StaggerItem } from "../components/motion";

const SUGGESTIONS = [
  "Which companies hire for Data Analyst roles?",
  "Tell me about Infosys eligibility criteria",
  "What is the highest CTC in the 2025 batch?",
  "List all companies that require 60% throughout",
  "What is the interview process at Goldman Sachs?",
  "Which companies accept Mechanical branch?",
];

const REFUSAL =
  "I don't have enough information in the placement database to answer that confidently.";

export default function Chat() {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sessionId, setSessionId] = React.useState(null);
  const bottomRef = React.useRef(null);
  const pendingRef = React.useRef(null);
  const countRef = React.useRef(0);
  const streamingRef = React.useRef(false);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function appendMessage(msg) {
    const idx = countRef.current;
    countRef.current += 1;
    setMessages((m) => [...m, msg]);
    return idx;
  }

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || loading || streamingRef.current) return;
    appendMessage({ role: "user", content: q });
    setInput("");
    setLoading(true);
    streamingRef.current = true;
    pendingRef.current = null;

    streamChat(
      q,
      sessionId,
      (meta) => {
        setLoading(false);
        if (meta?.session_id) setSessionId(meta.session_id);
        const grounded = meta.grounded !== false;
        let idx = pendingRef.current;
        if (idx === null) {
          idx = appendMessage({
            role: "assistant",
            content: "",
            streaming: true,
            sources: meta.sources || [],
            matched_companies: meta.matched_companies || [],
            grounded,
          });
          pendingRef.current = idx;
        }
        if (grounded === false) {
          pendingRef.current = null;
          setMessages((m) => {
            const copy = [...m];
            if (copy[idx] && copy[idx].role === "assistant") {
              copy[idx] = { ...copy[idx], content: REFUSAL, streaming: false };
            }
            return copy;
          });
        }
      },
      (delta) => {
        const idx = pendingRef.current;
        if (idx === null) return;
        setMessages((m) => {
          const copy = [...m];
          const last = copy[idx];
          if (!last || last.role !== "assistant") return m;
          copy[idx] = { ...last, content: last.content + (delta.text || "") };
          return copy;
        });
      },
      () => {
        const idx = pendingRef.current;
        if (idx !== null) {
          setMessages((m) => {
            const copy = [...m];
            const last = copy[idx];
            if (last && last.role === "assistant") {
              copy[idx] = { ...last, streaming: false };
            }
            return copy;
          });
        }
        streamingRef.current = false;
        pendingRef.current = null;
      },
      async (err) => {
        streamingRef.current = false;
        pendingRef.current = null;
        try {
          const res = await chatAsk(q, sessionId);
          setSessionId(res.session_id);
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: res.answer,
              sources: res.sources,
              grounded: res.grounded,
              matched_companies: res.matched_companies,
            },
          ]);
        } catch (e) {
          const msg = e?.response?.data?.detail || "Something went wrong.";
          toast.error(msg);
          setMessages((m) => [
            ...m,
            { role: "assistant", content: `⚠ ${msg}`, sources: [], grounded: false },
          ]);
        } finally {
          setLoading(false);
        }
      }
    );
  }

  return (
    <div
      className="mx-auto flex h-[calc(100dvh-64px)] w-full max-w-[1400px] flex-col px-4 pb-4 pt-4 md:h-auto md:px-10 md:py-12"
      data-testid="chat-page"
    >
      {/* compact page header */}
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3 md:mb-6 md:items-end">
        <div className="min-w-0">
          <div className="overline">MODULE / 01 · PLACEMENT ASSISTANT</div>
          <h1 className="mt-1 font-display text-2xl font-black tracking-tighter md:mt-2 md:text-6xl">
            Ask the database.
          </h1>
          <p className="mt-1 hidden max-w-xl text-sm text-muted md:mt-3 md:block">
            Grounded on your college's real placement records. Every answer cites its source
            document. If it's not in the DB, it will say so.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            className="btn-outline shrink-0 !py-2 !px-4 text-sm"
            onClick={() => {
              setMessages([]);
              setSessionId(null);
            }}
            data-testid="chat-reset"
          >
            <RotateCw size={14} /> New
          </button>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-12 md:gap-6">
        {/* main chat area */}
        <div className="flex min-h-0 flex-col md:col-span-8">
          <div
            className="sharp-card flex min-h-0 flex-1 flex-col overflow-hidden md:min-h-[420px]"
            data-testid="chat-window"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-line bg-paper px-4 py-2 md:py-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-signal" strokeWidth={1.5} />
                <span className="font-mono text-xs uppercase tracking-widerX">SESSION</span>
              </div>
              <span className="hidden font-mono text-[10px] text-subtle md:block">
                {sessionId ? sessionId.slice(0, 8) : "—"}
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 md:max-h-[60vh] md:p-6">
              {messages.length === 0 && (
                <div className="mx-auto max-w-sm pt-8 text-center md:pt-10" data-testid="chat-empty">
                  <Sparkles className="mx-auto text-signal" size={28} strokeWidth={1.5} />
                  <p className="mt-3 font-display text-2xl font-black tracking-tighter">
                    Start with a real question.
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Pick a suggestion below, or ask your own.
                  </p>
                </div>
              )}
              {messages.map((m, i) => (
                <Bubble key={i} m={m} index={i} />
              ))}
              {loading && (
                <div className="flex items-center gap-3 text-muted" data-testid="chat-loading">
                  <span className="flex gap-1" aria-hidden="true">
                    <span className="typing-dot" />
                    <span className="typing-dot" style={{ animationDelay: "0.15s" }} />
                    <span className="typing-dot" style={{ animationDelay: "0.3s" }} />
                  </span>
                  <span className="font-mono text-xs uppercase tracking-widerX">
                    Retrieving · Generating
                  </span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* mobile quick-reply suggestion chips */}
            <div
              className="chip-scroll flex shrink-0 gap-2 overflow-x-auto border-t border-line px-3 py-3 md:hidden"
              data-testid="chat-suggestions-mobile"
            >
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  disabled={loading}
                  className="shrink-0 border border-line bg-paper px-3 py-2 text-left text-xs text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
                  data-testid={`suggestion-${i}`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* composer */}
            <form
              className="flex shrink-0 items-center gap-2 border-t border-line p-3"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about a company, role, eligibility..."
                className="min-h-11 w-full min-w-0 flex-1 rounded-none border border-line px-3 py-3 outline-none focus:border-signal focus:ring-0"
                data-testid="chat-input"
                disabled={loading}
              />
              <button
                type="submit"
                aria-label="Send"
                className="btn-signal !h-11 !w-11 shrink-0 justify-center !p-0"
                disabled={loading || !input.trim()}
                data-testid="chat-send"
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>

        {/* sidebar suggestions (desktop only) */}
        <aside className="hidden md:col-span-4 md:block" data-testid="chat-suggestions">
          <div className="sharp-card p-5">
            <div className="overline mb-4">TRY THESE</div>
            <Stagger className="grid gap-2" animate gap={0.05} delay={0.1}>
              {SUGGESTIONS.map((s, i) => (
                <StaggerItem key={i}>
                  <button
                    onClick={() => send(s)}
                    disabled={loading}
                    className="group flex w-full items-start justify-between gap-3 border border-line p-3 text-left text-sm transition-colors hover:border-ink hover:bg-paper disabled:opacity-50"
                    data-testid={`suggestion-${i}`}
                  >
                    <span>{s}</span>
                    <span className="mt-0.5 text-subtle transition-colors group-hover:text-signal">
                      →
                    </span>
                  </button>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
          <div className="mt-4 border border-line bg-ink p-5 text-white">
            <div className="overline text-white/60">GROUNDED · MEANS</div>
            <p className="mt-3 text-sm text-white/85">
              If the placement DB has the answer, you'll get it with source tags. Otherwise the
              assistant will say <span className="text-signal">"I don't have that information."</span>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Bubble({ m, index }) {
  const isUser = m.role === "user";
  const [sourcesOpen, setSourcesOpen] = React.useState(true);
  return (
    <motion.div
      key={index}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={`flex min-w-0 ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`min-w-0 max-w-[85%] p-3 text-sm leading-relaxed [overflow-wrap:anywhere] md:p-4 md:text-[15px] ${
          isUser ? "bubble-user ml-auto" : "bubble-ai"
        }`}
        data-testid={isUser ? "message-user" : "message-ai"}
      >
        <FormattedMarkdown content={m.content} />
        {m.streaming && (
          <span className="stream-cursor text-signal">▍</span>
        )}

        {/* Structured Company Cards */}
        {!isUser && m.matched_companies && m.matched_companies.length > 0 && (
          <div className="mt-3 grid gap-2 border-t border-line pt-3 md:gap-3">
            <div className="overline">MATCHED COMPANIES</div>
            <Stagger className="grid gap-2 md:gap-3" animate gap={0.06}>
              {m.matched_companies.map((c, i) => (
                <StaggerItem key={i}>
                  <div className="border border-line bg-paper p-2.5 font-body text-xs text-ink shadow-sm md:p-3">
                    <div className="flex min-w-0 items-center justify-between gap-2 text-sm font-bold">
                      <span className="min-w-0 truncate">{c.company}</span>
                      <span className="shrink-0 font-mono text-signal">{c.ctc || "—"}</span>
                    </div>
                    <div className="mt-1 text-muted">Role: {c.role || "N/A"}</div>
                    <div className="mt-1 font-mono text-[11px] text-subtle">
                      Eligible: {c.branches || "All"} | Cutoff: {c.cgpa || c.eligibility || "N/A"}
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        )}

        {/* Source Citations */}
        {m.sources && m.sources.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <button
              type="button"
              onClick={() => setSourcesOpen((v) => !v)}
              aria-expanded={sourcesOpen}
              className="overline mb-2 flex items-center gap-1 transition-colors hover:text-ink"
              data-testid="chat-sources-toggle"
            >
              SOURCES ({m.sources.length})
              <ChevronDown
                size={12}
                strokeWidth={2}
                className={`transition-transform ${sourcesOpen ? "rotate-180" : ""}`}
              />
            </button>
            {sourcesOpen && (
              <Stagger className="flex flex-wrap gap-2" animate gap={0.04}>
                {m.sources.map((s, i) => (
                  <StaggerItem key={i}>
                    <span
                      className="block max-w-[180px] truncate border border-line bg-paper px-1.5 py-1 font-mono text-[10px] uppercase tracking-widerX text-muted md:max-w-[220px] md:px-2"
                      data-testid={`source-tag-${i}`}
                    >
                      {s.company || "doc"} · {s.score}
                    </span>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
