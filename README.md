# SQL Playground

> 演示我们的 rucdbcloud — 在线 SQL 交互式演示平台，无需安装任何软件，打开浏览器即可体验完整的 MySQL 数据库操作。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-000000)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1)](https://www.mysql.com/)
[![Docker](https://img.shields.io/badge/Docker-🚢-2496ED)](https://www.docker.com/)

**🌐 在线地址：[http://123.57.84.92:8080](http://123.57.84.92:8080)** （备案通过后：[dutcat.top](http://dutcat.top)）

---

## 功能

| 模块 | 说明 | 特点 |
|------|------|------|
| 🏠 **首页** | 四个功能卡片入口 | 点击卡片进入对应模块 |
| 🔍 **SELECT** | 查询数据 | 复选框选列 → WHERE 条件构造器 → 结果展示 |
| ➕ **CREATE** | 建表 / 插入数据 | 建表向导 + 插入表单，无需写 SQL |
| ✏️ **UPDATE** | 修改数据 | 选表 → SET 新值 → WHERE 条件 → 数据预览 → 确认执行 |
| 🗑️ **DELETE** | 删除数据 | WHERE 条件 → 安全警告 → 双重确认 → 删除 |

## 特性

- 🎯 **双模式操作**：📝 表单模式（零门槛，填表即用）+ ⚡ SQL 模式（自由编写 SQL）
- 🎨 **SQL 语法高亮**：关键字、字符串、数字、注释不同颜色显示
- 🌓 **深色 / 浅色主题**：一键切换，CodeMirror 编辑器联动
- 🔒 **多用户沙箱隔离**：每位用户独立的临时 MySQL 数据库，互不影响
- 🛡️ **SQL 安全**：白名单 + 黑名单 + 危险操作拦截 + 模板表保护
- 📦 **预置数据**：employees（10人）+ orders（12条）两张示例表
- 📜 **查询历史**：侧边栏实时显示最近查询记录
- ⏱️ **24 小时自动过期**：沙箱到期自动清理
- 🐳 **Docker 一键部署**：docker compose up -d

## 快速开始

### 前置条件

- Node.js 20+
- MySQL 8.0+
- npm

### 1. 初始化数据库

```bash
mysql -u root -p < server/init.sql
```

这会创建 `playground_admin`（管理库）和 `playground_template`（模板库 + 示例数据）。

### 2. 启动后端

```bash
cd server
cp .env.example .env    # 编辑 .env 填入你的 MySQL 密码
npm install
npm run dev             # → http://localhost:3001
```

### 3. 启动前端

```bash
cd client
npm install
npm run dev             # → http://localhost:5173
```

### 4. 打开浏览器

访问 **http://localhost:5173**

---

## 项目结构

```
sql-playground/
├── client/                        # React 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/            # ThemeToggle, Loading, Toast, ErrorBoundary, ConfirmDialog
│   │   │   ├── editor/            # SqlEditor (CodeMirror 6), EditorToolbar
│   │   │   ├── layout/            # Header, Sidebar, MainPanel
│   │   │   ├── result/            # ResultTable, ErrorDisplay, DmlResult, ResultSummary
│   │   │   └── sidebar/           # TableList, TableSchema, QueryHistory
│   │   ├── pages/                 # 页面组件
│   │   │   ├── HomePage.tsx       # 首页（四个功能卡片）
│   │   │   ├── CreatePage.tsx     # CREATE 页面（建表 + 插入数据）
│   │   │   ├── SelectPage.tsx     # SELECT 页面（查询表单）
│   │   │   ├── UpdatePage.tsx     # UPDATE 页面（修改数据）
│   │   │   ├── DeletePage.tsx     # DELETE 页面（删除数据）
│   │   │   └── shared/            # 共享组件
│   │   │       ├── ModeToggle.tsx          # 表单/SQL 模式切换
│   │   │       ├── WhereConditionBuilder.tsx # WHERE 条件构造器
│   │   │       ├── ColumnValueForm.tsx     # 列值填写表单
│   │   │       ├── SqlHighlight.tsx        # SQL 语法高亮
│   │   │       └── TableDataPreview.tsx    # 数据预览组件
│   │   ├── hooks/                 # useSession, useTheme, useSqlExecute, useSchema
│   │   ├── services/api.ts        # Axios API 封装
│   │   └── types/index.ts
│   ├── Dockerfile
│   └── nginx.conf
│
├── server/                        # Express 后端
│   ├── src/
│   │   ├── adapters/              # IDatabaseAdapter 接口 + MySQLAdapter 实现
│   │   ├── middleware/            # session, sql-guard, rate-limit
│   │   ├── routes/                # session, query, schema, admin
│   │   ├── services/              # sandbox-manager, sql-executor, sql-parser,
│   │   │                            template-loader, cleanup-scheduler, audit-logger
│   │   ├── config/index.ts
│   │   └── types/index.ts
│   ├── init.sql                   # 数据库初始化脚本（含示例数据）
│   └── Dockerfile
│
├── docker-compose.yml             # Docker 一键部署
└── README.md
```

---

## API 概览

| Method | 路径 | 说明 |
|--------|------|------|
| `POST` | `/api/v1/session` | 创建/恢复会话 |
| `DELETE` | `/api/v1/session` | 重置沙箱 |
| `POST` | `/api/v1/query` | 执行 SQL |
| `GET` | `/api/v1/query/logs` | 查询历史 |
| `GET` | `/api/v1/schema/tables` | 表列表 |
| `GET` | `/api/v1/schema/tables/:name` | 表结构 |
| `GET` | `/api/v1/admin/stats` | 系统统计 |
| `GET` | `/api/v1/health` | 健康检查 |

---

## 安全机制

```
用户输入 SQL
    │
    ▼
长度检查 (≤10KB)
    │
    ▼
去除注释 → 拆分语句 → 逐条安全检查:
  ├── 黑名单关键字 (GRANT, SHUTDOWN, LOAD DATA, INTO OUTFILE...)
  ├── 语句中任意位置危险关键字扫描
  ├── 白名单校验 (仅允许 SELECT/INSERT/UPDATE/DELETE/DDL)
  ├── 受保护表检测 (employees, orders 不允许 DROP/ALTER/TRUNCATE)
  └── USE 语句目标库校验 (仅允许 sandbox_ 库)
    │
    ▼
资源限制:
  ├── 单次最多返回 1,000 行
  ├── 单用户最多 100MB 数据
  ├── 单用户最多 50 张表
  └── 每分钟最多 30 次请求
    │
    ▼
执行 → 返回结果
```

---

## Docker 部署

```bash
# 1. 创建环境变量
cat > .env << 'EOF'
MYSQL_ROOT_PASSWORD=你的数据库密码
MYSQL_PASSWORD=你的数据库密码
SESSION_TTL_HOURS=24
EOF

# 2. 一键启动
docker compose up -d --build

# 3. 访问 http://你的服务器IP:8080
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 8 |
| CSS | Tailwind CSS 3 (dark mode) |
| SQL 编辑器 | CodeMirror 6 (MySQL dialect) |
| 路由 | React Router 6 |
| HTTP 客户端 | Axios |
| 后端框架 | Express 4 + TypeScript |
| 数据库 | MySQL 8.0 (mysql2) |
| 测试框架 | Vitest + Testing Library |
| 部署 | Docker + Docker Compose + Nginx |
| 服务器 | 阿里云 ECS (Alibaba Cloud Linux 3) |

---

## 测试

```bash
# 后端测试 (68 个)
cd server && npm test

# 前端测试 (8 个)
cd client && npm test

# 总计: 76 个测试
```

---

## License

MIT
