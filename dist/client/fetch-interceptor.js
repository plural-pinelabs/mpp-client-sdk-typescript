"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FetchInterceptor = void 0;
const types_1 = require("../types");
const config_1 = require("../config");
const grantex_1 = require("../grantex");
const http_1 = require("../utils/http");
const validation_1 = require("../utils/validation");
const credential_builder_1 = require("./credential-builder");
class FetchInterceptor {
    config;
    api;
    fetchImpl;
    constructor(config, api, fetchImpl) {
        this.config = config;
        this.api = api;
        this.fetchImpl = fetchImpl;
    }
    /** Send an HTTP request and automatically handle server P3P 402 challenges. */
    async request(method, url, init = {}, context) {
        assertSecureResourceUrl(url, this.config.env);
        const headers = (0, http_1.normalizeHeaders)(init.headers);
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
    async createCredentialForChallenge(challenge, context) {
        const customerContext = resolveCustomerContext(context, (0, validation_1.resolveCustomerAuthMode)(this.config));
        await this.verifyGrantexForPayment(context);
        const paymentMethod = (0, credential_builder_1.selectPaymentMethod)(challenge, customerContext.paymentMethod);
        const token = await this.api.createToken({
            customerKey: customerContext.customerKey,
            mobileNumber: customerContext.mobileNumber,
            challengeId: challenge.id,
            paymentAmount: { value: (0, credential_builder_1.extractAmountPaise)(challenge), currency: challenge.request.currency },
            paymentMethod,
            paymentMethodReferenceId: customerContext.paymentMethodReferenceId,
        });
        return (0, credential_builder_1.buildCredential)(challenge, customerContext.credentialSource, token.token, paymentMethod, customerContext.mobileNumber, token.mandate_id || customerContext.paymentMethodReferenceId);
    }
    async verifyGrantexForPayment(context) {
        if (!this.config.grantex) {
            return;
        }
        const token = resolveGrantexToken(this.config, context);
        if (!token) {
            if (this.config.grantex.enforceGrant) {
                throw new Error(`ClientGrantexConfig: ${types_1.GRANTEX_TOKEN_HEADER} grant token is required`);
            }
            return;
        }
        if (!this.config.grantex.verifier && !this.config.grantex.jwksUri && !this.config.grantex.jwksUrl) {
            if (!this.config.grantex.enforceGrant) {
                return; // No verifier configured and not enforcing — skip client-side verification
            }
            // enforceGrant=true + no explicit verifier → GrantTokenVerifier uses default Grantex JWKS
        }
        const result = await new grantex_1.GrantTokenVerifier(this.config.grantex).verify(token);
        if (!result.valid) {
            this.config.logger?.error("Grantex grant verification failed", { error: result.error });
            if (this.config.grantex.enforceGrant) {
                throw new Error(result.error ?? "Grantex grant verification failed");
            }
        }
    }
    async handle402(method, url, init, wwwAuth, context) {
        const challenge = (0, credential_builder_1.decodeChallenge)(wwwAuth);
        await this.config.onChallenge?.(challenge);
        const retryHeaders = (0, http_1.normalizeHeaders)(init.headers);
        attachGrantexHeader(retryHeaders, resolveGrantexToken(this.config, context));
        retryHeaders[types_1.PAYMENT_CREDENTIAL_HEADER] = (0, credential_builder_1.encodeCredentialHeader)(await this.createCredentialForChallenge(challenge, context));
        const retryResponse = await this.fetchImpl(url, { ...init, method, headers: retryHeaders });
        if (retryResponse.ok) {
            const receiptHeader = retryResponse.headers.get("Payment-Receipt");
            if (receiptHeader) {
                try {
                    await this.config.onPaymentComplete?.((0, credential_builder_1.decodeReceipt)(receiptHeader));
                }
                catch {
                    // Receipt callback failures are non-fatal.
                }
            }
        }
        return retryResponse;
    }
}
exports.FetchInterceptor = FetchInterceptor;
function resolveGrantexToken(config, context) {
    const value = context?.grantexToken ?? config.grantex?.grantToken;
    const trimmed = value?.trim();
    return trimmed || undefined;
}
function attachGrantexHeader(headers, token) {
    if (!token) {
        return;
    }
    const existingKey = Object.keys(headers).find((key) => key.toLowerCase() === types_1.GRANTEX_TOKEN_HEADER.toLowerCase());
    headers[existingKey ?? types_1.GRANTEX_TOKEN_HEADER] = token;
}
function resolveCustomerContext(context, customerAuthMode) {
    const customerKey = requiredText(context?.customerKey);
    const mobileNumber = requiredText(context?.mobileNumber);
    const paymentMethod = context?.paymentMethod;
    const paymentMethodReferenceId = requiredText(context?.paymentMethodReferenceId);
    if (paymentMethod === undefined || paymentMethod === null) {
        throw new Error("ClientRuntimeContext: paymentMethod is required");
    }
    if (!(0, validation_1.isSupportedPaymentMethod)(paymentMethod)) {
        throw (0, validation_1.unsupportedPaymentMethodError)("ClientRuntimeContext: paymentMethod", paymentMethod);
    }
    if (customerAuthMode === types_1.P3PCustomerAuthMode.CustomerKey) {
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
function requiredText(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}
function assertSecureResourceUrl(url, env) {
    if (env !== config_1.P3PEnvironment.PRODUCTION) {
        return;
    }
    const lower = url.toLowerCase();
    if (!lower.startsWith("https://") && !isLocalhostUrl(url)) {
        throw new Error(`P3P credentials must not be sent over plain HTTP in production. Use HTTPS: ${url}`);
    }
}
function isLocalhostUrl(url) {
    try {
        const { hostname } = new URL(url);
        return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "host.docker.internal" || !hostname.includes(".");
    }
    catch {
        return false;
    }
}
