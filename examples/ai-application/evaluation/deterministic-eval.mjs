import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const datasetUrl = new URL('./eval-cases.jsonl', import.meta.url)
const rawDataset = await readFile(datasetUrl, 'utf8')
const cases = rawDataset
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line)
    } catch (error) {
      throw new Error(`eval-cases.jsonl 第 ${index + 1} 行不是合法 JSON`, { cause: error })
    }
  })

function mean(values) {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length
}

function percentile(values, quantile) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1)
  return sorted[index]
}

function normalize(value) {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('zh-CN')
}

function evaluateCase(testCase) {
  const { expected, context, result } = testCase
  const answerText = result.claims.map((claim) => claim.text).join('\n')
  const retrievedSet = new Set(result.retrievedChunkIds)
  const allowedSet = new Set(context.allowedChunkIds)

  const relevantRanks = expected.relevantChunkIds
    .map((chunkId) => result.retrievedChunkIds.indexOf(chunkId))
    .filter((index) => index >= 0)
    .map((index) => index + 1)

  const retrievalRecall = expected.relevantChunkIds.length === 0
    ? null
    : relevantRanks.length / expected.relevantChunkIds.length
  const reciprocalRank = expected.relevantChunkIds.length === 0
    ? null
    : relevantRanks.length === 0 ? 0 : 1 / Math.min(...relevantRanks)

  const requiredCoverage = expected.requiredPhrases.length === 0
    ? null
    : mean(expected.requiredPhrases.map((phrase) =>
        normalize(answerText).includes(normalize(phrase)) ? 1 : 0
      ))
  const forbiddenFactHits = expected.forbiddenPhrases.filter((phrase) =>
    normalize(answerText).includes(normalize(phrase))
  )

  const citations = result.claims.flatMap((claim) => claim.citations ?? [])
  const citationChecks = citations.map((citation) => {
    const sourceText = context.chunks[citation.chunkId]
    return allowedSet.has(citation.chunkId)
      && retrievedSet.has(citation.chunkId)
      && typeof sourceText === 'string'
      && normalize(sourceText).includes(normalize(citation.quote))
  })
  const citationValidity = citationChecks.length === 0
    ? result.status === 'insufficient_evidence'
    : citationChecks.every(Boolean)
  const claimCitationCompleteness = result.claims.every((claim) =>
    Array.isArray(claim.citations) && claim.citations.length > 0
  )

  const forbiddenRetrievals = result.retrievedChunkIds.filter((chunkId) =>
    expected.forbiddenChunkIds.includes(chunkId)
  )
  const securityViolation = forbiddenRetrievals.length > 0
    || citations.some((citation) => !allowedSet.has(citation.chunkId))

  const statusCorrect = result.status === expected.status
  const passed = statusCorrect
    && citationValidity
    && claimCitationCompleteness
    && forbiddenFactHits.length === 0
    && !securityViolation
    && (requiredCoverage === null || requiredCoverage === 1)

  return {
    id: testCase.id,
    tags: testCase.tags,
    passed,
    retrievalRecall,
    reciprocalRank,
    requiredCoverage,
    statusCorrect,
    citationValidity,
    claimCitationCompleteness,
    forbiddenFactHits,
    forbiddenRetrievals,
    securityViolation,
    latencyMs: result.latencyMs,
    costUsd: result.costUsd
  }
}

function aggregate(results) {
  const applicable = (field) => results.map((result) => result[field]).filter((value) => value !== null)
  return {
    caseCount: results.length,
    passRate: mean(results.map((result) => result.passed ? 1 : 0)),
    retrievalRecall: mean(applicable('retrievalRecall')),
    meanReciprocalRank: mean(applicable('reciprocalRank')),
    requiredCoverage: mean(applicable('requiredCoverage')),
    statusAccuracy: mean(results.map((result) => result.statusCorrect ? 1 : 0)),
    citationValidity: mean(results.map((result) => result.citationValidity ? 1 : 0)),
    claimCitationCompleteness: mean(results.map((result) => result.claimCitationCompleteness ? 1 : 0)),
    securityViolations: results.filter((result) => result.securityViolation).length,
    p95LatencyMs: percentile(results.map((result) => result.latencyMs), 0.95),
    averageCostUsd: mean(results.map((result) => result.costUsd))
  }
}

function slicePassRates(results) {
  const byTag = new Map()
  for (const result of results) {
    for (const tag of result.tags) {
      const entries = byTag.get(tag) ?? []
      entries.push(result)
      byTag.set(tag, entries)
    }
  }
  return Object.fromEntries([...byTag.entries()].map(([tag, entries]) => [
    tag,
    { count: entries.length, passRate: mean(entries.map((entry) => entry.passed ? 1 : 0)) }
  ]))
}

const qualityGate = {
  minimumRetrievalRecall: 0.95,
  minimumMeanReciprocalRank: 0.75,
  minimumRequiredCoverage: 1,
  minimumStatusAccuracy: 1,
  minimumCitationValidity: 1,
  maximumSecurityViolations: 0,
  maximumP95LatencyMs: 800,
  maximumAverageCostUsd: 0.01
}

function checkGate(summary) {
  const checks = {
    retrievalRecall: summary.retrievalRecall >= qualityGate.minimumRetrievalRecall,
    meanReciprocalRank: summary.meanReciprocalRank >= qualityGate.minimumMeanReciprocalRank,
    requiredCoverage: summary.requiredCoverage >= qualityGate.minimumRequiredCoverage,
    statusAccuracy: summary.statusAccuracy >= qualityGate.minimumStatusAccuracy,
    citationValidity: summary.citationValidity >= qualityGate.minimumCitationValidity,
    security: summary.securityViolations <= qualityGate.maximumSecurityViolations,
    latency: summary.p95LatencyMs <= qualityGate.maximumP95LatencyMs,
    cost: summary.averageCostUsd <= qualityGate.maximumAverageCostUsd
  }
  return { passed: Object.values(checks).every(Boolean), checks }
}

const caseResults = cases.map(evaluateCase)
const summary = aggregate(caseResults)
const gate = checkGate(summary)

// 变异测试：证明平均质量再高，也不能掩盖一个白名单外引用。
const forgedCitationCase = structuredClone(cases[0])
forgedCitationCase.id = 'mutation-forged-citation'
forgedCitationCase.result.claims[0].citations[0].chunkId = 'tenant-b-secret'
const mutationResult = evaluateCase(forgedCitationCase)

assert.equal(cases.length, 4)
assert.equal(gate.passed, true, '候选版本应满足教学质量门禁')
assert.equal(mutationResult.securityViolation, true)
assert.equal(mutationResult.passed, false)

console.log(JSON.stringify({
  dataset: 'eval-cases.jsonl',
  summary,
  slicePassRates: slicePassRates(caseResults),
  gate,
  mutationTest: {
    id: mutationResult.id,
    passed: mutationResult.passed,
    securityViolation: mutationResult.securityViolation,
    expectation: '伪造引用必须触发硬门禁'
  }
}, null, 2))
