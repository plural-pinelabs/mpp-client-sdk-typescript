"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiClient = void 0;
const types_1 = require("../types");
const config_1 = require("../config");
const http_1 = require("../utils/http");
const parsers_1 = require("../utils/parsers");
const validation_1 = require("../utils/validation");
const CUSTOMER_TOKEN_PATH = "/api/v1/customer/mpp/token";
const CUSTOMER_TOKEN_SANDBOX_BASE_URL = "https://api-staging.pluralonline.com";
const CUSTOMER_TOKEN_PRODUCTION_BASE_URL = "https://api.pluralonline.com";
const CENTRAL_TOKEN_PATH = "/mpp/v1/token";
class ApiClient {
    config;
    baseUrl;
    fetchImpl;
    auth;
    constructor(config, baseUrl, fetchImpl, auth) {
        this.config = config;
        this.baseUrl = baseUrl;
        this.fetchImpl = fetchImpl;
        this.auth = auth;
    }
    /** Create a one-time payment token for an active authorization. */
    async createToken(options) {
        const customerAuthMode = (0, validation_1.resolveCustomerAuthMode)(this.config);
        const tokenOptions = {
            ...options,
        };
        (0, validation_1.validateCreateTokenOptions)(tokenOptions, customerAuthMode);
        const mobileNumber = tokenOptions.mobileNumber ?? "";
        const paymentAmount = tokenOptions.paymentAmount ?? {
            value: tokenOptions.usageLimits.maxAmount,
            currency: tokenOptions.usageLimits.currency,
        };
        const body = {
            payment_method: tokenOptions.paymentMethod,
            customer: customerPayload(mobileNumber, customerAuthMode),
            challenge_id: tokenOptions.challengeId,
            payment_amount: amountPayload(paymentAmount),
        };
        const paymentMethodReferenceId = tokenOptions.paymentMethodReferenceId?.trim();
        if (paymentMethodReferenceId) {
            body.payment_method_reference_id = paymentMethodReferenceId;
        }
        const data = await this.request("POST", customerAuthMode === types_1.P3PCustomerAuthMode.CustomerKey ? CUSTOMER_TOKEN_PATH : CENTRAL_TOKEN_PATH, body, await this.authHeaders(customerAuthMode, tokenOptions.customerKey), customerAuthMode === types_1.P3PCustomerAuthMode.CustomerKey
            ? resolveCustomerTokenBaseUrl(this.baseUrl)
            : this.baseUrl);
        return (0, parsers_1.parseToken)(data);
    }
    async authHeaders(customerAuthMode, customerKey) {
        const token = await this.auth.getAccessToken();
        if (!token) {
            throw new types_1.P3PError("P3P_AUTHENTICATION_FAILED", "Auth manager is not configured", 500);
        }
        return {
            Authorization: `Bearer ${token}`,
            ...(customerAuthMode === types_1.P3PCustomerAuthMode.CustomerKey ? customerKeyHeader(customerKey) : {}),
        };
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
function resolveCustomerTokenBaseUrl(baseUrl) {
    return stripSlash(baseUrl) === config_1.P3PEnvironment.SANDBOX
        ? CUSTOMER_TOKEN_SANDBOX_BASE_URL
        : CUSTOMER_TOKEN_PRODUCTION_BASE_URL;
}
function customerPayload(mobileNumber, customerAuthMode) {
    if (customerAuthMode === types_1.P3PCustomerAuthMode.CustomerKey) {
        return { mobile_number: mobileNumber };
    }
    return { mobile_number: mobileNumber };
}
function amountPayload(amount) {
    return { value: amount.value, currency: amount.currency };
}
function customerKeyHeader(customerKey) {
    const value = customerKey?.trim();
    return value ? { "X-Customer-Key": value } : {};
}
