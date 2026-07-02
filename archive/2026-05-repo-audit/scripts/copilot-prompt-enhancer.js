#!/usr/bin/env node
/**
 * Standalone Copilot Prompt Enhancer
 * Enhances existing Copilot prompts with auto-chain sections while preserving YAML frontmatter
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workspaceRoot = path.join(__dirname, '..');
const copilotPromptsDir = path.join(workspaceRoot, '.github', 'prompts');

// Pipeline sequence for auto-chain injection
const PIPELINE_SEQUENCE = [
  '0_gofer_start',
  '0a_problem_validation',
  '1_gofer_research',
  '2_gofer_specify',
  '3_gofer_plan',
  '4_gofer_tasks',
  '5_gofer_implement',
  '6_gofer_validate',
];

function getNextCommand(currentCommand) {
  const index = PIPELINE_SEQUENCE.indexOf(currentCommand);
  if (index >= 0 && index < PIPELINE_SEQUENCE.length - 1) {
    return PIPELINE_SEQUENCE[index + 1];
  }
  return null;
}

function extractYamlFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  try {
    const frontmatter = yaml.load(match[1]);
    const body = match[2];
    return { frontmatter, body };
  } catch (error) {
    console.error('Failed to parse YAML frontmatter:', error);
    return { frontmatter: {}, body: content };
  }
}

function injectPipelineContinuation(body, commandName) {
  const nextCommand = getNextCommand(commandName);

  if (!nextCommand) {
    // No next command (end of pipeline or auxiliary command)
    return body;
  }

  const pipelineContinuationSection = `
## Pipeline Continuation

This completes the ${commandName} stage. To continue the Gofer pipeline:

**Next Command:** \`#${nextCommand}\`

The next stage will read the artifacts from this stage and continue the workflow automatically.

**Note:** Copilot Chat supports context preservation. Your conversation history will be maintained as you progress through pipeline stages.

`;

  // Check if Pipeline Continuation already exists
  if (body.includes('## Pipeline Continuation')) {
    return body;
  }

  // Inject before "Important Notes", "Key Rules", or at the end
  if (body.includes('## Important Notes')) {
    return body.replace('## Important Notes', pipelineContinuationSection + '## Important Notes');
  } else if (body.includes('## Key Rules')) {
    return body.replace('## Key Rules', pipelineContinuationSection + '## Key Rules');
  } else {
    // Add at the end
    return body.trimEnd() + '\n' + pipelineContinuationSection;
  }
}

function enhanceCopilotPrompt(promptFilePath) {
  const fileName = path.basename(promptFilePath, '.prompt.md');

  // Read existing prompt file
  const content = fs.readFileSync(promptFilePath, 'utf8');

  // Extract frontmatter and body
  const { frontmatter, body } = extractYamlFrontmatter(content);

  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    console.error(`  ❌ Missing or invalid YAML frontmatter`);
    return false;
  }

  // Inject Pipeline Continuation section
  const enhancedBody = injectPipelineContinuation(body, fileName);

  // Rebuild file with preserved frontmatter
  const enhancedContent = '---\n' + yaml.dump(frontmatter) + '---\n' + enhancedBody;

  // Write enhanced file back
  fs.writeFileSync(promptFilePath, enhancedContent, 'utf8');

  return true;
}

function main() {

  if (!fs.existsSync(copilotPromptsDir)) {
    console.error(`❌ Copilot prompts directory not found: ${copilotPromptsDir}`);
    process.exit(1);
  }

  // Find all Copilot prompt files
  const promptFiles = fs
    .readdirSync(copilotPromptsDir)
    .filter((file) => file.endsWith('.prompt.md'))
    .map((file) => path.join(copilotPromptsDir, file));


  let successCount = 0;
  let failureCount = 0;

  for (const promptFile of promptFiles) {
    try {
      const success = enhanceCopilotPrompt(promptFile);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    } catch (error) {
      console.error(`  ❌ Failed to enhance:`, error.message);
      failureCount++;
    }
  }


  if (failureCount > 0) {
    process.exit(1);
  }

}

main();
