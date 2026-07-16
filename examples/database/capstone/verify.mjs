import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
const files = ['mysql.sql', 'postgresql.sql']
const forbidden = [
  { pattern: /\bDROP\b/i, label: 'DROP' },
  { pattern: /\bTRUNCATE\b/i, label: 'TRUNCATE' },
  { pattern: /\bDELETE\s+FROM\b/i, label: 'DELETE FROM' },
  { pattern: /\bUPDATE\s+\w+\s+SET\b(?![\s\S]{0,200}\bWHERE\b)/i, label: '可能无条件 UPDATE' },
]

const requiredTables = [
  'capstone_users',
  'capstone_roles',
  'capstone_permissions',
  'capstone_user_roles',
  'capstone_role_permissions',
]

let failed = false

for (const filename of files) {
  const sql = readFileSync(join(directory, filename), 'utf8')

  for (const { pattern, label } of forbidden) {
    if (pattern.test(sql)) {
      console.error(`${filename}: 发现禁止或需人工确认的操作：${label}`)
      failed = true
    }
  }

  for (const table of requiredTables) {
    if (!sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
      console.error(`${filename}: 缺少表定义 ${table}`)
      failed = true
    }
  }

  for (const keyword of ['PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK', 'ROLLBACK', 'EXPLAIN']) {
    if (!sql.includes(keyword)) {
      console.error(`${filename}: 缺少关键能力 ${keyword}`)
      failed = true
    }
  }

  if (!/ORDER BY u\.created_at DESC, u\.id DESC/.test(sql)) {
    console.error(`${filename}: 缺少稳定分页排序`)
    failed = true
  }
}

if (failed) process.exitCode = 1
else console.log('capstone SQL static checks passed')

