import { DashboardHealthPanel } from "@/features/dashboard/dashboard-health-panel";

export function DashboardOverview() {
  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-description">Enterprise Agent local operations and readiness overview.</p>
        </div>
      </div>

      <DashboardHealthPanel />
    </div>
  );
}
