export interface LessonDraft {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly updatedAt: number;
  readonly schemaVersion: 2;
}

export interface SaveLessonCommand {
  readonly lessonId: string;
  readonly title: string;
  readonly content: string;
  readonly baseVersion: number;
}

export type OutboxStatus = "pending" | "sending" | "failed";

export interface OutboxRecord {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly command: SaveLessonCommand;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly nextAttemptAt: number;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: number | null;
  readonly lastError: string | null;
  readonly createdAt: number;
}

