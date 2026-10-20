# Character Selection UI Contract

## Purpose

Deliver a cinematic character-selection and creation surface for Shattered Firmament without replacing the proven world/dungeon vertical slice in the same change. This first implementation is a standalone Godot 4.7.2 scene; integration into the account/session flow is a separate acceptance step.

## Locked visual direction

- **Composition:** hybrid layout with faction selection on the left, a central 3D character inspection preview, and class selection on the right.
- **Identity:** celestial, restrained, premium dark UI; readable typography and thin frames rather than a busy dashboard.
- **Preview:** 3D inspectable placeholder model and class-specific weapon silhouettes. Primitive blockout is not final character art.
- **Shared system:** consistent layout, type hierarchy, spacing, frames, and interaction states across all factions.
- **Sovereign Sect:** jade green, ivory, and antique gold; White Jade Bastion.
- **Ashen Syndicate:** obsidian, crimson, and neon violet; Cinderwake.
- **Astral Concord:** midnight blue, silver, and celestial cyan; Luminous Veil.
- **Audio:** global mute toggle and settings entry point.

## Character choice invariants

- Faction, class, and appearance are independent selections.
- All classes are available to every gender/body presentation; no class is gender-locked.
- Appearance is a separate axis, with body presentation and body type independently adjustable.
- The UI must not promise server persistence before the API integration is wired.
- The current character archetype fixture is the source for selectable class IDs. The screen is data-driven and must grow with the canonical class catalog rather than hard-code a class-count limit.
- Faction choice sets the selected faction theme and preview accents; it must not silently change the selected class or appearance.

## Interaction states

- Default, hover, selected, and pressed states are visible on faction/class cards and primary action.
- Selecting a faction updates faction copy, accent colors, preview orbit, and CTA theme only.
- Selecting a class updates the selected card, class description, and preview weapon only.
- Body presentation and body type update preview proportions independently.
- Invalid short names are rejected locally with visible feedback.
- The primary action emits a structured selection payload; server-backed creation is not claimed by this scene alone.
- Global mute is a real Master bus mute toggle. Settings is an explicit local-prototype dialog until full settings persistence is implemented.

## Acceptance for this UI foundation

1. Godot 4.7.2 headless editor import completes without parse errors.
2. The scene instantiates and contains all three factions, all class entries from the fixture, name and appearance selectors, settings and mute controls.
3. Faction and class selection are independent; class selection never filters based on faction or appearance.
4. Character payload includes name, class ID, faction ID, body presentation and body type.
5. Existing prototype and multiplayer smoke tests remain unchanged and pass.
6. No server data or production services are modified.

## Known limits

- The current fixture has three implemented server archetypes. The UI reads the fixture dynamically, so the complete approved launch roster can be added through canonical content without redesigning the layout.
- Character mesh, cloth, hair, face, animations, lighting polish, controller navigation, localization, and API persistence are future integration/presentation work. The current preview is a primitive blockout.
