import React from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import releasesData from '@site/static/releases.json';
import styles from './releases.module.css';

function formatDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function buildButtons(release) {
  const buttons = [];
  if (release.download_url) {
    buttons.push({ label: 'Download VSIX', href: release.download_url, primary: true });
  }
  const assets = release.assets || {};
  if (assets.claude?.download_url) {
    buttons.push({ label: 'Download Agent Plugin Zip', href: assets.claude.download_url });
  }
  if (assets.claude?.marketplace_url) {
    buttons.push({ label: 'Open Claude Marketplace', href: assets.claude.marketplace_url });
  }
  if (assets.codex?.manifest_url) {
    buttons.push({ label: 'Open Codex Manifest', href: assets.codex.manifest_url });
  }
  if (assets.copilot?.marketplace_url) {
    buttons.push({ label: 'Open Copilot Marketplace', href: assets.copilot.marketplace_url });
  }
  if (assets.gemini?.manifest_url) {
    buttons.push({ label: 'Open Gemini Manifest', href: assets.gemini.manifest_url });
  }
  return buttons;
}

function ReleaseCard({ release, isLatest }) {
  const buttons = buildButtons(release);
  return (
    <div className={styles.releaseItem}>
      <div className={styles.releaseHeader}>
        <div>
          <h3 className={styles.releaseVersion}>
            Version {release.version}
            {isLatest && <span className={styles.latestBadge}>Latest</span>}
          </h3>
          <div className={styles.releaseDate}>{formatDate(release.published_at)}</div>
        </div>
        <div className={styles.downloadRow}>
          {buttons.map((b) => (
            <a
              key={b.label}
              className={clsx('button', b.primary ? 'button--primary' : 'button--secondary')}
              href={b.href}
            >
              {b.label}
            </a>
          ))}
        </div>
      </div>
      {release.notes && (
        <div className={styles.releaseNotes}>
          <strong>Release Notes</strong>
          <p className={styles.notesBody}>{release.notes}</p>
        </div>
      )}
    </div>
  );
}

export default function Releases() {
  const releases = releasesData.releases || [];
  return (
    <Layout title="Releases" description="Gofer releases and downloads">
      <main className="container margin-vert--lg">
        <h1>Releases</h1>
        <div className={styles.releasesCard}>
          <div className={styles.releasesCardHeader}>
            <span>Available Releases</span>
            {releasesData.latest_version && (
              <span className={styles.currentVersion}>v{releasesData.latest_version}</span>
            )}
          </div>
          {releases.length === 0 ? (
            <div className={styles.empty}>No releases available yet.</div>
          ) : (
            releases.map((release, i) => (
              <ReleaseCard key={release.version} release={release} isLatest={i === 0} />
            ))
          )}
        </div>

        <div className={styles.installGuide}>
          <h3>Installation Instructions</h3>
          <ol>
            <li>
              Download the latest <code>.vsix</code> file from above
            </li>
            <li>Open VS Code</li>
            <li>
              Press <code>Cmd+Shift+P</code> (macOS) or <code>Ctrl+Shift+P</code> (Windows/Linux)
            </li>
            <li>Type &quot;Extensions: Install from VSIX&quot;</li>
            <li>
              Select the downloaded <code>.vsix</code> file
            </li>
            <li>Restart VS Code</li>
            <li>
              Open a workspace with a <code>.specify/</code> folder to activate Gofer
            </li>
          </ol>
          <p>
            <strong>Agent surfaces:</strong> use the public GitHub repo{' '}
            <code>https://github.com/eai-support/eai-gofer</code> as the install source for Claude,
            Codex, Copilot, and Gemini. Use the release card here for VSIX and downloadable zip
            artifacts.
          </p>
          <p>
            After install, start or continue work with <code>/eai ...</code>, <code>#eai ...</code>,
            or <code>$eai ...</code> depending on the host. Gofer runs the design, build, and
            validation pipeline for you; numbered stage commands are internal routing contracts.
          </p>
        </div>
      </main>
    </Layout>
  );
}
