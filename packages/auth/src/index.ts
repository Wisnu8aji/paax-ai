// ─── PAAX AI Auth: Roles, Permissions & Guards ───────────────────────────────

// ─── Roles ───────────────────────────────────────────────────────────────────

export const Roles = {
  OWNER: "OWNER",
  ENGINEER: "ENGINEER",
  ESTIMATOR: "ESTIMATOR",
  SITE_ADMIN: "SITE_ADMIN",
  VIEWER: "VIEWER",
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

/** Role hierarchy — higher index = more privileged */
export const ROLE_HIERARCHY: Role[] = [
  Roles.VIEWER,
  Roles.SITE_ADMIN,
  Roles.ESTIMATOR,
  Roles.ENGINEER,
  Roles.OWNER,
];

// ─── Permissions ─────────────────────────────────────────────────────────────

export const Permissions = {
  // Project
  PROJECT_VIEW: "project:view",
  PROJECT_CREATE: "project:create",
  PROJECT_EDIT: "project:edit",
  PROJECT_DELETE: "project:delete",
  PROJECT_MANAGE_MEMBERS: "project:manage_members",

  // Files / Drawings
  FILE_VIEW: "file:view",
  FILE_UPLOAD: "file:upload",
  FILE_DELETE: "file:delete",
  DRAWING_EXTRACT: "drawing:extract",

  // RAB / BOQ
  RAB_VIEW: "rab:view",
  RAB_CREATE: "rab:create",
  RAB_EDIT: "rab:edit",
  RAB_APPROVE: "rab:approve",
  RAB_EXPORT: "rab:export",
  HSP_MANAGE: "hsp:manage",

  // Schedule
  SCHEDULE_VIEW: "schedule:view",
  SCHEDULE_EDIT: "schedule:edit",
  SCHEDULE_APPROVE: "schedule:approve",

  // Site
  SITE_LOG_VIEW: "site_log:view",
  SITE_LOG_CREATE: "site_log:create",
  SITE_LOG_EDIT: "site_log:edit",

  // Chat / AI
  CHAT_USE: "chat:use",
  AI_ACTIONS_APPROVE: "ai:approve_actions",

  // Admin
  ORG_MANAGE: "org:manage",
  BILLING_VIEW: "billing:view",
  USAGE_VIEW: "usage:view",
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

// ─── Role → Permission Mapping ───────────────────────────────────────────────

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [Roles.OWNER]: Object.values(Permissions), // Full access

  [Roles.ENGINEER]: [
    Permissions.PROJECT_VIEW,
    Permissions.PROJECT_CREATE,
    Permissions.PROJECT_EDIT,
    Permissions.PROJECT_MANAGE_MEMBERS,
    Permissions.FILE_VIEW,
    Permissions.FILE_UPLOAD,
    Permissions.FILE_DELETE,
    Permissions.DRAWING_EXTRACT,
    Permissions.RAB_VIEW,
    Permissions.RAB_CREATE,
    Permissions.RAB_EDIT,
    Permissions.RAB_APPROVE,
    Permissions.RAB_EXPORT,
    Permissions.HSP_MANAGE,
    Permissions.SCHEDULE_VIEW,
    Permissions.SCHEDULE_EDIT,
    Permissions.SCHEDULE_APPROVE,
    Permissions.SITE_LOG_VIEW,
    Permissions.SITE_LOG_CREATE,
    Permissions.SITE_LOG_EDIT,
    Permissions.CHAT_USE,
    Permissions.AI_ACTIONS_APPROVE,
    Permissions.USAGE_VIEW,
  ],

  [Roles.ESTIMATOR]: [
    Permissions.PROJECT_VIEW,
    Permissions.FILE_VIEW,
    Permissions.FILE_UPLOAD,
    Permissions.DRAWING_EXTRACT,
    Permissions.RAB_VIEW,
    Permissions.RAB_CREATE,
    Permissions.RAB_EDIT,
    Permissions.RAB_EXPORT,
    Permissions.HSP_MANAGE,
    Permissions.SCHEDULE_VIEW,
    Permissions.CHAT_USE,
  ],

  [Roles.SITE_ADMIN]: [
    Permissions.PROJECT_VIEW,
    Permissions.FILE_VIEW,
    Permissions.FILE_UPLOAD,
    Permissions.RAB_VIEW,
    Permissions.SCHEDULE_VIEW,
    Permissions.SITE_LOG_VIEW,
    Permissions.SITE_LOG_CREATE,
    Permissions.SITE_LOG_EDIT,
    Permissions.CHAT_USE,
  ],

  [Roles.VIEWER]: [
    Permissions.PROJECT_VIEW,
    Permissions.FILE_VIEW,
    Permissions.RAB_VIEW,
    Permissions.SCHEDULE_VIEW,
    Permissions.SITE_LOG_VIEW,
  ],
};

// ─── Guards ──────────────────────────────────────────────────────────────────

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes(permission);
}

/**
 * Check if a role has ALL of the specified permissions.
 */
export function hasAllPermissions(
  role: Role,
  permissions: Permission[]
): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

/**
 * Check if a role has ANY of the specified permissions.
 */
export function hasAnyPermission(
  role: Role,
  permissions: Permission[]
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Check if roleA is at least as privileged as roleB.
 */
export function isRoleAtLeast(roleA: Role, roleB: Role): boolean {
  return ROLE_HIERARCHY.indexOf(roleA) >= ROLE_HIERARCHY.indexOf(roleB);
}

/**
 * Guard that throws if the user lacks a required permission.
 * Use in API route handlers or server actions.
 */
export function requirePermission(
  userRole: Role,
  permission: Permission,
  errorMessage?: string
): void {
  if (!hasPermission(userRole, permission)) {
    throw new Error(
      errorMessage ||
        `Access denied: role "${userRole}" lacks permission "${permission}".`
    );
  }
}

/**
 * Guard that throws if the user's role is below the minimum required.
 */
export function requireRole(
  userRole: Role,
  minimumRole: Role,
  errorMessage?: string
): void {
  if (!isRoleAtLeast(userRole, minimumRole)) {
    throw new Error(
      errorMessage ||
        `Access denied: role "${userRole}" is below minimum required role "${minimumRole}".`
    );
  }
}
