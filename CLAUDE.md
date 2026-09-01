# CLAUDE.md

## Project Overview
WolfDrive is a self-hosted, all-inclusive local media manager running in Docker on an Ubuntu server. It scans local file trees, indexes metadata in SQLite, runs midnight rescans, and presents a modern Google Drive-style web dashboard with dynamic plugin viewers for photos, videos, audio, eBooks, PDFs, Markdown, and office docs.
## Tech Stack & Runtime Constraints
• Runtime: Bun (bun.js) strictly. Do NOT use Node.js or npm/pnpm/yarn commands. Use bun install, bun run, bun test.
• Backend Framework: Hono served natively via Bun.
• Frontend Framework: Vue 3 strictly (using Vite for bundling/dev HMR). Do not introduce React, Svelte, or other frontend UI frameworks.
• Styling: Tailwind CSS matching the "Gemini-Modern" design system definition.
• Database: SQLite via native bun:sqlite driver.
• Metadata Processing: Shell out to system CLI tools (exiftool, ffprobe, pdf-parse).
• Hardware/Environment: Ubuntu Linux server equipped with 32GB RAM & NVIDIA RTX 5060 Ti (16GB VRAM) running local Ollama models. Workstation development is managed remotely via VS Code Remote-SSH on macOS.
## Key Commands
• bun install — Install dependencies.
• bun run src/index.ts — Start the Hono backend entry point.
• bun run dev — Run development server (Vite + Hono with HMR).
• bun run build — Compile Vue 3 Single File Components and Tailwind assets into /dist.
• bun test — Run test suite using Bun's native test runner.
## Frontend Directives (Mandate: Vue 3 + Composition API)
### Component Architecture & Syntax
• Composition API Only: Always use <script setup lang="ts"> inside Single File Components (.vue). Do NOT use the legacy Options API.
• Reactivity: Use ref() for primitive values, arrays, and replaced objects. Use reactive() sparingly for fixed state objects.
• Directory Structure: Place components in src/components/ organized by feature (/drive, /viewers, /layout, /common).
• Composables: Extract reusable logic, API fetching, and player state management into custom composables inside src/composables/ (e.g., useMediaDrive.ts, usePlayer.ts).
• Icons: Use lucide-vue-next or inline SVG icons styled with Tailwind utility classes.
### Style Scope
• Encapsulate component-specific custom CSS inside <style scoped> tags.
• Favor Tailwind CSS utility classes directly inside Vue <template> elements over custom CSS rules wherever possible.
### Design System Rules ("Gemini-Modern")
Adhere strictly to these design system tokens and layout constraints across all Vue components:
1. Palette Tokens
@theme {
  --color-gemini-bg: #ffffff;
  --color-gemini-surface: #f0f4f9;
  --color-gemini-card: #ffffff;
  --color-gemini-border: #e1e3e1;
  --color-gemini-text: #1f1f1f;
  --color-gemini-subtext: #444746;
  --color-gemini-blue: #1a73e8;
  --color-gemini-purple: #7c4dff;
  --color-gemini-sparkle: #0b57d0;
}
2. Layout and Scaffolding
Padding & Spacing: High breathability. Use standard container padding of p-8 (32px) or larger.
• Rounding: High rounded corners. Use rounded-xl (12px) for buttons, inputs, and small file item cards. Use rounded-3xl (24px) for major containers, modals, and preview panels.
• Elevation: Minimal, soft floating shadows (shadow-sm or custom shadow-[0_2px_8px_rgba(0,0,0,0.06)]).
• Typography: Font family Inter or Roboto. Headings must use font-weight: 500 or 600 with tracking-tight. Body text uses font-weight: 400 with leading-relaxed (1.6).

3. Tailwind Implementation Tokens
• Primary Buttons: bg-gemini-blue text-white px-6 py-3 rounded-full hover:opacity-90 transition-all font-medium cursor-pointer
• Card Containers: bg-gemini-card border border-gemini-border rounded-3xl shadow-sm p-6
• Drive Grid Item: bg-gemini-card border border-gemini-border rounded-xl p-4 hover:border-gemini-blue hover:shadow-md transition-all cursor-pointer

## Backend & Database Guidelines
• Entry Point: Everything boots from /src/index.ts.
• Database Driver: Import directly via import { Database } from "bun:sqlite". Do not introduce heavy ORMs like Prisma unless explicitly requested.
• Production Build Serving: Hono must serve the compiled Vue static assets from ./dist in production, falling back to index.html for single-page app (SPA) client-side routing.
• Extensible Plugin Viewer API: Route streaming and rendering endpoints logically (/api/stream/:id, /api/metadata/:id). Vue frontend components will inspect file mime_type to mount the appropriate media viewer plugin component dynamically.
• Non-Destructive Scanning: Directory indexing must read, hash, and metadata-tag files without altering or moving original file paths on disk.

# UI & Vue 3 Design Constraints

## 1. UI Blueprint & Reference Components
- ALWAYS check existing components in `@src/components/ui` BEFORE creating new UI.
- Direct reference component for list cards: `@src/components/FileCard.vue`.
- Direct reference component for modals/popups: `@src/components/ModalShell.vue`.

## 2. Hard Styling Constraints
- DO NOT invent new color values or custom arbitrary Tailwind classes.


## 3. Component Construction Rules
- Use `<script setup lang="ts">` exclusively for component script blocks.
- DO NOT write raw HTML buttons or inputs inside views. Use UI primitives:
  - Buttons: `<BaseButton variant="primary|secondary">`
  - Inputs: `<BaseInput v-model="..." />`
  - Modals: Use `<ModalShell>` with named `<template #header>` and `<template #body>` slots.
- Every child event MUST be explicitly defined using `const emit = defineEmits<{ ... }>()`.

# Database & Migration Constraints (Drizzle ORM + Bun SQLite)

## 1. Database Schema Location
- ALL database schema definitions MUST live in `@src/db/schema.ts`.
- DO NOT create ad-hoc SQL tables or write raw string SQL queries inside API route files.
- ALWAYS export tables using Drizzle SQLite definitions (`sqliteTable`, `text`, `integer`, etc.).

## 2. Schema Changes & Migration Workflow
- DO NOT alter live database files directly. 
- When updating schema in `src/db/schema.ts`:
  1. Generate the SQL migration file: `bunx drizzle-kit generate`
  2. Apply the migration locally: `bun run db:migrate`
- Migration output files MUST commit to source control in the `./drizzle` directory.

## 3. Database Instance Usage
- ALWAYS import the singleton database client from `@src/db/index.ts`.
- Database interactions inside Hono routes MUST use Drizzle query builders (`db.select()`, `db.insert()`, `db.update()`, `db.delete()`) for full TypeScript inference.