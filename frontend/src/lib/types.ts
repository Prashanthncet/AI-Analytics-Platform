export type Role = "admin" | "manager" | "member" | "viewer";

export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export type ProjectStatus = "active" | "on_hold" | "completed" | "archived";
export type ProductType = "web" | "mobile" | "desktop";
export type ProductCategory = "ai_tool" | "software";
export type ProductStatus = "active" | "trial" | "deprecated";
export type ApiKeyStatus = "active" | "expired" | "revoked";
export type ApiKeyProvider = "openai" | "anthropic" | "google" | "azure" | "other";
export type DeploymentTargetType = "project" | "product" | "apikey";
export type DeploymentKind = "web" | "app" | "desktop" | "api";
export type DeploymentStatus = "live" | "offline" | "unknown" | "paused";

export interface OwnerRef {
  _id: string;
  name: string;
  email: string;
}

export interface Project {
  _id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  owner?: OwnerRef;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  _id: string;
  name: string;
  description: string;
  vendor: string;
  type: ProductType;
  category: ProductCategory;
  status: ProductStatus;
  quota: number;
  usage: number;
  costUsd: number;
  licenseKeyMasked?: string;
  licenseSeats?: number;
  licenseExpiresAt?: string | null;
  owner?: OwnerRef;
  createdAt: string;
  updatedAt: string;
}

export interface SoftwareLicense {
  _id: string;
  name: string;
  vendor: string;
  licenseSeats: number;
  licenseExpiresAt: string | null;
  licenseKeyMasked: string;
  status: ProductStatus;
}

export interface ApiKey {
  _id: string;
  name: string;
  provider: ApiKeyProvider;
  keyMasked: string;
  quota: number;
  usage: number;
  remaining: number; // -1 when quota is 0 (unlimited)
  costUsd: number;
  expiresAt: string | null;
  status: ApiKeyStatus;
  owner?: OwnerRef | string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentCheck {
  at: string;
  ok: boolean;
  responseMs?: number | null;
}

export interface Deployment {
  _id: string;
  name: string;
  targetType: DeploymentTargetType;
  targetId: string;
  kind: DeploymentKind;
  displayUrl: string;
  checkUrl: string;
  enabled: boolean;
  status: DeploymentStatus;
  lastCheckedAt: string | null;
  lastResponseMs: number | null;
  lastStatusChangeAt: string | null;
  uptimePercent: number | null;
  checks: DeploymentCheck[];
  createdAt: string;
  updatedAt: string;
}

export interface VisitorPoint {
  date: string;
  pageviews: number;
  visitors: number;
}

export interface VisitorTotals {
  today: { pageviews: number; visitors: number };
  thisWeek: { pageviews: number; visitors: number };
  thisMonth: { pageviews: number; visitors: number };
  thisYear: { pageviews: number; visitors: number };
  allTime: { pageviews: number; visitors: number };
}

export interface VisitorSummary {
  totals: VisitorTotals;
  series: VisitorPoint[];
  topPages: { page: string; pageviews: number; visitors: number }[];
}

export interface UsagePoint {
  date: string;
  usage: number;
  costUsd: number;
}

export interface UsageSummary {
  series: UsagePoint[];
  totalUsage: number;
  totalCost: number;
}

export interface DashboardStats {
  counts: { users: number; projects: number; products: number; apiKeys: number; deployments: number };
  projectsByStatus: { status: ProjectStatus; count: number }[];
  productsByType: { type: ProductType; count: number }[];
  productsByCategory: { category: ProductCategory; count: number }[];
  apiKeysByStatus: { status: ApiKeyStatus; count: number }[];
  apiKeyTotals: { usage: number; costUsd: number; expiringSoon: number; expiringSoftware: number };
  deploymentCounts: { live: number; offline: number; unknown: number; paused: number };
  visitors: {
    totals: VisitorTotals;
    series: { date: string; visitors: number; pageviews: number }[];
  };
  software: SoftwareLicense[];
  recentProjects: Pick<Project, "_id" | "name" | "status" | "createdAt">[];
  recentProducts: Pick<Product, "_id" | "name" | "category" | "type" | "status" | "createdAt">[];
  recentApiKeys: Pick<
    ApiKey,
    "_id" | "name" | "provider" | "keyMasked" | "costUsd" | "usage" | "status" | "expiresAt" | "createdAt"
  >[];
}

export interface ChatReply {
  reply: string;
  kind: "text" | "table";
  columns?: string[];
  rows?: Record<string, string | number>[];
  reports?: { label: string; url: string; format: string }[];
  chart?: { label: string; color: string; data: { date: string; value: number }[] };
}
