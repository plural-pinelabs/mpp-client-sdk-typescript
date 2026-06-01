"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = validateConfig;
exports.validateCreateTokenOptions = validateCreateTokenOptions;
exports.isSupportedPaymentMethod = isSupportedPaymentMethod;
const config_1 = require("../config");
const types_1 = require("../types");
function validateConfig(config) {
    if (config.paymentGateway !== types_1.PaymentGateway.PineLabsOnline) {
        throw new Error("PluralBuyerConfig: paymentGateway must be PaymentGateway.PineLabsOnline");
    }
    if (config.env !== undefined && !(0, config_1.isP3PEnvironment)(config.env)) {
        throw new Error("PluralBuyerConfig: env must be P3PEnvironment.SANDBOX or P3PEnvironment.PRODUCTION");
    }
    if (!isSupportedPaymentMethod(config.selectedPaymentMethod)) {
        throw new Error("PluralBuyerConfig: selectedPaymentMethod must be a supported payment method");
    }
}
function validateCreateTokenOptions(options) {
    const customerReference = String(options.customerReference ?? options.customerId ?? "").trim();
    if (!customerReference) {
        throw new Error("CreateTokenOptions: customerReference or customerId is required");
    }
    const mobileNumber = String(options.mobileNumber ?? "").trim();
    if (!mobileNumber) {
        throw new Error("CreateTokenOptions: mobileNumber is required");
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
    return value === types_1.PaymentMethod.UpiSbmd || value === types_1.PaymentMethod.Crypto;
}
