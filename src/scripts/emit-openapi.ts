/**
 * Writes the committed OpenAPI snapshots (`openapi.json` / `openapi.yaml` at
 * repo root) from the live `openapiSpec` built by `src/swagger.ts`.
 *
 * The spec is assembled at runtime from the Zod schemas + the `@openapi` JSDoc
 * blocks on the route files, so these two files are generated artefacts — run
 * `npm run openapi:emit` after any route/schema change and commit the result.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import YAML from 'yaml';
import { openapiSpec } from '../swagger';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const jsonPath = path.join(root, 'openapi.json');
const yamlPath = path.join(root, 'openapi.yaml');

writeFileSync(jsonPath, `${JSON.stringify(openapiSpec, null, 2)}\n`);
// `lineWidth: 0` disables line wrapping so long `description` strings stay on
// one line — keeps the diff to real changes instead of re-flowed prose.
writeFileSync(yamlPath, YAML.stringify(openapiSpec, { lineWidth: 0 }));

console.log(`Wrote ${path.relative(root, jsonPath)} and ${path.relative(root, yamlPath)}`);
