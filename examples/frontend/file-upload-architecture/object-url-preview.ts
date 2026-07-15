export class ObjectUrlPreview {
  #url: string | null = null;

  replace(blob: Blob): string {
    this.dispose();
    this.#url = URL.createObjectURL(blob);
    return this.#url;
  }

  dispose(): void {
    if (this.#url !== null) URL.revokeObjectURL(this.#url);
    this.#url = null;
  }
}
