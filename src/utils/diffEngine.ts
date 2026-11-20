export interface DiffLine {
  type: 'same' | 'add' | 'remove';
  lineNumberOld: number | null;
  lineNumberNew: number | null;
  text: string;
}

export function computeLineDiff(before: string, after: string): DiffLine[] {
  const oldLines = before === '' ? [] : before.split('\n');
  const newLines = after === '' ? [] : after.split('\n');

  const n = oldLines.length;
  const m = newLines.length;

  // Guard for very large files: fall back to clean replace summary
  if (n * m > 250000) {
    return [
      ...oldLines.map((text, idx) => ({
        type: 'remove' as const,
        lineNumberOld: idx + 1,
        lineNumberNew: null,
        text,
      })),
      ...newLines.map((text, idx) => ({
        type: 'add' as const,
        lineNumberOld: null,
        lineNumberNew: idx + 1,
        text,
      })),
    ];
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      result.push({
        type: 'same',
        lineNumberOld: i + 1,
        lineNumberNew: j + 1,
        text: oldLines[i],
      });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({
        type: 'remove',
        lineNumberOld: i + 1,
        lineNumberNew: null,
        text: oldLines[i],
      });
      i++;
    } else {
      result.push({
        type: 'add',
        lineNumberOld: null,
        lineNumberNew: j + 1,
        text: newLines[j],
      });
      j++;
    }
  }

  while (i < n) {
    result.push({
      type: 'remove',
      lineNumberOld: i + 1,
      lineNumberNew: null,
      text: oldLines[i],
    });
    i++;
  }
  while (j < m) {
    result.push({
      type: 'add',
      lineNumberOld: null,
      lineNumberNew: j + 1,
      text: newLines[j],
    });
    j++;
  }

  return result;
}

export function extractAtMentions(input: string): string[] {
  const matches = input.match(/@([a-zA-Z0-9._/-]+)/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.slice(1))));
}
