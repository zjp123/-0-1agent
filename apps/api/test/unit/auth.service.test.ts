import assert from "node:assert/strict";
import test from "node:test";

import { ALL_PERMISSIONS, AuthService } from "../../src/auth/auth.service.js";

const config = {
  get<T>(_key: string, fallback?: T): T | undefined {
    return fallback;
  },
};

test("AuthService recognizes break-glass role with full permissions", () => {
  const service = new AuthService(config as never);

  assert.deepEqual(service.normalizeRoles(["break_glass"], []), ["break_glass"]);
  assert.deepEqual(service.permissionsForRoles(["break_glass"]), ALL_PERMISSIONS);
});

test("AuthService status exposes break-glass controls", () => {
  const service = new AuthService(config as never);
  const status = service.getStatus();

  assert.deepEqual(status.roles.break_glass, ALL_PERMISSIONS);
  assert.ok(status.controls.includes("break-glass controls"));
});
