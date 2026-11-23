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

## Deployment workflow

The GitHub Actions workflow in `.github/workflows/deploy.yml` builds the Pages artifact from the repository root and deploys it to GitHub Pages on updates to `main`.

