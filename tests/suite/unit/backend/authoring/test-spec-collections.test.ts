import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Gofer specification test-collection authoring contract', () => {
  const taskCommand = read('.specify/commands/4_gofer_tasks.md');
  const canonicalTemplates = [
    '.specify/templates/spec-template.md',
    '.specify/templates/plan-template.md',
    '.specify/templates/tasks-template.md',
    '.specify/templates/issues-template.md',
  ].map(read);

  it('requires a companion test specification for every feature scope', () => {
    expect(taskCommand).toContain('including non-app, tooling and documentation-only specs');
    expect(taskCommand).toContain('companion Markdown `test-spec.md` beside `spec.md`');
    expect(taskCommand).toMatch(/Documentation-only\s+specs map their ACs to document checks/);
    expect(canonicalTemplates.join('\n')).toContain('test-spec.md');
  });

  it('requires canonical test placement and identity-based collection proof', () => {
    expect(taskCommand).toContain(
      "All new executable tests must use the owning repo's `tests/` target family"
    );
    expect(taskCommand).toContain(
      'unsupported discovery, create an explicit adapter/migration prerequisite'
    );
    expect(taskCommand).toContain('exact named runner case IDs mapped to stable test IDs');
    expect(taskCommand).toContain('exact source/test revision');
    expect(taskCommand).toContain('equal counts with different cases fail collection verification');
  });

  it('requires controlled parallel execution and fail-closed required test gaps', () => {
    expect(taskCommand).toContain(
      'Parallel execution of independent selected test groups is a delivery requirement'
    );
    expect(taskCommand).toMatch(/overlapping\s+start\/end times, worker\/lane identities/);
    expect(taskCommand).toContain('conflicting groups and dependent CRUD phases serialize');
    expect(taskCommand).toMatch(/Required-stage or blocking gaps fail closed/);
    expect(taskCommand).toContain('never print an unconditional pass');
  });

  it('keeps generated-resource authoring mirrors byte-identical', () => {
    const mirrors: Array<[string, string]> = [
      [
        '.specify/commands/4_gofer_tasks.md',
        'extension/resources/specify-commands/4_gofer_tasks.md',
      ],
      ['.specify/templates/spec-template.md', 'extension/resources/templates/spec-template.md'],
      ['.specify/templates/plan-template.md', 'extension/resources/templates/plan-template.md'],
      ['.specify/templates/tasks-template.md', 'extension/resources/templates/tasks-template.md'],
      ['.specify/templates/issues-template.md', 'extension/resources/templates/issues-template.md'],
    ];

    for (const [canonical, mirror] of mirrors) {
      expect(read(mirror), mirror).toBe(read(canonical));
    }
  });
});
