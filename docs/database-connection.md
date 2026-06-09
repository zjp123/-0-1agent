# Database Connection

## 目标

Database Connection 模块负责把 PostgreSQL / Drizzle 从配置和 schema 变成 NestJS 内可注入的数据库能力。

该模块是后续将 in-memory store 替换为持久化 store 的基础。

## 当前实现

路径：

```text
apps/api/src/db/
  database.constants.ts
  database.types.ts
  database.module.ts
  database.service.ts
  schema.ts
```

## Provider

当前提供两个注入 token：

```ts
PG_POOL
DRIZZLE_DB
```

其中：

- `PG_POOL` 是 `pg.Pool`
- `DRIZZLE_DB` 是 `drizzle-orm/node-postgres` 的 database 实例

`DatabaseModule` 标记为 `@Global()`，避免重复创建连接池。

## DatabaseService

当前方法：

```ts
ping(): Promise<DatabaseHealth>
```

返回：

```ts
type DatabaseHealth = {
  status: "ok" | "error";
  latencyMs: number;
  message?: string;
};
```

如果数据库未启动，`ping()` 返回 `error`，不会让 API 服务崩溃。

## Health Check

`GET /api/health` 当前会返回数据库状态：

```json
{
  "status": "ok",
  "service": "enterprise-agent-api",
  "environment": "development",
  "uptimeSeconds": 10,
  "timestamp": "...",
  "dependencies": {
    "database": {
      "status": "ok",
      "latencyMs": 3
    }
  }
}
```

## 配置项

```bash
DATABASE_URL=postgresql://agent:agent_password@localhost:5432/agent_db
DATABASE_POOL_MAX=10
```

## 生命周期

`DatabaseService` 实现 `OnModuleDestroy`，应用关闭时会执行：

```ts
pool.end()
```

## 当前边界

已完成：

- PostgreSQL Pool Provider
- Drizzle DB Provider
- 全局 DatabaseModule
- DatabaseService
- 数据库 ping
- HealthController 接入数据库探测
- 连接池关闭生命周期

未完成：

- repository 层
- transaction helper
- migration 自动运行
- EvaluationStore 持久化替换
- KnowledgeStore 持久化替换
- WorkflowStore 持久化替换
- TraceStore 持久化替换

## 下一步

建议下一步先替换 `EvaluationStore`：

1. 新增 PostgresEvaluationStore
2. 复用现有 EvaluationStore 接口
3. 写入 `evaluation_cases`
4. 写入 `evaluation_runs`
5. 保持 controller/service 不变
6. 验证 in-memory 到 PostgreSQL 的替换边界
