# QBert-Devvit

A Reddit Devvit application that monitors subreddit moderation queues and sends real-time notifications to Discord and Slack.

## Overview

QBert-Devvit is a native Reddit application built on the [Devvit platform](https://developers.reddit.com/docs/) that bridges Reddit moderation workflows with Discord and Slack. When items enter your subreddit's moderation queue, moderators receive instant notifications with details about the pending content.

This project is a reimplementation of [QBert](https://github.com/GoddessOfTest/qbert) (originally a .NET application) as a Devvit app, eliminating the need for self-hosting while gaining native Reddit API access.

## Features

- **Automated Monitoring** — Periodically checks mod queue via Devvit scheduler
- **Multi-Platform Notifications** — Sends to Discord, Slack, or both simultaneously
- **Smart Categorization** — Distinguishes submissions from comments
- **Stale Detection** — Flags items waiting longer than configurable threshold
- **Overflow Alerts** — Pings moderators when queue backs up
- **GIF Support** — Optional Giphy integration for fun notifications
- **Zero Hosting** — Runs entirely on Reddit's infrastructure

## Documentation

- [Privacy Policy](Privacy-Policy.md) — Data collection and usage information
- [Devvit Docs](https://developers.reddit.com/docs/) — Official platform documentation

## Latest Update

- Added Slack as an integration endpoint
- We have an [icon!](icon.png)

## Getting Started

### Prerequisites

- A subreddit where you have moderator permissions
- A Discord server and/or Slack workspace with webhook access
- A [Giphy API key](https://developers.giphy.com/) (optional)

### Configuration

After installing the app on your subreddit, configure it through Reddit's mod tools:

1. Go to your subreddit's Mod Tools
2. Find QBert-Devvit in installed apps
3. Configure the following settings:

**General Settings:**
- **Giphy API Key** (optional) — Get from developers.giphy.com for GIF attachments
- **Check Interval** in minutes (default: 15) — How often to check the mod queue

**Discord Settings:**
- **Enable Discord Notifications** — Toggle Discord notifications on/off
- **Discord Webhook URL** — Create a webhook in Discord Server Settings → Integrations → Webhooks
- **Discord Role ID** (optional) — Role to ping for overflow alerts (right-click role → Copy ID)

**Slack Settings:**
- **Enable Slack Notifications** — Toggle Slack notifications on/off
- **Slack Webhook URL** — Get from api.slack.com/apps → Incoming Webhooks

**Threshold Settings:**
- **Stale Threshold** in minutes (default: 45) — How long before items are marked as stale
- **Overflow Threshold** item count (default: 5) — Queue size that triggers overflow alert

**Notification Toggles:**
- Enable/disable notifications for submissions, comments, stale alerts, and overflow alerts

## Notification Types

| Type | Discord | Slack | Trigger |
|------|---------|-------|---------|
| New Submission | 🟢 Green embed | 📥 Header | Post enters mod queue |
| New Comment | 🔵 Blue embed | 💬 Header | Comment enters mod queue |
| Stale Item | 🔴 Red embed | 🚨 Header | Item waiting > threshold |
| Queue Overflow | 🟣 Purple embed | 🚨 Header | Queue size > threshold |

## Architecture

```
                                        ┌─────────────┐
                                   ┌───▶│   Discord   │
                                   │    │   Webhook   │
┌─────────────┐     ┌─────────────┐│    └─────────────┘
│   Devvit    │────▶│    QBert    │┤
│  Scheduler  │     │   (main.ts) ││    ┌─────────────┐
└─────────────┘     └─────────────┘└───▶│    Slack    │
                          │             │   Webhook   │
                    ┌─────┴─────┐       └─────────────┘
                    ▼           ▼
              ┌──────────┐ ┌──────────┐
              │  Reddit  │ │  Redis   │
              │  Mod API │ │ Storage  │
              └──────────┘ └──────────┘
```

## Technical Details

- **Language:** TypeScript
- **Platform:** Reddit Devvit 0.12.x
- **APIs Used:**
  - Reddit API (Mod Queue, Subreddit info)
  - Discord Webhooks (if configured)
  - Slack Webhooks (if configured)
  - Giphy API (optional)
- **Storage:** Redis for tracking processed items (24-hour TTL)
- **Scheduler:** Cron-based job scheduling (1-60 minute intervals)

## Troubleshooting

### Notifications Not Appearing

1. **Check Webhook URL**: Ensure your Discord/Slack webhook URL is correct and active
2. **Verify Permissions**: Make sure the app has moderator permissions on your subreddit
3. **Check Settings**: Confirm that notification types are enabled in settings
4. **Platform Toggle**: Make sure Discord/Slack notifications are enabled
5. **Review Logs**: Check the Devvit logs for error messages

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

See [LICENSE](LICENSE) for details.

## Related

- [Original QBert (.NET)](https://github.com/GoddessOfTest/qbert) — The original implementation
- [Devvit Mod Tools Guide](https://developers.reddit.com/docs/introduction/intro-mod-tools)
