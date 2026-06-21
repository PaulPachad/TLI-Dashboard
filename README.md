# TLI Leverage Dashboard

A guided follow-up dashboard for Authority Magazine's Thought Leader
Incubator. It imports published interviews from Google Sheets and walks each
client through the live-link email, LinkedIn post, and Zoom follow-up.

## One-Click Demo

From the parent folder, double-click `run-demo.bat`.

The script prepares a local SQLite database, creates the admin and demo-client
logins, starts the app, and opens `http://localhost:3000`.

Demo admin:

- Email: `admin@example.com`
- Password: `admin123`

Demo client:

- Email: `demo.client@example.com`
- Password: `DemoClient123!`

Clients can import or sync their own Google Sheet from the signed-in dashboard.
Demo mode is clearly labeled. Link-accessible Google Sheets are read live;
email delivery is simulated and no external message is sent. Private sheets
still require the Google service-account settings below.

## Local Development

Requirements: Node.js 20 or newer and a PostgreSQL database. Copy
`.env.example` to `.env.local`, set `DATABASE_URL`, then run:

```powershell
npm install
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

- `DATABASE_URL`: PostgreSQL connection string. The demo script supplies its
  own local SQLite URL.
- `NEXTAUTH_SECRET`: a long random secret.
- `NEXTAUTH_URL`: the public application URL.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`: initial admin login.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
- `GEMINI_API_KEY`: enables the card-level VIP Signals research button through
  Gemini grounded search. Optional fallback: `GOOGLE_CUSTOM_SEARCH_API_KEY` and
  `GOOGLE_CUSTOM_SEARCH_ENGINE_ID`.
- `RESEND_API_KEY` and `EMAIL_FROM`.
- `DEMO_MODE`: keep `false` in production.
- `NEXT_PUBLIC_DEMO_MODE`: keep `false` in production.

## Google Sheets Setup

1. Open Google Cloud Console and create a project.
2. Enable the Google Sheets API.
3. Create a service account under APIs & Services, Credentials.
4. Create and download a JSON key.
5. Put the JSON `client_email` into `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
6. Put the JSON `private_key` into
   `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, preserving `\n` characters.
7. Share each source Google Sheet with the service-account email as Viewer.
8. Paste the normal Sheets URL from either the client dashboard or the admin
   client page.

Only rows containing an Authority Magazine URL are imported. Re-syncing
preserves action history and manually added contact details.

## Email Setup

1. Create a Resend account.
2. Verify the Authority Magazine/TLI sending domain.
3. Create an API key and set `RESEND_API_KEY`.
4. Set `EMAIL_FROM`, for example:

```env
EMAIL_FROM="TLI Dashboard <notifications@authoritymagazine.com>"
```

Replies are sent to the client's configured reply-to address. Outside demo
mode, the app refuses to mark an email successful when Resend is missing or
reports a delivery error.

## VIP Signals Research Setup

The dashboard can research interviewees and companies from each interview card
to find prominence signals such as large audiences, major company scale, senior
leadership, press mentions, awards, author/speaker credentials, and public
authority.

Simplest setup:

1. Create a Gemini API key in Google AI Studio.
2. Set `GEMINI_API_KEY`.
3. Optionally set `GEMINI_SEARCH_MODEL` to override the default
   `gemini-3.5-flash`.

Fallback setup:

1. Enable the Google Custom Search JSON API in Google Cloud.
2. Create a Google Programmable Search Engine.
3. Set `GOOGLE_CUSTOM_SEARCH_API_KEY`.
4. Set `GOOGLE_CUSTOM_SEARCH_ENGINE_ID`.

When configured, the "Research VIP signals" button stores the discovered
signals on the interview, updates the card badges, and records the research in
the action timeline.

Background VIP research runs through Vercel Cron every 15 minutes at
`/api/cron/vip-prominence-scan`. Set `CRON_SECRET` in Vercel so the cron
request is authorized, and optionally set `VIP_PROMINENCE_CRON_LIMIT` to tune
the batch size. The default batch size is 6 and the app caps it at 12 to keep
search usage controlled.

## Production Database And Deployment

PostgreSQL is the default schema. The one-click demo explicitly uses the
separate SQLite schema in `prisma/schema.sqlite.prisma`.

1. Create a PostgreSQL database.
2. Set its connection string as `DATABASE_URL`.
3. Apply the checked-in production migrations:

```powershell
npm run db:migrate:deploy
```

4. Seed the initial admin:

```powershell
npm run db:seed
```

5. In Vercel, add all production environment variables.
6. Use the standard build command:

```text
npm run build
```

7. Deploy and test login, Sheet access, and a Resend test message.

## Verification

```powershell
npm run lint -- --max-warnings=0
npm test
npm run test:http
npm run test:visual
npm run build
npx prisma validate
npx prisma validate --schema prisma/schema.sqlite.prisma
```

The HTTP smoke test uses a temporary copy of the demo database. The visual test
uses an installed Chrome or Edge browser and writes screenshots under
`artifacts/visual-smoke`.

The tracked audit and milestone status live in `tasks/todo.md` and
`tasks/plan-audit.md`.
