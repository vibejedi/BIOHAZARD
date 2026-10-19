import { defineConfig } from 'vite';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Only prepared media can be served. Never expose the installer or native code.
function localGameAssets(standalone = false) {
  const root = fileURLToPath(new URL('./game-assets/ready/', import.meta.url));
  const allowed = /^(manifest\.json|(?:zombie|headcrab|m4|ak|usp|dust2)\.glb|dust2\.json|dust2-lightmap\.png|sky\/des(?:rt|lf|up|dn|bk|ft)\.png|sounds\/(?:m4|ak|usp|reload|zombie1|zombie2|zombieAttack|hurt)\.wav)$/;
  const mime = name => name.endsWith('.glb') ? 'model/gltf-binary' : name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.png') ? 'image/png' : 'application/json';
  const prepared = async () => {
    try {
      const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
      const names = ['manifest.json', ...Object.values(manifest.models).map(model => model.file), ...Object.values(manifest.sounds)];
      if (manifest.world) names.push(manifest.world.geometry, manifest.world.collision, manifest.world.lightmap, ...Object.values(manifest.world.sky));
      const result = { 'status.json': Buffer.from(JSON.stringify({ available: true })) };
      for (const name of new Set(names)) {
        if (!allowed.test(name)) throw new Error(`Unexpected prepared asset: ${name}`);
        result[name] = await readFile(join(root, name));
      }
      return result;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { 'status.json': Buffer.from(JSON.stringify({ available: false })) };
    }
  };
  const middleware = async (req, res, next) => {
    if (!req.url?.startsWith('/local-game-assets/')) return next();
    const name = req.url.split('?')[0].slice('/local-game-assets/'.length);
    if (name === 'status' || name === 'status.json') {
      let available = false;
      try { const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')); available = manifest.format === 1; } catch { /* The original prototype also works without local data. */ }
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      return res.end(JSON.stringify({ available }));
    }
    if (!allowed.test(name)) { res.statusCode = 404; return res.end('Not found'); }
    try {
      const path = join(root, name), info = await stat(path);
      if (!info.isFile()) throw new Error('Not a file');
      res.setHeader('Content-Type', mime(name));
      res.setHeader('Content-Length', info.size); res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (req.method === 'HEAD') return res.end();
      if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }
      const stream = createReadStream(path); stream.on('error', () => res.destroy()); stream.pipe(res);
    } catch { res.statusCode = 404; res.end('Local game asset is unavailable'); }
  };
  return {
    name: 'prepared-browser-game-assets',
    configureServer: server => { server.middlewares.use(middleware); },
    configurePreviewServer: server => { server.middlewares.use(middleware); },
    async generateBundle() {
      if (standalone) return;
      for (const [name, source] of Object.entries(await prepared())) this.emitFile({ type: 'asset', fileName: `local-game-assets/${name}`, source });
    },
    transformIndexHtml: standalone ? {
      order: 'pre',
      async handler() {
        const data = {};
        for (const [name, source] of Object.entries(await prepared())) data[name] = `data:${mime(name)};base64,${source.toString('base64')}`;
        return [{ tag: 'script', children: `globalThis.__BIOHAZARD_MEDIA__=${JSON.stringify(data)};`, injectTo: 'head-prepend' }];
      },
    } : undefined,
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [localGameAssets(mode === 'standalone'), mode === 'standalone' ? viteSingleFile() : null],
  server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/game-assets/**', '**/attachments/**'] } },
  build: { outDir: mode === 'standalone' ? 'releases' : 'dist', rollupOptions: mode === 'standalone' ? {} : { output: { manualChunks: { three: ['three'] } } } },
}));
