# 🤝 项目交接文档（HANDOFF）

> 本仓库为 **v2 线**（当前主线）。v1 主仓库（旧版部署）不受影响。
> **机密信息（服务器密码 / 数据库密码）不在此文件中，见本地 `SERVER_SECRETS.md`（已 gitignore，勿提交）。**

---

## 1️⃣ 我们在做什么

**rucdbcloud —— SQL Playground**：一款面向数据库学习与演示的**在线 SQL 交互式操作平台**，内置 **TPC-C 数据库性能基准测试**。

- 浏览器打开即可用，无需自己装数据库：查表、建表、增删改、跑真实压测（CMU BenchBase）。
- 每个用户一个**独立沙箱**（PostgreSQL schema 隔离），互不可见、互不影响。
- 压测支持 **PostgreSQL + MySQL 双数据库**，选一个跑标准 TPC-C，输出 tpmC / TPM / 延迟分位 / 总耗时。

### 项目当前状态

**主线功能已全部完成并上线部署**（当前部署在 `10.77.110.145`，详见 §3）。最近里程碑：

1. ✅ 前端现代化改版（阿里云风浅色界面）
2. ✅ 后端 PostgreSQL 沙箱数据修复（IDENTITY 种子/克隆）
3. ✅ **BenchBase 压测完全跑通**（PG + MySQL 双库验证通过、结果完整解析）
4. ✅ 压测页交互简化：删除执行时长选择器，固定 60s，结果卡/历史显示「总耗时」
5. ✅ 功能演示页改为与首页一致的 hero 风格
6. ✅ README / 部署 compose / 服务器源码目录全部同步

---

## 2️⃣ 系统流程和构成

### 2.1 架构总览

```
浏览器
  │  80/8081（nginx 静态 + /api 反代）
  ▼
nginx 容器 (client) ──/api/──▶ Express 后端容器 (server:3001)
                                  │
                    ┌─────────────┼──────────────┐
                    ▼             ▼              ▼
            PostgreSQL 16    MySQL 8.0     BenchBase 压测引擎
           (每用户一 schema  (TPC-C 被测    (JDK 23, 进程内跑
            的沙箱隔离)       对象)          TPC-C 事务)
```

- **前端**：React 19 + TypeScript + Vite 8 + Tailwind 3 + CodeMirror 6，路由级代码分割。
- **后端**：Node 20 + Express 4，自定义 SQL 解析器（白名单+黑名单）、express-rate-limit 限流、schema 隔离沙箱。
- **数据库**：PostgreSQL 16（主，沙箱隔离）+ MySQL 8.0（副，压测被测）。
- **压测**：CMU BenchBase（Java/Maven），PostgreSQL + MySQL 双驱动，`/opt/benchbase/benchbase.jar`。

### 2.2 代码结构

```
rucdbcloud/
├── client/                    # 前端 (React + TS + Vite)
│   └── src/
│       ├── pages/             # Home/Test/Demo/Select/Create/Update/Delete
│       ├── components/        # ui/ editor/ layout/ result/ sidebar/ common/
│       ├── hooks/             # useSession / useSchema / useSqlExecute
│       └── services/api.ts    # 所有后端 API 封装 + 类型定义
├── server/                    # 后端 (Node + Express + TS)
│   └── src/
│       ├── adapters/          # IDatabaseAdapter (PostgreSQL / MySQL)
│       ├── routes/            # session / schema / query / tpcc
│       ├── services/
│       │   ├── benchbase-runner.ts   # ★ 压测执行器（配置生成/spawn/监控/解析/history）
│       │   ├── sandbox-manager.ts    # 沙箱生命周期管理
│       │   ├── sql-*.ts              # SQL 解析与安全守卫
│       │   └── template-loader.ts    # 模板种子数据（employees/orders）
│       ├── middleware/        # 限流 / 安全头 / session
│       └── config/            # benchbase 配置段
├── docker-compose.deploy.yml  # ★ 部署用（预载镜像，不 build）
├── docker-compose.yml         # 本地一键启动 (v1 端口)
├── docker-compose.v2.yml      # 独立预览栈 (v2 端口)
└── .env.example               # 环境变量模板
```

### 2.3 部署拓扑（当前）

| 服务器 | 角色 | 状态 |
|---|---|---|
| `10.77.110.145` (gp-seg1) | **当前 v2 部署**：docker compose（client 80/8081、server 3002、postgres、mysql） | ✅ 运行中 |
| `10.77.110.144` (gp-master) | TiDB 集群节点（tikv+tiflash 常驻），非开发机 | ⚠️ 别乱部署 |
| `123.57.84.92` | 旧生产（v1 8080 / v2 8081），GitHub 被墙 | 旧环境 |

### 2.4 开发→上线工作流（关键！）

```
① 本地（Windows）改代码
② git add + git commit        ← 版本控制、可回滚
③ git push v2 main            ← 推 GitHub（备份/协作）
④ 本地编译：cd client && npm run build
⑤ 部署到 .145：
     docker cp dist 进 client 容器（热更新）   ← 日常改前端
     或 tar 打包 scp → 服务器解压（同步源码目录）← 改后端/结构时
```

**⚠️ 两个远程仓库（大坑）**：本地 `main` 跟踪的是 `origin`（旧仓库 `rucdbcloud.playground`），但**当前主线在 `v2`（`play-rucdbcloudv2`）**。直接 `git push` 会推到旧仓库！**必须 `git push v2 main`**。

---

## 3️⃣ 注意事项 / 踩坑经验（不要再踩）

### 3.1 部署类

1. **.145 访问 GitHub 被限速**（~26KB/s）→ 镜像用「从 .92 docker save → scp → load」迁移；日常改代码用**本地 build + docker cp 热更新**，不重建镜像。
2. **`.env` 密码必须匹配 `playground_app_pass`**：init SQL 硬编码 app 密码，若 `.env` 不同会导致沙箱查询报 `password authentication failed`。`.env` 备份在本地 `.env.server145`（已 gitignore）。
3. **docker cp 嵌套坑**：`docker cp 源目录/. 容器:/app/dist/` 可能生成 `/app/dist/dist/`，新代码不生效。先 `rm -rf 容器内/dist` 再拷。
4. **服务器源码目录 `/home/yyt/rucdbcloud` 非 git 仓库**，是拷贝副本。容器重建会回退到旧代码 → 改代码后记得把源码目录也同步（tar 管道，**排除 `.env`**）。
5. **BenchBase URL 的 `&` 必须转义为 `&amp;`**，否则 SAXParseException（已修复在 benchbase-runner.ts）。
6. **BenchBase 结果解析**：必须读 `summary.json`（Measured Requests/Throughput/Latency 微秒）+ `results.<Txn>.csv`（per-txn）。旧解析器按自定义 key 匹配全落空。
7. **单 IP 沙箱配额 = 50**（`MAX_SANDBOXES_PER_IP`），全局 200，演示够用。

### 3.2 网络 / 环境类

8. **aTrust VPN 下 SSH 不稳**：`kex_exchange_identification / Software caused connection abort` 会间歇出现 → 重试（通常 1-3 次内成功）。
9. **.144 (gp-master) 是 TiDB 节点**：占约 75G 内存、8 块 17TB 盘，别当干净开发机乱部署；yyt 无 docker/sudo。
10. **Windows 本机 bash 里无 rsync** → 同步用 tar 管道；PowerShell 中文输出乱码 → 加 `| iconv -f GBK -t UTF-8`。

### 3.3 开发类

11. **模板种子幂等**：employees 用 `ON CONFLICT (email)`（id 是 IDENTITY 不能 ON CONFLICT(id)）；orders 无唯一键须「表空才插」（VALUES 子查询里 order_date 要 `::timestamptz` 显式转换）。
12. **前端 bundle 防空**：结果字段可能为空，`toLocaleString()` 前加 `?? 0` 兜底，否则部署旧版会崩 `Cannot read properties of undefined`。
13. **压测时长**：`durationSec` 是测量窗口（默认 60s），真实总耗时还含建表+灌数据。前端结果卡/历史显示 `totalElapsedSec`（总耗时）。

---

## 4️⃣ 服务器与账户清单

> 密码等机密见本地 `SERVER_SECRETS.md`（本仓库 `.gitignore` 已忽略，不会提交）。

| 服务器 | SSH 用户 | 用途 | 关键路径 |
|---|---|---|---|
| `10.77.110.145` (gp-seg1) | yyt | **当前 v2 部署** | `/home/yyt/rucdbcloud`，compose: `docker-compose.deploy.yml` |
| `10.77.110.144` (gp-master) | yyt | TiDB 集群节点 | 非开发机，勿动 |
| `123.57.84.92` | root | 旧生产 | `/root/sqlplayground`（v1）、`/root/sqlplayground-v2`（v2） |

**端口**：当前部署 client 前端 `80`/`8081`，server 后端 `3002`（容器内 3001）。
**GitHub 仓库**：`yyt040621/play-rucdbcloudv2`（主线）；`yyt040621/rucdbcloud.playground`（旧）。

---

## 5️⃣ 常用命令速查

```bash
# 查看容器状态（.145）
ssh yyt@10.77.110.145 "docker ps"

# 后端日志
ssh yyt@10.77.110.145 "docker logs --tail 100 sqlplayground-v2-server"

# 前端热更新（本地 build 后）
scp -r dist 相关文件 到 /tmp → docker cp 进 sqlplayground-v2-client

# 同步源码目录（改代码后，排除 .env）
tar czf sync.tar.gz --exclude='.git' --exclude='node_modules' --exclude='.env' --exclude='.claude' .
scp sync.tar.gz yyt@10.77.110.145:/tmp/
ssh yyt@10.77.110.145 "cd /home/yyt/rucdbcloud && tar xzf /tmp/sync.tar.gz --no-overwrite-dir"

# 提交并推送（⚠️ 推 v2，不是 origin）
git add . && git commit -m "..." && git push v2 main
```

---

## ▶️ 下一个执行者怎么继续

1. **跑通压测**：浏览器开 `http://10.77.110.145` → 「性能测试」→ 选 MySQL 或 PostgreSQL → 选规模 → 开始测试 → 等阶段徽标走完 → 看结果卡（tpmC/TPM/延迟/总耗时）。
2. **改前端**：本地改 → `cd client && npm run build` → docker cp 进容器 → 刷新验证。
3. **改后端**：本地改 → 重新打包镜像或 docker cp 编译产物 → 重启 server 容器 → 看日志。
4. **遇到问题**：先看 `docker logs sqlplayground-v2-server`，压测报错看 message 字段，不确定就把错误发回。
