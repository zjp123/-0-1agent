import { ShieldCheck, TriangleAlert } from "lucide-react";
import type { Permission } from "@/lib/api/client";

type ProtectedOperationHintProps = {
  hasCredentials: boolean;
  permissions: Permission[];
  title?: string;
};

export function ProtectedOperationHint({
  hasCredentials,
  permissions,
  title = "Protected operation",
}: ProtectedOperationHintProps) {
  return (
    <div className={`permission-hint ${hasCredentials ? "permission-hint-ready" : "permission-hint-blocked"}`}>
      <div className="permission-hint-icon">
        {hasCredentials ? (
          <ShieldCheck className="icon-sm" aria-hidden="true" />
        ) : (
          <TriangleAlert className="icon-sm" aria-hidden="true" />
        )}
      </div>
      <div className="permission-hint-body">
        <div className="permission-hint-title">{title}</div>
        <p className="permission-hint-copy">
          {hasCredentials
            ? "Credential present. The API will still enforce tenant permissions server-side."
            : "Enter an API key or service token before running this protected operation."}
        </p>
        <div className="permission-list" aria-label="Required permissions">
          {permissions.map((permission) => (
            <span key={permission} className="inline-code">
              {permission}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
