export const P3PEnvironment = {
  SANDBOX: "https://pluraluat.v2.pinepg.in",
  PRODUCTION: "https://api.pluralpay.in",
} as const;

export type P3PEnvironmentValue = typeof P3PEnvironment[keyof typeof P3PEnvironment];

export const P3PEnvironmentDefaults = {
  [P3PEnvironment.SANDBOX]: {
    requestTimeoutMs: 60_000,
    maxRetries: 3,
    initialRetryDelayMs: 500,
  },
  [P3PEnvironment.PRODUCTION]: {
    requestTimeoutMs: 45_000,
    maxRetries: 3,
    initialRetryDelayMs: 500,
  },
} as const;

export function isP3PEnvironment(value: unknown): value is P3PEnvironmentValue {
  return value === P3PEnvironment.SANDBOX || value === P3PEnvironment.PRODUCTION;
}

export function resolveP3PBaseUrl(env: P3PEnvironmentValue | undefined = P3PEnvironment.PRODUCTION): string {
  if (!isP3PEnvironment(env)) {
    throw new Error("env must be P3PEnvironment.SANDBOX or P3PEnvironment.PRODUCTION");
  }
  return env;
}

export function withP3PEnvironmentDefaults<
  T extends {
    env?: P3PEnvironmentValue;
    requestTimeoutMs?: number;
    maxRetries?: number;
    initialRetryDelayMs?: number;
  },
>(config: T): T & { env: P3PEnvironmentValue; requestTimeoutMs: number; maxRetries: number; initialRetryDelayMs: number } {
  const env = config.env ?? P3PEnvironment.PRODUCTION;
  const defaults = P3PEnvironmentDefaults[env];
  return {
    ...config,
    env,
    requestTimeoutMs: config.requestTimeoutMs ?? defaults.requestTimeoutMs,
    maxRetries: config.maxRetries ?? defaults.maxRetries,
    initialRetryDelayMs: config.initialRetryDelayMs ?? defaults.initialRetryDelayMs,
  };
}

export const DEFAULT_BASE_URL = P3PEnvironment.PRODUCTION;
