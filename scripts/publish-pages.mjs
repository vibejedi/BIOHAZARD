import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Publish only the prepared static site, without changing the source checkout.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const dist = join(root, 'dist');
const status = join(dist, 'local-game-assets/status.json');
if (!existsSync(status) || !JSON.parse(readFileSync(status, 'utf8')).available) {
  throw new Error('Prepare the supplied game assets before publishing: this build does not include Dust2.');
}
if (!existsSync(join(dist, 'local-game-assets/dust2.glb'))) {
  throw new Error('The Dust2 browser model is missing.');
}
const manifest = JSON.parse(readFileSync(join(dist, 'local-game-assets/manifest.json'), 'utf8'));
for (const id of ['c1a0', 'c1a1', 'c1a2']) {
  const world = manifest.campaignWorlds?.find(world => world.id === id);
  if (!world || ![world.geometry, world.collision, world.lightmap].every(file => existsSync(join(dist, 'local-game-assets', file)))) {
    throw new Error(`The Half-Life campaign map ${id} is missing. Prepare all game assets before publishing.`);
  }
}

const ref = 'refs/heads/gh-pages';
const remote = git('ls-remote', 'origin', ref);
const parent = remote ? remote.split(/\s+/)[0] : null;
if (parent) git('fetch', '--no-tags', 'origin', ref);

const temporary = mkdtempSync(join(tmpdir(), 'biohazard-pages-'));
try {
  const site = join(temporary, 'site');
  cpSync(dist, site, { recursive: true });
  writeFileSync(join(site, '.nojekyll'), '');
  const env = {
    ...process.env,
    GIT_DIR: git('rev-parse', '--absolute-git-dir'),
    GIT_WORK_TREE: site,
    GIT_INDEX_FILE: join(temporary, 'index'),
  };
  const stagedGit = (...args) => execFileSync('git', args, { cwd: site, env, encoding: 'utf8' }).trim();
  stagedGit('read-tree', '--empty');
  stagedGit('add', '--all', '--force', '.');
  const tree = stagedGit('write-tree');
  const revision = git('rev-parse', '--short', 'HEAD');
  const args = ['commit-tree', tree];
  if (parent) args.push('-p', parent);
  args.push('-m', `Publish browser game from ${revision}`);
  const commit = git(...args);
  // A normal push preserves existing history and rejects concurrent updates.
  execFileSync('git', ['push', 'origin', `${commit}:${ref}`], { cwd: root, stdio: 'inherit' });
  console.log(`Published static browser files to gh-pages (${commit.slice(0, 7)}).`);
  console.log('GitHub repository Settings → Pages: deploy from gh-pages, / (root).');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
