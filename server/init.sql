-- ============================================
-- SQL Playground - MySQL 初始化脚本
-- ============================================

-- 创建 playground 用户（如果不存在）
CREATE USER IF NOT EXISTS 'playground'@'%' IDENTIFIED BY 'playground_pass';
GRANT ALL PRIVILEGES ON `playground_admin`.* TO 'playground'@'%';
GRANT ALL PRIVILEGES ON `playground_template`.* TO 'playground'@'%';
GRANT ALL PRIVILEGES ON `sandbox\_%`.* TO 'playground'@'%';
FLUSH PRIVILEGES;

-- ============================================
-- 管理库
-- ============================================
CREATE DATABASE IF NOT EXISTS playground_admin
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE playground_admin;

CREATE TABLE IF NOT EXISTS sandboxes (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id       VARCHAR(64) NOT NULL UNIQUE,
  db_name          VARCHAR(128) NOT NULL UNIQUE,
  status           ENUM('active', 'expired', 'cleaned') NOT NULL DEFAULT 'active',
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at       DATETIME NOT NULL,
  INDEX idx_status (status),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS query_logs (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id    VARCHAR(64) NOT NULL,
  sql_text      TEXT NOT NULL,
  is_allowed    BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  executed_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id),
  INDEX idx_executed (executed_at)
) ENGINE=InnoDB;

-- ============================================
-- 模板库（预置示例数据）
-- ============================================
CREATE DATABASE IF NOT EXISTS playground_template
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE playground_template;

-- 员工表
CREATE TABLE IF NOT EXISTS employees (
  id         INT           AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50)   NOT NULL,
  last_name  VARCHAR(50)   NOT NULL,
  email      VARCHAR(100)  NOT NULL UNIQUE,
  department VARCHAR(50)   NOT NULL,
  salary     DECIMAL(10,2) NOT NULL,
  hire_date  DATE          NOT NULL,
  is_active  BOOLEAN       NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
  id           INT           AUTO_INCREMENT PRIMARY KEY,
  employee_id  INT           NOT NULL,
  customer     VARCHAR(100)  NOT NULL,
  product      VARCHAR(100)  NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  status       ENUM('pending', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
  order_date   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

-- 插入示例数据（使用 IGNORE 避免重复插入）
INSERT IGNORE INTO employees (id, first_name, last_name, email, department, salary, hire_date) VALUES
(1,  '张', '伟', 'zhangwei@example.com',   '技术部', 15000.00, '2020-03-15'),
(2,  '李', '娜', 'lina@example.com',       '产品部', 18000.00, '2019-07-01'),
(3,  '王', '强', 'wangqiang@example.com',  '技术部', 16000.00, '2021-01-10'),
(4,  '赵', '敏', 'zhaomin@example.com',    '设计部', 14000.00, '2020-11-20'),
(5,  '刘', '洋', 'liuyang@example.com',    '市场部', 13000.00, '2022-05-05'),
(6,  '陈', '静', 'chenjing@example.com',   '人事部', 12000.00, '2021-09-12'),
(7,  '杨', '磊', 'yanglei@example.com',    '技术部', 17000.00, '2018-06-18'),
(8,  '黄', '丽', 'huangli@example.com',    '产品部', 15500.00, '2020-02-28'),
(9,  '周', '涛', 'zhoutao@example.com',    '技术部', 19000.00, '2017-12-01'),
(10, '吴', '芳', 'wufang@example.com',     '设计部', 13500.00, '2022-08-15');

INSERT IGNORE INTO orders (id, employee_id, customer, product, amount, status, order_date) VALUES
(1,  1, '客户A', '软件许可',      50000.00,  'delivered', '2024-01-15 10:30:00'),
(2,  2, '客户B', '技术咨询',      30000.00,  'shipped',   '2024-02-20 14:00:00'),
(3,  1, '客户C', '定制开发',     120000.00,  'pending',   '2024-03-10 09:00:00'),
(4,  3, '客户D', '软件许可',      50000.00,  'delivered', '2024-03-12 11:00:00'),
(5,  4, '客户E', 'UI设计服务',    25000.00,  'shipped',   '2024-04-05 16:30:00'),
(6,  5, '客户F', '市场推广方案',  18000.00,  'cancelled', '2024-04-18 08:00:00'),
(7,  3, '客户G', '定制开发',      95000.00,  'pending',   '2024-05-22 13:45:00'),
(8,  7, '客户H', '软件许可',      50000.00,  'delivered', '2024-06-01 10:00:00'),
(9,  7, '客户I', '技术咨询',      35000.00,  'shipped',   '2024-06-15 15:20:00'),
(10, 9, '客户J', '定制开发',     110000.00,  'pending',   '2024-07-01 09:30:00'),
(11, 2, '客户K', '产品培训',      22000.00,  'delivered', '2024-07-10 14:00:00'),
(12, 1, '客户L', '年度维护',      45000.00,  'shipped',   '2024-07-20 11:00:00');
