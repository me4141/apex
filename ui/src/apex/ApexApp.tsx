import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BrainCircuit } from "lucide-react";
import { ConfirmHost } from "../v2/ui/ConfirmDialog";
import { OnboardingGate } from "../v2/onboarding/OnboardingGate";
import { maybeRunUrlReset } from "../v2/onboarding/resetClient";
import { CommandPalette } from "../v2/palette/CommandPalette";
import type { PaletteResult, PaletteResultType } from "../v2/palette/types";
import { openRoom, type RoomKey } from "../v2/router";
import { ApexProvider, useApex } from "./ApexContext";
import { ActivityConsole, CoreHero, QuickActions, RightRail } from "./components/Dashboard";
import { ChatDrawer } from "./components/ChatDrawer";
import { NotificationTray, Sidebar, StatusBar, TopBar } from "./components/ShellChrome";
import "./apex.css";

const RESULT_ROOM: Record<PaletteResultType, RoomKey> = {
  workflow: "workflows",
  memory: "memory",
  tool: "tools",
  agent: "agents",
  authority: "authority",
  log: "logs",
};

export function ApexApp() {
  useEffect(() => { void maybeRunUrlReset(); }, []);
  return (
    <div className="apex-root">
      <ConfirmHost />
      <OnboardingGate>
        <ApexProvider><ApexDashboard /></ApexProvider>
      </OnboardingGate>
    </div>
  );
}

function ApexDashboard() {
  const { live, paletteOpen, setPaletteOpen } = useApex();
  const [booting, setBooting] = useState(() => sessionStorage.getItem("apex.booted") !== "true");

  useEffect(() => {
    if (!booting) return;
    const timer = window.setTimeout(() => { sessionStorage.setItem("apex.booted", "true"); setBooting(false); }, 1350);
    return () => window.clearTimeout(timer);
  }, [booting]);

  const pickObject = (result: PaletteResult) => openRoom(RESULT_ROOM[result.type]);

  return (
    <>
      <div className="apex-background"><i /><i /><i /></div>
      <div className="apex-shell">
        <Sidebar />
        <TopBar />
        <main className="apex-main">
          <div className="apex-center-column"><CoreHero /><QuickActions /><ActivityConsole /></div>
          <RightRail />
        </main>
        <StatusBar />
      </div>
      <ChatToggle />
      <ChatDrawer />
      <NotificationTray />
      <CommandPalette
        open={paletteOpen}
        enabled={live.isConnected}
        onClose={() => setPaletteOpen(false)}
        onPickObject={pickObject}
        onPickRoom={(entry) => openRoom(entry.key)}
      />
      <AnimatePresence>{booting && <BootSequence />}</AnimatePresence>
    </>
  );
}

function ChatToggle() {
  const { chatOpen, setChatOpen, live } = useApex();
  return <motion.button className="apex-chat-toggle" onClick={() => setChatOpen(!chatOpen)} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} aria-label={chatOpen ? "Sohbeti kapat" : "Sohbeti aç"}><BrainCircuit size={20} /><span>{live.isResponding ? "APEX çalışıyor" : "APEX ile konuş"}</span>{live.isResponding && <i />}</motion.button>;
}

function BootSequence() {
  return (
    <motion.div className="apex-boot" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      <motion.div className="apex-boot-mark" initial={{ scale: 0.82, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><BrainCircuit size={38} /></motion.div>
      <motion.h1 initial={{ letterSpacing: "0.9em", opacity: 0 }} animate={{ letterSpacing: "0.42em", opacity: 1 }}>APEX</motion.h1>
      <div className="apex-boot-line"><motion.i initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 1.05 }} /></div>
      <p>NEURAL INTERFACE INITIALIZING</p>
    </motion.div>
  );
}
