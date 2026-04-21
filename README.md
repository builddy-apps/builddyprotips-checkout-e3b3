# BuilddyPayLink

A conversion-optimized payment page for selling digital PDF products with 3D mockup, checkout flow, and instant download delivery

Built with [Builddy](https://builddy.dev) — AI-powered app builder using GLM 5.1.

## Features

- 3D product mockup with hover animations
- Multi-step checkout form with validation
- Order summary sidebar with live updates
- Animated success screen with download button
- Social proof section with review cards
- FAQ accordion with smooth transitions
- Scroll-triggered fade-in animations
- Dark mode with localStorage persistence
- Rate limiting on payment endpoints
- Secure download token system

## Quick Start

### Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

### Docker

```bash
docker compose up
```

### Deploy to Railway/Render

1. Push this directory to a GitHub repo
2. Connect to Railway or Render
3. It auto-detects the Dockerfile
4. Done!

## Tech Stack

- **Frontend**: HTML/CSS/JS + Tailwind CSS
- **Backend**: Express.js
- **Database**: SQLite
- **Deployment**: Docker