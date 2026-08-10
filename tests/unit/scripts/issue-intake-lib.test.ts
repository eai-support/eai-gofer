import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeIssue,
  parseIssueSections,
  renderPrepBrief,
  slugifyTitle,
} from '../../../scripts/github/issue-intake-lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const POLICY = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, '.github', 'gofer-roadmap.json'), 'utf8')
);

describe('issue intake library', () => {
  it('slugifies issue titles into stable branch-safe names', () => {
    expect(slugifyTitle('[Feature]: Improve Claude plugin install flow')).toBe(
      'improve-claude-plugin-install-flow'
    );
  });

  it('parses GitHub issue-form sections', () => {
    const sections = parseIssueSections(`
### Problem to solve

The README install path is stale.

### Proposed change

Update the public install instructions.
`);

    expect(sections['Problem to solve']).toContain('stale');
    expect(sections['Proposed change']).toContain('public install');
  });

  it('marks structured roadmap-fit issues for prep PR creation', () => {
    const issue = {
      number: 42,
      title: '[Feature]: Improve Claude install and update path',
      body: `### Problem to solve

Claude users still hit an outdated install path in the public docs and release surfaces.

### Proposed change

Update the repo marketplace guidance and plugin packaging so the public install path is consistent.

### Most affected surface

Claude Code

### Roadmap area

Cross-host install/update parity

### Alternatives considered

Leave the current flow as-is and document a workaround.
`,
      labels: [{ name: 'enhancement' }],
      html_url: 'https://github.com/eai-support/eai-gofer/issues/42',
    };

    const analysis = analyzeIssue(issue, POLICY);

    expect(analysis.status).toBe('roadmap-fit');
    expect(analysis.shouldPreparePr).toBe(true);
    expect(analysis.areaId).toBe('cross-host-parity');
    expect(analysis.labelsToAdd).toContain('status:roadmap-fit');
    expect(analysis.labelsToAdd).toContain('status:prep-pr');
    expect(analysis.labelsToAdd).toContain('area:host-parity');
    expect(analysis.branchName).toBe(`issue-prep/42-${slugifyTitle(issue.title)}`);

    const brief = renderPrepBrief(issue, analysis);
    expect(brief).toContain('Issue Prep: #42');
    expect(brief).toContain('Cross-host install/update parity');
    expect(brief).toContain('Check plugins/eai-gofer/');
  });

  it('routes question-style issues away from automated prep PRs', () => {
    const issue = {
      number: 9,
      title: '[Question]: How do I install this in Codex?',
      body: 'I am trying to understand which command to run first.',
      labels: [],
      html_url: 'https://github.com/eai-support/eai-gofer/issues/9',
    };

    const analysis = analyzeIssue(issue, POLICY);

    expect(analysis.status).toBe('support-only');
    expect(analysis.shouldPreparePr).toBe(false);
    expect(analysis.labelsToAdd).toContain('status:needs-human-triage');
  });

  it('keeps thin issues in human triage instead of auto-preparing a PR', () => {
    const issue = {
      number: 77,
      title: '[Feature]: Make it better',
      body: 'Please improve this.',
      labels: [{ name: 'enhancement' }],
      html_url: 'https://github.com/eai-support/eai-gofer/issues/77',
    };

    const analysis = analyzeIssue(issue, POLICY);

    expect(analysis.status).toBe('needs-human-triage');
    expect(analysis.shouldPreparePr).toBe(false);
  });
});
