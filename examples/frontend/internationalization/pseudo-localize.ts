const accents: Readonly<Record<string, string>> = {
  a: 'à', e: 'ë', i: 'ï', o: 'ô', u: 'ü', A: 'Å', E: 'Ë', I: 'Ï', O: 'Ö', U: 'Û',
};

export function pseudoLocalize(message: string): string {
  const chunks = message.split(/(\{[A-Za-z][\w]*\})/g);
  const transformed = chunks.map((chunk) => chunk.startsWith('{')
    ? chunk
    : [...chunk].map((character) => accents[character] ?? character).join(''));
  return `⟦${transformed.join('')} ···⟧`;
}
