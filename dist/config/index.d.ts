export declare const P3PEnvironment: {
    readonly SANDBOX: "https://pluraluat.v2.pinepg.in";
    readonly PRODUCTION: "https://api.pluralpay.in";
};
export type P3PEnvironmentValue = typeof P3PEnvironment[keyof typeof P3PEnvironment];
export declare function isP3PEnvironment(value: unknown): value is P3PEnvironmentValue;
export declare function resolveP3PBaseUrl(env?: P3PEnvironmentValue | undefined): string;
export declare const DEFAULT_BASE_URL: "https://api.pluralpay.in";
