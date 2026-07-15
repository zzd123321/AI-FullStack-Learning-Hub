export interface CommentViewModel {
  readonly author: string;
  readonly body: string;
}

export function renderComments(container: HTMLElement, comments: readonly CommentViewModel[]): void {
  const fragment = document.createDocumentFragment();

  for (const comment of comments) {
    const article = document.createElement("article");
    const heading = document.createElement("h3");
    const body = document.createElement("p");

    heading.textContent = comment.author;
    body.textContent = comment.body;
    article.append(heading, body);
    fragment.append(article);
  }

  container.replaceChildren(fragment);
}
