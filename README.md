# Tornado Cash Interface

React + Vite + TypeScript implementation of the Tornado Cash Classic interface.

The app is a static frontend. It uses RainbowKit/wagmi for wallet connection, viem for EVM reads and transactions, built-in RPC fallbacks for app data, built-in relayer endpoints for withdrawals, and the legacy Tornado proof runtime for zero-knowledge proof generation.

## Requirements

- Node.js 20+
- Yarn 1.x
- A WalletConnect Project ID from https://cloud.walletconnect.com
- Built-in relayer URLs for every chain that should support withdrawals

## Setup

```bash
yarn install --frozen-lockfile
cp .env.example .env
```

Edit `.env` before running or building:

```bash
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
VITE_SITE_URL=https://tornadox.one
VITE_DEFAULT_RELAYER_URL_1=https://your-ethereum-relayer.example/
VITE_DEFAULT_RELAYER_URL_11155111=https://your-sepolia-relayer.example/
```

Optional Graph API keys can be configured with the `VITE_GRAPH_API_KEY_*` variables in `.env.example`.

Do not commit `.env`. Vite reads `VITE_*` variables at build time, so changing Cloudflare environment variables requires a new deployment build.

## Development

```bash
yarn dev
```

The local dev server prints the URL, usually `http://localhost:5173/`.

## Checks

```bash
yarn typecheck
yarn test
yarn test:proof-fixture
yarn audit:high
yarn build
```

## Build Static Files

```bash
yarn build
```

The generated static site is written to:

```text
dist/
```

That `dist/` directory is the folder to upload or deploy to Cloudflare Pages.

To preview the production build locally:

```bash
yarn preview
```

## Deploy To Cloudflare Pages

### GitHub Connected Deployment

1. Push this repository to GitHub.
2. In Cloudflare Dashboard, open **Workers & Pages**.
3. Create a Pages project and connect the GitHub repository.
4. Use these build settings:

```text
Framework preset: None or Vite
Build command: yarn build
Build output directory: dist
Root directory: web-react
Node.js version: 20
```

If this repository is uploaded with `web-react` as the repository root, leave **Root directory** empty.

5. Add the required environment variables in Cloudflare Pages:

```text
VITE_WALLETCONNECT_PROJECT_ID
VITE_SITE_URL=https://tornadox.one
VITE_DEFAULT_RELAYER_URL_*
VITE_DEFAULT_RELAYER_NAME_* optional
VITE_GRAPH_API_KEY_* optional
```

6. Deploy.

Cloudflare Pages automatically copies `public/_headers` into the deployment. This project relies on that file for security headers, asset caching, and correct serving of the proof/runtime binary assets.

### Manual Direct Upload

```bash
yarn build
```

Then upload the `dist/` directory in Cloudflare Pages using **Direct Upload**.

If you use Wrangler:

```bash
npx wrangler pages deploy dist --project-name tornadox
```

## GitHub Upload

From the project directory:

```bash
git status
git add .
git commit -m "Prepare static frontend release"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

If the remote already exists:

```bash
git remote set-url origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

## Release Notes

- Withdrawals require a configured built-in relayer for the selected chain.
- Wallet direct withdrawal, custom relayer URLs, ENS relayer lookup, and user editable RPC are intentionally not part of the current release flow.
- Static event files under `public/events/`, `public/trees/`, and proof files under `public/legacy-proof/` are part of the app runtime and must be included in the deployment.
- The production domain is configured as `https://tornadox.one/` in SEO metadata and should match `VITE_SITE_URL`.
