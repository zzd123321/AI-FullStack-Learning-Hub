import { renderComments } from "./safe-dom.js";
import { configureExternalLink } from "./safe-navigation.js";
import { createWorkerBuffer } from "./cross-origin-isolation.js";

const comments = document.querySelector<HTMLElement>("#comments");
const download = document.querySelector<HTMLAnchorElement>("#download");
const status = document.querySelector<HTMLOutputElement>("#status");
if (!comments || !download || !status) throw new Error("Security demo markup is incomplete");

renderComments(comments, [{
  author: "访客 <img src=x onerror=alert(1)>",
  body: "这段内容会作为文本显示，而不是作为 HTML 解释。",
}]);

const linkAccepted = configureExternalLink(download, "https://cdn.example.com/guide.pdf");
const selection = createWorkerBuffer(1024);
status.value = `${linkAccepted ? "下载地址已验证" : "下载地址被拒绝"}；` +
  `${selection.shared ? "已启用共享内存" : "使用普通 ArrayBuffer 降级"}`;
