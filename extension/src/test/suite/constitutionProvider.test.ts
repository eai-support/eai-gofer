import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as vscode from 'vscode';
import { ConstitutionProvider } from '../../constitutionProvider';

suite('ConstitutionProvider Test Suite', () => {
  let tempDir: string;
  let constitutionProvider: ConstitutionProvider;

  setup(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'constitution-provider-test-'));
    // Create fresh constitution provider for each test
    constitutionProvider = new ConstitutionProvider(tempDir);
  });

  teardown(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  suite('Constitution File Parsing', () => {
    test('should show error when no constitution file exists', async () => {
      const children = await constitutionProvider.getChildren();
      assert.strictEqual(children.length, 1);
      assert.ok(children[0].label.includes('Error'));
    });

    test('should parse constitution with multiple articles', async () => {
      await createTestConstitution();

      constitutionProvider.refresh();
      const children = await constitutionProvider.getChildren();

      // Should have at least one info item and multiple articles
      assert.ok(children.length > 1);

      const articles = children.filter(item => item.contextValue === 'article');
      assert.ok(articles.length >= 2);

      // Check first article
      const firstArticle = articles[0];
      assert.ok(firstArticle.label.toString().includes('Article 1'));
      assert.ok(firstArticle.label.toString().includes('Test-Driven Development'));
    });

    test('should parse sections within articles', async () => {
      await createTestConstitution();

      constitutionProvider.refresh();
      const children = await constitutionProvider.getChildren();

      // Find an article with sections
      const articleWithSections = children.find(item => 
        item.contextValue === 'article' && 
        item.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed
      );
      
      assert.ok(articleWithSections);

      // Get sections for that article
      const sections = await constitutionProvider.getChildren(articleWithSections);
      assert.ok(sections.length > 0);

      const firstSection = sections[0];
      assert.strictEqual(firstSection.contextValue, 'section');
      assert.ok(firstSection.tooltip);
    });
  });

  suite('Tree Structure', () => {
    test('should show articles as expandable items', async () => {
      await createTestConstitution();

      constitutionProvider.refresh();
      const children = await constitutionProvider.getChildren();

      const expandableArticle = children.find(item => 
        item.contextValue === 'article' && 
        item.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed
      );

      assert.ok(expandableArticle);
    });

    test('should show sections as leaf items', async () => {
      await createTestConstitution();

      constitutionProvider.refresh();
      const children = await constitutionProvider.getChildren();

      const articleItem = children.find(item => item.contextValue === 'article');
      assert.ok(articleItem);

      const sections = await constitutionProvider.getChildren(articleItem);
      
      if (sections.length > 0) {
        const sectionItem = sections[0];
        assert.strictEqual(sectionItem.contextValue, 'section');
        assert.strictEqual(sectionItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
      }
    });

    test('should set correct icons for different item types', async () => {
      await createTestConstitution();

      constitutionProvider.refresh();
      const children = await constitutionProvider.getChildren();

      // Check info item icon
      const infoItem = children.find(item => item.contextValue === 'info');
      if (infoItem) {
        assert.ok(infoItem.iconPath instanceof vscode.ThemeIcon);
      }

      // Check article icon
      const articleItem = children.find(item => item.contextValue === 'article');
      if (articleItem) {
        assert.ok(articleItem.iconPath instanceof vscode.ThemeIcon);
      }
    });
  });

  suite('Content Display', () => {
    test('should truncate long section content in tooltips', async () => {
      await createConstitutionWithLongContent();

      constitutionProvider.refresh();
      const children = await constitutionProvider.getChildren();

      const articleItem = children.find(item => item.contextValue === 'article');
      assert.ok(articleItem);

      const sections = await constitutionProvider.getChildren(articleItem);
      
      if (sections.length > 0) {
        const sectionWithLongContent = sections.find(s => {
          const tooltip = s.tooltip;
          return tooltip && typeof tooltip === 'string' && tooltip.length > 200;
        });
        if (sectionWithLongContent) {
          const tooltip = sectionWithLongContent.tooltip as string;
          assert.ok(tooltip.endsWith('...'));
        }
      }
    });

    test('should show article numbers and titles correctly', async () => {
      await createTestConstitution();

      constitutionProvider.refresh();
      const children = await constitutionProvider.getChildren();

      const articles = children.filter(item => item.contextValue === 'article');
      
      if (articles.length >= 2) {
        const firstArticle = articles[0];
        const secondArticle = articles[1];

        assert.ok(firstArticle.label.toString().includes('Article 1'));
        assert.ok(secondArticle.label.toString().includes('Article 2'));
      }
    });
  });

  suite('Article Access Methods', () => {
    test('should provide access to parsed articles', async () => {
      await createTestConstitution();

      constitutionProvider.refresh();
      
      // Wait a bit for parsing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const articles = constitutionProvider.getArticles();
      assert.ok(articles.length >= 2);

      const firstArticle = articles[0];
      assert.strictEqual(firstArticle.number, 1);
      assert.ok(firstArticle.title.includes('Test-Driven Development'));
    });

    test('should get specific article by number', async () => {
      await createTestConstitution();

      constitutionProvider.refresh();
      
      // Wait a bit for parsing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const article1 = constitutionProvider.getArticle(1);
      const article2 = constitutionProvider.getArticle(2);
      const nonExistent = constitutionProvider.getArticle(999);

      assert.ok(article1);
      assert.ok(article2);
      assert.strictEqual(nonExistent, undefined);

      assert.strictEqual(article1.number, 1);
      assert.strictEqual(article2.number, 2);
    });
  });

  suite('Refresh Functionality', () => {
    test('should update tree when constitution file changes', async () => {
      // Initially no constitution
      let children = await constitutionProvider.getChildren();
      assert.strictEqual(children.length, 1);
      assert.ok(children[0].label.includes('Error'));

      // Add constitution
      await createTestConstitution();

      // Should still show error until refresh
      children = await constitutionProvider.getChildren();
      assert.strictEqual(children.length, 1);
      assert.ok(children[0].label.includes('Error'));

      // After refresh, should show constitution
      constitutionProvider.refresh();
      children = await constitutionProvider.getChildren();
      assert.ok(children.length > 1);
    });
  });

  suite('Error Handling', () => {
    test('should handle malformed constitution file gracefully', async () => {
      // Create constitution with invalid markdown structure
      const memoryDir = path.join(tempDir, '.specify', 'memory');
      await fs.mkdir(memoryDir, { recursive: true });

      const malformedContent = `This is not properly formatted constitution content
without proper article structure or markdown formatting.

Some random text here.
`;

      await fs.writeFile(path.join(memoryDir, 'constitution.md'), malformedContent);

      constitutionProvider.refresh();
      const children = await constitutionProvider.getChildren();

      // Should handle gracefully - either show error or empty state
      assert.ok(children.length >= 1);
    });
  });

  // Helper functions
  async function createTestConstitution(): Promise<void> {
    const memoryDir = path.join(tempDir, '.specify', 'memory');
    await fs.mkdir(memoryDir, { recursive: true });

    const constitutionContent = `# Project Constitution

### I. Test-Driven Development (NON-NEGOTIABLE)

All code must be developed using test-driven development (TDD) methodology.

### Requirements

- Write tests before implementation
- Maintain minimum 80% code coverage
- All tests must pass before merging

### Exceptions

No exceptions to this rule. All production code requires tests.

### II. MCP-First Architecture

All AI tooling must prioritize Model Context Protocol (MCP) integration.

### Implementation Guidelines

- MCP tools should be the primary interface
- File-based coordination is legacy
- All tools must be Claude Code compatible

### Benefits

- Seamless AI workflow integration
- Consistent tool discovery
- Better error handling and validation

### III. Code Quality Standards

Maintain high code quality through automated tooling and manual review.

### Automated Checks

- ESLint for JavaScript/TypeScript
- Prettier for code formatting
- TypeScript strict mode enabled

### Manual Review

- All pull requests require review
- Focus on architecture and design patterns
- Ensure documentation is complete
`;

    await fs.writeFile(path.join(memoryDir, 'constitution.md'), constitutionContent);
  }

  async function createConstitutionWithLongContent(): Promise<void> {
    const memoryDir = path.join(tempDir, '.specify', 'memory');
    await fs.mkdir(memoryDir, { recursive: true });

    const longContent = 'This is a very long content section that should be truncated in tooltips. '.repeat(20);

    const constitutionContent = `# Project Constitution

### I. Article with Long Content

${longContent}

### Long Section

${longContent}

This section has extremely long content that should be truncated when displayed in the tree view tooltip to prevent overwhelming the user interface.
`;

    await fs.writeFile(path.join(memoryDir, 'constitution.md'), constitutionContent);
  }
});