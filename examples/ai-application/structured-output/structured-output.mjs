import assert from 'node:assert/strict'

const CATEGORY_VALUES = ['billing', 'bug', 'account', 'other']
const PRIORITY_VALUES = ['low', 'normal', 'high']

const ticketSchema = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: CATEGORY_VALUES },
    priority: { type: 'string', enum: PRIORITY_VALUES },
    summary: { type: 'string' },
    requires_human: { type: 'boolean' },
    citations: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: [
    'category',
    'priority',
    'summary',
    'requires_human',
    'citations'
  ],
  additionalProperties: false
}

const requestBody = {
  model: 'gpt-5.6-luna',
  instructions: [
    '根据用户反馈生成工单路由信息。',
    '只能引用输入中提供的文档 ID。',
    '资料不足时 category 使用 other，并将 requires_human 设为 true。'
  ].join('\n'),
  input: [
    {
      role: 'user',
      content: '<document id="refund-policy">退款请求必须转人工审核。</document>'
    },
    {
      role: 'user',
      content: '我被重复扣费了，请帮我退款。'
    }
  ],
  text: {
    format: {
      type: 'json_schema',
      name: 'support_ticket_v1',
      strict: true,
      schema: ticketSchema
    }
  },
  max_output_tokens: 500,
  store: false
}

class StructuredOutputError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'StructuredOutputError'
    this.code = code
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertExactKeys(value, expectedKeys) {
  const actual = Object.keys(value).toSorted()
  const expected = expectedKeys.toSorted()

  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new StructuredOutputError(
      'SCHEMA_MISMATCH',
      `字段不匹配：收到 [${actual.join(', ')}]`
    )
  }
}

function validateTicketShape(value) {
  if (!isPlainObject(value)) {
    throw new StructuredOutputError('SCHEMA_MISMATCH', '输出必须是 JSON 对象')
  }

  assertExactKeys(value, ticketSchema.required)

  if (!CATEGORY_VALUES.includes(value.category)) {
    throw new StructuredOutputError('SCHEMA_MISMATCH', 'category 不在允许枚举中')
  }
  if (!PRIORITY_VALUES.includes(value.priority)) {
    throw new StructuredOutputError('SCHEMA_MISMATCH', 'priority 不在允许枚举中')
  }
  if (typeof value.summary !== 'string') {
    throw new StructuredOutputError('SCHEMA_MISMATCH', 'summary 必须是字符串')
  }
  if (typeof value.requires_human !== 'boolean') {
    throw new StructuredOutputError('SCHEMA_MISMATCH', 'requires_human 必须是布尔值')
  }
  if (!Array.isArray(value.citations) || value.citations.some((item) => typeof item !== 'string')) {
    throw new StructuredOutputError('SCHEMA_MISMATCH', 'citations 必须是字符串数组')
  }

  return value
}

function validateTicketSemantics(ticket, allowedCitationIds) {
  const summaryLength = Array.from(ticket.summary.trim()).length
  if (summaryLength < 4 || summaryLength > 80) {
    throw new StructuredOutputError('BUSINESS_RULE_FAILED', 'summary 长度必须为 4 到 80 个字符')
  }

  const uniqueCitations = new Set(ticket.citations)
  if (uniqueCitations.size !== ticket.citations.length) {
    throw new StructuredOutputError('BUSINESS_RULE_FAILED', 'citations 不能重复')
  }

  for (const citation of ticket.citations) {
    if (!allowedCitationIds.has(citation)) {
      throw new StructuredOutputError('BUSINESS_RULE_FAILED', `未知引用：${citation}`)
    }
  }

  if (ticket.category === 'billing' && !ticket.requires_human) {
    throw new StructuredOutputError('BUSINESS_RULE_FAILED', '计费与退款工单必须转人工')
  }

  return ticket
}

function extractOutputContent(response) {
  if (response.status !== 'completed') {
    const reason = response.incomplete_details?.reason ?? response.status ?? 'unknown'
    throw new StructuredOutputError('MODEL_INCOMPLETE', `模型响应未完成：${reason}`)
  }

  const message = response.output?.find((item) => item.type === 'message')
  const content = message?.content?.[0]

  if (!content) {
    throw new StructuredOutputError('MODEL_PROTOCOL_ERROR', '模型响应没有消息内容')
  }
  if (content.type === 'refusal') {
    throw new StructuredOutputError('MODEL_REFUSAL', content.refusal || '模型拒绝处理')
  }
  if (content.type !== 'output_text' || typeof content.text !== 'string') {
    throw new StructuredOutputError('MODEL_PROTOCOL_ERROR', '模型响应没有结构化文本')
  }

  return content.text
}

function parseTicketResponse(response, allowedCitationIds) {
  const text = extractOutputContent(response)
  let value

  try {
    value = JSON.parse(text)
  } catch {
    throw new StructuredOutputError('INVALID_JSON', '模型输出不是合法 JSON')
  }

  const ticket = validateTicketShape(value)
  return validateTicketSemantics(ticket, allowedCitationIds)
}

function completedResponse(value) {
  return {
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(value) }]
      }
    ]
  }
}

const allowedCitationIds = new Set(['refund-policy'])
const validTicket = {
  category: 'billing',
  priority: 'high',
  summary: '用户反馈出现重复扣费并申请退款',
  requires_human: true,
  citations: ['refund-policy']
}

const parsed = parseTicketResponse(completedResponse(validTicket), allowedCitationIds)
assert.deepEqual(parsed, validTicket)

assert.throws(
  () => parseTicketResponse({
    status: 'incomplete',
    incomplete_details: { reason: 'max_output_tokens' },
    output: []
  }, allowedCitationIds),
  (error) => error.code === 'MODEL_INCOMPLETE'
)

assert.throws(
  () => parseTicketResponse({
    status: 'completed',
    output: [{
      type: 'message',
      content: [{ type: 'refusal', refusal: '无法处理此请求' }]
    }]
  }, allowedCitationIds),
  (error) => error.code === 'MODEL_REFUSAL'
)

assert.throws(
  () => parseTicketResponse({
    status: 'completed',
    output: [{
      type: 'message',
      content: [{ type: 'output_text', text: '{not valid json' }]
    }]
  }, allowedCitationIds),
  (error) => error.code === 'INVALID_JSON'
)

assert.throws(
  () => parseTicketResponse({ status: 'completed', output: [] }, allowedCitationIds),
  (error) => error.code === 'MODEL_PROTOCOL_ERROR'
)

assert.throws(
  () => parseTicketResponse(completedResponse({
    ...validTicket,
    unexpected: true
  }), allowedCitationIds),
  (error) => error.code === 'SCHEMA_MISMATCH'
)

assert.throws(
  () => parseTicketResponse(completedResponse({
    ...validTicket,
    citations: ['not-retrieved']
  }), allowedCitationIds),
  (error) => error.code === 'BUSINESS_RULE_FAILED'
)

assert.throws(
  () => parseTicketResponse(completedResponse({
    ...validTicket,
    requires_human: false
  }), allowedCitationIds),
  (error) => error.code === 'BUSINESS_RULE_FAILED'
)

console.log(JSON.stringify({
  requestFormat: requestBody.text.format,
  parsedTicket: parsed,
  fixtureChecks: 8,
  status: 'all_passed'
}, null, 2))
