import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface GestureHintProps {
  icon: 'pinch' | 'tap' | 'drag' | 'cluster';
  text: string;
  position?: 'top' | 'center' | 'bottom';
  onDismiss: () => void;
  autoDismiss?: boolean;
  duration?: number;
}

const STORAGE_KEY_PREFIX = 'gesture-hint-shown-';

export default function GestureHint({
  icon,
  text,
  position = 'bottom',
  onDismiss,
  autoDismiss = true,
  duration = 4000
}: GestureHintProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const key = STORAGE_KEY_PREFIX + icon;
    if (localStorage.getItem(key) === 'true') {
      setVisible(false);
      onDismiss();
    }
  }, [icon, onDismiss]);

  useEffect(() => {
    if (!visible || !autoDismiss) return;

    const timer = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [visible, autoDismiss, duration]);

  const handleDismiss = () => {
    const key = STORAGE_KEY_PREFIX + icon;
    localStorage.setItem(key, 'true');
    setVisible(false);
    onDismiss();
  };

  if (!visible) return null;

  const getIconSvg = () => {
    switch (icon) {
      case 'pinch':
        return (
          <svg viewBox="0 0 48 48" className="w-12 h-12">
            <path
              d="M12 24 C12 18 16 14 22 14 L26 14 C32 14 36 18 36 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="4 4"
            >
              <animateTransform
                attributeName="transform"
                type="scale"
                values="1;0.8;1"
                dur="1.5s"
                repeatCount="indefinite"
                additive="sum"
                origin="24 24"
              />
            </path>
            <circle cx="22" cy="14" r="4" fill="currentColor" opacity="0.6"/>
            <circle cx="26" cy="14" r="4" fill="currentColor" opacity="0.6"/>
          </svg>
        );
      case 'tap':
        return (
          <svg viewBox="0 0 48 48" className="w-12 h-12">
            <circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3"/>
            <circle cx="24" cy="24" r="8" fill="currentColor" opacity="0">
              <animate attributeName="opacity" values="0;0.5;0" dur="1.5s" repeatCount="indefinite"/>
              <animate attributeName="r" values="8;20" dur="1.5s" repeatCount="indefinite"/>
            </circle>
            <circle cx="24" cy="24" r="6" fill="currentColor"/>
          </svg>
        );
      case 'drag':
        return (
          <svg viewBox="0 0 48 48" className="w-12 h-12">
            <path d="M16 32 L24 24 L32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M24 24 L24 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0;0 -4;0 0"
                dur="1s"
                repeatCount="indefinite"
              />
            </path>
          </svg>
        );
      case 'cluster':
        return (
          <svg viewBox="0 0 48 48" className="w-12 h-12">
            <circle cx="24" cy="24" r="16" fill="currentColor" opacity="0.2"/>
            <circle cx="18" cy="20" r="4" fill="currentColor"/>
            <circle cx="30" cy="20" r="4" fill="currentColor"/>
            <circle cx="24" cy="32" r="4" fill="currentColor">
              <animate attributeName="r" values="4;6;4" dur="1s" repeatCount="indefinite"/>
            </circle>
          </svg>
        );
    }
  };

  const positionClasses = {
    top: 'top-20 left-1/2 -translate-x-1/2',
    center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    bottom: 'bottom-24 left-1/2 -translate-x-1/2'
  };

  return (
    <motion.div
      className={`fixed ${positionClasses[position]} z-[80] pointer-events-auto`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
    >
      <div className="relative">
        <motion.div
          className="absolute inset-0 -m-4 bg-black/20 rounded-full"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1.2, opacity: 1 }}
          exit={{ scale: 1, opacity: 0 }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />

        <div
          className="relative bg-bg/95 backdrop-blur-md border-2 border-accent rounded-2xl px-5 py-4 shadow-2xl flex items-center gap-3 cursor-pointer touch-manipulation"
          onClick={handleDismiss}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleDismiss()}
          aria-label="Dismiss hint"
        >
          <div className="text-accent shrink-0">
            {getIconSvg()}
          </div>
          <span className="text-ink text-sm font-medium whitespace-nowrap">
            {text}
          </span>
          <button
            className="ml-2 text-ink3 hover:text-ink transition-colors p-1 -mr-1"
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
