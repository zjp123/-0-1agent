# 本地 Postgres 端口冲突故障记录

记录日期：2026-06-16

结论：如果本地启动 API 时看到 `role "agent" does not exist`，优先按“连错 Postgres 实例”处理，不要先怀疑 Docker health、Drizzle schema 或 RAG worker。

## 背景

本地启动 `npm run dev:api` 时，后端多次在启动后崩溃，错误集中在 Drizzle / pg 连接数据库阶段。

典型错误：

```text
DrizzleQueryError: Failed query: insert into "trace_events" ...
cause: error: role "agent" does not exist
```

## 根因

本机已有 PostgreSQL 监听：

```text
127.0.0.1:5432
```

同时项目 Docker Postgres 也曾映射到：

```text
0.0.0.0:5432->5432
```

API 使用 `localhost:5432` 时，实际连到的是本机 PostgreSQL，而不是 Docker 容器 `enterprise-agent-postgres`。本机 PostgreSQL 中没有 `agent` role，因此报：

```text
role "agent" does not exist
```

## 修复方案

本项目本地 Docker Postgres 固定使用宿主机端口 `15432`：

```text
15432 -> container 5432
```

关键配置：

```text
DATABASE_URL=postgresql://agent:agent_password@localhost:15432/agent_db
POSTGRES_PORT=15432
```

相关文件：

- `.env`
- `.env.example`
- `infra/docker-compose.yml`
- `docs/local-start-required.md`

## API 读取根 `.env`

`npm run dev:api` 实际在 workspace `apps/api` 下启动。为了确保 dev 模式也读取根目录 `.env`，API 配置增加：

```ts
envFilePath: [".env", "../../.env"]
```

文件：

```text
apps/api/src/app.module.ts
```

## 验证命令

确认 Docker 端口映射：

```bash
docker compose -f infra/docker-compose.yml ps
docker port enterprise-agent-postgres
```

期望：

```text
0.0.0.0:15432->5432/tcp
```

确认 Node pg 连接正确：

```bash
node -e "import('pg').then(async ({Pool}) => { const pool = new Pool({ connectionString: 'postgresql://agent:agent_password@127.0.0.1:15432/agent_db' }); try { const r = await pool.query('select current_user, current_database()'); console.log(r.rows); } finally { await pool.end(); } })"
```

期望：

```text
agent / agent_db
```

确认 API readiness：

```bash
curl -sS http://127.0.0.1:3000/api/health/ready
```

期望：

```text
"status":"ok"
```

## 避免再犯

- 不要把本项目本地 Postgres 映射到宿主机 `5432`。
- 本地启动文档统一使用 `15432`。
- 如果看到 `role "agent" does not exist`，先检查是否连错了 Postgres。
- 如果 `docker exec enterprise-agent-postgres psql -U agent -d agent_db` 成功，但 Node pg 失败，说明宿主机连接端口不对。

## 固定排查顺序

1. 查看 `.env`，确认 `DATABASE_URL` 指向 `localhost:15432`。
2. 查看 `infra/docker-compose.yml`，确认 Postgres 映射为 `${POSTGRES_PORT:-15432}:5432`。
3. 运行 `docker port enterprise-agent-postgres`，确认宿主机端口是 `15432`。
4. 运行 Node pg 验证命令，确认 `current_user=agent` 且 `current_database=agent_db`。
5. 再启动 `npm run dev:api`。
