# WolfDrive

A lightweight, high-performance local media and file management server built with Vue 3, Bun, Hono, and SQLite.

## Features

- **Local-First Architecture:** Designed to run locally on your home network or media workstation with direct filesystem access.
- **Fast Single-Page Interface:** Reactive Vue 3 frontend paired with Tailwind CSS for fluid browsing, media views, and controls.
- **High-Performance Backend:** Powered by the Bun runtime and Hono framework for minimal overhead and instant request handling.
- **Type-Safe Database:** Managed via Drizzle ORM over Bun's native SQLite execution engine (`bun:sqlite`).
- **Seamless Dev Workflow:** Parallel execution setup using Vite for Hot Module Replacement (HMR).
- **Homelab Status:** Track scheduled jobs, one-off runs, logs, and service heartbeats through a scoped HTTP reporting API and dashboard. See [setup and reporting examples](docs/status_server.md#running-the-implemented-version).

## Tech Stack

- **Frontend:** Vue 3, Vite, Tailwind CSS, TypeScript
- **Backend:** Hono, Bun runtime
- **Database:** SQLite, Drizzle ORM (`drizzle-kit`)
- **Package Manager:** Bun

## Getting Started

### Prerequisites

Ensure you have [Bun](https://bun.sh) installed on your system.

### Installation

1. Clone the repository:
   ```bash
   git clone [https://github.com/dougpark/wolfdrive.git](https://github.com/dougpark/wolfdrive.git)
   cd wolfdrive

1. Install dependencies: bun install
2. Configure your local environment file: cp .env.example .env
## Database Setup

Generate and apply database migrations using Drizzle ORM:

### Generate SQL migrations from schema
```bash
bun run db:generate
```

### Apply pending migrations to local SQLite database
```bash
bun run db:migrate
```

### To visually inspect or edit your database records via Drizzle Studio:
```bash
bun run db:studio
```

## Development

Run both the Hono backend server and the Vite dev server concurrently in a single terminal session:
```bash
bun run parallel
```

• Frontend (Vite HMR): http://localhost:5173
• Backend API (Hono): http://localhost:3005
## Production Build
Compile the Vue 3 frontend into optimized static assets and launch the backend server:
### Compile Vue templates, TypeScript, and Tailwind CSS to /dist
```bash
bun run build
```

### Start the production Hono server
```bash
bun run start
```

## Storage and indexing

The Compose media mount uses `MEDIA_HOST_PATH` (default `/mnt/world/Production`) as
the host source and mounts it read-only at `/media` in the container. Set
`MEDIA_HOST_PATH` in the Compose environment or `.env` to change the source.
Storage settings display both paths; monitored folders must use paths visible to
the server, such as `/media/photos`. The host path is informational and does not
restrict which server paths can be registered. For non-Compose deployments,
`MEDIA_HOST_PATH` and `MEDIA_CONTAINER_PATH` are optional display labels.

Monitored folders can have multiple tags, using the same tag names as file tags
but with separate assignments and filters. A file belongs to its indexed
directory; avoid overlapping monitored folders when folder-tag filtering matters.
File search also searches stored AI summaries and AI tags, but generation is not
implemented yet. Changes detected by a scan clear outdated AI metadata.

Automatic rescanning is disabled until enabled in Storage & Indexing. The global
interval is entered in hours (minimum one minute, maximum 365 days) and stored
in seconds; it is intended to be shared with future AI processing. The first run
is due after one interval; subsequent runs are due one interval after the
previous attempt finishes. A missed run starts after the server restarts, and a
failed attempt is reported in settings and retried at the next interval. This is
an elapsed interval, not a calendar-time schedule. Manual and automatic scans
are serialized within the server process; do not run additional WolfDrive
servers or separate scan scripts against the same database concurrently.

Project Structure
wolfdrive/
├── drizzle/           # Auto-generated SQL migrations
├── public/            # Static assets served as-is (favicons, images)
├── src/
│   ├── components/    # Reusable Vue UI components
│   ├── db/            # Drizzle master schema and database client
│   ├── views/         # Top-level page views (Drive, Photos, Settings)
│   ├── App.vue        # Main Application shell
│   ├── index.ts       # Hono backend entry point & static middleware
│   └── main.ts        # Vue application bootstrapping
├── drizzle.config.ts  # Drizzle ORM CLI configuration
├── package.json
└── vite.config.ts     # Vite bundler & proxy configuration

License
MIT