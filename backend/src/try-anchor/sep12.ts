import {
  TryAnchorError,
} from "./error.js";

import {
  appendPath,
  bearerHeaders,
  isJsonObject,
  optionalString,
  requireJsonObject,
  requireString,
  resolveFetch,
} from "./protocol.js";

import type {
  AcceptedKyc,
  AnchorDiscovery,
  FetchLike,
  KycFieldValues,
  Sep10Session,
} from "./types.js";

interface EnsureKycAcceptedInput {
  readonly discovery: AnchorDiscovery;
  readonly session: Sep10Session;
  readonly customerType?: string;
  readonly fields?: KycFieldValues;
  readonly fetchImpl?: FetchLike;
}

interface KycStatus {
  readonly status: string;
  readonly id?: string;
  readonly requiredFields: readonly string[];
  readonly message?: string;
}

function parseKycStatus(
  value: Readonly<Record<string, unknown>>,
): KycStatus {
  const fieldsValue = value["fields"];
  const requiredFields = isJsonObject(fieldsValue)
    ? Object.entries(fieldsValue)
        .filter(([, definition]) => {
          if (!isJsonObject(definition)) {
            return true;
          }

          return definition["optional"] !== true;
        })
        .map(([name]) => name)
    : [];

  const id = optionalString(value, "id");
  const message = optionalString(value, "message");

  return {
    status: requireString(value, "status").toUpperCase(),
    requiredFields,
    ...(id === undefined ? {} : { id }),
    ...(message === undefined ? {} : { message }),
  };
}

async function getKycStatus(
  input: EnsureKycAcceptedInput,
  customerType: string,
  customerId?: string,
): Promise<KycStatus> {
  const url = appendPath(input.discovery.kycServer, "customer");

  if (customerId !== undefined) {
    url.searchParams.set("id", customerId);
  } else {
    url.searchParams.set("account", input.session.accountId);
  }

  url.searchParams.set("type", customerType);

  const response = await requireJsonObject(
    await resolveFetch(input.fetchImpl)(url, {
      headers: bearerHeaders(input.session.bearerToken),
    }),
    "SEP-12 customer status request",
    "SEP12_REQUEST_FAILED",
  );

  return parseKycStatus(response);
}

function throwForIncompleteKyc(
  status: KycStatus,
): never {
  if (status.status === "PROCESSING") {
    throw new TryAnchorError(
      "KYC_PENDING",
      status.message ?? "Anchor KYC is still processing.",
    );
  }

  if (status.status === "REJECTED") {
    throw new TryAnchorError(
      "KYC_REJECTED",
      status.message ?? "Anchor KYC was rejected.",
    );
  }

  if (status.status === "NEEDS_INFO") {
    const suffix = status.requiredFields.length > 0
      ? ` Required fields: ${status.requiredFields.join(", ")}.`
      : "";

    throw new TryAnchorError(
      "KYC_REQUIRED",
      `Anchor requires additional KYC information.${suffix}`,
    );
  }

  throw new TryAnchorError(
    "ANCHOR_RESPONSE_INVALID",
    `Anchor returned unsupported KYC status ${status.status}.`,
  );
}

export async function ensureKycAccepted(
  input: EnsureKycAcceptedInput,
): Promise<AcceptedKyc> {
  const customerType = input.customerType ?? "sep6";
  const initial = await getKycStatus(input, customerType);

  if (initial.status === "ACCEPTED") {
    return {
      status: "ACCEPTED",
      ...(initial.id === undefined ? {} : { customerId: initial.id }),
    };
  }

  if (initial.status !== "NEEDS_INFO" || input.fields === undefined) {
    return throwForIncompleteKyc(initial);
  }

  const missingValues = initial.requiredFields.filter(
    (field) => input.fields?.[field] === undefined,
  );

  if (missingValues.length > 0) {
    throw new TryAnchorError(
      "KYC_REQUIRED",
      `Missing required KYC values: ${missingValues.join(", ")}.`,
    );
  }

  const updateUrl = appendPath(input.discovery.kycServer, "customer");
  const update = await requireJsonObject(
    await resolveFetch(input.fetchImpl)(updateUrl, {
      method: "PUT",
      headers: {
        ...bearerHeaders(input.session.bearerToken),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...input.fields,
        account: input.session.accountId,
        type: customerType,
        ...(initial.id === undefined ? {} : { id: initial.id }),
      }),
    }),
    "SEP-12 customer update",
    "SEP12_REQUEST_FAILED",
  );

  const customerId = optionalString(update, "id") ?? initial.id;
  const updated = await getKycStatus(input, customerType, customerId);

  if (updated.status !== "ACCEPTED") {
    return throwForIncompleteKyc(updated);
  }

  return {
    status: "ACCEPTED",
    ...(updated.id === undefined && customerId === undefined
      ? {}
      : { customerId: updated.id ?? customerId }),
  };
}
