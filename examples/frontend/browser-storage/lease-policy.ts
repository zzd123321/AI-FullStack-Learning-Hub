import type { OutboxRecord } from "./types.js";

// 网络请求返回时，最初领取的租约可能已经过期并被其他标签页重新领取。
// 只有所有权和领取代次都没变化，旧执行者才有权提交完成状态。
export function stillOwnsLease(
  current: OutboxRecord | undefined,
  claimed: OutboxRecord,
): current is OutboxRecord {
  return current?.id === claimed.id &&
    current.status === "sending" &&
    current.leaseOwner !== null &&
    current.leaseOwner === claimed.leaseOwner &&
    current.attempts === claimed.attempts;
}
