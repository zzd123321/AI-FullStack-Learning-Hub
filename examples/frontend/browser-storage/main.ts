import { openLearningDatabase } from "./database.js";
import { createDraftRepository } from "./draft-repository.js";
import { createInvalidationChannel } from "./cross-tab-invalidation.js";
import { inspectStorageCapacity } from "./storage-capacity.js";

const output = document.querySelector<HTMLOutputElement>("#status");
const save = document.querySelector<HTMLButtonElement>("#save");
if (!output || !save) throw new Error("Storage demo markup is incomplete");

const database = await openLearningDatabase({
  onBlocked: () => { output.value = "请关闭仍在使用旧数据库版本的标签页"; },
  onVersionChange: () => { output.value = "数据库已升级，请刷新页面"; },
});
const drafts = createDraftRepository(database);
const channel = createInvalidationChannel((message) => {
  void drafts.get(message.draftId).then((latest) => {
    output.value = latest
      ? `其他标签页更新于 ${new Date(latest.updatedAt).toLocaleTimeString()}`
      : "草稿已删除";
  }).catch(() => { output.value = "无法读取其他标签页的更新"; });
});

save.addEventListener("click", async () => {
  try {
    const updatedAt = Date.now();
    await drafts.put({
      id: "lesson-storage",
      title: "浏览器存储",
      content: "一份离线草稿",
      updatedAt,
      schemaVersion: 2,
    });
    channel.publish({ version: 1, type: "draft-changed", draftId: "lesson-storage", revision: updatedAt });
    const capacity = await inspectStorageCapacity();
    output.value = `已保存；使用量 ${capacity.usage ?? "未知"} bytes`;
  } catch (error) {
    output.value = error instanceof DOMException && error.name === "QuotaExceededError"
      ? "存储空间不足，请清理可重建缓存后重试"
      : "保存失败，输入内容仍保留在页面中";
  }
});

window.addEventListener("pagehide", () => {
  channel.close();
  database.close();
}, { once: true });
