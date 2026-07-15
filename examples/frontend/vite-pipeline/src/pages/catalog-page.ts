export function render(container: HTMLElement): void {
  const heading = document.createElement("h2");
  heading.textContent = "课程目录";
  container.replaceChildren(heading);
}
