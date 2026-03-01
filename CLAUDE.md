# Project Management Tool - Technical Documentation

## Project Overview

A full-stack project management application with multiple views (List, Gantt, Timeline, Dependencies) for managing tasks with hierarchical structure and dependencies.

## Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **UI Library**: Ant Design (antd)
- **Date Handling**: date-fns
- **Build Tool**: Vite
- **Styling**: CSS modules + global styles

### Backend
- **Runtime**: Node.js
- **Framework**: Express
- **Database**: PostgreSQL
- **API Style**: REST

### Development
- **Package Manager**: npm
- **Dev Server**: Concurrent frontend (Vite) + backend (nodemon)

## Project Structure

```
project-management/
├── src/                          # Frontend source
│   ├── App.tsx                   # Main app component, routing, state
│   ├── types.ts                  # TypeScript interfaces (Task, Project)
│   ├── store.ts                  # API client functions
│   │
│   ├── TaskList.tsx              # List view with inline editing
│   ├── TaskList.css              # List view styles
│   ├── GanttView.tsx             # Gantt chart view
│   ├── GanttView.css             # Gantt styles
│   ├── TimelineView.tsx          # Timeline view
│   ├── TimelineView.css          # Timeline styles
│   ├── DependencyView.tsx        # Network graph of dependencies
│   ├── DependencyView.css        # Dependency view styles
│   │
│   ├── TaskDetailDrawer.tsx      # Side panel for task details
│   ├── TaskDetailDrawer.css      # Drawer styles
│   ├── CreateTaskForm.tsx        # Modal for creating new tasks
│   ├── CreateTaskForm.css        # Form styles
│   │
│   ├── utils/
│   │   └── dateUtils.ts          # Date calculations and formatting
│   │
│   ├── index.css                 # Global styles
│   └── main.tsx                  # App entry point
│
├── server/                       # Backend source
│   ├── dist/
│   │   └── index.js              # Compiled Express server
│   └── .env                      # Database connection config
│
├── design/
│   └── design.pen                # Design files
│
├── package.json                  # Dependencies and scripts
└── CLAUDE.md                     # This file
```

## Data Model

### Task
```typescript
interface Task {
  id: string
  title: string
  startDate: string | null        // ISO date YYYY-MM-DD or null
  duration: number                 // Days, minimum 1
  parentId: string | null          // For nested tasks
  dependencyIds: string[]          // Tasks that must complete first
  details: string                  // Description/notes
  tags: string[]                   // Labels
  createdAt: string
}
```

### Key Concepts

**End date is derived, not stored:**
```typescript
endDate = startDate + (duration - 1)  // Last day inclusive
```

**Status is computed from dates:**
- `not_started`: No start date or start in future
- `in_progress`: start ≤ today < end
- `done`: end ≤ today
- `active`: Parent task with mixed child statuses

**Hierarchy:**
- Tasks with `parentId: null` are top-level
- Tasks with `parentId: <id>` are children/subtasks
- Parents can have their own dates or derive from children

**Dependencies:**
- Stored as array of task IDs on the dependent task
- A depends on B: A has B's ID in `dependencyIds`
- Must prevent cycles

## Core Components

### App.tsx
- Main application component
- Manages global state (tasks, selected project, view mode)
- Handles all CRUD operations via `store.ts`
- Passes callbacks down to child components

### TaskList.tsx
- Displays tasks in hierarchical list
- Inline editing for all fields (name, status, dates, duration)
- Drag & drop for reparenting and creating dependencies
- Collapse/expand parent tasks

### GanttView.tsx
- Gantt chart visualization
- Drag bars to reschedule (update start date)
- Drag right edge to change duration
- Shows dependency lines between tasks
- Time unit switching (day/week/month/quarter)

### TimelineView.tsx
- Horizontal timeline with task bars
- Drag right edge to resize (change duration)
- Color-coded by status
- Groups by parent/child hierarchy

### DependencyView.tsx
- Network graph visualization
- Shows tasks as nodes, dependencies as directed edges
- Click to add/remove dependencies
- Prevents circular dependencies

### TaskDetailDrawer.tsx
- Side panel showing full task details
- Edit title, dates, duration, tags, details
- Add child tasks
- Add dependencies (existing or create new)

## Utilities

### dateUtils.ts

Key functions:
```typescript
getTaskEndDate(task): string | null
  // Returns last day (inclusive) as yyyy-MM-dd

durationFromEndDate(startDate, endDate): number
  // Computes duration from date range, min 1

getEffectiveTaskBounds(tasks, taskId)
  // Parent dates spanning all children

getProjectBounds(tasks)
  // Min/max dates for timeline/Gantt display

format(date, pattern): string
  // date-fns formatting, always use local time
```

### store.ts

API client functions:
```typescript
fetchProjects(): Promise<Project[]>
fetchTasks(projectId): Promise<Task[]>
createTask(...): Promise<Task>
updateTask(id, updates): Promise<Task | null>
deleteTask(id): Promise<boolean>
addDependency(taskId, dependsOnTaskId): Promise<boolean>
removeDependency(taskId, dependsOnTaskId): Promise<boolean>
```

## Architecture Patterns

### State Management
- Server is source of truth
- No local optimistic updates
- Flow: Component → handler → store API → backend → re-fetch
- `App.tsx` holds all task state, passes down via props

### Date Handling
- **Storage**: ISO strings `YYYY-MM-DD` (no time component)
- **Parsing**: Use `parseISO()` from date-fns (treats as local midnight)
- **Display**: Use `format()` from date-fns (local time)
- **⚠️ Critical**: Never use `toISOString().slice(0,10)` — causes timezone bugs

### Update Flow Example
```typescript
// User edits duration in TaskList
onUpdate(taskId, { duration: 5 })
  ↓
App.handleUpdateTask(taskId, { duration: 5 })
  ↓
store.updateTask(taskId, { duration: 5 })
  ↓
PATCH /api/tasks/:id { duration: 5 }
  ↓
Re-fetch tasks from server
  ↓
UI updates with new data
```

### Parent Task Aggregation
- Parents without their own dates: use `getEffectiveTaskBounds()` to span children
- Parents with children: status is aggregate (all done → done, any in progress → active)
- Display effective bounds in Gantt/Timeline, actual task bounds in details

## Development Commands

```bash
# Start both frontend and backend concurrently
npm run dev:all

# Frontend only (Vite dev server, port 5173)
npm run dev

# Backend only (Express server, port 3001)
npm run server

# Build for production
npm run build
```

## Database Schema

PostgreSQL database with three main tables:

### projects
```sql
id          UUID PRIMARY KEY
name        VARCHAR
created_at  TIMESTAMP
```

### tasks
```sql
id              UUID PRIMARY KEY
project_id      UUID REFERENCES projects(id)
title           VARCHAR
start_date      DATE (nullable)
duration        INTEGER (days, minimum 1)
parent_id       UUID REFERENCES tasks(id) (nullable)
details         TEXT
tags            JSONB (array of strings)
created_at      TIMESTAMP
```

### task_dependencies
```sql
task_id         UUID REFERENCES tasks(id)
depends_on_id   UUID REFERENCES tasks(id)
PRIMARY KEY (task_id, depends_on_id)
```

Connection configured in `server/.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

## API Endpoints

```
GET    /api/projects              # List all projects
GET    /api/projects/:id/tasks    # Get tasks for project
POST   /api/tasks                 # Create task
PATCH  /api/tasks/:id             # Update task
DELETE /api/tasks/:id             # Delete task
POST   /api/tasks/:id/dependencies           # Add dependency
DELETE /api/tasks/:id/dependencies/:depId    # Remove dependency
```

## Common Conventions

### Naming
- Components: PascalCase (e.g., `TaskList.tsx`)
- CSS classes: kebab-case with prefix (e.g., `.tl-row` for TaskList)
- Functions: camelCase
- Types/Interfaces: PascalCase

### CSS Structure
- Each major component has its own CSS file
- Global styles in `index.css`
- CSS custom properties for colors/fonts in `:root`

### Date Operations
- Always clamp duration to minimum 1
- Use `Math.max(1, duration)` when computing dates
- Format dates with `format(date, 'yyyy-MM-dd')` for storage
- Format dates with `format(date, 'MMM d, yyyy')` for display

---

**Last Updated**: February 2026
