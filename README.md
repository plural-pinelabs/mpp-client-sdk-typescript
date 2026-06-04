# Pine Labs Online P3P Client SDK

TypeScript SDK for Pine Labs Online P3P client clients. It handles HTTP
`402 Payment Required` server challenges, creates one-time P3P payment tokens,
retries protected requests with a `Payment` credential, and parses
`Payment-Receipt` headers.

## Install

```bash
npm install p3p-client-sdk
```

Requires Node.js `>=18` or another runtime with `fetch`, `AbortSignal.timeout`,
and standard Web APIs.

## Quick Start

```ts
import {
  P3PEnvironment,
  PaymentMethod,
  PineLabsOnlineClient,
} from "p3p-client-sdk";

const client = PineLabsOnlineClient.create({
  selectedPaymentMethod: PaymentMethod.UPI_RESERVE_PAY,
  clientId: process.env.PINELABS_CLIENT_ID!,
  clientSecret: process.env.PINELABS_CLIENT_SECRET!,
  env: P3PEnvironment.SANDBOX,
});

const response = await client.get(
  "https://server.example.com/api/premium",
  { headers: { "X-Request-Id": "req_123" } },
  {
    customerReference: "customer-ref-123",
    mobileNumber: "9876543210",
  },
);
console.log(await response.json());
```

## Payment Selection

The client config selects one payment method for this client instance:

```ts
const client = PineLabsOnlineClient.create({
  selectedPaymentMethod: PaymentMethod.Crypto,
  env: P3PEnvironment.SANDBOX,
});
```

`env` selects the Pine Labs Online P3P service URL. If plain JavaScript callers
omit it, the SDK defaults to `P3PEnvironment.PRODUCTION`.

Customer identity is supplied only per request so a single client instance can
serve many customers. `customerKey`, `customerReference`, and `mobileNumber`
are not part of `PineLabsOnlineClientConfig`.

By default, the SDK uses `P3PCustomerAuthMode.ClientCredentials`. Configure
`clientId` and `clientSecret` once, then pass either `customerReference` or
`mobileNumber` at request time.

For customer API-token flows, explicitly set
`customerAuthMode: P3PCustomerAuthMode.CustomerKey` and pass `customerKey` plus
`mobileNumber` in the runtime context.

Keep the client SDK instance long-lived in production. Auth tokens are cached
per SDK instance, and concurrent refresh is deduped within one instance.

Runtime context is passed as a separate argument after `RequestInit`; it is not
merged into fetch options and is never sent to the server as part of the
original request:

```ts
await client.get(url, requestInit, {
  customerReference: "customer-ref-123",
  mobileNumber: "9876543210",
});
```

When a server returns a 402 challenge, the SDK validates amount, expiry, and that
the selected method is included in `request.availablePaymentMethods`. The
selected method is sent as the P3P service payload `type` when creating a token and is embedded as
`payload.payment_method` in the returned Payment credential.

Currently supported values:

- `PaymentMethod.UPI_RESERVE_PAY` -> `"RESERVE_PAY"`
- `PaymentMethod.Crypto` -> `"CRYPTO"`

## Direct P3P API

```ts
await client.methods.createToken({
  customerReference: "customer-ref-123",
  mobileNumber: "9876543210",
  challengeId: "ch_...",
  paymentAmount: { value: 50000, currency: "INR" },
  paymentMethod: PaymentMethod.UPI_RESERVE_PAY,
});
```

If `paymentMethod` is omitted, the SDK uses `config.selectedPaymentMethod`.
Mandate/pre-authorization creation belongs on the server/server side; the client
SDK only creates the one-time token for a server challenge.

Token creation uses the configured auth mode. In the default client-credentials
mode, the SDK obtains a bearer token from `POST /api/auth/v1/token` and calls
`POST /mpp/v1/token` on the configured P3P environment host. In customer-key
mode, the SDK still obtains a bearer token from `POST /api/auth/v1/token`, then
calls the customer token host for the selected environment with both bearer
`Authorization` and `X-Customer-Key`:

```text
Sandbox:    POST https://api-staging.pluralonline.com/api/v1/customer/mpp/token
Production: POST https://api.pluralonline.com/api/v1/customer/mpp/token
Authorization: Bearer <access token>
X-Customer-Key: <customer API token>
Content-Type: application/json
```

The current P3P request bodies use nested customer objects:

- `POST /api/v1/customer/mpp/token` sends `customer.mobile_number`,
  `challenge_id`, and numeric `payment_amount.value`.

Timeout and retry settings (`requestTimeoutMs`, `maxRetries`,
`initialRetryDelayMs`) apply to internal P3P calls only. The original
protected-resource request uses the integrator's own HTTP timeout policy.

Environment defaults:

| Env | URL | Timeout | Retries | Initial retry delay |
|---|---|---:|---:|---:|
| `P3PEnvironment.SANDBOX` | `https://pluraluat.v2.pinepg.in` | 60000 ms | 3 | 500 ms |
| `P3PEnvironment.PRODUCTION` | `https://api.pluralpay.in` | 45000 ms | 3 | 500 ms |

## 402 Flow

1. Your app calls `client.get(...)`, `client.post(...)`, or `client.request(...)`.
2. The server returns `HTTP 402` with
   `WWW-Authenticate: Payment <challenge>`.
3. The SDK decodes and validates the challenge amount, expiry, and available methods.
4. The SDK creates a payment token with runtime customer context.
5. The SDK retries the original request with
   `P3P-Credential: Payment <credential>`.
6. The server captures the payment and may return `Payment-Receipt`.

Decoded receipts include `paymentGateway` and `paymentMethod` when the server
adds that context. The older receipt `method` field is not emitted.

## Utilities

```ts
import {
  decodeChallenge,
  decodeReceipt,
  validateChallenge,
} from "p3p-client-sdk";

const challenge = decodeChallenge(wwwAuthenticateHeader);
validateChallenge(challenge);

const receipt = decodeReceipt(paymentReceiptHeader);
```

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
