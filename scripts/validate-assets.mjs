import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import validator from 'gltf-validator';

const root = fileURLToPath(new URL('../game-assets/ready/', import.meta.url));
const manifest = JSON.parse(await fs.readFile(join(root, 'manifest.json'), 'utf8'));
let failed = false;
for (const [name, model] of Object.entries(manifest.models)) {
  const data = await fs.readFile(join(root, model.file));
  const result = await validator.validateBytes(new Uint8Array(data), { uri: model.file });
  const { numErrors, numWarnings } = result.issues;
  console.log(`${name}: ${numErrors} glTF errors, ${numWarnings} warnings, ${model.animations.length} animations`);
  if (numErrors || numWarnings) { failed = true; console.error(result.issues.messages.filter(issue => issue.severity < 2)); }
}
for (const world of [manifest.world, ...(manifest.campaignWorlds || [])].filter(Boolean)) {
  const data = await fs.readFile(join(root, world.geometry));
  const result = await validator.validateBytes(new Uint8Array(data), { uri: world.geometry });
  console.log(`${world.name}: ${result.issues.numErrors} glTF errors, ${result.issues.numWarnings} warnings, ${world.faces} faces`);
  if (result.issues.numErrors || result.issues.numWarnings) { failed = true; console.error(result.issues.messages.filter(issue => issue.severity < 2)); }
}
if (manifest.maps.length !== 27) console.log(`Imported package contains ${manifest.maps.length} CS maps.`);
if (failed) process.exitCode = 1;
