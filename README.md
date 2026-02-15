# TEU — Project Management

A lightweight project management tool with tasks, dependencies, subtasks, and Gantt/timeline views.

## Features

- **Projects** — Create projects; open one to manage its tasks.
- **Create task** — Add tasks with title, start date, and duration (days).
- **Dependencies** — Link tasks so one cannot start until others are done.
- **Child tasks** — Break work into subtasks under a parent.
- **Start date & duration** — Set when each task starts and how many days it takes.
- **Timeline view** — See all tasks on a time axis.
- **Gantt chart** — Classic Gantt view with dependency lines and drag-to-reschedule.

Data is stored in **PostgreSQL**.

## Setup

### 1. PostgreSQL (Docker, with persistent volume)

```bash
docker-compose up -d
```

Data is stored in the `teu_pgdata` volume. Use:

```bash
# Stop (data is kept)
docker-compose down

# Stop and remove volume (deletes all data)
docker-compose down -v
```

Create tables (run once after first `up`). **New installs:**

```bash
npm run db:init
```

**If you already had tasks** (no projects yet), run the migration instead:

```bash
npm run db:migrate
```

Set in `server/.env`:

```env
DATABASE_URL=postgresql://teu:teu@localhost:5435/teu
```

### 2. Run the app

From the project root:

```bash
npm install
npm run dev:all
```

- Frontend: http://localhost:5173 (Vite proxies `/api` to the server)
- API: http://localhost:3001

Or run separately:

```bash
# Terminal 1 – API
cd server && npm run dev

# Terminal 2 – Frontend (set VITE_API_URL or use proxy)
npm run dev
```

Open http://localhost:5173

## Build

```bash
npm run build
cd server && npm run build
```

Production: set `PORT` and `DATABASE_URL` for the server; serve the frontend `dist/` with any static host.

## Deploy to Vercel (single project)

One Vercel project serves both the frontend and the API (serverless). No separate backend host.

1. **Database** — Add Postgres (Vercel Postgres in the dashboard, or Neon/Supabase/etc.). In the Vercel project, set **`DATABASE_URL`** (or **`POSTGRES_URL`** if using Vercel Postgres) to the connection string.
2. **Schema** — Run the schema once against that database: `psql $DATABASE_URL -f server/schema.sql` (or use your provider’s SQL runner).
3. **Deploy** — Connect the repo to Vercel. Build command: `npm run build`. Do not set `VITE_API_URL`; the app uses `/api` on the same origin.
