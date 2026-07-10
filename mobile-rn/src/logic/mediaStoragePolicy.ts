export type MediaManifestEntry = {
  mediaId: string;
  fileUri: string;
  type: string;
  characterId?: string;
  sourceHint?: string;
  contentHash?: string;
  createdAt: number;
  size?: number;
};

export type CanonicalMediaDescriptor = {
  mediaId: string;
  contentHash: string;
  mimeType: string;
  extension: string;
  base64: string;
  bytes: Uint8Array;
};

export type ParsedBase64DataUri = Omit<CanonicalMediaDescriptor, 'mediaId' | 'contentHash'>;

export type MediaManifestAdapter = {
  read(): Promise<MediaManifestEntry[]>;
  replaceAtomically(entries: MediaManifestEntry[]): Promise<void>;
};

/** Result prepared while the manifest queue is held exclusively. */
export type MediaManifestMutation<Result> = {
  /** Omit to perform a read-only transaction without rewriting the manifest. */
  entries?: readonly MediaManifestEntry[];
  result: Result;
  /** Restores external side effects if the atomic manifest replacement fails. */
  rollback?: () => Promise<void>;
};

export type SerializedMediaManifestStore = {
  read(): Promise<MediaManifestEntry[]>;
  upsert(entry: MediaManifestEntry): Promise<MediaManifestEntry[]>;
  mutate<Result>(
    operation: (
      entries: readonly MediaManifestEntry[],
    ) => Promise<MediaManifestMutation<Result>>,
  ): Promise<Result>;
};

/** Minimal state edge required to calculate manifest reachability. */
export type MediaReachabilityReference = {
  key: string;
  uri: string;
  force: boolean;
};

/** Deterministic preview of active, collectible, and protected manifest rows. */
export type MediaGarbageCollectionPlan = {
  referenceCounts: Record<string, number>;
  reachableEntries: MediaManifestEntry[];
  candidateEntries: MediaManifestEntry[];
  protectedEntries: MediaManifestEntry[];
  unmanagedReferenceUris: string[];
  totalCandidateBytes: number;
};

/** Recoverable record for a file moved out of the active media directory. */
export type MediaTrashEntry = {
  entry: MediaManifestEntry;
  trashFileUri: string;
  trashedAt: number;
  status: 'prepared' | 'committed';
};

export type MediaGarbageCollectionResult = MediaGarbageCollectionPlan & {
  dryRun: boolean;
  trashedEntries: MediaTrashEntry[];
  missingReachableEntries: MediaManifestEntry[];
  missingCandidateEntries: MediaManifestEntry[];
};

export type MediaGarbageCollectionAdapter = {
  manifestStore: SerializedMediaManifestStore;
  readTrashManifest(): Promise<MediaTrashEntry[]>;
  replaceTrashManifest(entries: readonly MediaTrashEntry[]): Promise<void>;
  fileExists(fileUri: string): Promise<boolean>;
  moveFile(from: string, to: string): Promise<void>;
  removeFile(fileUri: string): Promise<void>;
  trashFileUri(entry: MediaManifestEntry, now: number): string;
};

export type MediaGarbageCollector = {
  collect(
    references: readonly MediaReachabilityReference[],
    options: { dryRun: boolean; mediaRootUri: string; now: number },
  ): Promise<MediaGarbageCollectionResult>;
  recoverInterruptedCollection(): Promise<{ restoredCount: number; committedCount: number }>;
  purge(options: { before: number; dryRun: boolean }): Promise<{
    dryRun: boolean;
    candidateEntries: MediaTrashEntry[];
    deletedCount: number;
    failedEntries: MediaTrashEntry[];
  }>;
};

export type AsyncSingleFlight<Key, Value> = {
  run(key: Key, operation: () => Promise<Value>): Promise<Value>;
};

export type CanonicalMediaAssetAdapter = {
  sha256(bytes: Uint8Array): Promise<string>;
  readManifest(): Promise<MediaManifestEntry[]>;
  verifyAsset(fileUri: string, expectedHash: string): Promise<{ size?: number } | undefined>;
  writeAssetAtomically(
    fileUri: string,
    base64: string,
    expectedHash: string,
  ): Promise<{ size?: number }>;
  upsertManifest(entry: MediaManifestEntry): Promise<void>;
  now(): number;
};

export type CanonicalMediaAssetStore = {
  externalize(
    dataUri: string,
    options: { assetDirectory: string; hint: string; characterId?: string },
  ): Promise<string | undefined>;
};

export type TextFileAdapter = {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, value: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
};

export type AtomicTextFilePaths = {
  primary: string;
  temporary: string;
  previous: string;
};

function normalizeMimeType(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  return 'jpg';
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function decodeBase64Bytes(value: string): Uint8Array | undefined {
  const compact = value.replace(/\s+/g, '');
  if (!compact || !/^[a-z0-9+/]*={0,2}$/i.test(compact)) return undefined;
  const withoutPadding = compact.replace(/=+$/, '');
  if (withoutPadding.length % 4 === 1) return undefined;
  const bytes = new Uint8Array(Math.floor(withoutPadding.length * 6 / 8));
  let accumulator = 0;
  let bitCount = 0;
  let outputIndex = 0;
  for (const character of withoutPadding) {
    const valueIndex = BASE64_ALPHABET.indexOf(character);
    if (valueIndex < 0) return undefined;
    accumulator = (accumulator << 6) | valueIndex;
    bitCount += 6;
    if (bitCount < 8) continue;
    bitCount -= 8;
    bytes[outputIndex] = (accumulator >> bitCount) & 0xff;
    outputIndex += 1;
    accumulator &= bitCount ? (1 << bitCount) - 1 : 0;
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;
    const packed = (first << 16) | (second << 8) | third;
    encoded += BASE64_ALPHABET[(packed >> 18) & 63];
    encoded += BASE64_ALPHABET[(packed >> 12) & 63];
    encoded += hasSecond ? BASE64_ALPHABET[(packed >> 6) & 63] : '=';
    encoded += hasThird ? BASE64_ALPHABET[packed & 63] : '=';
  }
  return encoded;
}

export function parseBase64DataUri(dataUri: string): ParsedBase64DataUri | undefined {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/i.exec(dataUri.trim());
  if (!match) return undefined;
  const mimeType = normalizeMimeType(match[1]);
  const bytes = decodeBase64Bytes(match[2]);
  if (!mimeType || !bytes?.length) return undefined;
  return {
    mimeType,
    extension: extensionForMimeType(mimeType),
    base64: encodeBase64(bytes),
    bytes,
  };
}

export function canonicalMediaDescriptor(
  dataUri: string,
  sha256Digest: string,
): CanonicalMediaDescriptor | undefined {
  const parsed = parseBase64DataUri(dataUri);
  return parsed ? canonicalMediaDescriptorFromParsed(parsed, sha256Digest) : undefined;
}

export function canonicalMediaDescriptorFromParsed(
  parsed: ParsedBase64DataUri,
  sha256Digest: string,
): CanonicalMediaDescriptor | undefined {
  const contentHash = sha256Digest.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(contentHash)) return undefined;
  return {
    ...parsed,
    mediaId: `asset_${contentHash}`,
    contentHash,
  };
}

export function upsertMediaManifestEntry(
  entries: readonly MediaManifestEntry[],
  entry: MediaManifestEntry,
): MediaManifestEntry[] {
  const sameId = entries.find(item => item.mediaId === entry.mediaId);
  if (sameId && sameId.fileUri !== entry.fileUri) {
    throw new Error(`Media manifest collision for ${entry.mediaId}`);
  }
  const sameFile = entries.find(item => item.fileUri === entry.fileUri);
  const previous = sameId || sameFile;
  const merged: MediaManifestEntry = {
    ...previous,
    ...entry,
    createdAt: previous?.createdAt ?? entry.createdAt,
  };
  return [
    ...entries.filter(item => item.mediaId !== entry.mediaId && item.fileUri !== entry.fileUri),
    merged,
  ];
}

export function parseMediaManifestText(value: string): MediaManifestEntry[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('Media manifest must be an array.');
  const mediaIds = new Set<string>();
  const fileUris = new Set<string>();
  for (const item of parsed) {
    const entry = item as Partial<MediaManifestEntry>;
    if (
      !item
      || typeof item !== 'object'
      || typeof entry.mediaId !== 'string'
      || !entry.mediaId.trim()
      || typeof entry.fileUri !== 'string'
      || !entry.fileUri.trim()
      || typeof entry.type !== 'string'
      || !entry.type.trim()
      || typeof entry.createdAt !== 'number'
      || !Number.isFinite(entry.createdAt)
      || entry.createdAt < 0
      || (entry.characterId !== undefined && typeof entry.characterId !== 'string')
      || (entry.sourceHint !== undefined && typeof entry.sourceHint !== 'string')
      || (entry.size !== undefined && (
        typeof entry.size !== 'number'
        || !Number.isFinite(entry.size)
        || entry.size < 0
      ))
      || (entry.contentHash !== undefined && !/^[a-f0-9]{64}$/.test(entry.contentHash))
    ) {
      throw new Error('Media manifest contains an invalid entry.');
    }
    const canonicalMatch = /^asset_([a-f0-9]{64})$/.exec(entry.mediaId);
    if (entry.mediaId.startsWith('asset_') && (
      !canonicalMatch
      || entry.contentHash !== canonicalMatch[1]
    )) {
      throw new Error('Canonical media manifest identity does not match its content hash.');
    }
    if (mediaIds.has(entry.mediaId) || fileUris.has(entry.fileUri)) {
      throw new Error('Media manifest contains duplicate asset identities.');
    }
    mediaIds.add(entry.mediaId);
    fileUris.add(entry.fileUri);
  }
  return parsed as MediaManifestEntry[];
}

export function createSerializedMediaManifestStore(
  adapter: MediaManifestAdapter,
): SerializedMediaManifestStore {
  let queueTail: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queueTail.catch(() => undefined).then(operation);
    queueTail = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    read() {
      return enqueue(async () => [...await adapter.read()]);
    },
    upsert(entry) {
      return enqueue(async () => {
        const current = await adapter.read();
        const next = upsertMediaManifestEntry(current, entry);
        await adapter.replaceAtomically(next);
        return next;
      });
    },
    mutate(operation) {
      return enqueue(async () => {
        const current = await adapter.read();
        const mutation = await operation([...current]);
        if (!mutation.entries) return mutation.result;
        try {
          await adapter.replaceAtomically([...mutation.entries]);
        } catch (replacementError) {
          if (mutation.rollback) {
            try {
              await mutation.rollback();
            } catch (rollbackError) {
              throw new AggregateError(
                [replacementError, rollbackError],
                'Media manifest replacement and rollback both failed.',
              );
            }
          }
          throw replacementError;
        }
        return mutation.result;
      });
    },
  };
}

/**
 * Calculates which manifest assets are still reachable without touching disk.
 *
 * Entries outside `mediaRootUri` are always protected because this app must not
 * move or delete files it does not own.
 */
export function planMediaGarbageCollection(
  references: readonly MediaReachabilityReference[],
  manifest: readonly MediaManifestEntry[],
  mediaRootUri: string,
): MediaGarbageCollectionPlan {
  const root = mediaRootUri.endsWith('/') ? mediaRootUri : `${mediaRootUri}/`;
  const referenceCounts: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const reference of references) {
    referenceCounts[reference.uri] = (referenceCounts[reference.uri] || 0) + 1;
  }
  const manifestUris = new Set(manifest.map(entry => entry.fileUri));
  const reachableEntries: MediaManifestEntry[] = [];
  const candidateEntries: MediaManifestEntry[] = [];
  const protectedEntries: MediaManifestEntry[] = [];
  for (const entry of manifest) {
    if (!isUriWithinRoot(entry.fileUri, root)) {
      protectedEntries.push(entry);
    } else if ((referenceCounts[entry.fileUri] || 0) > 0) {
      reachableEntries.push(entry);
    } else {
      candidateEntries.push(entry);
    }
  }
  const unmanagedReferenceUris = [...new Set(
    references
      .map(reference => reference.uri)
      .filter(uri => isUriWithinRoot(uri, root) && !manifestUris.has(uri)),
  )].sort();
  return {
    referenceCounts,
    reachableEntries,
    candidateEntries,
    protectedEntries,
    unmanagedReferenceUris,
    totalCandidateBytes: candidateEntries.reduce(
      (total, entry) => total + Number(entry.size || 0),
      0,
    ),
  };
}

/** Returns true only for a concrete descendant URI without traversal segments. */
export function isUriWithinRoot(uri: string, rootUri: string): boolean {
  const root = rootUri.endsWith('/') ? rootUri : `${rootUri}/`;
  if (!uri.startsWith(root)) return false;
  const relative = uri.slice(root.length);
  if (!relative) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(relative).replace(/\\/g, '/');
  } catch {
    return false;
  }
  return decoded.split('/').every(segment => (
    segment.length > 0 && segment !== '.' && segment !== '..'
  ));
}

/** Creates a serialized, rollback-capable media trash and purge service. */
export function createMediaGarbageCollector(
  adapter: MediaGarbageCollectionAdapter,
): MediaGarbageCollector {
  let maintenanceTail: Promise<void> = Promise.resolve();

  function enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = maintenanceTail.catch(() => undefined).then(operation);
    maintenanceTail = result.then(() => undefined, () => undefined);
    return result;
  }

  async function rollbackPrepared(
    previousTrash: readonly MediaTrashEntry[],
    prepared: readonly MediaTrashEntry[],
  ): Promise<void> {
    for (const trashEntry of [...prepared].reverse()) {
      const trashExists = await adapter.fileExists(trashEntry.trashFileUri);
      if (!trashExists) continue;
      const originalExists = await adapter.fileExists(trashEntry.entry.fileUri);
      if (originalExists) {
        await adapter.removeFile(trashEntry.trashFileUri);
      } else {
        await adapter.moveFile(trashEntry.trashFileUri, trashEntry.entry.fileUri);
      }
    }
    await adapter.replaceTrashManifest(previousTrash);
  }

  async function recoverUnlocked(): Promise<{ restoredCount: number; committedCount: number }> {
    return adapter.manifestStore.mutate(async manifest => {
      const trash = await adapter.readTrashManifest();
      const activeMediaIds = new Set(manifest.map(entry => entry.mediaId));
      const retained: MediaTrashEntry[] = [];
      let restoredCount = 0;
      let committedCount = 0;
      let changed = false;
      for (const trashEntry of trash) {
        if (trashEntry.status === 'committed') {
          retained.push(trashEntry);
          continue;
        }
        const originalExists = await adapter.fileExists(trashEntry.entry.fileUri);
        const trashExists = await adapter.fileExists(trashEntry.trashFileUri);
        if (activeMediaIds.has(trashEntry.entry.mediaId)) {
          if (trashExists && !originalExists) {
            await adapter.moveFile(trashEntry.trashFileUri, trashEntry.entry.fileUri);
          } else if (trashExists && originalExists) {
            await adapter.removeFile(trashEntry.trashFileUri);
          } else if (!originalExists) {
            throw new Error(`Prepared media asset is missing from both locations: ${trashEntry.entry.mediaId}`);
          }
          restoredCount += 1;
          changed = true;
          continue;
        }
        if (!trashExists && originalExists) {
          await adapter.moveFile(trashEntry.entry.fileUri, trashEntry.trashFileUri);
        } else if (!trashExists) {
          throw new Error(`Committed media trash file is missing: ${trashEntry.entry.mediaId}`);
        }
        retained.push({ ...trashEntry, status: 'committed' });
        committedCount += 1;
        changed = true;
      }
      if (changed) await adapter.replaceTrashManifest(retained);
      return { result: { restoredCount, committedCount } };
    });
  }

  return {
    collect(references, options) {
      return enqueue(async () => {
        await recoverUnlocked();
        const result = await adapter.manifestStore.mutate(async manifest => {
          const plan = planMediaGarbageCollection(
            references,
            manifest,
            options.mediaRootUri,
          );
          const missingReachableEntries: MediaManifestEntry[] = [];
          const missingCandidateEntries: MediaManifestEntry[] = [];
          const existingCandidateEntries: MediaManifestEntry[] = [];
          for (const entry of plan.reachableEntries) {
            if (!await adapter.fileExists(entry.fileUri)) missingReachableEntries.push(entry);
          }
          for (const entry of plan.candidateEntries) {
            if (await adapter.fileExists(entry.fileUri)) {
              existingCandidateEntries.push(entry);
            } else {
              missingCandidateEntries.push(entry);
            }
          }
          const baseResult: MediaGarbageCollectionResult = {
            ...plan,
            dryRun: options.dryRun,
            trashedEntries: [],
            missingReachableEntries,
            missingCandidateEntries,
          };
          if (options.dryRun || plan.candidateEntries.length === 0) {
            return { result: baseResult };
          }
          const previousTrash = await adapter.readTrashManifest();
          const prepared: MediaTrashEntry[] = existingCandidateEntries.map(entry => ({
            entry,
            trashFileUri: adapter.trashFileUri(entry, options.now),
            trashedAt: options.now,
            status: 'prepared',
          }));
          try {
            for (const trashEntry of prepared) {
              if (await adapter.fileExists(trashEntry.trashFileUri)) {
                throw new Error(`Media trash destination already exists: ${trashEntry.trashFileUri}`);
              }
            }
            if (prepared.length) {
              await adapter.replaceTrashManifest([...previousTrash, ...prepared]);
              for (const trashEntry of prepared) {
                await adapter.moveFile(trashEntry.entry.fileUri, trashEntry.trashFileUri);
              }
            }
          } catch (preparationError) {
            await rollbackPrepared(previousTrash, prepared);
            throw preparationError;
          }
          const candidateIds = new Set(plan.candidateEntries.map(entry => entry.mediaId));
          return {
            entries: manifest.filter(entry => !candidateIds.has(entry.mediaId)),
            result: { ...baseResult, trashedEntries: prepared },
            rollback: () => rollbackPrepared(previousTrash, prepared),
          };
        });
        if (result.trashedEntries.length) {
          const trash = await adapter.readTrashManifest();
          const committedKeys = new Set(result.trashedEntries.map(
            item => `${item.entry.mediaId}\u0000${item.trashFileUri}`,
          ));
          await adapter.replaceTrashManifest(trash.map(item => (
            committedKeys.has(`${item.entry.mediaId}\u0000${item.trashFileUri}`)
              ? { ...item, status: 'committed' }
              : item
          )));
        }
        return {
          ...result,
          trashedEntries: result.trashedEntries.map(item => ({
            ...item,
            status: 'committed',
          })),
        };
      });
    },
    recoverInterruptedCollection() {
      return enqueue(recoverUnlocked);
    },
    purge(options) {
      return enqueue(async () => {
        const trash = await adapter.readTrashManifest();
        const candidateEntries = trash.filter(
          entry => entry.status === 'committed' && entry.trashedAt <= options.before,
        );
        if (options.dryRun || candidateEntries.length === 0) {
          return {
            dryRun: options.dryRun,
            candidateEntries,
            deletedCount: 0,
            failedEntries: [],
          };
        }
        const failedEntries: MediaTrashEntry[] = [];
        const deletedKeys = new Set<string>();
        for (const entry of candidateEntries) {
          try {
            await adapter.removeFile(entry.trashFileUri);
            deletedKeys.add(`${entry.entry.mediaId}\u0000${entry.trashFileUri}`);
          } catch {
            failedEntries.push(entry);
          }
        }
        await adapter.replaceTrashManifest(trash.filter(entry => (
          !deletedKeys.has(`${entry.entry.mediaId}\u0000${entry.trashFileUri}`)
        )));
        return {
          dryRun: false,
          candidateEntries,
          deletedCount: deletedKeys.size,
          failedEntries,
        };
      });
    },
  };
}

export function createAsyncSingleFlight<Key, Value>(): AsyncSingleFlight<Key, Value> {
  const inFlight = new Map<Key, Promise<Value>>();
  return {
    run(key, operation) {
      const current = inFlight.get(key);
      if (current) return current;
      const result = operation();
      inFlight.set(key, result);
      void result.finally(() => {
        if (inFlight.get(key) === result) inFlight.delete(key);
      }).catch(() => undefined);
      return result;
    },
  };
}

export function createCanonicalMediaAssetStore(
  adapter: CanonicalMediaAssetAdapter,
): CanonicalMediaAssetStore {
  const writes = createAsyncSingleFlight<string, string | undefined>();
  return {
    async externalize(dataUri, options) {
      const parsed = parseBase64DataUri(dataUri);
      if (!parsed) return undefined;
      const descriptor = canonicalMediaDescriptorFromParsed(parsed, await adapter.sha256(parsed.bytes));
      if (!descriptor) return undefined;
      return writes.run(descriptor.mediaId, async () => {
        const manifest = await adapter.readManifest();
        const existingEntry = manifest.find(entry => entry.mediaId === descriptor.mediaId);
        const fileUri = canonicalAssetFileUri(manifest, descriptor, options.assetDirectory);
        const verified = await adapter.verifyAsset(fileUri, descriptor.contentHash)
          || await adapter.writeAssetAtomically(fileUri, descriptor.base64, descriptor.contentHash);
        await adapter.upsertManifest({
          mediaId: descriptor.mediaId,
          fileUri,
          type: existingEntry?.type || descriptor.mimeType,
          characterId: options.characterId || existingEntry?.characterId,
          sourceHint: existingEntry?.sourceHint || options.hint,
          contentHash: descriptor.contentHash,
          createdAt: existingEntry?.createdAt ?? adapter.now(),
          size: verified.size,
        });
        return fileUri;
      });
    },
  };
}

export function canonicalAssetFileUri(
  entries: readonly MediaManifestEntry[],
  descriptor: CanonicalMediaDescriptor,
  assetDirectory: string,
): string {
  const existing = entries.find(entry => entry.mediaId === descriptor.mediaId);
  const directory = assetDirectory.endsWith('/') ? assetDirectory : `${assetDirectory}/`;
  if (existing) {
    const fileName = existing.fileUri.startsWith(directory)
      ? existing.fileUri.slice(directory.length)
      : '';
    if (new RegExp(`^${descriptor.mediaId}\\.[a-z0-9]+$`, 'i').test(fileName)) {
      return existing.fileUri;
    }
    throw new Error(`Canonical media path collision for ${descriptor.mediaId}`);
  }
  return `${directory}${descriptor.mediaId}.${descriptor.extension}`;
}

export async function replaceTextFileAtomically<T>(
  adapter: TextFileAdapter,
  paths: AtomicTextFilePaths,
  value: string,
  validate: (storedValue: string) => T,
): Promise<void> {
  await adapter.write(paths.temporary, value);
  validate(await adapter.read(paths.temporary));
  let rotatedPrimary = false;
  if (await adapter.exists(paths.primary)) {
    const primaryValue = await adapter.read(paths.primary);
    let primaryIsValid = true;
    try {
      validate(primaryValue);
    } catch {
      primaryIsValid = false;
    }
    if (primaryIsValid) {
      if (await adapter.exists(paths.previous)) {
        await adapter.remove(paths.previous);
      }
      await adapter.move(paths.primary, paths.previous);
      rotatedPrimary = true;
    } else {
      await adapter.remove(paths.primary);
    }
  }
  try {
    await adapter.move(paths.temporary, paths.primary);
    validate(await adapter.read(paths.primary));
  } catch (replacementError) {
    if (await adapter.exists(paths.primary)) {
      await adapter.remove(paths.primary);
    }
    if (rotatedPrimary && await adapter.exists(paths.previous)) {
      await adapter.move(paths.previous, paths.primary);
    }
    if (await adapter.exists(paths.temporary)) {
      await adapter.remove(paths.temporary);
    }
    throw replacementError;
  }
}
