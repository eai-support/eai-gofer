import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type ExtensionManifest = {
  contributes?: {
    chatPromptFiles?: Array<{ path: string }>;
  };
};

const repoRoot = process.cwd();

function readRegisteredPromptNames(): string[] {
  const manifestPath = path.join(repoRoot, 'extension', 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ExtensionManifest;

  return (manifest.contributes?.chatPromptFiles ?? []).map((entry) => {
    const promptPath = path.join(repoRoot, 'extension', entry.path.replace(/^\.\//, ''));
    const content = readFileSync(promptPath, 'utf8');
    return content.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? path.basename(entry.path, '.prompt.md');
  });
}

test.describe('VS Code/Copilot slash command registration', () => {
  test('keeps only /eai sendable in a Copilot-style chat input', async ({ page }) => {
    const registeredPrompts = readRegisteredPromptNames();

    expect(registeredPrompts).toContain('eai');
    expect(registeredPrompts).not.toContain('gofer');

    await page.setContent(`
      <label for="chat">Copilot chat</label>
      <textarea id="chat"></textarea>
      <button id="send">Send</button>
      <output id="status"></output>
      <script>
        const registeredSlashCommands = new Set(${JSON.stringify(registeredPrompts)});
        const input = document.getElementById('chat');
        const send = document.getElementById('send');
        const status = document.getElementById('status');

        function firstToken(value) {
          return value.trimStart().split(/\\s+/, 1)[0] || '';
        }

        function isSendable(value) {
          const token = firstToken(value);
          if (!token.startsWith('/')) {
            return value.trim().length > 0;
          }

          return registeredSlashCommands.has(token.slice(1)) && value.trim().length > token.length;
        }

        input.addEventListener('input', () => {
          send.disabled = !isSendable(input.value);
        });

        send.addEventListener('click', () => {
          status.textContent = 'sent';
        });

        send.disabled = true;
      </script>
    `);

    const input = page.getByLabel('Copilot chat');
    const send = page.getByRole('button', { name: 'Send' });
    const status = page.locator('#status');

    await input.fill('/missing build an EAI app');
    await expect(send).toBeDisabled();

    await input.fill('/eai build an EAI app');
    await expect(send).toBeEnabled();
    await send.click();
    await expect(status).toHaveText('sent');

    await input.fill('/gofer continue the delivery pipeline');
    await expect(send).toBeDisabled();
  });
});
