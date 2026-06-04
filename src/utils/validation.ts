import { isP3PEnvironment } from "../config";
import { CreateTokenOptions, P3PCustomerAuthMode, PaymentMethod, PineLabsOnlineClientConfig } from "../types";

export function validateConfig(config: PineLabsOnlineClientConfig): void {
  if (config.env !== undefined && !isP3PEnvironment(config.env)) {
    throw new Error("PineLabsOnlineClientConfig: env must be P3PEnvironment.SANDBOX or P3PEnvironment.PRODUCTION");
  }
  if (!requiredText(config.clientId) || !requiredText(config.clientSecret)) {
    throw new Error("PineLabsOnlineClientConfig: clientId and clientSecret are required");
  }
  if (!isSupportedPaymentMethod(config.selectedPaymentMethod)) {
    throw new Error("PineLabsOnlineClientConfig: selectedPaymentMethod must be a supported payment method");
  }
}

export function validateCreateTokenOptions(
  options: CreateTokenOptions,
  customerAuthMode: P3PCustomerAuthMode = P3PCustomerAuthMode.ClientCredentials,
): void {
  const customerReference = requiredText(options.customerReference ?? options.customerId);
  const mobileNumber = requiredText(options.mobileNumber);
  if (customerAuthMode === P3PCustomerAuthMode.CustomerKey) {
    if (!requiredText(options.customerKey)) {
      throw new Error("CreateTokenOptions: customerKey is required when customerAuthMode is CUSTOMER_KEY");
    }
    if (!mobileNumber) {
      throw new Error("CreateTokenOptions: mobileNumber is required when customerAuthMode is CUSTOMER_KEY");
    }
  } else if (customerAuthMode === P3PCustomerAuthMode.ClientCredentials) {
    if (!customerReference && !mobileNumber) {
      throw new Error("CreateTokenOptions: customerReference or mobileNumber is required when customerAuthMode is CLIENT_CREDENTIALS");
    }
  } else {
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

export function isSupportedPaymentMethod(value: unknown): value is PaymentMethod {
  return value === PaymentMethod.UPI_RESERVE_PAY || value === PaymentMethod.Crypto;
}

export function resolveCustomerAuthMode(config: Pick<PineLabsOnlineClientConfig, "customerAuthMode">): P3PCustomerAuthMode {
  const mode = config.customerAuthMode ?? P3PCustomerAuthMode.ClientCredentials;
  if (mode !== P3PCustomerAuthMode.CustomerKey && mode !== P3PCustomerAuthMode.ClientCredentials) {
    throw new Error("PineLabsOnlineClientConfig: customerAuthMode must be CUSTOMER_KEY or CLIENT_CREDENTIALS");
  }
  return mode;
}

function requiredText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
