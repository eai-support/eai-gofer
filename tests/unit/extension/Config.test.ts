import { describe, it, expect } from 'vitest';
import packageJson from '../../../extension/package.json';
import {
  EXTENSION_NAME,
  EXTENSION_DISPLAY_NAME,
  EXTENSION_VERSION,
  SPECIFY_FOLDER,
  SPECS_FOLDER,
  MEMORY_FOLDER,
  TEMPLATES_FOLDER,
  CONSTITUTION_FILE,
  MCP_CONFIG_FILE,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_API_BASE,
  MCP_TOOLS,
  COMMANDS,
  VIEWS,
  CONFIG_KEYS,
  DEFAULTS,
  FILE_PATTERNS,
  getWorkspacePaths,
  VALIDATION,
} from '../../../extension/src/config';

describe('Config - Constants', () => {
  describe('Extension Constants', () => {
    it('should have correct extension name', () => {
      expect(EXTENSION_NAME).toBe('gofer');
    });

    it('should have correct display name', () => {
      expect(EXTENSION_DISPLAY_NAME).toBe('Gofer');
    });

    it('should have a valid version string', () => {
      expect(EXTENSION_VERSION).toMatch(/^\d+\.\d+\.\d+/);
      expect(typeof EXTENSION_VERSION).toBe('string');
    });
  });

  describe('Folder Constants', () => {
    it('should define .specify folder', () => {
      expect(SPECIFY_FOLDER).toBe('.specify');
    });

    it('should define specs folder', () => {
      expect(SPECS_FOLDER).toBe('specs');
    });

    it('should define memory folder', () => {
      expect(MEMORY_FOLDER).toBe('memory');
    });

    it('should define templates folder', () => {
      expect(TEMPLATES_FOLDER).toBe('templates');
    });

    it('should define constitution file', () => {
      expect(CONSTITUTION_FILE).toBe('constitution.md');
    });

    it('should define MCP config file path', () => {
      expect(MCP_CONFIG_FILE).toBe('.vscode/mcp.json');
    });
  });

  describe('GitHub Constants', () => {
    it('should have correct GitHub owner', () => {
      expect(GITHUB_OWNER).toBe('eai-tools');
    });

    it('should have correct GitHub repo', () => {
      expect(GITHUB_REPO).toBe('eai-gofer');
    });

    it('should have GitHub API base URL', () => {
      expect(GITHUB_API_BASE).toBe('https://api.github.com');
    });
  });

  describe('MCP Tool Names', () => {
    it('should define all MCP tools', () => {
      expect(MCP_TOOLS.getSpecs).toBe('gofer_get_specs');
      expect(MCP_TOOLS.getNextTask).toBe('gofer_get_next_task');
      expect(MCP_TOOLS.executeTask).toBe('gofer_execute_task');
      expect(MCP_TOOLS.updateTaskStatus).toBe('gofer_update_task_status');
      expect(MCP_TOOLS.validateCode).toBe('gofer_validate_code');
      expect(MCP_TOOLS.runTests).toBe('gofer_run_tests');
    });

    it('should have 6 MCP tools', () => {
      expect(Object.keys(MCP_TOOLS)).toHaveLength(6);
    });
  });

  describe('Command IDs', () => {
    it('should define all command IDs', () => {
      expect(COMMANDS.initialize).toBe('gofer.initialize');
      expect(COMMANDS.upgrade).toBe('gofer.upgrade');
      expect(COMMANDS.checkVersion).toBe('gofer.checkVersion');
      expect(COMMANDS.refreshSpecs).toBe('gofer.refreshSpecs');
      expect(COMMANDS.refreshConstitution).toBe('gofer.refreshConstitution');
      expect(COMMANDS.showProgress).toBe('gofer.showProgress');
      expect(COMMANDS.showConstitution).toBe('gofer.showConstitution');
      expect(COMMANDS.checkForUpdates).toBe('gofer.checkForUpdates');
      expect(COMMANDS.updateNow).toBe('gofer.updateNow');
    });

    it('should have all commands prefixed with gofer.', () => {
      Object.values(COMMANDS).forEach((cmd) => {
        expect(cmd).toMatch(/^gofer\./);
      });
    });
  });

  describe('View IDs', () => {
    it('should define all view IDs', () => {
      expect(VIEWS.progress).toBe('goferProgress');
      expect(VIEWS.aiUsage).toBe('goferAIUsage');
      expect(VIEWS.memory).toBe('goferMemory');
      expect(VIEWS.container).toBe('gofer');
    });
  });

  describe('Config Keys', () => {
    it('should define all configuration keys', () => {
      expect(CONFIG_KEYS.autoInitialize).toBe('gofer.autoInitialize');
      expect(CONFIG_KEYS.preferredAi).toBe('gofer.preferredAI');
      expect(CONFIG_KEYS.cliProvider).toBe('gofer.cliProvider');
    });

    it('should have all config keys prefixed with gofer.', () => {
      Object.values(CONFIG_KEYS).forEach((key) => {
        expect(key).toMatch(/^gofer\./);
      });
    });
  });

  describe('Default Values', () => {
    it('should have correct default for autoInitialize', () => {
      expect(DEFAULTS.autoInitialize).toBe(false);
    });

    it('should have correct default for preferredAi', () => {
      expect(DEFAULTS.preferredAi).toBe('ask');
    });

    it('should have correct default for cliProvider', () => {
      expect(DEFAULTS.cliProvider).toBe('auto');
    });
  });

  describe('File Patterns', () => {
    it('should define spec markdown pattern', () => {
      expect(FILE_PATTERNS.SPEC_MARKDOWN).toBe('**/specs/**/spec.md');
    });

    it('should define task markdown pattern', () => {
      expect(FILE_PATTERNS.TASK_MARKDOWN).toBe('**/specs/**/tasks.md');
    });

    it('should define constitution pattern', () => {
      expect(FILE_PATTERNS.CONSTITUTION).toBe('**/memory/constitution.md');
    });

    it('should define Claude input file', () => {
      expect(FILE_PATTERNS.CLAUDE_INPUT).toBe('.claude-input.txt');
    });

    it('should define Claude output file', () => {
      expect(FILE_PATTERNS.CLAUDE_OUTPUT).toBe('.claude-output.txt');
    });

    it('should define gitignore file', () => {
      expect(FILE_PATTERNS.GITIGNORE).toBe('.gitignore');
    });
  });
});

describe('Config - Workspace Paths', () => {
  it('should generate correct paths for Unix-style workspace', () => {
    const workspacePath = '/home/user/project';
    const paths = getWorkspacePaths(workspacePath);

    expect(paths.specify).toBe('/home/user/project/.specify');
    expect(paths.specs).toBe('/home/user/project/.specify/specs');
    expect(paths.memory).toBe('/home/user/project/.specify/memory');
    expect(paths.templates).toBe('/home/user/project/.specify/templates');
    expect(paths.constitution).toBe('/home/user/project/.specify/memory/constitution.md');
    expect(paths.mcpConfig).toBe('/home/user/project/.vscode/mcp.json');
    expect(paths.claudeInput).toBe('/home/user/project/.claude-input.txt');
    expect(paths.claudeOutput).toBe('/home/user/project/.claude-output.txt');
  });

  it('should generate correct paths for Windows-style workspace', () => {
    const workspacePath = 'C:\\Users\\John\\project';
    const paths = getWorkspacePaths(workspacePath);

    // Path behavior depends on OS platform
    expect(paths.specify).toContain('.specify');
    expect(paths.specs).toContain('specs');
    expect(paths.memory).toContain('memory');
    expect(paths.constitution).toContain('constitution.md');
  });

  it('should handle workspace paths with spaces', () => {
    const workspacePath = '/Users/John Doe/My Projects/gofer';
    const paths = getWorkspacePaths(workspacePath);

    expect(paths.specify).toBe('/Users/John Doe/My Projects/gofer/.specify');
    expect(paths.specs).toBe('/Users/John Doe/My Projects/gofer/.specify/specs');
  });

  it('should handle workspace paths with special characters', () => {
    const workspacePath = '/home/user/project-2025_test';
    const paths = getWorkspacePaths(workspacePath);

    expect(paths.specify).toBe('/home/user/project-2025_test/.specify');
    expect(paths.specs).toBe('/home/user/project-2025_test/.specify/specs');
  });

  it('should generate all required paths', () => {
    const workspacePath = '/test/workspace';
    const paths = getWorkspacePaths(workspacePath);

    expect(paths).toHaveProperty('specify');
    expect(paths).toHaveProperty('specs');
    expect(paths).toHaveProperty('memory');
    expect(paths).toHaveProperty('templates');
    expect(paths).toHaveProperty('constitution');
    expect(paths).toHaveProperty('mcpConfig');
    expect(paths).toHaveProperty('claudeInput');
    expect(paths).toHaveProperty('claudeOutput');
    expect(Object.keys(paths)).toHaveLength(8);
  });
});

describe('Config - Validation Helpers', () => {
  describe('isSpecifyPath', () => {
    it('should return true for paths within .specify', () => {
      const workspacePath = '/home/user/project';
      const filePath = '/home/user/project/.specify/specs/001-feature/spec.md';

      expect(VALIDATION.isSpecifyPath(filePath, workspacePath)).toBe(true);
    });

    it('should return false for paths outside .specify', () => {
      const workspacePath = '/home/user/project';
      const filePath = '/home/user/project/src/index.ts';

      expect(VALIDATION.isSpecifyPath(filePath, workspacePath)).toBe(false);
    });

    it('should return true for .specify root', () => {
      const workspacePath = '/home/user/project';
      const filePath = '/home/user/project/.specify';

      expect(VALIDATION.isSpecifyPath(filePath, workspacePath)).toBe(true);
    });

    it('should handle Windows paths', () => {
      const workspacePath = 'C:\\Users\\John\\project';
      const filePath = 'C:\\Users\\John\\project\\.specify\\specs\\001\\spec.md';

      const result = VALIDATION.isSpecifyPath(filePath, workspacePath);
      if (process.platform === 'win32') {
        expect(result).toBe(true);
      } else {
        expect(result).toBe(false);
      }
    });

    it('should return false for similar but not exact paths', () => {
      const workspacePath = '/home/user/project';
      const filePath = '/home/user/project-other/.specify/specs/spec.md';

      expect(VALIDATION.isSpecifyPath(filePath, workspacePath)).toBe(false);
    });
  });

  describe('isSpecFile', () => {
    it('should return true for spec.md files in specs/', () => {
      expect(VALIDATION.isSpecFile('/project/.specify/specs/001-feature/spec.md')).toBe(true);
    });

    it('should return false for non-spec.md files', () => {
      expect(VALIDATION.isSpecFile('/project/.specify/specs/001-feature/tasks.md')).toBe(false);
    });

    it('should return false for spec.md not in specs/', () => {
      expect(VALIDATION.isSpecFile('/project/.specify/memory/spec.md')).toBe(false);
    });

    it('should return false for files with spec.md in name but not ending', () => {
      expect(VALIDATION.isSpecFile('/project/.specify/specs/001/spec.md.backup')).toBe(false);
    });

    it('should handle nested spec directories', () => {
      expect(VALIDATION.isSpecFile('/project/.specify/specs/001-feature/sub/spec.md')).toBe(true);
    });
  });

  describe('isTasksFile', () => {
    it('should return true for tasks.md files in specs/', () => {
      expect(VALIDATION.isTasksFile('/project/.specify/specs/001-feature/tasks.md')).toBe(true);
    });

    it('should return false for non-tasks.md files', () => {
      expect(VALIDATION.isTasksFile('/project/.specify/specs/001-feature/spec.md')).toBe(false);
    });

    it('should return false for tasks.md not in specs/', () => {
      expect(VALIDATION.isTasksFile('/project/.specify/memory/tasks.md')).toBe(false);
    });

    it('should return false for files with tasks.md in name but not ending', () => {
      expect(VALIDATION.isTasksFile('/project/.specify/specs/001/tasks.md.backup')).toBe(false);
    });
  });

  describe('isConstitutionFile', () => {
    it('should return true for constitution.md in memory/', () => {
      expect(VALIDATION.isConstitutionFile('/project/.specify/memory/constitution.md')).toBe(true);
    });

    it('should return false for constitution.md not in memory/', () => {
      expect(VALIDATION.isConstitutionFile('/project/.specify/specs/constitution.md')).toBe(false);
    });

    it('should return false for non-constitution.md files in memory/', () => {
      expect(VALIDATION.isConstitutionFile('/project/.specify/memory/decisions.md')).toBe(false);
    });

    it('should return false for files with constitution.md in name but not ending', () => {
      expect(VALIDATION.isConstitutionFile('/project/.specify/memory/constitution.md.backup')).toBe(
        false
      );
    });
  });
});

describe('Config - Integration Scenarios', () => {
  it('should have consistent folder names across constants', () => {
    const paths = getWorkspacePaths('/test');

    expect(paths.specify).toContain(SPECIFY_FOLDER);
    expect(paths.specs).toContain(SPECS_FOLDER);
    expect(paths.memory).toContain(MEMORY_FOLDER);
    expect(paths.templates).toContain(TEMPLATES_FOLDER);
    expect(paths.constitution).toContain(CONSTITUTION_FILE);
  });

  it('should have valid file patterns for glob matching', () => {
    // All glob patterns should start with ** for recursive matching
    expect(FILE_PATTERNS.SPEC_MARKDOWN).toMatch(/^\*\*/);
    expect(FILE_PATTERNS.TASK_MARKDOWN).toMatch(/^\*\*/);
    expect(FILE_PATTERNS.CONSTITUTION).toMatch(/^\*\*/);
  });

  it('should have unique command IDs', () => {
    const commandIds = Object.values(COMMANDS);
    const uniqueIds = new Set(commandIds);
    expect(uniqueIds.size).toBe(commandIds.length);
  });

  it('should have unique MCP tool names', () => {
    const toolNames = Object.values(MCP_TOOLS);
    const uniqueNames = new Set(toolNames);
    expect(uniqueNames.size).toBe(toolNames.length);
  });

  it('should have all MCP tool names prefixed with gofer_', () => {
    Object.values(MCP_TOOLS).forEach((tool) => {
      expect(tool).toMatch(/^gofer_/);
    });
  });
});

describe('Config - Feature 026 Settings Validation', () => {
  it('should define polling interval defaults within valid range', () => {
    const pollingIntervalSetting =
      packageJson.contributes.configuration.properties['gofer.aiUsage.polling.interval'];

    expect(pollingIntervalSetting.default).toBeGreaterThanOrEqual(pollingIntervalSetting.minimum);
    expect(pollingIntervalSetting.default).toBeLessThanOrEqual(pollingIntervalSetting.maximum);
  });
});
