export interface CapabilityPurpose {
  readonly capability: 'camera' | 'microphone' | 'geolocation' | 'clipboard';
  readonly purpose: string;
  readonly retention: 'none' | 'session' | 'account';
  readonly required: boolean;
}

export function validatePurpose(item: CapabilityPurpose): string[] {
  const errors: string[] = [];
  if (item.purpose.trim().length < 8) errors.push('用途说明过于模糊');
  if (item.capability === 'clipboard' && item.retention === 'account') errors.push('剪贴板内容不应默认长期保存');
  if (item.required && item.retention === 'account') errors.push('强制能力需要单独证明长期保留的必要性');
  return errors;
}
