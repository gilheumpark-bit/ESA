'use client';

/**
 * Toast Notification System
 *
 * PART 1: Toast store (zustand-free, module-level)
 * PART 2: ToastContainer (portal)
 * PART 3: Public API: toast.success / toast.error / toast.info
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Toast Store
// ═══════════════════════════════════════════════════════════════════════════════

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  createdAt: number;
}

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 3000;

type Listener = () => void;
let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();

function emitChange() {
  listeners.forEach((fn) => fn());
}

function addToast(type: ToastType, message: string) {
  const item: ToastItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    message,
    createdAt: Date.now(),
  };

  toasts = [item, ...toasts].slice(0, MAX_TOASTS);
  emitChange();

  // Auto-dismiss
  setTimeout(() => {
    removeToast(item.id);
  }, AUTO_DISMISS_MS);
}

function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emitChange();
}

function useToastStore(): ToastItem[] {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return toasts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — ToastContainer
// ═══════════════════════════════════════════════════════════════════════════════

const ICON_MAP: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const COLOR_MAP: Record<ToastType, string> = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  info: 'text-blue-500',
};

const BG_MAP: Record<ToastType, string> = {
  success: 'border-emerald-200 dark:border-emerald-800',
  error: 'border-red-200 dark:border-red-800',
  info: 'border-blue-200 dark:border-blue-800',
};

function ToastItemView({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const Icon = ICON_MAP[item.type];

  return (
    <div
      className={`
        flex items-start gap-2.5 rounded-lg border bg-[var(--bg-primary)] px-4 py-3
        shadow-lg transition-all animate-in slide-in-from-right-5
        ${BG_MAP[item.type]}
      `}
      role="alert"
    >
      <Icon size={18} className={`mt-0.5 shrink-0 ${COLOR_MAP[item.type]}`} />
      <p className="flex-1 text-sm text-[var(--text-primary)]">{item.message}</p>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded p-0.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
        aria-label="닫기"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const items = useToastStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClose = useCallback((id: string) => {
    removeToast(id);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-[9999] flex w-80 flex-col gap-2"
      aria-live="polite"
    >
      {items.map((item) => (
        <ToastItemView
          key={item.id}
          item={item}
          onClose={() => handleClose(item.id)}
        />
      ))}
    </div>,
    document.body,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Public API
// ═══════════════════════════════════════════════════════════════════════════════

export const toast = {
  success: (message: string) => addToast('success', message),
  error: (message: string) => addToast('error', message),
  info: (message: string) => addToast('info', message),
};
