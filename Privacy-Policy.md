# Privacy Policy

**QBert-Devvit** is a Reddit moderation tool that operates on the Devvit platform.

## Data Collection

This application collects and processes the following information when monitoring your subreddit's moderation queue:

- Reddit username of content authors (posts/comments in mod queue)
- Post titles and comment parent post titles
- Timestamps of when items entered the mod queue
- Subreddit name where the app is installed

## Data Usage

- **Notification Delivery**: Item details are sent to Discord and/or Slack webhooks configured by the subreddit's moderators
- **Duplicate Prevention**: Item IDs are temporarily stored in Reddit's Devvit Redis storage (24-hour retention) to prevent duplicate notifications
- **Overflow Tracking**: Timestamps are stored to manage alert cooldowns

## Data Sharing

Information is shared only with:
- Discord webhook URLs configured by the subreddit's moderation team
- Slack webhook URLs configured by the subreddit's moderation team

No data is shared with any other third parties.

## Data Retention

- Processed item IDs: 24 hours (automatically deleted)
- Alert cooldown timestamps: 1 hour (automatically deleted)
- No permanent storage of content or user data

## Data Not Collected

This application does **not** collect or store:
- Email addresses
- IP addresses
- Personal identifying information
- Private messages or DMs
- Content of posts or comments (only titles/metadata)
- Any data beyond what is publicly visible in Reddit's moderation queue

## Third-Party Services

This app may optionally connect to:
- **Giphy API**: To fetch random GIFs for notifications (no user data sent)
- **Discord**: Via webhook URL you provide
- **Slack**: Via webhook URL you provide

## Contact

For questions about this privacy policy, please contact the app developer or your subreddit's moderators.
