import { describe, expect, it } from "vitest";
import {
  hashPassword,
  hashOpaqueToken,
  issueAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "./security.js";

describe("authentication primitives", () => {
  it("hashes passwords with per-password salts and verifies without exposing the password", async () => {
    const password = "correct horse battery staple 42";
    const firstHash = await hashPassword(password);
    const secondHash = await hashPassword(password);

    expect(firstHash).not.toBe(secondHash);
    expect(firstHash.startsWith("scrypt$32768$8$1$")).toBe(true);
    await expect(verifyPassword(password, firstHash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect password", firstHash)).resolves.toBe(
      false,
    );
    await expect(verifyPassword(password, "not-a-password-hash")).resolves.toBe(
      false,
    );
  });

  it("issues short-lived signed access tokens and rejects expiry, tampering and wrong secrets", () => {
    const now = 1_800_000_000_000;
    const secret = "test-only-secret-that-is-long-enough-for-hmac";
    const issued = issueAccessToken(
      "2b3f3f1a-3e5d-4d9e-8b2c-44b9d9e5a123",
      "9c7a0f72-6d1b-4e2d-8a31-2e6a44c9a456",
      secret,
      now,
    );

    expect(issued.expiresIn).toBe(900);
    expect(verifyAccessToken(issued.token, secret, now + 1_000)).toMatchObject({
      sub: "2b3f3f1a-3e5d-4d9e-8b2c-44b9d9e5a123",
      sid: "9c7a0f72-6d1b-4e2d-8a31-2e6a44c9a456",
    });
    expect(verifyAccessToken(issued.token, secret, now + 901_000)).toBeNull();
    expect(
      verifyAccessToken(issued.token, "a-different-secret", now),
    ).toBeNull();

    const parts = issued.token.split(".");
    const signature = parts[2]!;
    parts[2] = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    expect(verifyAccessToken(parts.join("."), secret, now)).toBeNull();
  });

  it("hashes opaque tokens deterministically for database lookup", () => {
    expect(hashOpaqueToken("example-token")).toBe(
      hashOpaqueToken("example-token"),
    );
    expect(hashOpaqueToken("example-token")).not.toBe(
      hashOpaqueToken("different-token"),
    );
    expect(hashOpaqueToken("example-token")).toMatch(/^[0-9a-f]{64}$/);
  });
});
