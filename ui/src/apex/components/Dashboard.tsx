import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, ArrowRight, AudioLines, Bot, Brain, CheckCircle2, CircleDot, Clock3,
  Code2, Database, FileSearch, ListTodo, MessageSquareText, Mic, Play, Radio,
  ScanSearch, Send, Sparkles, Square, Terminal, Users, Zap,
  type LucideIcon,
} from "lucide-react";
import { openRoom } from "../../v2/router";
import { AICore } from "../core/AICore";
import { useApex } from "../ApexContext";
import type { ApexCoreState } from "../types";
import { QuickActionButton } from "./QuickActionButton";

const STATE_LABEL: Record<ApexCoreState, string> = {
  idle: "Hazır ve seni bekliyorum",
  listening: "Dinliyorum...",
  thinking: "İşliyorum...",
  speaking: "Yanıtlıyorum...",
};

const STATE_HINT: Record<ApexCoreState, string> = {
  idle: "Bir şey sor, görev ver ya da Space tuşuna basılı tut.",
  listening: "Konuşman bittiğinde bırak; dili otomatik algılarım.",
  thinking: "Bağlamı ve araç sonuçlarını değerlendiriyorum.",
  speaking: "Yanıtı kesmek veya yeni bir şey söylemek için çekirdeğe dokun.",
};

export function CoreHero() {
  const { coreState, cinematic, voice, toggleMic, live, setChatOpen } = useApex();
  return (
    <motion.section className={`apex-hero state-${coreState}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="apex-hero-grid" />
      <div className="apex-mountain mountain-a" /><div className="apex-mountain mountain-b" />
      <div className="apex-core-wrap" role="button" tabIndex={0} onClick={toggleMic} onKeyDown={(event) => event.key === "Enter" && toggleMic()} aria-label="Sesli konuşmayı başlat veya durdur">
        <AICore state={coreState} level={voice.micLevel} cinematic={cinematic} />
        <div className="apex-core-rings"><i /><i /><i /></div>
      </div>
      <div className="apex-state-copy">
        <span className="apex-eyebrow"><CircleDot size={12} /> APEX CORE · {coreState.toUpperCase()}</span>
        <AnimatePresence mode="wait">
          <motion.h1 key={coreState} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>{STATE_LABEL[coreState]}</motion.h1>
        </AnimatePresence>
        <p>{voice.partialTranscript || STATE_HINT[coreState]}</p>
        <div className="apex-hero-actions">
          <button className={`apex-primary ${coreState === "listening" ? "active" : ""}`} onClick={toggleMic} disabled={!voice.isMicAvailable || voice.muted}>
            {coreState === "listening" ? <Square size={15} /> : <Mic size={16} />}{coreState === "listening" ? "Dinlemeyi Bitir" : "Konuş"}
          </button>
          <button className="apex-secondary" onClick={() => setChatOpen(true)}><MessageSquareText size={16} /> Yazılı Sohbet</button>
        </div>
      </div>
      <div className="apex-wave-strip" aria-label="Mikrofon seviyesi">
        {Array.from({ length: 34 }).map((_, index) => (
          <i key={index} style={{ height: `${7 + Math.max(voice.micLevel * 42, Math.sin(index * 1.72) * 4 + 4)}px`, animationDelay: `${index * -35}ms` }} />
        ))}
      </div>
      {!live.isConnected && <div className="apex-offline-banner">Daemon bağlantısı bekleniyor. Sohbet ve eylemler bağlantı kurulunca etkinleşecek.</div>}
    </motion.section>
  );
}

const QUICK = [
  { title: "Günü Planla", text: "Bugün için önceliklerimi, takvimimi ve açık görevlerimi analiz ederek uygulanabilir bir plan oluştur.", icon: ListTodo, color: "violet" },
  { title: "Derin Araştır", text: "Araştırmak istediğim konuyu netleştir ve kaynaklı, karşılaştırmalı bir araştırma planı başlat.", icon: FileSearch, color: "cyan" },
  { title: "Kod Ortağım", text: "Üzerinde çalıştığım kod görevini anlamak için doğru soruları sor ve sonra güvenli bir uygulama planı çıkar.", icon: Code2, color: "blue" },
  { title: "Ekranı Analiz Et", text: "Mevcut ekran bağlamımı analiz et ve dikkat etmem gereken en önemli noktaları söyle.", icon: ScanSearch, color: "pink" },
] as const;

export function QuickActions() {
  const { send, live, data } = useApex();
  return (
    <section className="apex-quick-section">
      <div className="apex-section-title"><span>HIZLI BAŞLAT</span><strong>Ne yapmak istersin?</strong></div>
      <div className="apex-quick-grid">
        {QUICK.map(({ title, text, icon: Icon, color }, index) => {
          const unavailable = title === "Ekranı Analiz Et" && data.awareness?.enabled !== true;
          return (
            <QuickActionButton
              key={title}
              color={color}
              title={title}
              text={text}
              icon={Icon}
              onSend={send}
              disabled={!live.isConnected || unavailable}
              tooltip={unavailable ? "Önce üst bardan ekran farkındalığını aç" : undefined}
              data-testid={index === 0 ? "quick-action-send" : undefined}
              summary={unavailable ? "Ekran farkındalığı kapalı" : text.split(".")[0] ?? text}
            />
          );
        })}
      </div>
    </section>
  );
}

function relativeTime(timestamp?: number | null): string {
  if (!timestamp) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds} sn önce`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dk önce`;
  return `${Math.floor(seconds / 3600)} sa önce`;
}

export function RightRail() {
  const { data, live } = useApex();
  const busyAgents = data.agents.filter((agent) => agent.busy || agent.status === "active");
  const recentTasks = data.tasks.slice(0, 4);
  const knowledge = [...data.entities.slice(0, 3), ...data.documents.slice(0, 2).map((doc) => ({ id: doc.id, name: doc.title ?? doc.name ?? "Belge", type: doc.format ?? "document", updated_at: doc.updated_at ?? doc.created_at }))].slice(0, 4);
  return (
    <aside className="apex-right-rail">
      <RailCard eyebrow="AJAN AĞI" title="Aktif Ajanlar" icon={Users} action={() => openRoom("agents")}>
        {data.agents.length === 0 ? <EmptyLine text="Aktif ajan bulunamadı" /> : data.agents.slice(0, 4).map((agent) => (
          <div className="apex-agent-row" key={agent.id}><span className={`agent-avatar ${agent.busy ? "busy" : ""}`}><Bot size={15} /></span><div><strong>{agent.role?.name ?? agent.id}</strong><small>{agent.current_task ?? (agent.busy ? "Çalışıyor" : "Beklemede")}</small></div><i data-online={Boolean(agent.busy)} /></div>
        ))}
        {busyAgents.length > 0 && <div className="apex-card-foot"><Radio size={12} /> {busyAgents.length} ajan görev üzerinde</div>}
      </RailCard>
      <RailCard eyebrow="GÖREV KUYRUĞU" title="Görevler" icon={CheckCircle2} action={() => openRoom("tasks")}>
        {recentTasks.length === 0 && data.pausedTasks.length === 0 ? <EmptyLine text="Görev kuyruğu boş" /> : recentTasks.map((task) => (
          <div className="apex-task-row" key={task.id}><span className={`task-state is-${task.status}`}><Activity size={13} /></span><div><strong>{task.task}</strong><small>{task.agent_name ?? task.status} · {relativeTime(task.started_at)}</small></div></div>
        ))}
        {data.pausedTasks.length > 0 && <div className="apex-card-foot warning"><Clock3 size={12} /> {data.pausedTasks.length} görev girdi bekliyor</div>}
      </RailCard>
      <RailCard eyebrow="HAFIZA" title="Bilgi Tabanı" icon={Brain} action={() => openRoom("memory")}>
        {knowledge.length === 0 ? <EmptyLine text="Henüz kayıtlı bilgi yok" /> : knowledge.map((item) => (
          <div className="apex-knowledge-row" key={item.id}><Database size={14} /><div><strong>{item.name}</strong><small>{item.type} · {relativeTime(item.updated_at)}</small></div></div>
        ))}
        <div className="apex-card-foot"><Database size={12} /> {data.entities.length} varlık · {data.documents.length} belge</div>
      </RailCard>
      {!live.isConnected && <div className="apex-rail-warning">Canlı veriler daemon bağlantısı bekliyor.</div>}
    </aside>
  );
}

function RailCard({ eyebrow, title, icon: Icon, action, children }: { eyebrow: string; title: string; icon: LucideIcon; action: () => void; children: React.ReactNode }) {
  return <section className="apex-rail-card apex-glass"><div className="apex-rail-head"><div><span>{eyebrow}</span><h3><Icon size={15} />{title}</h3></div><button onClick={action}>Tümünü Gör <ArrowRight size={12} /></button></div>{children}</section>;
}

function EmptyLine({ text }: { text: string }) {
  return <div className="apex-empty-line"><CircleDot size={13} /> {text}</div>;
}

export function ActivityConsole() {
  const { live, send } = useApex();
  const [command, setCommand] = useState("");
  const events = useMemo(() => {
    const task = live.taskEvents.map((event) => ({ id: `task-${event.timestamp}-${event.task.id}`, at: event.timestamp, type: "TASK", text: `${event.action}: ${event.task.what}` }));
    const agents = live.agentActivity.map((event) => ({ id: event.id, at: event.timestamp, type: `AGENT:${event.agentName}`, text: event.eventType === "text" ? String(event.data) : event.eventType }));
    const workflow = live.workflowEvents.map((event) => ({ id: `${event.workflowId}-${event.timestamp}`, at: event.timestamp, type: "FLOW", text: event.type }));
    return [...task, ...agents, ...workflow].sort((a, b) => b.at - a.at).slice(0, 8);
  }, [live.agentActivity, live.taskEvents, live.workflowEvents]);
  const submit = (event: React.FormEvent) => { event.preventDefault(); send(command); setCommand(""); };

  return (
    <section className="apex-console apex-glass">
      <div className="apex-console-head"><div><Terminal size={15} /><strong>Etkinlik Akışı</strong><span>SALT OKUNUR</span></div><button onClick={() => openRoom("logs")}>Tüm loglar <ArrowRight size={12} /></button></div>
      <div className="apex-console-body">
        {events.length === 0 ? <div className="apex-console-empty">Canlı ajan, görev ve iş akışı olayları burada görünecek.</div> : events.map((event) => (
          <div className="apex-log-line" key={event.id}><time>{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><b>{event.type}</b><span>{event.text}</span></div>
        ))}
      </div>
      <form className="apex-console-input" onSubmit={submit}><span>›</span><input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="APEX'e güvenli bir görev ilet..." /><button disabled={!command.trim() || !live.isConnected}><Send size={14} /></button></form>
    </section>
  );
}
