# NOVARO Business Control

Arabic RTL restaurant business-control web application, currently focused on front-of-house inventory and stocktaking.

## Publish

- GitHub repository: https://github.com/islam-mostafa2027/NOVARO-Business-Control
- Live web app: https://islam-mostafa2027.github.io/NOVARO-Business-Control/
- GitHub Pages deploys the repository root from the `main` branch.

## Backend

- Supabase project: `acgbcucjdmkboryxbhid`
- The frontend uses the public publishable key only. Never add a Supabase service-role key to client-side code.
- Initial setup must be completed using the owner-authorized account. The database setup RPC initializes the owner, first branch, and starter categories.

## Android app

- The Android project is generated and built by the manual workflow at `.github/workflows/build-android.yml`.
- To create an APK, run the **Build NOVARO Inventory Android APK** workflow manually from GitHub Actions.
- The workflow uploads an APK artifact and publishes a GitHub Release when the build succeeds.
- Android APK releases: https://github.com/islam-mostafa2027/NOVARO-Business-Control/releases

## Deployment workflow

The GitHub Actions workflow in `.github/workflows/deploy.yml` deploys the web app to GitHub Pages on updates to `main`. Android builds are manual and are not triggered by every web update.
