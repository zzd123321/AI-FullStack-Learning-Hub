/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_ENABLE_LABS: "true" | "false";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "virtual:course-manifest" {
  interface CourseSummary {
    readonly id: string;
    readonly title: string;
  }

  const manifest: { readonly courses: readonly CourseSummary[] };
  export default manifest;
}
