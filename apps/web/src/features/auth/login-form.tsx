"use client";

import { KeyRound, LogIn, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { StatusBadge } from "@/components/ui/status-badge";

export function LoginForm() {
  const router = useRouter();
  const { login, register, status } = useSession();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [credentialType, setCredentialType] = useState<"email_password" | "service_token" | "api_key">(
    "email_password",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [credential, setCredential] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState("api-key-user");
  const [deviceLabel, setDeviceLabel] = useState("Web Console");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  async function submit(): Promise<void> {
    if (mode === "register") {
      if (!email.trim() || password.length < 8) {
        setErrorMessage("Email and an 8+ character password are required.");
        return;
      }
      setSubmitting(true);
      setErrorMessage(undefined);
      try {
        await register({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
          workspaceName: workspaceName.trim() || undefined,
          deviceLabel: deviceLabel.trim() || undefined,
        });
        router.push("/");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Registration failed.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (credentialType === "email_password" && (!email.trim() || !password)) {
      setErrorMessage("Email and password are required.");
      return;
    }
    if (credentialType !== "email_password" && !credential.trim()) {
      setErrorMessage("Credential is required.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(undefined);
    try {
      await login({
        credentialType,
        credential: credentialType === "email_password" ? undefined : credential.trim(),
        email: credentialType === "email_password" ? email.trim() : undefined,
        password: credentialType === "email_password" ? password : undefined,
        tenantId: credentialType === "email_password" ? undefined : tenantId.trim() || undefined,
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
            Sign in with an account workspace, or use an integration credential for local administration.
          </p>
        </div>

        <div className="badge-row">
          <StatusBadge tone={status === "authenticated" ? "success" : "neutral"}>{status}</StatusBadge>
          <StatusBadge tone="neutral">Bearer session</StatusBadge>
        </div>

        {errorMessage ? <div className="alert alert-danger">{errorMessage}</div> : null}

        <div className="auth-form">
          <div className="segmented-control" aria-label="Auth mode">
            <button
              type="button"
              className={mode === "signin" ? "segmented-active" : undefined}
              onClick={() => setMode("signin")}
            >
              <LogIn className="icon-sm" aria-hidden="true" />
              Sign in
            </button>
            <button
              type="button"
              className={mode === "register" ? "segmented-active" : undefined}
              onClick={() => {
                setMode("register");
                setCredentialType("email_password");
              }}
            >
              <UserPlus className="icon-sm" aria-hidden="true" />
              Register
            </button>
          </div>

          {mode === "signin" ? (
            <label>
              <span className="label">Credential type</span>
              <select
                className="text-input"
                value={credentialType}
                onChange={(event) =>
                  setCredentialType(event.target.value as "email_password" | "service_token" | "api_key")
                }
              >
                <option value="email_password">Email and password</option>
                <option value="service_token">Service token</option>
                <option value="api_key">API key</option>
              </select>
            </label>
          ) : null}

          {credentialType === "email_password" ? (
            <>
              <label>
                <span className="label">Email</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="text-input"
                  type="email"
                  autoComplete="email"
                />
              </label>
              <label>
                <span className="label">Password</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="text-input"
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                />
              </label>
            </>
          ) : (
            <>
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
            </>
          )}

          {mode === "register" ? (
            <>
              <label>
                <span className="label">Display name</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="text-input"
                  autoComplete="name"
                />
              </label>
              <label>
                <span className="label">Workspace name</span>
                <input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  className="text-input"
                  autoComplete="organization"
                />
              </label>
            </>
          ) : null}

          <label>
            <span className="label">Device label</span>
            <input value={deviceLabel} onChange={(event) => setDeviceLabel(event.target.value)} className="text-input" />
          </label>
          <button type="button" className="refresh-button" onClick={() => void submit()} disabled={submitting}>
            {mode === "register" ? (
              <UserPlus className="icon-sm" aria-hidden="true" />
            ) : (
              <LogIn className="icon-sm" aria-hidden="true" />
            )}
            {mode === "register" ? "Create account" : "Sign in"}
          </button>
        </div>
      </section>
    </div>
  );
}
