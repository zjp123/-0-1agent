"use client";

type LocalCredentialFieldsProps = {
  apiKey: string;
  serviceToken: string;
  usingSession: boolean;
  onApiKeyChange: (value: string) => void;
  onServiceTokenChange: (value: string) => void;
};

export function LocalCredentialFields({
  apiKey,
  serviceToken,
  usingSession,
  onApiKeyChange,
  onServiceTokenChange,
}: LocalCredentialFieldsProps) {
  if (usingSession) {
    return (
      <div className="alert alert-success">
        Using signed-in Web Console session. Manual API key and service token inputs are hidden while this session is active.
      </div>
    );
  }

  return (
    <>
      <label>
        <span className="label">API key</span>
        <input value={apiKey} onChange={(event) => onApiKeyChange(event.target.value)} className="text-input" />
      </label>
      <label>
        <span className="label">Service token</span>
        <input value={serviceToken} onChange={(event) => onServiceTokenChange(event.target.value)} className="text-input" />
      </label>
    </>
  );
}
