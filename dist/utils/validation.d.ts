import { CreateTokenOptions, P3PCustomerAuthMode, PaymentMethod, PineLabsOnlineClientConfig } from "../types";
export declare function validateConfig(config: PineLabsOnlineClientConfig): void;
export declare function validateCreateTokenOptions(options: CreateTokenOptions, customerAuthMode?: P3PCustomerAuthMode): void;
export declare function isSupportedPaymentMethod(value: unknown): value is PaymentMethod;
export declare function unsupportedPaymentMethodError(context: string, value: unknown): Error;
export declare function resolveCustomerAuthMode(config: Pick<PineLabsOnlineClientConfig, "customerAuthMode">): P3PCustomerAuthMode;
