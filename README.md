# NOVARO Inventory
Independent Arabic RTL inventory app for restaurant front-of-house and service equipment. Kitchen equipment is excluded.

## Publish
GitHub repository: islammostafa702-commits/NOVARO-Inventory
Enable GitHub Pages: Settings → Pages → Deploy from a branch → main → /(root).

## Backend
Supabase project: acgbcucjdmkboryxbhid
The frontend uses only the public publishable key. Do not add service-role keys.
First account must use the owner-authorized email and run the first-time setup screen. The database RPC initializes the owner, first branch, and starter categories.


## Installable apps

- Web app: https://islammostafa702-commits.github.io/NOVARO-Inventory/
- Android APK releases: https://github.com/islammostafa702-commits/NOVARO-Inventory/releases/latest

The web app and Android app use the same Supabase project and accounts. Changes to inventory data are shared between devices after they connect to the internet. The Android APK is built automatically by GitHub Actions for each main-branch update.
