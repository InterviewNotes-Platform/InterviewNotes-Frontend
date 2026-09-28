This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment (Netlify)

`netlify.toml` builds with `npm run build` on Node 22 through `@netlify/plugin-nextjs`.

| Branch | Netlify context | Environment |
|---|---|---|
| `main` | Production | production |
| `dev` | Branch deploy | beta |

Set these per deploy context in Netlify → Environment variables (placeholders in
`.env.local.example`; never commit real values):

| Var | Visibility | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Inlined into the browser bundle at build time |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Publishable key only, never a secret/service-role key |
| `API_URL` | Server-side | Backend base URL. Read during the build (`/learn` prerender) and at request time, so it needs the Builds and Functions scopes and a reachable backend |

Backend calls are currently server-side only, so CORS is not on their path; the backend's
`CORS_ORIGINS` should still list each deployed frontend origin for any browser-side call.
