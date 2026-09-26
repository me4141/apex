import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Bot, Check, ChevronDown, Mic, Send, ShieldCheck, Sparkles, Square, User, X } from "lucide-react";
import { MarkdownBody } from "../../v2/thread/MarkdownBody";
import type { ChatMessage } from "../../hooks/useWebSocket";
import { useApex } from "../ApexContext";

export function ChatDrawer() {
  const { chatOpen, setChatOpen, live, voice, send, stop, toggleMic, approve, resolveVoicePrompt } = useApex();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (chatOpen) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatOpen, live.messages.length, live.messages.at(-1)?.content]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    send(draft);
    setDraft("");
  };

  const act = async (action: () => Promise<void>) => {
    setError(null);
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : "İşlem tamamlanamadı"); }
  };

  const pending = live.approvals.length + live.clarifiers.length + live.repeatBacks.length;
  return (
    <AnimatePresence>
      {chatOpen && (
        <motion.aside className="apex-chat-drawer apex-glass" initial={{ x: "102%", opacity: 0.3 }} animate={{ x: 0, opacity: 1 }} exit={{ x: "102%", opacity: 0.3 }} transition={{ type: "spring", damping: 28, stiffness: 250 }}>
          <header className="apex-chat-head"><div><span className="apex-brand-mark small"><Sparkles size={16} /></span><div><h2>APEX</h2><p><i data-online={live.isConnected} /> {live.isConnected ? "Canlı bağlantı" : "Bağlantı bekleniyor"}</p></div></div><button onClick={() => setChatOpen(false)} aria-label="Sohbeti kapat"><X size={18} /></button></header>
          {pending > 0 && (
            <div className="apex-confirm-stack">
              {live.approvals.map((item) => (
                <section className="apex-confirm-card" key={item.id}><div><ShieldCheck size={17} /><span><strong>İşlem onayı</strong><small>{item.impact.toUpperCase()} · {item.toolName}</small></span></div><p>{item.intent}</p>{item.reason && <em>{item.reason}</em>}<footer><button onClick={() => act(() => approve(item.id, "deny"))}>Reddet</button><button className="confirm" onClick={() => act(() => approve(item.id, "approve"))}><Check size={13} /> Onayla</button></footer></section>
              ))}
              {live.clarifiers.map((item) => (
                <section className="apex-confirm-card" key={item.id}><div><AlertTriangle size={17} /><span><strong>Doğru mu anladım?</strong><small>Güven %{Math.round(item.confidence * 100)}</small></span></div><p>{item.primary.label || item.transcript}</p><footer><button onClick={() => act(() => resolveVoicePrompt("clarifier", item.id, "cancel"))}>İptal</button><button className="confirm" onClick={() => act(() => resolveVoicePrompt("clarifier", item.id, "confirm"))}>Doğrula</button></footer></section>
              ))}
              {live.repeatBacks.map((item) => (
                <section className="apex-confirm-card" key={item.id}><div><Mic size={17} /><span><strong>Sesli komutu doğrula</strong><small>Güven %{Math.round(item.confidence * 100)}</small></span></div><p>{item.transcript}</p><footer><button onClick={() => act(() => resolveVoicePrompt("repeat-back", item.id, "cancel"))}>İptal</button><button className="confirm" onClick={() => act(() => resolveVoicePrompt("repeat-back", item.id, "confirm"))}>Devam et</button></footer></section>
              ))}
              {error && <div className="apex-action-error">{error}</div>}
            </div>
          )}
          <div className="apex-chat-thread">
            {live.messages.length === 0 ? (
              <div className="apex-chat-welcome"><Bot size={28} /><h3>APEX hazır.</h3><p>Yazabilir, mikrofona dokunabilir veya Space tuşuna basılı tutabilirsin.</p></div>
            ) : live.messages.map((message) => <MessageBubble key={message.id} message={message} />)}
            {(live.thinking || (live.isResponding && !live.messages.at(-1)?.isStreaming)) && <div className="apex-thinking"><i /><i /><i /><span>APEX düşünüyor</span></div>}
            <div ref={endRef} />
          </div>
          {voice.partialTranscript && <div className="apex-partial-transcript"><Mic size={13} /> {voice.partialTranscript}</div>}
          <form className="apex-composer" onSubmit={submit}>
            <button type="button" className={voice.voiceState === "recording" ? "recording" : ""} onClick={toggleMic} disabled={!voice.isMicAvailable} title="Sesli konuş"><Mic size={17} /></button>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={live.isConnected ? "APEX'e bir şey sor..." : "Daemon bağlantısı bekleniyor..."} rows={1} disabled={!live.isConnected} />
            {live.isResponding || live.thinking || voice.voiceState === "speaking" ? <button type="button" className="stop" onClick={stop} title="Yanıtı durdur"><Square size={15} /></button> : <button type="submit" disabled={!draft.trim() || !live.isConnected} title="Gönder"><Send size={16} /></button>}
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [details, setDetails] = useState(false);
  const hasSteps = Boolean(message.toolCalls?.length || message.subAgentEvents?.length);
  return (
    <motion.article className={`apex-message is-${message.role}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="apex-message-icon">{message.role === "user" ? <User size={14} /> : message.role === "assistant" ? <Bot size={14} /> : <AlertTriangle size={14} />}</div>
      <div className="apex-message-content"><div className="apex-message-meta"><strong>{message.role === "user" ? "Sen" : message.role === "assistant" ? "APEX" : "Sistem"}</strong><time>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><MarkdownBody text={message.content || (message.isStreaming ? "…" : "")} />
        {hasSteps && <div className="apex-message-steps"><button onClick={() => setDetails(!details)}>İşlem ayrıntıları <ChevronDown size={13} className={details ? "open" : ""} /></button><AnimatePresence>{details && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>{message.toolCalls?.map((tool, index) => <p key={`${tool.name}-${index}`}><span>TOOL</span>{tool.name}</p>)}{message.subAgentEvents?.map((event, index) => <p key={`${event.agentId}-${index}`}><span>AGENT</span>{event.agentName}: {event.type}</p>)}</motion.div>}</AnimatePresence></div>}
      </div>
    </motion.article>
  );
}
