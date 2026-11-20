import type { WorkspaceFile } from '../types/workspace';

/**
 * Filters and ranks files in the active workspace by query string.
 * Supports case-insensitive multi-token matching against file path and language,
 * ranking exact/basename matches above general path matches.
 */
export function filterWorkspaceFiles(
  files: WorkspaceFile[],
  query: string,
): WorkspaceFile[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return files;
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const scored: Array<{ file: WorkspaceFile; score: number }> = [];

  for (const file of files) {
    const pathLower = file.path.toLowerCase();
    const langLower = file.language.toLowerCase();
    const basename = pathLower.split('/').pop() ?? pathLower;
    const haystack = `${pathLower} ${langLower}`;

    if (!tokens.every((t) => haystack.includes(t))) {
      continue;
    }

    let score = 0;
    if (basename === normalized) score += 100;
    else if (basename.startsWith(normalized)) score += 60;
    else if (basename.includes(normalized)) score += 40;
    else if (pathLower.includes(normalized)) score += 20;
    else score += 10;

    scored.push({ file, score });
  }

  scored.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
  return scored.map((entry) => entry.file);
}
