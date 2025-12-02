# QBert-Devvit: Business Requirements Document

## Project Overview

**Project Name:** QBert-Devvit  
**Platform:** Reddit Devvit Developer Platform  
**Language:** TypeScript  
**Original Project:** [QBert](../QBert) (.NET Discord notification bot)

### Purpose

QBert-Devvit is a Reddit moderation tool that monitors subreddit moderation queues and sends real-time notifications to Discord channels via webhooks. This document captures all business requirements for reimplementing QBert as a native Devvit application.

### Goals

1. Provide moderators with timely Discord notifications about items requiring moderation
2. Distinguish between different types of moderation items (posts vs. comments)
3. Alert moderators when items have been waiting too long (stale detection)
4. Warn moderators when the queue is backing up (overflow alerts)
5. Eliminate self-hosting requirements by running natively on Reddit's infrastructure

---

## Functional Requirements

### FR-1: Mod Queue Monitoring

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1.1 | The app SHALL periodically check the subreddit's moderation queue | Must Have |
| FR-1.2 | The app SHALL retrieve all pending items from the mod queue | Must Have |
| FR-1.3 | The check interval SHALL be configurable (default: 15 minutes) | Should Have |
| FR-1.4 | The app SHALL track previously processed items to avoid duplicate notifications | Must Have |

### FR-2: Item Classification

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-2.1 | The app SHALL identify submissions (posts) by Reddit's `t3_` ID prefix | Must Have |
| FR-2.2 | The app SHALL identify comments by Reddit's `t1_` ID prefix | Must Have |
| FR-2.3 | The app SHALL handle unknown item types gracefully (log, do not crash) | Should Have |

### FR-3: Stale Item Detection

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-3.1 | The app SHALL calculate the age of each item in the queue | Must Have |
| FR-3.2 | Items older than a configurable threshold SHALL be marked as "stale" | Must Have |
| FR-3.3 | The default stale threshold SHALL be 45 minutes | Must Have |
| FR-3.4 | Stale items SHALL receive visually distinct notifications (red color) | Must Have |
| FR-3.5 | Stale notifications SHALL include the timestamp when the item entered the queue | Must Have |

### FR-4: Queue Overflow Alerts

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-4.1 | The app SHALL count total items in the mod queue | Must Have |
| FR-4.2 | When item count exceeds a threshold, a special alert SHALL be sent | Must Have |
| FR-4.3 | The default overflow threshold SHALL be 5 items | Must Have |
| FR-4.4 | Overflow alerts SHALL ping a configurable Discord role | Must Have |
| FR-4.5 | Overflow alerts SHALL display the current queue count | Must Have |

### FR-5: Discord Notifications

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-5.1 | The app SHALL send notifications via Discord webhook | Must Have |
| FR-5.2 | Notifications SHALL use Discord embed format | Must Have |
| FR-5.3 | Each notification SHALL include a direct link to the queued item | Must Have |
| FR-5.4 | Each notification SHALL include the author's username | Must Have |
| FR-5.5 | Submission notifications SHALL include the post title | Must Have |
| FR-5.6 | Comment notifications SHALL include the parent post title | Must Have |
| FR-5.7 | Each notification SHALL include a timestamp | Must Have |

### FR-6: Notification Color Coding

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-6.1 | New submission notifications SHALL use GREEN color | Must Have |
| FR-6.2 | New comment notifications SHALL use BLUE color | Must Have |
| FR-6.3 | Stale item notifications SHALL use RED color | Must Have |
| FR-6.4 | Queue overflow alerts SHALL use DARK MAGENTA color | Must Have |

**Color Reference (Discord Hex):**
- Green: `#57F287` (or Discord.js `Green`)
- Blue: `#3498DB` (or Discord.js `Blue`)
- Red: `#ED4245` (or Discord.js `Red`)
- Dark Magenta: `#9B59B6` (or Discord.js `DarkMagenta`)

### FR-7: Giphy Integration (Optional)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-7.1 | The app MAY include a GIF in each notification | Nice to Have |
| FR-7.2 | GIFs SHALL be retrieved from Giphy API using "waiting in line" search | Nice to Have |
| FR-7.3 | Giphy API key SHALL be configurable | Nice to Have |
| FR-7.4 | If Giphy is unavailable, notifications SHALL still be sent without GIF | Nice to Have |

---

## Non-Functional Requirements

### NFR-1: Configuration

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1.1 | All configuration SHALL be managed through Devvit App Settings UI | Must Have |
| NFR-1.2 | Moderators SHALL be able to configure settings without code changes | Must Have |
| NFR-1.3 | Settings changes SHALL take effect without app reinstallation | Should Have |

### NFR-2: Reliability

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-2.1 | The app SHALL not send duplicate notifications for the same item | Must Have |
| NFR-2.2 | The app SHALL handle API errors gracefully | Must Have |
| NFR-2.3 | The app SHALL log errors for debugging | Should Have |
| NFR-2.4 | Failed Discord webhook calls SHALL be retried (max 3 attempts) | Should Have |

### NFR-3: Performance

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-3.1 | Mod queue check SHALL complete within 30 seconds | Should Have |
| NFR-3.2 | The app SHALL respect Reddit API rate limits | Must Have |
| NFR-3.3 | The app SHALL batch Discord notifications when possible | Nice to Have |

---

## Configuration Settings Schema

The following settings SHALL be configurable by subreddit moderators:

| Setting | Type | Required | Default | Description |
|---------|------|----------|---------|-------------|
| `discordWebhookUrl` | string | Yes | - | Discord webhook URL for notifications |
| `discordRoleId` | string | No | - | Discord role ID to ping for overflow alerts |
| `staleThresholdMinutes` | number | No | 45 | Minutes before an item is considered stale |
| `overflowThreshold` | number | No | 5 | Number of items that triggers overflow alert |
| `checkIntervalMinutes` | number | No | 15 | How often to check the mod queue |
| `giphyApiKey` | string | No | - | Giphy API key (leave empty to disable) |
| `enableSubmissionNotifications` | boolean | No | true | Send notifications for new submissions |
| `enableCommentNotifications` | boolean | No | true | Send notifications for new comments |
| `enableStaleAlerts` | boolean | No | true | Send alerts for stale items |
| `enableOverflowAlerts` | boolean | No | true | Send alerts when queue exceeds threshold |

---

## Notification Message Templates

### New Submission (Green)
```
Title: {post_title}
Description: New Post in the ModQueue from {author}!
URL: {reddit_url}
Color: Green
Timestamp: {current_time}
Image: {giphy_url} (optional)
```

### Stale Submission (Red)
```
Title: {post_title}
Description: There is a Stale Post in the ModQueue from {author}! 
             Post has been waiting since {publish_time}
URL: {reddit_url}
Color: Red
Timestamp: {current_time}
Image: {giphy_url} (optional)
```

### New Comment (Blue)
```
Title: {author} has commented on "{parent_post_title}"
Description: New comment in the ModQueue!
URL: {reddit_url}
Color: Blue
Timestamp: {current_time}
Image: {giphy_url} (optional)
```

### Stale Comment (Red)
```
Title: {author} has commented on "{parent_post_title}"
Description: There is a Stale Comment in the ModQueue from {author}! 
             Comment has been waiting since {publish_time}
URL: {reddit_url}
Color: Red
Timestamp: {current_time}
Image: {giphy_url} (optional)
```

### Queue Overflow Alert (Dark Magenta)
```
Title: You had one job! Stop shootin' the shit and check the damn queue!
Description: There are {item_count} items in the queue!!!
Color: Dark Magenta
Timestamp: {current_time}
Mention: @{role_id}
```

---

## Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Devvit         │     │   QBert-Devvit   │     │    Discord      │
│  Scheduler      │────▶│   App Logic      │────▶│    Webhook      │
│  (periodic)     │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  Reddit API      │
                        │  (Mod Queue)     │
                        └──────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  Redis Storage   │
                        │  (Processed IDs) │
                        └──────────────────┘
```

### Flow Description

1. **Trigger**: Devvit Scheduler triggers the app at configured intervals
2. **Fetch**: App retrieves mod queue via `context.reddit.getModQueue()`
3. **Filter**: App checks Redis for previously processed item IDs
4. **Classify**: App categorizes items (submission/comment, fresh/stale)
5. **Notify**: App sends Discord webhook for each new item
6. **Track**: App stores processed item IDs in Redis
7. **Alert**: If queue count > threshold, send overflow alert

---

## State Management

### Redis Keys

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `processed:{item_id}` | string | 24 hours | Track processed items to prevent duplicates |
| `last_overflow_alert` | string | 1 hour | Prevent spam overflow alerts |
| `last_check` | string | none | Timestamp of last successful check |

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Discord webhook fails | Retry up to 3 times with exponential backoff |
| Reddit API rate limited | Wait and retry on next scheduled run |
| Invalid webhook URL | Log error, skip notifications, do not crash |
| Giphy API fails | Send notification without GIF |
| Redis unavailable | Process items but may cause duplicates |

---

## Testing Criteria

### Acceptance Tests

1. **AT-1**: When a new post enters mod queue, a GREEN Discord notification is sent
2. **AT-2**: When a new comment enters mod queue, a BLUE Discord notification is sent
3. **AT-3**: When an item has been in queue > 45 minutes, a RED notification is sent
4. **AT-4**: When queue has > 5 items, a DARK MAGENTA alert with role ping is sent
5. **AT-5**: Previously notified items do not trigger duplicate notifications
6. **AT-6**: Settings can be changed via Reddit's Devvit settings UI
7. **AT-7**: App continues functioning if Giphy API is unavailable

---

## Migration Notes from Original QBert

### What Changes

| Original (.NET) | Devvit (TypeScript) |
|-----------------|---------------------|
| RSS Feed (`SyndicationFeed`) | `context.reddit.getModQueue()` |
| `Discord.Net.Webhook` | Native `fetch()` to webhook URL |
| `Config.cs` static properties | Devvit App Settings |
| External scheduling (cron) | `Devvit.addSchedulerJob()` |
| Regex for author extraction | Reddit API provides structured data |
| Self-hosted execution | Reddit-hosted |

### What Stays the Same

- Discord embed message format
- Color coding scheme
- Stale detection logic (45-minute threshold)
- Overflow alert logic (5-item threshold)
- Giphy search query ("waiting in line")
- Notification content and structure

---

## References

- [Original QBert README](../QBert/README.md)
- [Devvit Documentation](https://developers.reddit.com/docs/)
- [Discord Webhook API](https://discord.com/developers/docs/resources/webhook)
- [Existing Devvit Discord Apps](https://developers.reddit.com/apps/discord-relay)
- [Devvit Mod Tools Introduction](https://developers.reddit.com/docs/introduction/intro-mod-tools)

