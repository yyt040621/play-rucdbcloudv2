-- PostgreSQL 初始化脚本（docker-entrypoint-initdb.d，首次启动执行）
-- 创建低权限应用用户（沙箱 schema 操作权限由 server 端创建 schema 时授予）
CREATE USER playground_app WITH PASSWORD 'playground_app_pass';
GRANT CONNECT ON DATABASE rucdbcloud TO playground_app;
