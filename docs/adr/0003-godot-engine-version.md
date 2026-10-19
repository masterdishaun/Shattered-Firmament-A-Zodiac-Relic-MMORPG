# ADR 0003 — Godot Engine Version and Local Workspace

- **Status:** Accepted for initial implementation; re-evaluate only through a documented ADR.
- **Date:** 2026-10-19

## Context

A Godot 3 LTS download was mentioned, but the project scaffold uses Godot 4 project format and APIs. The connected Windows workstation contains and successfully runs Godot 4.7.2 at:

`D:\GitHub\Game Development\Godot_v4.7.2-stable_win64.exe\Godot_v4.7.2-stable_win64.exe`

It reported version `4.7.2.stable.official.ed1daf0bf`. Headless editor initialisation against the minimal client project exited successfully. Godot 3 is a separate major generation and would require an explicit compatibility migration.

## Decision

Use Godot 4.x, currently the installed 4.7.2 executable. Do not build a Godot 3 client in parallel.

## Working path

Intended workspace root: `D:\GitHub\Game Development`. Expected checkout path: `D:\GitHub\Game Development\Shattered-Firmament-A-Zodiac-Relic-MMORPG`, to be verified after the repository is cloned there. The engine executable is external to the repository and must not be committed.

## Consequences

- Keep project format and scripts on Godot 4.
- Test web/native export compatibility early; selecting Godot does not guarantee all target support.
- Do not change project format/API for Godot 3.
- A later engine change requires a documented comparison and migration plan.
