import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

// 这是教学用的透明规则向量，只为离线演示检索链路。
// 它不具备生产 Embedding 模型的泛化能力，不能用于评价真实语义质量。
const concepts = [
  ['cache', ['缓存', 'cache', '过期', '新鲜度']],
  ['validator', ['etag', 'if-none-match', '条件请求', '重新验证', '验证器']],
  ['notModified', ['304', 'not modified', '未修改', '避免下载']],
  ['authorization', ['授权', '权限', '租户', 'tenant', '访问控制']],
  ['authentication', ['认证', '登录', 'cookie', 'session', '会话']],
  ['payroll', ['工资', '薪酬', 'payroll']],
  ['database', ['数据库', 'sql', '索引', '事务']],
  ['security', ['安全', '注入', 'csrf', 'xss']]
]

const documents = [
  {
    documentId: 'http-cache-guide',
    tenantId: 'tenant-a',
    visibility: 'team',
    allowedGroupIds: ['backend'],
    title: 'HTTP 缓存：新鲜度',
    text: 'Cache-Control max-age 决定响应保持新鲜的时间。缓存仍新鲜时可直接复用。'
  },
  {
    documentId: 'http-cache-guide',
    tenantId: 'tenant-a',
    visibility: 'team',
    allowedGroupIds: ['backend'],
    title: 'HTTP 缓存：ETag 与条件请求',
    text: '缓存过期后，客户端把 ETag 放入 If-None-Match 发起条件请求。资源未修改时服务端返回 304，不再下载完整响应体。'
  },
  {
    documentId: 'http-cache-faq',
    tenantId: 'tenant-a',
    visibility: 'team',
    allowedGroupIds: ['backend'],
    title: '为什么收到 304',
    text: '304 Not Modified 表示本地副本仍可使用，常见验证器包括 ETag 和 Last-Modified。'
  },
  {
    documentId: 'session-security',
    tenantId: 'tenant-a',
    visibility: 'team',
    allowedGroupIds: ['backend', 'security'],
    title: 'Cookie 会话安全',
    text: '登录会话 Cookie 应设置 HttpOnly、Secure 和合适的 SameSite，并防范 CSRF。'
  },
  {
    documentId: 'payroll-handbook',
    tenantId: 'tenant-a',
    visibility: 'restricted',
    allowedGroupIds: ['hr'],
    title: '薪酬数据访问',
    text: '工资与薪酬报表只允许 HR 组访问，任何缓存或搜索服务也必须执行权限检查。'
  },
  {
    documentId: 'tenant-b-cache',
    tenantId: 'tenant-b',
    visibility: 'team',
    allowedGroupIds: ['backend'],
    title: '租户 B 的内部缓存密钥',
    text: '租户 B 使用机密缓存验证器 private-etag-value，不得向其他租户返回。'
  }
]

const session = {
  tenantId: 'tenant-a',
  userId: 'user-42',
  groupIds: ['backend']
}

const query = '缓存过期后怎样通过 ETag 避免下载完整内容？'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeText(value) {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/gu, ' ').trim()
}

function normalizeVector(vector) {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  return length === 0 ? vector : vector.map((value) => value / length)
}

function toyEmbed(value) {
  const text = normalizeText(value)
  const vector = concepts.map(([, keywords]) =>
    keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0)
  )
  return normalizeVector(vector)
}

function dotProduct(left, right) {
  assert.equal(left.length, right.length, '向量维度必须一致')
  return left.reduce((sum, value, index) => sum + value * right[index], 0)
}

function lexicalTerms(value) {
  const text = normalizeText(value)
  const latinTerms = text.match(/[a-z0-9][a-z0-9._/-]*/gu) ?? []
  const chineseRuns = text.match(/[\p{Script=Han}]+/gu) ?? []
  const chineseBigrams = chineseRuns.flatMap((run) =>
    Array.from({ length: Math.max(0, run.length - 1) }, (_, index) => run.slice(index, index + 2))
  )
  return [...new Set([...latinTerms, ...chineseBigrams])]
}

function lexicalScore(queryText, documentText) {
  const queryTerms = lexicalTerms(queryText)
  const normalizedDocument = normalizeText(documentText)
  if (queryTerms.length === 0) return 0
  return queryTerms.reduce(
    (score, term) => score + (normalizedDocument.includes(term) ? 1 : 0),
    0
  ) / queryTerms.length
}

function isAuthorized(chunk, principal) {
  if (chunk.tenantId !== principal.tenantId) return false
  if (chunk.visibility === 'public') return true
  if (chunk.ownerId === principal.userId) return true
  return chunk.allowedGroupIds.some((groupId) => principal.groupIds.includes(groupId))
}

const chunks = documents.map((document, position) => {
  const normalized = normalizeText(`${document.title}\n${document.text}`)
  return {
    ...document,
    chunkId: sha256(`${document.documentId}:${position}:${normalized}`).slice(0, 16),
    contentHash: sha256(normalized),
    embedding: toyEmbed(normalized)
  }
})

function rankCandidates(queryText, principal) {
  // 权限在计算和排序候选之前执行，避免无权结果占据 top K。
  const authorized = chunks.filter((chunk) => isAuthorized(chunk, principal))
  const queryEmbedding = toyEmbed(queryText)

  const vectorRanking = authorized
    .map((chunk) => ({ chunk, score: dotProduct(queryEmbedding, chunk.embedding) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)

  const lexicalRanking = authorized
    .map((chunk) => ({
      chunk,
      score: lexicalScore(queryText, `${chunk.title}\n${chunk.text}`)
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)

  return { vectorRanking, lexicalRanking }
}

function reciprocalRankFusion(rankings, smoothing = 60) {
  const fused = new Map()

  for (const ranking of rankings) {
    ranking.forEach(({ chunk }, index) => {
      const current = fused.get(chunk.chunkId) ?? { chunk, score: 0 }
      current.score += 1 / (smoothing + index + 1)
      fused.set(chunk.chunkId, current)
    })
  }

  return [...fused.values()].sort((left, right) => right.score - left.score)
}

function maximalMarginalRelevance(candidates, limit, lambda = 0.72) {
  assert.ok(lambda >= 0 && lambda <= 1, 'lambda 必须位于 0 到 1 之间')
  const remaining = [...candidates]
  const selected = []

  while (remaining.length > 0 && selected.length < limit) {
    let bestIndex = 0
    let bestScore = Number.NEGATIVE_INFINITY

    remaining.forEach((candidate, index) => {
      const redundancy = selected.length === 0
        ? 0
        : Math.max(...selected.map((item) =>
            dotProduct(candidate.chunk.embedding, item.chunk.embedding)
          ))
      const mmrScore = lambda * candidate.score - (1 - lambda) * redundancy

      if (mmrScore > bestScore) {
        bestIndex = index
        bestScore = mmrScore
      }
    })

    selected.push({ ...remaining[bestIndex], mmrScore: bestScore })
    remaining.splice(bestIndex, 1)
  }

  return selected
}

function printableRanking(ranking) {
  return ranking.map(({ chunk, score, mmrScore }, index) => ({
    rank: index + 1,
    chunkId: chunk.chunkId,
    title: chunk.title,
    score: Number(score.toFixed(4)),
    ...(mmrScore === undefined ? {} : { mmrScore: Number(mmrScore.toFixed(4)) })
  }))
}

const { vectorRanking, lexicalRanking } = rankCandidates(query, session)
const fusedRanking = reciprocalRankFusion([
  vectorRanking.slice(0, 5),
  lexicalRanking.slice(0, 5)
])
const reranked = maximalMarginalRelevance(fusedRanking, 3)

console.log('查询：', query)
console.table(printableRanking(vectorRanking))
console.table(printableRanking(lexicalRanking))
console.table(printableRanking(fusedRanking))
console.table(printableRanking(reranked))

assert.equal(
  fusedRanking[0].chunk.title,
  'HTTP 缓存：ETag 与条件请求',
  '融合检索应把直接回答问题的片段排在第一位'
)
assert.ok(
  lexicalRanking.some(({ chunk }) => chunk.text.includes('If-None-Match')),
  '词法检索应能找回精确 HTTP 头字段'
)
assert.ok(
  [...vectorRanking, ...lexicalRanking, ...fusedRanking].every(
    ({ chunk }) => chunk.tenantId === session.tenantId && isAuthorized(chunk, session)
  ),
  '任何排名都不得包含跨租户或无权限片段'
)
assert.ok(
  !fusedRanking.some(({ chunk }) => chunk.documentId === 'payroll-handbook'),
  '当前用户不属于 HR 组，不得召回薪酬片段'
)
assert.ok(
  reranked.every(({ chunk }) => chunk.documentId.startsWith('http-cache')),
  '多样性控制不能越过最低相关性门槛引入无关文档'
)

console.log('验证通过：相关片段排名、精确词召回和权限边界均符合预期。')
