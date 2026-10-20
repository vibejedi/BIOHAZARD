# Campaign economy and score rules

Campaign runs start with a USP (12 loaded / 36 reserve) and $600 field cash.
A body kill earns $100, a headshot kill $150, and every completed wave $300.
Cash purchases weapons, ammunition or health at the original military crate;
it never contributes directly to score and has no real-world value.

There are five chapters, three waves each: c1a0, c1a1, c1a2, c1a3, c1a4.
Weapons, bullets, health and money persist between all 15 waves and chapters.
Nothing automatically refills. E opens the crate within 3.5 metres on the same
floor; enemies and the combat clock continue while shopping.

| Weapon | Unlock wave | Price | Ammo refill |
| --- | ---: | ---: | ---: |
| USP | 1 | Starts owned | $150 |
| Desert Eagle | 1 | $650 | $170 |
| MP5 | 4 | $1,500 | $200 |
| P90 | 4 | $2,350 | $250 |
| AK-47 | 7 | $3,100 | $300 |
| M4A1 | 7 | $3,300 | $300 |
| M249 | 13 | $5,750 | $550 |

New purchases include one full magazine and two magazines in reserve. Ammo
purchases refill only the selected owned gun to its configured full load.
Health costs $350 and restores the selected difficulty's maximum health.
Switching guns creates no ammunition. Dust II training compresses tier unlocks
to waves 2, 3 and 5 of its five-wave course.

Normal zombies/runners have 100 health. Pistols/SMGs/rifles/heavy weapons need
3–4 body hits; head damage is multiplied by four, killing in one headshot.
Headcrabs have 50 health, take two body hits, and have no headshot region.

## Per-wave scoring

Each completed wave adds four components:

- Headshots: 100 points per headshot kill.
- Speed: 1,000 × target time / (target time + combat time), rounded. Target time is
  15 seconds plus 0.8 seconds per enemy in the wave.
- Survival: max(0, 1,000 − 10 × actual health damage received).
- Accuracy: 1,000 × hits / shots, rounded; zero if no shots were fired.

The wave summary and final table show time, headshots, accuracy, damage and
points. Combat time includes pauses/shopping during the active wave, and excludes
intermissions. The overall timer includes the whole run, including intermissions
and chapter transitions. Black Mesa requires all 15 waves / 300 kills; Dust II
requires 5 / 50. Records rank total score first, then overall time, then headshots.
They are separated by course, difficulty and rule version. Previous score rules
are excluded. Only completed runs enter local records.

These are local practice standings. The storage validator rejects malformed or
incomplete records, but players control JavaScript, storage and local clocks.
Campaign records are not server verified or shared. There are no wallets, entry
fees, payment integrations or cash prizes.

## Online mode and future contests

The separate PvP deathmatch server verifies positions, bullets, hits, reloads,
purchases and match results. See [multiplayer deployment](MULTIPLAYER.md) for
queue rules and the USA West VPS setup. It does not verify campaign runs or
provide persistent account rankings.

Shared campaign competitions would require authenticated sessions, authoritative
simulation or validated deterministic input replays, a database, versioned rules
and finalized results. Real prizes additionally require defined eligibility,
funding, tie rules, an auditable ledger and server-side payment integration.
Neither browser-submitted scores nor the current guest PvP service are a basis
for real-money payouts.
