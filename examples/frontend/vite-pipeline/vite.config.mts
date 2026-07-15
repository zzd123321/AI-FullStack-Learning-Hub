import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { courseManifestPlugin } from "./plugins/course-manifest.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "APP_");
  const apiTarget = env.APP_API_PROXY_TARGET;
  if (!apiTarget) throw new Error("APP_API_PROXY_TARGET is required");

  return {
    base: env.APP_PUBLIC_BASE || "/",
    plugins: [courseManifestPlugin("content/course-manifest.json")],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      fs: { strict: true },
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: "baseline-widely-available",
      manifest: true,
      sourcemap: mode === "staging" ? "hidden" : false,
      rolldownOptions: {
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
