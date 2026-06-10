export type Permission =
  | "agent:run"
  | "tools:execute"
  | "knowledge:read"
  | "knowledge:write"
  | "observability:read"
  | "workflow:manage"
  | "evaluation:manage"
  | "auth:manage";

export type Role = "viewer" | "developer" | "operator" | "admin" | "service";

export type RequestUser = {
  userId: string;
  tenantId: string;
  roles: Role[];
  permissions: Permission[];
  authType: "api_key" | "dev" | "jwt" | "service_token";
  tokenId?: string;
};

export type AuthenticatedRequest = {
  user: RequestUser;
};
