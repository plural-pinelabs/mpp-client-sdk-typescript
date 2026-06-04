"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = validateConfig;
exports.validateCreateTokenOptions = validateCreateTokenOptions;
exports.isSupportedPaymentMethod = isSupportedPaymentMethod;
exports.resolveCustomerAuthMode = resolveCustomerAuthMode;
const config_1 = require("../config");
const types_1 = require("../types");
function validateConfig(config) {
    if (config.env !== undefined && !(0, config_1.isP3PEnvironment)(config.env)) {
        throw new Error("PineLabsOnlineClientConfig: env must be P3PEnvironment.SANDBOX or P3PEnvironment.PRODUCTION");
    }
    const customerAuthMode = resolveCustomerAuthMode(config);
    if (customerAuthMode === types_1.P3PCustomerAuthMode.ClientCredentials) {
        if (!requiredText(config.clientId) || !requiredText(config.clientSecret)) {
            throw new Error("PineLabsOnlineClientConfig: clientId and clientSecret are required when customerAuthMode is CLIENT_CREDENTIALS");
        }
    }
    if (!isSupportedPaymentMethod(config.selectedPaymentMethod)) {
        throw new Error("PineLabsOnlineClientConfig: selectedPaymentMethod must be a supported payment method");
    }
}
function validateCreateTokenOptions(options, customerAuthMode = types_1.P3PCustomerAuthMode.ClientCredentials) {
    const customerReference = requiredText(options.customerReference ?? options.customerId);
    const mobileNumber = requiredText(options.mobileNumber);
    if (customerAuthMode === types_1.P3PCustomerAuthMode.CustomerKey) {
        if (!requiredText(options.customerKey)) {
            throw new Error("CreateTokenOptions: customerKey is required when customerAuthMode is CUSTOMER_KEY");
        }
        if (!mobileNumber) {
            throw new Error("CreateTokenOptions: mobileNumber is required when customerAuthMode is CUSTOMER_KEY");
        }
    }
    else if (customerAuthMode === types_1.P3PCustomerAuthMode.ClientCredentials) {
        if (!customerReference && !mobileNumber) {
            throw new Error("CreateTokenOptions: customerReference or mobileNumber is required when customerAuthMode is CLIENT_CREDENTIALS");
        }
    }
    else {
        throw new Error("CreateTokenOptions: customerAuthMode must be CUSTOMER_KEY or CLIENT_CREDENTIALS");
    }
    if (!String(options.challengeId ?? "").trim()) {
        throw new Error("CreateTokenOptions: challengeId is required");
    }
    const paymentValue = options.paymentAmount?.value ?? options.usageLimits?.maxAmount;
    const paymentCurrency = options.paymentAmount?.currency ?? options.usageLimits?.currency;
    if (!Number.isInteger(paymentValue) || Number(paymentValue) <= 0) {
        throw new Error("CreateTokenOptions: paymentAmount.value must be a positive integer");
    }
    if (!paymentCurrency) {
        throw new Error("CreateTokenOptions: paymentAmount.currency is required");
    }
    if (options.paymentMethod !== undefined && !isSupportedPaymentMethod(options.paymentMethod)) {
        throw new Error("CreateTokenOptions: paymentMethod must be a supported payment method");
    }
}
function isSupportedPaymentMethod(value) {
    return value === types_1.PaymentMethod.RESERVE_PAY || value === types_1.PaymentMethod.Crypto;
}
function resolveCustomerAuthMode(config) {
    const mode = config.customerAuthMode ?? types_1.P3PCustomerAuthMode.ClientCredentials;
    if (mode !== types_1.P3PCustomerAuthMode.CustomerKey && mode !== types_1.P3PCustomerAuthMode.ClientCredentials) {
        throw new Error("PineLabsOnlineClientConfig: customerAuthMode must be CUSTOMER_KEY or CLIENT_CREDENTIALS");
    }
    return mode;
}
function requiredText(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}
