import { IDatabaseAdapter } from '../adapters/database-adapter.interface';
import { config } from '../config';

/**
 * 模板数据加载器（PostgreSQL 版）。
 * 负责初始化管理 schema（playground_admin）和模板 schema（playground_template）。
 */
export class TemplateLoader {
  private adminSchema: string;
  private templateSchema: string;

  constructor(private adapter: IDatabaseAdapter) {
    this.adminSchema = config.pg.adminSchema;
    this.templateSchema = config.pg.templateSchema;
  }

  /**
   * 完整初始化流程。应在服务器启动时调用。
   */
  async initialize(): Promise<void> {
    await this.initAdminSchema();
    await this.initTemplateSchema();
  }

  /**
   * 初始化管理 schema：sandboxes 表和 query_logs 表
   */
  private async initAdminSchema(): Promise<void> {
    await this.adapter.createDatabase(this.adminSchema);

    // sandboxes 表
    await this.adapter.execute(`
      CREATE TABLE IF NOT EXISTS "${this.adminSchema}".sandboxes (
        id               BIGSERIAL PRIMARY KEY,
        session_id       VARCHAR(64)  NOT NULL UNIQUE,
        db_name          VARCHAR(128) NOT NULL UNIQUE,
        status           VARCHAR(20)  NOT NULL DEFAULT 'active',
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        last_accessed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        expires_at       TIMESTAMPTZ  NOT NULL
      )
    `);
    await this.adapter.execute(`CREATE INDEX IF NOT EXISTS idx_sandboxes_status ON "${this.adminSchema}".sandboxes(status)`);
    await this.adapter.execute(`CREATE INDEX IF NOT EXISTS idx_sandboxes_expires ON "${this.adminSchema}".sandboxes(expires_at)`);

    // query_logs 表（审计用）
    await this.adapter.execute(`
      CREATE TABLE IF NOT EXISTS "${this.adminSchema}".query_logs (
        id            BIGSERIAL PRIMARY KEY,
        session_id    VARCHAR(64) NOT NULL,
        sql_text      TEXT        NOT NULL,
        is_allowed    BOOLEAN     NOT NULL DEFAULT TRUE,
        error_message TEXT,
        executed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.adapter.execute(`CREATE INDEX IF NOT EXISTS idx_query_logs_session ON "${this.adminSchema}".query_logs(session_id)`);

    console.log(`Admin schema '${this.adminSchema}' initialized`);
  }

  /**
   * 初始化模板 schema：employees 和 orders 表 + 示例数据
   */
  private async initTemplateSchema(): Promise<void> {
    await this.adapter.createDatabase(this.templateSchema);

    // employees 表
    await this.adapter.execute(`
      CREATE TABLE IF NOT EXISTS "${this.templateSchema}".employees (
        id         SERIAL PRIMARY KEY,
        first_name VARCHAR(50)   NOT NULL,
        last_name  VARCHAR(50)   NOT NULL,
        email      VARCHAR(100)  NOT NULL UNIQUE,
        department VARCHAR(50)   NOT NULL,
        salary     DECIMAL(10,2) NOT NULL,
        hire_date  DATE          NOT NULL,
        is_active  BOOLEAN       NOT NULL DEFAULT TRUE
      )
    `);

    // orders 表
    await this.adapter.execute(`
      CREATE TABLE IF NOT EXISTS "${this.templateSchema}".orders (
        id          SERIAL PRIMARY KEY,
        employee_id INT           NOT NULL,
        customer    VARCHAR(100)  NOT NULL,
        product     VARCHAR(100)  NOT NULL,
        amount      DECIMAL(10,2) NOT NULL,
        status      VARCHAR(20)   NOT NULL DEFAULT 'pending',
        order_date  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    // 插入示例数据（ON CONFLICT DO NOTHING 避免重复）
    await this.seedEmployees();
    await this.seedOrders();

    console.log(`Template schema '${this.templateSchema}' initialized`);
  }

  /**
   * 填充员工数据
   */
  private async seedEmployees(): Promise<void> {
    const sql = `
      INSERT INTO "${this.templateSchema}".employees
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
      ON CONFLICT (id) DO NOTHING
    `;
    await this.adapter.execute(sql);
  }

  /**
   * 填充订单数据
   */
  private async seedOrders(): Promise<void> {
    const sql = `
      INSERT INTO "${this.templateSchema}".orders
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
      ON CONFLICT (id) DO NOTHING
    `;
    await this.adapter.execute(sql);
  }
}
