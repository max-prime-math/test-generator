# TODO

## Google Drive Launch Checklist

- Create a Google Cloud OAuth client for a Web application.
- Add authorized JavaScript origins for:
  - `http://localhost:5173`
  - `https://max-prime-math.github.io`
- Enable the Google Drive API.
- Enable the Google Picker API.
- Create a public Google Picker API key.
- Restrict the API key to the app's web origins.
- Restrict the API key to the Google Picker API.
- Add yourself as a Google OAuth test user while the app is in Testing mode.
- Add GitHub Actions repository variables:
  - `VITE_GOOGLE_CLIENT_ID`
  - `VITE_GOOGLE_API_KEY`
  - `VITE_GOOGLE_CLOUD_PROJECT_NUMBER`
- Add local dev values in `.env.local` when testing outside GitHub Actions.

## Google Drive Follow-Ups

- Add an explicit "Change Drive folder" action without requiring disconnect/reconnect.
- Test the Picker flow end-to-end in both local dev and GitHub Pages.
- Verify how Google treats `drive.file` + Picker for production publishing and whether any extra verification steps are required.
