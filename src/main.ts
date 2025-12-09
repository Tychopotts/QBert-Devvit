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
        label: 'Backup Check Interval (minutes)',
        type: 'number',
        scope: 'installation',
        defaultValue: 30,
        helpText: 'Backup scheduler interval for catching missed items (default: 30, range: 15-60)',
      },
      {
        name: 'batchFlushIntervalSeconds',
        label: 'Notification Batch Interval (seconds)',
        type: 'number',
        scope: 'installation',
        defaultValue: 30,
        helpText: 'How often to flush batched notifications (default: 30, range: 15-120)',
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
 * REDIS KEYS
 * =============================================================================
 */

const RedisKeys = {
  PROCESSED_PREFIX: 'processed:',
  POST_TITLE_PREFIX: 'post_title:',
  NOTIFICATION_QUEUE: 'notification_queue',
  CACHED_GIF: 'cached_gif',
  LAST_CHECK: 'last_check',
  LAST_OVERFLOW_ALERT: 'last_overflow_alert',
} as const;

/*
 * =============================================================================
 * CACHE TTLs (in milliseconds)
 * =============================================================================
 */

const CacheTTL = {
  PROCESSED_ITEM: 24 * 60 * 60 * 1000,    // 24 hours
  POST_TITLE: 60 * 60 * 1000,              // 1 hour
  GIF: 5 * 60 * 1000,                      // 5 minutes
  NOTIFICATION_QUEUE: 10 * 60 * 1000,      // 10 minutes (safety TTL)
  OVERFLOW_COOLDOWN: 60 * 60 * 1000,       // 1 hour
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
  thumbnail?: { url: string };
  image?: { url: string };
}

interface DiscordWebhookPayload {
  username?: string;
  avatar_url?: string;
  content?: string;
  embeds: DiscordEmbed[];
}

// Bot identity for Discord webhooks
const DISCORD_BOT_USERNAME = 'QBert';
const DISCORD_BOT_AVATAR = 'https://i.imgur.com/n4wnIEU.png';

// Slack Block Kit types
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
  parentPostTitle?: string;
}

// Serializable version for Redis queue storage
interface SerializedModQueueItemData {
  id: string;
  type: 'submission' | 'comment';
  title: string;
  author: string;
  url: string;
  createdAt: string;  // ISO string
  isStale: boolean;
  parentPostTitle?: string;
}

interface OverflowAlertData {
  itemCount: number;
  discordRoleId?: string;
}

// Settings interface for notification configuration
interface NotificationSettings {
  enableDiscord: boolean;
  discordWebhookUrl?: string;
  discordRoleId?: string;
  enableSlack: boolean;
  slackWebhookUrl?: string;
}

/*
 * =============================================================================
 * EVENT-DRIVEN TRIGGERS: Automod filter events for near-instant detection
 * =============================================================================
 * Note: Devvit provides AutomoderatorFilterPost and AutomoderatorFilterComment
 * triggers that fire when items are filtered into the mod queue.
 */

Devvit.addTrigger({
  event: 'AutomoderatorFilterPost',
  onEvent: async (event, context: TriggerContext) => {
    try {
      console.log('QBert: AutomoderatorFilterPost triggered');

      const settings = await context.settings.getAll();
      const enableSubmissionNotifications = (settings.enableSubmissionNotifications as boolean) !== false;
      
      if (!enableSubmissionNotifications) return;

      const post = event.post;
      if (!post) {
        console.warn('QBert: AutomoderatorFilterPost event missing post data');
        return;
      }

      const targetId = post.id;
      
      // Check if already processed
      if (await isItemProcessed(context, targetId)) {
        console.log(`QBert: Post ${targetId} already processed, skipping`);
        return;
      }

      const staleThresholdMinutes = (settings.staleThresholdMinutes as number) || 45;
      const createdAt = post.createdAt ? new Date(post.createdAt) : new Date();
      const isStale = isItemStale(createdAt, staleThresholdMinutes);

      // Note: PostV2 from events uses authorId, not author string
      const authorName = post.authorId ? `u/${post.authorId}` : 'Unknown';
      
      const itemData: ModQueueItemData = {
        id: targetId,
        type: 'submission',
        title: post.title ?? 'Untitled',
        author: authorName,
        url: post.permalink ? `https://reddit.com${post.permalink}` : `https://reddit.com`,
        createdAt,
        isStale,
      };

      await queueNotification(context, itemData);
      await markItemProcessed(context, targetId);
      
      console.log(`QBert: Queued notification for post ${targetId}`);
    } catch (error) {
      console.error('QBert: Error in AutomoderatorFilterPost trigger:', error);
    }
  },
});

Devvit.addTrigger({
  event: 'AutomoderatorFilterComment',
  onEvent: async (event, context: TriggerContext) => {
    try {
      console.log('QBert: AutomoderatorFilterComment triggered');

      const settings = await context.settings.getAll();
      const enableCommentNotifications = (settings.enableCommentNotifications as boolean) !== false;
      
      if (!enableCommentNotifications) return;

      const comment = event.comment;
      if (!comment) {
        console.warn('QBert: AutomoderatorFilterComment event missing comment data');
        return;
      }

      const targetId = comment.id;
      
      // Check if already processed
      if (await isItemProcessed(context, targetId)) {
        console.log(`QBert: Comment ${targetId} already processed, skipping`);
        return;
      }

      const staleThresholdMinutes = (settings.staleThresholdMinutes as number) || 45;
      const createdAt = comment.createdAt ? new Date(comment.createdAt) : new Date();
      const isStale = isItemStale(createdAt, staleThresholdMinutes);
      
      // Get parent post title with caching
      const parentPostTitle = await getCachedPostTitle(context, comment.postId ?? '');
      
      // Get author name from CommentV2
      const authorName = comment.author ?? 'Unknown';

      const itemData: ModQueueItemData = {
        id: targetId,
        type: 'comment',
        title: parentPostTitle,
        author: authorName,
        url: comment.permalink ? `https://reddit.com${comment.permalink}` : `https://reddit.com`,
        createdAt,
        isStale,
        parentPostTitle,
      };

      await queueNotification(context, itemData);
      await markItemProcessed(context, targetId);
      
      console.log(`QBert: Queued notification for comment ${targetId}`);
    } catch (error) {
      console.error('QBert: Error in AutomoderatorFilterComment trigger:', error);
    }
  },
});

/*
 * =============================================================================
 * SCHEDULER JOB: Flush notification queue (batched delivery)
 * =============================================================================
 */

Devvit.addSchedulerJob({
  name: 'flushNotificationQueue',
  onRun: async (event, context) => {
    try {
      console.log('QBert: Flushing notification queue...');

      // Load settings
      const settings = await context.settings.getAll();
      
      const enableDiscordNotifications = (settings.enableDiscordNotifications as boolean) !== false;
      const discordWebhookUrl = settings.discordWebhookUrl as string | undefined;
      const discordRoleId = settings.discordRoleId as string | undefined;
      const enableSlackNotifications = (settings.enableSlackNotifications as boolean) === true;
      const slackWebhookUrl = settings.slackWebhookUrl as string | undefined;

      const notificationSettings: NotificationSettings = {
        enableDiscord: enableDiscordNotifications && !!discordWebhookUrl,
        discordWebhookUrl,
        discordRoleId,
        enableSlack: enableSlackNotifications && !!slackWebhookUrl,
        slackWebhookUrl,
      };

      if (!notificationSettings.enableDiscord && !notificationSettings.enableSlack) {
        console.log('QBert: No notification platforms configured');
        return;
      }

      // Get all queued notifications
      const queuedItems = await getQueuedNotifications(context);
      
      if (queuedItems.length === 0) {
        console.log('QBert: No notifications in queue');
        return;
      }

      console.log(`QBert: Processing ${queuedItems.length} queued notifications`);

      // Get cached GIF for the batch
      const gifUrl = await getCachedGif(context);

      // Send batched notifications
      await sendBatchedNotifications(notificationSettings, queuedItems, gifUrl);

      // Clear the queue
      await clearNotificationQueue(context);

      console.log(`QBert: Flushed ${queuedItems.length} notifications`);
    } catch (error) {
      console.error('QBert: Error flushing notification queue:', error);
    }
  },
});

/*
 * =============================================================================
 * SCHEDULER JOB: Backup mod queue check (fallback for missed events)
 * =============================================================================
 */

Devvit.addSchedulerJob({
  name: 'checkModQueue',
  onRun: async (event, context) => {
    try {
      console.log('QBert: Running backup mod queue check...');

      // Load settings
      const settings = await context.settings.getAll();
      
      const enableDiscordNotifications = (settings.enableDiscordNotifications as boolean) !== false;
      const discordWebhookUrl = settings.discordWebhookUrl as string | undefined;
      const discordRoleId = settings.discordRoleId as string | undefined;
      const enableSlackNotifications = (settings.enableSlackNotifications as boolean) === true;
      const slackWebhookUrl = settings.slackWebhookUrl as string | undefined;
      const staleThresholdMinutes = (settings.staleThresholdMinutes as number) || 45;
      const overflowThreshold = (settings.overflowThreshold as number) || 5;
      const enableSubmissionNotifications = (settings.enableSubmissionNotifications as boolean) !== false;
      const enableCommentNotifications = (settings.enableCommentNotifications as boolean) !== false;
      const enableStaleAlerts = (settings.enableStaleAlerts as boolean) !== false;
      const enableOverflowAlerts = (settings.enableOverflowAlerts as boolean) !== false;

      const notificationSettings: NotificationSettings = {
        enableDiscord: enableDiscordNotifications && !!discordWebhookUrl,
        discordWebhookUrl,
        discordRoleId,
        enableSlack: enableSlackNotifications && !!slackWebhookUrl,
        slackWebhookUrl,
      };

      if (!notificationSettings.enableDiscord && !notificationSettings.enableSlack) {
        console.log('QBert: No notification platforms configured');
        return;
      }

      // Fetch mod queue
      let queueItems: (Post | Comment)[];
      try {
        const subreddit = await context.reddit.getCurrentSubreddit();
        const modQueueListing = subreddit.getModQueue({ 
          type: 'all',
          limit: 100
        });
        queueItems = await modQueueListing.all();
      } catch (error) {
        console.error('QBert: Error fetching mod queue:', error);
        return;
      }

      if (!queueItems || queueItems.length === 0) {
        console.log('QBert: Mod queue is empty');
        await context.redis.set(RedisKeys.LAST_CHECK, new Date().toISOString());
        return;
      }

      const totalQueueCount = queueItems.length;
      console.log(`QBert: Found ${totalQueueCount} items in mod queue`);

      // Batch check which items are already processed
      const itemIds = queueItems.map(item => item.id);
      const processedStatus = await batchCheckProcessed(context, itemIds);

      // Filter to only unprocessed items
      const unprocessedItems = queueItems.filter((_, index) => !processedStatus[index]);
      
      if (unprocessedItems.length === 0) {
        console.log('QBert: All items already processed');
      } else {
        console.log(`QBert: Found ${unprocessedItems.length} unprocessed items`);

        // Process unprocessed items
        for (const item of unprocessedItems) {
          // Get item ID early for error handling
          const itemId = item.id;
          
          try {
            // Process based on item type
            if (item instanceof Post) {
              const post = item;
              const itemCreatedAt = post.createdAt;
              const stale = isItemStale(itemCreatedAt, staleThresholdMinutes);
              
              let shouldNotify = false;
              if (stale && enableStaleAlerts) shouldNotify = true;
              else if (!stale && enableSubmissionNotifications) shouldNotify = true;

              if (shouldNotify) {
                const itemData: ModQueueItemData = {
                  id: itemId,
                  type: 'submission',
                  title: post.title,
                  author: post.authorName ?? 'Unknown',
                  url: `https://reddit.com${post.permalink}`,
                  createdAt: itemCreatedAt,
                  isStale: stale,
                };
                await queueNotification(context, itemData);
              }
            } else if (item instanceof Comment) {
              const comment = item;
              const itemCreatedAt = comment.createdAt;
              const stale = isItemStale(itemCreatedAt, staleThresholdMinutes);
              
              let shouldNotify = false;
              if (stale && enableStaleAlerts) shouldNotify = true;
              else if (!stale && enableCommentNotifications) shouldNotify = true;

              if (shouldNotify) {
                const parentPostTitle = await getCachedPostTitle(context, comment.postId);
                const itemData: ModQueueItemData = {
                  id: itemId,
                  type: 'comment',
                  title: parentPostTitle,
                  author: comment.authorName ?? 'Unknown',
                  url: `https://reddit.com${comment.permalink}`,
                  createdAt: itemCreatedAt,
                  isStale: stale,
                  parentPostTitle,
                };
                await queueNotification(context, itemData);
              }
            }

            await markItemProcessed(context, itemId);
          } catch (error) {
            console.error(`QBert: Error processing item ${itemId}:`, error);
          }
        }
      }

      // Check queue overflow
      if (enableOverflowAlerts && totalQueueCount > overflowThreshold) {
        await sendOverflowAlertIfNeeded(context, notificationSettings, totalQueueCount);
      }

      await context.redis.set(RedisKeys.LAST_CHECK, new Date().toISOString());
      console.log('QBert: Backup check complete');
    } catch (error) {
      console.error('QBert: Fatal error in checkModQueue:', error);
    }
  },
});

/*
 * =============================================================================
 * TRIGGERS: App Install/Upgrade
 * =============================================================================
 */

async function scheduleJobs(context: { reddit: Devvit.Context['reddit']; scheduler: Devvit.Context['scheduler']; settings: Devvit.Context['settings'] }): Promise<void> {
  const settings = await context.settings.getAll();
  
  // Backup check interval (longer interval since we have event-driven triggers)
  const backupIntervalMinutes = Math.max(15, Math.min(60, (settings.checkIntervalMinutes as number) || 30));
  
  // Batch flush interval
  const batchFlushSeconds = Math.max(15, Math.min(120, (settings.batchFlushIntervalSeconds as number) || 30));
  
  const subredditName = await context.reddit.getCurrentSubredditName();
  
  // Cancel existing jobs
  const existingJobs = await context.scheduler.listJobs();
  for (const job of existingJobs) {
    if (job.name === 'checkModQueue' || job.name === 'flushNotificationQueue') {
      await context.scheduler.cancelJob(job.id);
    }
  }
  
  // Schedule backup mod queue check (longer interval)
  await context.scheduler.runJob({
    name: 'checkModQueue',
    cron: `*/${backupIntervalMinutes} * * * *`,
    data: { subredditName },
  });
  
  // Schedule notification queue flush (shorter interval for batching)
  await context.scheduler.runJob({
    name: 'flushNotificationQueue',
    cron: `*/${Math.ceil(batchFlushSeconds / 60)} * * * *`,
    data: { subredditName },
  });
  
  console.log(`QBert: Scheduled jobs for r/${subredditName}`);
  console.log(`  - Backup queue check: every ${backupIntervalMinutes} minutes`);
  console.log(`  - Notification flush: every ${Math.ceil(batchFlushSeconds / 60)} minutes`);
}

Devvit.addTrigger({
  events: ['AppInstall'],
  onEvent: async (event, context) => {
    const subredditName = event.subreddit?.name;
    console.log(`QBert installed on r/${subredditName ?? 'unknown'}!`);
    
    try {
      await scheduleJobs(context);
    } catch (error) {
      console.error('QBert: Error during app installation:', error);
    }
  },
});

Devvit.addTrigger({
  events: ['AppUpgrade'],
  onEvent: async (event, context) => {
    const subredditName = event.subreddit?.name;
    console.log(`QBert upgraded on r/${subredditName ?? 'unknown'}!`);
    
    try {
      await scheduleJobs(context);
    } catch (error) {
      console.error('QBert: Error during app upgrade:', error);
    }
  },
});

/*
 * =============================================================================
 * NOTIFICATION QUEUE FUNCTIONS (Batching)
 * =============================================================================
 * Using zSet (sorted set) for the queue since Devvit Redis supports it.
 * Score = timestamp for ordering, member = JSON serialized item
 */

/**
 * Queue a notification for batched delivery
 */
async function queueNotification(
  context: TriggerContext | Devvit.Context,
  item: ModQueueItemData
): Promise<void> {
  const { redis } = context;
  try {
    const serialized: SerializedModQueueItemData = {
      ...item,
      createdAt: item.createdAt.toISOString(),
    };
    
    // Use zSet with timestamp as score for ordering
    await redis.zAdd(RedisKeys.NOTIFICATION_QUEUE, {
      score: Date.now(),
      member: JSON.stringify(serialized),
    });
  } catch (error) {
    console.error('QBert: Error queueing notification:', error);
  }
}

/**
 * Get all queued notifications
 */
async function getQueuedNotifications(
  context: TriggerContext | Devvit.Context
): Promise<ModQueueItemData[]> {
  const { redis } = context;
  try {
    // Get all items from the sorted set
    const items = await redis.zRange(RedisKeys.NOTIFICATION_QUEUE, 0, -1);
    return items.map((item: { member: string }) => {
      const parsed: SerializedModQueueItemData = JSON.parse(item.member);
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
      };
    });
  } catch (error) {
    console.error('QBert: Error getting queued notifications:', error);
    return [];
  }
}

/**
 * Clear the notification queue
 */
async function clearNotificationQueue(
  context: TriggerContext | Devvit.Context
): Promise<void> {
  const { redis } = context;
  try {
    await redis.del(RedisKeys.NOTIFICATION_QUEUE);
  } catch (error) {
    console.error('QBert: Error clearing notification queue:', error);
  }
}

/*
 * =============================================================================
 * BATCHED NOTIFICATION DELIVERY
 * =============================================================================
 */

/**
 * Send batched notifications to all platforms
 * Discord supports up to 10 embeds per message
 */
async function sendBatchedNotifications(
  settings: NotificationSettings,
  items: ModQueueItemData[],
  gifUrl: string
): Promise<void> {
  const DISCORD_MAX_EMBEDS = 10;
  
  // Build embeds for all items
  const discordEmbeds = items.map(item => buildDiscordItemEmbed(item, gifUrl));
  
  const notifications: Promise<boolean>[] = [];
  
  // Discord: Batch into groups of 10 embeds
  if (settings.enableDiscord && settings.discordWebhookUrl) {
    for (let i = 0; i < discordEmbeds.length; i += DISCORD_MAX_EMBEDS) {
      const batch = discordEmbeds.slice(i, i + DISCORD_MAX_EMBEDS);
      const payload: DiscordWebhookPayload = {
        embeds: batch,
      };
      notifications.push(
        sendDiscordNotification(settings.discordWebhookUrl, payload)
          .then(success => {
            if (success) console.log(`Discord batch sent: ${batch.length} embeds`);
            return success;
          })
      );
      
      // Small delay between batches to avoid rate limits
      if (i + DISCORD_MAX_EMBEDS < discordEmbeds.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  
  // Slack: Send each item (Slack doesn't support batching the same way)
  if (settings.enableSlack && settings.slackWebhookUrl) {
    for (const item of items) {
      const payload = buildSlackItemPayload(item, gifUrl);
      notifications.push(
        sendSlackNotification(settings.slackWebhookUrl, payload)
          .then(success => {
            if (success) console.log(`Slack notification sent: ${item.id}`);
            return success;
          })
      );
      // Small delay for Slack rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  if (notifications.length > 0) {
    await Promise.all(notifications);
  }
}

/*
 * =============================================================================
 * CACHING FUNCTIONS
 * =============================================================================
 */

/**
 * Get parent post title with caching
 */
async function getCachedPostTitle(
  context: TriggerContext | Devvit.Context,
  postId: string
): Promise<string> {
  if (!postId) return 'Unknown Post';
  
  const { redis } = context;
  const cacheKey = `${RedisKeys.POST_TITLE_PREFIX}${postId}`;
  
  try {
    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Fetch from API
    const post = await context.reddit.getPostById(postId);
    const title = post.title || 'Unknown Post';
    
    // Cache for 1 hour
    await redis.set(cacheKey, title, { 
      expiration: new Date(Date.now() + CacheTTL.POST_TITLE) 
    });
    
    return title;
  } catch (error) {
    console.warn(`QBert: Could not fetch post title for ${postId}:`, error);
    return 'Unknown Post';
  }
}

/**
 * Get cached GIF URL (fetch once per batch interval)
 */
async function getCachedGif(
  context: TriggerContext | Devvit.Context
): Promise<string> {
  const { redis } = context;
  
  try {
    // Check cache first
    const cached = await redis.get(RedisKeys.CACHED_GIF);
    if (cached) {
      return cached;
    }
    
    // Fetch new GIF
    const gifUrl = await fetchGiphyGif(context);
    
    // Cache for 5 minutes
    await redis.set(RedisKeys.CACHED_GIF, gifUrl, { 
      expiration: new Date(Date.now() + CacheTTL.GIF) 
    });
    
    return gifUrl;
  } catch (error) {
    console.error('QBert: Error getting cached GIF:', error);
    return FALLBACK_GIF_URL;
  }
}

/*
 * =============================================================================
 * REDIS BATCH OPERATIONS
 * =============================================================================
 */

/**
 * Batch check if items are processed (concurrent Redis calls)
 */
async function batchCheckProcessed(
  context: TriggerContext | Devvit.Context,
  itemIds: string[]
): Promise<boolean[]> {
  const { redis } = context;
  
  try {
    // Use Promise.all for concurrent Redis operations
    const checks = itemIds.map(id => 
      redis.get(`${RedisKeys.PROCESSED_PREFIX}${id}`)
        .then(value => value !== null)
        .catch(() => false)
    );
    
    return await Promise.all(checks);
  } catch (error) {
    console.error('QBert: Error batch checking processed items:', error);
    return itemIds.map(() => false);
  }
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
    const key = `${RedisKeys.PROCESSED_PREFIX}${itemId}`;
    const value = await redis.get(key);
    return value !== null;
  } catch (error) {
    console.error(`Error checking if item ${itemId} is processed:`, error);
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
    const key = `${RedisKeys.PROCESSED_PREFIX}${itemId}`;
    await redis.set(key, '1', { 
      expiration: new Date(Date.now() + CacheTTL.PROCESSED_ITEM) 
    });
  } catch (error) {
    console.error(`Error marking item ${itemId} as processed:`, error);
  }
}

/*
 * =============================================================================
 * OVERFLOW ALERT
 * =============================================================================
 */

/**
 * Send overflow alert if not on cooldown
 */
async function sendOverflowAlertIfNeeded(
  context: TriggerContext | Devvit.Context,
  settings: NotificationSettings,
  itemCount: number
): Promise<void> {
  const { redis } = context;
  
  try {
    const lastAlert = await redis.get(RedisKeys.LAST_OVERFLOW_ALERT);
    const now = Date.now();
    
    if (lastAlert && parseInt(lastAlert, 10) > now - CacheTTL.OVERFLOW_COOLDOWN) {
      return; // Still on cooldown
    }
    
    const overflowData: OverflowAlertData = {
      itemCount,
      discordRoleId: settings.discordRoleId,
    };
    
    const success = await sendOverflowNotifications(settings, overflowData);
    
    if (success) {
      await redis.set(RedisKeys.LAST_OVERFLOW_ALERT, now.toString(), {
        expiration: new Date(now + CacheTTL.OVERFLOW_COOLDOWN)
      });
      console.log(`QBert: Sent overflow alert for ${itemCount} items`);
    }
  } catch (error) {
    console.error('QBert: Error sending overflow alert:', error);
  }
}

/*
 * =============================================================================
 * WEBHOOK FUNCTIONS
 * =============================================================================
 */

/**
 * Send a Discord webhook notification
 */
async function sendDiscordNotification(
  webhookUrl: string,
  payload: DiscordWebhookPayload
): Promise<boolean> {
  if (!webhookUrl) {
    console.error('Discord webhook URL is not configured');
    return false;
  }

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

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
        console.warn(`Discord rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      const errorText = await response.text().catch(() => 'Unknown error');
      lastError = new Error(`Discord webhook returned ${response.status}: ${errorText}`);
      
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.warn(`Discord webhook failed, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000;
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

/*
 * =============================================================================
 * PAYLOAD BUILDERS
 * =============================================================================
 */

/**
 * Build a Discord embed from item data
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
 * Build a Discord embed for overflow alert
 */
function buildOverflowEmbed(itemCount: number): DiscordEmbed {
  return {
    title: "You had one job! Stop shootin' the shit and check the damn queue!",
    description: `There are ${itemCount} items in the queue!!!`,
    color: DiscordColors.DARK_MAGENTA,
    timestamp: new Date().toISOString(),
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

/**
 * Send overflow alert to all enabled platforms
 */
async function sendOverflowNotifications(
  settings: NotificationSettings,
  data: OverflowAlertData
): Promise<boolean> {
  const notifications: Promise<boolean>[] = [];
  
  if (settings.enableDiscord && settings.discordWebhookUrl) {
    const discordEmbed = buildOverflowEmbed(data.itemCount);
    const discordPayload: DiscordWebhookPayload = {
      content: data.discordRoleId ? `<@&${data.discordRoleId}>` : undefined,
      embeds: [discordEmbed],
    };
    notifications.push(sendDiscordNotification(settings.discordWebhookUrl, discordPayload));
  }
  
  if (settings.enableSlack && settings.slackWebhookUrl) {
    const slackPayload = buildSlackOverflowPayload(data);
    notifications.push(sendSlackNotification(settings.slackWebhookUrl, slackPayload));
  }
  
  if (notifications.length === 0) {
    return false;
  }
  
  const results = await Promise.all(notifications);
  return results.some(success => success);
}

/*
 * =============================================================================
 * UTILITY FUNCTIONS
 * =============================================================================
 */

// Default fallback GIF
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

    const response = await fetch(
      `https://api.giphy.com/v1/gifs/random?api_key=${apiKey}&tag=waiting+in+line&rating=pg`
    );

    if (!response.ok) {
      console.error(`Giphy API error: ${response.status}`);
      return FALLBACK_GIF_URL;
    }

    const data = await response.json();
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

/*
 * =============================================================================
 * EXPORT
 * =============================================================================
 */

export default Devvit;
