/**
 * Command Generator for Cross-Platform Command Parity
 * Feature 028: Generates Codex and Copilot command files from the canonical command mirror
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import * as yaml from 'js-yaml';
import { CommandMetadata, PlatformType } from './types/CrossPlatformTypes';
import { CommandMetadataExtractor } from './CommandMetadataExtractor';

export type CommandWorkflowProfile = 'standard' | 'enterpriseai';

const LEGACY_COMMAND_FILE_STEMS = new Set(['0_business_scenario']);

export interface CommandGenerationOptions {
  workflowProfileOverride?: CommandWorkflowProfile;
  metadataSource?: string;
}

/**
 * Generates platform-specific command files from the canonical command mirror.
 */
export class CommandGenerator {
  private extractor: CommandMetadataExtractor;

  constructor(private workspacePath: string) {
    this.extractor = new CommandMetadataExtractor();
  }

  private toCommandFileStem(commandName: string): string {
    return commandName.replace(/:/g, '_').replace(/-/g, '_');
  }

  /**
   * Generate commands for a specific platform
   *
   * @param platform Target platform (codex or copilot)
   * @param dryRun If true, preview changes without writing files
   * @returns Array of generated file paths
   */
  public async generateCommands(
    platform: 'codex' | 'copilot',
    dryRun: boolean = false,
    options: CommandGenerationOptions = {}
  ): Promise<string[]> {
    const claudeCommandsDir = path.join(this.workspacePath, '.claude', 'commands');

    try {
      await fs.promises.access(claudeCommandsDir);
    } catch {
      throw new Error('Claude commands directory not found: ' + claudeCommandsDir);
    }

    const files = await fs.promises.readdir(claudeCommandsDir);
    const commandFiles = files
      .filter((file) => file.endsWith('.md'))
      .filter((file) => !LEGACY_COMMAND_FILE_STEMS.has(path.basename(file, '.md')))
      .map((file) => path.join(claudeCommandsDir, file));

    const generatedPaths: string[] = [];
    const failures: string[] = [];

    for (const commandFile of commandFiles) {
      try {
        const metadata = await this.extractor.extractFromClaudeCommand(commandFile);
        const enrichedMetadata = this.enrichMetadata(metadata, options);
        const outputPath = await this.generateCommand(enrichedMetadata, platform, dryRun);
        generatedPaths.push(outputPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${commandFile}: ${message}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Failed to generate ${failures.length} ${platform} command(s): ${failures.join('; ')}`
      );
    }

    return generatedPaths;
  }

  /**
   * Generate a single command file for target platform
   *
   * @param sourceMetadata Metadata from Claude CLI command
   * @param platform Target platform
   * @param dryRun If true, preview without writing
   * @returns Generated file path
   */
  public async generateCommand(
    sourceMetadata: CommandMetadata,
    platform: 'codex' | 'copilot',
    dryRun: boolean = false
  ): Promise<string> {
    if (platform === 'codex') {
      return this.generateCodexSkill(sourceMetadata, dryRun);
    } else {
      return this.generateCopilotPrompt(sourceMetadata, dryRun);
    }
  }

  /**
   * Generate a Codex CLI skill file
   *
   * @param sourceMetadata Source metadata from the command mirror
   * @param dryRun Preview mode
   * @returns Output file path
   */
  public async generateCodexSkill(
    sourceMetadata: CommandMetadata,
    dryRun: boolean = false
  ): Promise<string> {
    const fileStem = this.toCommandFileStem(sourceMetadata.name);
    const skillDir = path.join(this.workspacePath, '.agents', 'skills', fileStem);
    const skillPath = path.join(skillDir, 'SKILL.md');
    const compatibilitySkillDir = path.join(this.workspacePath, '.system', 'skills', fileStem);
    const compatibilitySkillPath = path.join(compatibilitySkillDir, 'SKILL.md');
    const legacySkillDirs = this.getLegacyCodexSkillDirs(fileStem, sourceMetadata.name);

    // Transform content for Codex
    const transformedContent = this.transformContent(sourceMetadata.content, 'claude', 'codex');

    const goferMetadata = this.getGoferMetadata(sourceMetadata);

    // Build YAML frontmatter
    const frontmatter = {
      name: sourceMetadata.name,
      description: sourceMetadata.description,
      gofer: goferMetadata,
      arguments: [
        {
          name: 'feature',
          description: 'Feature name or description',
          required: false,
        },
      ],
      result_schema: {
        type: 'object',
        properties: {
          output: {
            type: 'string',
            description: 'Path to generated artifact or execution summary',
          },
          status: {
            type: 'string',
            enum: ['success', 'error'],
          },
        },
      },
    };

    // Inject platform-specific sections
    const enhancedContent = this.injectPlatformSections(
      transformedContent,
      'codex',
      sourceMetadata.name
    );

    // Build complete skill file
    const skillContent = '---\n' + yaml.dump(frontmatter) + '---\n\n' + enhancedContent;

    // Validate generated content
    this.validateGeneratedCommand(skillContent, 'codex');

    if (!dryRun) {
      // Keep the repo-local .agents tree canonical, but continue emitting the
      // flat .system mirror for compatibility with existing tooling/tests.
      await fs.promises.mkdir(skillDir, { recursive: true });
      await fs.promises.mkdir(compatibilitySkillDir, { recursive: true });

      await fs.promises.writeFile(skillPath, skillContent, 'utf8');
      await fs.promises.writeFile(compatibilitySkillPath, skillContent, 'utf8');
      for (const legacySkillDir of legacySkillDirs) {
        if (legacySkillDir !== skillDir && legacySkillDir !== compatibilitySkillDir) {
          await fs.promises.rm(legacySkillDir, { recursive: true, force: true });
        }
      }
    }

    return skillPath;
  }

  private getLegacyCodexSkillDirs(fileStem: string, commandName: string): string[] {
    const legacyDirs = [
      path.join(this.workspacePath, '.agents', 'skills', commandName),
      path.join(this.workspacePath, '.agents', 'skills', 'gofer', fileStem),
      path.join(this.workspacePath, '.agents', 'skills', 'gofer', commandName),
      path.join(this.workspacePath, '.system', 'skills', commandName),
      path.join(this.workspacePath, '.system', 'skills', 'gofer', fileStem),
      path.join(this.workspacePath, '.system', 'skills', 'gofer', commandName),
    ];

    if (fileStem === '0_gofer_start' || commandName === '0_gofer_start') {
      legacyDirs.push(
        path.join(this.workspacePath, '.agents', 'skills', '0_business_scenario'),
        path.join(this.workspacePath, '.agents', 'skills', 'gofer', '0_business_scenario'),
        path.join(this.workspacePath, '.system', 'skills', '0_business_scenario'),
        path.join(this.workspacePath, '.system', 'skills', 'gofer', '0_business_scenario')
      );
    }

    return legacyDirs;
  }

  /**
   * Generate a Copilot Chat prompt file
   *
   * @param sourceMetadata Source metadata from the command mirror
   * @param dryRun Preview mode
   * @returns Output file path
   */
  public async generateCopilotPrompt(
    sourceMetadata: CommandMetadata,
    dryRun: boolean = false
  ): Promise<string> {
    const promptsDir = path.join(this.workspacePath, '.github', 'prompts');
    const fileStem = this.toCommandFileStem(sourceMetadata.name);
    const promptPath = path.join(promptsDir, fileStem + '.prompt.md');
    const legacyPromptPaths = [path.join(promptsDir, sourceMetadata.name + '.prompt.md')];
    if (fileStem === '0_gofer_start' || sourceMetadata.name === '0_gofer_start') {
      legacyPromptPaths.push(path.join(promptsDir, '0_business_scenario.prompt.md'));
    }

    // Transform content for Copilot
    const transformedContent = this.transformContent(sourceMetadata.content, 'claude', 'copilot');

    const goferMetadata = this.getGoferMetadata(sourceMetadata);

    // Build YAML frontmatter
    const frontmatter = {
      name: sourceMetadata.name,
      description: sourceMetadata.description,
      agent: 'copilot-workspace',
      tools: ['Read', 'Grep', 'Glob', 'Bash', 'WebSearch'],
      'argument-hint': 'feature-name-or-description',
      gofer: goferMetadata,
    };

    // Inject platform-specific sections
    const enhancedContent = this.injectPlatformSections(
      transformedContent,
      'copilot',
      sourceMetadata.name
    );

    // Build complete prompt file
    const promptContent = '---\n' + yaml.dump(frontmatter) + '---\n\n' + enhancedContent;

    // Validate generated content
    this.validateGeneratedCommand(promptContent, 'copilot');

    if (!dryRun) {
      // Create directory if needed
      await fs.promises.mkdir(promptsDir, { recursive: true });

      // Write prompt file
      await fs.promises.writeFile(promptPath, promptContent, 'utf8');
      for (const legacyPromptPath of legacyPromptPaths) {
        if (legacyPromptPath !== promptPath) {
          await fs.promises.rm(legacyPromptPath, { recursive: true, force: true });
        }
      }
    }

    return promptPath;
  }

  /**
   * Transform content from one platform to another
   *
   * @param content Original content
   * @param fromPlatform Source platform
   * @param toPlatform Target platform
   * @returns Transformed content
   */
  public transformContent(
    content: string,
    fromPlatform: PlatformType,
    toPlatform: PlatformType
  ): string {
    let transformed = content;
    const stageCommandPattern = /\/(\d+[a-z]?_[a-z0-9_]+)/g;
    const helperCommandPattern = /\/(gofer_[a-z0-9_]+)/g;

    // Remove Claude-specific AUTO-CHAIN sections (replace with platform-specific)
    transformed = transformed.replace(/\*\*AUTO-CHAIN[^]*?(?=\n##|\n---|\n\*\*|$)/g, '');

    // Transform Skill tool invocations (Claude-specific)
    if (fromPlatform === 'claude' && toPlatform !== 'claude') {
      // Remove Skill tool invocation instructions
      transformed = transformed.replace(
        /by calling the Skill tool with skill="[^"]+"/g,
        'by running the next command'
      );
      transformed = transformed.replace(/Skill tool/g, 'next command');
    }

    // Transform Task tool references (Claude-specific)
    if (fromPlatform === 'claude' && toPlatform === 'codex') {
      // Add simulation instructions for parallel agents
      transformed = transformed.replace(
        /Task: subagent_type="([^"]+)"/g,
        '**Note**: Codex CLI does not support the Task tool. For parallel agent work, open multiple Codex CLI sessions and run the $1 analysis in each.'
      );
    }

    // Transform command invocation syntax
    if (toPlatform === 'codex') {
      // Codex skills keep canonical slash-command references. Rewriting them
      // corrupts file paths such as .specify/commands/0_gofer_start.md.
      void stageCommandPattern;
      void helperCommandPattern;
    } else if (toPlatform === 'copilot') {
      // Replace /command with #command
      transformed = transformed.replace(stageCommandPattern, '#$1');
      transformed = transformed.replace(helperCommandPattern, '#$1');
    }

    return transformed;
  }

  /**
   * Inject platform-specific sections (auto-chain, parallel agents)
   *
   * @param content Base content
   * @param platform Target platform
   * @param commandName Command name
   * @returns Enhanced content
   */
  public injectPlatformSections(
    content: string,
    platform: 'codex' | 'copilot',
    commandName: string
  ): string {
    // Determine next command in pipeline
    const nextCommand = this.getNextCommand(commandName);

    if (!nextCommand) {
      return content; // No next command (end of pipeline)
    }

    let autoChainSection = '';

    if (platform === 'codex') {
      autoChainSection = `

## Pipeline Continuation

This completes the ${commandName} stage. To continue the Gofer pipeline:

**Next Command:** \`/${nextCommand}\`

The next stage will use the artifacts generated by this command and continue the implementation workflow.

**Note:** Codex CLI does not support automatic command chaining. You must manually run each stage command to progress through the pipeline.
`;
    } else if (platform === 'copilot') {
      autoChainSection = `

## Pipeline Continuation

This completes the ${commandName} stage. To continue the Gofer pipeline:

**Next Command:** \`#${nextCommand}\`

The next stage will read the artifacts from this stage and continue the workflow automatically.

**Note:** Copilot Chat supports context preservation. Your conversation history will be maintained as you progress through pipeline stages.
`;
    }

    // Inject before any "Key Rules" or at end
    if (content.includes('## Key Rules')) {
      return content.replace('## Key Rules', autoChainSection + '\n## Key Rules');
    } else {
      return content + autoChainSection;
    }
  }

  /**
   * Validate generated command content
   *
   * @param content Generated file content
   * @param platform Target platform
   */
  public validateGeneratedCommand(content: string, platform: 'codex' | 'copilot'): void {
    // Check for YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      throw new Error('Generated command missing YAML frontmatter');
    }

    let frontmatter: Record<string, unknown>;
    try {
      frontmatter = yaml.load(frontmatterMatch[1]) as Record<string, unknown>;
    } catch (error) {
      throw new Error('Generated command has invalid YAML', {
        cause: error,
      });
    }

    // Check required fields
    if (!frontmatter.name) {
      throw new Error('Generated command missing required field: name');
    }
    if (!frontmatter.description) {
      throw new Error('Generated command missing required field: description');
    }

    // Platform-specific validation
    if (platform === 'codex' && !frontmatter.result_schema) {
      throw new Error('Codex skill missing required field: result_schema');
    }

    // Check content has body
    const body = content.split('---\n')[2];
    if (!body || body.trim().length === 0) {
      throw new Error('Generated command has empty body');
    }
  }

  /**
   * Get next command in pipeline sequence
   *
   * @param currentCommand Current command name
   * @returns Next command name or null if end of pipeline
   */
  private getNextCommand(currentCommand: string): string | null {
    const pipeline = [
      '0_gofer_start',
      '0a_problem_validation',
      '1_gofer_research',
      '2_gofer_specify',
      '3_gofer_plan',
      '4_gofer_tasks',
      '5_gofer_implement',
      '6_gofer_validate',
    ];

    const currentIndex = pipeline.indexOf(currentCommand);
    if (currentIndex >= 0 && currentIndex < pipeline.length - 1) {
      return pipeline[currentIndex + 1];
    }

    // Special commands don't have next in pipeline
    return null;
  }

  private enrichMetadata(
    sourceMetadata: CommandMetadata,
    options: CommandGenerationOptions
  ): CommandMetadata {
    const sourceFrontmatter = this.asRecord(sourceMetadata.frontmatter);
    const existingGoferMetadata = this.asRecord(sourceFrontmatter.gofer);
    const workflowProfile =
      options.workflowProfileOverride ??
      this.resolveWorkflowProfile(sourceMetadata, existingGoferMetadata);
    const canonicalSource = this.resolveCanonicalSourcePath(sourceMetadata);
    const canonicalChecksum = createHash('sha256')
      .update(sourceMetadata.content, 'utf8')
      .digest('hex');

    const goferMetadata: Record<string, unknown> = {
      ...existingGoferMetadata,
      workflowProfile,
      canonicalSource,
      canonicalChecksum,
      metadataSource:
        options.metadataSource ??
        this.readString(existingGoferMetadata.metadataSource) ??
        'scripts/generate-commands.ts',
    };

    return {
      ...sourceMetadata,
      frontmatter: {
        ...sourceFrontmatter,
        workflowProfile,
        canonicalSource,
        canonicalChecksum,
        gofer: goferMetadata,
      },
    };
  }

  private getGoferMetadata(sourceMetadata: CommandMetadata): Record<string, unknown> {
    const frontmatter = this.asRecord(sourceMetadata.frontmatter);
    const frontmatterGofer = this.asRecord(frontmatter.gofer);
    const workflowProfile =
      this.readWorkflowProfile(frontmatterGofer.workflowProfile) ??
      this.readWorkflowProfile(frontmatter.workflowProfile) ??
      this.resolveWorkflowProfile(sourceMetadata, frontmatterGofer);
    const canonicalSource =
      this.readString(frontmatterGofer.canonicalSource) ??
      this.readString(frontmatter.canonicalSource) ??
      this.resolveCanonicalSourcePath(sourceMetadata);
    const canonicalChecksum =
      this.readString(frontmatterGofer.canonicalChecksum) ??
      this.readString(frontmatter.canonicalChecksum) ??
      createHash('sha256').update(sourceMetadata.content, 'utf8').digest('hex');
    const metadataSource =
      this.readString(frontmatterGofer.metadataSource) ?? 'scripts/generate-commands.ts';

    return {
      workflowProfile,
      canonicalSource,
      canonicalChecksum,
      metadataSource,
    };
  }

  private resolveCanonicalSourcePath(sourceMetadata: CommandMetadata): string {
    const relativeSourcePath = this.normalizeRelativePath(
      path.relative(this.workspacePath, sourceMetadata.filePath)
    );

    if (
      sourceMetadata.platform === 'claude' &&
      relativeSourcePath.startsWith('.claude/commands/')
    ) {
      const canonicalFileName = path.posix
        .basename(relativeSourcePath)
        .replace(/:/g, '_')
        .replace(/-/g, '_');
      return `.specify/commands/${canonicalFileName}`;
    }

    return relativeSourcePath;
  }

  private resolveWorkflowProfile(
    sourceMetadata: CommandMetadata,
    goferMetadata: Record<string, unknown>
  ): CommandWorkflowProfile {
    const explicitProfile =
      this.readWorkflowProfile(goferMetadata.workflowProfile) ??
      this.readWorkflowProfile(sourceMetadata.frontmatter.workflowProfile);
    if (explicitProfile) {
      return explicitProfile;
    }

    return 'standard';
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private readWorkflowProfile(value: unknown): CommandWorkflowProfile | undefined {
    if (value === 'enterpriseai' || value === 'standard') {
      return value;
    }

    return undefined;
  }

  private normalizeRelativePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }
}
