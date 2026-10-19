import {
  createHmac,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

const PASSWORD_COST = 32_768;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELISM = 1;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_MAX_MEMORY = 64 * 1024 * 1024;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const TOKEN_ISSUER = "shattered-firmament-api";
const TOKEN_AUDIENCE = "shattered-firmament-game";

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
  iss: typeof TOKEN_ISSUER;
  aud: typeof TOKEN_AUDIENCE;
}

function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      PASSWORD_KEY_LENGTH,
      {
        N: PASSWORD_COST,
        r: PASSWORD_BLOCK_SIZE,
        p: PASSWORD_PARALLELISM,
        maxmem: PASSWORD_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await derivePasswordKey(password, salt);
  return [
    "scrypt",
    PASSWORD_COST,
    PASSWORD_BLOCK_SIZE,
    PASSWORD_PARALLELISM,
    salt.toString("hex"),
    derivedKey.toString("hex"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelism, saltHex, keyHex, extra] =
    encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    Number(cost) !== PASSWORD_COST ||
    Number(blockSize) !== PASSWORD_BLOCK_SIZE ||
    Number(parallelism) !== PASSWORD_PARALLELISM ||
    !saltHex ||
    !keyHex ||
    extra !== undefined ||
    !/^[0-9a-f]{32}$/i.test(saltHex) ||
    !/^[0-9a-f]{128}$/i.test(keyHex)
  ) {
    return false;
  }

  const expected = Buffer.from(keyHex, "hex");
  const actual = await derivePasswordKey(password, Buffer.from(saltHex, "hex"));
  return timingSafeEqual(actual, expected);
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(value: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(value).digest();
}

export function issueAccessToken(
  userId: string,
  sessionId: string,
  secret: string,
  nowMilliseconds = Date.now(),
): { token: string; expiresIn: number } {
  const issuedAt = Math.floor(nowMilliseconds / 1000);
  const claims: AccessTokenClaims = {
    sub: userId,
    sid: sessionId,
    iat: issuedAt,
    exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS,
    iss: TOKEN_ISSUER,
    aud: TOKEN_AUDIENCE,
  };
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson(claims);
  const signingInput = `${header}.${payload}`;
  const signature = sign(signingInput, secret).toString("base64url");
  return {
    token: `${signingInput}.${signature}`,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

export function verifyAccessToken(
  token: string,
  secret: string,
  nowMilliseconds = Date.now(),
): AccessTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0))
    return null;
  const [headerPart, payloadPart, signaturePart] = parts as [
    string,
    string,
    string,
  ];

  try {
    const header = JSON.parse(
      Buffer.from(headerPart, "base64url").toString("utf8"),
    ) as { alg?: unknown; typ?: unknown };
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;

    const expectedSignature = sign(`${headerPart}.${payloadPart}`, secret);
    const actualSignature = Buffer.from(signaturePart, "base64url");
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      return null;
    }

    const claims = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf8"),
    ) as Partial<AccessTokenClaims>;
    const nowSeconds = Math.floor(nowMilliseconds / 1000);
    if (
      typeof claims.sub !== "string" ||
      typeof claims.sid !== "string" ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number" ||
      claims.iss !== TOKEN_ISSUER ||
      claims.aud !== TOKEN_AUDIENCE ||
      claims.exp <= nowSeconds ||
      claims.iat > nowSeconds + 30 ||
      claims.exp - claims.iat > ACCESS_TOKEN_TTL_SECONDS
    ) {
      return null;
    }
    return claims as AccessTokenClaims;
  } catch {
    return null;
  }
}

export const ACCESS_TOKEN_TTL = ACCESS_TOKEN_TTL_SECONDS;
