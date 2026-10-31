/**
 * Optional hooks into the claude.ai page runtime. When the game runs as a published Claude page,
 * these let it save files and hand a save to Claude; elsewhere they quietly report "unavailable".
 */
interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}
interface DownloadsApi {
  save(request: { filename: string; data: Blob | string }): Promise<{ status: string }>;
}
interface AssetsApi {
  upload(blob: Blob): Promise<{ id: string; sizeBytes: number }>;
}

function runtime(): ClaudeRuntime | undefined {
  return (window as unknown as { claude?: ClaudeRuntime }).claude;
}

async function use<T>(name: string): Promise<T | null> {
  try {
    return ((await runtime()?.use(name)) as T | null | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Offers a file through the page runtime. Returns false when the runtime can't (use a normal download). */
export async function saveFileViaClaude(filename: string, data: Blob): Promise<boolean | 'declined'> {
  const downloads = await use<DownloadsApi>('downloads');
  if (!downloads) return false;
  try {
    await downloads.save({ filename, data });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === 'declined') return 'declined';
    return false;
  }
}

/** Uploads a file Claude can read from this page. Returns the asset id, or null when not possible here. */
export async function sendFileToClaude(data: Blob): Promise<string | null> {
  const assets = await use<AssetsApi>('assets');
  if (!assets) return null;
  const result = await assets.upload(data);
  return result.id;
}
