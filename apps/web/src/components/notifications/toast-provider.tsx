"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

type ToastTone = "success" | "warning" | "danger" | "neutral";

export type ToastPayload = {
  title: string;
  message?: string;
  tone?: ToastTone;
};

type ToastItem = ToastPayload & {
  id: string;
};

const TOAST_EVENT = "enterprise-agent:toast";

export function notify(payload: ToastPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }));
}

export function ToastProvider() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(event: Event): void {
      const detail = (event as CustomEvent<ToastPayload>).detail;
      const id = crypto.randomUUID();
      setItems((current) => [
        ...current.slice(-3),
        {
          id,
          title: detail.title,
          message: detail.message,
          tone: detail.tone ?? "neutral",
        },
      ]);
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, 5000);
    }

    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="toast-region" aria-live="polite" aria-label="Notifications">
      {items.map((item) => (
        <article key={item.id} className={`toast toast-${item.tone}`}>
          <div className="toast-icon">
            {item.tone === "success" ? (
              <CheckCircle2 className="icon-sm" aria-hidden="true" />
            ) : item.tone === "danger" || item.tone === "warning" ? (
              <TriangleAlert className="icon-sm" aria-hidden="true" />
            ) : (
              <Info className="icon-sm" aria-hidden="true" />
            )}
          </div>
          <div className="toast-body">
            <div className="toast-title">{item.title}</div>
            {item.message ? <div className="toast-message">{item.message}</div> : null}
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}
            aria-label="Dismiss notification"
          >
            <X className="icon-sm" aria-hidden="true" />
          </button>
        </article>
      ))}
    </div>
  );
}
