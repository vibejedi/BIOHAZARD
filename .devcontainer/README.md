# Develop BIOHAZARD from your phone or any computer

[Open in GitHub Codespaces](https://codespaces.new/vibejedi/BIOHAZARD?ref=main)

1. Sign in to GitHub, open the link, and create a Codespace on **main**. Use the
   default **BIOHAZARD browser development** configuration.
2. Wait for setup to finish. It installs the locked dependencies, restores the
   published game media, validates it, runs the rule tests, and builds the game.
3. In the editor's **Ports** panel, open **5173 — BIOHAZARD game preview** in a
   separate browser tab. On a phone, landscape orientation leaves more room.
4. Edit `src/` in the browser editor. Saving a file updates the preview. Use
   **Source Control → Commit → Push / Sync Changes** to save your work to GitHub.

The server runs in the Codespace, so the phone needs no Node, Python, Windows
installer, or local game files. Use [Your Codespaces](https://github.com/codespaces)
to resume the **same Codespace** from another device, including uncommitted edits.
GitHub Codespaces access and available account quota are required. `github.dev`
is a browser editor; running the development server requires Codespaces.

## Startup, restart and multiplayer

Both development servers start automatically when the Codespace starts, and the
Ports panel forwards 5173 (game) and 8080 (match service). Keep the ports **Private**
for development; sign in with the same GitHub account when opening the preview
on another device. The preview is available while its Codespace is running.

The multiplayer address is configured automatically for the Codespace's HTTPS
preview, using secure WebSockets on forwarded port 8080. In Multiplayer, the
server field should already contain `wss://YOUR_CODESPACE-8080.app.github.dev/ws`.
A previously saved server address on that browser takes precedence; replace it
with the address printed by the development status command when testing here.
If GitHub asks you to authorize the forwarded backend, open port 8080's `/healthz`
page once in that browser, then reconnect. Private previews are for your signed-in
account; the public multiplayer VPS remains a separate deployment.

From the repository terminal (alternate local ports can be selected with
`BIOHAZARD_DEV_FRONTEND_PORT` and `BIOHAZARD_DEV_MATCH_PORT`):

```sh
node .devcontainer/dev.mjs status
node .devcontainer/dev.mjs stop
node .devcontainer/dev.mjs start
```

`start` is repeatable and verifies the actual media endpoint and match service.
`stop` only signals the processes created by this helper, with matching unique
process titles. Logs and process state live in ignored `game-assets/development/`.
If an independently started process uses either port, stop it yourself first;
the helper does not terminate unrelated servers.

Re-run dependency/media setup with `bash .devcontainer/setup.sh`. Complete local
prepared media is retained. An incomplete `game-assets/ready/` is preserved with
an error: rename it as a backup before retrying. To intentionally replace old
media, stop development, rename that folder, and run setup again.

Media comes from the repository's published `gh-pages` branch; the selected
commit is recorded in `game-assets/ready/.published-source.json`. Only approved
GLBs, map JSON, textures and WAVs are restored. The original installer and native
libraries are not fetched into the working tree or executed. Raw assets are
needed only when changing the asset conversion, not for normal game development.

## Checks and publication

```sh
npm test
npm run assets:validate
npm run build
```

For the full browser suite, first build both releases and install Chromium:

```sh
npm run package:web
npx playwright install --with-deps chromium
npm run test:browser
```

The source-only environment skips the one navigation test that inspects the raw
original BSP. The prepared-map navigation tests still run. Python/NumPy/Pillow
conversion tests additionally need the original raw media and Python environment
as described in the project README.

Commit and push source changes first. To intentionally update the public game,
run `npm run deploy:github` from this prepared checkout. It rebuilds and publishes
to the existing `gh-pages` branch. Saving files or opening a preview does not
publish the site or deploy the production multiplayer server.

Wallet development uses the same backend on port 8080. Its URL is supplied to
the browser automatically; sign in from an EVM wallet browser on mobile. SQLite
accounts/passes live in ignored `game-assets/accounts/`. Burning is disabled until
a token method and RPC are explicitly configured. See
[wallet and rewards setup](../docs/WALLETS_AND_REWARDS.md).

The same configuration works in desktop VS Code with **Dev Containers: Reopen in
Container** and Docker installed. Outside a container, use Node 24, Git and Bash,
then run setup and the start command above.
