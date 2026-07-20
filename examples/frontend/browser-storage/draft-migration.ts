import type { LessonDraft } from "./types.js";

interface LessonDraftV1 {
  readonly id: string;
  readonly content: string;
  readonly savedAt: number;
  readonly schemaVersion: 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasValidIdentityAndTime(value: Record<string, unknown>, timeKey: string): boolean {
  return typeof value.id === "string" && value.id.length > 0 && value.id.length <= 80 &&
    typeof value[timeKey] === "number" && Number.isFinite(value[timeKey]);
}

export function migrateDraft(value: unknown): LessonDraft {
  if (!isRecord(value)) throw new TypeError("Invalid draft record");

  if (
    value.schemaVersion === 2 &&
    hasValidIdentityAndTime(value, "updatedAt") &&
    typeof value.title === "string" &&
    typeof value.content === "string" &&
    value.title.length <= 200 && value.content.length <= 2_000_000
  ) {
    return value as unknown as LessonDraft;
  }

  if (
    value.schemaVersion === 1 &&
    hasValidIdentityAndTime(value, "savedAt") &&
    typeof value.content === "string" &&
    value.content.length <= 2_000_000
  ) {
    const oldDraft = value as unknown as LessonDraftV1;
    return {
      id: oldDraft.id,
      title: "未命名草稿",
      content: oldDraft.content,
      updatedAt: oldDraft.savedAt,
      schemaVersion: 2,
    };
  }

  throw new TypeError("Unsupported draft schema");
}
