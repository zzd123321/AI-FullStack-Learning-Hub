import type { JsonValue } from './ssr-types.js'

/**
 * 仅适用于由 JSON 值构成的状态。生产项目若需要 Date、Map、BigInt 等类型，
 * 应使用 devalue 等经过审计的序列化器，并保持相同的 XSS 防护边界。
 */
export function serializeForInlineScript(value: JsonValue): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
