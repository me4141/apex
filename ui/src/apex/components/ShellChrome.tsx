import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, Bell, Bot, BrainCircuit, CheckSquare2, ChevronDown, CircleUserRound,
  Command, Database, Eye, Gauge, LayoutDashboard, Mic, MonitorUp, MoonStar,
  Search, Settings, ShieldCheck, Sparkles, SquarePlus, TerminalSquare, Users, Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { openRoom, type RoomKey } from "../../v2/router";
import { useApex } from "../ApexContext";

const NAV: Array<{ label: string; room?: RoomKey; icon: LucideIcon }> = [
  { label: "Ana Merkez", icon: LayoutDashboard },
  { label: "Ajanlar", room: "agents", icon: Users },
  { label: "Görevler", room: "tasks", icon: CheckSquare2 },
  { label: "Hafıza", room: "memory", icon: Database },
  { label: "İş Akışları", room: "workflows", icon: Workflow },
  { label: "Yetki", room: "authority", icon: ShieldCheck },
  { label: "Etkinlik", room: "logs", icon: TerminalSquare },
];

function getProfileName(answers: Record<string, string> | undefined): string {
  if (!answers) return "APEX User";
  const key = Object.keys(answers).find((item) => /(^|_)(name|isim|ad)(_|$)/i.test(item));
  return (key ? answers[key] : null)?.trim() || "APEX User";
}

export function Sidebar() {
  const { live, data } = useApex();
  const running = Object.values(data.health?.services ?? {}).filter((status) => status === "running").length;
  const services = Object.keys(data.health?.services ?? {}).length;
  const model = data.llm?.effective?.tiers?.conversation?.ref ?? data.llm?.default ?? "Yapılandırılmadı";

  return (
    <aside className="apex-sidebar apex-glass">
      <div className="apex-brand">
        <div className="apex-brand-mark"><BrainCircuit size={23} /></div>
        <div><strong>APEX</strong><span>NEURAL OPERATING SYSTEM</span></div>
      </div>
      <nav className="apex-nav" aria-label="Ana navigasyon">
        <div className="apex-section-label">KONTROL MERKEZİ</div>
        {NAV.map(({ label, room, icon: Icon }, index) => (
          <button key={label} className={index === 0 ? "active" : ""} onClick={() => room ? openRoom(room) : document.querySelector(".apex-main")?.scrollTo({ top: 0, behavior: "smooth" })}>
            <Icon size={17} /><span>{label}</span>{index === 0 && <i />}
          </button>
        ))}
      </nav>
      <div className="apex-sidebar-spacer" />
      <button className="apex-model-card" onClick={() => openRoom("settings")} title="Model ayarlarını aç">
        <span className="apex-dot" data-online={live.isConnected} />
        <span><small>AKTİF MODEL</small><strong>{model.split(":").slice(-1)[0]}</strong></span>
        <ChevronDown size={14} />
      </button>
      <div className="apex-system-mini">
        <div><span>SERVİSLER</span><strong>{services ? `${running}/${services}` : "—"}</strong></div>
        <div><span>VERİTABANI</span><strong>{data.health?.database.connected ? "BAĞLI" : "—"}</strong></div>
      </div>
      <button className="apex-settings-link" onClick={() => openRoom("settings")}><Settings size={16} /> Ayarlar</button>
    </aside>
  );
}

export function TopBar() {
  const { live, voice, data, cinematic, setCinematic, setPaletteOpen, setNotificationOpen, notificationOpen, send, toggleMic } = useApex();
  const [profileOpen, setProfileOpen] = useState(false);
  const name = getProfileName(data.profile?.profile?.answers);
  const unread = live.notices.length + live.approvals.length + live.clarifiers.length + live.repeatBacks.length;

  const toggleAwareness = async () => {
    await data.setAwarenessEnabled(!(data.awareness?.enabled ?? false));
  };

  const switchClassic = () => {
    localStorage.setItem("apex.ui.mode", "v2");
    const url = new URL(window.location.href);
    url.searchParams.set("ui", "v2");
    window.location.assign(url.toString());
  };

  return (
    <header className="apex-topbar apex-glass">
      <button className="apex-search-trigger" onClick={() => setPaletteOpen(true)}>
        <Search size={16} /><span>APEX'te ara...</span><kbd>Ctrl K</kbd>
      </button>
      <div className="apex-top-actions">
        <button
          className="apex-icon-button"
          onClick={toggleMic}
          disabled={!voice.isMicAvailable || voice.muted}
          title={voice.muted ? "Mikrofon sessiz" : voice.voiceState === "recording" ? "Dinlemeyi durdur" : "Konuşmayı başlat"}
          aria-label={voice.voiceState === "recording" ? "Dinlemeyi durdur" : "Konuşmayı başlat"}
        >
          <Mic size={17} className={voice.voiceState === "recording" ? "pulse" : ""} />
        </button>
        <button className={`apex-icon-button ${cinematic ? "active" : ""}`} onClick={() => setCinematic(!cinematic)} title="Sinematik efektleri aç/kapat">
          <MoonStar size={17} />
        </button>
        <button className="apex-new-task" onClick={() => send("Yeni bir görev oluşturmama yardım et; önce hedefi ve başarı ölçütünü netleştir.")} disabled={!live.isConnected}>
          <SquarePlus size={16} /> Yeni Görev
        </button>
        <button className={`apex-share ${data.awareness?.enabled ? "active" : ""}`} onClick={toggleAwareness} title="Ekran farkındalığını aç/kapat">
          <MonitorUp size={16} /> {data.awareness?.enabled ? "Ekran Açık" : "Ekran Paylaş"}
        </button>
        <button className="apex-icon-button notification" onClick={() => setNotificationOpen(!notificationOpen)} title="Bildirimler">
          <Bell size={17} />{unread > 0 && <b>{unread}</b>}
        </button>
        <div className="apex-profile-wrap">
          <button className="apex-profile" onClick={() => setProfileOpen(!profileOpen)}><CircleUserRound size={24} /><span>{name}</span><ChevronDown size={13} /></button>
          <AnimatePresence>
            {profileOpen && (
              <motion.div className="apex-profile-menu apex-glass" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <button onClick={() => openRoom("settings")}><Settings size={15} /> Profil ve Ayarlar</button>
                <button onClick={switchClassic}><LayoutDashboard size={15} /> Klasik Arayüz</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

export function NotificationTray() {
  const { live, notificationOpen, setNotificationOpen } = useApex();
  const entries = useMemo(() => [
    ...live.notices.map((item) => ({ id: item.id, title: item.title, text: item.text, dismissible: true })),
    ...live.approvals.map((item) => ({ id: item.id, title: "Onay bekliyor", text: item.intent, dismissible: false })),
    ...live.clarifiers.map((item) => ({ id: item.id, title: "Netleştirme gerekli", text: item.transcript, dismissible: false })),
    ...live.repeatBacks.map((item) => ({ id: item.id, title: "Doğrulama gerekli", text: item.transcript, dismissible: false })),
  ], [live.approvals, live.clarifiers, live.notices, live.repeatBacks]);

  return (
    <AnimatePresence>
      {notificationOpen && (
        <motion.aside className="apex-notification-tray apex-glass" initial={{ opacity: 0, x: 22 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 22 }}>
          <div className="apex-panel-heading"><div><span>CANLI AKIŞ</span><h3>Bildirimler</h3></div><button onClick={() => setNotificationOpen(false)}>×</button></div>
          {entries.length === 0 ? <div className="apex-empty"><Bell size={20} /> Yeni bildirim yok</div> : entries.map((entry) => (
            <div className="apex-notice" key={entry.id}><Activity size={15} /><div><strong>{entry.title}</strong><p>{entry.text}</p></div>{entry.dismissible && <button onClick={() => live.dismissNotice(entry.id)} aria-label="Bildirimi kapat"><X size={13} /></button>}</div>
          ))}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export function StatusBar() {
  const { live, voice, data, coreState } = useApex();
  const heapPercent = data.health?.memory.heapTotal ? Math.round((data.health.memory.heapUsed / data.health.memory.heapTotal) * 100) : null;
  return (
    <footer className="apex-statusbar">
      <div><span className="apex-dot" data-online={live.isConnected} /> {live.isConnected ? "Daemon bağlı" : "Daemon bağlantısı yok"}</div>
      <div><Bot size={13} /> {data.agents.filter((agent) => agent.busy).length} aktif ajan</div>
      <div><Gauge size={13} /> {heapPercent === null ? "Bellek —" : `Daemon heap %${heapPercent}`}</div>
      <div><Eye size={13} /> {data.awareness?.enabled ? "Farkındalık açık" : "Farkındalık kapalı"}</div>
      <div className="apex-status-spacer" />
      <div><Command size={12} /> Space: konuş</div>
      <div><Sparkles size={13} /> {coreState.toUpperCase()}</div>
    </footer>
  );
}
