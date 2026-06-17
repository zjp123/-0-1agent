import { Suspense } from "react";
import { ObservabilityDashboard } from "@/features/observability/observability-dashboard";

export default function ObservabilityPage() {
  return (
    <Suspense fallback={null}>
      <ObservabilityDashboard />
    </Suspense>
  );
}
