import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryWorkflowStore } from "../../src/workflow/in-memory-workflow.store.js";

test("InMemoryWorkflowStore creates, lists, and updates workflow state", async () => {
  const store = new InMemoryWorkflowStore();
  const workflow = await store.create({
    tenantId: "tenant-a",
    userId: "user-a",
    title: "Production remediation",
    goal: "Patch and verify a production issue",
    steps: [
      { title: "Diagnose" },
      { title: "Patch", description: "Apply the minimal fix" },
    ],
  });

  assert.equal(workflow.status, "draft");
  assert.equal(workflow.steps.length, 2);
  assert.equal(workflow.steps[0]?.order, 1);

  const listed = await store.list("tenant-a");
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, workflow.id);

  const firstStep = workflow.steps[0];
  assert.ok(firstStep);
  const running = await store.updateStep({
    tenantId: "tenant-a",
    workflowId: workflow.id,
    stepId: firstStep.id,
    userId: "user-a",
    status: "running",
  });
  assert.equal(running?.status, "running");

  const secondStep = workflow.steps[1];
  assert.ok(secondStep);
  await store.updateStep({
    tenantId: "tenant-a",
    workflowId: workflow.id,
    stepId: firstStep.id,
    userId: "user-a",
    status: "completed",
    output: "Root cause found",
  });
  const completed = await store.updateStep({
    tenantId: "tenant-a",
    workflowId: workflow.id,
    stepId: secondStep.id,
    userId: "user-a",
    status: "completed",
  });

  assert.equal(completed?.status, "completed");
  assert.equal(completed?.steps[0]?.output, "Root cause found");
  assert.ok(completed.events.some((event) => event.type === "status_updated"));
});

test("InMemoryWorkflowStore isolates workflows by tenant", async () => {
  const store = new InMemoryWorkflowStore();
  await store.create({
    tenantId: "tenant-a",
    userId: "user-a",
    title: "Tenant A workflow",
    goal: "A",
    steps: [{ title: "A1" }],
  });
  await store.create({
    tenantId: "tenant-b",
    userId: "user-b",
    title: "Tenant B workflow",
    goal: "B",
    steps: [{ title: "B1" }],
  });

  assert.equal((await store.list("tenant-a")).length, 1);
  assert.equal((await store.list("tenant-b")).length, 1);
  assert.equal((await store.list("tenant-c")).length, 0);
});
