"use client";

import { Square, SendHorizonal } from "lucide-react";
import { useRef, useState } from "react";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { StatusBadge } from "@/components/ui/status-badge";
import { runAgentStream, type AgentStreamEvent } from "@/lib/api/client";

type ChatStatus = "idle" | "streaming" | "done" | "error" | "cancelled";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

export function AgentChat() {
  const [message, setMessage] = useState("用简短的中文介绍当前企业级 Agent 平台。");
  const [apiKey, setApiKey] = useState("");
  const [serviceToken, setServiceToken] = useState("");
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [usage, setUsage] = useState<string>("not reported");
  const abortRef = useRef<AbortController | undefined>(undefined);

  const canSubmit = status !== "streaming" && message.trim().length > 0;

  async function submit(): Promise<void> {
    if (!canSubmit) {
      return;
    }

    const requestId = crypto.randomUUID();
    const userMessage: ChatMessage = {
      id: `${requestId}-user`,
      role: "user",
      content: message.trim(),
    };
    const assistantMessage: ChatMessage = {
      id: `${requestId}-assistant`,
      role: "assistant",
      content: "",
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setEvents([`started request ${requestId}`]);
    setUsage("not reported");
    setErrorMessage(undefined);
    setStatus("streaming");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await runAgentStream({
        requestId,
        message: userMessage.content,
        apiKey: apiKey.trim() || undefined,
        serviceToken: serviceToken.trim() || undefined,
        signal: controller.signal,
        onEvent: (event) => handleStreamEvent(event, assistantMessage.id),
      });
      setStatus((current) => (current === "cancelled" ? current : "done"));
    } catch (error) {
      if (controller.signal.aborted) {
        setStatus("cancelled");
        setEvents((current) => [...current, "cancelled"]);
        return;
      }
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Agent stream failed.");
    } finally {
      abortRef.current = undefined;
    }
  }

  function handleStreamEvent(event: AgentStreamEvent, assistantMessageId: string): void {
    setEvents((current) => [...current, event.event]);

    if (event.event === "delta") {
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantMessageId
            ? { ...item, content: `${item.content}${event.data.content}` }
            : item,
        ),
      );
      return;
    }

    if (event.event === "result") {
      setUsage(
        `${event.data.usage.totalTokens} tokens, ${event.data.durationMs} ms, ${event.data.steps.length} steps`,
      );
      return;
    }

    if (event.event === "error") {
      setStatus("error");
      setErrorMessage(event.data.message);
    }
  }

  function cancel(): void {
    abortRef.current?.abort();
    setStatus("cancelled");
  }

  return (
    <div className="agent-chat-page">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Agent Chat</h1>
          <p className="dashboard-description">Streaming LLM entry for the enterprise Agent platform.</p>
        </div>
        <StatusBadge tone={status === "error" ? "danger" : status === "streaming" ? "warning" : "neutral"}>
          {status}
        </StatusBadge>
      </div>

      <section className="chat-layout">
        <div className="chat-main">
          <div className="message-list" aria-live="polite">
            {messages.length === 0 ? (
              <div className="empty-state">Start a streaming Agent run from the composer below.</div>
            ) : null}
            {messages.map((item) => (
              <article key={item.id} className={`message message-${item.role}`}>
                <div className="message-role">{item.role}</div>
                <MarkdownRenderer content={item.content || (item.role === "assistant" ? "..." : "")} />
              </article>
            ))}
          </div>

          <div className="composer">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              className="composer-input"
              placeholder="Enter an Agent task..."
            />
            <div className="composer-actions">
              <button type="button" className="refresh-button" onClick={() => void submit()} disabled={!canSubmit}>
                <SendHorizonal className="icon-sm" aria-hidden="true" />
                Send
              </button>
              <button type="button" className="refresh-button" onClick={cancel} disabled={status !== "streaming"}>
                <Square className="icon-sm" aria-hidden="true" />
                Stop
              </button>
            </div>
          </div>
        </div>

        <aside className="chat-side">
          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Auth</h2>
              <p className="section-card-description">Use one local credential for the stream request.</p>
            </div>
            <div className="section-card-body auth-form">
              <label>
                <span className="label">API key</span>
                <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="text-input" />
              </label>
              <label>
                <span className="label">Service token</span>
                <input value={serviceToken} onChange={(event) => setServiceToken(event.target.value)} className="text-input" />
              </label>
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="section-card-title">Stream Events</h2>
              <p className="section-card-description">SSE lifecycle and run metadata.</p>
            </div>
            <div className="section-card-body">
              {errorMessage ? <div className="alert alert-danger">{errorMessage}</div> : null}
              <dl className="details-grid single">
                <div>
                  <dt className="label">Usage</dt>
                  <dd className="detail-value">{usage}</dd>
                </div>
              </dl>
              <ol className="event-list">
                {events.map((event, index) => (
                  <li key={`${event}-${index}`}>{event}</li>
                ))}
              </ol>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
