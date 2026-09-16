# ai-agent-automation-funnel

Self-hosted Node.js funnel for the AI Agent Automation Bootcamp.

## Requirements

- Node.js 20 or newer
- npm

## Install

```bash
npm install
```

## Environment variables

Copy `.env.example` to `.env` and set the values you need:

- `PORT` - optional HTTP port, defaults to `3000`
- `BASE_URL` - optional public base URL, defaults to `http://localhost:<PORT>`
- `COURSE_ACCESS_SECRET` - required for stable course and unsubscribe tokens outside local development
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` - required for live Stripe checkout and webhook verification
- `RESEND_API_KEY`, `FROM_EMAIL` - required to send lead and course-access emails

## Run

Start the server:

```bash
npm start
```

Run the test suite:

```bash
npm test
```

## Current behavior

- When Stripe is configured, `/api/checkout` creates a Stripe Checkout session.
- When Stripe is not configured, `/api/checkout` returns a demo success URL instead of calling Stripe.
- When Resend is not configured, lead capture and order handling still work, but email sending is skipped.

## GitHub Actions

- `Node.js CI` installs dependencies and runs the Node test suite on supported Node versions.
- The release workflow keeps the verification steps, but only attempts `npm publish` when the package is not marked `private` in `package.json`. Private repositories therefore test successfully on release without trying to publish to npm.

## License

This project is licensed under the MIT License. See `LICENSE`.
