import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ts from 'typescript';
import {
  GOFER_PORTABLE_SCAFFOLD_PATHS,
  GOFER_ORCHESTRATION_SCAFFOLD_PATHS,
  GOFER_ORCHESTRATION_PORTABLE_SCAFFOLD_PATHS,
  GOFER_MODEL_DISCOVERY_SCAFFOLD_PATHS,
  GOFER_MODEL_DISCOVERY_PORTABLE_SCAFFOLD_PATHS,
  GOFER_STAGE_EXECUTION_SCAFFOLD_PATHS,
  GOFER_STAGE_EXECUTION_PORTABLE_SCAFFOLD_PATHS,
  assertPortableGoferScaffold,
  assertPortableOrDeclaredGoferFiles,
  isPortableGoferScaffoldPath,
  createGoferScaffoldInventoryDigest,
} from '../../../src/headless/portableScaffold.js';
import { createValidExportFixture, TEST_GOFER_RELEASE_DESCRIPTOR } from './fixtures.js';

describe('versioned portable orchestration scaffold', () => {
  it('keeps all three historical inventory digests unchanged', () => {
    expect(
      [
        GOFER_PORTABLE_SCAFFOLD_PATHS,
        GOFER_ORCHESTRATION_PORTABLE_SCAFFOLD_PATHS,
        GOFER_MODEL_DISCOVERY_PORTABLE_SCAFFOLD_PATHS,
      ].map(createGoferScaffoldInventoryDigest)
    ).toEqual([
      '8365099072e5ed9956476f3732f24573df28d7f05c71bd68e38d3751ed216750',
      'c559e2d4691f236813138996355696f2f2ac6c98bb77806c83db556c362f6459',
      'c6357d737b1fc45807f7ad6093fe88fa0a0a2ffc5e1e01fc7c96cdaa66d055da',
    ]);
  });

  it('requires the complete execution inventory and rejects newer files with older descriptors', () => {
    expect(GOFER_STAGE_EXECUTION_PORTABLE_SCAFFOLD_PATHS).toHaveLength(188);
    expect(new Set(GOFER_STAGE_EXECUTION_PORTABLE_SCAFFOLD_PATHS).size).toBe(188);
    const files = GOFER_STAGE_EXECUTION_PORTABLE_SCAFFOLD_PATHS.map((path) => ({
      path,
      encoding: 'utf8' as const,
      content:
        path === '.specify/.gofer-version' ? TEST_GOFER_RELEASE_DESCRIPTOR.version : 'fixture',
    }));
    const descriptor = {
      ...TEST_GOFER_RELEASE_DESCRIPTOR,
      inventoryDigest: createGoferScaffoldInventoryDigest(
        GOFER_STAGE_EXECUTION_PORTABLE_SCAFFOLD_PATHS
      ),
    };
    expect(() => assertPortableGoferScaffold(files, descriptor)).not.toThrow();
    expect(() => assertPortableOrDeclaredGoferFiles(files, new Set())).not.toThrow();
    for (const missing of GOFER_STAGE_EXECUTION_PORTABLE_SCAFFOLD_PATHS) {
      expect(() =>
        assertPortableGoferScaffold(
          files.filter((file) => file.path !== missing),
          descriptor
        )
      ).toThrow(`scaffold is missing ${missing}`);
    }
    for (const inventory of [
      GOFER_PORTABLE_SCAFFOLD_PATHS,
      GOFER_ORCHESTRATION_PORTABLE_SCAFFOLD_PATHS,
      GOFER_MODEL_DISCOVERY_PORTABLE_SCAFFOLD_PATHS,
    ]) {
      const oldFiles = files.filter((file) => inventory.includes(file.path));
      const oldDescriptor = {
        ...descriptor,
        inventoryDigest: createGoferScaffoldInventoryDigest(inventory),
      };
      expect(() => assertPortableGoferScaffold(oldFiles, oldDescriptor)).not.toThrow();
      for (const added of GOFER_STAGE_EXECUTION_SCAFFOLD_PATHS) {
        expect(() =>
          assertPortableGoferScaffold(
            [...oldFiles, files.find((file) => file.path === added)!],
            oldDescriptor
          )
        ).toThrow('Stage execution scaffold files require a matching release inventory descriptor');
      }
    }
    expect(() =>
      assertPortableGoferScaffold(files, { ...descriptor, inventoryDigest: '0'.repeat(64) })
    ).toThrow('inventory digest does not match');
    expect(() =>
      assertPortableOrDeclaredGoferFiles(
        [{ path: '.specify/specs/private.json', encoding: 'utf8', content: '{}' }],
        new Set()
      )
    ).toThrow('undeclared runtime file');
  });

  it('loads the exported bridge and includes transitive packager dependencies without execution', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const exported = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-stage-inventory-'));
    const visited = new Set<string>();
    function copyDependency(relative: string): void {
      if (visited.has(relative)) return;
      expect(
        isPortableGoferScaffoldPath(relative),
        `Missing portable dependency: ${relative}`
      ).toBe(true);
      visited.add(relative);
      const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
      const target = path.join(exported, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
      for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
        if (imported.fileName.startsWith('.')) {
          copyDependency(
            path.posix.normalize(path.posix.join(path.posix.dirname(relative), imported.fileName))
          );
        }
      }
    }
    try {
      copyDependency('.specify/scripts/node/gofer-stage-execute.mjs');
      copyDependency('.specify/scripts/node/package-agent-plugin.mjs');
      for (const added of GOFER_STAGE_EXECUTION_SCAFFOLD_PATHS)
        expect(visited.has(added)).toBe(true);
      const run = promisify(execFile);
      const bridge = path.join(exported, '.specify/scripts/node/gofer-stage-execute.mjs');
      const options = {
        cwd: exported,
        timeout: 10000,
        env: { ...process.env, PATH: '', HOME: exported, USERPROFILE: exported },
      };
      expect((await run(process.execPath, [bridge, '--help'], options)).stdout).toContain(
        'Internal stage bridge'
      );
      const { stdout } = await run(process.execPath, [bridge], options);
      expect(JSON.parse(stdout)).toEqual({
        status: 'legacy',
        reason: 'execution_not_requested',
        canClaimDone: false,
      });
      expect(fs.existsSync(path.join(exported, '.specify/specs'))).toBe(false);
    } finally {
      fs.rmSync(exported, { recursive: true, force: true });
    }
  });

  it('adds discovery without changing either earlier inventory', () => {
    expect(GOFER_ORCHESTRATION_PORTABLE_SCAFFOLD_PATHS).toHaveLength(182);
    expect(GOFER_MODEL_DISCOVERY_PORTABLE_SCAFFOLD_PATHS).toHaveLength(184);
    const files = [
      ...createValidExportFixture().files,
      ...[...GOFER_ORCHESTRATION_SCAFFOLD_PATHS, ...GOFER_MODEL_DISCOVERY_SCAFFOLD_PATHS].map(
        (path) => ({
          path,
          content: 'fixture',
          encoding: 'utf8' as const,
        })
      ),
    ];
    const descriptor = {
      ...TEST_GOFER_RELEASE_DESCRIPTOR,
      inventoryDigest: createGoferScaffoldInventoryDigest(
        GOFER_MODEL_DISCOVERY_PORTABLE_SCAFFOLD_PATHS
      ),
    };
    expect(() => assertPortableGoferScaffold(files, descriptor)).not.toThrow();
    for (const missing of [
      ...GOFER_ORCHESTRATION_SCAFFOLD_PATHS,
      ...GOFER_MODEL_DISCOVERY_SCAFFOLD_PATHS,
    ]) {
      expect(() =>
        assertPortableGoferScaffold(
          files.filter((file) => file.path !== missing),
          descriptor
        )
      ).toThrow(`scaffold is missing ${missing}`);
    }
    expect(() =>
      assertPortableGoferScaffold(files, {
        ...descriptor,
        inventoryDigest: createGoferScaffoldInventoryDigest(
          GOFER_ORCHESTRATION_PORTABLE_SCAFFOLD_PATHS
        ),
      })
    ).toThrow('Model discovery scaffold files require a matching release inventory descriptor');
  });

  it('retains the historical inventory and accepts its original release descriptor', () => {
    expect(GOFER_PORTABLE_SCAFFOLD_PATHS).toHaveLength(178);
    expect(createGoferScaffoldInventoryDigest(GOFER_PORTABLE_SCAFFOLD_PATHS)).toBe(
      TEST_GOFER_RELEASE_DESCRIPTOR.inventoryDigest
    );
    expect(() =>
      assertPortableGoferScaffold(createValidExportFixture().files, TEST_GOFER_RELEASE_DESCRIPTOR)
    ).not.toThrow();
  });

  it('requires every helper file when the descriptor opts into the new inventory', () => {
    const descriptor = {
      ...TEST_GOFER_RELEASE_DESCRIPTOR,
      inventoryDigest: createGoferScaffoldInventoryDigest(
        GOFER_ORCHESTRATION_PORTABLE_SCAFFOLD_PATHS
      ),
    };
    const files = [
      ...createValidExportFixture().files,
      ...GOFER_ORCHESTRATION_SCAFFOLD_PATHS.map((path) => ({
        path,
        content: 'fixture',
        encoding: 'utf8' as const,
      })),
    ];
    expect(() => assertPortableGoferScaffold(files, descriptor)).not.toThrow();
    for (const missing of GOFER_ORCHESTRATION_SCAFFOLD_PATHS) {
      expect(() =>
        assertPortableGoferScaffold(
          files.filter((file) => file.path !== missing),
          descriptor
        )
      ).toThrow(`scaffold is missing ${missing}`);
    }
    expect(() => assertPortableGoferScaffold(files, TEST_GOFER_RELEASE_DESCRIPTOR)).toThrow(
      'matching release inventory descriptor'
    );
  });
});
