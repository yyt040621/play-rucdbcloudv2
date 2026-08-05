# 🤝 项目交接文档（HANDOFF）

> 记录当前工作进度、卡点、待办与踩坑经验。本仓库为 **v2 线**（新界面 + BenchBase 压测），v1 主仓库（旧版部署）不受影响。

---

## 1️⃣ 我们在做什么任务

**用 CMU 开源的 BenchBase 替换项目自研的 TPC-C 压测引擎**，改造「性能测试」页：每次选择一个数据库（MySQL 或 PostgreSQL）跑标准 TPC-C 基准，展示最终报告（tpmC / TPM / 延迟分位数）。

- 这是整个项目当前的主线任务。
- 背景：项目已先后完成「前端现代化改版」「后端 PostgreSQL 数据修复」「v1/v2 双部署」「README 文档」。

## 2️⃣ 我们已经完成了什么

### 已完成并部署（v2 线上 8081 可访问）

| 事项 | 状态 | 说明 |
|---|---|---|
| 后端修复：PostgreSQL IDENTITY 沙箱数据为空 | ✅ 已上线 | 模板种子/克隆不再显式插入主键，`employees=10 / orders=12` 恢复 |
| 前端 UI 现代化改版（阿里云风浅色） | ✅ 已上线 v2 | 首页落地页 hero、白卡控制台、SVG 图标、去深色模式 |
| v1 / v2 双仓库 + 双栈部署 | ✅ 已上线 | v1 旧站 8080；v2 新站 8081 / 后端 3002，互不影响 |
| 完整 README 文档 | ✅ 已推送 v2 仓库 | 面向入门级的项目说明 |

### BenchBase 替换（代码已完成，验证中）

| 子项 | 状态 |
|---|---|
| `server/Dockerfile` 多阶段构建（JDK 23 + BenchBase 双驱动合并） | ✅ 镜像构建成功 |
| `server/src/services/benchbase-runner.ts`（配置生成/spawn/监控/结果解析/history） | ✅ 完成 |
| `tpcc` 路由改 BenchBase、删除自研 runner（约 900 行） | ✅ 完成 |
| 启动时确保专用 `benchbase` 数据库存在 | ✅ 完成 |
| 前端 `TestPage.tsx` 重写（单库选择 + 阶段徽标 + 最终报告） | ✅ 完成 |
| 服务器镜像实际构建 + 容器重启 | ✅ 成功 |

## 3️⃣ 我们现在卡在哪里

**卡在 BenchBase 实际运行的最后一公里**——java 进程能起来，但多次遇到运行时问题，已连续修复 5 轮，**刚改完最后一处，尚未验证**：

1. ✅ **JDK 版本**：`invalid target release: 23` → 构建镜像从 JDK 17 升到 23（`maven:3.9-eclipse-temurin-23`）。
2. ✅ **发行包目录**：Maven 默认只出 tgz/zip → 加 `-Ddescriptors=src/main/assembly/dir.xml`。
3. ✅ **glibc/musl 不兼容**：Alpine 跑 Ubuntu 的 JDK → `java: not found` → 运行时基镜像改为 `eclipse-temurin:23-jre`，Node 用官方 tarball 装。
4. ✅ **benchbase.jar 定位**：发行包结构嵌套 → 用 `find` 平铺到 `/opt/benchbase/benchbase.jar`。
5. ✅ **config/plugin.xml 缺失**：BenchBase 启动要按相对路径找 `config/plugin.xml` → 已改为**从源码直接拷贝** `config/`，runner 的 `cwd` 设为发行包根目录、配置走绝对路径。
6. ⏳ **待验证**：在服务器跑一次 pgsql 小规模测试，确认 `phase="done"`、`tpmTOTAL>0`、结果 JSON 能解析。

> 此外：我的**远程执行工具间歇性故障**（安全分类器不可用），导致部分验证命令需要用户在服务器 SSH 里手动跑。

## 4️⃣ 还有哪些任务没完成

- [ ] **验证 BenchBase pgsql 端**：跑 `small` 20s，确认 `phase=done` + `tpmTOTAL>0` + 结果解析正确（命令见下文「怎么继续」）。
- [ ] **验证 MySQL 端**：同样跑一次 `mysql`，确认双驱动（lib/ 里已有 `mysql-connector-java`）能连能跑。
- [ ] **前端验收**：浏览器 8081 → 性能测试页 → 点开始 → 跑完看到报告卡片。
- [ ] **调大单 IP 沙箱配额**：`MAX_SANDBOXES_PER_IP=3` 对演示站太紧（同 IP 第 4 个访客就 429），建议改成 50 左右（改 `docker-compose.v2.yml`）。
- [ ] **处理 v2 重启时的模板种子告警**：`Failed to initialize schemas ... duplicate key ... employees_email_key`（非致命，但日志噪音；模板已有数据，沙箱不受影响）。
- [ ] **更新 README**：把「性能测试」章节从自研 TPC-C 改为 BenchBase 说明。
- [ ] **收尾提交**：验证通过后补齐提交（当前工作区已全部提交，验证中若有改动需再 commit）。

## 5️⃣ 踩过的坑（不要再踩）

1. **BenchBase 必须 JDK 23 编译**（pom 里 `maven.compiler.release=23`）。JDK 17 直接报 `invalid target release: 23`。构建用 `maven:3.9-eclipse-temurin-23`。
2. **不能把 glibc 的 JDK 拷进 Alpine（musl）运行时**：`java` 会报 `not found`（实际是动态链接器缺失）。运行时基镜像必须 glibc：`eclipse-temurin:23-jre`，Node 用官方 tarball（`node-v20.x-linux-x64.tar.xz`）装，别 `apk add nodejs`（版本不可控）。
3. **BenchBase 发行包默认只出 tgz/zip，不出目录**：必须 `-Ddescriptors=src/main/assembly/dir.xml`。
4. **发行包目录结构不可靠（会嵌套）**：不要假定路径，用 `find` 定位 `benchbase.jar` 平铺到 `/opt/benchbase/benchbase.jar`，双驱动 jar 用 `find -exec cp` 合并进 `lib/`。
5. **BenchBase 运行依赖 `config/plugin.xml`（相对 CWD 查找）**：必须把源码 `config/` 目录拷进发行包（`cp -r /build/benchbase/config /dist/final/config`），且 runner 的 `cwd` 设为发行包根目录，工作配置用**绝对路径** `-c` 传入。
6. **runner 状态保留**：进程退出后 `this.current` 置空会导致前端查状态变成 idle、结果丢失。必须用 `lastByDb` 保留每库最近一轮的 status/result。
7. **单 IP 沙箱配额=3 是测试/演示的大坑**：同一 IP（含服务器 localhost 自测）第 4 个会话就 429「每个 IP 最多同时创建 3 个沙箱」。清测试沙箱需要直接改生产库（`docker exec ... psql UPDATE playground_admin.sandboxes`），**这类操作会被安全分类器拦截，需用户明确授权**。
8. **本机 Docker Hub API 被限流**：查镜像 tag 会失败，靠服务器实际 `docker pull` 验证即可（`maven:3.9-eclipse-temurin-23`、`eclipse-temurin:23-jre` 都存在）。
9. **构建迭代慢**：每次改 Dockerfile 会失效 Maven 层（重下载依赖，约 4-7 分钟）。只改小步骤（如合并/拷贝）时尽量不动 Maven 构建命令，可复用缓存。
10. **v2 重启时模板种子可能报 duplicate email**：seed 用 `ON CONFLICT (id)` 但 email 唯一键可能冲突，属非致命告警；不影响已建沙箱。

## 📌 关键信息备忘

- **服务器**：`123.57.84.92`（root），项目 `/root/sqlplayground-v2`（v2 线）。
- **端口**：v1 前端 8080 / 后端 3001；v2 前端 8081 / 后端 3002。
- **仓库**：v1 `yyt040621/rucdbcloud.playground`（只到后端修复）；v2 `yyt040621/play-rucdbcloudv2`（当前主线，含前端改版 + README + BenchBase）。
- **v2 栈命令**：`cd /root/sqlplayground-v2 && docker compose -f docker-compose.v2.yml up -d --build server`（重建 server；Maven 层已缓存则很快）。
- **关键文件**：
  - `server/Dockerfile`（JDK23 + BenchBase 构建）
  - `server/src/services/benchbase-runner.ts`（压测执行器）
  - `server/src/routes/tpcc.routes.ts`（start/status/result/history/stop）
  - `client/src/pages/TestPage.tsx`（性能测试页）
  - `server/src/config/index.ts`（`benchbase` 配置段）
- **镜像内 BenchBase 布局**：`/opt/benchbase/benchbase.jar` + `/opt/benchbase/lib/*.jar`（含 PG+MySQL 双驱动）+ `/opt/benchbase/config/plugin.xml`。

## ▶️ 怎么继续（下一个执行者）

```bash
# 在服务器 SSH 里（root@123.57.84.92）：
# 1) 清测试沙箱释放单 IP 配额
docker exec sqlplayground-v2-postgres psql -U playground -d rucdbcloud \
  -c "UPDATE playground_admin.sandboxes SET status='cleaned' WHERE status='active';"

# 2) 确认 config/plugin.xml 已就位
docker exec sqlplayground-v2-server ls /opt/benchbase/config/plugin.xml

# 3) 跑一次 pgsql 小规模 20 秒测试
SID=$(curl -s -X POST http://localhost:3002/api/v1/session | sed 's/.*"sessionId":"\([^"]*\)".*/\1/')
curl -s -X POST -H "X-Session-Id: $SID" -H "Content-Type: application/json" \
  -d '{"database":"pgsql","scale":"small","durationSec":20}' \
  http://localhost:3002/api/v1/tpcc/start

# 4) 等约 70 秒后查状态与结果
sleep 70
curl -s -H "X-Session-Id: $SID" "http://localhost:3002/api/v1/tpcc/status?database=pgsql"; echo
curl -s -H "X-Session-Id: $SID" "http://localhost:3002/api/v1/tpcc/result?database=pgsql"; echo
```

**成功判据**：status `phase="done"`、result `tpmTOTAL>0`。若仍 `error`，把 message 发给上一执行者继续修。
