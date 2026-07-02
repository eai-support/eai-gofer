import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function readRootCommandFile(fileName: string): string {
  return fs.readFileSync(path.join(process.cwd(), '..', '.claude', 'commands', fileName), 'utf8');
}

suite('enterpriseai novice walkthrough verification (extension integration)', () => {
  test('keeps discovery walkthrough novice-friendly without external docs', () => {
    const discoveryCommand = readRootCommandFile('0_gofer_start.md');

    assert.ok(/Novice Walkthrough Guardrail \(MANDATORY\)/.test(discoveryCommand));
    assert.ok(
      /Do not require external documentation to complete discovery\./.test(discoveryCommand)
    );
    assert.ok(
      /Provide recommended options and plain-language implications for every\s+question\./.test(
        discoveryCommand
      )
    );
  });

  test('keeps research outputs actionable for novices without external docs', () => {
    const researchCommand = readRootCommandFile('1_gofer_research.md');

    assert.ok(/Novice Walkthrough Guardrail \(MANDATORY\)/.test(researchCommand));
    assert.ok(
      /Do not require external docs to understand or act on research output\./.test(researchCommand)
    );
    assert.ok(
      /Explain terms and recommendations in plain language before advanced details\./.test(
        researchCommand
      )
    );
  });
});
