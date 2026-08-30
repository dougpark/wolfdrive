# WolfDrive

A lightweight, high-performance local media and file management server built with Vue 3, Bun, Hono, and SQLite.

## Features

- **Local-First Architecture:** Designed to run locally on your home network or media workstation with direct filesystem access.
- **Fast Single-Page Interface:** Reactive Vue 3 frontend paired with Tailwind CSS for fluid browsing, media views, and controls.
- **High-Performance Backend:** Powered by the Bun runtime and Hono framework for minimal overhead and instant request handling.
- **Type-Safe Database:** Managed via Drizzle ORM over Bun's native SQLite execution engine (`bun:sqlite`).
- **Seamless Dev Workflow:** Parallel execution setup using Vite for Hot Module Replacement (HMR).

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