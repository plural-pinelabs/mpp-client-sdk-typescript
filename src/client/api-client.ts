import {
  Amount,
  CreateTokenOptions,
  FetchLike,
  P3PCustomerAuthMode,
  P3PError,
  PineLabsOnlineClientConfig,
  Token,
} from "../types";
import { P3PEnvironment } from "../config";
import { requestWithRetry, safeJson } from "../utils/http";
import { asRecord, parseToken } from "../utils/parsers";
import { resolveCustomerAuthMode, validateCreateTokenOptions } from "../utils/validation";
import { AuthManager } from "./auth-manager";

const CUSTOMER_TOKEN_PATH = "/api/v1/customer/mpp/token";
const CUSTOMER_TOKEN_SANDBOX_BASE_URL = "https://api-staging.pluralonline.com";
const CUSTOMER_TOKEN_PRODUCTION_BASE_URL = "https://api.pluralonline.com";
const CENTRAL_TOKEN_PATH = "/mpp/v1/token";

export class ApiClient {
  constructor(
    private config: PineLabsOnlineClientConfig,
    private baseUrl: string,
    private fetchImpl: FetchLike,
    private auth: AuthManager,
  ) {}

  /** Create a one-time payment token for an active authorization. */
  async createToken(options: CreateTokenOptions): Promise<Token> {
    const customerAuthMode = resolveCustomerAuthMode(this.config);
    const tokenOptions = {
      ...options,
    };
    validateCreateTokenOptions(tokenOptions, customerAuthMode);
    const customerReference = tokenOptions.customerReference ?? tokenOptions.customerId ?? "";
    const mobileNumber = tokenOptions.mobileNumber ?? "";
    const paymentAmount = tokenOptions.paymentAmount ?? {
      value: tokenOptions.usageLimits!.maxAmount,
      currency: tokenOptions.usageLimits!.currency,
    };
    const body: Record<string, unknown> = {
      payment_method: tokenOptions.paymentMethod ?? this.config.selectedPaymentMethod,
      customer: customerPayload(customerReference, mobileNumber, customerAuthMode),
      challenge_id: tokenOptions.challengeId,
      payment_amount: amountPayload(paymentAmount),
    };
    const data = await this.request(
      "POST",
      customerAuthMode === P3PCustomerAuthMode.CustomerKey ? CUSTOMER_TOKEN_PATH : CENTRAL_TOKEN_PATH,
      body,
      await this.authHeaders(customerAuthMode, tokenOptions.customerKey),
      customerAuthMode === P3PCustomerAuthMode.CustomerKey
        ? resolveCustomerTokenBaseUrl(this.baseUrl)
        : this.baseUrl,
    );
    return parseToken(data);
  }

  private async authHeaders(customerAuthMode: P3PCustomerAuthMode, customerKey: string | undefined): Promise<Record<string, string>> {
    const token = await this.auth.getAccessToken();
    if (!token) {
      throw new P3PError("P3P_AUTHENTICATION_FAILED", "Auth manager is not configured", 500);
    }
    return {
      Authorization: `Bearer ${token}`,
      ...(customerAuthMode === P3PCustomerAuthMode.CustomerKey ? customerKeyHeader(customerKey) : {}),
    };
  }

  /** P3P request wrapper that unwraps `{ data: ... }` envelopes. */
  private async request(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
    baseUrl = this.baseUrl,
  ): Promise<unknown> {
    const response = await requestWithRetry(this.fetchImpl, buildUrl(baseUrl, path), {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined && method !== "GET" ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      },
      body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
    }, this.config);

    if (!response.ok) {
      throw P3PError.fromResponse(response.status, await safeJson(response));
    }
    const payload = await response.json();
    const record = asRecord(payload);
    return record && "data" in record ? record.data : payload;
  }
}

function stripSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function buildUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${stripSlash(baseUrl)}${normalizedPath}`;
}

function resolveCustomerTokenBaseUrl(baseUrl: string): string {
  return stripSlash(baseUrl) === P3PEnvironment.SANDBOX
    ? CUSTOMER_TOKEN_SANDBOX_BASE_URL
    : CUSTOMER_TOKEN_PRODUCTION_BASE_URL;
}

function customerPayload(customerReference: string, mobileNumber: string, customerAuthMode: P3PCustomerAuthMode): Record<string, string> {
  if (customerAuthMode === P3PCustomerAuthMode.CustomerKey) {
    return { mobile_number: mobileNumber };
  }
  return {
    ...(customerReference ? { merchant_customer_reference: customerReference } : {}),
    ...(mobileNumber ? { mobile_number: mobileNumber } : {}),
  };
}

function amountPayload(amount: Amount): Record<string, unknown> {
  return { value: amount.value, currency: amount.currency };
}

function customerKeyHeader(customerKey: string | undefined): Record<string, string> {
  const value = customerKey?.trim();
  return value ? { "X-Customer-Key": value } : {};
}
