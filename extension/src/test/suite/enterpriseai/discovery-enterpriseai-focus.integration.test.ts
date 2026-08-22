import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function readRootCommandFile(fileName: string): string {
  const candidates = [process.cwd(), path.resolve(process.cwd(), '..')];
  const repoRoot = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, '.specify', 'commands'))
  );
  assert.ok(repoRoot, `Unable to resolve repo root from ${process.cwd()}`);
  return fs.readFileSync(path.join(repoRoot, '.specify', 'commands', fileName), 'utf8');
}

suite('enterpriseai discovery enterpriseai focus (extension integration)', () => {
  test('frames discovery as EnterpriseAI-first and excludes non-EAI primary recommendations', () => {
    const discoveryCommand = readRootCommandFile('0_gofer_start.md');

    assert.ok(/EnterpriseAI-First Discovery Framing \(MANDATORY\)/.test(discoveryCommand));
    assert.ok(
      /Do \*\*not\*\* present non-EAI platforms as primary recommendations\./.test(discoveryCommand)
    );
    assert.ok(
      /Non-EAI platforms must never be presented as primary recommendations during\s+discovery/.test(
        discoveryCommand
      )
    );
  });

  test('requires structured problem statement, persona, and value proposition outputs', () => {
    const researchCommand = readRootCommandFile('1_gofer_research.md');

    assert.ok(/Structured Discovery Outputs \(MANDATORY\)/.test(researchCommand));
    assert.ok(/Structured Problem Statement/.test(researchCommand));
    assert.ok(/Structured Target Persona/.test(researchCommand));
    assert.ok(/Structured Value Proposition/.test(researchCommand));
  });
});
