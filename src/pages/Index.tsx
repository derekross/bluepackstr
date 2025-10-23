import { useSeoMeta } from '@unhead/react';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { Loader2, Copy, Check, Download, Sparkles, Image as ImageIcon, Wand2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { lookupBlueskHandlesPubkeys, createFollowPackEvent } from '@/lib/bluesky-to-nostr';
import { nip19 } from 'nostr-tools';
import { LoginArea } from '@/components/auth/LoginArea';
import { generateCoverImage } from '@/lib/image-generator';
import { useUploadFile } from '@/hooks/useUploadFile';

interface StarterPackUser {
  handle: string;
  displayName?: string;
  did: string;
}

interface StarterPackMetadata {
  name: string;
  description: string;
}

interface ConvertedProfileRowProps {
  handle: string;
  pubkey: string;
  index: number;
}

const ConvertedProfileRow = ({ handle, pubkey, index }: ConvertedProfileRowProps) => {
  const [localCopied, setLocalCopied] = useState(false);
  const npub = nip19.npubEncode(pubkey);

  const copyNpub = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await navigator.clipboard.writeText(npub);
    setLocalCopied(true);
    setTimeout(() => setLocalCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-white dark:bg-gray-800 rounded hover:bg-purple-50 dark:hover:bg-gray-700 gap-3 transition-colors">
      <a
        href={`https://njump.me/${npub}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        <span className="text-sm text-gray-500 dark:text-gray-400 w-8 flex-shrink-0">
          {index + 1}.
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-blue-600 dark:text-blue-400 truncate hover:underline">
            {handle}
          </div>
          <div className="text-xs text-purple-600 dark:text-purple-400 font-mono truncate hover:underline">
            {npub}
          </div>
        </div>
      </a>
      <Button
        variant="ghost"
        size="sm"
        onClick={copyNpub}
        className="flex-shrink-0"
      >
        {localCopied ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
};

const Index = () => {
  useSeoMeta({
    title: 'Bluesky to Nostr Pack Converter',
    description: 'Convert Bluesky starter packs to Nostr follow packs via the Mostr bridge',
  });

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<StarterPackUser[]>([]);
  const [copied, setCopied] = useState(false);
  const [starterPackMeta, setStarterPackMeta] = useState<StarterPackMetadata | null>(null);

  // Discovery state
  const [discovering, setDiscovering] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState(0);
  const [discoveryStatus, setDiscoveryStatus] = useState('');
  const [convertedProfiles, setConvertedProfiles] = useState<Map<string, string>>(new Map());

  // Publishing state
  const [publishing, setPublishing] = useState(false);
  const [publishedEventId, setPublishedEventId] = useState<string | null>(null);
  const [followPackTitle, setFollowPackTitle] = useState('');
  const [followPackDescription, setFollowPackDescription] = useState('');
  const [followPackImage, setFollowPackImage] = useState('');
  const [generatingImage, setGeneratingImage] = useState(false);
  const [gradientColor1, setGradientColor1] = useState('#3b82f6'); // Blue
  const [gradientColor2, setGradientColor2] = useState('#8b5cf6'); // Purple

  const { toast } = useToast();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { user } = useCurrentUser();
  const { mutateAsync: uploadFile } = useUploadFile();

  const extractStarterPackIdentifier = (inputUrl: string): string | null => {
    try {
      // Extract from URLs like: https://bsky.app/starter-pack/did:plc:xxx/3kwak7y36kv2f
      const match = inputUrl.match(/starter-pack\/(did:plc:[a-z0-9]+)\/([a-z0-9]+)/i);
      if (match) {
        const did = match[1];
        const rkey = match[2];
        return `at://${did}/app.bsky.graph.starterpack/${rkey}`;
      }
      return null;
    } catch {
      return null;
    }
  };

  const fetchAllListMembers = async (listUri: string): Promise<StarterPackUser[]> => {
    const allUsers: StarterPackUser[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({
        list: listUri,
        limit: '100',
        ...(cursor && { cursor }),
      });

      const response = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.graph.getList?${params}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch list: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.items) {
        data.items.forEach((item: { subject?: { handle: string; displayName?: string; did: string } }) => {
          if (item.subject) {
            allUsers.push({
              handle: item.subject.handle,
              displayName: item.subject.displayName,
              did: item.subject.did,
            });
          }
        });
      }

      cursor = data.cursor;
    } while (cursor);

    return allUsers;
  };

  const handleExtract = async () => {
    if (!url.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a starter pack URL',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setUsers([]);
    setPublishedEventId(null);

    try {
      const atUri = extractStarterPackIdentifier(url);
      if (!atUri) {
        throw new Error('Invalid starter pack URL format');
      }

      // Fetch starter pack
      const response = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.graph.getStarterPack?starterPack=${encodeURIComponent(atUri)}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch starter pack: ${response.statusText}`);
      }

      const data = await response.json();
      const listUri = data.starterPack?.record?.list;

      if (!listUri) {
        throw new Error('No list found in starter pack');
      }

      // Extract metadata
      const packName = data.starterPack?.record?.name || 'Untitled Pack';
      const originalDescription = data.starterPack?.record?.description || '';
      const packDescription = originalDescription +
        (originalDescription ? '\n\n' : '') +
        'This Follow Pack was converted from a Bluesky Starter Pack via Bluepackstr!';
      setStarterPackMeta({ name: packName, description: packDescription });
      setFollowPackTitle(packName);
      setFollowPackDescription(packDescription);

      // Fetch all list members
      const members = await fetchAllListMembers(listUri);
      setUsers(members);

      toast({
        title: 'Success!',
        description: `Extracted ${members.length} usernames`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to extract usernames',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDiscoverProfiles = async () => {
    if (users.length === 0) {
      toast({
        title: 'No Users',
        description: 'Please extract users from a starter pack first',
        variant: 'destructive',
      });
      return;
    }

    setDiscovering(true);
    setDiscoveryProgress(0);
    setConvertedProfiles(new Map());
    setPublishedEventId(null);

    try {
      setDiscoveryStatus('Looking up Nostr pubkeys via Mostr bridge...');
      const handles = users.map(u => u.handle);

      const pubkeyMap = await lookupBlueskHandlesPubkeys(handles, (current, total, handle, pubkey) => {
        setDiscoveryProgress((current / total) * 100);
        setDiscoveryStatus(
          `Looking up ${current}/${total}: ${handle} ${pubkey ? '✓' : '✗'}`
        );
      });

      const successCount = pubkeyMap.size;
      const failedCount = users.length - successCount;

      setConvertedProfiles(pubkeyMap);

      if (successCount === 0) {
        throw new Error('Could not find any Nostr pubkeys via Mostr bridge');
      }

      toast({
        title: 'Discovery Complete!',
        description: failedCount > 0
          ? `Found ${successCount} profiles, ${failedCount} not found`
          : `Found ${successCount} Nostr profiles`,
      });
    } catch (error) {
      toast({
        title: 'Discovery Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      console.error('Discovery error:', error);
    } finally {
      setDiscovering(false);
      setDiscoveryStatus('');
    }
  };

  const handleGenerateImage = async () => {
    if (!user) {
      toast({
        title: 'Not Logged In',
        description: 'Please log in to generate and upload images',
        variant: 'destructive',
      });
      return;
    }

    if (!followPackTitle.trim()) {
      toast({
        title: 'No Title',
        description: 'Please enter a title first',
        variant: 'destructive',
      });
      return;
    }

    setGeneratingImage(true);

    try {
      // Generate image with gradient background and title
      const blob = await generateCoverImage(followPackTitle, gradientColor1, gradientColor2);

      // Convert blob to File
      const file = new File([blob], 'follow-pack-cover.png', { type: 'image/png' });

      // Upload to Blossom
      toast({
        title: 'Uploading...',
        description: 'Uploading your custom cover image',
      });

      const tags = await uploadFile(file);

      // Extract URL from tags
      const urlTag = tags.find(tag => tag[0] === 'url');
      if (urlTag && urlTag[1]) {
        setFollowPackImage(urlTag[1]);
        toast({
          title: 'Success!',
          description: 'Cover image generated and uploaded',
        });
      } else {
        throw new Error('No URL returned from upload');
      }
    } catch (error) {
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      console.error('Image generation error:', error);
    } finally {
      setGeneratingImage(false);
    }
  };

  const handlePublishFollowPack = async () => {
    if (!user) {
      toast({
        title: 'Not Logged In',
        description: 'Please log in with a Nostr account to publish',
        variant: 'destructive',
      });
      return;
    }

    if (convertedProfiles.size === 0) {
      toast({
        title: 'No Profiles',
        description: 'Please discover Nostr profiles first',
        variant: 'destructive',
      });
      return;
    }

    setPublishing(true);

    try {
      const entries = Array.from(convertedProfiles.values()).map(pubkey => ({
        pubkey,
        relay: 'wss://mostr.pub',
      }));

      // Use provided image or default
      const imageUrl = followPackImage.trim() || `${window.location.origin}/follow-pack.png`;

      const eventTemplate = createFollowPackEvent({
        title: followPackTitle || 'Untitled Follow Pack',
        description: followPackDescription || '',
        entries,
        image: imageUrl,
      });

      const publishedEvent = await publishEvent(eventTemplate);
      setPublishedEventId(publishedEvent.id);

      toast({
        title: 'Success!',
        description: `Follow pack published with ${convertedProfiles.size} members`,
      });
    } catch (error) {
      toast({
        title: 'Publishing Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      console.error('Publishing error:', error);
    } finally {
      setPublishing(false);
    }
  };

  const copyToClipboard = async () => {
    const text = users.map(u => u.handle).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: 'Copied!',
      description: `${users.length} usernames copied to clipboard`,
    });
  };

  const downloadAsText = () => {
    const text = users.map(u => u.handle).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bluesky-usernames.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'Downloaded!',
      description: 'Usernames saved to file',
    });
  };

  const copyEventLink = async () => {
    if (!publishedEventId || !user) return;

    try {
      // Get the d tag value from the event
      // For now, we'll use nevent since we have the event ID
      const nevent = nip19.neventEncode({
        id: publishedEventId,
        relays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
      });

      const link = `https://following.space/${nevent}`;
      await navigator.clipboard.writeText(link);

      toast({
        title: 'Link Copied!',
        description: 'Follow pack link copied to clipboard',
      });
    } catch (error) {
      console.error('Error copying link:', error);
      toast({
        title: 'Error',
        description: 'Failed to copy link',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Login Area */}
        <div className="flex justify-end mb-6">
          <LoginArea />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-6 pb-2 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Bluesky to Nostr Pack Converter
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Convert Bluesky starter packs to Nostr follow packs via the Mostr bridge
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Enter Starter Pack URL</CardTitle>
            <CardDescription>
              Paste the URL of a Bluesky starter pack (e.g., https://bsky.app/starter-pack/did:plc:xxx/xxx)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="https://bsky.app/starter-pack/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                className="flex-1"
              />
              <Button onClick={handleExtract} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  'Extract'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {users.length > 0 && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Step 1: Extracted Usernames ({users.length})</CardTitle>
                    <CardDescription>All usernames from the Bluesky starter pack</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={copyToClipboard}>
                      {copied ? (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy All
                        </>
                      )}
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadAsText}>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <div className="space-y-2">
                    {users.map((user, index) => (
                      <a
                        key={user.did}
                        href={`https://bsky.app/profile/${user.handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between py-2 px-3 bg-white dark:bg-gray-800 rounded hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors cursor-pointer block"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500 dark:text-gray-400 w-8">
                            {index + 1}.
                          </span>
                          <div>
                            <div className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                              {user.handle}
                            </div>
                            {user.displayName && (
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {user.displayName}
                              </div>
                            )}
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Discover Nostr Profiles */}
            <Card className="border-2 border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  Step 2: Discover Nostr Profiles
                </CardTitle>
                <CardDescription>
                  Look up these Bluesky accounts on Nostr via the Mostr bridge
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {discovering && (
                  <div className="space-y-2">
                    <Progress value={discoveryProgress} className="w-full" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">{discoveryStatus}</p>
                  </div>
                )}

                <Button
                  onClick={handleDiscoverProfiles}
                  disabled={discovering}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {discovering ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Discovering Profiles...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Discover Nostr Profiles
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Discovered Profiles Display */}
            {convertedProfiles.size > 0 && (
              <>
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle>Discovered Nostr Profiles ({convertedProfiles.size})</CardTitle>
                    <CardDescription>
                      Successfully found on Nostr via Mostr bridge
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
                      <div className="space-y-2">
                        {Array.from(convertedProfiles.entries()).map(([handle, pubkey], index) => (
                          <ConvertedProfileRow
                            key={pubkey}
                            handle={handle}
                            pubkey={pubkey}
                            index={index}
                          />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Step 3: Publish to Nostr */}
                <Card className="mt-6 border-2 border-purple-200 dark:border-purple-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-purple-600" />
                      Step 3: Publish to Nostr
                    </CardTitle>
                    <CardDescription>
                      Create a Nostr follow pack (kind 39089) with these {convertedProfiles.size} profiles
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Follow Pack Title</Label>
                      <Input
                        id="title"
                        value={followPackTitle}
                        onChange={(e) => setFollowPackTitle(e.target.value)}
                        placeholder="My Awesome Follow Pack"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={followPackDescription}
                        onChange={(e) => setFollowPackDescription(e.target.value)}
                        placeholder="A collection of amazing accounts..."
                        rows={3}
                      />
                    </div>

                    {/* Gradient Color Pickers */}
                    <div className="space-y-3">
                      <Label>Image Gradient Colors</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="color1" className="text-xs text-gray-600 dark:text-gray-400">
                            Start Color
                          </Label>
                          <div className="flex gap-2">
                            <input
                              id="color1"
                              type="color"
                              value={gradientColor1}
                              onChange={(e) => setGradientColor1(e.target.value)}
                              className="h-10 w-14 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                            />
                            <Input
                              type="text"
                              value={gradientColor1}
                              onChange={(e) => setGradientColor1(e.target.value)}
                              placeholder="#3b82f6"
                              className="flex-1 font-mono text-sm"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="color2" className="text-xs text-gray-600 dark:text-gray-400">
                            End Color
                          </Label>
                          <div className="flex gap-2">
                            <input
                              id="color2"
                              type="color"
                              value={gradientColor2}
                              onChange={(e) => setGradientColor2(e.target.value)}
                              className="h-10 w-14 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                            />
                            <Input
                              type="text"
                              value={gradientColor2}
                              onChange={(e) => setGradientColor2(e.target.value)}
                              placeholder="#8b5cf6"
                              className="flex-1 font-mono text-sm"
                            />
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Choose colors for the background gradient of your generated image
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="image">Cover Image URL (optional)</Label>
                      <div className="flex gap-2">
                        <Input
                          id="image"
                          type="url"
                          value={followPackImage}
                          onChange={(e) => setFollowPackImage(e.target.value)}
                          placeholder="https://example.com/image.png"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleGenerateImage}
                          disabled={generatingImage || !user || !followPackTitle.trim()}
                        >
                          {generatingImage ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Wand2 className="mr-2 h-4 w-4" />
                              Generate
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Generate an image with custom gradient, or provide your own URL
                      </p>
                    </div>

                    {/* Image Preview */}
                    {followPackImage.trim() && (
                      <div className="space-y-2">
                        <Label>Cover Image Preview</Label>
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900">
                          <img
                            src={followPackImage.trim()}
                            alt="Follow pack cover"
                            className="w-full h-48 object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <ImageIcon className="h-3 w-3" />
                          Custom image ready
                        </p>
                      </div>
                    )}

                    {/* Live Gradient Preview */}
                    {!followPackImage.trim() && (
                      <div className="space-y-2">
                        <Label>Cover Preview</Label>
                        <div
                          className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden h-32 flex items-center justify-center"
                          style={{
                            background: `linear-gradient(135deg, ${gradientColor1}, ${gradientColor2})`
                          }}
                        >
                          <p className="text-white font-bold text-2xl drop-shadow-lg">
                            {followPackTitle || 'Your Title Here'}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <ImageIcon className="h-3 w-3" />
                          Preview of your cover (click Generate to create full image)
                        </p>
                      </div>
                    )}

                    {publishedEventId && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                        <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                          Follow Pack Published!
                        </h4>
                        <p className="text-sm text-green-800 dark:text-green-200 mb-3">
                          Event ID: {publishedEventId.slice(0, 8)}...{publishedEventId.slice(-8)}
                        </p>
                        <Button onClick={copyEventLink} size="sm" variant="outline">
                          <Copy className="mr-2 h-4 w-4" />
                          Copy following.space Link
                        </Button>
                      </div>
                    )}

                    <Button
                      onClick={handlePublishFollowPack}
                      disabled={publishing || !user}
                      className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                      {publishing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Publishing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Publish Follow Pack
                        </>
                      )}
                    </Button>

                    {!user && (
                      <p className="text-sm text-amber-600 dark:text-amber-400">
                        Please log in with a Nostr account to publish
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
