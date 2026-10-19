import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const readSchema = async (name) =>
  JSON.parse(
    (
      await readFile(
        new URL(`../schemas/${name}.schema.json`, import.meta.url),
        "utf8",
      )
    ).replace(/^\uFEFF/, ""),
  );

test("move intent schema accepts bounded axes and rejects client-supplied speed/position", async () => {
  const validate = new Ajv2020({ allErrors: true }).compile(
    await readSchema("move-intent"),
  );
  assert.equal(validate({ sequence: 1, axisX: 1, axisY: -0.5 }), true);
  assert.equal(validate({ sequence: 1, axisX: 1.01, axisY: 0 }), false);
  assert.equal(
    validate({ sequence: 1, axisX: 0, axisY: 0, speed: 999 }),
    false,
  );
  assert.equal(
    validate({ sequence: 1, axisX: 0, axisY: 0, position: { x: 999, y: 0 } }),
    false,
  );
});

test("world snapshot schema accepts the versioned server-authoritative shape", async () => {
  const validate = new Ajv2020({ allErrors: true }).compile(
    await readSchema("world-snapshot"),
  );
  const snapshot = {
    type: "S2C_WorldSnapshot",
    protocolVersion: 1,
    payload: {
      serverTick: 42,
      serverTime: "2026-10-19T12:00:00.000Z",
      players: [
        {
          characterId: "123e4567-e89b-42d3-a456-426614174000",
          name: "Test Hero",
          mapId: "luminous_veil",
          position: { x: 22, y: 4, facing: 0 },
          movementSequence: 7,
          health: 100,
          maxHealth: 100,
        },
      ],
    },
  };
  assert.equal(validate(snapshot), true, JSON.stringify(validate.errors));
  assert.equal(
    validate({
      ...snapshot,
      payload: {
        ...snapshot.payload,
        players: [
          {
            ...snapshot.payload.players[0],
            position: { x: 1000, y: 4, facing: 0 },
          },
        ],
      },
    }),
    false,
  );
  assert.equal(validate({ ...snapshot, protocolVersion: 2 }), false);
});

test("combat intent schema only permits a target character ID", async () => {
  const validate = new Ajv2020({ allErrors: true }).compile(
    await readSchema("combat-intent"),
  );
  assert.equal(validate({ targetCharacterId: "character-123" }), true);
  assert.equal(
    validate({ targetCharacterId: "character-123", damage: 999 }),
    false,
  );
  assert.equal(validate({ targetCharacterId: "" }), false);
});

test("combat result schema accepts server-owned damage and rejects malformed results", async () => {
  const validate = new Ajv2020({ allErrors: true }).compile(
    await readSchema("combat-result"),
  );
  const result = {
    type: "S2C_CombatResult",
    protocolVersion: 1,
    payload: {
      accepted: true,
      attackerCharacterId: "attacker",
      targetCharacterId: "target",
      damage: 20,
      targetHealth: 80,
      reason: null,
      serverTick: 120,
    },
  };
  assert.equal(validate(result), true, JSON.stringify(validate.errors));
  assert.equal(
    validate({ ...result, payload: { ...result.payload, damage: -5 } }),
    false,
  );
  assert.equal(
    validate({ ...result, payload: { ...result.payload, clientDamage: 999 } }),
    false,
  );
});
