"use client";

import { CheckCircle2, ChevronDown, PauseCircle, Play, Plus, RefreshCcw, Server, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocalCredentialFields } from "@/components/auth/local-credential-fields";
import { useEffectiveCredentials, useSession } from "@/components/auth/session-provider";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  approveMcpServer,
  createMcpServer,
  deleteMcpServer,
  disableMcpServer,
  executeTool,
  listTools,
  listMcpServers,
  reloadMcpServers,
  updateMcpServer,
  type McpServer,
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

function parseStringArrayJson(value: string, label: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a JSON string array.`);
  }
  return parsed;
}

function parseStringRecordJson(value: string, label: string): Record<string, string> {
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  const entries = Object.entries(parsed);
  if (entries.some(([, item]) => typeof item !== "string")) {
    throw new Error(`${label} values must be strings.`);
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

type ToolGroup = {
  id: string;
  label: string;
  source: ToolDefinition["source"];
  tools: ToolDefinition[];
};

function toolGroupId(tool: ToolDefinition): string {
  if (tool.source === "builtin") {
    return "builtin";
  }
  return tool.serverName || tool.name.split(".")[0] || "mcp";
}

function groupTools(tools: ToolDefinition[]): ToolGroup[] {
  const groups = new Map<string, ToolGroup>();
  for (const tool of tools) {
    const id = toolGroupId(tool);
    const existing = groups.get(id);
    if (existing) {
      existing.tools.push(tool);
      continue;
    }
    groups.set(id, {
      id,
      label: id === "builtin" ? "Built-in" : id,
      source: tool.source,
      tools: [tool],
    });
  }
  return [...groups.values()].sort((left, right) => {
    if (left.id === "builtin") {
      return -1;
    }
    if (right.id === "builtin") {
      return 1;
    }
    return left.label.localeCompare(right.label);
  });
}

export function ToolsWorkbench() {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [selectedName, setSelectedName] = useState<string>("");
  const [argumentsText, setArgumentsText] = useState(defaultArguments(""));
  const [apiKey, setApiKey] = useState("");
  const [serviceToken, setServiceToken] = useState("");
  const [result, setResult] = useState<ToolCallResponse | undefined>();
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpName, setMcpName] = useState("github");
  const [mcpTransport, setMcpTransport] = useState<McpServer["transport"]>("stdio");
  const [mcpCommand, setMcpCommand] = useState("npx");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpArgs, setMcpArgs] = useState(JSON.stringify(["-y", "@modelcontextprotocol/server-github"], null, 2));
  const [mcpEnv, setMcpEnv] = useState("{}");
  const [mcpHeaders, setMcpHeaders] = useState("{}");
  const [mcpAuthType, setMcpAuthType] = useState<McpServer["authType"]>("none");
  const [mcpAuthSecretRef, setMcpAuthSecretRef] = useState("");
  const [mcpRiskLevel, setMcpRiskLevel] = useState<McpServer["riskLevel"]>("medium");
  const [editingMcpServerId, setEditingMcpServerId] = useState<string | undefined>();
  const [openToolGroups, setOpenToolGroups] = useState<Set<string>>(() => new Set(["builtin"]));
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const mcpFormRef = useRef<HTMLDivElement | null>(null);
  const mcpNameInputRef = useRef<HTMLInputElement | null>(null);
  const { credentials, hasCredentials, usingSession } = useEffectiveCredentials(apiKey, serviceToken);
  const { hasPermission } = useSession();
  const canManageMcp = hasCredentials && (!usingSession || hasPermission("auth:manage"));

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.name === selectedName),
    [selectedName, tools],
  );
  const toolGroups = useMemo(() => groupTools(tools), [tools]);
  const editingMcpServer = useMemo(
    () => mcpServers.find((server) => server.id === editingMcpServerId),
    [editingMcpServerId, mcpServers],
  );
  const nextMcpName = useMemo(() => {
    const usedNames = new Set(mcpServers.map((server) => server.name));
    let index = mcpServers.length + 1;
    let candidate = `mcp_server_${index}`;
    while (usedNames.has(candidate)) {
      index += 1;
      candidate = `mcp_server_${index}`;
    }
    return candidate;
  }, [mcpServers]);

  async function refresh(): Promise<void> {
    if (!hasCredentials) {
      setTools([]);
      setMcpServers([]);
      setSelectedName("");
      setResult(undefined);
      setErrorMessage(undefined);
      return;
    }
    setLoading(true);
    setErrorMessage(undefined);
    try {
      const nextTools = await listTools(credentials);
      setTools(nextTools);
      if (canManageMcp) {
        const nextServers = await listMcpServers(credentials);
        setMcpServers(nextServers);
      } else {
        setMcpServers([]);
      }
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
  }, [canManageMcp]);

  useEffect(() => {
    if (!selectedTool) {
      return;
    }
    const selectedGroupId = toolGroupId(selectedTool);
    setOpenToolGroups((current) => {
      if (current.has(selectedGroupId)) {
        return current;
      }
      const next = new Set(current);
      next.add(selectedGroupId);
      return next;
    });
  }, [selectedTool]);

  async function createServer(): Promise<void> {
    setLoading(true);
    setErrorMessage(undefined);
    try {
      if (!canManageMcp) {
        throw new Error("MCP server management requires auth:manage permission.");
      }
      const args = mcpTransport === "stdio" ? parseStringArrayJson(mcpArgs, "Args JSON") : [];
      const env = parseStringRecordJson(mcpEnv, "Env JSON");
      const headers = JSON.parse(mcpHeaders) as Record<string, string>;
      const shouldPreserveMaskedEnv =
        Boolean(editingMcpServer) &&
        Object.values(env).some((value) => value === "********");
      const payload = {
        transport: mcpTransport,
        command: mcpTransport === "stdio" ? mcpCommand.trim() : undefined,
        url: mcpTransport === "streamable_http" ? mcpUrl.trim() : undefined,
        args: mcpTransport === "stdio" ? args : [],
        env: shouldPreserveMaskedEnv ? undefined : env,
        headers,
        authType: mcpAuthType,
        authSecretRef: mcpAuthSecretRef.trim() || undefined,
        enabled: true,
        riskLevel: mcpRiskLevel,
        requiredPermissions: ["tools:execute"],
      };
      if (editingMcpServer) {
        await updateMcpServer({
          serverId: editingMcpServer.id,
          ...payload,
          reason: "Update MCP server from Web Console",
          ...credentials,
        });
      } else {
        await createMcpServer({
          name: mcpName,
          ...payload,
          reason: "Configure MCP server from Web Console",
          ...credentials,
        });
      }
      setEditingMcpServerId(undefined);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create MCP server.");
    } finally {
      setLoading(false);
    }
  }

  async function approveServer(serverId: string): Promise<void> {
    setLoading(true);
    setErrorMessage(undefined);
    try {
      if (!canManageMcp) {
        throw new Error("MCP server management requires auth:manage permission.");
      }
      await approveMcpServer({
        serverId,
        reason: "Approve MCP server from Web Console",
        ...credentials,
      });
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to approve MCP server.");
    } finally {
      setLoading(false);
    }
  }

  async function disableServer(serverId: string): Promise<void> {
    setLoading(true);
    setErrorMessage(undefined);
    try {
      if (!canManageMcp) {
        throw new Error("MCP server management requires auth:manage permission.");
      }
      await disableMcpServer({
        serverId,
        reason: "Disable MCP server from Web Console",
        ...credentials,
      });
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to disable MCP server.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteServer(serverId: string): Promise<void> {
    setLoading(true);
    setErrorMessage(undefined);
    try {
      if (!canManageMcp) {
        throw new Error("MCP server management requires auth:manage permission.");
      }
      await deleteMcpServer({
        serverId,
        reason: "Delete MCP server from Web Console",
        ...credentials,
      });
      if (editingMcpServerId === serverId) {
        cancelMcpEdit();
      }
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete MCP server.");
    } finally {
      setLoading(false);
    }
  }

  async function reloadServers(): Promise<void> {
    setLoading(true);
    setErrorMessage(undefined);
    try {
      if (!canManageMcp) {
        throw new Error("MCP server management requires auth:manage permission.");
      }
      await reloadMcpServers(credentials);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reload MCP servers.");
    } finally {
      setLoading(false);
    }
  }

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
        ...credentials,
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

  function toggleToolGroup(groupId: string): void {
    setOpenToolGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function prepareNewMcpServer(): void {
    setEditingMcpServerId(undefined);
    setMcpName(nextMcpName);
    setMcpTransport("stdio");
    setMcpCommand("npx");
    setMcpUrl("");
    setMcpArgs(JSON.stringify(["-y", "chrome-devtools-mcp@latest", "--isolated"], null, 2));
    setMcpEnv("{}");
    setMcpHeaders("{}");
    setMcpAuthType("none");
    setMcpAuthSecretRef("");
    setMcpRiskLevel("medium");
    setErrorMessage(undefined);
    scrollToMcpForm();
  }

  function editMcpServer(server: McpServer): void {
    setEditingMcpServerId(server.id);
    setMcpName(server.name);
    setMcpTransport(server.transport);
    setMcpCommand(server.command);
    setMcpUrl(server.url ?? "");
    setMcpArgs(JSON.stringify(server.args, null, 2));
    setMcpEnv(JSON.stringify(server.env, null, 2));
    setMcpHeaders(JSON.stringify(server.headers, null, 2));
    setMcpAuthType(server.authType);
    setMcpAuthSecretRef(server.authSecretRef ?? "");
    setMcpRiskLevel(server.riskLevel);
    setErrorMessage(undefined);
    scrollToMcpForm();
  }

  function cancelMcpEdit(): void {
    setEditingMcpServerId(undefined);
    setMcpName(nextMcpName);
    setMcpTransport("stdio");
    setMcpCommand("npx");
    setMcpUrl("");
    setMcpArgs(JSON.stringify(["-y", "chrome-devtools-mcp@latest", "--isolated"], null, 2));
    setMcpEnv("{}");
    setMcpHeaders("{}");
    setMcpAuthType("none");
    setMcpAuthSecretRef("");
    setMcpRiskLevel("medium");
    setErrorMessage(undefined);
  }

  function scrollToMcpForm(): void {
    window.requestAnimationFrame(() => {
      mcpFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      mcpNameInputRef.current?.focus({ preventScroll: true });
    });
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

      <section className="section-card mcp-manager-card">
        <div className="section-card-header">
          <div>
            <h2 className="section-card-title">MCP Servers</h2>
            <p className="section-card-description">Manage runtime MCP tool servers with masked env values and guarded enablement.</p>
          </div>
          <div className="mcp-header-actions">
            <button type="button" className="refresh-button" onClick={prepareNewMcpServer} disabled={loading || !canManageMcp}>
              <Plus className="icon-sm" aria-hidden="true" />
              New
            </button>
            <button type="button" className="refresh-button" onClick={() => void reloadServers()} disabled={loading || !canManageMcp}>
              <RefreshCcw className={`icon-sm ${loading ? "spin" : ""}`} aria-hidden="true" />
              Reload
            </button>
          </div>
        </div>
        <div className="section-card-body mcp-manager-body">
          {!hasCredentials ? <div className="alert alert-neutral">Sign in or enter local credentials to manage MCP servers.</div> : null}
          {hasCredentials && usingSession && !canManageMcp ? (
            <div className="alert alert-warning">Your current session can run tools but cannot manage MCP servers. Sign in with an admin/service token session for MCP configuration.</div>
          ) : null}
          <div ref={mcpFormRef} className="mcp-create-grid">
            <div className="mcp-form-status">
              <StatusBadge tone={editingMcpServer ? "warning" : "neutral"}>
                {editingMcpServer ? `Editing ${editingMcpServer.name}` : "New MCP server"}
              </StatusBadge>
            </div>
            <label>
              <span className="label">Name</span>
              <input ref={mcpNameInputRef} value={mcpName} onChange={(event) => setMcpName(event.target.value)} className="text-input" disabled={!canManageMcp} />
            </label>
            <label>
              <span className="label">Transport</span>
              <select value={mcpTransport} onChange={(event) => setMcpTransport(event.target.value as McpServer["transport"])} className="text-input" disabled={!canManageMcp}>
                <option value="stdio">stdio</option>
                <option value="streamable_http">streamable_http</option>
              </select>
            </label>
            {mcpTransport === "stdio" ? (
              <>
                <label>
                  <span className="label">Command</span>
                  <input
                    value={mcpCommand}
                    onChange={(event) => setMcpCommand(event.target.value)}
                    className="text-input"
                    disabled={!canManageMcp}
                    placeholder="npx, node, /absolute/path/to/command"
                  />
                </label>
                <label>
                  <span className="label">Args</span>
                  <textarea
                    value={mcpArgs}
                    onChange={(event) => setMcpArgs(event.target.value)}
                    className="text-input mcp-json-input"
                    disabled={!canManageMcp}
                    rows={4}
                    placeholder={`["-y", "chrome-devtools-mcp@latest", "--isolated"]`}
                  />
                </label>
                <label>
                  <span className="label">Env JSON</span>
                  <textarea
                    value={mcpEnv}
                    onChange={(event) => setMcpEnv(event.target.value)}
                    className="text-input mcp-json-input"
                    disabled={!canManageMcp}
                    rows={4}
                  />
                </label>
              </>
            ) : (
              <label>
                <span className="label">URL</span>
                <input
                  value={mcpUrl}
                  onChange={(event) => setMcpUrl(event.target.value)}
                  className="text-input"
                  disabled={!canManageMcp}
                  placeholder="https://mcp.example.com/mcp"
                />
              </label>
            )}
            <label>
              <span className="label">Auth</span>
              <select value={mcpAuthType} onChange={(event) => setMcpAuthType(event.target.value as McpServer["authType"])} className="text-input" disabled={!canManageMcp}>
                <option value="none">none</option>
                <option value="bearer">bearer</option>
                <option value="api_key">api_key</option>
              </select>
            </label>
            <label>
              <span className="label">Secret ref</span>
              <input value={mcpAuthSecretRef} onChange={(event) => setMcpAuthSecretRef(event.target.value)} className="text-input" disabled={!canManageMcp || mcpAuthType === "none"} placeholder="env:MCP_TOKEN" />
            </label>
            {mcpTransport === "streamable_http" ? (
              <label>
                <span className="label">Headers JSON</span>
                <textarea
                  value={mcpHeaders}
                  onChange={(event) => setMcpHeaders(event.target.value)}
                  className="text-input mcp-json-input"
                  disabled={!canManageMcp}
                  rows={4}
                />
              </label>
            ) : null}
            <label>
              <span className="label">Risk</span>
              <select value={mcpRiskLevel} onChange={(event) => setMcpRiskLevel(event.target.value as McpServer["riskLevel"])} className="text-input" disabled={!canManageMcp}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </label>
            <button type="button" className="refresh-button" onClick={() => void createServer()} disabled={loading || !canManageMcp}>
              <Server className="icon-sm" aria-hidden="true" />
              {editingMcpServer ? "Update" : "Add"}
            </button>
            {editingMcpServerId ? (
              <button type="button" className="refresh-button" onClick={cancelMcpEdit} disabled={loading}>
                <X className="icon-sm" aria-hidden="true" />
                Cancel
              </button>
            ) : null}
          </div>

          <div className="mcp-server-list">
            {mcpServers.length > 0 ? mcpServers.map((server) => (
              <article key={server.id} className={server.id === editingMcpServerId ? "mcp-server-row mcp-server-row-editing" : "mcp-server-row"}>
                <div className="mcp-server-main">
                  <div className="mcp-server-title">
                    <strong>{server.name}</strong>
                    <StatusBadge tone={server.status === "active" ? "success" : server.status === "error" ? "danger" : "warning"}>{server.status}</StatusBadge>
                    <StatusBadge tone={server.riskLevel === "high" || server.riskLevel === "critical" ? "warning" : "neutral"}>{server.riskLevel}</StatusBadge>
                  </div>
                  <p className="mcp-command-line">
                    {server.transport === "streamable_http"
                      ? `${server.transport} ${server.url ?? ""}`
                      : `${server.command} ${server.args.join(" ")}`}
                  </p>
                  {server.lastError ? <p className="mcp-error-line">{server.lastError}</p> : null}
                </div>
                <div className="mcp-server-actions">
                  <button type="button" className="icon-action-button" onClick={() => editMcpServer(server)} disabled={loading || !canManageMcp}>
                    Edit
                  </button>
                  {server.status !== "active" ? (
                    <button type="button" className="icon-action-button" onClick={() => void approveServer(server.id)} disabled={loading || !canManageMcp}>
                      <ShieldCheck className="icon-sm" aria-hidden="true" />
                      Approve
                    </button>
                  ) : (
                    <button type="button" className="icon-action-button" onClick={() => void disableServer(server.id)} disabled={loading || !canManageMcp}>
                      <PauseCircle className="icon-sm" aria-hidden="true" />
                      Disable
                    </button>
                  )}
                  {server.enabled ? <CheckCircle2 className="icon-sm mcp-enabled-icon" aria-label="enabled" /> : null}
                  <button type="button" className="icon-action-button danger" onClick={() => void deleteServer(server.id)} disabled={loading || !canManageMcp}>
                    <Trash2 className="icon-sm" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </article>
            )) : (
              <div className="empty-state">No dynamic MCP servers configured.</div>
            )}
          </div>
        </div>
      </section>

      <section className="tools-layout">
        <aside className="tool-list" aria-label="Tool groups">
          {toolGroups.map((group) => {
            const isOpen = openToolGroups.has(group.id);
            const selectedInGroup = group.tools.some((tool) => tool.name === selectedName);
            return (
              <section key={group.id} className={selectedInGroup ? "tool-group tool-group-active" : "tool-group"}>
                <button
                  type="button"
                  className="tool-group-header"
                  onClick={() => toggleToolGroup(group.id)}
                  aria-expanded={isOpen}
                >
                  <ChevronDown className={isOpen ? "icon-sm tool-group-chevron-open" : "icon-sm tool-group-chevron"} aria-hidden="true" />
                  <span>{group.label}</span>
                  <StatusBadge tone={group.source === "builtin" ? "success" : "neutral"}>{group.source}</StatusBadge>
                  <span className="tool-group-count">{group.tools.length}</span>
                </button>
                {isOpen ? (
                  <div className="tool-group-items">
                    {group.tools.map((tool) => (
                      <button
                        key={tool.name}
                        type="button"
                        className={tool.name === selectedName ? "tool-list-item tool-list-item-active" : "tool-list-item"}
                        onClick={() => selectTool(tool.name)}
                      >
                        <span>{tool.name}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
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
                  {!hasCredentials ? <div className="alert alert-neutral">Sign in or enter local credentials before executing tools.</div> : null}
                  <LocalCredentialFields
                    apiKey={apiKey}
                    serviceToken={serviceToken}
                    usingSession={usingSession}
                    onApiKeyChange={setApiKey}
                    onServiceTokenChange={setServiceToken}
                  />
                  <label>
                    <span className="label">Arguments JSON</span>
                    <textarea
                      value={argumentsText}
                      onChange={(event) => setArgumentsText(event.target.value)}
                      className="composer-input"
                      rows={8}
                    />
                  </label>
                  <button type="button" className="refresh-button" onClick={() => void runSelectedTool()} disabled={loading || !hasCredentials}>
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
