"use client";

import { KeyRound, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { StatusBadge } from "@/components/ui/status-badge";

export function LoginForm() {
  const router = useRouter();
  const { login, status } = useSession();
  const [credentialType, setCredentialType] = useState<"service_token" | "api_key">("service_token");
  const [credential, setCredential] = useState("");
  const [tenantId, setTenantId] = useState("default");
  const [userId, setUserId] = useState("api-key-user");
  const [deviceLabel, setDeviceLabel] = useState("Web Console");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  async function submit(): Promise<void> {
    if (!credential.trim()) {
      setErrorMessage("Credential is required.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(undefined);
    try {
      await login({
        credentialType,
        credential: credential.trim(),
        tenantId: tenantId.trim() || undefined,
        userId: credentialType === "api_key" ? userId.trim() || undefined : undefined,
        deviceLabel: deviceLabel.trim() || undefined,
      });
      router.push("/");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-panel">
        <div className="login-icon">
          <KeyRound className="icon-md" aria-hidden="true" />
        </div>
        <div>
          <h1 className="dashboard-title">Console Sign In</h1>
          <p className="dashboard-description">
            Exchange a local API key or service token for a governed Web Console session.
          </p>
        </div>

        <div className="badge-row">
          <StatusBadge tone={status === "authenticated" ? "success" : "neutral"}>{status}</StatusBadge>
          <StatusBadge tone="neutral">Bearer session</StatusBadge>
        </div>

        {errorMessage ? <div className="alert alert-danger">{errorMessage}</div> : null}

        <div className="auth-form">
          <label>
            <span className="label">Credential type</span>
            <select
              className="text-input"
              value={credentialType}
              onChange={(event) => setCredentialType(event.target.value as "service_token" | "api_key")}
            >
              <option value="service_token">Service token</option>
              <option value="api_key">API key</option>
            </select>
          </label>
          <label>
            <span className="label">Credential</span>
            <input
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
              className="text-input"
              type="password"
              autoComplete="current-password"
            />
          </label>
          <label>
            <span className="label">Tenant</span>
            <input value={tenantId} onChange={(event) => setTenantId(event.target.value)} className="text-input" />
          </label>
          {credentialType === "api_key" ? (
            <label>
              <span className="label">User ID</span>
              <input value={userId} onChange={(event) => setUserId(event.target.value)} className="text-input" />
            </label>
          ) : null}
          <label>
            <span className="label">Device label</span>
            <input value={deviceLabel} onChange={(event) => setDeviceLabel(event.target.value)} className="text-input" />
          </label>
          <button type="button" className="refresh-button" onClick={() => void submit()} disabled={submitting}>
            <LogIn className="icon-sm" aria-hidden="true" />
            Sign in
          </button>
        </div>
      </section>
    </div>
  );
}

