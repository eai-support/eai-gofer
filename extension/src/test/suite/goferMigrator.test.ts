import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { GoferMigrator } from '../../goferMigrator';

suite('GoferMigrator Test Suite', function() {
  this.timeout(10000);
  let tempDir: string;
  let migrator: GoferMigrator;

  setup(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-migrator-test-'));
    // Create fresh migrator for each test
    migrator = new GoferMigrator(tempDir);
  });

  teardown(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  suite('Format Detection', () => {
    test('should detect no .specify folder', async () => {
      const exists = await migrator.exists();
      assert.strictEqual(exists, false);

      const format = await migrator.detectFormat();
      assert.strictEqual(format, 'none');
    });

    test('should detect legacy JSON format', async () => {
      await createLegacyJsonStructure();

      const exists = await migrator.exists();
      assert.strictEqual(exists, true);

      const format = await migrator.detectFormat();
      assert.strictEqual(format, 'legacy-json');
    });

    test('should detect Gofer format', async () => {
      await createGoferStructure();

      const format = await migrator.detectFormat();
      assert.strictEqual(format, 'gofer');
    });

    test('should detect mixed format', async () => {
      await createGoferStructure();
      await createLegacyJsonFiles();

      const format = await migrator.detectFormat();
      assert.strictEqual(format, 'mixed');
    });
  });

  suite('Version Info', () => {
    test('should provide version info for non-existent folder', async () => {
      const versionInfo = await migrator.getVersionInfo();

      assert.strictEqual(versionInfo.format, 'none');
      assert.strictEqual(versionInfo.needsUpgrade, false);
      assert.ok(versionInfo.details.includes('No .specify'));
    });

    test('should provide version info for legacy format', async () => {
      await createLegacyJsonStructure();
      const versionInfo = await migrator.getVersionInfo();
      assert.strictEqual(versionInfo.format, 'legacy-json');
      assert.strictEqual(versionInfo.needsUpgrade, true);
      assert.ok(versionInfo.details.includes('Old JSON'));
    });

    test('should provide version info for current Gofer format', async () => {
      await createGoferStructure();
      const versionInfo = await migrator.getVersionInfo();
      assert.strictEqual(versionInfo.format, 'gofer');
      assert.strictEqual(versionInfo.needsUpgrade, false);
      assert.ok(versionInfo.details.includes('Gofer format'));
    });

    test('should indicate upgrade needed for mixed format', async () => {
      await createGoferStructure();
      await createLegacyJsonFiles();

      const versionInfo = await migrator.getVersionInfo();

      assert.strictEqual(versionInfo.format, 'mixed');
      assert.strictEqual(versionInfo.needsUpgrade, true);
      assert.ok(versionInfo.details.toLowerCase().includes('mixed'));
    });
  });

  suite('Migration Process', () => {
    test('should migrate legacy JSON to Gofer format', async () => {
      await createLegacyJsonStructure();

      // Verify initial state
      let format = await migrator.detectFormat();
      assert.strictEqual(format, 'legacy-json');

      // Perform migration
      await migrator.upgrade({ skipConfirmation: true });

      // Verify migration completed
      format = await migrator.detectFormat();
      assert.strictEqual(format, 'gofer');

      // Check that Gofer structure exists
      const specsDir = path.join(tempDir, '.specify', 'specs');
      const memoryDir = path.join(tempDir, '.specify', 'memory');
      const templatesDir = path.join(tempDir, '.specify', 'templates');
      const originalSpecJson = path.join(tempDir, '.specify', '001-test.json');
      const originalConfigJson = path.join(tempDir, '.specify', 'config.json');
      const backupSpecJson = path.join(tempDir, '.specify', '_backup', '001-test.json');
      const backupConfigJson = path.join(tempDir, '.specify', '_backup', 'config.json');

      assert.ok(await directoryExists(specsDir));
      assert.ok(await directoryExists(memoryDir));
      assert.ok(await directoryExists(templatesDir));
      assert.ok(!(await fileExists(originalSpecJson)));
      assert.ok(!(await fileExists(originalConfigJson)));
      assert.ok(await fileExists(backupSpecJson));
      assert.ok(await fileExists(backupConfigJson));
    });

    test('should preserve data during migration', async () => {
      await createLegacyJsonStructureWithData();

      // Perform migration
      await migrator.upgrade({ skipConfirmation: true });

      // Check that spec data was preserved
      const specDir = path.join(tempDir, '.specify', 'specs', '001-test-feature');
      const specFile = path.join(specDir, 'spec.md');

      assert.ok(await fileExists(specFile));

      const specContent = await fs.readFile(specFile, 'utf-8');
      assert.ok(specContent.includes('---')); // YAML frontmatter
      assert.ok(specContent.includes('id: "001-test-feature"'));
      assert.ok(specContent.includes('title: "Test Feature"'));
      assert.ok(specContent.includes('# Test Feature')); // Markdown content
    });

    test('should create backup of original files', async () => {
      await createLegacyJsonStructure();

      // Perform migration
      await migrator.upgrade({ skipConfirmation: true });

      // Check that backup was created
      const backupDir = path.join(tempDir, '.specify', '_backup');
      assert.ok(await directoryExists(backupDir));

      // Check that original JSON files exist in backup
      const backupFiles = await fs.readdir(backupDir);
      const hasJsonBackup = backupFiles.some((file) => file.endsWith('.json'));
      assert.ok(hasJsonBackup);
    });

    test('should handle migration of empty legacy structure', async () => {
      // Create empty .specify directory
      const specifyDir = path.join(tempDir, '.specify');
      await fs.mkdir(specifyDir, { recursive: true });

      // Perform migration
      await migrator.upgrade({ skipConfirmation: true });

      // Should create basic Gofer structure
      const format = await migrator.detectFormat();
      assert.strictEqual(format, 'gofer');
    });
  });

  suite('Error Handling', () => {
    test('should handle migration of already migrated folder gracefully', async () => {
      await createGoferStructure();

      // Try to upgrade already migrated folder
      try {
        await migrator.upgrade({ skipConfirmation: true });
        // Should not throw error
      } catch (error) {
        assert.fail(`Migration should handle already migrated folder gracefully: ${error}`);
      }
    });

    test('should handle invalid JSON files during migration', async () => {
      // Create .specify with invalid JSON
      const specifyDir = path.join(tempDir, '.specify');
      await fs.mkdir(specifyDir, { recursive: true });

      const invalidJson = '{ invalid: json content }';
      await fs.writeFile(path.join(specifyDir, 'invalid.json'), invalidJson);

      // Migration should handle gracefully
      try {
        await migrator.upgrade({ skipConfirmation: true });
      } catch (error) {
        // Some error handling is expected for invalid JSON
        assert.ok(error instanceof Error);
      }
    });
  });

  // Helper functions
  async function createLegacyJsonStructure(): Promise<void> {
    const specifyDir = path.join(tempDir, '.specify');
    await fs.mkdir(specifyDir, { recursive: true });

    // Create some legacy JSON files
    const legacySpec = {
      id: '001-test',
      title: 'Test Spec',
      status: 'draft',
    };

    await fs.writeFile(path.join(specifyDir, '001-test.json'), JSON.stringify(legacySpec, null, 2));

    await fs.writeFile(
      path.join(specifyDir, 'config.json'),
      JSON.stringify({ version: '1.0' }, null, 2)
    );
  }

  async function createLegacyJsonStructureWithData(): Promise<void> {
    const specifyDir = path.join(tempDir, '.specify');
    await fs.mkdir(specifyDir, { recursive: true });

    const legacySpec = {
      id: '001-test-feature',
      title: 'Test Feature',
      description: 'A test feature for migration',
      status: 'draft',
      created: '2025-10-22',
      tasks: [
        {
          id: 'T001',
          description: 'Create basic structure',
          status: 'pending',
          dependencies: [],
        },
        {
          id: 'T002',
          description: 'Add functionality',
          status: 'pending',
          dependencies: ['T001'],
        },
      ],
    };

    await fs.writeFile(
      path.join(specifyDir, '001-test-feature.json'),
      JSON.stringify(legacySpec, null, 2)
    );
  }

  async function createGoferStructure(): Promise<void> {
    const specifyDir = path.join(tempDir, '.specify');
    await fs.mkdir(path.join(specifyDir, 'specs'), { recursive: true });
    await fs.mkdir(path.join(specifyDir, 'memory'), { recursive: true });
    await fs.mkdir(path.join(specifyDir, 'templates'), { recursive: true });
    await fs.mkdir(path.join(specifyDir, 'commands'), { recursive: true });

    // Create a basic constitution
    const constitution = `# Project Constitution

## I. Test-Driven Development

All code must have tests.
`;

    await fs.writeFile(path.join(specifyDir, 'memory', 'constitution.md'), constitution);
  }

  async function createLegacyJsonFiles(): Promise<void> {
    const specifyDir = path.join(tempDir, '.specify');

    const legacyFile = {
      id: 'legacy-item',
      title: 'Legacy Item',
    };

    await fs.writeFile(path.join(specifyDir, 'legacy.json'), JSON.stringify(legacyFile, null, 2));
  }

  async function directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async function fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
});
