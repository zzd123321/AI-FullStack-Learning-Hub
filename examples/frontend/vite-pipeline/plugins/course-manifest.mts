import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

const PUBLIC_ID = "virtual:course-manifest";
const RESOLVED_ID = `\0${PUBLIC_ID}`;

interface CourseManifest {
  readonly courses: readonly {
    readonly id: string;
    readonly title: string;
  }[];
}

function isCourseSummary(value: unknown): value is CourseManifest["courses"][number] {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.title === "string";
}

function parseManifest(source: string): CourseManifest {
  const value: unknown = JSON.parse(source);
  if (typeof value !== "object" || value === null) throw new TypeError("Invalid course manifest");
  const courses = (value as Record<string, unknown>).courses;
  if (!Array.isArray(courses) || !courses.every(isCourseSummary)) {
    throw new TypeError("Invalid courses in manifest");
  }
  return { courses };
}

export function courseManifestPlugin(manifestFile: string): Plugin {
  // `vite` 可以从任意工作目录启动，也可以配置不同的 `root`。
  // 等配置解析完再计算绝对路径，避免偷偷依赖 process.cwd()。
  let absoluteFile = "";

  return {
    name: "learning:course-manifest",

    configResolved(config: ResolvedConfig) {
      absoluteFile = resolve(config.root, manifestFile);
    },

    resolveId(source) {
      return source === PUBLIC_ID ? RESOLVED_ID : null;
    },

    async load(id) {
      if (id !== RESOLVED_ID) return null;

      // readFile 不是静态 import，需显式告诉 Vite：这个 JSON 是模块的依赖。
      this.addWatchFile(absoluteFile);
      const source = await readFile(absoluteFile, "utf8");
      const parsed = parseManifest(source);
      return `export default ${JSON.stringify(parsed)};`;
    },

    handleHotUpdate(context) {
      if (resolve(context.file) !== absoluteFile) return;
      const module = context.server.moduleGraph.getModuleById(RESOLVED_ID);
      if (!module) return [];

      // JSON 变化后让虚拟模块失效，HMR 才会重新执行 load。
      context.server.moduleGraph.invalidateModule(module);
      return [module];
    },
  };
}
