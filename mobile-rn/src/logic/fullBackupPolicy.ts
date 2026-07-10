/** One state field that points at a media value. */
export type FullBackupMediaReference = {
  key: string;
  uri: string;
  force: boolean;
};

/** Manifest fields required to plan and restore a full-media backup. */
export type FullBackupManifestEntry = {
  mediaId: string;
  fileUri: string;
  type: string;
  createdAt: number;
  size?: number;
  contentHash?: string;
  characterId?: string;
};

export type FullBackupMediaPlan = {
  entries: FullBackupManifestEntry[];
  referenceCounts: Record<string, number>;
  unmanagedFileUris: string[];
};

/** Archived bytes and their original state URI. */
export type ArchivedMediaRecord = {
  mediaId: string;
  sourceFileUri: string;
  type: string;
  base64: string;
  contentHash?: string;
  characterId?: string;
  createdAt?: number;
};

export type RestoredMediaRecord = {
  sourceFileUri: string;
  targetFileUri: string;
  mediaId: string;
  added: boolean;
};

export type FullBackupRestoreAdapter = {
  restore(record: ArchivedMediaRecord): Promise<RestoredMediaRecord>;
  rollback(mediaIds: readonly string[]): Promise<void>;
};

export type PreparedFullBackupMedia = {
  replacements: RestoredMediaRecord[];
  addedMediaIds: string[];
  rollback(): Promise<void>;
};

/** Selects only state-reachable manifest rows for a full-media archive. */
export function buildFullBackupMediaPlan(
  references: readonly FullBackupMediaReference[],
  manifest: readonly FullBackupManifestEntry[],
): FullBackupMediaPlan {
  const referenceCounts: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const reference of references) {
    referenceCounts[reference.uri] = (referenceCounts[reference.uri] || 0) + 1;
  }
  const manifestByUri = new Map(manifest.map(entry => [entry.fileUri, entry]));
  const reachableUris = new Set(references.map(reference => reference.uri));
  const entries = manifest.filter(entry => reachableUris.has(entry.fileUri));
  const unmanagedFileUris = [...new Set(references
    .map(reference => reference.uri)
    .filter(uri => uri.startsWith('file:') && !manifestByUri.has(uri)))].sort();
  return { entries, referenceCounts, unmanagedFileUris };
}

/** Coordinates partial media restoration and guarantees added-asset rollback. */
export function createFullBackupRestoreCoordinator(
  adapter: FullBackupRestoreAdapter,
): { prepare(records: readonly ArchivedMediaRecord[]): Promise<PreparedFullBackupMedia> } {
  return {
    async prepare(records) {
      const replacements: RestoredMediaRecord[] = [];
      const addedMediaIds: string[] = [];
      try {
        for (const record of records) {
          const restored = await adapter.restore(record);
          replacements.push(restored);
          if (restored.added && !addedMediaIds.includes(restored.mediaId)) {
            addedMediaIds.push(restored.mediaId);
          }
        }
      } catch (restoreError) {
        try {
          await adapter.rollback(addedMediaIds);
        } catch (rollbackError) {
          throw new AggregateError(
            [restoreError, rollbackError],
            'Full backup media restore and rollback both failed.',
          );
        }
        throw restoreError;
      }
      let rolledBack = false;
      return {
        replacements,
        addedMediaIds,
        async rollback() {
          if (rolledBack) return;
          await adapter.rollback(addedMediaIds);
          rolledBack = true;
        },
      };
    },
  };
}
