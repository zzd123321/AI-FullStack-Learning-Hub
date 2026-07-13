const API_URL = 'https://api.openai.com/v1/embeddings'
const MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small'
const TIMEOUT_MS = 15_000
const MAX_ATTEMPTS = 3
const MAX_LOCAL_BATCH_SIZE = 64
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

function parseDimensions(value) {
  if (value === undefined || value === '') return undefined
  const dimensions = Number(value)
  if (!Number.isInteger(dimensions) || dimensions < 1) {
    throw new Error('OPENAI_EMBEDDING_DIMENSIONS 必须是正整数')
  }
  return dimensions
}

const DIMENSIONS = parseDimensions(process.env.OPENAI_EMBEDDING_DIMENSIONS)

function validateInputs(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new TypeError('inputs 必须是非空字符串数组')
  }
  if (inputs.length > MAX_LOCAL_BATCH_SIZE) {
    throw new RangeError(`示例客户端每批最多 ${MAX_LOCAL_BATCH_SIZE} 条，请在上游拆批`)
  }
  inputs.forEach((input, index) => {
    if (typeof input !== 'string' || input.trim().length === 0) {
      throw new TypeError(`inputs[${index}] 必须是非空字符串`)
    }
  })
}

function buildRequestBody(inputs) {
  validateInputs(inputs)
  return {
    model: MODEL,
    input: inputs,
    encoding_format: 'float',
    ...(DIMENSIONS === undefined ? {} : { dimensions: DIMENSIONS })
  }
}

function retryAfterMilliseconds(response) {
  const value = response.headers.get('retry-after')
  if (!value) return undefined

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000

  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, date - Date.now())
}

function backoffMilliseconds(attempt) {
  const exponential = 300 * 2 ** (attempt - 1)
  const jitter = Math.floor(Math.random() * 150)
  return Math.min(3_000, exponential + jitter)
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function validateEmbeddingResponse(payload, expectedCount) {
  if (!payload || !Array.isArray(payload.data) || payload.data.length !== expectedCount) {
    throw new Error('Embedding 响应数量与请求输入不一致')
  }

  const ordered = Array(expectedCount)
  for (const item of payload.data) {
    if (!Number.isInteger(item?.index) || item.index < 0 || item.index >= expectedCount) {
      throw new Error('Embedding 响应包含非法 index')
    }
    if (ordered[item.index] !== undefined) {
      throw new Error(`Embedding 响应包含重复 index: ${item.index}`)
    }
    if (!Array.isArray(item.embedding) || item.embedding.length === 0) {
      throw new Error(`Embedding 响应 index=${item.index} 不含有效向量`)
    }
    if (!item.embedding.every(Number.isFinite)) {
      throw new Error(`Embedding 响应 index=${item.index} 包含非有限数值`)
    }
    ordered[item.index] = item.embedding
  }

  if (ordered.some((embedding) => embedding === undefined)) {
    throw new Error('Embedding 响应缺少部分 index')
  }

  const actualDimensions = ordered[0].length
  if (!ordered.every((embedding) => embedding.length === actualDimensions)) {
    throw new Error('同一批次返回了不同维度的向量')
  }
  if (DIMENSIONS !== undefined && actualDimensions !== DIMENSIONS) {
    throw new Error(`期望 ${DIMENSIONS} 维，实际返回 ${actualDimensions} 维`)
  }

  return {
    embeddings: ordered,
    model: payload.model,
    dimensions: actualDimensions,
    usage: payload.usage ?? null
  }
}

async function requestOnce(apiKey, body) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })

  if (!response.ok) {
    const error = new Error(`Embeddings API 返回 HTTP ${response.status}`)
    error.status = response.status
    error.retryAfterMs = retryAfterMilliseconds(response)
    // 不读取并打印响应体，以免供应商回显的输入进入普通日志。
    throw error
  }

  return response.json()
}

async function createEmbeddings(inputs) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('缺少服务端环境变量 OPENAI_API_KEY')

  const body = buildRequestBody(inputs)
  let lastError

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const payload = await requestOnce(apiKey, body)
      return validateEmbeddingResponse(payload, inputs.length)
    } catch (error) {
      lastError = error
      const isNetworkOrTimeout = error instanceof TypeError || error?.name === 'TimeoutError'
      const isRetryableStatus = RETRYABLE_STATUSES.has(error?.status)
      const canRetry = attempt < MAX_ATTEMPTS && (isNetworkOrTimeout || isRetryableStatus)

      if (!canRetry) throw error

      const waitMs = error.retryAfterMs ?? backoffMilliseconds(attempt)
      console.warn('Embedding 暂时失败，准备有限重试', {
        attempt,
        status: error.status ?? 'network_or_timeout',
        waitMs
      })
      await delay(waitMs)
    }
  }

  throw lastError
}

const sampleInputs = [
  '缓存过期后，客户端可以使用 ETag 发起条件请求。',
  '资源未修改时，服务端返回 304，避免传输完整响应体。'
]

if (process.env.DRY_RUN === '1') {
  const body = buildRequestBody(sampleInputs)
  console.log('DRY_RUN：不会发送网络请求，也不需要 API Key。')
  console.log(JSON.stringify({ endpoint: API_URL, body }, null, 2))
} else {
  try {
    const result = await createEmbeddings(sampleInputs)
    // 只输出运营元数据，不输出原文、密钥或完整向量。
    console.log({
      model: result.model,
      count: result.embeddings.length,
      dimensions: result.dimensions,
      usage: result.usage
    })
  } catch (error) {
    console.error('Embedding 请求失败', {
      name: error.name,
      message: error.message,
      status: error.status
    })
    process.exitCode = 1
  }
}
