export interface CapabilityPurpose {
  readonly capability: 'camera' | 'microphone' | 'geolocation' | 'clipboard';
  readonly purpose: string;
  readonly dataCategories: readonly string[];
  readonly processing: 'local' | 'server';
  // null means the feature does not intentionally persist the result.
  readonly retentionDays: number | null;
  readonly required: boolean;
  readonly fallback: string | null;
}

export function validatePurpose(item: CapabilityPurpose): string[] {
  const errors: string[] = [];
  const purpose = item.purpose.trim();

  if (purpose.length < 8 || /^(改善体验|提供服务|业务需要|用于分析)$/.test(purpose)) {
    errors.push('用途说明过于模糊');
  }
  if (item.dataCategories.length === 0 || item.dataCategories.some((value) => value.trim().length === 0)) {
    errors.push('必须列出实际处理的数据类别');
  }
  if (new Set(item.dataCategories).size !== item.dataCategories.length) {
    errors.push('数据类别不能重复');
  }
  if (item.retentionDays !== null
    && (!Number.isInteger(item.retentionDays) || item.retentionDays < 1 || item.retentionDays > 3650)) {
    errors.push('保留天数必须是 1 到 3650 的整数');
  }
  if (item.capability === 'clipboard' && item.retentionDays !== null) {
    errors.push('剪贴板内容不应默认持久保存');
  }
  if (!item.required && (item.fallback === null || item.fallback.trim().length < 4)) {
    errors.push('可选能力必须说明替代路径');
  }
  return errors;
}
