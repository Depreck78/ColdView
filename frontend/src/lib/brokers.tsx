/**
 * Broker catalog for the Brokers settings page.
 *
 * Each entry describes one connector Coldview ships, how it is connected, and
 * what the user must supply. Two connection methods exist today:
 *
 *  - `form`   — a wired backend endpoint saves the credentials (Alpaca).
 *  - `manual` — the connector exists but is configured outside the UI, via the
 *               `coldview connector` CLI, a local gateway, or env keys. The
 *               modal shows the exact fields/steps and builds a copyable
 *               snippet rather than pretending to save something the backend
 *               would not read.
 *
 * The marks are simple in-house monograms (a letter on a brand-ish tint), not
 * official broker logos — the app ships no third-party trademark assets.
 */

export type BrokerMethod = "form" | "manual";

export interface BrokerField {
  /** Config key — also the env/CLI key used in the generated snippet. */
  key: string;
  label: string;
  placeholder?: string;
  /** Rendered as a password input and never echoed in the snippet preview. */
  secret?: boolean;
  hint?: string;
}

export interface Broker {
  id: string;
  name: string;
  /** Short market coverage line shown on the tile. */
  markets: string;
  method: BrokerMethod;
  /** Accent colour for the monogram tile (hex — brand-ish, not a logo). */
  accent: string;
  /** One-line description of how the connection actually works. */
  how: string;
  fields: BrokerField[];
  /** Extra setup steps for `manual` brokers (shown as an ordered list). */
  steps?: string[];
  docsUrl?: string;
  docsLabel?: string;
}

export const BROKERS: Broker[] = [
  {
    id: "alpaca",
    name: "Alpaca",
    markets: "US equities · paper & live",
    method: "form",
    accent: "#FFD400",
    how: "API key pair, verified and saved locally to ~/.coldview/alpaca.json.",
    fields: [
      { key: "api_key", label: "API key ID", placeholder: "PK…" },
      { key: "secret_key", label: "API secret key", placeholder: "Your Alpaca secret", secret: true },
    ],
    docsUrl: "https://app.alpaca.markets/paper/dashboard/overview",
    docsLabel: "Get paper keys",
  },
  {
    id: "ibkr",
    name: "Interactive Brokers",
    markets: "Global multi-asset",
    method: "manual",
    accent: "#D81222",
    how: "Connects to TWS or IB Gateway running on this machine — no keys leave your computer.",
    fields: [
      { key: "host", label: "Host", placeholder: "127.0.0.1" },
      { key: "port", label: "Port", placeholder: "7497", hint: "7497 paper · 7496 live (TWS)" },
      { key: "client_id", label: "Client ID", placeholder: "1" },
    ],
    steps: [
      "Install and launch TWS or IB Gateway, and log in.",
      "In TWS: File → Global Configuration → API → Settings, tick “Enable ActiveX and Socket Clients”.",
      "Select the profile with: coldview connector use ibkr",
    ],
    docsUrl: "https://www.interactivebrokers.com/en/trading/tws.php",
    docsLabel: "Download TWS",
  },
  {
    id: "robinhood",
    name: "Robinhood",
    markets: "US equities · OAuth",
    method: "manual",
    accent: "#00C805",
    how: "OAuth — you authorize at Robinhood; Coldview never sees your password.",
    fields: [],
    steps: [
      "Run: coldview connector use robinhood",
      "Complete the OAuth sign-in in the browser window that opens.",
      "Trading stays read-only until you commit a mandate in the app.",
    ],
  },
  {
    id: "tiger",
    name: "Tiger Brokers",
    markets: "US · HK · CN equities",
    method: "manual",
    accent: "#FF6A00",
    how: "Tiger ID plus an RSA private key issued in the Tiger developer portal.",
    fields: [
      { key: "tiger_id", label: "Tiger ID", placeholder: "20200000" },
      { key: "account", label: "Account", placeholder: "Your trading account number" },
      { key: "private_key_path", label: "Private key path", placeholder: "~/.coldview/tiger_private_key.pem", secret: true },
    ],
    steps: ["Select the profile with: coldview connector use tiger"],
    docsUrl: "https://quant.itiger.com/",
    docsLabel: "Tiger developer portal",
  },
  {
    id: "okx",
    name: "OKX",
    markets: "Crypto spot & derivatives",
    method: "manual",
    accent: "#7B7BFF",
    how: "API key trio (key, secret, passphrase) created in your OKX account.",
    fields: [
      { key: "api_key", label: "API key", placeholder: "Your OKX API key" },
      { key: "secret", label: "Secret key", placeholder: "Your OKX secret", secret: true },
      { key: "passphrase", label: "Passphrase", placeholder: "The passphrase you set", secret: true },
    ],
    steps: ["Create a read-only API key in OKX, then: coldview connector use okx"],
    docsUrl: "https://www.okx.com/account/my-api",
    docsLabel: "OKX API keys",
  },
  {
    id: "binance",
    name: "Binance",
    markets: "Crypto spot & futures",
    method: "manual",
    accent: "#F0B90B",
    how: "API key pair created in your Binance account.",
    fields: [
      { key: "api_key", label: "API key", placeholder: "Your Binance API key" },
      { key: "secret", label: "Secret key", placeholder: "Your Binance secret", secret: true },
    ],
    steps: ["Create a read-only API key in Binance, then: coldview connector use binance"],
    docsUrl: "https://www.binance.com/en/my/settings/api-management",
    docsLabel: "Binance API management",
  },
  {
    id: "futu",
    name: "Futu / moomoo",
    markets: "HK · US · A-shares",
    method: "manual",
    accent: "#FF7A00",
    how: "Connects to FutuOpenD running locally — the gateway holds your login.",
    fields: [
      { key: "FUTU_HOST", label: "Host", placeholder: "127.0.0.1" },
      { key: "FUTU_PORT", label: "Port", placeholder: "11111" },
    ],
    steps: [
      "Download and run FutuOpenD, then log in there.",
      "Add the keys above to agent/.env (they match .env.example).",
    ],
    docsUrl: "https://www.futunn.com/download/openAPI",
    docsLabel: "Download FutuOpenD",
  },
  {
    id: "longbridge",
    name: "Longbridge",
    markets: "HK · US · SG equities",
    method: "manual",
    accent: "#2F6BFF",
    how: "App key/secret plus an access token from the Longbridge open platform.",
    fields: [
      { key: "LONGBRIDGE_APP_KEY", label: "App key", placeholder: "your-app-key" },
      { key: "LONGBRIDGE_APP_SECRET", label: "App secret", placeholder: "your-app-secret", secret: true },
      { key: "LONGBRIDGE_ACCESS_TOKEN", label: "Access token", placeholder: "your-access-token", secret: true },
    ],
    steps: [
      "Add the keys above to agent/.env (they match .env.example).",
      'Install the optional SDK: pip install "coldview-ai[longbridge]"',
    ],
    docsUrl: "https://open.longbridge.com",
    docsLabel: "Longbridge open platform",
  },
  {
    id: "trading212",
    name: "Trading 212",
    markets: "UK / EU equities",
    method: "manual",
    accent: "#00AAE4",
    how: "A single API key generated in the Trading 212 app.",
    fields: [{ key: "api_key", label: "API key", placeholder: "Your Trading 212 API key", secret: true }],
    steps: ["Generate an API key in the app, then: coldview connector use trading212"],
  },
  {
    id: "dhan",
    name: "Dhan",
    markets: "India · NSE / BSE",
    method: "manual",
    accent: "#00B386",
    how: "Client ID plus an access token from the Dhan developer portal.",
    fields: [
      { key: "client_id", label: "Client ID", placeholder: "Your Dhan client ID" },
      { key: "access_token", label: "Access token", placeholder: "Your Dhan access token", secret: true },
    ],
    steps: ["Select the profile with: coldview connector use dhan"],
    docsUrl: "https://dhanhq.co/docs/",
    docsLabel: "Dhan API docs",
  },
  {
    id: "shoonya",
    name: "Shoonya",
    markets: "India · NSE / BSE",
    method: "manual",
    accent: "#8B5CF6",
    how: "Finvasia Shoonya login with TOTP-based two-factor.",
    fields: [
      { key: "userid", label: "User ID", placeholder: "Your Shoonya user ID" },
      { key: "password", label: "Password", placeholder: "Your password", secret: true },
      { key: "totp_secret", label: "TOTP secret", placeholder: "Your 2FA secret", secret: true },
      { key: "vendor_code", label: "Vendor code", placeholder: "Provided by Shoonya" },
      { key: "api_secret", label: "API secret", placeholder: "Provided by Shoonya", secret: true },
    ],
    steps: ["Select the profile with: coldview connector use shoonya"],
    docsUrl: "https://shoonya.com/api-documentation",
    docsLabel: "Shoonya API docs",
  },
  {
    id: "mt5",
    name: "MetaTrader 5",
    markets: "Forex · metals · CFDs",
    method: "manual",
    accent: "#5B8DEF",
    how: "Connects to a MetaTrader 5 terminal running on this machine.",
    fields: [
      { key: "login", label: "Login", placeholder: "Your MT5 account number" },
      { key: "password", label: "Password", placeholder: "Your MT5 password", secret: true },
      { key: "server", label: "Server", placeholder: "e.g. Exness-MT5Real" },
    ],
    steps: [
      "Install and launch the MetaTrader 5 terminal, and log in.",
      "Select the profile with: coldview connector use mt5",
    ],
  },
];

export function getBroker(id: string): Broker | undefined {
  return BROKERS.find((b) => b.id === id);
}

/** Monogram mark — an in-house letter tile, not an official broker logo. */
export function BrokerMark({ broker, size = 40 }: { broker: Broker; size?: number }) {
  const letter = broker.name.charAt(0).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-xl font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.44,
        // Tinted plate + ring keeps the tile legible in both themes without
        // shipping any third-party brand asset.
        background: `linear-gradient(140deg, ${broker.accent}2E, ${broker.accent}12)`,
        border: `1px solid ${broker.accent}55`,
        color: broker.accent,
      }}
    >
      {letter}
    </span>
  );
}
