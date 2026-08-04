# 🐘 SQL Playground（rucdbcloud）

> 一款面向数据库学习与演示的 **在线 SQL 交互式操作平台**，内置 **TPC-C 数据库性能基准测试**。
> 不需要自己装数据库，打开浏览器就能建表、查询、增删改数据，还能一键跑一次真实的数据库性能压测，直观感受"数据库到底快不快"。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-000000)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)](https://www.postgresql.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1)](https://www.mysql.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)](https://www.docker.com/)

---

## 📑 目录

- [1️⃣ 项目概述](#1️⃣-项目概述)
- [2️⃣ 技术栈详解](#2️⃣-技术栈详解)
- [3️⃣ 技术实现路径](#3️⃣-技术实现路径)
- [4️⃣ 项目成果展示](#4️⃣-项目成果展示)
- [5️⃣ 入门指南](#5️⃣-入门指南)
- [📎 附：目录结构](#-附目录结构)

---

## 1️⃣ 项目概述

### 它是做什么的

SQL Playground 是一个**运行在浏览器里的数据库实验室**。它给每个用户分配一个**独立、安全的沙箱数据库**，你可以在里面自由地执行 SQL、建表、插数据、跑查询——完全不影响别人，也不会碰坏系统数据。同时它内置了 **TPC-C 性能测试**，可以一键对 PostgreSQL 和 MySQL 跑基准压测，实时看吞吐量（TPM）、延迟等指标。

### 核心功能

| 功能 | 说明 |
|---|---|
| 🗂️ **SELECT 查询** | 表单式选择表/列/条件，自动生成 SQL；也可直接写 SQL |
| 🏗️ **CREATE 建表** | 可视化添加字段、设主键，自动生成建表语句 |
| ✏️ **UPDATE / 🗑️ DELETE** | 带 WHERE 条件编辑和删除，危险操作有二次确认 |
| 📊 **TPC-C 压测** | 选择规模一键压测，实时进度条 + 指标卡 + 历史记录 |
| 🔒 **沙箱隔离** | 每个用户一个独立数据库空间，数据互不可见 |
| ⚡ **双模式** | 所有操作都支持「表单模式」（免写 SQL）和「SQL 模式」 |

### 应用场景

- **教学演示**：在课堂上现场演示 SQL 增删改查，学生动手就能看到结果
- **数据库产品评测**：用 TPC-C 标准基准对比不同数据库的吞吐与延迟
- **技术分享 / 面试演示**：给非技术同事直观展示"数据库在后台做了什么"
- **自研数据库验证**：作为性能对比的基准测试平台

### 目标用户

面向**数据库初学者、教学讲师、技术售前、开发团队**——尤其是没有本地数据库环境、又希望快速上手 SQL 的人。整个界面和文档都尽量做到"非技术人员也能看懂"。

---

## 2️⃣ 技术栈详解

> 以下每个技术点都配了一句大白话解释，方便入门理解。

### 前端技术

| 技术 | 用途 | 通俗解释 |
|---|---|---|
| **React 19** | UI 框架 | 用"组件"把界面搭起来，像搭积木，可复用 |
| **TypeScript** | 编程语言 | 写代码时提前发现类型错误，少出 bug |
| **Tailwind CSS 3** | 样式方案 | 直接在标签上写类名控制外观，改起来快 |
| **Vite 8** | 构建工具 | 开发时热更新秒级生效，打包时自动优化体积 |
| **react-router-dom 7** | 前端路由 | 控制"页面 A 跳到页面 B" |
| **CodeMirror 6** | 代码编辑器 | 带语法高亮的 SQL 输入框，和真实 IDE 类似 |
| **axios** | 网络请求 | 前端跟后端接口"打电话"用的工具 |

### 后端技术

| 技术 | 用途 | 通俗解释 |
|---|---|---|
| **Node.js 20 + Express 4** | 服务器 | 接收浏览器请求并返回数据的"前台" |
| **TypeScript** | 编程语言 | 同上，写后端也更安全 |
| **PostgreSQL 16** | 主数据库 | 每个用户一个独立"房间"（schema），互不打扰 |
| **MySQL 8.0** | 副数据库 | TPC-C 压测的另一个被测对象 |
| **pg / mysql2** | 数据库驱动 | 后端连接这两类数据库的"接线" |
| **自定义 SQL 解析器** | 安全防线 | 拦截危险语句（如删全表、sleep 攻击） |
| **express-rate-limit** | 限流组件 | 防止有人刷接口、批量建库拖垮服务器 |

### 开发工具

| 工具 | 用途 | 通俗解释 |
|---|---|---|
| **Git + GitHub** | 版本控制 | 记录每次改动，方便回滚、协作 |
| **Docker Compose** | 一键部署 | 一条命令把数据库 + 后端 + 前端全部跑起来 |
| **Vitest** | 测试框架 | 自动检查代码有没有写坏，回归保护 |
| **oxlint** | 代码检查 | 提前发现不规范 / 潜在问题的写法 |
| **tsc** | 类型检查 | 编译前再帮我们兜底一遍类型 |

---

## 3️⃣ 技术实现路径

### 架构总览

```mermaid
flowchart LR
    subgraph 浏览器
        UI[前端界面<br/>React + Tailwind]
    end
    subgraph Nginx
        NG[nginx 反向代理<br/>静态资源 + /api 转发]
    end
    subgraph 后端服务（Node.js / Express）
        API[Express API 网关]
        SQLG[SQL 安全守卫]
        SAND[沙箱管理器]
        TPC[TPC-C 测试引擎]
        AUDIT[审计日志]
    end
    subgraph 数据库层
        PG[(PostgreSQL 16<br/>每个用户一个 schema 沙箱)]
        MY[(MySQL 8.0<br/>TPC-C 基准)]
    end

    UI --> NG
    NG --> API
    API --> SQLG
    SQLG --> SAND
    SAND --> PG
    API --> TPC
    TPC --> PG
    TPC --> MY
    API --> AUDIT
```

**一句话看懂**：浏览器 → nginx（负责静态页面和转发）→ 后端 API → 先过「SQL 安全守卫」再操作数据库；每个用户的 SQL 只在自己那个沙箱 schema 里执行，TPC-C 压测则同时打向 PostgreSQL 和 MySQL。

### 开发阶段时间线

| 阶段 | 里程碑 | 做了什么 |
|---|---|---|
| **① 核心功能** | 初始化版本 | 搭起前后端骨架：SELECT / CREATE / UPDATE / DELETE 四页 + 表单/SQL 双模式 + 沙箱数据库 |
| **② 安全加固** | P0 / P1 / P2 三轮 | 加安全响应头、CORS 白名单、限流、沙箱配额、SQL 守卫、审计日志 |
| **③ 性能优化** | P2 优化 | 路由级代码分割，首屏体积从 **633KB 降到 291KB**（-54%） |
| **④ 数据库切换** | 双库支持 | 演示沙箱切到 PostgreSQL，并新增 TPC-C 双数据库（PG + MySQL）压测 |
| **⑤ 缓存与修复** | 缓存策略 + 数据修复 | nginx 缓存头优化（解决浏览器缓存旧版）；修复 PostgreSQL 身份列导致沙箱空数据的问题 |
| **⑥ 前端改版** | 现代化 UI | 整体换成阿里云风浅色界面，统一 SVG 图标，去除深色模式，重构设计 token |

### 关键技术难点与解决方案

1. **多用户安全隔离** —— 不能让大家共用一张表。
   → 采用 **PostgreSQL schema 隔离**：每个用户一个独立 schema，并用**低权限数据库账号**执行用户 SQL，即使语句越界也碰不到别的库。

2. **SQL 注入 / 危险语句** —— 用户可能提交 `DROP TABLE`、`pg_sleep()` 等恶意或拖垮数据库的语句。
   → 自研 **SQL 解析器**做白名单 + 黑名单双校验：只允许常见 DML/DDL，拦截危险函数（`pg_sleep` 等）、系统库访问、跨用户越权。

3. **批量建库 DoS 攻击** —— 有人写脚本不停创建沙箱，很快把磁盘塞满。
   → 分层限流：全局 IP 限流 + 每会话限流 + **单 IP 活跃沙箱配额（默认 3 个）**。

4. **PostgreSQL 身份列数据迁移** —— 模板主键用了 `GENERATED ALWAYS AS IDENTITY`，导致种子数据和沙箱克隆报 `cannot insert a non-DEFAULT value`，用户看到"查不到任何表"。
   → 修复种子 SQL（不再显式插入主键），沙箱克隆改用 `OVERRIDING SYSTEM VALUE` 并重置自增序列，示例数据恢复正常。

5. **首屏加载慢** —— 单个 bundle 太大。
   → 按路由拆分代码（lazy load），首屏只加载首页需要的 JS。

6. **浏览器缓存旧版本** —— 用户老是看到旧界面。
   → nginx 对 `index.html` 设 `no-cache`，对带 hash 的静态资源设长缓存，保证永远加载到最新版本。

---

## 4️⃣ 项目成果展示

### 功能成果

- ✅ **四个核心操作页**（查询/建表/更新/删除），全部支持"表单模式 + SQL 模式"双通道
- ✅ **可视化查询构建器**：选表、勾列、加 WHERE 条件、排序、限制行数，自动生成 SQL
- ✅ **TPC-C 实时压测**：启动后 500ms 轮询刷新，进度条 + 已完成事务数 + TPM + 平均延迟 + 五种事务分布条形图 + 历史记录
- ✅ **沙箱化示例数据**：每个用户开箱即用 `employees`（10 行）/ `orders`（12 行）示例表
- ✅ **危险操作二次确认**：无 WHERE 条件的 UPDATE/DELETE、DROP TABLE 都会弹窗确认

### 技术成果

- **🔐 纵深安全**：从「网络层限流 → 应用层 SQL 守卫 → 数据库层低权限账号 → schema 隔离」四层防护；审计日志记录每条 SQL 及放行/拒绝结果
- **🚀 性能优化**：首屏 bundle **633KB → 291KB**（-54%）；全站路由级代码分割
- **🔧 可扩展架构**：通过 `IDatabaseAdapter` 适配器接口解耦，一套业务逻辑同时驱动 PostgreSQL 与 MySQL，未来接入新数据库只需新增一个适配器
- **🧪 自动化测试保障**：后端 Vitest 测试 **127 个**全部通过（SQL 解析、沙箱管理、安全守卫、适配器、集成安全等），前端组件测试 8 个

### 数据成果

| 指标 | 数据 |
|---|---|
| 首屏体积优化 | 633 KB → **291 KB**（-54%） |
| 后端自动化测试 | **127 个**全部通过 |
| 前端组件测试 | 8 个全部通过 |
| 支持数据库 | **PostgreSQL 16 + MySQL 8.0** 双数据库 |
| 沙箱隔离能力 | 每用户独立 schema，单 IP 配额 3 个，全局上限 200 个 |
| 基准测试 | 内置 **TPC-C** 标准事务（NewOrder/Payment/OrderStatus/Delivery/StockLevel） |

> TPC-C 的具体 TPM / 延迟数据取决于服务器配置与压测规模，属于"运行时指标"，故不在此列出一组固定数字——你部署后一键压测即可获得真实结果。

---

## 5️⃣ 入门指南

### 环境要求

- 安装 **Docker** + **Docker Compose**（这是唯一需要装的东西，数据库和代码都在容器里跑）
  - Windows：安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  - 服务器（CentOS / Alibaba Cloud Linux）：`dnf install -y docker docker-compose-plugin`

### 快速启动（3 步）

```bash
# 1. 拉取代码（当前版本与本文档一致）
git clone https://github.com/yyt040621/play-rucdbcloudv2.git
cd play-rucdbcloudv2

# 2. 配置环境变量（复制模板后填上 MySQL 密码）
cp .env.example .env
#   然后编辑 .env，把 MYSQL_ROOT_PASSWORD 改成自己的密码

# 3. 一键启动（自动拉起 PostgreSQL、MySQL、后端、前端）
docker compose up -d --build
```

启动完成后：

- 打开浏览器访问 **`http://localhost:8080`**（前端界面）
- 后端接口在 `http://localhost:3001`，健康检查：`curl http://localhost:3001/api/v1/health`

> 想在服务器上对外提供访问，记得在云安全组里放行 **8080**（前端）和 **3001**（后端，如需要直连）。
> 若想与旧版本并存预览新界面，可另起 `docker-compose.v2.yml`（前端 8081 / 后端 3002），互不影响。

### 基本操作

1. **首页** 选择「性能测试」或「功能演示」进入
2. **SELECT 页**：左上选表 → 勾选列 → 添加 WHERE 条件 → 点「查询」；或切换到「SQL」模式直接写 `SELECT * FROM employees;`
3. **CREATE 页**：建表 Tab 填表名、加字段、设主键 → 生成并执行；插入数据 Tab 选表填值插入
4. **UPDATE / DELETE 页**：选表 → 填 SET / WHERE → 执行（无 WHERE 会弹窗确认）
5. **Test 页**：选数据库（MySQL / PostgreSQL）→ 选规模 → 开始测试，看实时指标

### 本地开发

```bash
# 后端（需本地有 PostgreSQL + MySQL，或用 docker 起数据库）
cd server && npm install && npm run dev

# 前端（Vite 开发服务器，默认 http://localhost:5173）
cd client && npm install && npm run dev

# 跑测试
cd server && npx vitest run
cd client && npx vitest run
```

---

## 📎 附：目录结构

```
rucdbcloud/
├── client/                 # 前端（React + TypeScript + Vite）
│   └── src/
│       ├── components/     # 通用组件（编辑器、结果表格、UI 原语等）
│       ├── pages/          # 页面（Home/Test/Demo/Select/Create/Update/Delete）
│       ├── hooks/          # 自定义 React Hooks
│       └── services/       # API 请求封装
├── server/                 # 后端（Node.js + Express + TypeScript）
│   └── src/
│       ├── adapters/       # 数据库适配器（PostgreSQL / MySQL）
│       ├── routes/         # API 路由（session/schema/query/tpcc）
│       ├── services/       # 沙箱管理、SQL 执行、SQL 解析、模板数据等
│       └── middleware/     # 限流、SQL 守卫、安全响应头
├── docker-compose.yml      # 一键部署编排（v1：前端 8080 / 后端 3001）
├── docker-compose.v2.yml   # 独立预览栈（前端 8081 / 后端 3002，可与 v1 并存）
└── .env.example            # 环境变量模板
```

---

> 本项目未附带开源许可证，如需商用或二次分发请先与作者联系。
