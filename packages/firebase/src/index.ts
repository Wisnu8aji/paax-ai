// ─── Firebase Helpers ─────────────────────────────────────────────────────────
// Placeholder implementations — will be wired to real Firebase SDK on first app integration.

/**
 * Returns a Firestore client instance (client-side or admin).
 * In production, this initializes the Firebase app with project config.
 */
export function getFirestoreClient(_options?: {
  projectId?: string;
  useEmulator?: boolean;
  emulatorHost?: string;
  emulatorPort?: number;
}) {
  // TODO: Initialize and return Firestore instance
  // if (options?.useEmulator) connect to emulator
  throw new Error(
    "@paax/firebase: getFirestoreClient not yet implemented. Wire up Firebase config first."
  );
}

/**
 * Returns a Cloud Storage client for file uploads/downloads.
 */
export function getStorageClient(_options?: {
  bucket?: string;
  useEmulator?: boolean;
}) {
  // TODO: Initialize and return Storage instance
  throw new Error(
    "@paax/firebase: getStorageClient not yet implemented. Wire up Firebase config first."
  );
}

/**
 * Builds a standardized Cloud Storage path for project files.
 *
 * Pattern: `organizations/{orgId}/projects/{projectId}/{category}/{fileName}`
 *
 * @example
 * buildStoragePath({
 *   organizationId: "org-123",
 *   projectId: "prj-456",
 *   category: "drawings",
 *   fileName: "floor-plan-01.pdf",
 * })
 * // => "organizations/org-123/projects/prj-456/drawings/floor-plan-01.pdf"
 */
export function buildStoragePath(params: {
  organizationId: string;
  projectId: string;
  category:
    | "drawings"
    | "documents"
    | "exports"
    | "photos"
    | "models"
    | "temp";
  fileName: string;
  version?: number;
}): string {
  const { organizationId, projectId, category, fileName, version } = params;
  const versionSuffix = version ? `/v${version}` : "";
  return `organizations/${organizationId}/projects/${projectId}/${category}${versionSuffix}/${fileName}`;
}

/**
 * Creates a typed Firestore converter for a Zod schema.
 * Handles toFirestore / fromFirestore conversions with validation.
 *
 * @example
 * const projectConverter = firestoreConverter(ProjectSchema);
 * const ref = doc(db, "projects", id).withConverter(projectConverter);
 */
export function firestoreConverter<T>(_schema: {
  parse: (data: unknown) => T;
}) {
  return {
    toFirestore(data: T): Record<string, unknown> {
      return data as unknown as Record<string, unknown>;
    },
    fromFirestore(snapshot: {
      data: (options?: unknown) => Record<string, unknown>;
      id: string;
    }): T {
      const raw = snapshot.data();
      return _schema.parse({ ...raw, id: snapshot.id });
    },
  };
}

/**
 * Storage path categories for type-safe usage.
 */
export const STORAGE_CATEGORIES = [
  "drawings",
  "documents",
  "exports",
  "photos",
  "models",
  "temp",
] as const;

export type StorageCategory = (typeof STORAGE_CATEGORIES)[number];

/**
 * Firestore collection names — centralized to avoid typos.
 */
export const COLLECTIONS = {
  users: "users",
  organizations: "organizations",
  projects: "projects",
  projectFiles: "projectFiles",
  drawingExtractions: "drawingExtractions",
  rabVersions: "rabVersions",
  boqItems: "boqItems",
  hspItems: "hspItems",
  priceComponents: "priceComponents",
  scheduleVersions: "scheduleVersions",
  warnings: "warnings",
  assumptions: "assumptions",
  exportJobs: "exportJobs",
  chatThreads: "chatThreads",
  siteLogs: "siteLogs",
  usageLogs: "usageLogs",
  approvalRequests: "approvalRequests",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
