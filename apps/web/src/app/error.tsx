"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="error-boundary">
      <div className="error-boundary-icon">
        <TriangleAlert className="icon-md" aria-hidden="true" />
      </div>
      <div>
        <h1 className="dashboard-title">Something went wrong</h1>
        <p className="dashboard-description">
          The console caught a runtime error. Retry the view, or check the browser console and API logs.
        </p>
        {error.digest ? <p className="muted">Digest: {error.digest}</p> : null}
        <button type="button" className="refresh-button" onClick={reset}>
          <RotateCcw className="icon-sm" aria-hidden="true" />
          Retry
        </button>
      </div>
    </div>
  );
}
