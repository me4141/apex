import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Zap, type LucideIcon } from "lucide-react";

export function QuickActionButton({
  color, title, text, icon: Icon, onSend, disabled, tooltip, summary, ...buttonProps
}: {
  color: string;
  title: string;
  text: string;
  icon: LucideIcon;
  onSend: (text: string) => void;
  disabled?: boolean;
  tooltip?: string;
  summary: string;
  "data-testid"?: string;
}) {
  return (
    <motion.button
      className={`apex-quick-card tone-${color}`}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.985 }}
      onClick={() => onSend(text)}
      disabled={disabled}
      title={tooltip}
      {...buttonProps}
    >
      <div><Icon size={21} /><Zap size={13} /></div><strong>{title}</strong><span>{summary}</span><ArrowRight size={16} />
    </motion.button>
  );
}
