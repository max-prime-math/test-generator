---
title: Sync Architecture
sidebar_position: 3
---

# Sync Architecture

Sync is explicit and provider-based. The app remains local-first even when a provider is connected.

## GitHub

GitHub remote support is implemented through browser git services and the GitHub Git Database REST API for blobs, trees, commits, and refs. The GitHub Contents API is not the sync path.

Tokens are never embedded in remote URLs or sent through CORS proxies. Use fine-grained, expiring tokens scoped to the selected repository with Contents read/write permission.

Pull is fast-forward only and requires a clean working tree. Diverged histories stop without modifying local refs or app data.

## Google Drive

Google Drive sync uses Google Identity Services and the Drive API. Drive sync currently backs up class-backed questions and saved tests to a selected folder and can restore saved tests.

Drive folder selection and sync metadata are stored per bank. App-level client ID/API key/project number can be provided at build time.

## Not Currently Synced

Experimental Gradebook data is intentionally not included in repo sync or Google Drive backup. Future grade export/sync should use explicit student-data workflows.
