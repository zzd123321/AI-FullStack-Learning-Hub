export function render(container: HTMLElement): void {
  const heading = document.createElement("h2");
  heading.textContent = "课程编辑器";
  container.replaceChildren(heading);
}
