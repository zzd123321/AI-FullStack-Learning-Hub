import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalize(value[key])}`
    ).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value) {
  return createHash('sha256').update(canonicalize(value)).digest('hex')
}

function initialState(runId) {
  return {
    runId,
    status: 'IDLE',
    sequence: 0,
    request: null,
    pendingAction: null,
    approval: null,
    providerResult: null
  }
}

function reduceEvent(state, event) {
  assert.equal(event.sequence, state.sequence + 1, '事件 sequence 必须连续')
  const next = { ...state, sequence: event.sequence }

  switch (event.type) {
    case 'WORKFLOW_STARTED':
      assert.equal(state.status, 'IDLE')
      return { ...next, status: 'RECEIVED' }
    case 'REQUEST_VALIDATED':
      assert.equal(state.status, 'RECEIVED')
      return { ...next, status: 'VALIDATED', request: event.payload.request }
    case 'APPROVAL_REQUESTED':
      assert.equal(state.status, 'VALIDATED')
      return { ...next, status: 'AWAITING_APPROVAL', pendingAction: event.payload.action }
    case 'APPROVAL_GRANTED':
      assert.equal(state.status, 'AWAITING_APPROVAL')
      assert.equal(event.payload.actionDigest, state.pendingAction.actionDigest)
      return { ...next, status: 'READY_TO_EXECUTE', approval: event.payload }
    case 'EXECUTION_STARTED':
      assert.ok(['READY_TO_EXECUTE', 'EXECUTING'].includes(state.status))
      return { ...next, status: 'EXECUTING' }
    case 'REFUND_SUCCEEDED':
      assert.equal(state.status, 'EXECUTING')
      return { ...next, status: 'COMPLETED', providerResult: event.payload }
    default:
      throw new Error(`未知事件类型：${event.type}`)
  }
}

class EventStore {
  constructor(events = []) {
    this.events = structuredClone(events)
  }

  append(runId, type, payload, actor = { type: 'system', id: 'workflow' }) {
    const sameRun = this.events.filter((event) => event.runId === runId)
    const event = {
      eventId: randomUUID(),
      runId,
      sequence: sameRun.length + 1,
      type,
      actor,
      payload: structuredClone(payload),
      occurredAt: new Date().toISOString(),
      workflowVersion: 'refund-v1'
    }
    // 生产数据库应以 (runId, sequence) 唯一约束实现乐观并发控制。
    this.events.push(event)
    return event
  }

  load(runId) {
    return this.events
      .filter((event) => event.runId === runId)
      .sort((left, right) => left.sequence - right.sequence)
  }
}

function rebuildState(store, runId) {
  return store.load(runId).reduce(reduceEvent, initialState(runId))
}

class IdempotentPaymentProvider {
  constructor() {
    this.results = new Map()
    this.invocationCount = 0
    this.sideEffectCount = 0
  }

  refund({ orderId, amountCny, idempotencyKey }) {
    this.invocationCount += 1
    if (this.results.has(idempotencyKey)) return this.results.get(idempotencyKey)

    this.sideEffectCount += 1
    const result = {
      refundId: `refund-${this.sideEffectCount}`,
      orderId,
      amountCny,
      status: 'succeeded',
      idempotencyKey
    }
    this.results.set(idempotencyKey, result)
    return result
  }
}

function startWorkflow(store, request) {
  assert.equal(request.tenantId, 'tenant-a')
  assert.equal(request.currency, 'CNY')
  assert.ok(Number.isFinite(request.amountCny) && request.amountCny > 0)

  const runId = randomUUID()
  store.append(runId, 'WORKFLOW_STARTED', {})
  store.append(runId, 'REQUEST_VALIDATED', { request })

  const actionWithoutDigest = {
    tool: 'execute_refund',
    tenantId: request.tenantId,
    orderId: request.orderId,
    amountCny: request.amountCny,
    currency: request.currency,
    reason: request.reason
  }
  const action = { ...actionWithoutDigest, actionDigest: digest(actionWithoutDigest) }
  store.append(runId, 'APPROVAL_REQUESTED', { action })
  return runId
}

function approve(store, runId, approval) {
  const state = rebuildState(store, runId)
  assert.equal(state.status, 'AWAITING_APPROVAL')
  assert.equal(approval.actionDigest, state.pendingAction.actionDigest)
  assert.ok(Date.parse(approval.expiresAt) > Date.now(), '审批已过期')
  store.append(runId, 'APPROVAL_GRANTED', approval, {
    type: 'user',
    id: approval.approverId
  })
}

function executeRefund(store, provider, runId, { simulateCrashAfterProvider = false } = {}) {
  const state = rebuildState(store, runId)
  if (state.status === 'COMPLETED') return state.providerResult
  assert.ok(['READY_TO_EXECUTE', 'EXECUTING'].includes(state.status))

  if (state.status === 'READY_TO_EXECUTE') {
    store.append(runId, 'EXECUTION_STARTED', {
      actionDigest: state.pendingAction.actionDigest
    })
  }

  const refreshed = rebuildState(store, runId)
  const idempotencyKey = [
    'refund',
    refreshed.pendingAction.tenantId,
    refreshed.pendingAction.orderId,
    refreshed.pendingAction.actionDigest
  ].join(':')
  const result = provider.refund({
    orderId: refreshed.pendingAction.orderId,
    amountCny: refreshed.pendingAction.amountCny,
    idempotencyKey
  })

  if (simulateCrashAfterProvider) {
    throw new Error('模拟崩溃：外部退款成功，但成功事件尚未写入')
  }

  store.append(runId, 'REFUND_SUCCEEDED', result)
  return result
}

const store = new EventStore()
const provider = new IdempotentPaymentProvider()
const runId = startWorkflow(store, {
  tenantId: 'tenant-a',
  orderId: 'order-1001',
  amountCny: 128,
  currency: 'CNY',
  reason: '重复扣款'
})

const pending = rebuildState(store, runId).pendingAction
approve(store, runId, {
  actionDigest: pending.actionDigest,
  approverId: 'finance-reviewer-7',
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
})

assert.throws(
  () => executeRefund(store, provider, runId, { simulateCrashAfterProvider: true }),
  /模拟崩溃/
)

// 模拟进程重启：事件从持久化快照恢复；支付平台保留幂等记录。
const restoredStore = new EventStore(JSON.parse(JSON.stringify(store.events)))
const result = executeRefund(restoredStore, provider, runId)
const duplicateResume = executeRefund(restoredStore, provider, runId)
const finalState = rebuildState(restoredStore, runId)

assert.equal(finalState.status, 'COMPLETED')
assert.equal(provider.invocationCount, 2, '崩溃前后共调用供应商两次')
assert.equal(provider.sideEffectCount, 1, '业务退款副作用只能发生一次')
assert.deepEqual(duplicateResume, result, '完成后重复恢复应直接返回已记录结果')

console.log(JSON.stringify({
  runId,
  finalStatus: finalState.status,
  eventTypes: restoredStore.load(runId).map((event) => event.type),
  providerInvocationCount: provider.invocationCount,
  providerSideEffectCount: provider.sideEffectCount,
  result
}, null, 2))
