export type Permission =
  | "agent:run"
  | "tools:execute"
  | "knowledge:read"
  | "knowledge:write"
  | "observability:read"
  | "workflow:manage"
  | "evaluation:manage";

export type Role = "developer" | "operator" | "admin";

export type RequestUser = {
  userId: string;
  tenantId: string;
  roles: Role[];
  permissions: Permission[];
  authType: "api_key" | "dev";
};

export type AuthenticatedRequest = {
  user: RequestUser;
};
