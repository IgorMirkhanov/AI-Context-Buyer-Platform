export type UserRole = "owner" | "member";

export type ProjectStatus = "draft" | "active" | "archived" | "disconnected";

export type AdPlatform = "yandex_direct" | "google_ads";

export interface Organization {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
}

export interface User {
  id: string;
  organizationId: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  status: ProjectStatus;
  primaryPlatform: AdPlatform;
  websiteUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
}

export type ConnectionStatus = "connected" | "not_connected";

export interface ProjectConnection {
  status: ConnectionStatus;
  platform: AdPlatform;
  externalAccountId: string | null;
  expiresAt: string | null;
}

export type {
  BriefAudienceSegment,
  BriefBudget,
  ProjectBriefPayload,
} from "./brief";
export { PROJECT_BRIEF_JSON_SCHEMA } from "./brief";
