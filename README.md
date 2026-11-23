# Kaloyan Cleaner PWA — mobile GitHub upload

Static, browser-installable version for Chromebook and Netlify / GitHub Pages.

## Upload from Android

1. Unzip this archive in Samsung My Files.
2. Open your empty GitHub repository, click **uploading an existing file**.
3. Select **all 9 files** from this folder in the file picker (do **not** upload the ZIP itself).
4. Press **Commit changes**.
5. For GitHub Pages, visit **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**.

## Notes

- Gemini personal API key is configured *after* deployment in Settings. No keys are bundled.
- On a public GitHub Pages deployment, anyone can view the static site.
- Server-validated licenses require the separate Netlify Functions + Supabase project; they are **not active** in this static build.
- Capture always requires browser screen-sharing permission and cannot work around school policies.
- Host over HTTPS. Do not use file:// to test service workers or screen capture.
- Never commit secrets, API keys, or Supabase service-role credentials to a public repository.
