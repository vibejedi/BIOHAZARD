import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = join(root, 'game-assets'), ready = join(assets, 'ready');
const models = ['zombie', 'headcrab', 'crate', 'player', 'usp', 'deagle', 'mp5', 'p90', 'm4', 'ak', 'm249'];
const maps = ['dust2', 'c1a0', 'c1a1', 'c1a2', 'c1a3', 'c1a4'];
const allowed = /^(manifest\.json|(?:zombie|headcrab|crate|player|usp|deagle|mp5|p90|m4|ak|m249|dust2|c1a[0-4])\.glb|(?:dust2|c1a[0-4])(?:-lightmap\.png|\.json)|sky\/(?:des|c1a[0-4]-)(?:rt|lf|up|dn|bk|ft)\.png|sounds\/(?:m4|ak|usp|reload|zombie1|zombie2|zombieAttack|hurt|crabIdle|crabAttack|deagle|mp5|p90|m249)\.wav)$/;
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 8 * 1024 * 1024 });

function requiredFiles(manifest) {
  const worlds = [manifest.world, ...(manifest.campaignWorlds || [])];
  if (manifest.models?.crate?.faces !== 6 || !/^de_dust2\.bsp#model\d+$/.test(manifest.models?.crate?.source || '') || manifest.format !== 1 || models.some(id => manifest.models?.[id]?.file !== `${id}.glb`)
      || worlds.length !== maps.length || maps.some(id => !worlds.some(world => world?.id === id))) {
    throw new Error('Published media does not match the five-map campaign and seven-weapon version.');
  }
  const files = new Set(['manifest.json', ...Object.values(manifest.models).map(model => model.file), ...Object.values(manifest.sounds)]);
  for (const world of worlds) {
    if (Object.keys(world.sky || {}).length !== 6) throw new Error(`Incomplete sky for ${world.id}`);
    files.add(world.geometry); files.add(world.collision); files.add(world.lightmap);
    Object.values(world.sky).forEach(file => files.add(file));
  }
  for (const file of files) if (typeof file !== 'string' || !allowed.test(file)) throw new Error('Unexpected file in published browser media.');
  return [...files];
}

async function restore() {
  try {
    const info = await lstat(ready);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Existing media path is not a normal directory.');
    const manifest = JSON.parse(await readFile(join(ready, 'manifest.json'), 'utf8'));
    for (const file of requiredFiles(manifest)) {
      const entry = await lstat(join(ready, file));
      if (!entry.isFile() || entry.isSymbolicLink() || !entry.size) throw new Error(`Incomplete prepared file: ${file}`);
    }
    console.log('Existing complete browser media retained; no original or prepared assets overwritten.'); return;
  } catch (error) {
    // Only an absent destination may be initialized automatically. Preserve
    // partial conversions and all local edits instead of merging over them.
    let exists = true;
    try { await lstat(ready); } catch (check) { if (check.code === 'ENOENT') exists = false; else throw check; }
    if (exists) throw new Error(`Existing game-assets/ready was left untouched: ${error.message}. Rename that folder to keep a backup, then retry setup.`);
  }
  console.log('Restoring curated browser media from origin/gh-pages; no installer or native code is used.');
  execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', 'gh-pages'], { cwd: root, stdio: 'inherit' });
  const commit = git('rev-parse', 'FETCH_HEAD^{commit}').toString().trim();
  const manifest = JSON.parse(git('show', `${commit}:local-game-assets/manifest.json`).toString());
  const files = requiredFiles(manifest);
  const entries = new Map(git('ls-tree', '-rz', commit, '--', 'local-game-assets/').toString().split('\0').filter(Boolean).map(record => {
    const [metadata, path] = record.split('\t'); return [path, metadata.split(' ')];
  }));
  await mkdir(assets, { recursive: true });
  const temporary = await mkdtemp(join(assets, '.restore-'));
  try {
    let bytes = 0;
    for (const file of files) {
      const entry = entries.get(`local-game-assets/${file}`);
      if (entry?.[0] !== '100644' || entry[1] !== 'blob') throw new Error(`Missing or non-regular published media: ${file}`);
      const data = git('cat-file', 'blob', entry[2]); bytes += data.length;
      if (!data.length || bytes > 256 * 1024 * 1024) throw new Error('Unexpected browser media size.');
      await mkdir(dirname(join(temporary, file)), { recursive: true }); await writeFile(join(temporary, file), data);
    }
    await writeFile(join(temporary, '.published-source.json'), JSON.stringify({ commit, branch: 'gh-pages', files: files.length }, null, 2) + '\n');
    await rename(temporary, ready);
    console.log(`Restored ${files.length} browser media files (${(bytes / 1048576).toFixed(1)} MiB) from ${commit.slice(0, 7)}.`);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
restore().catch(error => { console.error(`Media setup failed: ${error.message}`); process.exitCode = 1; });
