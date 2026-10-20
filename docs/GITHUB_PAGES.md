# Play online with GitHub Pages

The `main` branch contains the source. The `gh-pages` branch contains the complete
static browser game, including Dust II, five Half-Life campaign maps, models, textures, sounds,
and fonts. The original installer, extracted game folders,
native libraries, and development dependencies are excluded.

## Enable hosting once

In [repository Settings → Pages](https://github.com/vibejedi/BIOHAZARD/settings/pages):

1. Set **Source** to **Deploy from a branch**.
2. Select **gh-pages** and **/ (root)**, then **Save**.
3. Wait for GitHub's Pages deployment to finish.

The default site address is **https://vibejedi.github.io/BIOHAZARD/**. This address
becomes playable after Pages is enabled and its deployment succeeds. Opening
files on github.com or raw.githubusercontent.com does not run the game.

GitHub Pages serves the game over HTTPS. Players open the link in a modern
browser and click **Enter the quarantine**. No installer or manual game-file
download is required. The browser still loads the game's media over the network.

## Publish an update

From this prepared checkout, with the supplied media in `game-assets/ready/`:

```sh
npm ci --cache /tmp/biohazard-npm-cache
npm test
npm run deploy:github
```

The command rebuilds the static site, verifies that prepared Dust2 media is
present, and pushes only that site to `gh-pages`. It uses a temporary Git index
without switching the source branch or creating a worktree. It preserves the
deployment branch's history and never force-pushes. GitHub deploys the branch
automatically once Pages is enabled. Commit and push source changes separately.

The prepared media is retained in this cloud environment, rather than in `main`.
A fresh source-only clone needs the supplied game data converted first; see the
asset preparation instructions in the project README. A source-only build cannot enter gameplay without the required original media
and is intentionally rejected by this publisher.

GitHub Pages hosts the client and campaign. The separate multiplayer match service
needs a VPS and TLS endpoint; see [deployment](MULTIPLAYER.md). The client accepts
the endpoint in its multiplayer menu or via `VITE_MULTIPLAYER_URL` at build time.
