x
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
• primary-accent: #4285F4 (Buttons, active states, focus rings, selected items)
• surface-white: #FFFFFF (Page & container backgrounds)
• text-main: #1F1F1F (Headlines, primary list items)
• text-muted: #474747 (Metadata labels, path breadcrumbs, subtitles)
• border-light: #E3E3E3 (Subtle card borders, grid dividers)
2. Layout & Scaffolding
• Padding & Spacing: High breathability. Use standard container padding of p-8 (32px) or larger.
• Rounding: High rounded corners. Use rounded-[12px] for buttons, inputs, and small file item cards. Use rounded-[24px] for major containers, modals, and preview panels.
• Elevation: Minimal, soft floating shadows (shadow-sm or custom shadow-[0_2px_8px_rgba(0,0,0,0.06)]).
• Typography: Font family Inter or Roboto. Headings must use font-weight: 500 or 600 with tracking-tight. Body text uses font-weight: 400 with leading-relaxed (1.6).
3. Tailwind Implementation Tokens
• Primary Buttons: bg-[#4285F4] text-white px-6 py-3 rounded-full hover:bg-blue-600 transition-all font-medium
• Card Containers: bg-white border border-[#E3E3E3] rounded-[24px] shadow-sm p-6
• Drive Grid Item: bg-white border border-[#E3E3E3] rounded-[12px] p-4 hover:border-[#4285F4] hover:shadow-md transition-all cursor-pointer
## Backend & Database Guidelines
• Entry Point: Everything boots from /src/index.ts.
• Database Driver: Import directly via import { Database } from "bun:sqlite". Do not introduce heavy ORMs like Prisma unless explicitly requested.
• Production Build Serving: Hono must serve the compiled Vue static assets from ./dist in production, falling back to index.html for single-page app (SPA) client-side routing.
• Extensible Plugin Viewer API: Route streaming and rendering endpoints logically (/api/stream/:id, /api/metadata/:id). Vue frontend components will inspect file mime_type to mount the appropriate media viewer plugin component dynamically.
• Non-Destructive Scanning: Directory indexing must read, hash, and metadata-tag files without altering or moving original file paths on disk.
Would you like to generate the initial package.json file configured with Bun, Hono, Vue 3, and Vite next?

# UI & Vue 3 Design Constraints

## 1. UI Blueprint & Reference Components
- ALWAYS check existing components in `@src/components/ui` BEFORE creating new UI.
- Direct reference component for list cards: `@src/components/FileCard.vue`.
- Direct reference component for modals/popups: `@src/components/ModalShell.vue`.

## 2. Hard Styling Constraints
- DO NOT invent new color values or custom arbitrary Tailwind classes.
- Primary Accent: `bg-[#4285F4]` / `text-[#4285F4]`
- Standard Background: `bg-white` (Cards: `bg-[#F8F9FA]`)
- Text Primary: `text-[#1F1F1F]` | Text Muted: `text-[#5F6368]`
- Card Borders: `border border-[#E0E0E0] rounded-xl`

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