import { constants, type Dirent, type Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export class WorkspaceAccess {
  private bytesRemaining = 2 * 1024 * 1024;
  private entriesRemaining = 512;

  private constructor(
    readonly root: string,
    private readonly identity: Stats
  ) {}

  static async create(root: string): Promise<WorkspaceAccess> {
    if (!path.isAbsolute(root)) throw new Error('--workspace-root must be absolute');
    const canonical = await fs.realpath(root);
    const identity = await fs.stat(canonical);
    if (!identity.isDirectory()) throw new Error('--workspace-root must be a directory');
    return new WorkspaceAccess(canonical, identity);
  }

  async assertRoot(): Promise<void> {
    const current = await fs.lstat(this.root);
    if (
      current.isSymbolicLink() ||
      !current.isDirectory() ||
      current.dev !== this.identity.dev ||
      current.ino !== this.identity.ino ||
      (await fs.realpath(this.root)) !== this.root
    ) {
      throw new Error('Workspace root changed; restart the server with the intended root');
    }
  }

  resetBudget(): void {
    this.bytesRemaining = 2 * 1024 * 1024;
    this.entriesRemaining = 512;
  }

  private async inspect(target: string): Promise<Stats> {
    await this.assertRoot();
    const relative = path.relative(this.root, target);
    const parts = relative.split(path.sep);
    if (
      !relative ||
      path.isAbsolute(relative) ||
      parts.includes('..') ||
      parts.some((part) => /[:\\\x00]/.test(part))
    ) {
      throw new Error('Access denied: expected a workspace-relative artifact');
    }
    // Deliberately allow artifacts, not arbitrary workspace files or host settings.
    const normalized = parts.join('/');
    if (
      !/^(?:docs(?:\/|$)|\.specify$|\.specify\/(?:specs|commands)(?:\/|$)|(?:README|AGENTS|CLAUDE|hints)\.md$)/i.test(
        normalized
      ) ||
      parts.some((part) =>
        /^(?:\.env(?:\.|$)|\.(?:git|ssh|aws|azure|codex|npmrc)$)|(?:secret|credential|password|token|private[-_]?key)|\.(?:pem|key|p12|pfx)$/i.test(
          part
        )
      )
    ) {
      throw new Error(
        'Access denied: only non-secret Gofer and documentation artifacts are readable'
      );
    }
    let current = this.root;
    let result = this.identity;
    for (const part of parts) {
      current = path.join(current, part);
      result = await fs.lstat(current);
      if (result.isSymbolicLink())
        throw new Error('Access denied: symbolic links are not artifacts');
    }
    if ((await fs.realpath(target)) !== target)
      throw new Error('Access denied: artifact path changed');
    return result;
  }

  async readText(
    target: string,
    limit = 256 * 1024,
    truncate = false
  ): Promise<{ content: string; bytes: number; truncated: boolean }> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256 * 1024) {
      throw new Error('Invalid artifact byte limit');
    }
    const before = await this.inspect(target);
    if (!/\.(?:md|txt|json|ya?ml|log)$/i.test(target))
      throw new Error('Access denied: unsupported artifact file type');
    if (!before.isFile() || before.nlink !== 1)
      throw new Error('Access denied: expected a regular, unlinked artifact');
    if (!truncate && before.size > limit)
      throw new Error('Artifact exceeds the bounded read limit');
    const reservation = Math.min(before.size, limit) + 1;
    this.bytesRemaining -= reservation;
    if (this.bytesRemaining < 0) throw new Error('Workspace read budget exceeded');
    // Optional flags are not available on every Windows runtime. Identity checks
    // remain mandatory. This does not claim atomicity against parent-directory swaps.
    const handle = await fs.open(
      target,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
    );
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.nlink !== 1 ||
        opened.dev !== before.dev ||
        opened.ino !== before.ino ||
        opened.size !== before.size
      ) {
        throw new Error('Access denied: artifact changed while opening');
      }
      const buffer = Buffer.alloc(reservation);
      let count = 0;
      while (count < buffer.length) {
        const { bytesRead } = await handle.read(buffer, count, buffer.length - count, count);
        if (!bytesRead) break;
        count += bytesRead;
      }
      const after = await handle.stat();
      if (
        after.size !== opened.size ||
        after.mtimeMs !== opened.mtimeMs ||
        after.ctimeMs !== opened.ctimeMs
      ) {
        throw new Error('Access denied: artifact changed while reading');
      }
      const final = await this.inspect(target);
      if (final.dev !== opened.dev || final.ino !== opened.ino)
        throw new Error('Access denied: artifact replaced while reading');
      const length = Math.min(count, limit);
      // Avoid emitting a replacement character for a UTF-8 sequence split at the byte limit.
      const decoder = new TextDecoder('utf-8', { fatal: true });
      return {
        content: decoder.decode(buffer.subarray(0, length), { stream: count > limit }),
        bytes: opened.size,
        truncated: opened.size > limit,
      };
    } finally {
      await handle.close();
    }
  }

  async readDirectory(target: string): Promise<Dirent[]> {
    const before = await this.inspect(target);
    if (!before.isDirectory()) throw new Error('Expected an artifact directory');
    const entries: Dirent[] = [];
    const directory = await fs.opendir(target);
    for await (const entry of directory) {
      if (--this.entriesRemaining < 0) throw new Error('Workspace directory budget exceeded');
      if (entry.isSymbolicLink())
        throw new Error('Access denied: symbolic link in artifact directory');
      entries.push(entry);
    }
    await this.inspect(target);
    return entries;
  }
}
