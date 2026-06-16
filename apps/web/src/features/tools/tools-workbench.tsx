"use client";

import { Play, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  executeTool,
  listTools,
  type ToolCallResponse,
  type ToolDefinition,
} from "@/lib/api/client";

function defaultArguments(toolName: string): string {
  if (toolName === "calculator") {
    return JSON.stringify({ expression: "(128 * 256) / 2" }, null, 2);
  }
  if (toolName === "current_time") {
    return JSON.stringify({ timeZone: "Asia/Shanghai" }, null, 2);
  }
  return JSON.stringify({}, null, 2);
}

export function ToolsWorkbench() {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [selectedName, setSelectedName] = useState<string>("");
  const [argumentsText, setArgumentsText] = useState(defaultArguments(""));
  const [apiKey, setApiKey] = useState("");
  const [serviceToken, setServiceToken] = useState("");
  const [result, setResult] = useState<ToolCallResponse | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.name === selectedName),
    [selectedName, tools],
  );

  async function refresh(): Promise<void> {
    setLoading(true);
    setErrorMessage(undefined);
    try {
      const nextTools = await listTools();
      setTools(nextTools);
      if (!selectedName && nextTools[0]) {
        setSelectedName(nextTools[0].name);
        setArgumentsText(defaultArguments(nextTools[0].name));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to list tools.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function runSelectedTool(): Promise<void> {
    if (!selectedTool) {
      return;
    }

    setLoading(true);
    setErrorMessage(undefined);
    setResult(undefined);

    try {
      const parsedArguments = JSON.parse(argumentsText) as Record<string, unknown>;
      const response = await executeTool({
        name: selectedTool.name,
        arguments: parsedArguments,
        apiKey: apiKey.trim() || undefined,
        serviceToken: serviceToken.trim() || undefined,
      });
      setResult(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Tool execution failed.");
    } finally {
      setLoading(false);
    }
  }

  function selectTool(name: string): void {
    setSelectedName(name);
    setArgumentsText(defaultArguments(name));
    setResult(undefined);
    setErrorMessage(undefined);
  }

  return (
    <div className="tools-page">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Tools</h1>
          <p className="dashboard-description">Inspect registered tools and run controlled local executions.</p>
        </div>
        <button type="button" className="refresh-button" onClick={() => void refresh()} disabled={loading}>
          <RefreshCcw className={`icon-sm ${loading ? "spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {errorMessage ? <div className="alert alert-danger">{errorMessage}</div> : null}

      <section className="tools-layout">
        <aside className="tool-list">
          {tools.map((tool) => (
            <button
              key={tool.name}
              type="button"
              className={tool.name === selectedName ? "tool-list-item tool-list-item-active" : "tool-list-item"}
              onClick={() => selectTool(tool.name)}
            >
              <span>{tool.name}</span>
              <StatusBadge tone={tool.source === "builtin" ? "success" : "neutral"}>{tool.source}</StatusBadge>
            </button>
          ))}
        </aside>

        <div className="tool-detail">
          {selectedTool ? (
            <>
              <section className="section-card">
                <div className="section-card-header">
                  <h2 className="section-card-title">{selectedTool.name}</h2>
                  <p className="section-card-description">{selectedTool.description}</p>
                </div>
                <div className="section-card-body">
                  <dl className="details-grid">
                    <div>
                      <dt className="label">Timeout</dt>
                      <dd className="detail-value">{selectedTool.timeoutMs} ms</dd>
                    </div>
                    <div>
                      <dt className="label">Result limit</dt>
                      <dd className="detail-value">{selectedTool.maxResultLength} chars</dd>
                    </div>
                    <div>
                      <dt className="label">Permissions</dt>
                      <dd className="detail-value">
                        {selectedTool.requiredPermissions.length > 0
                          ? selectedTool.requiredPermissions.join(", ")
                          : "none"}
                      </dd>
                    </div>
                  </dl>
                  <pre className="code-block">{JSON.stringify(selectedTool.inputSchema, null, 2)}</pre>
                </div>
              </section>

              <section className="section-card">
                <div className="section-card-header">
                  <h2 className="section-card-title">Execute</h2>
                  <p className="section-card-description">Provide credentials only for protected tool execution.</p>
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
                  <label>
                    <span className="label">Arguments JSON</span>
                    <textarea
                      value={argumentsText}
                      onChange={(event) => setArgumentsText(event.target.value)}
                      className="composer-input"
                      rows={8}
                    />
                  </label>
                  <button type="button" className="refresh-button" onClick={() => void runSelectedTool()} disabled={loading}>
                    <Play className="icon-sm" aria-hidden="true" />
                    Execute
                  </button>
                </div>
              </section>

              <section className="section-card">
                <div className="section-card-header">
                  <h2 className="section-card-title">Result</h2>
                  <p className="section-card-description">Tool response and audit preview.</p>
                </div>
                <div className="section-card-body">
                  {result ? (
                    <>
                      <StatusBadge tone={result.status === "success" ? "success" : "warning"}>{result.status}</StatusBadge>
                      <p className="tool-result-content">{result.content}</p>
                      <pre className="code-block">{JSON.stringify(result, null, 2)}</pre>
                    </>
                  ) : (
                    <div className="empty-state">No execution result yet.</div>
                  )}
                </div>
              </section>
            </>
          ) : (
            <div className="empty-state">No tools loaded.</div>
          )}
        </div>
      </section>
    </div>
  );
}
