# Public build

Moonbase Intern is a static browser game. It requires desktop keyboard/mouse input, WebGL and pointer capture. Audio starts after a user gesture. No backend, login or external AI service is required.

[Play the game](https://moonbase-intern.vercel.app/) · [Source repository](https://github.com/tropicalbee/Moonbase-Intern)

## Install and develop

Use Node.js `^20.19.0 || >=22.12.0`, matching `package.json`. From the repository root:

```sh
npm ci
npm run dev
```

Development serves `http://127.0.0.1:5173/` and does not open a browser automatically. On Windows PowerShell, use `npm.cmd` if the `npm.ps1` shim is blocked.

## Build and verify

```sh
npm run build
npm run verify:release
npm run test:release
npm run preview
```

Each build creates a fresh `dist/releases/public-*` directory. It updates `dist/latest-release.txt` only after the new package passes verification. Existing releases and source assets are retained.

Preview verifies and serves the pointed-to release at `http://127.0.0.1:4173/`. The HTTP smoke check uses port 5193, fetches and hashes every manifest-listed file, checks JavaScript/CSS MIME types, then closes its server.

Release verification checks the package manifest, resources and local HTTP delivery.

## Package contents

The package includes both HTML entries, bundled JavaScript/CSS, the loading-cover image, referenced audio recordings, seventeen GLBs from the shared model allowlist, credits, `.nojekyll`, and `release-manifest.json`.

Models retain their original filenames under `assets/`. Vite emits bundled code and referenced media under `static/`. Checksums cover every packaged file except the manifest itself. Verification rejects changed, missing, unsafe or unmanifested files, unused models and missing HTML/CSS references.

File counts and sizes depend on the current source and assets; read the current build output instead of treating a historical count as a fixed contract.

## Deployment

Upload the **contents of the release directory identified by `dist/latest-release.txt`** to a static host. Do not upload the whole repository or the parent `dist/` directory. Relative URLs support subdirectory hosting; no SPA rewrite is needed.

Serve JavaScript/CSS with appropriate MIME types and GLBs as binary model data. HTTPS supports normal clipboard access; manual copying remains available. Hashed files under `static/` can use long-lived caching; revalidate HTML and the release manifest on updates.

The game is hosted at [moonbase-intern.vercel.app](https://moonbase-intern.vercel.app/). The repository's Vercel build command runs the verified build and copies the pointed-to release into `vercel-dist/`, the configured output directory.

Review [third-party notices](../THIRD_PARTY_NOTICES.md) for asset attribution and permission gaps before redistributing the package.

## Manual release review

Start a shift, exercise each repair variant, inspect overlapping warnings and dependencies, and check pause, low quality, reduced motion and mute. Review failed and successful reports, copying, same-seed replay, fresh retry and records after reload. Check shorter desktop windows and navigation on target hardware.

Build verification and HTTP smoke checks do not replace visual, audio, accessibility or full-shift navigation review.
