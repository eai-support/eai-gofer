import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readCommandFile(fileName: string): string {
  return fs.readFileSync(path.join(process.cwd(), '.specify', 'commands', fileName), 'utf8');
}

describe('enterpriseai discovery enterpriseai focus (root integration)', () => {
  it('frames discovery as EnterpriseAI-first and excludes non-EAI primary recommendations', () => {
    const discoveryCommand = readCommandFile('0_gofer_start.md');

    expect(discoveryCommand).toMatch(/EnterpriseAI-First Discovery Framing \(MANDATORY\)/);
    expect(discoveryCommand).toMatch(
      /Do \*\*not\*\* present non-EAI platforms as primary recommendations\./
    );
    expect(discoveryCommand).toMatch(
      /Non-EAI platforms must never be presented as primary recommendations during\s+discovery/
    );
  });

  it('requires structured problem statement, persona, and value proposition outputs', () => {
    const researchCommand = readCommandFile('1_gofer_research.md');

    expect(researchCommand).toMatch(/Structured Discovery Outputs \(MANDATORY\)/);
    expect(researchCommand).toMatch(/Structured Problem Statement/);
    expect(researchCommand).toMatch(/Structured Target Persona/);
    expect(researchCommand).toMatch(/Structured Value Proposition/);
  });
});
