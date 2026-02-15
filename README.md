# TEU — Project Management

A lightweight project management tool with tasks, dependencies, subtasks, and Gantt/timeline views.

## Features

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

Create the `tasks` table (run once after first `up`):

```bash
docker-compose exec -T postgres psql -U teu -d teu < server/schema.sql
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
