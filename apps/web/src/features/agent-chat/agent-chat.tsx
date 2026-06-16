"use client";

import { RotateCcw, SendHorizonal, Square } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ProtectedOperationHint } from "@/components/auth/protected-operation-hint";
import { useEffectiveCredentials } from "@/components/auth/session-provider";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { notify } from "@/components/notifications/toast-provider";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  runAgentStream,
  type AgentMessage,
  type AgentRunContext,
  type AgentRunStep,
  type AgentStreamEvent,
} from "@/lib/api/client";

type ChatStatus = "idle" | "streaming" | "done" | "error" | "cancelled";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type RunSnapshot = {
  message: string;
  history: AgentMessage[];
};

type RunMetadata = {
  stopReason: string;
  durationMs: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  steps: AgentRunStep[];
  context: AgentRunContext;
};

export function AgentChat() {
  const [message, setMessage] = useState("用简短的中文介绍当前企业级 Agent 平台。");
  const [apiKey, setApiKey] = useState("");
  const [serviceToken, setServiceToken] = useState("");
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [metadata, setMetadata] = useState<RunMetadata | undefined>();
  const [lastRun, setLastRun] = useState<RunSnapshot | undefined>();
  const abortRef = useRef<AbortController | undefined>(undefined);

  const canSubmit = status !== "streaming" && message.trim().length > 0;
  const canRetry = status !== "streaming" && Boolean(lastRun);
  const { credentials, hasCredentials, usingSession } = useEffectiveCredentials(apiKey, serviceToken);

  const history = useMemo<AgentMessage[]>(
    () =>
      messages
        .filter((item) => item.content.trim().length > 0)
        .map((item) => ({
          role: item.role,
          content: item.content,
        })),
    [messages],
  );

  async function submit(): Promise<void> {
    if (!canSubmit) {
      return;
    }

    const nextRun: RunSnapshot = {
      message: message.trim(),
      history,
    };
    setLastRun(nextRun);
    await startRun(nextRun, { appendUserMessage: true });
  }

  async function retry(): Promise<void> {
    if (!lastRun) {
      return;
    }

    await startRun(lastRun, { appendUserMessage: false });
  }

  async function startRun(
    run: RunSnapshot,
    options: { appendUserMessage: boolean },
  ): Promise<void> {
    const requestId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: `${requestId}-assistant`,
      role: "assistant",
      content: "",
    };

    setMessages((current) => {
      const next = [...current];
      if (options.appendUserMessage) {
        next.push({
          id: `${requestId}-user`,
          role: "user",
          content: run.message,
        });
      }
      next.push(assistantMessage);
      return next;
    });
    setEvents([`started request ${requestId}`]);
    setMetadata(undefined);
    setErrorMessage(undefined);
    setStatus("streaming");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await runAgentStream({
        requestId,
        message: run.message,
        messages: run.history,
        ...credentials,
        signal: controller.signal,
        timeoutMs: 120_000,
        idleTimeoutMs: 45_000,
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
      const messageText = normalizeStreamError(error);
      setErrorMessage(messageText);
      notify({
        title: "Agent stream failed",
        message: messageText,
        tone: "danger",
      });
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
      setMetadata({
        stopReason: event.data.stopReason,
        durationMs: event.data.durationMs,
        usage: event.data.usage,
        steps: event.data.steps,
        context: event.data.context,
      });
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

  function clearConversation(): void {
    setMessages([]);
    setEvents([]);
    setMetadata(undefined);
    setErrorMessage(undefined);
    setStatus("idle");
    setLastRun(undefined);
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
              <button type="button" className="refresh-button" onClick={() => void retry()} disabled={!canRetry}>
                <RotateCcw className="icon-sm" aria-hidden="true" />
                Retry
              </button>
              <button type="button" className="refresh-button" onClick={cancel} disabled={status !== "streaming"}>
                <Square className="icon-sm" aria-hidden="true" />
                Stop
              </button>
              <button type="button" className="refresh-button" onClick={clearConversation} disabled={status === "streaming"}>
                Clear
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
              <ProtectedOperationHint
                hasCredentials={hasCredentials}
                permissions={["agent:run"]}
                title="Agent run permission"
              />
              {usingSession ? <div className="alert alert-success">Using signed-in Web Console session.</div> : null}
              <label>
                <span className="label">API key</span>
                <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="text-input" disabled={usingSession} />
              </label>
              <label>
                <span className="label">Service token</span>
                <input value={serviceToken} onChange={(event) => setServiceToken(event.target.value)} className="text-input" disabled={usingSession} />
              </label>
            </div>
          </section>

          <RunMetadataPanel metadata={metadata} errorMessage={errorMessage} events={events} />
        </aside>
      </section>
    </div>
  );
}

function normalizeStreamError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Agent stream failed.";
  }

  if (error.message.includes("idle timeout")) {
    return "Agent stream stopped because no events were received for 45 seconds. Check API logs or retry the run.";
  }

  if (error.message.includes("timed out")) {
    return "Agent stream exceeded the 120 second client timeout. Shorten the task or inspect the backend run.";
  }

  if (error.name === "AbortError") {
    return "Agent stream was disconnected before completion.";
  }

  return error.message;
}

function RunMetadataPanel({
  metadata,
  errorMessage,
  events,
}: {
  metadata: RunMetadata | undefined;
  errorMessage: string | undefined;
  events: string[];
}) {
  return (
    <section className="section-card">
      <div className="section-card-header">
        <h2 className="section-card-title">Run Details</h2>
        <p className="section-card-description">SSE lifecycle, context, usage, and tool/model timeline.</p>
      </div>
      <div className="section-card-body">
        {errorMessage ? <div className="alert alert-danger">{errorMessage}</div> : null}
        <dl className="details-grid single">
          <div>
            <dt className="label">Usage</dt>
            <dd className="detail-value">
              {metadata
                ? `${metadata.usage.totalTokens} tokens, ${metadata.durationMs} ms`
                : "not reported"}
            </dd>
          </div>
          <div>
            <dt className="label">Stop reason</dt>
            <dd className="detail-value">{metadata?.stopReason ?? "not reported"}</dd>
          </div>
          <div>
            <dt className="label">Context</dt>
            <dd className="detail-value">
              {metadata
                ? `${metadata.context.estimatedInputTokens} estimated tokens, ${metadata.context.droppedMessages} dropped`
                : "not reported"}
            </dd>
          </div>
        </dl>

        <h3 className="subsection-title">Context Sources</h3>
        <ul className="compact-list">
          {metadata?.context.sources.map((source) => (
            <li key={`${source.layer}-${source.id}`}>
              <span>{source.layer}</span>
              <span>{source.included ? "included" : "dropped"}</span>
              <span>{source.tokens} tokens</span>
            </li>
          )) ?? <li>No sources yet.</li>}
        </ul>

        <h3 className="subsection-title">Timeline</h3>
        <ol className="event-list">
          {metadata?.steps.map((step, index) => (
            <li key={`${step.type}-${step.step}-${index}`}>
              {step.type === "model"
                ? `model step ${step.step}: ${step.response.model}, ${step.response.latencyMs} ms, ${step.response.toolCalls.length} tool calls`
                : `tool step ${step.step}: ${step.toolName}, ${step.status}, ${step.latencyMs} ms`}
            </li>
          )) ?? <li>No steps yet.</li>}
        </ol>

        <h3 className="subsection-title">Stream Events</h3>
        <ol className="event-list">
          {events.map((event, index) => (
            <li key={`${event}-${index}`}>{event}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}
