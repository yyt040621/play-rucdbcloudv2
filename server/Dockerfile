# ============ Stage 1: 构建 BenchBase（合并 MySQL + PostgreSQL 双驱动） ============
FROM maven:3.9-eclipse-temurin-17 AS benchbase-builder
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
WORKDIR /build
# 拉取官方 BenchBase（固定分支 main，构建产物含 config/data/scripts/lib）
RUN git clone --depth 1 https://github.com/cmu-db/benchbase.git benchbase
WORKDIR /build/benchbase
# 构建 PostgreSQL 发行包（lib/ 内含 PG 驱动）
RUN mvn -q clean package -DskipTests -P postgres && cp -r target/benchbase-postgres /dist/postgres
# 构建 MySQL 发行包（lib/ 内含 MySQL 驱动），合并到同一个 lib/
RUN mvn -q clean package -DskipTests -P mysql && cp -r target/benchbase-mysql /dist/mysql
RUN mkdir -p /dist/final && cp -r /dist/postgres/* /dist/final/ && cp -rn /dist/mysql/lib/* /dist/final/lib/

# ============ Stage 2: 编译 server（TypeScript） ============
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ============ Stage 3: 运行时（Node + JRE + BenchBase） ============
FROM node:20-alpine
# 安装 Java 运行时（BenchBase 由 Node 以子进程方式拉起 java -cp ... com.oltpbenchmark.DBWorkload）
RUN apk add --no-cache openjdk17-jre-headless
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
# BenchBase 发行包（benchbase.jar + lib/ 含 PG/MySQL 双驱动 + config/data/scripts）
COPY --from=benchbase-builder /dist/final /opt/benchbase

EXPOSE 3001
CMD ["node", "dist/index.js"]
