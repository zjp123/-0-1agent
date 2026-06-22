import { expect, type Page, test } from "@playwright/test";

const apiBaseUrl = "http://127.0.0.1:3999/api";

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("dashboard shows mocked readiness", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("API ok")).toBeVisible();
  await expect(page.getByText("DB ok")).toBeVisible();
  await expect(page.getByText("Vector disabled")).toBeVisible();
});

test("login exchanges service token for a console session", async ({ page }) => {
  await page.goto("/login");

  await page.getByRole("textbox", { name: "Credential" }).fill("local-admin-service-token");
  await Promise.all([
    page.waitForResponse("**/api/auth/console/login"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);

  await expect(page).toHaveURL("/");
  await expect(page.getByText("service-token-user / default")).toBeVisible();
  await expect(page.getByText("service_token")).toBeVisible();
});

test("agent chat consumes a streaming response", async ({ page }) => {
  await seedSession(page);
  await page.goto("/agent-chat");
  await expect(page.getByText("service-token-user / default")).toBeVisible();

  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  await Promise.all([
    page.waitForRequest("**/api/agent/run/stream"),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  await expect(page.getByText("Mock streaming answer")).toBeVisible();
  await expect(page.getByText("model step 1: mock-model")).toBeVisible();
});

test("agent chat shows a clear stopped state after stop", async ({ page }) => {
  await seedSession(page);
  await page.route("**/api/agent/run/stream", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    await route.fulfill({
      headers: { "content-type": "text/event-stream" },
      body: "event: started\ndata: {\"requestId\":\"slow-request\"}\n\n",
    });
  });
  await page.goto("/agent-chat");

  await Promise.all([
    page.waitForRequest("**/api/agent/run/stream"),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  await page.getByRole("button", { name: "Stop" }).click();

  await expect(page.getByText("用户已停止本次生成")).toBeVisible();
  await expect(page.getByText("已停止生成。本次请求已由用户手动停止，没有完整回答。")).toBeVisible();
  await expect(page.locator(".message-assistant").last()).not.toContainText("...");
  await expect(page.locator(".badge", { hasText: /^cancelled$/ })).toBeVisible();
});

test("tools page loads tools and executes calculator", async ({ page }) => {
  await seedSession(page);
  await page.goto("/tools");
  await expect(page.getByText("service-token-user / default")).toBeVisible();

  await expect(page.getByRole("button", { name: /calculator/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "local_mcp.echo mcp" })).toBeVisible();
  await page.getByRole("button", { name: "Execute" }).click();

  await expect(page.locator(".tool-result-content", { hasText: "mock calculator result" })).toBeVisible();
});

test("knowledge page loads documents and retrieval results", async ({ page }) => {
  await seedSession(page);
  await page.goto("/knowledge");
  await expect(page.getByText("service-token-user / default")).toBeVisible();

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Enterprise Runbook")).toBeVisible();

  await page.getByRole("button", { name: "Retrieve" }).click();
  await expect(page.getByText("retrieved enterprise content")).toBeVisible();
});

test("security page loads roles, audit, and anomalies", async ({ page }) => {
  await seedSession(page);
  await page.goto("/security");
  await expect(page.getByText("service-token-user / default")).toBeVisible();

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.locator(".dependency-name", { hasText: /^admin$/ })).toBeVisible();
  await expect(page.locator(".dependency-name", { hasText: "auth.role.create" })).toBeVisible();
  await expect(page.getByText("Privilege escalation detected")).toBeVisible();
  await expect(page.locator(".dependency-name", { hasText: "tool.execute" })).toBeVisible();
  await expect(page.getByRole("link", { name: "trace-request-1" })).toBeVisible();
});

test("evaluation page loads cases and runs", async ({ page }) => {
  await seedSession(page);
  await page.goto("/evaluations");
  await expect(page.getByText("service-token-user / default")).toBeVisible();

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("button", { name: "Smoke evaluation input" })).toBeVisible();
  await expect(page.locator(".badge", { hasText: /^passed$/ })).toBeVisible();
});

test("observability page loads trace events", async ({ page }) => {
  await seedSession(page);
  await page.goto("/observability");
  await expect(page.getByText("service-token-user / default")).toBeVisible();

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("table").getByText("agent.run.completed")).toBeVisible();
  await expect(page.getByRole("table").getByText("trace-request-1")).toBeVisible();
  await expect(page.getByText("approval_required")).toBeVisible();
});

test("workflow page loads workflow and schedule status", async ({ page }) => {
  await seedSession(page);
  await page.goto("/workflows");
  await expect(page.getByText("service-token-user / default")).toBeVisible();

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Production Readiness")).toBeVisible();
  await expect(page.locator(".dependency-detail", { hasText: /^postgres$/ })).toBeVisible();
});

async function seedSession(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.setItem(
      "enterprise-agent:web-session",
      JSON.stringify({
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        sessionId: "mock-session-id",
        user: {
          userId: "service-token-user",
          tenantId: "default",
          roles: ["admin"],
          permissions: [
            "agent:run",
            "tools:execute",
            "knowledge:read",
            "knowledge:write",
            "observability:read",
            "workflow:manage",
            "evaluation:manage",
            "auth:manage",
          ],
          authType: "service_token",
        },
      }),
    );
  });
}

async function mockApi(page: Page): Promise<void> {
  await page.route(`${apiBaseUrl}/health/ready`, async (route) => {
    await route.fulfill({
      json: {
        status: "ok",
        service: "enterprise-agent-api",
        environment: "e2e",
        uptimeSeconds: 42,
        timestamp: new Date().toISOString(),
        dependencies: {
          database: { status: "ok", latencyMs: 3 },
          vectorStore: { status: "disabled", collection: "e2e_chunks" },
        },
      },
    });
  });

  await page.route("**/api/auth/console/login", async (route) => {
    await route.fulfill({
      json: {
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        sessionId: "mock-session-id",
        user: {
          userId: "service-token-user",
          tenantId: "default",
          roles: ["admin"],
          permissions: [
            "agent:run",
            "tools:execute",
            "knowledge:read",
            "knowledge:write",
            "observability:read",
            "workflow:manage",
            "evaluation:manage",
            "auth:manage",
          ],
          authType: "service_token",
        },
      },
    });
  });

  await page.route("**/api/tools", async (route) => {
    await route.fulfill({
      json: [
        {
          name: "calculator",
          description: "Evaluate a safe expression",
          source: "builtin",
          riskLevel: "low",
          inputSchema: {
            type: "object",
            properties: { expression: { type: "string" } },
            required: ["expression"],
          },
          outputSchema: {
            type: "object",
            properties: { result: { type: "number" } },
            required: ["result"],
          },
          timeoutMs: 1000,
          maxResultLength: 1000,
          requiredPermissions: ["tools:execute"],
        },
        {
          name: "local_mcp.echo",
          description: "Echo a message from an external MCP stdio server.",
          source: "mcp",
          riskLevel: "low",
          inputSchema: {
            type: "object",
            properties: { message: { type: "string" } },
            required: ["message"],
          },
          outputSchema: {
            type: "object",
            properties: { message: { type: "string" } },
            required: ["message"],
          },
          timeoutMs: 15000,
          maxResultLength: 8000,
          requiredPermissions: ["tools:execute"],
        },
      ],
    });
  });

  await page.route("**/api/tools/execute", async (route) => {
    await route.fulfill({
      json: {
        toolName: "calculator",
        source: "builtin",
        riskLevel: "low",
        requiredPermissions: ["tools:execute"],
        status: "success",
        content: "mock calculator result",
        data: { result: 42 },
        latencyMs: 3,
        audit: {
          requestId: "tool-request-1",
          toolName: "calculator",
          source: "builtin",
          riskLevel: "low",
          status: "success",
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          latencyMs: 3,
          inputPreview: "{}",
          requiredPermissions: ["tools:execute"],
        },
      },
    });
  });

  await page.route("**/api/agent/run/stream", async (route) => {
    await route.fulfill({
      headers: { "content-type": "text/event-stream" },
      body: [
        sse("started", { requestId: "agent-request-1", timestamp: new Date().toISOString() }),
        sse("delta", { requestId: "agent-request-1", content: "Mock streaming answer" }),
        sse("result", {
          requestId: "agent-request-1",
          stopReason: "stop",
          durationMs: 9,
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
          context: {
            budget: { maxTokens: 1000, reservedResponseTokens: 100, availableInputTokens: 900 },
            estimatedInputTokens: 12,
            sources: [],
            droppedMessages: 0,
          },
          steps: [
            {
              type: "model",
              step: 1,
              response: {
                provider: "mock",
                model: "mock-model",
                finishReason: "stop",
                latencyMs: 8,
                attempts: 1,
                contentPreview: "Mock streaming answer",
                toolCalls: [],
              },
            },
          ],
        }),
        sse("done", { requestId: "agent-request-1", timestamp: new Date().toISOString() }),
      ].join(""),
    });
  });

  await page.route(`${apiBaseUrl}/knowledge/documents`, async (route) => {
    await route.fulfill({
      json: [
        {
          id: "doc-1",
          tenantId: "default",
          title: "Enterprise Runbook",
          content: "runbook content",
          sourceType: "manual",
          tags: ["runbook"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  });

  await page.route(`${apiBaseUrl}/knowledge/reindex/jobs`, async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route(`${apiBaseUrl}/knowledge/reindex/worker/status`, async (route) => {
    await route.fulfill({
      json: {
        workerId: "e2e-worker",
        enabled: true,
        stopped: false,
        concurrency: 1,
        queueName: "e2e",
        retryQueueName: "e2e-retry",
        deadLetterQueueName: "e2e-dead",
        consumerGroup: "e2e-group",
        queueDepth: { pending: 0, consumerPending: 0, delayed: 0, deadLetter: 0 },
        queueAvailable: true,
        leaseMs: 60000,
        heartbeatIntervalMs: 10000,
        recoveryIntervalMs: 30000,
        retryDelayBaseMs: 5000,
        retryDelayMaxMs: 60000,
        pendingClaimMinIdleMs: 60000,
      },
    });
  });

  await page.route(`${apiBaseUrl}/knowledge/reindex/worker/alerts`, async (route) => {
    await route.fulfill({
      json: {
        status: "ok",
        checkedAt: new Date().toISOString(),
        thresholds: {},
        alerts: [],
        metrics: {
          workerId: "e2e-worker",
          enabled: true,
          stopped: false,
          concurrency: 1,
          queueName: "e2e",
          retryQueueName: "e2e-retry",
          deadLetterQueueName: "e2e-dead",
          consumerGroup: "e2e-group",
          queueDepth: { pending: 0, consumerPending: 0, delayed: 0, deadLetter: 0 },
          queueAvailable: true,
          leaseMs: 60000,
          heartbeatIntervalMs: 10000,
          recoveryIntervalMs: 30000,
          retryDelayBaseMs: 5000,
          retryDelayMaxMs: 60000,
          pendingClaimMinIdleMs: 60000,
          uptimeMs: 1000,
          recoveryRunning: false,
          counters: {},
        },
      },
    });
  });

  await page.route(`${apiBaseUrl}/knowledge/retrieve`, async (route) => {
    await route.fulfill({
      json: [
        {
          chunk: {
            id: "chunk-1",
            documentId: "doc-1",
            tenantId: "default",
            content: "retrieved enterprise content",
            index: 0,
            tokenEstimate: 4,
            title: "Enterprise Runbook",
            sourceType: "manual",
            tags: ["runbook"],
          },
          score: 0.95,
          matchedTerms: ["enterprise"],
          retrievalMode: "hybrid",
          scores: { keyword: 1, vector: 0.9 },
        },
      ],
    });
  });

  await page.route(`${apiBaseUrl}/auth/roles`, async (route) => {
    await route.fulfill({
      json: [
        {
          id: "role-1",
          tenantId: "default",
          name: "admin",
          permissions: ["auth:manage"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  });

  await page.route(`${apiBaseUrl}/auth/service-tokens`, async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route(`${apiBaseUrl}/auth/audit-events?*`, async (route) => {
    await route.fulfill({
      json: {
        items: [
          {
            id: "audit-1",
            tenantId: "default",
            actorUserId: "admin",
            actorAuthType: "service_token",
            action: "auth.role.create",
            targetType: "role",
            targetId: "role-1",
            reason: "e2e",
            metadata: {},
            createdAt: new Date().toISOString(),
          },
        ],
        limit: 25,
        offset: 0,
      },
    });
  });

  await page.route(`${apiBaseUrl}/auth/security/anomalies?*`, async (route) => {
    await route.fulfill({
      json: {
        items: [
          {
            id: "anomaly-1",
            tenantId: "default",
            severity: "critical",
            category: "privilege_escalation",
            action: "auth.role.create",
            message: "Privilege escalation detected",
            metadata: {},
            acknowledged: false,
            createdAt: new Date().toISOString(),
          },
        ],
        limit: 25,
        offset: 0,
      },
    });
  });

  await page.route(`${apiBaseUrl}/governance/approval/requests`, async (route) => {
    await route.fulfill({
      json: [
        {
          id: "approval-1",
          tenantId: "default",
          requestedBy: "service-token-user",
          action: "tool.execute",
          resourceType: "tool",
          resourceId: "dangerous_tool",
          status: "pending",
          requiredApprovals: 1,
          approvals: [],
          reason: "Approve high risk tool",
          payload: { requestId: "trace-request-1", toolName: "dangerous_tool" },
          metadata: { riskLevel: "high" },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  });

  await page.route(`${apiBaseUrl}/governance/approval/requests/*/approve`, async (route) => {
    await route.fulfill({
      json: {
        id: "approval-1",
        tenantId: "default",
        requestedBy: "service-token-user",
        action: "tool.execute",
        resourceType: "tool",
        resourceId: "dangerous_tool",
        status: "approved",
        requiredApprovals: 1,
        approvals: [{ actorUserId: "admin" }],
        reason: "Approve high risk tool",
        payload: { requestId: "trace-request-1", toolName: "dangerous_tool" },
        metadata: { riskLevel: "high" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  });

  await page.route(`${apiBaseUrl}/governance/approval/requests/*/reject`, async (route) => {
    await route.fulfill({
      json: {
        id: "approval-1",
        tenantId: "default",
        requestedBy: "service-token-user",
        action: "tool.execute",
        resourceType: "tool",
        resourceId: "dangerous_tool",
        status: "rejected",
        requiredApprovals: 1,
        approvals: [],
        reason: "Approve high risk tool",
        payload: { requestId: "trace-request-1", toolName: "dangerous_tool" },
        metadata: { riskLevel: "high" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  });

  await page.route(`${apiBaseUrl}/evaluations/cases`, async (route) => {
    await route.fulfill({
      json: [
        {
          id: "case-1",
          tenantId: "default",
          createdBy: "admin",
          name: "Smoke evaluation",
          type: "agent_response",
          input: "input",
          expectedOutput: "expected",
          tags: ["smoke"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  });

  await page.route(`${apiBaseUrl}/evaluations/runs`, async (route) => {
    await route.fulfill({
      json: [
        {
          id: "run-1",
          tenantId: "default",
          caseId: "case-1",
          status: "passed",
          score: 1,
          actualOutput: "expected",
          expectedOutput: "expected",
          evaluator: "string_contains",
          notes: [],
          createdAt: new Date().toISOString(),
        },
      ],
    });
  });

  await page.route(`${apiBaseUrl}/observability/traces?*`, async (route) => {
    await route.fulfill({
      json: [
        {
          id: "trace-1",
          requestId: "trace-request-1",
          type: "agent.run.completed",
          timestamp: new Date().toISOString(),
          durationMs: 12,
          userId: "admin",
          tenantId: "default",
          attributes: { status: "ok" },
        },
      ],
    });
  });

  await page.route(`${apiBaseUrl}/observability/failures`, async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route(`${apiBaseUrl}/observability/agent-runs`, async (route) => {
    await route.fulfill({
      json: [
        {
          requestId: "trace-request-1",
          tenantId: "default",
          userId: "admin",
          status: "approval_required",
          stopReason: "approval_required",
          durationMs: 12,
          stepCount: 2,
          promptTokens: 3,
          completionTokens: 4,
          totalTokens: 7,
          preflightAllowed: true,
          usageRecorded: true,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
    });
  });

  await page.route(`${apiBaseUrl}/observability/traces/*/timeline`, async (route) => {
    await route.fulfill({
      json: {
        requestId: "trace-request-1",
        events: [
          {
            id: "trace-1",
            requestId: "trace-request-1",
            type: "agent.run.completed",
            timestamp: new Date().toISOString(),
            durationMs: 12,
            userId: "admin",
            tenantId: "default",
            attributes: { stopReason: "approval_required" },
          },
        ],
        summary: {
          eventCount: 1,
          failureCount: 0,
          eventMix: { agent: 1 },
        },
      },
    });
  });

  await page.route(`${apiBaseUrl}/workflows`, async (route) => {
    await route.fulfill({
      json: [
        {
          id: "workflow-1",
          tenantId: "default",
          createdBy: "admin",
          title: "Production Readiness",
          goal: "verify",
          status: "draft",
          steps: [],
          events: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  });

  await page.route(`${apiBaseUrl}/workflows/scheduler/status`, async (route) => {
    await route.fulfill({
      json: {
        enabled: true,
        store: "postgres",
        triggerModes: ["manual"],
        capabilities: ["claim"],
      },
    });
  });

  await page.route(`${apiBaseUrl}/workflows/schedules`, async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route(`${apiBaseUrl}/workflows/schedule-runs`, async (route) => {
    await route.fulfill({ json: [] });
  });
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
