"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = validateConfig;
exports.validateCreateTokenOptions = validateCreateTokenOptions;
exports.isSupportedPaymentMethod = isSupportedPaymentMethod;
exports.unsupportedPaymentMethodError = unsupportedPaymentMethodError;
exports.resolveCustomerAuthMode = resolveCustomerAuthMode;
const config_1 = require("../config");
const types_1 = require("../types");
function validateConfig(config) {
    if (config.env !== undefined && !(0, config_1.isP3PEnvironment)(config.env)) {
        throw new Error("PineLabsOnlineClientConfig: env must be P3PEnvironment.SANDBOX or P3PEnvironment.PRODUCTION");
    }
    if (!requiredText(config.clientId) || !requiredText(config.clientSecret)) {
        throw new Error("PineLabsOnlineClientConfig: clientId and clientSecret are required");
    }
}
function validateCreateTokenOptions(options, customerAuthMode = types_1.P3PCustomerAuthMode.ClientCredentials) {
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
        if (!mobileNumber) {
            throw new Error("CreateTokenOptions: mobileNumber is required when customerAuthMode is CLIENT_CREDENTIALS");
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
    if (options.paymentMethod === undefined) {
        throw new Error("CreateTokenOptions: paymentMethod is required");
    }
    if (!isSupportedPaymentMethod(options.paymentMethod)) {
        throw unsupportedPaymentMethodError("CreateTokenOptions: paymentMethod", options.paymentMethod);
    }
}
function isSupportedPaymentMethod(value) {
    return value === types_1.PaymentMethod.RESERVE_PAY
        || value === types_1.PaymentMethod.OTM
        || value === types_1.PaymentMethod.CARD
        || value === types_1.PaymentMethod.CREDIT_EMI;
}
function unsupportedPaymentMethodError(context, value) {
    if (value === types_1.PaymentMethod.Crypto) {
        return new Error(`${context}: PaymentMethod.Crypto is currently not supported in SDKs`);
    }
    return new Error(`${context}: payment method must be RESERVE_PAY, OTM, CARD, or CREDIT_EMI`);
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
