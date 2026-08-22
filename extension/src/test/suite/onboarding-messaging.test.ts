import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

interface ViewsWelcomeEntry {
  view: string;
  contents: string;
}

interface ExtensionPackageContributes {
  viewsWelcome?: readonly ViewsWelcomeEntry[];
}

interface ExtensionPackageShape {
  displayName?: string;
  description?: string;
  contributes?: ExtensionPackageContributes;
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function resolveRepoRoot(): string {
  const candidates = [process.cwd(), path.resolve(process.cwd(), '..')];
  const repoRoot = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, '.specify', 'commands'))
  );
  assert.ok(repoRoot, `Unable to resolve repo root from ${process.cwd()}`);
  return repoRoot;
}

function readExtensionPackage(): ExtensionPackageShape {
  const raw = readFile(path.join(resolveRepoRoot(), 'extension', 'package.json'));
  return JSON.parse(raw) as ExtensionPackageShape;
}

suite('onboarding messaging', () => {
  test('keeps the extension onboarding copy aligned with the public Gofer positioning', () => {
    const packageJson = readExtensionPackage();
    const displayName = packageJson.displayName ?? '';
    const description = packageJson.description ?? '';
    const welcomeContents =
      packageJson.contributes?.viewsWelcome?.find(
        (entry: ViewsWelcomeEntry) => entry.view === 'goferProgress'
      )?.contents ?? '';

    assert.ok(displayName.includes('Gofer'));
    assert.ok(description.includes('/eai'));
    assert.ok(description.includes('core Gofer pipeline'));
    assert.ok(welcomeContents.includes('/eai'));
    assert.ok(welcomeContents.includes('research'));
    assert.ok(welcomeContents.includes('validate'));
  });

  test('keeps public Gofer messaging aligned across docs and extension initialization surface', () => {
    const repoRoot = resolveRepoRoot();
    const extensionReadme = readFile(path.join(repoRoot, 'extension', 'README.md'));
    const rootReadme = readFile(path.join(repoRoot, 'README.md'));
    const extensionSource = readFile(path.join(repoRoot, 'extension', 'src', 'extension.ts'));

    assert.ok(extensionReadme.includes('Gofer VS Code Extension'));
    assert.ok(extensionReadme.includes('/eai'));
    assert.deepStrictEqual(
      Array.from(extensionReadme.matchAll(/\]\(([^)]+)\)/g))
        .map((match) => match[1])
        .filter((link) => link.startsWith('./') || link.startsWith('../')),
      [],
      'extension README links must be Marketplace-safe absolute URLs'
    );
    assert.ok(rootReadme.includes('business specification-driven delivery workflow'));
    assert.ok(
      rootReadme.includes('https://marketplace.visualstudio.com/items?itemName=EnterpriseAI.gofer')
    );
    assert.ok(rootReadme.includes('What Helps A Repo Get Forks And Stars'));
    assert.ok(extensionSource.includes('Gofer initialized.'));
    assert.ok(extensionSource.includes('multi-platform workflows'));
  });
});
