import type { P3PEnvironmentValue } from "../config";
/** Fetch-compatible function used by the SDK; pass this to run in tests, workers, or custom runtimes. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export declare const PAYMENT_CREDENTIAL_HEADER = "P3P-Credential";
export declare const PAYMENT_HEADER_PREFIX = "Payment ";
/** Payment gateway used by seller challenges and buyer credentials. */
export declare enum PaymentGateway {
    PineLabsOnline = "PINE LABS ONLINE"
}
/** Payment methods supported by the current P3P service payload contract. */
export declare enum PaymentMethod {
    UpiSbmd = "SBMD",
    Crypto = "CRYPTO"
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
/** Money amount expressed in the smallest unit for the currency, e.g. paise for INR. */
export interface Amount {
    /** Amount in the smallest unit for the currency, e.g. paise for INR. */
    value: number;
    /** ISO-style currency code expected by P3P, e.g. `INR` or `PATHUSD`. */
    currency: string;
}
/** Payment request embedded in a seller 402 challenge. */
export interface ChallengeRequest {
    scheme: string;
    amount: string;
    currency: string;
    resource: string;
    availablePaymentMethods: PaymentMethod[];
}
/** Decoded seller challenge from `WWW-Authenticate: Payment <payload>`. */
export interface Challenge {
    id: string;
    realm: string;
    paymentGateway: PaymentGateway;
    intent: string;
    request: ChallengeRequest;
    expires: string;
}
/** Buyer payment credential payload sent back to the seller. */
export interface CredentialPayload {
    type: "token";
    token: string;
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
/** Settlement amount encoded in a seller `Payment-Receipt` header. */
export interface Settlement {
    amount: string;
    currency: string;
}
/** Decoded `Payment-Receipt` data returned after seller capture succeeds. */
export interface Receipt {
    status: "success" | "failure";
    paymentGateway?: PaymentGateway;
    paymentMethod?: PaymentMethod;
    timestamp: string;
    reference: string;
    challengeId: string;
    settlement: Settlement;
}
/** Optional defaults used when the buyer SDK creates payment tokens automatically. */
export interface TokenDefaults {
    /** Optional legacy maximum charge count retained for constructor compatibility. */
    maxCharges?: number;
    /** Optional legacy token TTL retained for constructor compatibility; not sent to current `/token`. */
    ttlSeconds?: number;
}
/** Configuration required to construct a buyer SDK instance. */
export interface PluralBuyerConfig {
    /** Payment gateway this buyer is willing to use for seller challenges. */
    paymentGateway: PaymentGateway;
    /** Selected payment method for this buyer instance. */
    selectedPaymentMethod: PaymentMethod;
    /** Plural P3P environment used for P3P service calls. Defaults to production when omitted at runtime. */
    env?: P3PEnvironmentValue;
    /** Set false to return seller 402 responses without automatic token creation and retry. */
    autoHandlePayment?: boolean;
    /** Callback invoked after a seller Payment challenge is decoded. */
    onChallenge?: (challenge: Challenge) => void | Promise<void>;
    /** Callback invoked with a decoded `Payment-Receipt` after a successful paid retry. */
    onPaymentComplete?: (receipt: Receipt) => void | Promise<void>;
    /** Legacy defaults retained for compatibility; current `/token` does not require them. */
    tokenDefaults?: TokenDefaults;
    /** Per-request timeout in milliseconds. Defaults to 30000. */
    requestTimeoutMs?: number;
    /** Number of retries for network errors, HTTP 429, and 5xx responses. Defaults to 3. */
    maxRetries?: number;
    /** Initial exponential-backoff retry delay in milliseconds. Defaults to 500. */
    initialRetryDelayMs?: number;
    /** Optional logger for request, retry, and payment diagnostics. */
    logger?: P3PLogger;
    /** Custom fetch implementation for tests or non-standard runtimes. */
    fetch?: FetchLike;
}
/** Per-request customer context for shared buyer instances serving many customers. */
export interface BuyerRuntimeContext {
    /** Customer key sent as `X-Customer-Key` on token calls. */
    customerKey?: string | null;
    /** Customer reference sent to the customer token endpoint and embedded in Payment credentials. */
    customerReference?: string | null;
    /** Mobile number sent as `customer.mobile_number` to the customer token endpoint. */
    mobileNumber?: string | null;
}
/** Legacy token-limit shape kept for backwards-compatible constructors. */
export interface CreateTokenUsageLimits {
    maxAmount: number;
    currency: string;
    expiresAt: string;
    maxCharges?: number;
}
/** Input for `buyer.methods.createToken`, mapped to `POST /api/v1/customer/mpp/token`. */
export interface CreateTokenOptions {
    /** Legacy usage-limit object retained for compatibility; not sent to current `/token`. */
    usageLimits?: CreateTokenUsageLimits;
    /** Customer reference used to find the active authorization for token creation. */
    customerReference?: string;
    /** Legacy alias used when `customerReference` is absent. */
    customerId?: string;
    /** Buyer mobile number sent as `customer.mobile_number` to the customer token endpoint. */
    mobileNumber?: string;
    /** Seller challenge id sent as `challenge_id` to the customer token endpoint. */
    challengeId?: string;
    /** Payment amount sent as `payment_amount` to the customer token endpoint, in minor units. */
    paymentAmount?: Amount;
    /** Optional caller metadata retained for compatibility; not sent to current `/token`. */
    metadata?: Record<string, string>;
    /** P3P payment method sent as the token payload `type`. */
    paymentMethod?: PaymentMethod;
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
    hold: {
        amount: number;
        status: string;
        expires_at: string;
    };
    usage_limits: {
        max_amount: number;
        currency: string;
        expires_at: string;
        max_charges?: number;
    };
    usage: {
        amount_used: number;
        charges_made: number;
    };
    expires_in: number;
    metadata?: Record<string, unknown>;
    created_at: string;
    raw: Record<string, unknown>;
}
/** Error type raised for non-2xx P3P service responses. */
export declare class P3PError extends Error {
    code: string;
    httpStatus: number;
    details?: Record<string, unknown> | undefined;
    constructor(code: string, message: string, httpStatus: number, details?: Record<string, unknown> | undefined);
    static fromResponse(status: number, body: unknown): P3PError;
    toJSON(): Record<string, unknown>;
}
export declare class P3PNetworkError extends Error {
    cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
/** Error type raised when a seller challenge is missing, expired, or malformed. */
export declare class P3PChallengeError extends Error {
    challengeId: string;
    constructor(message: string, challengeId: string);
}
