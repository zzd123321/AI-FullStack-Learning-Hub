import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const PUBLIC_ID = "virtual:course-manifest";
const RESOLVED_ID = `\0${PUBLIC_ID}`;

function parseManifest(source: string): unknown {
  const value: unknown = JSON.parse(source);
  if (typeof value !== "object" || value === null) throw new TypeError("Invalid course manifest");
  const courses = (value as Record<string, unknown>).courses;
  if (!Array.isArray(courses) || !courses.every((course) => {
    if (typeof course !== "object" || course === null) return false;
    const record = course as Record<string, unknown>;
    return typeof record.id === "string" && typeof record.title === "string";
  })) {
    throw new TypeError("Invalid courses in manifest");
  }
  return value;
}

export function courseManifestPlugin(manifestFile: string): Plugin {
  const absoluteFile = resolve(manifestFile);
  return {
    name: "learning:course-manifest",

    resolveId(source) {
      return source === PUBLIC_ID ? RESOLVED_ID : null;
    },

    async load(id) {
      if (id !== RESOLVED_ID) return null;
      const source = await readFile(absoluteFile, "utf8");
      const parsed = parseManifest(source);
      return `export default ${JSON.stringify(parsed)};`;
    },

    handleHotUpdate(context) {
      if (resolve(context.file) !== absoluteFile) return;
      const module = context.server.moduleGraph.getModuleById(RESOLVED_ID);
      if (!module) return [];
      context.server.moduleGraph.invalidateModule(module);
      return [module];
    },
  };
}
