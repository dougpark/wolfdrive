# Default recipe to list all available commands
default:
	@just --list

# Run both Hono backend (port 3005) and Vite dev server (port 5173) concurrently
dev:
	bun run --parallel start dev

# Run Hono backend server only
backend:
	bun run start

# Run Vite frontend dev server only
frontend:
	bun run dev