export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ApprovalPolicyResponse = {
  id: string;
  tenantId: string;
  name: string;
  action: string;
  resourceType: string;
  requiredApprovals: number;
  enabled: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalRequestResponse = {
  id: string;
  tenantId: string;
  policyId?: string;
  requestedBy: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  status: ApprovalStatus;
  requiredApprovals: number;
  approvals: Array<Record<string, unknown>>;
  reason: string;
  rejectionReason?: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  expiresAt?: string;
  decidedAt?: string;
  createdAt: string;
  updatedAt: string;
};
