import { IDatabaseAdapter } from '../adapters/database-adapter.interface';
import { config } from '../config';

/**
 * 模板数据加载器：负责初始化 playground_admin 和 playground_template 数据库。
 */
export class TemplateLoader {
  constructor(private adapter: IDatabaseAdapter) {}

  /**
   * 完整初始化流程。应在服务器启动时调用。
   */
  async initialize(): Promise<void> {
    await this.initAdminDatabase();
    await this.initTemplateDatabase();
  }

  /**
   * 初始化管理库：sandboxes 表和 query_logs 表
   */
  private async initAdminDatabase(): Promise<void> {
    const db = config.db.adminDatabase;

    await this.adapter.createDatabase(db);

    // sandboxes 表
    await this.adapter.execute(`
      CREATE TABLE IF NOT EXISTS \`${db}\`.sandboxes (
        id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        session_id       VARCHAR(64)  NOT NULL UNIQUE,
        db_name          VARCHAR(128) NOT NULL UNIQUE,
        status           ENUM('active','expired','cleaned') NOT NULL DEFAULT 'active',
        created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_accessed_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        expires_at       DATETIME     NOT NULL,
        INDEX idx_status  (status),
        INDEX idx_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // query_logs 表（审计用）
    await this.adapter.execute(`
      CREATE TABLE IF NOT EXISTS \`${db}\`.query_logs (
        id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        session_id    VARCHAR(64) NOT NULL,
        sql_text      TEXT        NOT NULL,
        is_allowed    BOOLEAN     NOT NULL DEFAULT TRUE,
        error_message TEXT,
        executed_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session  (session_id),
        INDEX idx_executed (executed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log(`Admin database '${db}' initialized`);
  }

  /**
   * 初始化模板库：employees 和 orders 表 + 示例数据
   */
  private async initTemplateDatabase(): Promise<void> {
    const db = config.db.templateDatabase;

    await this.adapter.createDatabase(db);

    // employees 表
    await this.adapter.execute(`
      CREATE TABLE IF NOT EXISTS \`${db}\`.employees (
        id         INT           AUTO_INCREMENT PRIMARY KEY,
        first_name VARCHAR(50)   NOT NULL,
        last_name  VARCHAR(50)   NOT NULL,
        email      VARCHAR(100)  NOT NULL UNIQUE,
        department VARCHAR(50)   NOT NULL,
        salary     DECIMAL(10,2) NOT NULL,
        hire_date  DATE          NOT NULL,
        is_active  BOOLEAN       NOT NULL DEFAULT TRUE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // orders 表
    await this.adapter.execute(`
      CREATE TABLE IF NOT EXISTS \`${db}\`.orders (
        id          INT           AUTO_INCREMENT PRIMARY KEY,
        employee_id INT           NOT NULL,
        customer    VARCHAR(100)  NOT NULL,
        product     VARCHAR(100)  NOT NULL,
        amount      DECIMAL(10,2) NOT NULL,
        status      ENUM('pending','shipped','delivered','cancelled')
                                 NOT NULL DEFAULT 'pending',
        order_date  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES \`${db}\`.employees(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 插入示例数据（使用 INSERT IGNORE 避免重复）
    await this.seedEmployees(db);
    await this.seedOrders(db);

    console.log(`Template database '${db}' initialized`);
  }

  /**
   * 填充员工数据
   */
  private async seedEmployees(db: string): Promise<void> {
    const sql = `
      INSERT IGNORE INTO \`${db}\`.employees
        (id, first_name, last_name, email, department, salary, hire_date)
      VALUES
        (1,  '张', '伟', 'zhangwei@example.com',   '技术部', 15000.00, '2020-03-15'),
        (2,  '李', '娜', 'lina@example.com',       '产品部', 18000.00, '2019-07-01'),
        (3,  '王', '强', 'wangqiang@example.com',  '技术部', 16000.00, '2021-01-10'),
        (4,  '赵', '敏', 'zhaomin@example.com',    '设计部', 14000.00, '2020-11-20'),
        (5,  '刘', '洋', 'liuyang@example.com',    '市场部', 13000.00, '2022-05-05'),
        (6,  '陈', '静', 'chenjing@example.com',   '人事部', 12000.00, '2021-09-12'),
        (7,  '杨', '磊', 'yanglei@example.com',    '技术部', 17000.00, '2018-06-18'),
        (8,  '黄', '丽', 'huangli@example.com',    '产品部', 15500.00, '2020-02-28'),
        (9,  '周', '涛', 'zhoutao@example.com',    '技术部', 19000.00, '2017-12-01'),
        (10, '吴', '芳', 'wufang@example.com',     '设计部', 13500.00, '2022-08-15')
    `;
    await this.adapter.execute(sql);
  }

  /**
   * 填充订单数据
   */
  private async seedOrders(db: string): Promise<void> {
    const sql = `
      INSERT IGNORE INTO \`${db}\`.orders
        (id, employee_id, customer, product, amount, status, order_date)
      VALUES
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
        (12, 1, '客户L', '年度维护',      45000.00,  'shipped',   '2024-07-20 11:00:00')
    `;
    await this.adapter.execute(sql);
  }
}
