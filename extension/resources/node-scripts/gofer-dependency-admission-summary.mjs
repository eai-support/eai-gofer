#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

function usage() {
  throw new Error('Usage: gofer-dependency-admission-summary.mjs --input <report.json> --output <summary.md>');
}

function args(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    if (!['--input', '--output'].includes(values[index]) || !values[index + 1]) usage();
    result[values[index].slice(2)] = values[++index];
  }
  if (!result.input || !result.output) usage();
  return result;
}

export function markdown(report) {
  const outcome = report.decision === 'allow' ? 'Approved' : report.decision === 'review' ? 'Needs named review' : 'Blocked';
  const next = report.decision === 'allow'
    ? 'Continue with the script-disabled frozen-lockfile installation.'
    : report.decision === 'review'
      ? 'Resolve the listed review signals, then rerun dependency admission.'
      : 'Use a safe version, remove the package, or submit a valid urgent-security exception for a verified fix.';
  const affected = (report.packages || []).filter((item) => item.decision !== 'allow')
    .map((item) => `- \`${item.name}@${item.version}\`: ${item.findings.map((finding) => finding.message).join(' ')}`)
    .join('\n');
  return [
    '<!-- gofer-dependency-admission -->',
    `## Dependency admission: ${outcome}`,
    '',
    `Checked ${report.summary?.packages ?? 0} changed package version(s) using policy ${report.policyVersion ?? 'unknown'}.`,
    '',
    affected || '- No changed package requires action.',
    '',
    `**Next action:** ${next}`,
    '',
  ].join('\n');
}

const direct = process.argv[1] && process.argv[1].endsWith('gofer-dependency-admission-summary.mjs');
if (direct) {
  const options = args(process.argv.slice(2));
  const report = JSON.parse(await readFile(options.input, 'utf8'));
  await writeFile(options.output, markdown(report), { encoding: 'utf8', mode: 0o600 });
}
