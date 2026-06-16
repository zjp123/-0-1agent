const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000/api";
const DEFAULT_WEB_ENVIRONMENT = "local";

const WEB_ENVIRONMENTS = [
  "local",
  "development",
  "staging",
  "production",
  "test",
] as const;

export type WebEnvironment = (typeof WEB_ENVIRONMENTS)[number];

export type WebConfig = {
  apiBaseUrl: string;
  webEnvironment: WebEnvironment;
  isProductionProfile: boolean;
  warnings: string[];
};

export const webConfig = buildWebConfig({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  webEnvironment: process.env.NEXT_PUBLIC_WEB_ENV,
});

export const apiBaseUrl = webConfig.apiBaseUrl;

function buildWebConfig(input: {
  apiBaseUrl?: string;
  webEnvironment?: string;
}): WebConfig {
  const webEnvironment = parseWebEnvironment(input.webEnvironment);
  const apiBaseUrl = parseApiBaseUrl(input.apiBaseUrl);
  const warnings = buildConfigWarnings({ apiBaseUrl, webEnvironment });

  return {
    apiBaseUrl,
    webEnvironment,
    isProductionProfile: webEnvironment === "production",
    warnings,
  };
}

function parseWebEnvironment(value: string | undefined): WebEnvironment {
  const normalized = value?.trim() || DEFAULT_WEB_ENVIRONMENT;
  if (isWebEnvironment(normalized)) {
    return normalized;
  }

  throw new Error(
    `Invalid NEXT_PUBLIC_WEB_ENV "${normalized}". Expected one of: ${WEB_ENVIRONMENTS.join(", ")}.`,
  );
}

function parseApiBaseUrl(value: string | undefined): string {
  const rawValue = value?.trim() || DEFAULT_API_BASE_URL;
  let url: URL;

  try {
    url = new URL(rawValue);
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must use http or https.");
  }

  if (!url.pathname.endsWith("/api")) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must point to the API prefix and end with /api.");
  }

  return rawValue.replace(/\/+$/, "");
}

function buildConfigWarnings(input: {
  apiBaseUrl: string;
  webEnvironment: WebEnvironment;
}): string[] {
  const warnings: string[] = [];
  const url = new URL(input.apiBaseUrl);
  const isLocalApi = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

  if (input.webEnvironment === "production" && isLocalApi) {
    warnings.push("Production Web profile is using a local API URL.");
  }

  if (input.webEnvironment !== "production" && url.protocol !== "http:") {
    warnings.push("Non-production Web profile is using HTTPS. Verify local certificates if requests fail.");
  }

  return warnings;
}

function isWebEnvironment(value: string): value is WebEnvironment {
  return WEB_ENVIRONMENTS.includes(value as WebEnvironment);
}
