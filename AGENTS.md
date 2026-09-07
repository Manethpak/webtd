# Agent Instructions

These instructions apply to the entire repository.

## Verification

- Run only `npm test` to verify changes.
- Do not start the development server (`npm start`) or any other long-running process.
- Do not launch, automate, or spawn a browser, including a headless browser.
- Do not use browser-based test tools or perform visual browser checks.
- Do not replace the test command with direct or custom test invocations.

## Working Practices

- Keep changes focused on the user's request.
- Preserve existing behavior unless the request explicitly changes it.
- Do not commit secrets, credentials, or local environment files.
