/**
 * QBert-Devvit: Discord Notification Bot for Reddit Moderation Queues
 * 
 * This is the main entry point for the Devvit application.
 * See REQUIREMENTS.md for full business requirements.
 */

import { Devvit } from '@devvit/public-api';

// Enable Redis for state management
Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true, // Required for Discord webhook calls
});

/*
 * =============================================================================
 * APP SETTINGS
 * See REQUIREMENTS.md - Configuration Settings Schema
 * =============================================================================
 */

Devvit.addSettings([
  {
    name: 'discordWebhookUrl',
    type: 'string',
    label: 'Discord Webhook URL',
    helpText: 'The webhook URL for your Discord channel',
    isSecret: true,
  },
  {
    name: 'discordRoleId',
    type: 'string',
    label: 'Discord Role ID (for overflow alerts)',
    helpText: 'Role ID to ping when queue exceeds threshold (optional)',
  },
  {
    name: 'staleThresholdMinutes',
    type: 'number',
    label: 'Stale Threshold (minutes)',
    helpText: 'Items older than this are marked as stale',
    defaultValue: 45,
  },
  {
    name: 'overflowThreshold',
    type: 'number',
    label: 'Queue Overflow Threshold',
    helpText: 'Alert when queue has more than this many items',
    defaultValue: 5,
  },
  {
    name: 'checkIntervalMinutes',
    type: 'number',
    label: 'Check Interval (minutes)',
    helpText: 'How often to check the mod queue',
    defaultValue: 15,
  },
  {
    name: 'giphyApiKey',
    type: 'string',
    label: 'Giphy API Key (optional)',
    helpText: 'Leave empty to disable GIF attachments',
    isSecret: true,
  },
  {
    name: 'enableSubmissionNotifications',
    type: 'boolean',
    label: 'Enable Submission Notifications',
    helpText: 'Send notifications for new submissions in mod queue',
    defaultValue: true,
  },
  {
    name: 'enableCommentNotifications',
    type: 'boolean',
    label: 'Enable Comment Notifications',
    helpText: 'Send notifications for new comments in mod queue',
    defaultValue: true,
  },
  {
    name: 'enableStaleAlerts',
    type: 'boolean',
    label: 'Enable Stale Alerts',
    helpText: 'Send alerts for items that have been waiting too long',
    defaultValue: true,
  },
  {
    name: 'enableOverflowAlerts',
    type: 'boolean',
    label: 'Enable Overflow Alerts',
    helpText: 'Send alerts when queue exceeds threshold',
    defaultValue: true,
  },
]);

/*
 * =============================================================================
 * DISCORD NOTIFICATION COLORS
 * See REQUIREMENTS.md - FR-6: Notification Color Coding
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
  image?: { url: string };
}

interface DiscordWebhookPayload {
  content?: string;
  embeds: DiscordEmbed[];
}

/*
 * =============================================================================
 * SCHEDULER JOB
 * See REQUIREMENTS.md - FR-1: Mod Queue Monitoring
 * =============================================================================
 */

Devvit.addSchedulerJob({
  name: 'checkModQueue',
  onRun: async (event, context) => {
    try {
      console.log('QBert: Checking mod queue...');

      // Step 1: Load Configuration
      const settings = await context.settings.getAll();
      const webhookUrl = settings.discordWebhookUrl as string | undefined;
      const discordRoleId = settings.discordRoleId as string | undefined;
      const staleThresholdMinutes = (settings.staleThresholdMinutes as number) || 45;
      const overflowThreshold = (settings.overflowThreshold as number) || 5;
      const giphyApiKey = settings.giphyApiKey as string | undefined;
      const enableSubmissionNotifications = (settings.enableSubmissionNotifications as boolean) !== false;
      const enableCommentNotifications = (settings.enableCommentNotifications as boolean) !== false;
      const enableStaleAlerts = (settings.enableStaleAlerts as boolean) !== false;
      const enableOverflowAlerts = (settings.enableOverflowAlerts as boolean) !== false;

      if (!webhookUrl) {
        console.error('QBert: Discord webhook URL is not configured');
        return;
      }

      const subredditName = event.subredditName || event.data?.subredditName;
      if (!subredditName) {
        console.error('QBert: Subreddit name not found in event');
        return;
      }

      // Step 2: Fetch Mod Queue
      let queueItems;
      try {
        queueItems = await context.reddit.getModQueue({
          subredditName,
          limit: 100, // Get up to 100 items
        });
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
          if (await isItemProcessed(context.redis, itemId)) {
            continue;
          }

          // Step 4: Classify Item
          const isSubmission = itemId.startsWith('t3_');
          const isComment = itemId.startsWith('t1_');

          if (!isSubmission && !isComment) {
            console.warn(`QBert: Unknown item type for ${itemId}, skipping`);
            await markItemProcessed(context.redis, itemId);
            continue;
          }

          // Get creation time - handle different possible property names
          let itemCreatedAt: Date;
          if ('createdAt' in item && item.createdAt) {
            // Devvit API might return Unix timestamp (seconds) or Date
            const timestamp = typeof item.createdAt === 'number' 
              ? item.createdAt * 1000 
              : item.createdAt;
            itemCreatedAt = new Date(timestamp);
          } else if ('created_utc' in item && item.created_utc) {
            itemCreatedAt = new Date((item.created_utc as number) * 1000);
          } else {
            // Fallback to current time if we can't determine creation time
            console.warn(`QBert: Could not determine creation time for ${itemId}, using current time`);
            itemCreatedAt = new Date();
          }
          
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
            // Build and send notification
            let embed: DiscordEmbed;

            if (isSubmission) {
              const postTitle = 'title' in item ? String(item.title) : 'Untitled Post';
              const author = 'author' in item ? String(item.author) : 'Unknown';
              const url = `https://reddit.com${'permalink' in item ? item.permalink : `/r/${subredditName}/comments/${itemId.replace('t3_', '')}`}`;
              
              embed = await buildSubmissionEmbed(
                context.http,
                {
                  id: itemId,
                  title: postTitle,
                  author,
                  url,
                  createdAt: itemCreatedAt,
                },
                shouldSendStaleAlert,
                giphyApiKey
              );
            } else {
              // Comment
              const author = 'author' in item ? String(item.author) : 'Unknown';
              const url = `https://reddit.com${'permalink' in item ? item.permalink : `/r/${subredditName}/comments/${itemId.replace('t1_', '')}`}`;
              
              // Try to get parent post title
              let parentPostTitle = 'Unknown Post';
              if ('linkTitle' in item && item.linkTitle) {
                parentPostTitle = String(item.linkTitle);
              } else if ('parentTitle' in item && item.parentTitle) {
                parentPostTitle = String(item.parentTitle);
              }

              embed = await buildCommentEmbed(
                context.http,
                {
                  id: itemId,
                  author,
                  url,
                  createdAt: itemCreatedAt,
                  parentPostTitle,
                },
                shouldSendStaleAlert,
                giphyApiKey
              );
            }

            const payload: DiscordWebhookPayload = {
              embeds: [embed],
            };

            try {
              const success = await sendDiscordNotification(context.http, webhookUrl, payload);
              if (success) {
                notificationCount++;
              }
            } catch (error) {
              console.error(`QBert: Error sending notification for item ${itemId}:`, error);
              // Continue processing other items
            }
          }

          // Mark as processed regardless of notification status
          await markItemProcessed(context.redis, itemId);
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
            const embed = buildOverflowEmbed(totalQueueCount);
            const payload: DiscordWebhookPayload = {
              content: discordRoleId ? `<@&${discordRoleId}>` : undefined,
              embeds: [embed],
            };

            const success = await sendDiscordNotification(context.http, webhookUrl, payload);
            if (success) {
              await context.redis.set('last_overflow_alert', now.toString(), { expirationTtl: 3600 });
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

Devvit.addTrigger({
  event: 'AppInstall',
  onEvent: async (event, context) => {
    try {
      const settings = await context.settings.getAll();
      const intervalMinutes = (settings.checkIntervalMinutes as number) || 15;
      
      // Validate interval (must be between 1 and 60 minutes)
      const validInterval = Math.max(1, Math.min(60, intervalMinutes));
      
      // Schedule the recurring job
      await context.scheduler.runJob({
        name: 'checkModQueue',
        cron: `*/${validInterval} * * * *`, // Every N minutes
      });
      
      console.log(`QBert installed! Checking mod queue every ${validInterval} minutes.`);
    } catch (error) {
      console.error('QBert: Error during app installation:', error);
      // Don't throw - allow installation to complete
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
  http: Devvit.Context['http'],
  webhookUrl: string,
  payload: DiscordWebhookPayload
): Promise<boolean> {
  if (!webhookUrl) {
    console.error('Discord webhook URL is not configured');
    return false;
  }

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await http.fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
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
 * Check if an item has already been processed
 * See REQUIREMENTS.md - FR-1.4: Track processed items
 */
async function isItemProcessed(
  redis: Devvit.Context['redis'],
  itemId: string
): Promise<boolean> {
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
 * See REQUIREMENTS.md - State Management
 */
async function markItemProcessed(
  redis: Devvit.Context['redis'],
  itemId: string
): Promise<void> {
  try {
    const key = `processed:${itemId}`;
    const ttlSeconds = 24 * 60 * 60; // 24 hours in seconds
    await redis.set(key, '1', { expirationTtl: ttlSeconds });
  } catch (error) {
    console.error(`Error marking item ${itemId} as processed:`, error);
    // Don't throw - allow processing to continue
  }
}

/**
 * Fetch a GIF from Giphy API
 * See REQUIREMENTS.md - FR-7: Giphy Integration
 */
async function fetchGiphyGif(
  http: Devvit.Context['http'],
  apiKey: string | undefined
): Promise<string | null> {
  if (!apiKey) {
    return null;
  }

  try {
    const searchQuery = encodeURIComponent('waiting in line');
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${searchQuery}&limit=1&rating=g`;
    
    const response = await http.fetch(url, {
      method: 'GET',
    });

    if (!response.ok) {
      console.warn(`Giphy API returned ${response.status}, skipping GIF`);
      return null;
    }

    const data = await response.json();
    
    if (data.data && data.data.length > 0) {
      const gifUrl = data.data[0].images?.original?.url || data.data[0].images?.downsized?.url;
      return gifUrl || null;
    }

    return null;
  } catch (error) {
    console.warn('Error fetching Giphy GIF:', error);
    return null;
  }
}

/**
 * Determine if an item is stale
 * See REQUIREMENTS.md - FR-3: Stale Item Detection
 */
function isItemStale(itemCreatedAt: Date, thresholdMinutes: number): boolean {
  const now = new Date();
  const ageMinutes = (now.getTime() - itemCreatedAt.getTime()) / (1000 * 60);
  return ageMinutes > thresholdMinutes;
}

/**
 * Build a Discord embed for a submission notification
 * See REQUIREMENTS.md - Notification Message Templates
 */
async function buildSubmissionEmbed(
  http: Devvit.Context['http'],
  post: { id: string; title: string; author: string; url: string; createdAt: Date },
  isStale: boolean,
  giphyApiKey: string | undefined
): Promise<DiscordEmbed> {
  const gifUrl = await fetchGiphyGif(http, giphyApiKey);
  const color = isStale ? DiscordColors.RED : DiscordColors.GREEN;
  
  let description: string;
  if (isStale) {
    const publishTime = post.createdAt.toISOString();
    description = `There is a Stale Post in the ModQueue from ${post.author}!\nPost has been waiting since ${publishTime}`;
  } else {
    description = `New Post in the ModQueue from ${post.author}!`;
  }

  return {
    title: post.title,
    description,
    url: post.url,
    color,
    timestamp: new Date().toISOString(),
    ...(gifUrl && { image: { url: gifUrl } }),
  };
}

/**
 * Build a Discord embed for a comment notification
 * See REQUIREMENTS.md - Notification Message Templates
 */
async function buildCommentEmbed(
  http: Devvit.Context['http'],
  comment: { id: string; author: string; url: string; createdAt: Date; parentPostTitle: string },
  isStale: boolean,
  giphyApiKey: string | undefined
): Promise<DiscordEmbed> {
  const gifUrl = await fetchGiphyGif(http, giphyApiKey);
  const color = isStale ? DiscordColors.RED : DiscordColors.BLUE;
  
  const title = `${comment.author} has commented on "${comment.parentPostTitle}"`;
  
  let description: string;
  if (isStale) {
    const publishTime = comment.createdAt.toISOString();
    description = `There is a Stale Comment in the ModQueue from ${comment.author}!\nComment has been waiting since ${publishTime}`;
  } else {
    description = 'New comment in the ModQueue!';
  }

  return {
    title,
    description,
    url: comment.url,
    color,
    timestamp: new Date().toISOString(),
    ...(gifUrl && { image: { url: gifUrl } }),
  };
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

