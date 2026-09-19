import {
  TryAnchorError,
  type TryAnchorErrorCode,
} from "./error.js";

import type {
  FetchLike,
} from "./types.js";

export interface JsonObject {
  readonly [key: string]: unknown;
}

export function isJsonObject(
  value: unknown,
): value is JsonObject {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value);
}

export async function requireJsonObject(
  response: Response,
  operation: string,
  failureCode: TryAnchorErrorCode,
): Promise<JsonObject> {
  if (!response.ok) {
    throw new TryAnchorError(
      failureCode,
      `${operation} failed with HTTP ${response.status}.`,
    );
  }

  const value: unknown =
    await response.json();

  if (!isJsonObject(value)) {
    throw new TryAnchorError(
      "ANCHOR_RESPONSE_INVALID",
      `${operation} returned a non-object response.`,
    );
  }

  return value;
}

export function requireString(
  object: JsonObject,
  field: string,
): string {
  const value = object[field];

  if (typeof value !== "string" || value.length === 0) {
    throw new TryAnchorError(
      "ANCHOR_RESPONSE_INVALID",
      `Anchor response is missing ${field}.`,
    );
  }

  return value;
}

export function optionalString(
  object: JsonObject,
  field: string,
): string | undefined {
  const value = object[field];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new TryAnchorError(
      "ANCHOR_RESPONSE_INVALID",
      `Anchor response field ${field} must be a string.`,
    );
  }

  return value;
}

export function appendPath(
  base: string,
  suffix: string,
): URL {
  return new URL(
    `${base.replace(/\/$/, "")}/${suffix.replace(/^\//, "")}`,
  );
}

export function bearerHeaders(
  bearerToken: string,
): Record<string, string> {
  return {
    authorization: `Bearer ${bearerToken}`,
  };
}

export function resolveFetch(
  fetchImpl?: FetchLike,
): FetchLike {
  return fetchImpl ?? globalThis.fetch;
}
