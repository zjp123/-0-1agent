import assert from "node:assert/strict";
import test from "node:test";

import { AppController } from "../../src/app.controller.js";
import { HealthController } from "../../src/health/health.controller.js";
import type { DatabaseHealth } from "../../src/db/database.service.js";
import type {
  VectorStore,
  VectorStoreHealth,
} from "../../src/vector-store/vector-store.types.js";

class ConfigStub {
  get<T>(_key: string, fallback?: T): T | undefined {
    return fallback;
  }
}

class DatabaseStub {
  async ping(): Promise<DatabaseHealth> {
    return {
      status: "ok",
      latencyMs: 1,
    };
  }
}

class VectorStoreStub implements VectorStore {
  async upsert(): Promise<void> {}

  async search(): Promise<[]> {
    return [];
  }

  async deleteByDocument(): Promise<void> {}

  async health(): Promise<VectorStoreHealth> {
    return {
      status: "disabled",
      collection: "test",
    };
  }
}

test("AppController exposes root service metadata", () => {
  const controller = new AppController();

  assert.deepEqual(controller.getRoot(), {
    service: "enterprise-agent-api",
    docs: ["/api/health", "/api/agent/capabilities"],
  });
});

test("HealthController returns dependency health shape", async () => {
  const controller = new HealthController(
    new ConfigStub() as never,
    new DatabaseStub() as never,
    new VectorStoreStub(),
  );

  const result = await controller.getHealth();

  assert.equal(result.status, "ok");
  assert.equal(result.service, "enterprise-agent-api");
  assert.equal(result.environment, "development");
  assert.equal(result.dependencies.database.status, "ok");
  assert.equal(result.dependencies.vectorStore.collection, "test");
});

test("HealthController exposes liveness without dependency checks", () => {
  const controller = new HealthController(
    new ConfigStub() as never,
    new DatabaseStub() as never,
    new VectorStoreStub(),
  );

  const result = controller.getLive();

  assert.equal(result.status, "ok");
  assert.equal(result.service, "enterprise-agent-api");
});

test("HealthController returns readiness when dependencies are usable", async () => {
  const controller = new HealthController(
    new ConfigStub() as never,
    new DatabaseStub() as never,
    new VectorStoreStub(),
  );

  const result = await controller.getReady();

  assert.equal(result.status, "ok");
  assert.equal(result.dependencies.database.status, "ok");
});
