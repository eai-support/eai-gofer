import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

describe('Grok Bot handoff contract', () => {
  // Markdown line wrapping does not change the contract's required wording.
  const doc = fs
    .readFileSync('.specify/references/grok-bot.md', 'utf8')
    .replace(/^>\s?/gm, '')
    .replace(/\s+/g, ' ');
  it('separates the cloud workspace and approval boundary from CLI access', () => {
    for (const required of [
      'cloud-computer',
      'local folder is',
      'Do not copy my local credentials',
      'Do not assume a CLI plugin',
      'Do not schedule work',
      'separate Bots can share files',
      'Do not create a public Bot share link',
    ])
      expect(doc).toContain(required);
  });
  it('keeps all stages, default routing, lifecycle checks and explicit maintenance', () => {
    for (const required of [
      'full internal pipeline',
      'even without',
      'Confirm non-app work',
      'current build stage',
      'unimplemented auth',
      'changed requirement',
      'fresh marker',
      'eai-update',
      'explicit update request',
      'not a host-enforced interceptor',
    ])
      expect(doc).toContain(required);
  });
  it('does not invent a desktop CLI installer or pin models', () => {
    expect(doc).not.toMatch(/grok (?:plugin install|bot install)|grok-\d|XAI_API_KEY=/);
    expect(doc).toContain('Settings > Plugins > Yours');
  });
});
