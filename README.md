# ai-agent-automation-funnel

Self-hosted AI Agent Automation Bootcamp funnel with Stripe and Resend.

This repository contains the starter code and deployment automation for a funnel that powers an AI Agent Automation Bootcamp — payments via Stripe, transactional email via Resend, and self-hosted deployment patterns.

## Features

- Stripe integration for payments
- Resend integration for transactional email
- Example agent automation flows
- Deployment and automation scripts

## Prerequisites

- Node.js (16+ recommended)
- npm or yarn
- A Stripe account and API keys
- A Resend account and API key

## Quick start

1. Clone the repo

   git clone https://github.com/tjkilgore93-stack/ai-agent-automation-funnel.git
   cd ai-agent-automation-funnel

2. Install dependencies

   npm install
   # or
   yarn install

3. Copy environment example and set secrets

   cp .env.example .env
   # Fill in STRIPE_API_KEY, RESEND_API_KEY, and other env vars

4. Run the app in development

   npm run dev

## Development

- Scripts are defined in package.json (start, dev, build, test)
- Add integration keys to environment variables and DO NOT commit them

## Contributing

Contributions are welcome. Please open issues for bugs or feature requests and create PRs for changes.

## License

This project is licensed under the MIT License — see the LICENSE file for details.
