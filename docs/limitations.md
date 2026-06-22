---
title: Limitations
sidebar_position: 2
---

# Limitations

## Local Browser Data

Clearing browser site data can erase local banks, custom classes, saved tests, images, Git remotes, Google Drive folder selections, and Gradebook data. Export backups periodically.

## Image Exports

Basic JSON export includes image references, not all image bytes. Moving a bank to another browser may require re-uploading images unless using a package/export path that carries assets.

Downloaded `.typ` files reference app-internal `/imgs/` paths for images stored in IndexedDB. They will not compile standalone without copying images and adjusting paths.

## LaTeX Image Options

Only `width` and `height` on `\includegraphics` are preserved. Options such as `angle`, `trim`, `clip`, `scale`, and `keepaspectratio` are currently dropped.

Subdirectory image references collapse to basename. Two questions that reference the same basename share the same stored image.

## Gradebook

The Gradebook is experimental. It intentionally does not implement dropped scores, retakes, late penalties, curves, standards-based reporting, cloud sync, or Classroom grade passback yet.

Gradebook data is not included in GitHub repo sync or Google Drive backup.
