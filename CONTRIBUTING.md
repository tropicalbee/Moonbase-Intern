# Contributing to Moonbase Intern

Thanks for helping improve the station.

This is a beginner-built V1 project. There are bugs, unfinished details, and plenty of room to improve. Contributions of all experience levels are welcome.

## Before you start

- Read the README and Code of Conduct.
- Search existing issues before opening a new one.
- For a large feature or major redesign, open an issue first so we can discuss scope.
- Small, focused fixes can go straight to a pull request.

## Report a bug

Please include:

- What you expected to happen.
- What actually happened.
- Steps to reproduce it.
- Browser and operating system.
- A screenshot, short recording, or relevant console error when useful.
- The run seed and repair/system involved, if applicable.

Please remove personal information from screenshots and logs.

## Work on a change

1. Fork the repository.
2. Clone your fork.
3. Create a branch for your change.
4. Install dependencies with `npm ci`.
5. Start the game with `npm run dev`.
6. Make one focused improvement.
7. Run the available checks relevant to your change.
8. Open a pull request.

In Windows PowerShell, use `npm.cmd` if `npm` is blocked by your shell's script policy.

## Check your work

For build and release changes:

```bash
npm run build
npm run verify:release
npm run test:release
```

For gameplay or interface changes, also play through the affected behavior. Explain what you tested and any limitations in your pull request.

If unit tests are included in your checkout, run `npm test` as well.

## Pull request checklist

- Describe the problem and your change.
- Include reproduction steps or before/after images when useful.
- Explain how you tested it.
- Keep unrelated formatting and refactors out of the change.
- Do not commit `node_modules`, generated releases, browser caches, credentials, or local configuration.
- Preserve existing third-party copyright and license notices.

Please use clear commit messages, such as:

- `fix: restore audio after unmuting`
- `feat: improve repair keyboard controls`
- `docs: clarify Linux setup`

## Models, audio, and other assets

Only contribute assets you created or have permission to redistribute.

Include the creator, original source URL, license, and any required attribution. Do not label an asset “free to use” without checking its actual license.

For AI-generated assets, describe the tool used and any relevant reference material or usage restrictions.

Help recovering the sources and licenses of existing assets is particularly welcome.

## Licensing

By submitting original code, you agree to contribute it under the project's Apache License 2.0.

Third-party material must be clearly identified and retain its own applicable license.

## Review expectations

This is a small learning project. Reviews may take time, and not every suggestion will be included. Respectful feedback and smaller changes make review easier for everyone.