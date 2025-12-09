import { Devvit, Post, Comment, TriggerContext } from '@devvit/public-api';

// Enable required Devvit features
Devvit.configure({
  redditAPI: true,
  redis: true,
  http: {
    // Whitelist external domains for HTTP fetch - required by Devvit
    domains: ['api.giphy.com', 'discord.com', 'discordapp.com', 'hooks.slack.com'],
  },
});

// ============================================================================
// App Settings - Configured per subreddit installation
// See REQUIREMENTS.md - Configuration Settings Schema
// ============================================================================

Devvit.addSettings([
  // General Settings Group
  {
    type: 'group',
    label: 'General Settings',
    helpText: 'Configure general app behavior',
    fields: [
      {
        name: 'giphyApiKey',
        label: 'Giphy API Key',
        type: 'string',
        scope: 'installation',
        helpText: 'Optional. Get from developers.giphy.com. If not set, a default GIF will be used.',
      },
      {
        name: 'checkIntervalMinutes',
        label: 'Check Interval (minutes)',
        type: 'number',
        scope: 'installation',
        defaultValue: 15,
        helpText: 'How often to check the mod queue (1-60 minutes)',
      },
    ],
  },
  // Discord Settings Group
  {
    type: 'group',
    label: 'Discord Settings',
    helpText: 'Configure Discord webhook notifications',
    fields: [
      {
        name: 'enableDiscordNotifications',
        label: 'Enable Discord Notifications',
        type: 'boolean',
        scope: 'installation',
        defaultValue: true,
        helpText: 'Toggle Discord notifications on/off',
      },
      {
        name: 'discordWebhookUrl',
        label: 'Discord Webhook URL',
        type: 'string',
        scope: 'installation',
        helpText: 'Required if Discord notifications are enabled. Get this from Discord Server Settings → Integrations → Webhooks',
      },
      {
        name: 'discordRoleId',
        label: 'Discord Role ID (for overflow alerts)',
        type: 'string',
        scope: 'installation',
        helpText: 'Optional. Role ID to ping when queue exceeds threshold (right-click role → Copy ID)',
      },
    ],
  },
  // Slack Settings Group
  {
    type: 'group',
    label: 'Slack Settings',
    helpText: 'Configure Slack webhook notifications',
    fields: [
      {
        name: 'enableSlackNotifications',
        label: 'Enable Slack Notifications',
        type: 'boolean',
        scope: 'installation',
        defaultValue: false,
        helpText: 'Toggle Slack notifications on/off',
      },
      {
        name: 'slackWebhookUrl',
        label: 'Slack Webhook URL',
        type: 'string',
        scope: 'installation',
        helpText: 'Required if Slack notifications are enabled. Get this from api.slack.com/apps → Incoming Webhooks',
      },
    ],
  },
  // Threshold Settings Group
  {
    type: 'group',
    label: 'Threshold Settings',
    helpText: 'Configure when alerts are triggered',
    fields: [
      {
        name: 'staleThresholdMinutes',
        label: 'Stale Threshold (minutes)',
        type: 'number',
        scope: 'installation',
        defaultValue: 45,
        helpText: 'Items older than this are marked as stale (default: 45)',
      },
      {
        name: 'overflowThreshold',
        label: 'Queue Overflow Threshold',
        type: 'number',
        scope: 'installation',
        defaultValue: 5,
        helpText: 'Alert when queue has more than this many items (default: 5)',
      },
    ],
  },
  // Notification Toggles Group
  {
    type: 'group',
    label: 'Notification Toggles',
    helpText: 'Enable or disable specific notification types',
    fields: [
      {
        name: 'enableSubmissionNotifications',
        label: 'Enable Submission Notifications',
        type: 'boolean',
        scope: 'installation',
        defaultValue: true,
        helpText: 'Send notifications for new submissions in mod queue',
      },
      {
        name: 'enableCommentNotifications',
        label: 'Enable Comment Notifications',
        type: 'boolean',
        scope: 'installation',
        defaultValue: true,
        helpText: 'Send notifications for new comments in mod queue',
      },
      {
        name: 'enableStaleAlerts',
        label: 'Enable Stale Alerts',
        type: 'boolean',
        scope: 'installation',
        defaultValue: true,
        helpText: 'Send alerts for items that have been waiting too long',
      },
      {
        name: 'enableOverflowAlerts',
        label: 'Enable Overflow Alerts',
        type: 'boolean',
        scope: 'installation',
        defaultValue: true,
        helpText: 'Send alerts when queue exceeds threshold',
      },
    ],
  },
]);

/*
 * =============================================================================
 * DISCORD NOTIFICATION COLORS
 * =============================================================================
 */

const DiscordColors = {
  GREEN: 0x57F287,        // New submission
  BLUE: 0x3498DB,         // New comment  
  RED: 0xED4245,          // Stale item
  DARK_MAGENTA: 0x9B59B6, // Queue overflow
} as const;

/*
 * =============================================================================
 * TYPES
 * =============================================================================
 */

interface DiscordEmbed {
  title: string;
  description: string;
  url?: string;
  color: number;
  timestamp: string;
  thumbnail?: { url: string };  // Thumbnail is cleaner than full-size image
  image?: { url: string };
}

interface DiscordWebhookPayload {
  username?: string;     // Custom bot name
  avatar_url?: string;   // Custom bot avatar
  content?: string;
  embeds: DiscordEmbed[];
}

// Bot identity for Discord webhooks
const DISCORD_BOT_USERNAME = 'QBert';
const DISCORD_BOT_AVATAR = 'https://i.imgur.com/n4wnIEU.png';

// Slack Block Kit types (following BanBunny pattern)
interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
  accessory?: {
    type: string;
    image_url: string;
    alt_text: string;
  };
  elements?: Array<{
    type: string;
    text: string;
  }>;
}

interface SlackWebhookPayload {
  blocks: SlackBlock[];
}

// Notification data types for unified handling
interface ModQueueItemData {
  id: string;
  type: 'submission' | 'comment';
  title: string;
  author: string;
  url: string;
  createdAt: Date;
  isStale: boolean;
  parentPostTitle?: string;  // For comments only
}

interface OverflowAlertData {
  itemCount: number;
  discordRoleId?: string;
}

/*
 * =============================================================================
 * SCHEDULER JOB
 * =============================================================================
 */

Devvit.addSchedulerJob({
  name: 'checkModQueue',
  onRun: async (event, context) => {
    try {
      console.log('QBert: Checking mod queue...');

      // Step 1: Load Configuration
      const settings = await context.settings.getAll();
      
      // Discord settings
      const enableDiscordNotifications = (settings.enableDiscordNotifications as boolean) !== false;
      const discordWebhookUrl = settings.discordWebhookUrl as string | undefined;
      const discordRoleId = settings.discordRoleId as string | undefined;
      
      // Slack settings
      const enableSlackNotifications = (settings.enableSlackNotifications as boolean) === true;
      const slackWebhookUrl = settings.slackWebhookUrl as string | undefined;
      
      // Threshold settings
      const staleThresholdMinutes = (settings.staleThresholdMinutes as number) || 45;
      const overflowThreshold = (settings.overflowThreshold as number) || 5;
      
      // Notification toggle settings
      const enableSubmissionNotifications = (settings.enableSubmissionNotifications as boolean) !== false;
      const enableCommentNotifications = (settings.enableCommentNotifications as boolean) !== false;
      const enableStaleAlerts = (settings.enableStaleAlerts as boolean) !== false;
      const enableOverflowAlerts = (settings.enableOverflowAlerts as boolean) !== false;

      // Build notification settings object for unified handling
      const notificationSettings: NotificationSettings = {
        enableDiscord: enableDiscordNotifications && !!discordWebhookUrl,
        discordWebhookUrl,
        discordRoleId,
        enableSlack: enableSlackNotifications && !!slackWebhookUrl,
        slackWebhookUrl,
      };

      // Check if at least one notification platform is configured
      if (!notificationSettings.enableDiscord && !notificationSettings.enableSlack) {
        console.log('QBert: No notification platforms configured or enabled');
        return;
      }

      // Get subreddit name from event data
      const subredditName = event.data?.subredditName as string | undefined;
      if (!subredditName) {
        console.error('QBert: Subreddit name not found in event data');
        return;
      }

      // Step 2: Fetch Mod Queue
      let queueItems: (Post | Comment)[];
      try {
        // Get the subreddit object first
        const subreddit = await context.reddit.getCurrentSubreddit();
        
        // Get mod queue from subreddit (returns a Listing)
        const modQueueListing = subreddit.getModQueue({ 
          type: 'all',
          limit: 100
        });
        
        // Convert Listing to array
        queueItems = await modQueueListing.all();
      } catch (error) {
        console.error('QBert: Error fetching mod queue:', error);
        return;
      }

      if (!queueItems || queueItems.length === 0) {
        console.log('QBert: Mod queue is empty');
        try {
          await context.redis.set('last_check', new Date().toISOString());
        } catch (error) {
          console.warn('QBert: Error updating last_check timestamp:', error);
        }
        return;
      }

      const totalQueueCount = queueItems.length;
      console.log(`QBert: Found ${totalQueueCount} items in mod queue`);

      // Step 3: Filter Processed Items and Process New Ones
      let processedCount = 0;
      let notificationCount = 0;

      for (const item of queueItems) {
        try {
          const itemId = item.id;
          
          // Check if already processed
          if (await isItemProcessed(context, itemId)) {
            continue;
          }

          // Step 4: Classify Item (based on TypeScript type)
          const isSubmission = item instanceof Post;
          const isComment = item instanceof Comment;

          if (!isSubmission && !isComment) {
            console.warn(`QBert: Unknown item type for ${itemId}, skipping`);
            await markItemProcessed(context, itemId);
            continue;
          }

          // Get creation time from the item
          const itemCreatedAt = item.createdAt;
          const stale = isItemStale(itemCreatedAt, staleThresholdMinutes);

          // Determine if we should send notification
          let shouldNotify = false;
          let shouldSendStaleAlert = false;

          if (isSubmission) {
            if (stale && enableStaleAlerts) {
              shouldNotify = true;
              shouldSendStaleAlert = true;
            } else if (!stale && enableSubmissionNotifications) {
              shouldNotify = true;
            }
          } else if (isComment) {
            if (stale && enableStaleAlerts) {
              shouldNotify = true;
              shouldSendStaleAlert = true;
            } else if (!stale && enableCommentNotifications) {
              shouldNotify = true;
            }
          }

          if (shouldNotify) {
            // Build unified item data for notification
            let itemData: ModQueueItemData;

            if (isSubmission) {
              const post = item as Post;
              itemData = {
                id: itemId,
                type: 'submission',
                title: post.title,
                author: post.authorName ?? 'Unknown',
                url: `https://reddit.com${post.permalink}`,
                createdAt: itemCreatedAt,
                isStale: shouldSendStaleAlert,
              };
            } else {
              // Comment
              const comment = item as Comment;
              
              // Fetch parent post to get title
              let parentPostTitle = 'Unknown Post';
              try {
                const parentPost = await context.reddit.getPostById(comment.postId);
                parentPostTitle = parentPost.title;
              } catch (error) {
                console.warn(`QBert: Could not fetch parent post for comment ${itemId}:`, error);
              }

              itemData = {
                id: itemId,
                type: 'comment',
                title: parentPostTitle,  // For comments, title is the parent post title
                author: comment.authorName ?? 'Unknown',
                url: `https://reddit.com${comment.permalink}`,
                createdAt: itemCreatedAt,
                isStale: shouldSendStaleAlert,
                parentPostTitle,
              };
            }

            // Send to all enabled platforms (Discord and/or Slack)
            try {
              await sendItemNotifications(context, notificationSettings, itemData);
              notificationCount++;
            } catch (error) {
              console.error(`QBert: Error sending notification for item ${itemId}:`, error);
              // Continue processing other items
            }
          }

          // Mark as processed regardless of notification status
          await markItemProcessed(context, itemId);
          processedCount++;
        } catch (error) {
          console.error(`QBert: Error processing item ${item.id}:`, error);
          // Continue processing other items
        }
      }

      // Step 5: Check Queue Overflow
      if (enableOverflowAlerts && totalQueueCount > overflowThreshold) {
        try {
          // Check for cooldown (1 hour)
          const lastOverflowAlert = await context.redis.get('last_overflow_alert');
          const now = Date.now();
          const oneHourAgo = now - (60 * 60 * 1000);

          if (!lastOverflowAlert || parseInt(lastOverflowAlert, 10) < oneHourAgo) {
            // Send overflow alert to all enabled platforms
            const overflowData: OverflowAlertData = {
              itemCount: totalQueueCount,
              discordRoleId,
            };

            const success = await sendOverflowNotifications(notificationSettings, overflowData);
            if (success) {
              await context.redis.set('last_overflow_alert', now.toString(), { expiration: new Date(now + 3600000) });
              console.log(`QBert: Sent overflow alert for ${totalQueueCount} items`);
            }
          }
        } catch (error) {
          console.error('QBert: Error sending overflow alert:', error);
        }
      }

      // Update last check timestamp
      try {
        await context.redis.set('last_check', new Date().toISOString());
      } catch (error) {
        console.warn('QBert: Error updating last_check timestamp:', error);
      }

      console.log(`QBert: Processed ${processedCount} items, sent ${notificationCount} notifications`);
    } catch (error) {
      console.error('QBert: Fatal error in checkModQueue:', error);
      // Don't throw - allow scheduler to continue
    }
  },
});

/*
 * =============================================================================
 * TRIGGER: Schedule job on app install
 * =============================================================================
 */

/**
 * Helper function to schedule or reschedule the mod queue check job
 */
async function scheduleModQueueCheck(context: { reddit: Devvit.Context['reddit']; scheduler: Devvit.Context['scheduler']; settings: Devvit.Context['settings'] }): Promise<void> {
  const settings = await context.settings.getAll();
  const intervalMinutes = (settings.checkIntervalMinutes as number) || 15;
  
  // Validate interval (must be between 1 and 60 minutes)
  const validInterval = Math.max(1, Math.min(60, intervalMinutes));
  
  // Get current subreddit name
  const subredditName = await context.reddit.getCurrentSubredditName();
  
  // Cancel any existing jobs first
  const existingJobs = await context.scheduler.listJobs();
  for (const job of existingJobs) {
    if (job.name === 'checkModQueue') {
      await context.scheduler.cancelJob(job.id);
    }
  }
  
  // Schedule the recurring job with subreddit name in data
  await context.scheduler.runJob({
    name: 'checkModQueue',
    cron: `*/${validInterval} * * * *`, // Every N minutes
    data: { subredditName }, // Pass subreddit name to job
  });
  
  console.log(`QBert: Scheduled mod queue checks for r/${subredditName} every ${validInterval} minutes.`);
}

Devvit.addTrigger({
  events: ['AppInstall'],
  onEvent: async (event, context) => {
    const subredditName = event.subreddit?.name;
    console.log(`QBert installed on r/${subredditName ?? 'unknown'}!`);
    
    try {
      await scheduleModQueueCheck(context);
    } catch (error) {
      console.error('QBert: Error during app installation:', error);
      // Don't throw - allow installation to complete
    }
  },
});

Devvit.addTrigger({
  events: ['AppUpgrade'],
  onEvent: async (event, context) => {
    // Use optional chaining for event properties (BanBunny pattern)
    const subredditName = event.subreddit?.name;
    console.log(`QBert upgraded on r/${subredditName ?? 'unknown'}!`);
    
    try {
      await scheduleModQueueCheck(context);
    } catch (error) {
      console.error('QBert: Error during app upgrade:', error);
    }
  },
});

/*
 * =============================================================================
 * HELPER FUNCTIONS (TO BE IMPLEMENTED)
 * =============================================================================
 */

/**
 * Send a Discord webhook notification
 * See REQUIREMENTS.md - FR-5: Discord Notifications
 */
async function sendDiscordNotification(
  webhookUrl: string,
  payload: DiscordWebhookPayload
): Promise<boolean> {
  if (!webhookUrl) {
    console.error('Discord webhook URL is not configured');
    return false;
  }

  // Add bot identity to payload (like BanBunny pattern)
  const fullPayload: DiscordWebhookPayload = {
    username: DISCORD_BOT_USERNAME,
    avatar_url: DISCORD_BOT_AVATAR,
    ...payload,
  };

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullPayload),
      });

      if (response.ok) {
        return true;
      }

      // If rate limited, wait longer before retry
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
        console.warn(`Discord rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // For other errors, log and retry with exponential backoff
      const errorText = await response.text().catch(() => 'Unknown error');
      lastError = new Error(`Discord webhook returned ${response.status}: ${errorText}`);
      
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
        console.warn(`Discord webhook failed, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.warn(`Discord webhook error, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries}):`, lastError.message);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  console.error(`Failed to send Discord notification after ${maxRetries} attempts:`, lastError);
  return false;
}

/**
 * Send a Slack webhook notification
 */
async function sendSlackNotification(
  webhookUrl: string,
  payload: SlackWebhookPayload
): Promise<boolean> {
  if (!webhookUrl) {
    console.log('Slack webhook URL is not configured');
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`Slack webhook error: ${response.status} ${response.statusText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending Slack notification:', error);
    return false;
  }
}

/**
 * Build a Slack Block Kit payload for mod queue items
 */
function buildSlackItemPayload(
  item: ModQueueItemData,
  gifUrl: string
): SlackWebhookPayload {
  const isSubmission = item.type === 'submission';
  const itemTime = item.createdAt.toISOString();
  
  let headerText: string;
  let statusText: string;
  
  if (item.isStale) {
    headerText = isSubmission
      ? `🚨 Stale Post: ${item.title}`
      : `🚨 Stale Comment on "${item.parentPostTitle}"`;
    statusText = `Has been waiting since ${itemTime}`;
  } else {
    headerText = isSubmission
      ? `📥 New Post: ${item.title}`
      : `💬 New Comment on "${item.parentPostTitle}"`;
    statusText = 'Just added to the mod queue';
  }

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: headerText,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Author:*\nu/${item.author}`,
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\n${statusText}`,
          },
          {
            type: 'mrkdwn',
            text: `*Type:*\n${isSubmission ? 'Post' : 'Comment'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Link:*\n<${item.url}|View on Reddit>`,
          },
        ],
        accessory: {
          type: 'image',
          image_url: gifUrl,
          alt_text: 'Mod queue notification',
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Detected at ${new Date().toISOString()}`,
          },
        ],
      },
    ],
  };
}

/**
 * Build a Slack Block Kit payload for overflow alerts
 */
function buildSlackOverflowPayload(data: OverflowAlertData): SlackWebhookPayload {
  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: "🚨 Queue Overflow Alert!",
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Items in Queue:*\n${data.itemCount}`,
          },
          {
            type: 'mrkdwn',
            text: "*Message:*\nYou had one job! Stop shootin' the shit and check the damn queue!",
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Alert triggered at ${new Date().toISOString()}`,
          },
        ],
      },
    ],
  };
}

// Settings interface for notification configuration
interface NotificationSettings {
  enableDiscord: boolean;
  discordWebhookUrl?: string;
  discordRoleId?: string;
  enableSlack: boolean;
  slackWebhookUrl?: string;
}

/**
 * Send notifications to all enabled platforms (Discord and Slack)
 */
async function sendItemNotifications(
  context: TriggerContext | Devvit.Context,
  settings: NotificationSettings,
  item: ModQueueItemData
): Promise<void> {
  // Fetch GIF once for both notifications
  const gifUrl = await fetchGiphyGif(context);
  
  const notifications: Promise<boolean>[] = [];
  
  // Discord notification
  if (settings.enableDiscord && settings.discordWebhookUrl) {
    const discordEmbed = buildDiscordItemEmbed(item, gifUrl);
    const discordPayload: DiscordWebhookPayload = {
      embeds: [discordEmbed],
    };
    notifications.push(
      sendDiscordNotification(settings.discordWebhookUrl, discordPayload)
        .then(success => {
          if (success) console.log(`Discord notification sent for: ${item.id}`);
          return success;
        })
    );
  }
  
  // Slack notification
  if (settings.enableSlack && settings.slackWebhookUrl) {
    const slackPayload = buildSlackItemPayload(item, gifUrl);
    notifications.push(
      sendSlackNotification(settings.slackWebhookUrl, slackPayload)
        .then(success => {
          if (success) console.log(`Slack notification sent for: ${item.id}`);
          return success;
        })
    );
  }
  
  // Send to all platforms concurrently
  if (notifications.length > 0) {
    await Promise.all(notifications);
  }
}

/**
 * Send overflow alert to all enabled platforms
 */
async function sendOverflowNotifications(
  settings: NotificationSettings,
  data: OverflowAlertData
): Promise<boolean> {
  const notifications: Promise<boolean>[] = [];
  
  // Discord notification
  if (settings.enableDiscord && settings.discordWebhookUrl) {
    const discordEmbed = buildOverflowEmbed(data.itemCount);
    const discordPayload: DiscordWebhookPayload = {
      content: data.discordRoleId ? `<@&${data.discordRoleId}>` : undefined,
      embeds: [discordEmbed],
    };
    notifications.push(sendDiscordNotification(settings.discordWebhookUrl, discordPayload));
  }
  
  // Slack notification
  if (settings.enableSlack && settings.slackWebhookUrl) {
    const slackPayload = buildSlackOverflowPayload(data);
    notifications.push(sendSlackNotification(settings.slackWebhookUrl, slackPayload));
  }
  
  if (notifications.length === 0) {
    return false;
  }
  
  // Send to all platforms concurrently
  const results = await Promise.all(notifications);
  return results.some(success => success);  // Return true if at least one succeeded
}

/**
 * Build a Discord embed from unified item data
 */
function buildDiscordItemEmbed(item: ModQueueItemData, gifUrl: string): DiscordEmbed {
  const isSubmission = item.type === 'submission';
  const color = item.isStale 
    ? DiscordColors.RED 
    : (isSubmission ? DiscordColors.GREEN : DiscordColors.BLUE);
  
  let title: string;
  let description: string;
  
  if (isSubmission) {
    title = item.title;
    if (item.isStale) {
      description = `There is a Stale Post in the ModQueue from ${item.author}!\nPost has been waiting since ${item.createdAt.toISOString()}`;
    } else {
      description = `New Post in the ModQueue from ${item.author}!`;
    }
  } else {
    title = `${item.author} has commented on "${item.parentPostTitle}"`;
    if (item.isStale) {
      description = `There is a Stale Comment in the ModQueue from ${item.author}!\nComment has been waiting since ${item.createdAt.toISOString()}`;
    } else {
      description = 'New comment in the ModQueue!';
    }
  }

  return {
    title,
    description,
    url: item.url,
    color,
    timestamp: new Date().toISOString(),
    thumbnail: { url: gifUrl },
  };
}

/**
 * Check if an item has already been processed
 */
async function isItemProcessed(
  context: TriggerContext | Devvit.Context,
  itemId: string
): Promise<boolean> {
  const { redis } = context;
  try {
    const key = `processed:${itemId}`;
    const value = await redis.get(key);
    return value !== null;
  } catch (error) {
    console.error(`Error checking if item ${itemId} is processed:`, error);
    // Return false on error to allow processing (fail open)
    return false;
  }
}

/**
 * Mark an item as processed
 */
async function markItemProcessed(
  context: TriggerContext | Devvit.Context,
  itemId: string
): Promise<void> {
  const { redis } = context;
  try {
    const key = `processed:${itemId}`;
    const ttlMilliseconds = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    await redis.set(key, '1', { expiration: new Date(Date.now() + ttlMilliseconds) });
  } catch (error) {
    console.error(`Error marking item ${itemId} as processed:`, error);
    // Don't throw - allow processing to continue
  }
}

// Default fallback GIF if Giphy API fails or is not configured
const FALLBACK_GIF_URL = 'https://media.giphy.com/media/tXL4FHPSnVJ0A/giphy.gif';

/**
 * Fetch a random GIF from Giphy API
 */
async function fetchGiphyGif(
  context: TriggerContext | Devvit.Context
): Promise<string> {
  try {
    const settings = await context.settings.getAll();
    const apiKey = settings.giphyApiKey as string;

    if (!apiKey) {
      console.log('Giphy API key not configured, using default GIF');
      return FALLBACK_GIF_URL;
    }

    // Use random endpoint with tag for better variety (matching BanBunny pattern)
    const response = await fetch(
      `https://api.giphy.com/v1/gifs/random?api_key=${apiKey}&tag=waiting+in+line&rating=pg`
    );

    if (!response.ok) {
      console.error(`Giphy API error: ${response.status}`);
      return FALLBACK_GIF_URL;
    }

    const data = await response.json();
    
    // Random endpoint returns data.data as an object
    return data.data?.images?.original?.url || FALLBACK_GIF_URL;
  } catch (error) {
    console.error('Error fetching Giphy:', error);
    return FALLBACK_GIF_URL;
  }
}

/**
 * Determine if an item is stale
 */
function isItemStale(itemCreatedAt: Date, thresholdMinutes: number): boolean {
  const now = new Date();
  const ageMinutes = (now.getTime() - itemCreatedAt.getTime()) / (1000 * 60);
  return ageMinutes > thresholdMinutes;
}

/**
 * Build a Discord embed for a queue overflow alert
 * See REQUIREMENTS.md - Notification Message Templates
 */
function buildOverflowEmbed(itemCount: number): DiscordEmbed {
  return {
    title: "You had one job! Stop shootin' the shit and check the damn queue!",
    description: `There are ${itemCount} items in the queue!!!`,
    color: DiscordColors.DARK_MAGENTA,
    timestamp: new Date().toISOString(),
  };
}

/*
 * =============================================================================
 * EXPORT
 * =============================================================================
 */

export default Devvit;

