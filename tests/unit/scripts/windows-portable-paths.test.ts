import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const WINDOWS_SAFE_RELATIVE_PATH_LIMIT = 240;
const WINDOWS_FORBIDDEN_SEGMENT_CHARS = new Set(['<', '>', ':', '"', '\\', '|', '?', '*']);
const WINDOWS_RESERVED_BASENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
}

function describeWindowsUnsafePath(relativePath: string): string | null {
  if (relativePath.length > WINDOWS_SAFE_RELATIVE_PATH_LIMIT) {
    return `longer than ${WINDOWS_SAFE_RELATIVE_PATH_LIMIT} characters`;
  }

  for (const segment of relativePath.split('/').filter(Boolean)) {
    if (hasWindowsForbiddenSegmentChar(segment)) {
      return `segment "${segment}" contains a Windows-forbidden character`;
    }
    if (/[ .]$/.test(segment)) {
      return `segment "${segment}" ends with a dot or space`;
    }
    if (WINDOWS_RESERVED_BASENAME.test(segment)) {
      return `segment "${segment}" is a Windows reserved device name`;
    }
  }

  return null;
}

function hasWindowsForbiddenSegmentChar(segment: string): boolean {
  for (const char of segment) {
    if (WINDOWS_FORBIDDEN_SEGMENT_CHARS.has(char) || char.charCodeAt(0) < 32) {
      return true;
    }
  }

  return false;
}

describe('Windows portable repository paths', () => {
  it('keeps every Git-tracked path checkout-safe on Windows', () => {
    const offenders = trackedFiles()
      .map((relativePath) => ({
        relativePath,
        reason: describeWindowsUnsafePath(relativePath),
      }))
      .filter((entry): entry is { relativePath: string; reason: string } => entry.reason !== null)
      .map((entry) => `${entry.relativePath} (${entry.reason})`);

    expect(offenders).toEqual([]);
  });
});
