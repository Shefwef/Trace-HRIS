'use client';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, X, Send, MessageCircle, RefreshCw } from 'lucide-react';
import './HelpPanel.css';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Tiny inline-markdown renderer for chat bubbles. Handles the two things
 * Gemini actually emits inside a line: **bold** and `code`. Everything
 * else stays literal so we can't accidentally execute HTML.
 */
function renderInline(line: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) parts.push(<Fragment key={`t${i++}`}>{line.slice(last, m.index)}</Fragment>);
    if (m[1] !== undefined) parts.push(<strong key={`b${i++}`}>{m[1]}</strong>);
    else if (m[2] !== undefined) parts.push(<code key={`c${i++}`}>{m[2]}</code>);
    last = re.lastIndex;
  }
  if (last < line.length) parts.push(<Fragment key={`t${i++}`}>{line.slice(last)}</Fragment>);
  return parts.length > 0 ? parts : line;
}

const SUGGESTED_PROMPTS = [
  'How do I apply for a half-day leave?',
  'How do I approve a leave with adjustments?',
  'How do I invite a new employee?',
  'What is replacement leave?',
];

const GREETING: ChatMsg = {
  role: 'assistant',
  content:
    "Hi! I'm the Trace HRIS assistant. Ask me anything about this app — how to apply for a leave, approve one, log extra work, invite employees, or general HR-information-system concepts.",
};

export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Floating widget — do NOT lock body scroll; the app underneath stays usable.

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  async function send(userText: string) {
    if (!userText.trim() || sending) return;
    setError(null);
    const nextMessages: ChatMsg[] = [
      ...messages,
      { role: 'user', content: userText.trim() },
    ];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    try {
      // Trim the greeting from the outgoing payload (server system prompt is enough)
      const outgoing = nextMessages.filter(
        (m, i) => !(i === 0 && m.role === 'assistant' && m.content === GREETING.content)
      );
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: outgoing }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { reply: string };
      setMessages((cur) => [...cur, { role: 'assistant', content: data.reply || '…' }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function resetChat() {
    setMessages([GREETING]);
    setError(null);
  }

  return (
    <>
      {!open && (
        <button
          className="help-fab"
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
        >
          <MessageCircle size={18} />
          <span>Ask HRIS</span>
        </button>
      )}

      <AnimatePresence>
        {open && (
            <motion.aside
              className="help-panel"
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              role="dialog"
              aria-label="HRIS assistant"
            >
              <header className="help-header">
                <div className="help-title">
                  <div className="help-title-icon"><Bot size={18} /></div>
                  <div>
                    <div className="help-eyebrow">ASSISTANT</div>
                    <h2>Ask HRIS</h2>
                  </div>
                </div>
                <div className="help-header-actions">
                  <button
                    className="help-close"
                    onClick={resetChat}
                    aria-label="Reset conversation"
                    title="Reset conversation"
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button className="help-close" onClick={() => setOpen(false)} aria-label="Close">
                    <X size={20} />
                  </button>
                </div>
              </header>

              <div className="help-messages" ref={scrollRef}>
                {messages.map((m, i) => (
                  <div key={i} className={`help-msg help-msg-${m.role}`}>
                    {m.role === 'assistant' && (
                      <div className="help-msg-avatar"><Bot size={14} /></div>
                    )}
                    <div className="help-msg-bubble">
                      {m.content.split('\n').map((line, li) => (
                        <p key={li}>{line ? renderInline(line) : ' '}</p>
                      ))}
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="help-msg help-msg-assistant">
                    <div className="help-msg-avatar"><Bot size={14} /></div>
                    <div className="help-msg-bubble help-msg-loading">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                )}
                {error && (
                  <div className="help-error">
                    {error.includes('NOT_CONFIGURED') || error.includes("isn't configured")
                      ? 'The assistant is not yet configured on this deployment. A Super Admin needs to add GEMINI_API_KEY.'
                      : error}
                  </div>
                )}
              </div>

              {messages.length <= 1 && !sending && !error && (
                <div className="help-suggested">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      className="help-suggested-chip"
                      onClick={() => send(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}

              <form
                className="help-input-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
              >
                <textarea
                  ref={inputRef}
                  className="help-input"
                  placeholder="Ask about Trace HRIS…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <button
                  className="help-send"
                  type="submit"
                  disabled={!input.trim() || sending}
                  aria-label="Send"
                >
                  <Send size={16} />
                </button>
              </form>

              <footer className="help-footer">
                Only answers about Trace HRIS or HR-information-system concepts.
              </footer>
            </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
