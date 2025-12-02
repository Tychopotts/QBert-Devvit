# QBert-Devvit

A Reddit Devvit application that monitors subreddit moderation queues and sends real-time notifications to Discord.

## Overview

QBert-Devvit is a native Reddit application built on the [Devvit platform](https://developers.reddit.com/docs/) that bridges Reddit moderation workflows with Discord. When items enter your subreddit's moderation queue, moderators receive instant Discord notifications with details about the pending content.

This project is a reimplementation of [QBert](../QBert) (originally a .NET application) as a Devvit app, eliminating the need for self-hosting while gaining native Reddit API access.

## Features

- **Automated Monitoring** — Periodically checks mod queue via Devvit scheduler
- **Discord Notifications** — Sends rich embed messages to configured webhook
- **Smart Categorization** — Distinguishes submissions from comments
- **Stale Detection** — Flags items waiting longer than 45 minutes
- **Overflow Alerts** — Pings moderators when queue backs up
- **Zero Hosting** — Runs entirely on Reddit's infrastructure

## Documentation

- [Business Requirements](REQUIREMENTS.md) — Complete functional and non-functional requirements
- [Devvit Docs](https://developers.reddit.com/docs/) — Official platform documentation

## Project Status

🚧 **In Development** — See [REQUIREMENTS.md](REQUIREMENTS.md) for implementation scope.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Devvit CLI](https://developers.reddit.com/docs/quickstart)
- A subreddit where you have moderator permissions
- A Discord server with webhook access

### Installation

```bash
# Install Devvit CLI
npm install -g devvit

# Login to Reddit
devvit login

# Clone and enter project
cd QBert-Devvit

# Install dependencies
npm install

# Start development
devvit playtest <your-subreddit>
```

### Configuration

After installing the app on your subreddit, configure it through Reddit's mod tools:

1. Go to your subreddit's Mod Tools
2. Find QBert-Devvit in installed apps
3. Configure the following settings:
   - **Discord Webhook URL** (required)
   - **Discord Role ID** for overflow pings
   - **Stale Threshold** in minutes (default: 45)
   - **Overflow Threshold** item count (default: 5)
   - **Check Interval** in minutes (default: 15)

## Notification Types

| Type | Color | Trigger |
|------|-------|---------|
| New Submission | 🟢 Green | Post enters mod queue |
| New Comment | 🔵 Blue | Comment enters mod queue |
| Stale Item | 🔴 Red | Item waiting > threshold |
| Queue Overflow | 🟣 Purple | Queue size > threshold |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Devvit    │────▶│  QBert App  │────▶│   Discord   │
│  Scheduler  │     │   (main.ts) │     │   Webhook   │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                    ┌─────┴─────┐
                    ▼           ▼
              ┌──────────┐ ┌──────────┐
              │ Reddit   │ │  Redis   │
              │ Mod API  │ │ Storage  │
              └──────────┘ └──────────┘
```

## License

See [LICENSE](LICENSE) for details.

## Related

- [Original QBert (.NET)](../QBert) — The original implementation
- [Discord Relay](https://developers.reddit.com/apps/discord-relay) — Similar Devvit app for reference
- [Devvit Mod Tools Guide](https://developers.reddit.com/docs/introduction/intro-mod-tools)

