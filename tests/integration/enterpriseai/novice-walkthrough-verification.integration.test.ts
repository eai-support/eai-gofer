import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readCommandFile(fileName: string): string {
  return fs.readFileSync(path.join(process.cwd(), '.claude', 'commands', fileName), 'utf8');
}

describe('enterpriseai novice walkthrough verification (root integration)', () => {
  it('keeps discovery walkthrough novice-friendly without external docs', () => {
    const discoveryCommand = readCommandFile('0_gofer_start.md');

    expect(discoveryCommand).toMatch(/Novice Walkthrough Guardrail \(MANDATORY\)/);
    expect(discoveryCommand).toMatch(
      /Do not require external documentation to complete discovery\./
    );
    expect(discoveryCommand).toMatch(
      /Provide recommended options and plain-language implications for every\s+question\./
    );
  });

  it('keeps research outputs actionable for novices without external docs', () => {
    const researchCommand = readCommandFile('1_gofer_research.md');

    expect(researchCommand).toMatch(/Novice Walkthrough Guardrail \(MANDATORY\)/);
    expect(researchCommand).toMatch(
      /Do not require external docs to understand or act on research output\./
    );
    expect(researchCommand).toMatch(
      /Explain terms and recommendations in plain language before advanced details\./
    );
  });
});
