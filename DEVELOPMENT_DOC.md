# SQL Playground — 开发文档

> 一个在线 SQL 交互式演示平台，用户可在浏览器中体验完整的 MySQL 数据库操作，每个用户拥有独立的沙箱环境。

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术选型](#2-技术选型)
3. [系统架构](#3-系统架构)
4. [项目目录结构](#4-项目目录结构)
5. [数据库设计](#5-数据库设计)
6. [后端 API 设计](#6-后端-api-设计)
7. [前端设计](#7-前端设计)
8. [安全策略](#8-安全策略)
9. [会话与沙箱生命周期](#9-会话与沙箱生命周期)
10. [开发路线图](#10-开发路线图)
11. [部署方案](#11-部署方案)

---

## 1. 项目概述

### 1.1 项目定位

本项目是一个**产品 Demo**，用于向潜在用户展示数据库产品的能力。用户无需安装任何软件，打开浏览器即可体验完整的 SQL 操作。

### 1.2 核心功能

| 功能 | 描述 |
|------|------|
| SQL 执行 | 支持 SELECT / INSERT / UPDATE / DELETE / CREATE TABLE / DROP TABLE 等 |
| 多语句执行 | 一次输入多条 SQL 语句，逐条执行并返回各自结果 |
| 预置示例 | 预加载 `employees` 和 `orders` 两张表及示例数据 |
| 表结构浏览 | 左侧面板展示数据库中的表列表及字段详情 |
| 查询结果展示 | 表格形式展示查询结果，含列名、行数、执行耗时 |
| 用户隔离 | 每位用户分配独立的临时数据库，互不影响 |
| 主题切换 | 支持深色 / 浅色模式 |

### 1.3 非功能需求

- **多用户隔离**：每个用户独立沙箱（临时数据库）
- **安全性**：SQL 白名单 + 危险操作拦截 + 资源限制
- **会话管理**：localStorage Session ID，24 小时过期
- **深色/浅色主题**：支持一键切换

---

## 2. 技术选型

### 2.1 总览

| 层 | 技术 | 版本 | 说明 |
|----|------|------|------|
| 前端 | React + TypeScript | 18.x | 组件化开发，类型安全 |
| 构建工具 | Vite | 5.x | 快速 HMR，开箱即用 |
| UI 样式 | Tailwind CSS | 3.x | 原子化 CSS，主题切换方便 |
| SQL 编辑器 | CodeMirror 6 | 6.x | 轻量、可扩展、SQL 语法高亮 |
| HTTP 客户端 | Axios | 1.x | 请求拦截、错误处理 |
| 后端 | Node.js + Express | 20 LTS + 4.x | 异步非阻塞，生态丰富 |
| 数据库驱动 | mysql2 | 3.x | Promise 支持、连接池 |
| 数据库 | MySQL | 8.0+ | 关系型数据库 |
| 部署 | Docker + Docker Compose | — | 一键部署 |

### 2.2 选型理由

- **React**：生态成熟，组件化便于维护；社区资料丰富
- **CodeMirror 6**：比 Monaco Editor 更轻量（~150KB vs ~2MB），SQL 语法高亮足够用，且支持移动端
- **Tailwind CSS**：天然支持 dark mode（`class` 策略），无需额外主题方案
- **Express**：最简洁的 Node.js 框架，适合 API 服务；TypeScript 保证类型安全
- **mysql2**：官方推荐的 MySQL Node.js 驱动，支持 Prepared Statements

---

## 3. 系统架构

### 3.1 架构图

```
┌──────────────────────────────────────────────────────────┐
│                      用户浏览器                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │              React SPA (Vite)                       │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │ 左侧面板  │  │  SQL 编辑器   │  │  结果表格    │  │  │
│  │  │ 表列表   │  │  (CodeMirror) │  │             │  │  │
│  │  └──────────┘  └──────────────┘  └─────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
│                         │ HTTP REST API                   │
└─────────────────────────┼────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────┐
│                  Express Server (Node.js)                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  中间件层                                           │  │
│  │  CORS → Session 解析 → SQL 安全检查 → 限流 → 路由   │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  服务层                                             │  │
│  │  SandboxManager → SQL Executor → Schema Provider   │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  数据层                                             │  │
│  │  管理库连接池 ────→ sandbox_<uuid> (临时用户库)     │  │
│  │  模板库连接   ────→ playground_template (预置数据)   │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────┐
│                     MySQL 8.0                              │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ playground_admin │  │  sandbox_xxx │  │ sandbox_yyy │ │
│  │ (管理库)         │  │  (用户A沙箱)  │  │ (用户B沙箱) │ │
│  └─────────────────┘  └──────────────┘  └─────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 3.2 数据库抽象层设计

> 当前阶段连接 MySQL（通过 mysql2 驱动），但需预留接口以支持未来切换到自建数据库。

```
                    ┌─────────────────────┐
                    │   IDatabaseAdapter   │  ← 接口/抽象类
                    │   (database-adapter) │
                    ├─────────────────────┤
                    │ + connect()         │
                    │ + execute(sql)      │
                    │ + createDatabase()  │
                    │ + dropDatabase()    │
                    │ + getTables()       │
                    │ + getTableSchema()  │
                    │ + disconnect()      │
                    └─────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              │                               │
   ┌──────────┴──────────┐     ┌──────────────┴──────────────┐
   │  MySQLAdapter       │     │  FutureDatabaseAdapter      │
   │  (当前实现)          │     │  (未来自建数据库实现)         │
   └─────────────────────┘     └─────────────────────────────┘
```

所有数据库操作通过 `IDatabaseAdapter` 接口进行，未来切换数据库只需实现新的 Adapter。

---

## 4. 项目目录结构

```
sql-playground/
├── client/                          # React 前端
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx           # 顶部导航栏（Logo + 主题切换 + 重置按钮）
│   │   │   │   ├── Sidebar.tsx          # 左侧面板（表列表 + 表结构）
│   │   │   │   └── MainPanel.tsx        # 右侧主区域容器
│   │   │   ├── editor/
│   │   │   │   ├── SqlEditor.tsx         # CodeMirror 封装的 SQL 编辑器
│   │   │   │   └── EditorToolbar.tsx     # 编辑器工具栏（执行按钮、快捷键提示）
│   │   │   ├── result/
│   │   │   │   ├── ResultTable.tsx       # 查询结果表格组件
│   │   │   │   ├── ResultSummary.tsx     # 结果摘要（行数、耗时）
│   │   │   │   └── ErrorDisplay.tsx      # 错误信息展示
│   │   │   ├── sidebar/
│   │   │   │   ├── TableList.tsx         # 表列表
│   │   │   │   └── TableSchema.tsx       # 选中表的字段详情
│   │   │   └── common/
│   │   │       ├── ThemeToggle.tsx       # 深色/浅色切换按钮
│   │   │       ├── Loading.tsx           # 加载状态
│   │   │       └── Toast.tsx             # 提示消息
│   │   ├── hooks/
│   │   │   ├── useSession.ts            # Session ID 管理
│   │   │   ├── useSqlExecute.ts         # SQL 执行请求
│   │   │   ├── useSchema.ts             # 数据库 schema 获取
│   │   │   └── useTheme.ts              # 主题切换
│   │   ├── services/
│   │   │   └── api.ts                   # Axios 封装 + API 请求函数
│   │   ├── types/
│   │   │   └── index.ts                 # TypeScript 类型定义
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css                    # Tailwind 入口
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── package.json
│
├── server/                          # Node.js 后端
│   ├── src/
│   │   ├── adapters/
│   │   │   ├── database-adapter.interface.ts  # 数据库适配器接口
│   │   │   └── mysql-adapter.ts              # MySQL 适配器实现
│   │   ├── middleware/
│   │   │   ├── session.middleware.ts          # Session 解析中间件
│   │   │   ├── sql-guard.middleware.ts        # SQL 安全检查中间件
│   │   │   └── rate-limit.middleware.ts       # 限流中间件
│   │   ├── routes/
│   │   │   ├── index.ts                      # 路由汇总
│   │   │   ├── session.routes.ts             # 会话相关路由
│   │   │   ├── query.routes.ts               # SQL 执行路由
│   │   │   └── schema.routes.ts              # Schema 查询路由
│   │   ├── services/
│   │   │   ├── sandbox-manager.ts            # 沙箱生命周期管理
│   │   │   ├── sql-executor.ts              # SQL 执行器
│   │   │   ├── sql-parser.ts                # SQL 分析与安全检查
│   │   │   ├── template-loader.ts           # 预置数据加载
│   │   │   └── cleanup-scheduler.ts         # 过期沙箱清理定时任务
│   │   ├── config/
│   │   │   └── index.ts                     # 配置（端口、数据库连接等）
│   │   ├── types/
│   │   │   └── index.ts                     # 类型定义
│   │   └── index.ts                         # 入口文件
│   ├── tsconfig.json
│   └── package.json
│
├── docker-compose.yml               # Docker 编排
├── Dockerfile.client                # 前端 Dockerfile
├── Dockerfile.server                # 后端 Dockerfile
├── .env.example                     # 环境变量示例
└── README.md
```

---

## 5. 数据库设计

### 5.1 管理库：`playground_admin`

用于存储会话元数据和清理任务状态。

```sql
CREATE DATABASE IF NOT EXISTS playground_admin
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE playground_admin;

-- 活跃沙箱记录
CREATE TABLE sandboxes (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id    VARCHAR(64)  NOT NULL UNIQUE,
  db_name       VARCHAR(128) NOT NULL UNIQUE,         -- sandbox_<uuid>
  status        ENUM('active', 'expired', 'cleaned') NOT NULL DEFAULT 'active',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at    DATETIME     NOT NULL,
  INDEX idx_status (status),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB;

-- 操作审计日志（可选）
CREATE TABLE query_logs (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id    VARCHAR(64)  NOT NULL,
  sql_text      TEXT         NOT NULL,
  is_allowed    BOOLEAN      NOT NULL DEFAULT TRUE,
  error_message TEXT,
  executed_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id),
  INDEX idx_executed (executed_at)
) ENGINE=InnoDB;
```

### 5.2 模板库：`playground_template`

存储预置表结构和数据，用于克隆到用户沙箱。

```sql
CREATE DATABASE IF NOT EXISTS playground_template
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE playground_template;

-- 示例表 1：员工表
CREATE TABLE employees (
  id         INT           AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50)   NOT NULL,
  last_name  VARCHAR(50)   NOT NULL,
  email      VARCHAR(100)  NOT NULL UNIQUE,
  department VARCHAR(50)   NOT NULL,
  salary     DECIMAL(10,2) NOT NULL,
  hire_date  DATE          NOT NULL,
  is_active  BOOLEAN       NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

-- 示例数据
INSERT INTO employees (first_name, last_name, email, department, salary, hire_date) VALUES
('张', '伟',   'zhangwei@example.com',   '技术部',  15000.00, '2020-03-15'),
('李', '娜',   'lina@example.com',       '产品部',  18000.00, '2019-07-01'),
('王', '强',   'wangqiang@example.com',  '技术部',  16000.00, '2021-01-10'),
('赵', '敏',   'zhaomin@example.com',    '设计部',  14000.00, '2020-11-20'),
('刘', '洋',   'liuyang@example.com',    '市场部',  13000.00, '2022-05-05'),
('陈', '静',   'chenjing@example.com',   '人事部',  12000.00, '2021-09-12'),
('杨', '磊',   'yanglei@example.com',    '技术部',  17000.00, '2018-06-18'),
('黄', '丽',   'huangli@example.com',    '产品部',  15500.00, '2020-02-28'),
('周', '涛',   'zhoutao@example.com',    '技术部',  19000.00, '2017-12-01'),
('吴', '芳',   'wufang@example.com',     '设计部',  13500.00, '2022-08-15');

-- 示例表 2：订单表
CREATE TABLE orders (
  id           INT           AUTO_INCREMENT PRIMARY KEY,
  employee_id  INT           NOT NULL,
  customer     VARCHAR(100)  NOT NULL,
  product      VARCHAR(100)  NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  status       ENUM('pending', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
  order_date   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

-- 示例数据
INSERT INTO orders (employee_id, customer, product, amount, status, order_date) VALUES
(1, '客户A', '软件许可',        50000.00, 'delivered', '2024-01-15 10:30:00'),
(2, '客户B', '技术咨询',        30000.00, 'shipped',   '2024-02-20 14:00:00'),
(1, '客户C', '定制开发',       120000.00, 'pending',   '2024-03-10 09:00:00'),
(3, '客户D', '软件许可',        50000.00, 'delivered', '2024-03-12 11:00:00'),
(4, '客户E', 'UI设计服务',      25000.00, 'shipped',   '2024-04-05 16:30:00'),
(5, '客户F', '市场推广方案',    18000.00, 'cancelled', '2024-04-18 08:00:00'),
(3, '客户G', '定制开发',        95000.00, 'pending',   '2024-05-22 13:45:00'),
(7, '客户H', '软件许可',        50000.00, 'delivered', '2024-06-01 10:00:00'),
(7, '客户I', '技术咨询',        35000.00, 'shipped',   '2024-06-15 15:20:00'),
(9, '客户J', '定制开发',       110000.00, 'pending',   '2024-07-01 09:30:00'),
(2, '客户K', '产品培训',        22000.00, 'delivered', '2024-07-10 14:00:00'),
(1, '客户L', '年度维护',        45000.00, 'shipped',   '2024-07-20 11:00:00');

-- 用户自己创建的表不在此模板库中
```

### 5.3 沙箱数据库（运行时动态创建）

用户首次访问时，系统自动：

1. 创建 `sandbox_<session_uuid>` 数据库
2. 将 `playground_template` 的表结构和数据克隆过去
3. 用户的所有操作限定在该沙箱内

```
sandbox_a1b2c3d4...              # 用户 A 的沙箱
├── employees                     # 从模板克隆
├── orders                        # 从模板克隆
└── (user_created_table)          # 用户自己创建的表

sandbox_e5f6g7h8...              # 用户 B 的沙箱
├── employees
├── orders
└── ...
```

---

## 6. 后端 API 设计

### 6.1 通用约定

| 项目 | 约定 |
|------|------|
| Base URL | `/api/v1` |
| 请求格式 | `application/json` |
| 响应格式 | `{ "code": 0, "data": {...}, "message": "ok" }` |
| 错误响应 | `{ "code": <error_code>, "message": "<error_message>" }` |
| Session 传递 | 请求头 `X-Session-Id: <uuid>` |

### 6.2 错误码定义

| Code | 含义 |
|------|------|
| 0 | 成功 |
| 1001 | Session 无效或已过期 |
| 1002 | SQL 语法错误 |
| 1003 | SQL 包含不允许的操作 |
| 1004 | 查询结果超过行数限制 |
| 1005 | 沙箱数据量超限 |
| 1006 | 请求频率过高 |
| 5000 | 服务器内部错误 |

### 6.3 API 端点

#### 6.3.1 会话管理

**POST /api/v1/session**
> 创建或恢复会话。前端首次访问时调用，或携带已有 Session ID 恢复。

```
Request:
  POST /api/v1/session
  Headers: X-Session-Id: <optional, 已有session>

Response (新建):
{
  "code": 0,
  "data": {
    "sessionId": "a1b2c3d4-e5f6-...",
    "dbName": "sandbox_a1b2c3d4",
    "isNew": true,
    "expiresAt": "2025-08-01T12:00:00Z"
  }
}

Response (恢复):
{
  "code": 0,
  "data": {
    "sessionId": "a1b2c3d4-e5f6-...",
    "dbName": "sandbox_a1b2c3d4",
    "isNew": false,
    "expiresAt": "2025-08-01T12:00:00Z"
  }
}
```

**DELETE /api/v1/session**
> 手动重置沙箱（销毁并重建）。

```
Request:
  DELETE /api/v1/session
  Headers: X-Session-Id: <uuid>

Response:
{
  "code": 0,
  "data": {
    "sessionId": "a1b2c3d4-e5f6-...",
    "recreated": true
  }
}
```

#### 6.3.2 SQL 执行

**POST /api/v1/query**
> 执行一条或多条 SQL 语句。

```
Request:
  POST /api/v1/query
  Headers: X-Session-Id: <uuid>
  Body:
  {
    "sql": "SELECT * FROM employees WHERE department = '技术部';\nSELECT COUNT(*) FROM orders;"
  }

Response (查询类):
{
  "code": 0,
  "data": {
    "results": [
      {
        "type": "select",
        "columns": ["id", "first_name", "last_name", "email", "department", "salary", "hire_date", "is_active"],
        "rows": [
          [1, "张", "伟", "zhangwei@example.com", "技术部", 15000.00, "2020-03-15", true],
          ...
        ],
        "rowCount": 4,
        "executionTimeMs": 12
      },
      {
        "type": "select",
        "columns": ["COUNT(*)"],
        "rows": [[12]],
        "rowCount": 1,
        "executionTimeMs": 5
      }
    ],
    "totalTimeMs": 17
  }
}

Response (修改类):
{
  "code": 0,
  "data": {
    "results": [
      {
        "type": "insert",
        "affectedRows": 1,
        "insertId": 11,
        "executionTimeMs": 8
      }
    ],
    "totalTimeMs": 8
  }
}

Response (DDL类):
{
  "code": 0,
  "data": {
    "results": [
      {
        "type": "ddl",
        "message": "Table 'my_table' created successfully",
        "executionTimeMs": 25
      }
    ],
    "totalTimeMs": 25
  }
}
```

#### 6.3.3 Schema 查询

**GET /api/v1/schema/tables**
> 获取当前沙箱中所有用户表。

```
Request:
  GET /api/v1/schema/tables
  Headers: X-Session-Id: <uuid>

Response:
{
  "code": 0,
  "data": {
    "tables": [
      { "name": "employees", "rowCount": 10, "engine": "InnoDB" },
      { "name": "orders", "rowCount": 12, "engine": "InnoDB" }
    ]
  }
}
```

**GET /api/v1/schema/tables/:tableName**
> 获取指定表的结构。

```
Request:
  GET /api/v1/schema/tables/employees
  Headers: X-Session-Id: <uuid>

Response:
{
  "code": 0,
  "data": {
    "name": "employees",
    "columns": [
      {
        "name": "id",
        "type": "int",
        "nullable": false,
        "key": "PRI",
        "default": null,
        "extra": "auto_increment"
      },
      {
        "name": "first_name",
        "type": "varchar(50)",
        "nullable": false,
        "key": "",
        "default": null,
        "extra": ""
      },
      ...
    ],
    "indexes": [
      { "name": "PRIMARY", "columns": ["id"], "unique": true }
    ]
  }
}
```

### 6.4 中间件执行顺序

```
请求进入
  → CORS 处理
  → Session 解析 & 验证（从 Header 取 X-Session-Id）
  → 限流检查（每用户每分钟最多 N 次请求）
  → SQL 安全检查（解析 & 白名单校验）
  → 路由处理
  → 响应返回
```

---

## 7. 前端设计

### 7.1 页面布局

```
┌──────────────────────────────────────────────────────────────┐
│  Header                                                       │
│  ┌─────────────┐                    ┌──────────┐ ┌────────┐ │
│  │ Logo + 标题  │                    │ 主题切换  │ │ 重置沙箱│ │
│  └─────────────┘                    └──────────┘ └────────┘ │
├──────────────┬───────────────────────────────────────────────┤
│  左侧面板     │  主区域                                        │
│  (280px)     │  ┌──────────────────────────────────────────┐ │
│              │  │  SQL 编辑器工具栏 [执行 ▶] [快捷键提示]    │ │
│  ┌────────┐  │  ├──────────────────────────────────────────┤ │
│  │ 表列表  │  │  │                                          │ │
│  │        │  │  │  ┌──────────────────────────────────┐   │ │
│  │ ┌────┐ │  │  │  │  SELECT * FROM employees          │   │ │
│  │ │employees│  │  │  │  WHERE department = '技术部';    │   │ │
│  │ ├────┤ │  │  │  │                                  │   │ │
│  │ │orders │  │  │  │                                  │   │ │
│  │ └────┘ │  │  │  └──────────────────────────────────┘   │ │
│  └────────┘  │  │  (CodeMirror 6, SQL 语法高亮)            │ │
│              │  ├──────────────────────────────────────────┤ │
│  ┌────────┐  │  │  结果区域                                  │ │
│  │ 表结构  │  │  │  ┌────────────────────────────────────┐ │ │
│  │ (选中   │  │  │  │ 查询成功 · 返回 4 行 · 耗时 12ms    │ │ │
│  │  的表) │  │  │  ├────────────────────────────────────┤ │ │
│  │        │  │  │  │ id │first_name│last_name│department│ │ │ │
│  │ id INT │  │  │  │ 1  │张        │伟       │技术部    │ │ │ │
│  │ first..│  │  │  │ 3  │王        │强       │技术部    │ │ │ │
│  │ last.. │  │  │  │ ...                                   │ │ │
│  │ ...    │  │  │  └────────────────────────────────────┘ │ │
│  └────────┘  │  └──────────────────────────────────────────┘ │
└──────────────┴───────────────────────────────────────────────┘
```

### 7.2 组件树

```
App
├── ThemeProvider             ← Tailwind dark mode class 控制
├── SessionProvider           ← Session ID 管理，初始化时创建/恢复
├── Header
│   ├── Logo
│   ├── ThemeToggle           ← 深色/浅色切换
│   └── ResetButton           ← 重置沙箱（需确认弹窗）
├── MainLayout
│   ├── Sidebar
│   │   ├── TableList         ← 表名列表，点击选中
│   │   └── TableSchema       ← 选中表的字段详情
│   └── MainPanel
│       ├── EditorToolbar     ← 执行按钮 + 状态指示
│       ├── SqlEditor         ← CodeMirror 6 编辑器
│       └── ResultPanel
│           ├── ResultSummary ← 行数/耗时/状态
│           ├── ResultTable   ← 数据表格（可横向滚动）
│           └── ErrorDisplay  ← 错误信息（红色高亮）
```

### 7.3 交互流程

```
用户打开页面
    │
    ▼
检查 localStorage 是否有 sessionId
    │
    ├── 有 → POST /api/v1/session (恢复) → 加载沙箱
    │
    └── 无 → POST /api/v1/session (创建) → 得到新 sessionId
              │
              ▼
         存入 localStorage（24h 过期标记）
              │
              ▼
         加载预置数据 → 获取表列表 → 展示初始界面
              │
              ▼
         用户输入 SQL → 点击"执行"（或 Ctrl+Enter）
              │
              ▼
         POST /api/v1/query → 展示结果 / 错误
              │
              ▼
         刷新表列表（如果执行了 DDL）
```

### 7.4 状态管理

使用 React Context + useReducer，无需引入 Redux 等重型方案。

```typescript
// 全局状态
interface AppState {
  sessionId: string | null;
  dbName: string | null;
  tables: TableInfo[];
  selectedTable: string | null;
  tableSchema: ColumnInfo[] | null;
  queryHistory: QueryResult[];
  isLoading: boolean;
  theme: 'light' | 'dark';
}
```

### 7.5 主题设计

| 属性 | 浅色模式 | 深色模式 |
|------|---------|---------|
| 背景 | #FFFFFF / #F9FAFB | #1E1E2E / #181825 |
| 面板背景 | #FFFFFF | #1E1E2E |
| 主文字 | #1F2937 | #CDD6F4 |
| 次文字 | #6B7280 | #A6ADC8 |
| 边框 | #E5E7EB | #313244 |
| 强调色 | #3B82F6 | #89B4FA |
| 编辑器背景 | #FAFAFA | #11111B |
| 表格斑马纹 | #F9FAFB | #313244 |
| 错误色 | #EF4444 | #F38BA8 |
| 成功色 | #10B981 | #A6E3A1 |

---

## 8. 安全策略

### 8.1 SQL 白名单机制

#### 8.1.1 允许的操作

```
✅ SELECT
✅ INSERT
✅ UPDATE
✅ DELETE
✅ CREATE TABLE / CREATE INDEX
✅ DROP TABLE       ← 仅允许 DROP 用户自己创建的表（非模板表）
✅ ALTER TABLE      ← 仅允许修改用户自己创建的表
✅ TRUNCATE TABLE   ← 仅允许 TRUNCATE 用户自己创建的表
✅ SHOW TABLES / SHOW COLUMNS / SHOW INDEX
✅ DESCRIBE / DESC / EXPLAIN
✅ USE <sandbox_db> ← 仅允许切换到自己的沙箱库
```

#### 8.1.2 禁止的操作

```
❌ DROP DATABASE
❌ CREATE DATABASE / ALTER DATABASE
❌ GRANT / REVOKE
❌ SHUTDOWN
❌ FLUSH
❌ RENAME TABLE       ← 防止重命名模板表
❌ LOAD DATA / LOAD FILE
❌ INTO OUTFILE / INTO DUMPFILE
❌ CREATE USER / DROP USER
❌ SET (除 SET NAMES 外)
❌ BEGIN / COMMIT / ROLLBACK (事务操作暂不允许)
❌ LOCK / UNLOCK TABLES
❌ CREATE PROCEDURE / FUNCTION / TRIGGER / EVENT
❌ 任何包含多条语句用分号分隔时混入禁止操作的尝试
```

### 8.2 SQL 安全检查流程

```
用户输入 SQL
    │
    ▼
1. 去除注释（-- ... 和 /* ... */）
    │
    ▼
2. 按分号拆分语句（处理字符串内分号的边界情况）
    │
    ▼
3. 逐条检查：
   ├── 提取第一个关键字 → 判断操作类型
   ├── 检查是否在白名单 → ❌ 拒绝
   ├── 检查是否操作了模板表（employees/orders）
   │   └── 若是 DROP/TRUNCATE/ALTER/RENAME → ❌ 拒绝（保护模板表）
   └── 通过 → ✅ 继续
    │
    ▼
4. 全部通过 → 执行
```

### 8.3 资源限制

| 限制项 | 值 | 说明 |
|--------|-----|------|
| 单次查询最大返回行数 | 1,000 | 超过自动截断 + 警告提示 |
| 单用户数据库总大小 | 100 MB | 超过后禁止 INSERT/CREATE |
| 单次请求 SQL 文本最大长度 | 10 KB | 防止恶意大请求 |
| 单用户每分钟请求数 | 30 | 通过 rate-limit 中间件 |
| 单用户最大表数量 | 50 | 防止恶意建表 |
| 查询超时 | 30 秒 | 超时自动 KILL |

### 8.4 其他安全措施

- **Prepared Statements 不适用**：因为用户输入的是完整 SQL 语句，不是参数化查询模板。但仍需严格解析
- **MySQL 用户权限最小化**：沙箱连接使用受限 MySQL 用户，即使绕过程序检查也无法执行高危操作
- **错误信息脱敏**：返回给前端的错误信息不暴露数据库 IP/端口/文件路径

---

## 9. 会话与沙箱生命周期

### 9.1 完整生命周期

```
用户首次访问
    │
    ▼
前端: 生成 UUID → POST /api/v1/session
    │
    ▼
后端: 创建 sandbox_<uuid> 数据库
    │ 克隆 playground_template → sandbox_<uuid>
    │ 记录到 playground_admin.sandboxes
    │ 设置 expires_at = NOW() + 24h
    │
    ▼
用户操作中...
    │ 每次请求: 更新 last_accessed_at
    │
    ├── 用户点击"重置"
    │   → DELETE /api/v1/session
    │   → DROP DATABASE sandbox_<uuid>
    │   → 重新创建新沙箱
    │
    └── 用户关闭页面 / 离开
        │
        ▼
    沙箱继续存活 24 小时
        │
        ├── 24h 内用户回来 → 恢复会话（localhost sessionId 匹配）
        │
        └── 超过 24h →
            │
            ▼
        CleanupScheduler 定时任务（每 30 分钟执行一次）
            │ 查询 expires_at < NOW() 的沙箱
            │ DROP DATABASE sandbox_<uuid>
            │ 更新状态为 'cleaned'
            │
            ▼
        下次用户访问 → sessionId 失效 → 创建新沙箱
```

### 9.2 定时清理任务

```typescript
// cleanup-scheduler.ts 伪代码
class CleanupScheduler {
  private interval = 30 * 60 * 1000; // 30 分钟

  start() {
    setInterval(async () => {
      const expired = await this.findExpiredSandboxes();
      for (const sandbox of expired) {
        await this.dropSandboxDatabase(sandbox.db_name);
        await this.markAsCleaned(sandbox.id);
      }
      if (expired.length > 0) {
        logger.info(`Cleaned up ${expired.length} expired sandboxes`);
      }
    }, this.interval);
  }
}
```

---

## 10. 开发路线图

### Phase 1：基础骨架（预计 3-5 天）

| 任务 | 内容 |
|------|------|
| 项目初始化 | client (Vite + React + TS + Tailwind) / server (Express + TS) |
| 数据库适配器接口 | `IDatabaseAdapter` 接口定义 + `MySQLAdapter` 基础实现 |
| MySQLAdapter 实现 | connect / createDatabase / dropDatabase / execute 方法 |
| 基础路由 | `/api/v1/session` (创建/恢复) |
| 前端骨架 | Header + Sidebar + MainPanel 布局 |
| Session 管理 | localStorage + SessionContext |

### Phase 2：核心功能（预计 5-7 天）

| 任务 | 内容 |
|------|------|
| SQL 安全中间件 | 白名单校验 + 危险操作拦截 + 模板表保护 |
| SQL 执行器 | 多语句拆分、逐条执行、结果聚合 |
| `/api/v1/query` | 完整实现 |
| `/api/v1/schema/*` | 表列表 + 表结构查询 |
| SandboxManager | 沙箱创建/恢复/销毁/克隆模板数据 |
| TemplateLoader | 从 playground_template 克隆数据 |
| CodeMirror 集成 | SQL 语法高亮、Ctrl+Enter 执行 |
| 结果表格 | ResultTable + ResultSummary + ErrorDisplay |

### Phase 3：完善 & 加固（预计 3-5 天）

| 任务 | 内容 |
|------|------|
| 主题切换 | Tailwind dark mode + ThemeToggle 组件 |
| 左侧面板 | TableList + TableSchema 点击联动 |
| 限流中间件 | 30 req/min per user |
| 资源限制 | 行数限制、数据量限制、表数量限制 |
| 清理定时任务 | CleanupScheduler |
| 审计日志 | query_logs 写入 |
| 错误处理 | 统一错误码 + 友好提示 |

### Phase 4：测试 & 部署（预计 2-3 天）

| 任务 | 内容 |
|------|------|
| 后端单元测试 | SQL 安全检查、SandboxManager 核心逻辑 |
| 前端组件测试 | 关键组件渲染测试 |
| 安全测试 | SQL 注入、危险操作绕过尝试 |
| Docker 化 | Dockerfile.server + Dockerfile.client + docker-compose |
| 部署文档 | 环境变量说明、部署步骤 |

---

## 11. 部署方案

### 11.1 Docker Compose 部署

```yaml
# docker-compose.yml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_USER: playground
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
    volumes:
      - mysql_data:/var/lib/mysql
      - ./server/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - '3306:3306'
    healthcheck:
      test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost']
      interval: 10s
      retries: 5

  server:
    build:
      context: .
      dockerfile: Dockerfile.server
    environment:
      DB_HOST: mysql
      DB_PORT: 3306
      DB_USER: playground
      DB_PASSWORD: ${MYSQL_PASSWORD}
      DB_ADMIN_DATABASE: playground_admin
      DB_TEMPLATE_DATABASE: playground_template
      SESSION_TTL_HOURS: 24
      PORT: 3001
    ports:
      - '3001:3001'
    depends_on:
      mysql:
        condition: service_healthy

  client:
    build:
      context: .
      dockerfile: Dockerfile.client
    ports:
      - '80:80'
    depends_on:
      - server

volumes:
  mysql_data:
```

### 11.2 环境变量

```bash
# .env.example
# === MySQL 连接 ===
MYSQL_ROOT_PASSWORD=your_root_password
MYSQL_PASSWORD=your_playground_password
DB_HOST=localhost
DB_PORT=3306
DB_USER=playground
DB_ADMIN_DATABASE=playground_admin
DB_TEMPLATE_DATABASE=playground_template

# === 会话配置 ===
SESSION_TTL_HOURS=24

# === 安全配置 ===
MAX_ROWS_PER_QUERY=1000
MAX_DB_SIZE_MB=100
MAX_TABLES_PER_USER=50
MAX_SQL_LENGTH_KB=10
RATE_LIMIT_PER_MINUTE=30
QUERY_TIMEOUT_SECONDS=30

# === 清理任务 ===
CLEANUP_INTERVAL_MINUTES=30

# === 服务端口 ===
PORT=3001
```

---

## 附录 A：前端依赖清单

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "axios": "^1.7.0",
    "@codemirror/lang-sql": "^6.7.0",
    "@codemirror/view": "^6.30.0",
    "@codemirror/state": "^6.4.0",
    "@codemirror/theme-one-dark": "^6.1.0",
    "codemirror": "^6.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^3.4.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

## 附录 B：后端依赖清单

```json
{
  "dependencies": {
    "express": "^4.21.0",
    "mysql2": "^3.11.0",
    "cors": "^2.8.0",
    "uuid": "^10.0.0",
    "express-rate-limit": "^7.4.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.19.0",
    "@types/express": "^4.17.0",
    "@types/cors": "^2.8.0",
    "@types/uuid": "^10.0.0",
    "vitest": "^2.0.0"
  }
}
```

---

> **文档版本**：v1.0
> **创建日期**：2026-07-31
> **状态**：待评审
