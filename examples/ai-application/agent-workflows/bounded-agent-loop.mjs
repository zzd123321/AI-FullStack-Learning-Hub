import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'

const limits = {
  maxTurns: 6,
  maxToolCalls: 5,
  maxBudgetUnits: 80
}

const principal = {
  tenantId: 'tenant-a',
  userId: 'user-42',
  permissions: ['orders:read', 'policies:read', 'refunds:create']
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalize(value[key])}`
    ).join(',')}}`
  }
  return JSON.stringify(value)
}

function actionDigest(name, args, identity) {
  return createHash('sha256')
    .update(canonicalize({ name, args, tenantId: identity.tenantId, userId: identity.userId }))
    .digest('hex')
}

const orders = new Map([
  ['order-1001', {
    orderId: 'order-1001',
    tenantId: 'tenant-a',
    userId: 'user-42',
    amountCny: 128,
    status: 'paid'
  }]
])

const refundResults = new Map()

const tools = {
  get_order: {
    risk: 'read',
    permission: 'orders:read',
    validate(args) {
      return args && Object.keys(args).length === 1 && typeof args.order_id === 'string'
    },
    execute(args, identity) {
      const order = orders.get(args.order_id)
      if (!order || order.tenantId !== identity.tenantId || order.userId !== identity.userId) {
        return { ok: false, code: 'NOT_FOUND' }
      }
      return { ok: true, order }
    }
  },
  get_refund_policy: {
    risk: 'read',
    permission: 'policies:read',
    validate(args) {
      return args && Object.keys(args).length === 1 && args.region === 'CN'
    },
    execute() {
      return { ok: true, requiresApprovalAboveCny: 100, maxRefundCny: 500 }
    }
  },
  execute_refund: {
    risk: 'write',
    permission: 'refunds:create',
    validate(args) {
      return args
        && Object.keys(args).length === 3
        && typeof args.order_id === 'string'
        && Number.isFinite(args.amount_cny)
        && args.amount_cny > 0
        && typeof args.reason === 'string'
        && args.reason.length > 0
    },
    execute(args, identity, idempotencyKey) {
      const order = orders.get(args.order_id)
      if (!order || order.tenantId !== identity.tenantId || order.userId !== identity.userId) {
        return { ok: false, code: 'NOT_FOUND' }
      }
      if (args.amount_cny > order.amountCny) return { ok: false, code: 'AMOUNT_EXCEEDS_ORDER' }
      if (refundResults.has(idempotencyKey)) return refundResults.get(idempotencyKey)
      const result = { ok: true, refundId: 'refund-1001', status: 'succeeded' }
      refundResults.set(idempotencyKey, result)
      return result
    }
  }
}

function scriptedModel(state) {
  const hasResult = (name) => state.toolResults.some((entry) => entry.name === name && entry.result.ok)
  if (!hasResult('get_order')) {
    return { type: 'tool_call', callId: 'call-order', name: 'get_order', args: { order_id: 'order-1001' } }
  }
  if (!hasResult('get_refund_policy')) {
    return { type: 'tool_call', callId: 'call-policy', name: 'get_refund_policy', args: { region: 'CN' } }
  }
  if (!hasResult('execute_refund')) {
    return {
      type: 'tool_call',
      callId: 'call-refund',
      name: 'execute_refund',
      args: { order_id: 'order-1001', amount_cny: 128, reason: '重复扣款' }
    }
  }
  return { type: 'final', text: '退款已完成，退款编号 refund-1001。' }
}

function createRun() {
  return {
    runId: randomUUID(),
    status: 'RUNNING',
    turn: 0,
    toolCallCount: 0,
    budgetUsed: 0,
    toolResults: [],
    executedCallIds: {},
    approvals: {},
    pendingAction: null,
    finalAnswer: null,
    stopReason: null
  }
}

function validateAndDescribeCall(decision, identity) {
  const tool = tools[decision.name]
  if (!tool) throw new Error(`工具不在 allowlist：${decision.name}`)
  if (!tool.validate(decision.args)) throw new Error(`工具参数校验失败：${decision.name}`)
  if (!identity.permissions.includes(tool.permission)) throw new Error(`主体无工具权限：${tool.permission}`)
  return { tool, digest: actionDigest(decision.name, decision.args, identity) }
}

function executeCall(state, decision, identity) {
  if (state.executedCallIds[decision.callId]) {
    return state.executedCallIds[decision.callId]
  }

  const { tool, digest } = validateAndDescribeCall(decision, identity)
  if (tool.risk === 'write' && state.approvals[digest] !== true) {
    state.status = 'AWAITING_APPROVAL'
    state.pendingAction = {
      ...decision,
      actionDigest: digest,
      summary: `为订单 ${decision.args.order_id} 退款 ${decision.args.amount_cny} CNY`,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
    }
    return null
  }

  const idempotencyKey = `${state.runId}:${decision.name}:${digest}`
  const result = tool.execute(decision.args, identity, idempotencyKey)
  const record = { callId: decision.callId, name: decision.name, args: decision.args, result, actionDigest: digest }
  state.executedCallIds[decision.callId] = record
  state.toolResults.push(record)
  state.pendingAction = null
  return record
}

function runAgent(state, identity) {
  if (state.status === 'AWAITING_APPROVAL') return state
  if (['COMPLETED', 'STOPPED'].includes(state.status)) return state

  state.status = 'RUNNING'
  while (state.status === 'RUNNING') {
    if (state.turn >= limits.maxTurns) {
      state.status = 'STOPPED'
      state.stopReason = 'MAX_TURNS'
      break
    }
    if (state.toolCallCount >= limits.maxToolCalls) {
      state.status = 'STOPPED'
      state.stopReason = 'MAX_TOOL_CALLS'
      break
    }
    if (state.budgetUsed + 10 > limits.maxBudgetUnits) {
      state.status = 'STOPPED'
      state.stopReason = 'BUDGET_EXHAUSTED'
      break
    }

    state.turn += 1
    state.budgetUsed += 10
    const decision = scriptedModel(state)
    if (decision.type === 'final') {
      state.status = 'COMPLETED'
      state.finalAnswer = decision.text
      state.stopReason = 'GOAL_COMPLETED'
      break
    }

    state.toolCallCount += 1
    const record = executeCall(state, decision, identity)
    if (record === null) break
    if (!record.result.ok) {
      state.status = 'STOPPED'
      state.stopReason = `TOOL_ERROR:${record.result.code}`
    }
  }
  return state
}

function approvePendingAction(state, approver) {
  assert.equal(state.status, 'AWAITING_APPROVAL')
  assert.ok(Date.parse(state.pendingAction.expiresAt) > Date.now())
  assert.ok(approver.permissions.includes('refunds:approve'))
  state.approvals[state.pendingAction.actionDigest] = true
  state.status = 'RUNNING'
  return state
}

const state = runAgent(createRun(), principal)
assert.equal(state.status, 'AWAITING_APPROVAL')
assert.equal(state.pendingAction.summary, '为订单 order-1001 退款 128 CNY')
assert.equal(refundResults.size, 0, '审批前不能执行写操作')

// 检查点必须可序列化，恢复后仍绑定同一个精确动作摘要。
const checkpoint = JSON.parse(JSON.stringify(state))
approvePendingAction(checkpoint, {
  userId: 'finance-reviewer-7',
  permissions: ['refunds:approve']
})

// 恢复时先执行此前暂停的同一个调用，再继续让模型决策。
const pending = checkpoint.pendingAction
const executed = executeCall(checkpoint, pending, principal)
assert.equal(executed.result.ok, true)
runAgent(checkpoint, principal)

assert.equal(checkpoint.status, 'COMPLETED')
assert.equal(checkpoint.stopReason, 'GOAL_COMPLETED')
assert.equal(refundResults.size, 1)
assert.equal(checkpoint.toolCallCount, 3)
assert.ok(checkpoint.turn <= limits.maxTurns)
assert.ok(checkpoint.budgetUsed <= limits.maxBudgetUnits)

// 相同 callId 再次到达时必须返回原记录，不重复执行。
const replay = executeCall(checkpoint, pending, principal)
assert.equal(replay.result.refundId, 'refund-1001')
assert.equal(refundResults.size, 1)

console.log(JSON.stringify({
  runId: checkpoint.runId,
  status: checkpoint.status,
  stopReason: checkpoint.stopReason,
  turns: checkpoint.turn,
  toolCallCount: checkpoint.toolCallCount,
  budgetUsed: checkpoint.budgetUsed,
  tools: checkpoint.toolResults.map((entry) => entry.name),
  finalAnswer: checkpoint.finalAnswer,
  refundSideEffects: refundResults.size
}, null, 2))
