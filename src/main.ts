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
    // TODO: Implement mod queue checking logic
    // 1. Fetch mod queue via context.reddit.getModQueue()
    // 2. Filter out previously processed items (check Redis)
    // 3. Classify items (submission/comment, fresh/stale)
    // 4. Send Discord notifications
    // 5. Store processed item IDs in Redis
    // 6. Check for queue overflow condition
    
    console.log('QBert: Checking mod queue...');
    
    // Placeholder - implementation needed
    throw new Error('Not implemented - see REQUIREMENTS.md for specifications');
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
    const settings = await context.settings.getAll();
    const intervalMinutes = (settings.checkIntervalMinutes as number) || 15;
    
    // Schedule the recurring job
    await context.scheduler.runJob({
      name: 'checkModQueue',
      cron: `*/${intervalMinutes} * * * *`, // Every N minutes
    });
    
    console.log(`QBert installed! Checking mod queue every ${intervalMinutes} minutes.`);
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
  // TODO: Implement HTTP POST to Discord webhook
  // - Use context.http or fetch()
  // - Handle errors gracefully (FR-NFR-2.4: retry up to 3 times)
  throw new Error('Not implemented');
}

/**
 * Check if an item has already been processed
 * See REQUIREMENTS.md - FR-1.4: Track processed items
 */
async function isItemProcessed(
  redis: Devvit.Context['redis'],
  itemId: string
): Promise<boolean> {
  // TODO: Check Redis for processed:{itemId}
  throw new Error('Not implemented');
}

/**
 * Mark an item as processed
 * See REQUIREMENTS.md - State Management
 */
async function markItemProcessed(
  redis: Devvit.Context['redis'],
  itemId: string
): Promise<void> {
  // TODO: Set processed:{itemId} in Redis with 24h TTL
  throw new Error('Not implemented');
}

/**
 * Fetch a GIF from Giphy API
 * See REQUIREMENTS.md - FR-7: Giphy Integration
 */
async function fetchGiphyGif(apiKey: string): Promise<string | null> {
  // TODO: Search Giphy for "waiting in line"
  // Return null if API key missing or request fails
  throw new Error('Not implemented');
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

/*
 * =============================================================================
 * EXPORT
 * =============================================================================
 */

export default Devvit;

