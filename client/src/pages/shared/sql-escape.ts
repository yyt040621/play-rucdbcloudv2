/**
 * SQL 字符串字面量转义工具。
 * MySQL 字符串用单引号包裹，内部单引号用 '' 转义，反斜杠用 \\ 转义。
 */

/**
 * 转义一个字符串值，使其可以安全地放进 SQL 单引号字面量中。
 */
export function sqlEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''");
}

/**
 * 判断值是否为数字字面量（不加引号）。
 * 支持整数、小数、负号。
 */
export function isNumericLiteral(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

/**
 * 根据列类型判断值是否需要加引号。
 * 数字/布尔类型不加引号，其他加引号（并转义）。
 */
export function formatSqlValue(value: string, columnType?: string): string {
  const v = value.trim();

  // 布尔值
  const upper = v.toUpperCase();
  if (upper === 'TRUE' || upper === 'FALSE') return upper;

  // 根据列类型判断
  if (columnType) {
    const t = columnType.toLowerCase();
    const isNumericCol =
      t.includes('int') || t.includes('decimal') || t.includes('float') ||
      t.includes('double') || t.includes('numeric') || t.includes('real') ||
      t.includes('year') || t.includes('bit');
    if (isNumericCol && isNumericLiteral(v)) return v;
    // 日期类型不加引号会错，必须加
    return `'${sqlEscape(v)}'`;
  }

  // 无类型信息时，数字不加引号，否则加引号
  if (isNumericLiteral(v)) return v;
  return `'${sqlEscape(v)}'`;
}
