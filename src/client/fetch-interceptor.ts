import { ClientRuntimeContext, Challenge, Credential, FetchLike, P3PCustomerAuthMode, PAYMENT_CREDENTIAL_HEADER, PineLabsOnlineClientConfig } from "../types";
import { normalizeHeaders } from "../utils/http";
import { resolveCustomerAuthMode } from "../utils/validation";
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
    const response = await this.fetchImpl(url, { ...init, method, headers: normalizeHeaders(init.headers) });
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
    const paymentMethod = selectPaymentMethod(challenge, this.config.selectedPaymentMethod);
    const customerContext = resolveCustomerContext(context, resolveCustomerAuthMode(this.config));
    const token = await this.api.createToken({
      customerKey: customerContext.customerKey,
      customerReference: customerContext.customerReference,
      mobileNumber: customerContext.mobileNumber,
      challengeId: challenge.id,
      paymentAmount: { value: extractAmountPaise(challenge), currency: challenge.request.currency },
      paymentMethod,
    });
    return buildCredential(
      challenge,
      customerContext.credentialSource,
      token.token,
      paymentMethod,
      customerContext.customerReference,
      customerContext.mobileNumber,
    );
  }

  private async handle402(method: string, url: string, init: RequestInit, wwwAuth: string, context?: ClientRuntimeContext): Promise<Response> {
    const challenge = decodeChallenge(wwwAuth);
    await this.config.onChallenge?.(challenge);

    const retryHeaders = normalizeHeaders(init.headers);
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

interface ResolvedClientRuntimeContext {
  customerKey?: string;
  customerReference?: string;
  mobileNumber?: string;
  credentialSource: string;
}

function resolveCustomerContext(context: ClientRuntimeContext | undefined, customerAuthMode: P3PCustomerAuthMode): ResolvedClientRuntimeContext {
  const customerKey = requiredText(context?.customerKey);
  const customerReference = requiredText(context?.customerReference);
  const mobileNumber = requiredText(context?.mobileNumber);
  if (customerAuthMode === P3PCustomerAuthMode.CustomerKey) {
    if (!customerKey || !mobileNumber) {
      throw new Error("ClientRuntimeContext: customerKey and mobileNumber are required when customerAuthMode is CUSTOMER_KEY");
    }
    return {
      customerKey,
      customerReference,
      mobileNumber,
      credentialSource: customerReference ?? mobileNumber,
    };
  }
  if (!customerReference && !mobileNumber) {
    throw new Error("ClientRuntimeContext: customerReference or mobileNumber is required when customerAuthMode is CLIENT_CREDENTIALS");
  }
  return {
    customerReference,
    mobileNumber,
    credentialSource: customerReference ?? mobileNumber!,
  };
}

function requiredText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
