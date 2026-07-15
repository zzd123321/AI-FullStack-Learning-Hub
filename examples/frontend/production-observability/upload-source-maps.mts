import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

const [directory, release] = process.argv.slice(2);
const endpoint = process.env.SOURCE_MAP_ENDPOINT;
const token = process.env.SOURCE_MAP_TOKEN;

if (!directory || !release || !endpoint || !token) {
  throw new Error(
    'Usage: SOURCE_MAP_ENDPOINT=... SOURCE_MAP_TOKEN=... node upload-source-maps.mts <dist> <release>',
  );
}

for (const name of (await readdir(directory)).filter((file) => file.endsWith('.map'))) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      release,
      artifact: basename(name, '.map'),
      sourceMap: await readFile(join(directory, name), 'utf8'),
    }),
  });
  if (!response.ok) throw new Error(`Source map upload failed: ${response.status} ${name}`);
}

console.log(`Source maps uploaded for release ${release}.`);
