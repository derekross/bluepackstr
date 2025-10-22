/**
 * Utilities for converting Bluesky starter packs to Nostr follow packs
 */

/**
 * Convert a Bluesky handle to a Mostr NIP-05 identifier
 * @param blueskyHandle - e.g., "derekross.bsky.social"
 * @returns NIP-05 identifier - e.g., "derekross.bsky.social_at_bsky.brid.gy@mostr.pub"
 */
export function blueskyHandleToMostrNip05(blueskyHandle: string): string {
  return `${blueskyHandle}_at_bsky.brid.gy@mostr.pub`;
}

/**
 * Lookup a pubkey from a NIP-05 identifier
 * @param nip05 - NIP-05 identifier like "username@domain.com"
 * @returns hex pubkey or null if not found
 */
export async function lookupNip05Pubkey(nip05: string): Promise<string | null> {
  try {
    const [localPart, domain] = nip05.split('@');
    if (!localPart || !domain) {
      throw new Error('Invalid NIP-05 format');
    }

    const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(localPart)}`;
    const response = await fetch(url, {
      redirect: 'manual', // Don't follow redirects per NIP-05 spec
    });

    // Per NIP-05 spec, must ignore redirects
    if (response.status >= 300 && response.status < 400) {
      console.warn(`NIP-05 lookup returned redirect for ${nip05}, ignoring per spec`);
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const pubkey = data.names?.[localPart];

    if (!pubkey || typeof pubkey !== 'string') {
      return null;
    }

    // Validate it's a hex pubkey (64 chars, all hex)
    if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
      console.warn(`Invalid pubkey format from NIP-05 lookup: ${pubkey}`);
      return null;
    }

    return pubkey.toLowerCase();
  } catch (error) {
    console.error(`Error looking up NIP-05 ${nip05}:`, error);
    return null;
  }
}

/**
 * Lookup pubkeys for multiple Bluesky handles via Mostr bridge
 * @param blueskyHandles - Array of Bluesky handles
 * @returns Map of handle to pubkey (only successful lookups)
 */
export async function lookupBlueskHandlesPubkeys(
  blueskyHandles: string[],
  onProgress?: (current: number, total: number, handle: string, pubkey: string | null) => void
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (let i = 0; i < blueskyHandles.length; i++) {
    const handle = blueskyHandles[i];
    const nip05 = blueskyHandleToMostrNip05(handle);
    const pubkey = await lookupNip05Pubkey(nip05);

    if (pubkey) {
      results.set(handle, pubkey);
    }

    if (onProgress) {
      onProgress(i + 1, blueskyHandles.length, handle, pubkey);
    }

    // Small delay to avoid hammering the server
    if (i < blueskyHandles.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

export interface FollowPackEntry {
  pubkey: string;
  relay?: string;
}

/**
 * Create a kind 39089 follow pack event
 */
export function createFollowPackEvent(params: {
  title: string;
  description: string;
  entries: FollowPackEntry[];
  id?: string;
  image?: string;
}): {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
} {
  const tags: string[][] = [];

  // Add title tag
  tags.push(['title', params.title]);

  // Add d tag (unique identifier)
  const id = params.id || generateRandomId();
  tags.push(['d', id]);

  // Add image tag if provided (before p tags, matching following.space)
  if (params.image) {
    tags.push(['image', params.image]);
  }

  // Add p tags for each pubkey
  params.entries.forEach(entry => {
    if (entry.relay) {
      tags.push(['p', entry.pubkey, entry.relay]);
    } else {
      tags.push(['p', entry.pubkey]);
    }
  });

  // Add description tag (after p tags, matching following.space)
  if (params.description) {
    tags.push(['description', params.description]);
  }

  return {
    kind: 39089,
    content: '',
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Generate a random 12-character lowercase alphanumeric ID
 */
function generateRandomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array(12)
    .fill(0)
    .map(() => chars.charAt(Math.floor(Math.random() * chars.length)))
    .join('');
}
