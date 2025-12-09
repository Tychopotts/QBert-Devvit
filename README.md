# QBert-Devvit

A Reddit Devvit application that monitors subreddit moderation queues and sends real-time notifications to Discord.

## Overview

QBert-Devvit is a native Reddit application built on the [Devvit platform](https://developers.reddit.com/docs/) that bridges Reddit moderation workflows with Discord. When items enter your subreddit's moderation queue, moderators receive instant Discord notifications with details about the pending content.

This project is a reimplementation of [QBert](https://github.com/GoddessOfTest/qbert) (originally a .NET application) as a Devvit app, eliminating the need for self-hosting while gaining native Reddit API access.

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

- A subreddit where you have moderator permissions
- A Discord server with webhook access

### Installation

1. Install the app from the Reddit Developer Platform
2. Navigate to your subreddit's Mod Tools
3. Find QBert-Devvit in the installed apps section
4. Configure the required settings (see Configuration below)

### Configuration

After installing the app on your subreddit, configure it through Reddit's mod tools:

1. Go to your subreddit's Mod Tools
2. Find QBert-Devvit in installed apps
3. Configure the following settings:
   - **Discord Webhook URL** (required) — Create a webhook in your Discord server settings
   - **Discord Role ID** (optional) — Role to ping for overflow alerts (right-click role → Copy ID)
   - **Stale Threshold** in minutes (default: 45) — How long before items are marked as stale
   - **Overflow Threshold** item count (default: 5) — Queue size that triggers overflow alert
   - **Check Interval** in minutes (default: 15) — How often to check the mod queue
   - **Giphy API Key** (optional) — Leave empty to disable GIFs in notifications
   - **Enable/Disable** toggles for each notification type

**Note:** After changing the Check Interval setting, the scheduler will automatically update on the next app upgrade or restart.

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

## Development

### Building Locally

```bash
npm install
npm run build
```

### Testing

```bash
npm run dev
```

This will start a playtest session where you can test the app in a development environment.

### Deploying

```bash
npm run upload
```

## Technical Details

- **Language:** TypeScript
- **Platform:** Reddit Devvit 0.12.5
- **APIs Used:**
  - Reddit API (Mod Queue, Subreddit info)
  - Discord Webhooks
  - Giphy API (optional)
- **Storage:** Redis for tracking processed items (24-hour TTL)
- **Scheduler:** Cron-based job scheduling (1-60 minute intervals)

## Troubleshooting

### Notifications Not Appearing

1. **Check Webhook URL**: Ensure your Discord webhook URL is correct and active
2. **Verify Permissions**: Make sure the app has moderator permissions on your subreddit
3. **Check Settings**: Confirm that notification types are enabled in settings
4. **Review Logs**: Check the Devvit logs for error messages

### Duplicate Notifications

- The app uses Redis to track processed items with a 24-hour TTL
- If Redis is unavailable, you may see duplicates
- This is expected behavior and will self-correct

### GIFs Not Loading

- Verify your Giphy API key is valid
- Check that you haven't exceeded Giphy rate limits
- GIFs are optional; notifications will still send without them

### Scheduler Not Running

- Verify that the Check Interval is between 1-60 minutes
- Reinstall the app to reset the scheduler
- Check Devvit platform status for any outages

## License

BSD-3-Clause

## Related

- [Original QBert (.NET)](https://github.com/GoddessOfTest/qbert) — The original implementation
- [Discord Relay](https://developers.reddit.com/apps/discord-relay) — Similar Devvit app for reference
- [Devvit Mod Tools Guide](https://developers.reddit.com/docs/introduction/intro-mod-tools)

