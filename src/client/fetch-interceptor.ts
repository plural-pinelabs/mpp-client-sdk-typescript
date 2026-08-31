import { ClientRuntimeContext, Challenge, Credential, FetchLike, GRANTEX_TOKEN_HEADER, P3PCustomerAuthMode, PAYMENT_CREDENTIAL_HEADER, PaymentMethod, PineLabsOnlineClientConfig } from "../types";
import { P3PEnvironment } from "../config";
import { GrantTokenVerifier } from "../grantex";
import { normalizeHeaders } from "../utils/http";
import { isSupportedPaymentMethod, resolveCustomerAuthMode, unsupportedPaymentMethodError } from "../utils/validation";
import {
  buildCredential,
  decodeChallenge,
  decodeReceipt,
  encodeCredentialHeader,
  extractAmountPaise,
  selectPaymentMethod,
} from "./credential-builder";
import { ApiClient } from "./api-client";

export class FetchInterceptor {
  constructor(
    private config: PineLabsOnlineClientConfig,
    private api: ApiClient,
    private fetchImpl: FetchLike,
  ) {}

  /** Send an HTTP request and automatically handle server P3P 402 challenges. */
  async request(method: string, url: string, init: RequestInit = {}, context?: ClientRuntimeContext): Promise<Response> {
    assertSecureResourceUrl(url, this.config.env);
    const headers = normalizeHeaders(init.headers);
    attachGrantexHeader(headers, resolveGrantexToken(this.config, context));
    const response = await this.fetchImpl(url, { ...init, method, headers });
    if (response.status !== 402 || this.config.autoHandlePayment === false) {
      return response;
    }
    const wwwAuth = response.headers.get("WWW-Authenticate");
    if (!wwwAuth?.startsWith("Payment ")) {
      return response;
    }
    return this.handle402(method, url, init, wwwAuth, context);
  }

  /** Create a one-time P3P token and wrap it in a Payment credential. */
  async createCredentialForChallenge(challenge: Challenge, context?: ClientRuntimeContext): Promise<Credential> {
    const customerContext = resolveCustomerContext(context, resolveCustomerAuthMode(this.config));
    await this.verifyGrantexForPayment(context);
    const paymentMethod = selectPaymentMethod(challenge, customerContext.paymentMethod);
    const token = await this.api.createToken({
      customerKey: customerContext.customerKey,
      mobileNumber: customerContext.mobileNumber,
      challengeId: challenge.id,
      paymentAmount: { value: extractAmountPaise(challenge), currency: challenge.request.currency },
      paymentMethod,
      paymentMethodReferenceId: customerContext.paymentMethodReferenceId,
    });
    return buildCredential(
      challenge,
      customerContext.credentialSource,
      token.token,
      paymentMethod,
      customerContext.mobileNumber,
      token.mandate_id || customerContext.paymentMethodReferenceId,
    );
  }

  private async verifyGrantexForPayment(context?: ClientRuntimeContext): Promise<void> {
    if (!this.config.grantex) {
      return;
    }
    const token = resolveGrantexToken(this.config, context);
    if (!token) {
      if (this.config.grantex.enforceGrant) {
        throw new Error(`ClientGrantexConfig: ${GRANTEX_TOKEN_HEADER} grant token is required`);
      }
      return;
    }
    if (!this.config.grantex.verifier && !this.config.grantex.jwksUri && !this.config.grantex.jwksUrl) {
      if (!this.config.grantex.enforceGrant) {
        return; // No verifier configured and not enforcing — skip client-side verification
      }
      // enforceGrant=true + no explicit verifier → GrantTokenVerifier uses default Grantex JWKS
    }
    const result = await new GrantTokenVerifier(this.config.grantex).verify(token);
    if (!result.valid) {
      this.config.logger?.error("Grantex grant verification failed", { error: result.error });
      if (this.config.grantex.enforceGrant) {
        throw new Error(result.error ?? "Grantex grant verification failed");
      }
    }
  }

  private async handle402(method: string, url: string, init: RequestInit, wwwAuth: string, context?: ClientRuntimeContext): Promise<Response> {
    const challenge = decodeChallenge(wwwAuth);
    await this.config.onChallenge?.(challenge);

    const retryHeaders = normalizeHeaders(init.headers);
    attachGrantexHeader(retryHeaders, resolveGrantexToken(this.config, context));
    retryHeaders[PAYMENT_CREDENTIAL_HEADER] = encodeCredentialHeader(await this.createCredentialForChallenge(challenge, context));

    const retryResponse = await this.fetchImpl(url, { ...init, method, headers: retryHeaders });
    if (retryResponse.ok) {
      const receiptHeader = retryResponse.headers.get("Payment-Receipt");
      if (receiptHeader) {
        try {
          await this.config.onPaymentComplete?.(decodeReceipt(receiptHeader));
        } catch {
          // Receipt callback failures are non-fatal.
        }
      }
    }
    return retryResponse;
  }
}

function resolveGrantexToken(config: PineLabsOnlineClientConfig, context?: ClientRuntimeContext): string | undefined {
  const value = context?.grantexToken ?? config.grantex?.grantToken;
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function attachGrantexHeader(headers: Record<string, string>, token: string | undefined): void {
  if (!token) {
    return;
  }
  const existingKey = Object.keys(headers).find((key) => key.toLowerCase() === GRANTEX_TOKEN_HEADER.toLowerCase());
  headers[existingKey ?? GRANTEX_TOKEN_HEADER] = token;
}

interface ResolvedClientRuntimeContext {
  customerKey?: string;
  mobileNumber?: string;
  paymentMethod: PaymentMethod;
  paymentMethodReferenceId?: string;
  credentialSource: string;
}

function resolveCustomerContext(context: ClientRuntimeContext | undefined, customerAuthMode: P3PCustomerAuthMode): ResolvedClientRuntimeContext {
  const customerKey = requiredText(context?.customerKey);
  const mobileNumber = requiredText(context?.mobileNumber);
  const paymentMethod = context?.paymentMethod;
  const paymentMethodReferenceId = requiredText(context?.paymentMethodReferenceId);
  if (paymentMethod === undefined || paymentMethod === null) {
    throw new Error("ClientRuntimeContext: paymentMethod is required");
  }
  if (!isSupportedPaymentMethod(paymentMethod)) {
    throw unsupportedPaymentMethodError("ClientRuntimeContext: paymentMethod", paymentMethod);
  }
  if (customerAuthMode === P3PCustomerAuthMode.CustomerKey) {
    if (!customerKey || !mobileNumber) {
      throw new Error("ClientRuntimeContext: customerKey and mobileNumber are required when customerAuthMode is CUSTOMER_KEY");
    }
    return {
      customerKey,
      mobileNumber,
      paymentMethod,
      paymentMethodReferenceId,
      credentialSource: mobileNumber,
    };
  }
  if (!mobileNumber) {
    throw new Error("ClientRuntimeContext: mobileNumber is required when customerAuthMode is CLIENT_CREDENTIALS");
  }
  return {
    mobileNumber,
    paymentMethod,
    paymentMethodReferenceId,
    credentialSource: mobileNumber,
  };
}

function requiredText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function assertSecureResourceUrl(url: string, env: string | undefined): void {
  if (env !== P3PEnvironment.PRODUCTION) {
    return;
  }
  const lower = url.toLowerCase();
  if (!lower.startsWith("https://") && !isLocalhostUrl(url)) {
    throw new Error(`P3P credentials must not be sent over plain HTTP in production. Use HTTPS: ${url}`);
  }
}

function isLocalhostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "host.docker.internal" || !hostname.includes(".");
  } catch {
    return false;
  }
}
