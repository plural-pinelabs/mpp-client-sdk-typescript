import type { P3PEnvironmentValue } from "../config";

/** Fetch-compatible function used by the SDK; pass this to run in tests, workers, or custom runtimes. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const PAYMENT_CREDENTIAL_HEADER = "P3P-Credential";
export const PAYMENT_HEADER_PREFIX = "Payment ";
export const GRANTEX_TOKEN_HEADER = "X-Grantex-Token";

/** Payment gateway enum retained for receipt/config context. */
export enum PaymentGateway {
  PineLabsOnline = "PINE LABS ONLINE",
}

/** Payment methods supported by the current P3P service payload contract. */
export enum PaymentMethod {
  RESERVE_PAY = "RESERVE_PAY",
  OTM = "OTM",
  CARD = "CARD",
  CREDIT_EMI = "CREDIT_EMI",
  Crypto = "CRYPTO",
}

/** Customer authorization mode used when the client SDK creates P3P payment tokens. */
export enum P3PCustomerAuthMode {
  CustomerKey = "CUSTOMER_KEY",
  ClientCredentials = "CLIENT_CREDENTIALS",
}

/** Logger interface used by SDK internals for retry and payment diagnostics. */
export interface P3PLogger {
  /** Low-volume diagnostic event, usually before a request or decision. */
  debug(message: string, context?: Record<string, unknown>): void;
  /** Informational event such as retries and successful responses. */
  info(message: string, context?: Record<string, unknown>): void;
  /** Error event for failed network, challenge, or payment operations. */
  error(message: string, context?: Record<string, unknown>): void;
}

/** Normalized Grantex grant returned after delegated authorization verification. */
export interface GrantexVerifiedGrant {
  tokenId: string;
  grantId: string;
  principalId: string;
  agentDid: string;
  developerId: string;
  scopes: string[];
  issuedAt: number;
  expiresAt: number;
  parentAgentDid?: string;
  parentGrantId?: string;
  delegationDepth?: number;
}

export interface GrantexVerificationResult {
  valid: boolean;
  grant?: GrantexVerifiedGrant;
  error?: string;
}

export interface GrantexVerifierLike {
  verify(token: string): Promise<GrantexVerificationResult>;
}

export interface ClientGrantexConfig {
  /** Grant token to forward as `X-Grantex-Token`. Can be overridden per request. */
  grantToken?: string | null;
  /**
   * Base URL of your Grantex instance, e.g. `https://my-grantex.company.com`.
   * JWKS is auto-derived by appending `/.well-known/jwks.json`.
   * Defaults to `https://api.grantex.dev` when not set.
   */
  baseUrl?: string;
  /** Override the full Grantex JWKS URL. Takes precedence over `baseUrl`. Alias: `jwksUrl`. */
  jwksUri?: string;
  /** Compatibility alias for `jwksUri`. */
  jwksUrl?: string;
  /** Required scopes. Wildcards such as `mpp:*` and `mpp:payment:*` are honored. */
  requiredScopes?: string[];
  /** Expected issuer URL passed through to Grantex verification. */
  issuer?: string;
  /** DID-web issuer shortcut supported by the published Grantex SDK. */
  issuerDid?: string;
  /** Optional JWT audience. */
  audience?: string;
  /** Optional expected agent DID; must match the grant `agt` claim. */
  agentId?: string;
  /** Optional clock tolerance in seconds. */
  clockTolerance?: number;
  /** When true, missing/invalid grants fail before token creation. Defaults to false. */
  enforceGrant?: boolean;
  /** Test/advanced hook; defaults to the published `@grantex/sdk` verifier when JWKS is configured. */
  verifier?: GrantexVerifierLike;
}

/** Money amount expressed in the smallest unit for the currency, e.g. paise for INR. */
export interface Amount {
  /** Amount in the smallest unit for the currency, e.g. paise for INR. */
  value: number;
  /** ISO-style currency code expected by P3P, e.g. `INR` or `PATHUSD`. */
  currency: string;
}

/** Payment request embedded in a server 402 challenge. */
export interface ChallengeRequest {
  scheme: string;
  amount: string;
  currency: string;
  resource: string;
  availablePaymentMethods: PaymentMethod[];
}

/** Decoded server challenge from `WWW-Authenticate: Payment <payload>`. */
export interface Challenge {
  id: string;
  realm: string;
  intent: string;
  request: ChallengeRequest;
  expires: string;
}

/** Client payment credential payload sent back to the server. */
export interface CredentialPayload {
  type: "token";
  token: string;
  payment_method_reference_id?: string;
  customer_reference?: string;
  mobile_number?: string;
  payment_method: PaymentMethod;
}

/** Payment credential sent as `P3P-Credential: Payment <payload>`. */
export interface Credential {
  challenge: Challenge;
  source: string;
  payload: CredentialPayload;
}

/** Settlement amount encoded in a server `Payment-Receipt` header. */
export interface Settlement {
  amount: string;
  currency: string;
}

/** Decoded `Payment-Receipt` data returned after server capture succeeds. */
export interface Receipt {
  status: "success" | "failure";
  paymentGateway?: PaymentGateway;
  paymentMethod?: PaymentMethod;
  timestamp: string;
  reference: string;
  challengeId: string;
  settlement: Settlement;
}

/** Optional defaults used when the client SDK creates payment tokens automatically. */
export interface TokenDefaults {
  /** Optional legacy maximum charge count retained for constructor compatibility. */
  maxCharges?: number;
  /** Optional legacy token TTL retained for constructor compatibility; not sent to current `/token`. */
  ttlSeconds?: number;
}

/** Configuration required to construct a client SDK instance. */
export interface PineLabsOnlineClientConfig {
  /** Pine Labs Online P3P environment used for P3P service calls. Defaults to production when omitted at runtime. */
  env?: P3PEnvironmentValue;
  /** Customer authorization mode for token creation. Defaults to `CLIENT_CREDENTIALS`. */
  customerAuthMode?: P3PCustomerAuthMode;
  /** Client id used for customer auth token exchange in all modes. */
  clientId: string;
  /** Client secret used for customer auth token exchange in all modes. */
  clientSecret: string;
  /** Set false to return server 402 responses without automatic token creation and retry. */
  autoHandlePayment?: boolean;
  /** Callback invoked after a server Payment challenge is decoded. */
  onChallenge?: (challenge: Challenge) => void | Promise<void>;
  /** Callback invoked with a decoded `Payment-Receipt` after a successful paid retry. */
  onPaymentComplete?: (receipt: Receipt) => void | Promise<void>;
  /** Legacy defaults retained for compatibility; current `/token` does not require them. */
  tokenDefaults?: TokenDefaults;
  /** Per-request timeout in milliseconds. Defaults to 60000 in sandbox and 45000 in production. */
  requestTimeoutMs?: number;
  /** Number of retries for network errors, HTTP 429, and 5xx responses. Defaults to 3. */
  maxRetries?: number;
  /** Initial exponential-backoff retry delay in milliseconds. Defaults to 500. */
  initialRetryDelayMs?: number;
  /** Optional logger for request, retry, and payment diagnostics. */
  logger?: P3PLogger;
  /** Custom fetch implementation for tests or non-standard runtimes. */
  fetch?: FetchLike;
  /** Optional delegated authorization token forwarding and verification. */
  grantex?: ClientGrantexConfig;
}

/** Per-request customer context for shared client instances serving many customers. */
export interface ClientRuntimeContext {
  /** Customer key sent as `X-Customer-Key` on token calls. */
  customerKey?: string | null;
  /** Legacy customer reference retained for compatibility; current token and debit flows use `mobileNumber`. */
  customerReference?: string | null;
  /** Mobile number sent as `customer.mobile_number` to the customer token endpoint. */
  mobileNumber?: string | null;
  /** Payment method selected for this request's automatic 402 token creation. */
  paymentMethod: PaymentMethod;
  /** Active mandate/pre-authorization reference forwarded through token creation and the payment credential. */
  paymentMethodReferenceId?: string | null;
  /** Per-request Grantex token override forwarded as `X-Grantex-Token`. */
  grantexToken?: string | null;
}

/** Legacy token-limit shape kept for backwards-compatible constructors. */
export interface CreateTokenUsageLimits {
  maxAmount: number;
  currency: string;
  expiresAt: string;
  maxCharges?: number;
}

/** Input for `client.methods.createToken`, mapped to `POST /api/v1/customer/mpp/token`. */
export interface CreateTokenOptions {
  /** Legacy usage-limit object retained for compatibility; not sent to current `/token`. */
  usageLimits?: CreateTokenUsageLimits;
  /** Legacy customer reference retained for compatibility; current token flow uses `mobileNumber`. */
  customerReference?: string;
  /** Legacy alias used when `customerReference` is absent. */
  customerId?: string;
  /** Client mobile number sent as `customer.mobile_number` to the customer token endpoint. */
  mobileNumber?: string;
  /** Server challenge id sent as `challenge_id` to the customer token endpoint. */
  challengeId?: string;
  /** Payment amount sent as `payment_amount` to the customer token endpoint, in minor units. */
  paymentAmount?: Amount;
  /** Optional caller metadata retained for compatibility; not sent to current `/token`. */
  metadata?: Record<string, string>;
  /** P3P payment method sent as the token payload `type`. */
  paymentMethod: PaymentMethod;
  /** Active mandate/pre-authorization reference, sent as `payment_method_reference_id` when provided. */
  paymentMethodReferenceId?: string;
  /** Per-call customer key sent as `X-Customer-Key`. */
  customerKey?: string;
}

/** Normalized one-time P3P payment token response. */
export interface Token {
  token_id: string;
  object: string;
  customer_reference: string;
  customer_id: string;
  mobile_number?: string;
  mandate_id: string;
  token: string;
  payment_method?: PaymentMethod;
  payment_amount?: Amount;
  challenge_id?: string;
  hold: { amount: number; status: string; expires_at: string };
  usage_limits: { max_amount: number; currency: string; expires_at: string; max_charges?: number };
  usage: { amount_used: number; charges_made: number };
  expires_in: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  raw: Record<string, unknown>;
}

/** Error type raised for non-2xx P3P service responses. */
export class P3PError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "P3PError";
  }

  static fromResponse(status: number, body: unknown): P3PError {
    const record = asRecord(body) ?? {};
    if (typeof record.error === "string") {
      return new P3PError(
        String(record.code ?? "MPP_ERROR"),
        record.error,
        status,
        asRecord(record.additional_error_details),
      );
    }
    const error = asRecord(record.error) ?? record;
    return new P3PError(
      String(error.code ?? "MPP_INTERNAL_ERROR"),
      String(error.message ?? `HTTP ${status}`),
      status,
      asRecord(error.additional_error_details),
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        additional_error_details: this.details,
      },
    };
  }
}

export class P3PNetworkError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "P3PNetworkError";
  }
}

/** Error type raised when a server challenge is missing, expired, or malformed. */
export class P3PChallengeError extends Error {
  constructor(message: string, public challengeId: string) {
    super(message);
    this.name = "P3PChallengeError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
