import { describe, it, expect } from 'vitest';
import { CheckpointValidator } from '../../../extension/src/autonomous/CheckpointValidator';

describe('CheckpointValidator', () => {
  let validator: CheckpointValidator;

  beforeEach(() => {
    validator = new CheckpointValidator();
  });

  describe('validate', () => {
    it('should pass valid checkpoint content', () => {
      const content = `---
session_id: test-123
timestamp: 2026-02-15T10:00:00Z
stage: implement
status: in_progress
---

# Session Handoff

Continue from session-checkpoint.md

## Key Decisions

- Decision 1

## Next Steps

- Step 1
`;

      const result = validator.validate(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn at 8000 tokens (not 5000)', () => {
      // Create content that is > 8000 tokens (> 32000 chars) but < old 5000 limit
      // 8000 tokens * 4 chars = 32000 chars
      const padding = 'A'.repeat(32004);
      const content = `---
session_id: test-123
timestamp: 2026-02-15T10:00:00Z
stage: implement
status: in_progress
---

# Session Handoff

Continue from session-checkpoint.md

${padding}
`;

      const result = validator.validate(content);

      expect(result.warnings.some((w) => w.includes('budget: 8000'))).toBe(true);
    });

    it('should not warn at 5000 tokens (old threshold)', () => {
      // Create content that is ~6000 tokens (24000 chars) - above old limit but below new
      const padding = 'B'.repeat(24000);
      const content = `---
session_id: test-123
timestamp: 2026-02-15T10:00:00Z
stage: implement
status: in_progress
---

# Session Handoff

Continue from session-checkpoint.md

${padding}
`;

      const result = validator.validate(content);

      // Should NOT have a token budget warning
      expect(result.warnings.some((w) => w.includes('budget'))).toBe(false);
    });

    it('should warn when "Key Decisions" section is empty', () => {
      const content = `---
session_id: test-123
timestamp: 2026-02-15T10:00:00Z
stage: implement
status: in_progress
---

# Session Handoff

Continue from session-checkpoint.md

## Key Decisions

## Next Steps

- Do something
`;

      const result = validator.validate(content);

      expect(
        result.warnings.some((w) => w.includes('"Key Decisions"') && w.includes('no content'))
      ).toBe(true);
    });

    it('should warn when "Next Steps" section is empty', () => {
      const content = `---
session_id: test-123
timestamp: 2026-02-15T10:00:00Z
stage: implement
status: in_progress
---

# Session Handoff

Continue from session-checkpoint.md

## Key Decisions

- Made a decision

## Next Steps

`;

      const result = validator.validate(content);

      expect(
        result.warnings.some((w) => w.includes('"Next Steps"') && w.includes('no content'))
      ).toBe(true);
    });

    it('should not warn when critical sections have content', () => {
      const content = `---
session_id: test-123
timestamp: 2026-02-15T10:00:00Z
stage: implement
status: in_progress
---

# Session Handoff

Continue from session-checkpoint.md

## Key Decisions

- Used JWT for auth
- Chose PostgreSQL

## Next Steps

- Implement login endpoint
- Add tests
`;

      const result = validator.validate(content);

      expect(result.warnings.some((w) => w.includes('no content'))).toBe(false);
    });

    it('should report error for missing frontmatter', () => {
      const content = '# Session Handoff\n\nNo frontmatter here.';

      const result = validator.validate(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('frontmatter'))).toBe(true);
    });

    it('should report error for missing required fields', () => {
      const content = `---
session_id: test-123
---

# Session Handoff

Continue from session-checkpoint.md
`;

      const result = validator.validate(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('timestamp'))).toBe(true);
      expect(result.errors.some((e) => e.includes('stage'))).toBe(true);
      expect(result.errors.some((e) => e.includes('status'))).toBe(true);
    });
  });
});
