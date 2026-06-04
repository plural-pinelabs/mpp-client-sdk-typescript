"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FetchInterceptor = void 0;
const types_1 = require("../types");
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
        const response = await this.fetchImpl(url, { ...init, method, headers: (0, http_1.normalizeHeaders)(init.headers) });
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
        const paymentMethod = (0, credential_builder_1.selectPaymentMethod)(challenge, this.config.selectedPaymentMethod);
        const customerContext = resolveCustomerContext(context, (0, validation_1.resolveCustomerAuthMode)(this.config));
        const token = await this.api.createToken({
            customerKey: customerContext.customerKey,
            customerReference: customerContext.customerReference,
            mobileNumber: customerContext.mobileNumber,
            challengeId: challenge.id,
            paymentAmount: { value: (0, credential_builder_1.extractAmountPaise)(challenge), currency: challenge.request.currency },
            paymentMethod,
        });
        return (0, credential_builder_1.buildCredential)(challenge, customerContext.credentialSource, token.token, paymentMethod, customerContext.customerReference, customerContext.mobileNumber);
    }
    async handle402(method, url, init, wwwAuth, context) {
        const challenge = (0, credential_builder_1.decodeChallenge)(wwwAuth);
        await this.config.onChallenge?.(challenge);
        const retryHeaders = (0, http_1.normalizeHeaders)(init.headers);
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
function resolveCustomerContext(context, customerAuthMode) {
    const customerKey = requiredText(context?.customerKey);
    const customerReference = requiredText(context?.customerReference);
    const mobileNumber = requiredText(context?.mobileNumber);
    if (customerAuthMode === types_1.P3PCustomerAuthMode.CustomerKey) {
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
        credentialSource: customerReference ?? mobileNumber,
    };
}
function requiredText(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}
