# Local Self-test Record - 2026-06-15

## Purpose

This record keeps the local self-test trace for the enterprise agent platform after the production-grade rebuild work.

The test covers:

- local infrastructure startup
- database migrations
- API startup from build artifacts
- health and OpenAPI endpoints
- tools endpoint smoke test
- persistent RBAC admin APIs
- audit event persistence
- security anomaly persistence and acknowledgement
- break-glass enforcement
- Qdrant container healthcheck fix

## Local Environment

Use the bundled Node.js runtime when running npm scripts from Codex:

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run ci
```

Use Homebrew and bundled tool paths when running Docker or PostgreSQL CLI commands:

```bash
PATH=/usr/local/bin:/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH <command>
```

The machine already had services using default ports, so the project infrastructure was started with explicit local ports:

```text
PostgreSQL: 15432 -> 5432
Qdrant HTTP: 16333 -> 6333
Qdrant gRPC: 16334 -> 6334
Redis: 6379 -> 6379
```

## Local Configuration

`.env` was created for local development self-test.

Important values:

```text
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://agent:agent_password@localhost:15432/agent_db
POSTGRES_PORT=15432
QDRANT_ENABLED=false
QDRANT_HTTP_PORT=16333
QDRANT_GRPC_PORT=16334
EMBEDDING_PROVIDER=local-hash
INDEXING_WORKER_ENABLED=false
SERVICE_TOKEN_ROLES=admin
SERVICE_TOKEN_TENANT_ID=default
```

Notes:

- `QDRANT_ENABLED=false` keeps the API vector store dependency disabled for this smoke test while still allowing the Qdrant container to run and be health-checked.
- `INDEXING_WORKER_ENABLED=false` avoids starting background indexing workers during the API smoke test.
- A local admin service token was used for security admin APIs. Do not commit real secrets from local `.env`.

## Infrastructure Startup

Docker compose did not automatically pick up the root `.env` in this local flow, so explicit environment variables were passed to compose:

```bash
PATH=/usr/local/bin:/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH \
POSTGRES_PORT=15432 QDRANT_HTTP_PORT=16333 QDRANT_GRPC_PORT=16334 \
docker compose -f infra/docker-compose.yml up -d
```

Final compose status:

```text
enterprise-agent-postgres   Up healthy   0.0.0.0:15432->5432/tcp
enterprise-agent-redis      Up healthy   0.0.0.0:6379->6379/tcp
enterprise-agent-qdrant     Up healthy   0.0.0.0:16333->6333/tcp, 0.0.0.0:16334->6334/tcp
```

Qdrant health endpoint:

```bash
curl -fsS http://127.0.0.1:16333/healthz
```

Result:

```text
healthz check passed
```

## Qdrant Healthcheck Fix

The original Qdrant compose healthcheck used `wget`, but the `qdrant/qdrant:v1.13.4` image used locally did not include `wget`.

The healthcheck was changed to a bash TCP probe:

```yaml
healthcheck:
  test: ["CMD-SHELL", "bash -c '</dev/tcp/127.0.0.1/6333'"]
  interval: 10s
  timeout: 5s
  retries: 5
```

After recreating the Qdrant service, Docker reported it as healthy.

## Database Migration

Migrations were applied with an explicit migration folder and database URL:

```bash
PATH=/usr/local/bin:/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH \
DATABASE_URL=postgresql://agent:agent_password@localhost:15432/agent_db \
DATABASE_MIGRATIONS_FOLDER=/Users/bjsttlp406/others/-0-1agent/apps/api/drizzle \
npm run db:migrate
```

Result:

```text
Database migrations applied from /Users/bjsttlp406/others/-0-1agent/apps/api/drizzle
```

Database table count:

```text
30 tables
```

Important tables verified:

```text
auth_admin_audit_events
auth_roles
auth_service_tokens
security_anomaly_events
knowledge_documents
knowledge_chunks
workflow_schedules
trace_events
```

## API Startup

`tsx watch` could not be used reliably in the current sandbox because it failed to create an IPC pipe. The API was built and started from the generated JavaScript artifact instead:

```bash
PATH=/usr/local/bin:/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH \
node apps/api/dist/main.js
```

The API listened on:

```text
http://127.0.0.1:3000/api
```

## Health Checks

Readiness:

```bash
curl -fsS http://127.0.0.1:3000/api/health/ready
```

Result:

```json
{
  "status": "ok",
  "service": "enterprise-agent-api",
  "environment": "development",
  "dependencies": {
    "database": {
      "status": "ok"
    },
    "vectorStore": {
      "status": "disabled",
      "collection": "enterprise_agent_knowledge_chunks"
    }
  }
}
```

The `HttpExceptionFilter` was also fixed during self-test so readiness failures preserve dependency details instead of collapsing to a generic error payload.

## API Smoke Tests

Tools endpoint:

```bash
curl -fsS http://127.0.0.1:3000/api/tools -H "x-api-key: <local-api-key>"
```

Result:

```text
current_time
calculator
```

OpenAPI endpoint:

```bash
curl -fsS http://127.0.0.1:3000/api/docs/openapi.json
```

Result:

- OpenAPI document returned successfully.
- `Security` tag exists.
- audit and security anomaly routes are present.

## Security Persistence Smoke Test

Security admin APIs were tested with a local admin service token:

```http
x-service-token: <local-admin-service-token>
```

Verified flows:

- list roles
- create role with `auth:manage`
- audit event query
- security anomaly query
- security anomaly acknowledgement
- create break-glass service token
- reject break-glass action without required reason prefix
- allow break-glass action with `BREAK-GLASS:` reason prefix
- disable smoke-test break-glass token

Audit summary after smoke tests:

```text
audit_events: 5
```

Security anomaly summary:

```text
break_glass          critical  acknowledged=false  count=1
credential_admin     warning   acknowledged=false  count=2
privilege_escalation critical  acknowledged=true   count=1
```

## Runtime Fixes Found During Self-test

### Nest Runtime Injection

Some providers required explicit runtime injection metadata and were fixed with `@Inject(...)`:

- `RagService -> KnowledgeChunkerService`
- `LocalHashEmbeddingProvider -> ConfigService`
- `OpenAiCompatibleEmbeddingProvider -> ConfigService`
- `QdrantVectorStore -> ConfigService`
- `EmbeddingProviderFactory -> ConfigService / LocalHashEmbeddingProvider / OpenAiCompatibleEmbeddingProvider`

### Module Boundaries

Modules using `ApiKeyGuard` or `PermissionsGuard` now explicitly import `AuthModule`:

- `ToolsModule`
- `RagModule`
- `WorkflowModule`
- `GovernanceModule`
- `SecretsModule`
- `ObservabilityModule`
- `EvaluationModule`
- `OrchestrationModule`

### Error Payload Preservation

`HttpExceptionFilter` now preserves structured exception response fields so operational endpoints can return useful dependency diagnostics.

## CI Verification

Run:

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run ci
```

Expected stages:

```text
check
test
docs:openapi
build
```

Result:

```text
check passed
test 16 passed
docs:openapi passed
build passed
```

## Local Self-test Commands

Start infrastructure:

```bash
PATH=/usr/local/bin:/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH \
POSTGRES_PORT=15432 QDRANT_HTTP_PORT=16333 QDRANT_GRPC_PORT=16334 \
docker compose -f infra/docker-compose.yml up -d
```

Apply migrations:

```bash
PATH=/usr/local/bin:/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH \
DATABASE_URL=postgresql://agent:agent_password@localhost:15432/agent_db \
DATABASE_MIGRATIONS_FOLDER=/Users/bjsttlp406/others/-0-1agent/apps/api/drizzle \
npm run db:migrate
```

Build:

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run build
```

Start API:

```bash
PATH=/usr/local/bin:/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH \
node apps/api/dist/main.js
```

Check readiness:

```bash
curl -fsS http://127.0.0.1:3000/api/health/ready
```

Run CI:

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run ci
```

Stop infrastructure:

```bash
PATH=/usr/local/bin:/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH \
docker compose -f infra/docker-compose.yml down
```
