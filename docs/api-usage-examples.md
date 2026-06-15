# API Usage Examples

## 认证

受保护接口支持：

```http
x-api-key: <API_KEY>
```

或：

```http
Authorization: Bearer <JWT>
```

## OpenAPI

运行时 OpenAPI：

```http
GET /api/docs/openapi.json
```

仓库静态快照：

```text
docs/openapi/enterprise-agent.openapi.json
```

重新导出：

```bash
npm run docs:openapi
```

## Agent Run

```bash
curl -X POST http://localhost:3000/api/agent/run \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "requestId": "00000000-0000-4000-8000-000000000001",
    "message": "Summarize the production incident and suggest next steps.",
    "maxSteps": 4
  }'
```

## Knowledge Retrieval

```bash
curl -X POST http://localhost:3000/api/knowledge/retrieve \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "query": "credential rotation policy",
    "limit": 5
  }'
```

## Workflow Schedule Claim

```bash
curl -X POST http://localhost:3000/api/workflows/schedules/claim-due \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "workerId": "workflow-scheduler-1",
    "limit": 10,
    "leaseMs": 60000
  }'
```

## Multi-agent Orchestration

```bash
curl -X POST http://localhost:3000/api/orchestration/runs \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "requestId": "00000000-0000-4000-8000-000000000002",
    "objective": "Analyze a failed deployment and produce a remediation plan.",
    "participantIds": [
      "coordinator-participant-id",
      "worker-participant-id",
      "reviewer-participant-id"
    ]
  }'
```

## Approval Flow

Create request:

```bash
curl -X POST http://localhost:3000/api/governance/approval/requests \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "action": "secrets.secret.rotate",
    "resourceType": "secret_value",
    "resourceId": "secret-uuid",
    "reason": "Scheduled production credential rotation"
  }'
```

Approve request:

```bash
curl -X POST http://localhost:3000/api/governance/approval/requests/approval-request-id/approve \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "comment": "Approved for the maintenance window"
  }'
```

Use approval:

```bash
curl -X POST http://localhost:3000/api/secrets/secret-uuid/rotate \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "value": "new-secret-value",
    "reason": "Scheduled production credential rotation",
    "approvalId": "approval-request-id"
  }'
```
