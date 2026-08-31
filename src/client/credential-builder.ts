import {
  Challenge,
  ChallengeRequest,
  Credential,
  P3PChallengeError,
  PAYMENT_HEADER_PREFIX,
  PaymentGateway,
  PaymentMethod,
  Receipt,
} from "../types";
import { decodeJson, encodeJson, isBase64Url } from "../utils/base64url";
import { asRecord } from "../utils/parsers";

/** Decode and validate a server `WWW-Authenticate: Payment ...` challenge. */
export function decodeChallenge(wwwAuthenticateHeader: string): Challenge {
  const encoded = extractBase64Payload(wwwAuthenticateHeader);
  if (!encoded) {
    throw new P3PChallengeError("Invalid WWW-Authenticate header format", "");
  }
  const raw = decodeJson(encoded);
  const challenge = dictToChallenge(raw);
  validateChallenge(challenge);
  return challenge;
}

/** Build the client credential object that authorizes one server debit attempt. */
export function buildCredential(
  challenge: Challenge,
  agentId: string,
  token: string,
  paymentMethod: PaymentMethod,
  mobileNumber?: string,
  paymentMethodReferenceId?: string,
): Credential {
  return {
    challenge,
    source: agentId,
    payload: {
      type: "token",
      token,
      payment_method_reference_id: paymentMethodReferenceId?.trim() || undefined,
      mobile_number: mobileNumber?.trim() || undefined,
      payment_method: paymentMethod,
    },
  };
}

/** Encode a credential as a `Payment <base64url>` header value for `P3P-Credential`. */
export function encodeCredentialHeader(credential: Credential): string {
  const payload: Record<string, unknown> = {
    type: credential.payload.type,
    token: credential.payload.token,
  };
  if (credential.payload.payment_method_reference_id) {
    payload.payment_method_reference_id = credential.payload.payment_method_reference_id;
  }
  if (credential.payload.mobile_number) {
    payload.mobile_number = credential.payload.mobile_number;
  }
  payload.payment_method = credential.payload.payment_method;
  return `${PAYMENT_HEADER_PREFIX}${encodeJson({
    challenge: challengePayload(credential.challenge),
    source: credential.source,
    payload,
  })}`;
}

/** Decode a server `Payment-Receipt` header into a typed receipt. */
export function decodeReceipt(paymentReceiptHeader: string): Receipt {
  const encoded = extractBase64Payload(paymentReceiptHeader);
  if (!encoded) {
    throw new Error("Invalid Payment-Receipt header format");
  }
  const raw = asRecord(decodeJson(encoded)) ?? {};
  const settlement = asRecord(raw.settlement) ?? {};
  const receipt: Receipt = {
    status: raw.status === "success" ? "success" : "failure",
    timestamp: String(raw.timestamp ?? ""),
    reference: String(raw.reference ?? ""),
    challengeId: String(raw.challengeId ?? ""),
    settlement: {
      amount: String(settlement.amount ?? "0.00"),
      currency: String(settlement.currency ?? "INR"),
    },
  };
  const paymentGateway = raw.paymentGateway ?? raw.payment_gateway;
  const paymentMethod = raw.paymentMethod ?? raw.payment_method;
  if (paymentGateway !== undefined) {
    receipt.paymentGateway = parsePaymentGateway(paymentGateway);
  }
  if (paymentMethod !== undefined) {
    receipt.paymentMethod = parsePaymentMethod(paymentMethod);
  }
  return receipt;
}

/** Validate that a decoded challenge is usable and not expired. */
export function validateChallenge(challenge: Challenge): void {
  if (!challenge.id) {
    throw new P3PChallengeError("Challenge missing id", "");
  }
  if (!challenge.request?.amount || !challenge.request.currency) {
    throw new P3PChallengeError("Challenge missing payment request details", challenge.id);
  }
  if (!challenge.request.availablePaymentMethods.length) {
    throw new P3PChallengeError("Challenge missing available payment methods", challenge.id);
  }
  const expiresMs = Date.parse(challenge.expires);
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    throw new P3PChallengeError("Challenge has expired", challenge.id);
  }
}

/** Return the challenge amount in paise for token creation. */
export function extractAmountPaise(challenge: Challenge): number {
  const majorUnits = Number(challenge.request.amount);
  if (!Number.isFinite(majorUnits) || majorUnits <= 0) {
    throw new P3PChallengeError(`Invalid challenge amount: ${challenge.request.amount}`, challenge.id);
  }
  return Math.round(majorUnits * 100);
}

function extractBase64Payload(header: string): string | undefined {
  const trimmed = header.trim();
  const payload = trimmed.startsWith(PAYMENT_HEADER_PREFIX)
    ? trimmed.slice(PAYMENT_HEADER_PREFIX.length).trim()
    : trimmed;
  return isBase64Url(payload) ? payload : undefined;
}

function dictToChallenge(raw: unknown): Challenge {
  const record = asRecord(raw) ?? {};
  const req = asRecord(record.request) ?? {};
  return {
    id: String(record.id ?? ""),
    realm: String(record.realm ?? ""),
    intent: String(record.intent ?? ""),
    request: {
      scheme: String(req.scheme ?? ""),
      amount: String(req.amount ?? ""),
      currency: String(req.currency ?? ""),
      resource: String(req.resource ?? ""),
      availablePaymentMethods: parsePaymentMethods(req.availablePaymentMethods ?? req.available_payment_methods),
    } satisfies ChallengeRequest,
    expires: String(record.expires ?? ""),
  };
}

export function selectPaymentMethod(challenge: Challenge, selectedPaymentMethod: PaymentMethod): PaymentMethod {
  if (!challenge.request.availablePaymentMethods.includes(selectedPaymentMethod)) {
    throw new P3PChallengeError(
      `Selected payment method ${selectedPaymentMethod} is not accepted by this server challenge`,
      challenge.id,
    );
  }
  return selectedPaymentMethod;
}

function parsePaymentGateway(value: unknown): PaymentGateway | undefined {
  return value === undefined || value === null ? undefined : String(value) as PaymentGateway;
}

function parsePaymentMethod(value: unknown): PaymentMethod {
  if (value === PaymentMethod.RESERVE_PAY || value === PaymentMethod.CARD || value === PaymentMethod.CREDIT_EMI || value === PaymentMethod.Crypto) {
    return value;
  }
  if (value === PaymentMethod.OTM) {
    return PaymentMethod.OTM;
  }
  return String(value ?? "") as PaymentMethod;
}

function parsePaymentMethods(value: unknown): PaymentMethod[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(parsePaymentMethod);
}

function challengePayload(challenge: Challenge): Challenge {
  return {
    id: challenge.id,
    realm: challenge.realm,
    intent: challenge.intent,
    request: challenge.request,
    expires: challenge.expires,
  };
}
