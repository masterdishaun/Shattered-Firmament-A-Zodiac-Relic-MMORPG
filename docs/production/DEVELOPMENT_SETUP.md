# Development Setup

## Canonical repository

GitHub: https://github.com/masterdishaun/Shattered-Firmament-A-Zodiac-Relic-MMORPG

This repository is the source of truth. Use a local checkout as the working directory and commit/push meaningful changes here. Avoid maintaining a parallel project copy.

## Local paths

- Intended workspace: `D:\GitHub\Game Development`.
- Observed Godot 4.7.2 executable: `D:\GitHub\Game Development\Godot_v4.7.2-stable_win64.exe\Godot_v4.7.2-stable_win64.exe`.
- Expected repository checkout: `D:\GitHub\Game Development\Shattered-Firmament-A-Zodiac-Relic-MMORPG`. Verify it exists and points to the correct remote before use.

The Godot 4.7.2 executable reported `4.7.2.stable.official.ed1daf0bf`. It was invoked headlessly against the current minimal client project and exited successfully. The client has not yet been fully playtested or exported.

## Engine version

Use Godot 4.x; currently use installed 4.7.2 for initial development. Do not use Godot 3 LTS for this project unless an ADR approves a migration; the scaffold uses Godot 4 project settings and APIs.

## Toolchain

- Node.js supported LTS (pin version in toolchain metadata).
- Corepack + pnpm.
- TypeScript.
- PostgreSQL 15+ planned; initial SQL migration drafted, not applied to test database.
- Godot 4.7.2 for initial editor/headless checks.

## Commands

From the repository root:

- `corepack pnpm install`
- `corepack pnpm -r build`
- `corepack pnpm -r typecheck`
- `corepack pnpm -r test`
- `corepack pnpm -r lint`

Run Godot:

- `Godot_v4.7.2-stable_win64.exe --path client --editor`

## Status boundaries

Build/type-check/test/lint success applies only to the current scaffold. It does not establish a playable MMORPG, database integration, Colyseus admission, production performance or platform exports.
