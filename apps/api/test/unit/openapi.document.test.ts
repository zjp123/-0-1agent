import assert from "node:assert/strict";
import test from "node:test";

import {
  getApiDocumentationSummary,
  openApiDocument,
} from "../../src/api-docs/openapi.document.js";

test("openApiDocument exposes OpenAPI 3.1 API contract metadata", () => {
  assert.equal(openApiDocument.openapi, "3.1.0");
  assert.equal(openApiDocument.info.title, "Enterprise Agent API");
  assert.ok(openApiDocument.components.securitySchemes.ApiKeyAuth);
  assert.ok(openApiDocument.components.securitySchemes.BearerAuth);
});

test("openApiDocument includes core production API paths", () => {
  const paths = openApiDocument.paths;

  assert.ok(paths["/agent/run"]?.post);
  assert.ok(paths["/knowledge/ingest"]?.post);
  assert.ok(paths["/workflows/schedules/claim-due"]?.post);
  assert.ok(paths["/orchestration/runs"]?.post);
  assert.ok(paths["/governance/approval/requests/{requestId}/approve"]?.post);
  assert.ok(paths["/docs/openapi.json"]?.get);
});

test("getApiDocumentationSummary groups operations by tag", () => {
  const summary = getApiDocumentationSummary();
  const tags = summary.groups.map((group) => group.tag);

  assert.equal(summary.openapiUrl, "/api/docs/openapi.json");
  assert.ok(tags.includes("Agent Runtime"));
  assert.ok(tags.includes("Workflow Scheduling"));
  assert.ok(tags.includes("Documentation"));
});
