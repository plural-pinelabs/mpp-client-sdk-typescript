"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiClient = void 0;
const types_1 = require("../types");
const http_1 = require("../utils/http");
const parsers_1 = require("../utils/parsers");
const validation_1 = require("../utils/validation");
const CUSTOMER_TOKEN_PATH = "/api/v1/customer/mpp/token";
class ApiClient {
    config;
    baseUrl;
    fetchImpl;
    constructor(config, baseUrl, fetchImpl) {
        this.config = config;
        this.baseUrl = baseUrl;
        this.fetchImpl = fetchImpl;
    }
    /** Create a one-time payment token for an active authorization. */
    async createToken(options) {
        const tokenOptions = {
            ...options,
        };
        (0, validation_1.validateCreateTokenOptions)(tokenOptions);
        const customerReference = tokenOptions.customerReference ?? tokenOptions.customerId ?? "";
        const mobileNumber = tokenOptions.mobileNumber ?? "";
        const paymentAmount = tokenOptions.paymentAmount ?? {
            value: tokenOptions.usageLimits.maxAmount,
            currency: tokenOptions.usageLimits.currency,
        };
        const body = {
            type: tokenOptions.paymentMethod ?? this.config.selectedPaymentMethod,
            customer: customerPayload(customerReference, mobileNumber),
            challenge_id: tokenOptions.challengeId,
            payment_amount: amountPayload(paymentAmount),
        };
        const data = await this.request("POST", CUSTOMER_TOKEN_PATH, body, customerKeyHeader(tokenOptions.customerKey));
        return (0, parsers_1.parseToken)(data);
    }
    /** P3P request wrapper that unwraps `{ data: ... }` envelopes. */
    async request(method, path, body, extraHeaders = {}, baseUrl = this.baseUrl) {
        const response = await (0, http_1.requestWithRetry)(this.fetchImpl, buildUrl(baseUrl, path), {
            method,
            headers: {
                Accept: "application/json",
                ...(body !== undefined && method !== "GET" ? { "Content-Type": "application/json" } : {}),
                ...extraHeaders,
            },
            body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
        }, this.config);
        if (!response.ok) {
            throw types_1.P3PError.fromResponse(response.status, await (0, http_1.safeJson)(response));
        }
        const payload = await response.json();
        const record = (0, parsers_1.asRecord)(payload);
        return record && "data" in record ? record.data : payload;
    }
}
exports.ApiClient = ApiClient;
function stripSlash(value) {
    return value.replace(/\/$/, "");
}
function buildUrl(baseUrl, path) {
    if (/^https?:\/\//i.test(path)) {
        return path;
    }
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${stripSlash(baseUrl)}${normalizedPath}`;
}
function customerPayload(_customerReference, mobileNumber) {
    return {
        mobile_number: mobileNumber,
    };
}
function amountPayload(amount) {
    return { value: amount.value, currency: amount.currency };
}
function customerKeyHeader(customerKey) {
    const value = customerKey?.trim();
    return value ? { "X-Customer-Key": value } : {};
}
