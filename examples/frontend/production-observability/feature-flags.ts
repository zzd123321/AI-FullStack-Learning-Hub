import type { Attributes, Telemetry } from './contracts.js';
import { deterministicSample } from './sampling.js';

export interface EvaluationContext {
  readonly targetingKey: string;
  readonly country?: string;
  readonly plan?: 'free' | 'team' | 'enterprise';
}

export interface BooleanFlag {
  readonly key: string;
  readonly enabled: boolean;
  readonly rollout: number;
  readonly countries?: readonly string[];
}

export interface FlagDecision {
  readonly value: boolean;
  readonly variant: 'control' | 'treatment';
  readonly reason: 'disabled' | 'targeting-miss' | 'rollout';
}

export function evaluateBooleanFlag(flag: BooleanFlag, context: EvaluationContext): FlagDecision {
  if (!flag.enabled) return { value: false, variant: 'control', reason: 'disabled' };
  if (flag.countries && (!context.country || !flag.countries.includes(context.country))) {
    return { value: false, variant: 'control', reason: 'targeting-miss' };
  }
  const value = deterministicSample(`${flag.key}:${context.targetingKey}`, flag.rollout);
  return { value, variant: value ? 'treatment' : 'control', reason: 'rollout' };
}

export function createObservableFlagReader(
  telemetry: Telemetry,
  context: EvaluationContext,
  flags: Readonly<Record<string, BooleanFlag>>,
) {
  const reportedExposures = new Set<string>();

  return (key: string, fallback: boolean): boolean => {
    const flag = flags[key];
    if (!flag) {
      const exposureId = `${key}:fallback:${fallback}`;
      if (!reportedExposures.has(exposureId)) {
        reportedExposures.add(exposureId);
        telemetry.event('feature_flag.evaluated', { key, value: fallback, reason: 'fallback' });
      }
      return fallback;
    }
    if (flag.key !== key) throw new Error(`Feature flag key mismatch: ${key} !== ${flag.key}`);
    const decision = evaluateBooleanFlag(flag, context);
    const exposure: Attributes = {
      key,
      value: decision.value,
      variant: decision.variant,
      reason: decision.reason,
    };
    // 只在业务真正读取时记录，并在当前 Reader 生命周期内去重重复渲染。
    const exposureId = `${key}:${decision.variant}:${decision.reason}`;
    if (!reportedExposures.has(exposureId)) {
      reportedExposures.add(exposureId);
      telemetry.event('feature_flag.evaluated', exposure);
    }
    return decision.value;
  };
}
