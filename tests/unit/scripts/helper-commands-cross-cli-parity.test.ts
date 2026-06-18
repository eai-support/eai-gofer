import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CROSS_CLI_SURFACES,
  HELPER_COMMANDS,
  getGeneratedCommandFileStem,
} from '../../helpers/goferCommandSet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function readMarkdownFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error('Missing markdown frontmatter');
  }

  const out: Record<string, unknown> = {};
  let currentArrayKey: string | null = null;

  for (const rawLine of match[1].split('\n')) {
    const keyValueMatch = rawLine.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (keyValueMatch) {
      const [, key, rawValue] = keyValueMatch;
      const trimmedValue = rawValue.trim();
      if (trimmedValue === '') {
        currentArrayKey = key;
        out[key] = [];
      } else {
        currentArrayKey = null;
        out[key] = trimmedValue.replace(/^['"]|['"]$/g, '');
      }
      continue;
    }

    if (currentArrayKey) {
      const arrayItemMatch = rawLine.match(/^\s*-\s*(.+)$/);
      if (arrayItemMatch) {
        (out[currentArrayKey] as string[]).push(
          arrayItemMatch[1].trim().replace(/^['"]|['"]$/g, '')
        );
      }
    }
  }

  return out;
}

function readTomlDescription(content: string): string {
  const match = content.match(/^description\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error('Missing TOML description');
  }

  return match[1];
}

function stripFirstFrontmatter(content: string): string {
  if (!content.startsWith('---\n')) {
    return content;
  }

  const endIndex = content.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    return content;
  }

  return content.slice(endIndex + 5).replace(/^\n+/, '');
}

const REQUIRED_PROVENANCE_FIELDS = [
  'GeneratedAt',
  'SourceCommandId',
  'SourceInputs',
  'OverwriteNoticeWhenApplicable',
] as const;

const HELPER_BODY_CONTRACTS: Record<
  string,
  {
    artifactPath: string;
    requiredSections: readonly string[];
  }
> = {
  'gofer:check-workspace': {
    artifactPath: '.specify/logs/workspace-check-report.md',
    requiredSections: [
      '## Provenance',
      '## Workspace Root',
      '## Core Scaffold',
      '## Host Requirements',
      '## Status',
      '## Recommendation',
    ],
  },
  'gofer:bootstrap-workspace': {
    artifactPath: '.specify/logs/workspace-bootstrap-report.md',
    requiredSections: [
      '## Provenance',
      '## Workspace Root',
      '## Bootstrap Source',
      '## Host Policy',
      '## Changes Applied',
      '## Post-Check',
    ],
  },
  'gofer:eai-first-run': {
    artifactPath: '.specify/logs/eai-first-run-report.md',
    requiredSections: [
      '## Provenance',
      '## Workspace Root',
      '## Environment Check',
      '## EAI CLI',
      '## Tenant And Login',
      '## Template Readiness',
      '## Drift And Recovery',
      '## Next Action',
    ],
  },
  'gofer:vocabulary': {
    artifactPath: '.specify/specs/{feature}/glossary.md',
    requiredSections: ['## Provenance', '## Term Entries', '## Definitions', '## Source Artifacts'],
  },
  'gofer:diagnose': {
    artifactPath: '.specify/specs/{feature}/diagnose-report.md',
    requiredSections: ['## Provenance', '## Reproduce', '## Minimize', '## Instrument', '## Fix'],
  },
  'gofer:tdd': {
    artifactPath: '.specify/specs/{feature}/tdd-session.md',
    requiredSections: [
      '## Provenance',
      '## Acceptance Criteria Linkage',
      '## Red',
      '## Green',
      '## Refactor',
    ],
  },
  'gofer:spec-summary': {
    artifactPath: '.specify/specs/{feature}/spec-summary.md',
    requiredSections: [
      '## Provenance',
      '## What',
      '## Why',
      '## Acceptance Criteria',
      '## Out of Scope',
    ],
  },
  'gofer:zoom-out': {
    artifactPath: '.specify/specs/{feature}/zoom-out-report.md',
    requiredSections: [
      '## Provenance',
      '## Current Boundary',
      '## Upstream/Downstream',
      '## Cross-Cutting Impact',
    ],
  },
};

describe('helper commands cross-CLI parity', () => {
  for (const helper of HELPER_COMMANDS) {
    const emittedFileStem = getGeneratedCommandFileStem(helper.name);
    const sourceRelativePath = `.specify/commands/${helper.file}.md`;
    const claudeRelativePath = `.claude/commands/${emittedFileStem}.md`;
    const githubPromptRelativePath = `.github/prompts/${emittedFileStem}.prompt.md`;
    const extensionPromptRelativePath = `extension/resources/copilot-prompts/${emittedFileStem}.prompt.md`;
    const geminiRelativePath = `.gemini/commands/gofer/${emittedFileStem}.toml`;
    const agentsSkillRelativePath = `.agents/skills/${emittedFileStem}/SKILL.md`;
    const systemSkillRelativePath = `.system/skills/${emittedFileStem}/SKILL.md`;

    it(`${helper.name} keeps source frontmatter aligned`, () => {
      const frontmatter = readMarkdownFrontmatter(readFile(sourceRelativePath));

      expect(frontmatter.name).toBe(helper.name);
      expect(frontmatter.category).toBe('control');
      expect(frontmatter.surfaces).toEqual(CROSS_CLI_SURFACES);
    });

    it(`${helper.name} emits every cross-CLI surface`, () => {
      for (const relativePath of [
        claudeRelativePath,
        githubPromptRelativePath,
        extensionPromptRelativePath,
        geminiRelativePath,
        agentsSkillRelativePath,
        systemSkillRelativePath,
      ]) {
        expect(
          fs.existsSync(path.join(REPO_ROOT, relativePath)),
          `expected emitted helper surface ${relativePath}`
        ).toBe(true);
      }
    });

    it(`${helper.name} preserves description parity across generated manifests`, () => {
      const sourceFrontmatter = readMarkdownFrontmatter(readFile(sourceRelativePath));
      const sourceDescription = String(sourceFrontmatter.description);

      const githubPromptFrontmatter = readMarkdownFrontmatter(readFile(githubPromptRelativePath));
      const extensionPromptFrontmatter = readMarkdownFrontmatter(
        readFile(extensionPromptRelativePath)
      );
      const agentSkillFrontmatter = readMarkdownFrontmatter(readFile(agentsSkillRelativePath));
      const systemSkillFrontmatter = readMarkdownFrontmatter(readFile(systemSkillRelativePath));
      const geminiDescription = readTomlDescription(readFile(geminiRelativePath));

      expect(githubPromptFrontmatter.name).toBe(helper.name);
      expect(githubPromptFrontmatter.description).toBe(sourceDescription);
      expect(extensionPromptFrontmatter.name).toBe(helper.name);
      expect(extensionPromptFrontmatter.description).toBe(sourceDescription);
      expect(agentSkillFrontmatter.name).toBe(helper.name);
      expect(agentSkillFrontmatter.description).toBe(sourceDescription);
      expect(systemSkillFrontmatter.name).toBe(helper.name);
      expect(systemSkillFrontmatter.description).toBe(sourceDescription);
      expect(geminiDescription).toBe(sourceDescription);
    });

    it(`${helper.name} preserves its feature-local body contract`, () => {
      const content = readFile(sourceRelativePath);
      const contract = HELPER_BODY_CONTRACTS[helper.name];

      expect(content).toContain(contract.artifactPath);
      REQUIRED_PROVENANCE_FIELDS.forEach((field) => {
        expect(content).toContain(field);
      });
      contract.requiredSections.forEach((section) => {
        expect(content).toContain(section);
      });
    });

    it(`${helper.name} preserves its body contract on emitted long-form surfaces`, () => {
      const contract = HELPER_BODY_CONTRACTS[helper.name];
      const generatedContents = [
        readFile(claudeRelativePath),
        stripFirstFrontmatter(readFile(githubPromptRelativePath)),
        stripFirstFrontmatter(readFile(extensionPromptRelativePath)),
        stripFirstFrontmatter(readFile(agentsSkillRelativePath)),
        stripFirstFrontmatter(readFile(systemSkillRelativePath)),
      ];

      generatedContents.forEach((content) => {
        expect(content).toContain(contract.artifactPath);
        REQUIRED_PROVENANCE_FIELDS.forEach((field) => {
          expect(content).toContain(field);
        });
        contract.requiredSections.forEach((section) => {
          expect(content).toContain(section);
        });
      });

      expect(readFile(geminiRelativePath)).toContain(
        `../../../.specify/commands/${helper.file}.md`
      );
    });
  }
});
