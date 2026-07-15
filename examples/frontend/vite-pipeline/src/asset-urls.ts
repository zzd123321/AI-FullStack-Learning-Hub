export const courseCoverUrl = new URL("./assets/course-cover.svg", import.meta.url).href;

export function applyCourseCover(image: HTMLImageElement): void {
  image.src = courseCoverUrl;
  image.alt = "前端工程化课程封面";
}
