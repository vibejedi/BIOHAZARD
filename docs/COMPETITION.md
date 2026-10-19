# Timed competition foundation

The current release awards in-game points and records completed survival and
campaign times on the player's device. This is the user's selected first phase.
There is no payment integration or shared leaderboard yet. GitHub Pages serves
static files and cannot securely verify scores or send payouts.

## Current scoring

Normal zombies and runners have 100 health. M4 body damage is 29, AK is 35, and
USP is 27; headshots multiply damage by four. This makes headshots one-shot kills
and normal body kills three or four shots at every wave and difficulty.
Headcrabs have 50 health, no headshot region, and take two body shots.

Body hits award 5 points and body kills another 100. Head hits award 25 and head
kills another 250. Supply credits are a separate consumable resource, have no
cash value, and never reduce the points used for timed records.

Time starts when the operation begins and includes pauses, intermissions, and
chapter changes. Completed runs rank by milliseconds ascending, then score and
headshots descending. Records are separated by course, difficulty, and rule
version. Dust II requires all 5 waves / 50 kills; Black Mesa Lockdown requires all
9 waves / 126 kills. Wave splits are saved with the run.

The storage validator rejects malformed or incomplete records; this does not
make browser results tamper-proof. Players control JavaScript, browser storage,
and their local clock. The opt-in integration-test hook is absent in ordinary
play, but removing that hook does not make client-authoritative play secure.

## Shared standings and prizes later

A deployed service and database are needed before cross-player contests:

1. Authenticate the player, issue a unique run/session with a server start time,
   versioned rules, course, difficulty, and a reproducible spawn seed.
2. Make the server authoritative over enemy state, damage, wave progression,
   ammunition, and completion. Accept player inputs rather than a claimed final
   score. For an asynchronous design, validate a deterministic input replay
   against the issued seed and reject impossible/missing events.
3. Finalize each run once; rank only verified completions in a time-bounded
   competition. Separate courses/difficulties and record the rule version.
4. Define the prize currency, funding source, eligible players, tie rules,
   competition closing time, and dispute process before enabling real prizes.
5. Use a server-side payment provider or wallet service, an auditable ledger,
   idempotent settlement, and server-held credentials. Never send money based on
   a browser-submitted rank or put payout secrets in the Pages build.

The current client does not label local standings as global, verified, or
cash-winning. No prize balances or payment accounts are simulated.
