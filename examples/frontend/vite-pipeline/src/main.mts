import courseManifest from "virtual:course-manifest";
import { parseClientConfig } from "./app-config.js";
import { applyCourseCover } from "./asset-urls.js";
import { loadRoute } from "./route-registry.js";

const app = document.querySelector<HTMLElement>("#app");
const cover = document.querySelector<HTMLImageElement>("#cover");
if (!app || !cover) throw new Error("Application markup is incomplete");

const config = parseClientConfig(import.meta.env, location.origin);
applyCourseCover(cover);

const requestedRoute = new URL(location.href).searchParams.get("page") ?? "catalog";
const page = await loadRoute(requestedRoute);
page.render(app);

console.info({ config, courseCount: courseManifest.courses.length });
