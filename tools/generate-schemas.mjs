/** Generate validators and declarations from the same canonical JSON schemas. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { compile } from 'json-schema-to-typescript';

const output = new URL('../src/content/generated/', import.meta.url);
await mkdir(output, { recursive: true });
for (const kind of ['map', 'game', 'items']) {
  const schemaURL = new URL(`../schemas/${kind}.schema.json`, import.meta.url);
  const schema = JSON.parse(await readFile(schemaURL, 'utf8'));
  const ajv = new Ajv({ strict: true, allErrors: false, code: { source: true, esm: true } });
  const code = standaloneCode(ajv, ajv.compile(schema));
  // Do not silently introduce Node-only helpers or dynamic compilation in the browser.
  if (/\brequire\s*\(|\bnew Function\b/.test(code)) throw new Error(`${kind}: standalone validator requires unsupported runtime helpers.`);
  await writeFile(new URL(`${kind}-validator.mjs`, output), `// @ts-nocheck\n// Generated; edit schemas/${kind}.schema.json instead.\n${code}\n`);
  await writeFile(new URL(`${kind}-validator.d.mts`, output),
    `import type { ${schema.title} } from './${kind}.js';\ninterface Validator { (value: unknown): value is ${schema.title}; errors?: readonly { instancePath: string; message?: string; params: Record<string, unknown> }[] | null; }\ndeclare const validate: Validator;\nexport default validate;\n`);
  const types = await compile(schema, schema.title, {
    cwd: fileURLToPath(new URL('../schemas/', import.meta.url)),
    bannerComment: `/** Generated from schemas/${kind}.schema.json. Do not edit. */`,
    additionalProperties: false, ignoreMinAndMaxItems: true,
  });
  await writeFile(new URL(`${kind}.d.ts`, output), types);
}
console.log('Generated map/game/items validators and TypeScript declarations from canonical schemas.');
