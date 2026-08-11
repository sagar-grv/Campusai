import React from "react";
import { toast } from "sonner";
import { Send, Sparkles, RotateCw, MessageSquare } from "lucide-react";
import { chatAsk } from "../lib/api";

const SUGGESTIONS = [
  "Which companies hire for Data Analyst roles?",
  "Tell me about Infosys eligibility criteria",
  "What is the highest CTC in the 2025 batch?",
  "List all companies that require 60% throughout",
  "What is the interview process at Goldman Sachs?",
  "Which companies accept Mechanical branch?",
];

export default function Chat() {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sessionId, setSessionId] = React.useState(null);
  const bottomRef = React.useRef(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
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

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-10 md:py-12" data-testid="chat-page">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="overline">MODULE / 01 · PLACEMENT ASSISTANT</div>
          <h1 className="mt-2 font-display text-4xl font-black tracking-tighter md:text-6xl">
            Ask the database.
          </h1>
          <p className="mt-3 max-w-xl text-muted">
            Grounded on your college's real placement records. Every answer cites its source
            document. If it's not in the DB, it will say so.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            className="btn-outline !py-2 !px-4 text-sm"
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

      <div className="grid gap-6 md:grid-cols-12">
        {/* main chat area */}
        <div className="md:col-span-8">
          <div
            className="sharp-card min-h-[420px] overflow-hidden"
            data-testid="chat-window"
          >
            <div className="flex items-center justify-between border-b border-line bg-paper px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-signal" strokeWidth={1.5} />
                <span className="font-mono text-xs uppercase tracking-widerX">SESSION</span>
              </div>
              <span className="font-mono text-[10px] text-subtle">
                {sessionId ? sessionId.slice(0, 8) : "—"}
              </span>
            </div>

            <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4 md:p-6">
              {messages.length === 0 && (
                <div className="pt-10 text-center" data-testid="chat-empty">
                  <Sparkles className="mx-auto text-signal" size={28} strokeWidth={1.5} />
                  <p className="mt-3 font-display text-2xl font-black tracking-tighter">
                    Start with a real question.
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Pick a suggestion on the right, or ask your own.
                  </p>
                </div>
              )}
              {messages.map((m, i) => (
                <Bubble key={i} m={m} />
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-muted" data-testid="chat-loading">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-signal" />
                  <span className="font-mono text-xs uppercase tracking-widerX">
                    Retrieving · Generating
                  </span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form
              className="flex items-center gap-2 border-t border-line p-3"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about a company, role, eligibility..."
                className="w-full rounded-none border border-line px-3 py-3 outline-none focus:border-signal focus:ring-0"
                data-testid="chat-input"
                disabled={loading}
              />
              <button
                type="submit"
                className="btn-signal !py-3 !px-4"
                disabled={loading || !input.trim()}
                data-testid="chat-send"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>

        {/* sidebar suggestions */}
        <aside className="md:col-span-4" data-testid="chat-suggestions">
          <div className="sharp-card p-5">
            <div className="overline mb-4">TRY THESE</div>
            <div className="grid gap-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  disabled={loading}
                  className="group flex items-start justify-between gap-3 border border-line p-3 text-left text-sm transition-colors hover:border-ink hover:bg-paper disabled:opacity-50"
                  data-testid={`suggestion-${i}`}
                >
                  <span>{s}</span>
                  <span className="mt-0.5 text-subtle transition-colors group-hover:text-signal">
                    →
                  </span>
                </button>
              ))}
            </div>
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

function Bubble({ m }) {
  const isUser = m.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap p-4 text-sm leading-relaxed md:text-[15px] ${
          isUser ? "bubble-user" : "bubble-ai"
        }`}
        data-testid={isUser ? "message-user" : "message-ai"}
      >
        {m.content}
        {m.sources && m.sources.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="overline mb-2">SOURCES</div>
            <div className="flex flex-wrap gap-2">
              {m.sources.map((s, i) => (
                <span
                  key={i}
                  className="border border-line bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-widerX text-muted"
                  data-testid={`source-tag-${i}`}
                >
                  {s.company || "doc"} · {s.score}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
