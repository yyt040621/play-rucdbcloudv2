# ============ Stage 1: 构建 BenchBase（合并 MySQL + PostgreSQL 双驱动） ============
# 注意：BenchBase 需要 JDK 23 编译（maven.compiler.release=23），必须用 temurin-23
FROM maven:3.9-eclipse-temurin-23 AS benchbase-builder
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
WORKDIR /build
# 拉取官方 BenchBase（固定分支 main，构建产物含 config/data/scripts/lib）
RUN git clone --depth 1 https://github.com/cmu-db/benchbase.git benchbase
WORKDIR /build/benchbase
# 构建 PostgreSQL 发行包（lib/ 内含 PG 驱动）；强制 dir 描述符产出目录分布
RUN mkdir -p /dist/postgres \
    && mvn -q clean package -DskipTests -P postgres -Ddescriptors=src/main/assembly/dir.xml \
    && cp -r target/benchbase-postgres/. /dist/postgres/
# 构建 MySQL 发行包（lib/ 内含 MySQL 驱动），合并到同一个 lib/
RUN mvn -q clean package -DskipTests -P mysql -Ddescriptors=src/main/assembly/dir.xml \
    && mkdir -p /dist/mysql && cp -r target/benchbase-mysql/. /dist/mysql/
# 合并：显式定位 benchbase.jar 平铺到根，双发行包所有依赖 jar 并入 lib/
RUN mkdir -p /dist/final/lib \
 && find /dist/postgres -name 'benchbase.jar' -exec cp {} /dist/final/benchbase.jar \; \
 && find /dist/postgres /dist/mysql -name '*.jar' ! -name 'benchbase.jar' -exec cp -n {} /dist/final/lib/ \;

# ============ Stage 2: 编译 server（TypeScript，纯 JS，Alpine 足够） ============
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ============ Stage 3: 运行时（JDK 23 + Node 20 + BenchBase） ============
# 用 eclipse-temurin:23-jre（glibc 一致，自带 JDK 23），Node 用官方 tarball 安装
FROM eclipse-temurin:23-jre
RUN apt-get update && apt-get install -y --no-install-recommends curl xz-utils \
    && curl -fsSL https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.xz \
       | tar -xJ -C /usr/local --strip-components=1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
# BenchBase 发行包（benchbase.jar + lib/ 含 PG/MySQL 双驱动 + config/data/scripts）
COPY --from=benchbase-builder /dist/final /opt/benchbase

EXPOSE 3001
CMD ["node", "dist/index.js"]
