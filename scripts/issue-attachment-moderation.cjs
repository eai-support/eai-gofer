#!/usr/bin/env node

const UNSAFE_ATTACHMENT_EXTENSIONS = new Set([
  '.7z',
  '.app',
  '.bat',
  '.bz2',
  '.cmd',
  '.com',
  '.dmg',
  '.exe',
  '.gz',
  '.jar',
  '.js',
  '.msi',
  '.pkg',
  '.ps1',
  '.rar',
  '.scr',
  '.sh',
  '.tar',
  '.tgz',
  '.vbs',
  '.xz',
  '.zip',
]);

const DEFAULT_TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const MODERATION_MARKER = '<!-- eai-attachment-moderation -->';

function trimUrl(url) {
  return url.replace(/[)\].,;!?]+$/g, '');
}

function parseTrustedAssociations(value) {
  if (!value) {
    return DEFAULT_TRUSTED_ASSOCIATIONS;
  }

  return new Set(
    value
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
  );
}

function unsafeExtensionForUrl(url) {
  try {
    const parsed = new URL(trimUrl(url));
    if (parsed.hostname !== 'github.com' || !parsed.pathname.startsWith('/user-attachments/files/')) {
      return null;
    }

    const pathname = decodeURIComponent(parsed.pathname).toLowerCase();
    for (const extension of UNSAFE_ATTACHMENT_EXTENSIONS) {
      if (pathname.endsWith(extension)) {
        return extension;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function findUnsafeAttachments(body = '') {
  const matches = [];
  const seen = new Set();
  const githubAttachmentPattern = /https:\/\/github\.com\/user-attachments\/files\/[^\s<>"']+/gi;

  for (const match of body.matchAll(githubAttachmentPattern)) {
    const url = trimUrl(match[0]);
    const extension = unsafeExtensionForUrl(url);
    if (extension && !seen.has(url)) {
      seen.add(url);
      matches.push({ url, extension });
    }
  }

  return matches;
}

function stripUnsafeAttachments(body = '') {
  let stripped = body;
  const markdownLinkPattern = /!?\[[^\]]*\]\((https:\/\/github\.com\/user-attachments\/files\/[^)\s]+)\)/gi;
  stripped = stripped.replace(markdownLinkPattern, (match, url) => {
    const extension = unsafeExtensionForUrl(url);
    return extension ? `[removed unsafe attachment: ${extension}]` : match;
  });

  const bareUrlPattern = /https:\/\/github\.com\/user-attachments\/files\/[^\s<>"']+/gi;
  stripped = stripped.replace(bareUrlPattern, (url) => {
    const extension = unsafeExtensionForUrl(url);
    return extension ? `[removed unsafe attachment: ${extension}]` : url;
  });

  return stripped;
}

function isTrustedAssociation(association, trustedAssociations = DEFAULT_TRUSTED_ASSOCIATIONS) {
  return trustedAssociations.has(String(association || '').toUpperCase());
}

function buildModerationPlan({
  eventName,
  issue,
  comment,
  moderationAction = 'delete-comment',
  trustedAssociations = DEFAULT_TRUSTED_ASSOCIATIONS,
}) {
  if (!issue || issue.pull_request) {
    return { action: 'skip', reason: 'not_an_issue' };
  }

  if (eventName === 'issue_comment') {
    const attachments = findUnsafeAttachments(comment?.body || '');
    if (attachments.length === 0) {
      return { action: 'skip', reason: 'no_unsafe_attachments' };
    }
    if (isTrustedAssociation(comment?.author_association, trustedAssociations)) {
      return { action: 'skip', reason: 'trusted_author', attachments };
    }

    return {
      action: moderationAction === 'minimize' ? 'minimize-comment' : 'delete-comment',
      reason: 'unsafe_issue_comment_attachment',
      issueNumber: issue.number,
      commentId: comment.id,
      commentNodeId: comment.node_id,
      attachments,
    };
  }

  if (eventName === 'issues') {
    const attachments = findUnsafeAttachments(issue.body || '');
    if (attachments.length === 0) {
      return { action: 'skip', reason: 'no_unsafe_attachments' };
    }
    if (isTrustedAssociation(issue.author_association, trustedAssociations)) {
      return { action: 'skip', reason: 'trusted_author', attachments };
    }

    return {
      action: 'scrub-issue-body',
      reason: 'unsafe_issue_body_attachment',
      issueNumber: issue.number,
      sanitizedBody: stripUnsafeAttachments(issue.body || ''),
      attachments,
    };
  }

  return { action: 'skip', reason: 'unsupported_event' };
}

function warningBody(plan) {
  const extensions = [...new Set(plan.attachments.map((attachment) => attachment.extension))].join(', ');

  return `${MODERATION_MARKER}
Security note: this issue contained an archive, script, installer, or executable attachment (${extensions}).

Maintainers do not open unsolicited ZIPs, scripts, installers, or binaries from public issues. Please paste commands, sanitized logs, or text snippets directly into the issue instead.

If the attachment is required for a vulnerability report, please use private vulnerability reporting instead: https://github.com/eai-tools/eai-gofer/security/advisories/new`;
}

async function githubRequest(path, { method = 'GET', body, token, apiUrl = 'https://api.github.com' } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    throw new Error(`GitHub API ${method} ${path} failed with ${response.status}: ${text}`);
  }

  return response.status === 204 ? null : response.json();
}

async function issueAlreadyWarned({ owner, repo, issueNumber, token, apiUrl }) {
  const comments = await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`, {
    token,
    apiUrl,
  });

  return comments.some((comment) => String(comment.body || '').includes(MODERATION_MARKER));
}

async function applyModerationPlan(plan, { owner, repo, token, apiUrl = 'https://api.github.com' }) {
  if (plan.action === 'delete-comment') {
    await githubRequest(`/repos/${owner}/${repo}/issues/comments/${plan.commentId}`, {
      method: 'DELETE',
      token,
      apiUrl,
    });
    return { applied: true, action: plan.action };
  }

  if (plan.action === 'scrub-issue-body') {
    await githubRequest(`/repos/${owner}/${repo}/issues/${plan.issueNumber}`, {
      method: 'PATCH',
      body: { body: plan.sanitizedBody },
      token,
      apiUrl,
    });

    const warned = await issueAlreadyWarned({ owner, repo, issueNumber: plan.issueNumber, token, apiUrl });
    if (!warned) {
      await githubRequest(`/repos/${owner}/${repo}/issues/${plan.issueNumber}/comments`, {
        method: 'POST',
        body: { body: warningBody(plan) },
        token,
        apiUrl,
      });
    }

    return { applied: true, action: plan.action };
  }

  return { applied: false, action: plan.action, reason: plan.reason };
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const eventName = process.env.GITHUB_EVENT_NAME;
  const [owner, repo] = String(process.env.GITHUB_REPOSITORY || '').split('/');

  if (!token || !eventPath || !eventName || !owner || !repo) {
    throw new Error('GITHUB_TOKEN, GITHUB_EVENT_PATH, GITHUB_EVENT_NAME, and GITHUB_REPOSITORY are required');
  }

  const event = require(eventPath);
  const plan = buildModerationPlan({
    eventName,
    issue: event.issue,
    comment: event.comment,
    moderationAction: process.env.EAI_ATTACHMENT_MODERATION_ACTION || 'delete-comment',
    trustedAssociations: parseTrustedAssociations(process.env.EAI_ATTACHMENT_MODERATION_TRUSTED_ASSOCIATIONS),
  });

  console.log(JSON.stringify({ plan }, null, 2));

  if (plan.action === 'skip') {
    return;
  }

  const result = await applyModerationPlan(plan, {
    owner,
    repo,
    token,
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
  });
  console.log(JSON.stringify({ result }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  MODERATION_MARKER,
  UNSAFE_ATTACHMENT_EXTENSIONS,
  buildModerationPlan,
  findUnsafeAttachments,
  isTrustedAssociation,
  parseTrustedAssociations,
  stripUnsafeAttachments,
  unsafeExtensionForUrl,
  warningBody,
};
