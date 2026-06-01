import { CreateTokenOptions, PaymentMethod, PluralBuyerConfig } from "../types";
export declare function validateConfig(config: PluralBuyerConfig): void;
export declare function validateCreateTokenOptions(options: CreateTokenOptions): void;
export declare function isSupportedPaymentMethod(value: unknown): value is PaymentMethod;
