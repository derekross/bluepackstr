# Bluepackstr

Convert Bluesky Starter Packs to Nostr Follow Packs via the Mostr bridge.

## Overview

Bluepackstr is a web application that bridges social networks by converting Bluesky starter packs into Nostr follow packs. It discovers Bluesky accounts that have been bridged to Nostr via [Mostr](https://mostr.pub) and creates shareable follow packs that work with Nostr clients.

**Live App:** [Your deployment URL here]

## Features

### 🔄 **3-Step Conversion Process**

1. **Extract Usernames** - Paste a Bluesky starter pack URL and extract all member handles
2. **Discover Nostr Profiles** - Look up bridged Nostr accounts via Mostr's NIP-05 bridge
3. **Publish Follow Pack** - Create and publish a kind 39089 follow pack to Nostr relays

### ✨ **Key Features**

- **Automatic Discovery** - Finds Nostr pubkeys for Bluesky accounts via NIP-05
- **Custom Cover Images** - Generate images with title overlay or use custom URLs
- **Blossom Upload** - Automatic image hosting on Blossom servers
- **Real-time Progress** - Visual feedback during extraction and discovery
- **Clickable Profiles** - View profiles on Bluesky or njump.me
- **Copy Functions** - Copy individual npubs or all usernames
- **Export Options** - Download usernames as text file
- **Attribution** - Automatic credit to Bluepackstr in descriptions

## How to Use

### Step 1: Extract Bluesky Starter Pack

1. Go to Bluesky and find a starter pack (e.g., `https://bsky.app/starter-pack/did:plc:xxx/xxx`)
2. Copy the URL
3. Paste it into Bluepackstr
4. Click **Extract**

### Step 2: Discover Nostr Profiles

1. Review the extracted usernames
2. Click **Discover Nostr Profiles**
3. Wait for the bridge lookup to complete
4. View the discovered npubs

### Step 3: Publish to Nostr

1. Log in with your Nostr account (browser extension or nsec)
2. Review/edit the title and description
3. Optionally generate a custom cover image or provide a URL
4. Click **Publish Follow Pack**
5. Share the following.space link!

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/bluepackstr.git
cd bluepackstr

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Deploy
npm run deploy
```

## Technical Details

### Stack

- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite
- **UI Library:** Radix UI + Tailwind CSS
- **Nostr:** @nostrify/nostrify + nostr-tools
- **State Management:** React Query
- **Image Generation:** Canvas API
- **File Upload:** Blossom (via @nostrify/nostrify)

### How It Works

#### 1. Extraction
- Fetches starter pack metadata from Bluesky's public API
- Retrieves list members with pagination support
- Extracts handles and display names

#### 2. Discovery
- Converts Bluesky handles to Mostr NIP-05 format:
  - `username.bsky.social` → `username.bsky.social_at_bsky.brid.gy@mostr.pub`
- Performs HTTPS lookups to `mostr.pub/.well-known/nostr.json`
- Returns hex pubkeys for found accounts

#### 3. Publishing
- Creates kind 39089 replaceable event with:
  - `title` tag - Follow pack name
  - `d` tag - Unique identifier
  - `image` tag - Cover image URL
  - `p` tags - One per discovered pubkey with relay hint
  - `description` tag - Follow pack description
- Signs and publishes to configured Nostr relays
- Generates following.space link for sharing

### Event Structure

```json
{
  "kind": 39089,
  "content": "",
  "tags": [
    ["title", "My Follow Pack"],
    ["d", "unique-id-123"],
    ["image", "https://blossom.server/image.png"],
    ["p", "hex-pubkey-1", "wss://mostr.pub"],
    ["p", "hex-pubkey-2", "wss://mostr.pub"],
    ["description", "A collection of accounts..."]
  ]
}
```

## Development

### Project Structure

```
src/
├── components/        # Reusable UI components
│   ├── auth/         # Login/signup components
│   └── ui/           # Shadcn UI components
├── hooks/            # Custom React hooks
├── lib/              # Utilities and helpers
│   ├── bluesky-to-nostr.ts    # Conversion logic
│   └── image-generator.ts      # Cover image generation
├── pages/            # Main application pages
└── contexts/         # React context providers
```

### Key Files

- **`src/pages/Index.tsx`** - Main application UI and logic
- **`src/lib/bluesky-to-nostr.ts`** - NIP-05 lookup and event creation
- **`src/lib/image-generator.ts`** - Canvas-based image generation
- **`src/hooks/useUploadFile.ts`** - Blossom upload integration

### Environment Variables

No environment variables required! The app uses public APIs:
- Bluesky API: `https://public.api.bsky.app`
- Mostr NIP-05: `https://mostr.pub/.well-known/nostr.json`
- Blossom Server: `https://blossom.primal.net`

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Guidelines

1. Follow the existing code style
2. Test thoroughly before submitting
3. Update documentation as needed
4. Keep commits focused and descriptive

## Related Projects

- [Mostr](https://mostr.pub) - Bluesky/ActivityPub bridge to Nostr
- [following.space](https://following.space) - Nostr follow pack viewer
- [Blossom](https://github.com/hzrd149/blossom) - Media server for Nostr

## NIPs (Nostr Implementation Possibilities)

- [NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md) - Mapping Nostr keys to DNS identifiers
- [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) - Lists (kind 39089 is a custom list type)

## License

MIT License - See LICENSE file for details

## Acknowledgments

- Built with [mkstack](https://github.com/ditto-pub/mkstack) template
- Bluesky API for public data access
- Mostr bridge for making cross-platform discovery possible
- Nostr community for protocol development

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/yourusername/bluepackstr/issues)
- Nostr: [Your Nostr contact]

---

**Made with 💜 by the Nostr community**

*Converting social networks, one follow pack at a time.*
