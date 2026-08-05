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
        client_ip        VARCHAR(64),
        status           VARCHAR(20)  NOT NULL DEFAULT 'active',
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        last_accessed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        expires_at       TIMESTAMPTZ  NOT NULL
      )
    `);
    // 兼容已有部署：补充 client_ip 列与索引（单 IP 沙箱配额依赖）
    await this.adapter.execute(`ALTER TABLE "${this.adminSchema}".sandboxes ADD COLUMN IF NOT EXISTS client_ip VARCHAR(64)`);
    await this.adapter.execute(`CREATE INDEX IF NOT EXISTS idx_sandboxes_status ON "${this.adminSchema}".sandboxes(status)`);
    await this.adapter.execute(`CREATE INDEX IF NOT EXISTS idx_sandboxes_expires ON "${this.adminSchema}".sandboxes(expires_at)`);
    await this.adapter.execute(`CREATE INDEX IF NOT EXISTS idx_sandboxes_ip_status ON "${this.adminSchema}".sandboxes(client_ip, status)`);

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
    // 主键用 GENERATED ALWAYS AS IDENTITY：相比 SERIAL，权限随表授予，
    // 克隆到沙箱时（LIKE ... INCLUDING ALL）会在沙箱内创建专属序列，
    // 低权限账号无需额外 GRANT USAGE 即可插入自增值（修复 5.5 序列权限回归）
    await this.adapter.execute(`
      CREATE TABLE IF NOT EXISTS "${this.templateSchema}".employees (
        id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
        id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
   * 注意：主键是 GENERATED ALWAYS AS IDENTITY，不能显式插入 id，
   * 否则 PG 报 "cannot insert a non-DEFAULT value into column id"。
   * 这里不列出 id 列，由 IDENTITY 按 VALUES 顺序自动生成 1..N（顺序与原显式 id 一致）。
   */
  private async seedEmployees(): Promise<void> {
    const sql = `
      INSERT INTO "${this.templateSchema}".employees
        (first_name, last_name, email, department, salary, hire_date)
      VALUES
        ('张', '伟', 'zhangwei@example.com',   '技术部', 15000.00, '2020-03-15'),
        ('李', '娜', 'lina@example.com',       '产品部', 18000.00, '2019-07-01'),
        ('王', '强', 'wangqiang@example.com',  '技术部', 16000.00, '2021-01-10'),
        ('赵', '敏', 'zhaomin@example.com',    '设计部', 14000.00, '2020-11-20'),
        ('刘', '洋', 'liuyang@example.com',    '市场部', 13000.00, '2022-05-05'),
        ('陈', '静', 'chenjing@example.com',   '人事部', 12000.00, '2021-09-12'),
        ('杨', '磊', 'yanglei@example.com',    '技术部', 17000.00, '2018-06-18'),
        ('黄', '丽', 'huangli@example.com',    '产品部', 15500.00, '2020-02-28'),
        ('周', '涛', 'zhoutao@example.com',    '技术部', 19000.00, '2017-12-01'),
        ('吴', '芳', 'wufang@example.com',     '设计部', 13500.00, '2022-08-15')
      ON CONFLICT (email) DO NOTHING
    `;
    await this.adapter.execute(sql);
  }

  /**
   * 填充订单数据
   * 同 seedEmployees：不显式插入 id，由 IDENTITY 自动生成（1..12）。
   */
  private async seedOrders(): Promise<void> {
    // orders 无唯一键（只有 IDENTITY 主键），重启重复 INSERT 会无限叠加。
    // 改为"表空才插入"保证幂等：INSERT ... SELECT ... WHERE NOT EXISTS
    const sql = `
      INSERT INTO "${this.templateSchema}".orders
        (employee_id, customer, product, amount, status, order_date)
      SELECT v.employee_id, v.customer, v.product, v.amount, v.status,
             v.order_date::timestamptz
      FROM (VALUES
        (1, '客户A', '软件许可',      50000.00,  'delivered', '2024-01-15 10:30:00'),
        (2, '客户B', '技术咨询',      30000.00,  'shipped',   '2024-02-20 14:00:00'),
        (1, '客户C', '定制开发',     120000.00,  'pending',   '2024-03-10 09:00:00'),
        (3, '客户D', '软件许可',      50000.00,  'delivered', '2024-03-12 11:00:00'),
        (4, '客户E', 'UI设计服务',    25000.00,  'shipped',   '2024-04-05 16:30:00'),
        (5, '客户F', '市场推广方案',  18000.00,  'cancelled', '2024-04-18 08:00:00'),
        (3, '客户G', '定制开发',      95000.00,  'pending',   '2024-05-22 13:45:00'),
        (7, '客户H', '软件许可',      50000.00,  'delivered', '2024-06-01 10:00:00'),
        (7, '客户I', '技术咨询',      35000.00,  'shipped',   '2024-06-15 15:20:00'),
        (9, '客户J', '定制开发',     110000.00,  'pending',   '2024-07-01 09:30:00'),
        (2, '客户K', '产品培训',      22000.00,  'delivered', '2024-07-10 14:00:00'),
        (1, '客户L', '年度维护',      45000.00,  'shipped',   '2024-07-20 11:00:00')
      ) AS v(employee_id, customer, product, amount, status, order_date)
      WHERE NOT EXISTS (SELECT 1 FROM "${this.templateSchema}".orders)
    `;
    await this.adapter.execute(sql);
  }
}
