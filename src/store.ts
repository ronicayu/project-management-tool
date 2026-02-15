import { Task, Project, ProjectStats } from './types'

const API = import.meta.env.VITE_API_URL ?? '/api'

async function request<T>(
  path: string,
  options?: RequestInit & { parseJson?: boolean }
): Promise<T> {
  const { parseJson = true, ...init } = options ?? {}
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `Request failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return parseJson ? (res.json() as Promise<T>) : (undefined as T)
}

export async function getProjects(): Promise<Project[]> {
  return request<Project[]>('/projects')
}

export async function getProjectStats(): Promise<ProjectStats[]> {
  return request<ProjectStats[]>('/projects/stats')
}

export async function createProject(name: string): Promise<Project> {
  return request<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function deleteProject(id: string): Promise<boolean> {
  await request(`/projects/${id}`, { method: 'DELETE', parseJson: false })
  return true
}

export async function getTasksByProjectId(projectId: string): Promise<Task[]> {
  return request<Task[]>(`/projects/${projectId}/tasks`)
}

export async function createTask(
  projectId: string,
  title: string,
  startDate: string | null,
  duration: number,
  parentId: string | null = null,
  dependencyIds: string[] = [],
  details: string = '',
  tags: string[] = []
): Promise<Task> {
  return request<Task>(`/projects/${projectId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      startDate: startDate || null,
      duration,
      parentId,
      dependencyIds,
      details,
      tags,
    }),
  })
}

export async function updateTask(
  id: string,
  updates: Partial<Pick<Task, 'title' | 'startDate' | 'duration' | 'parentId' | 'dependencyIds' | 'details' | 'tags'>>
): Promise<Task | null> {
  return request<Task | null>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function deleteTask(id: string): Promise<boolean> {
  await request(`/tasks/${id}`, { method: 'DELETE', parseJson: false })
  return true
}

export async function addChildTask(
  projectId: string,
  parentId: string,
  title: string,
  startDate: string | null,
  duration: number,
  details: string = '',
  tags: string[] = []
): Promise<Task> {
  return createTask(projectId, title, startDate, duration, parentId, [], details, tags)
}

export async function addDependency(
  taskId: string,
  dependsOnTaskId: string
): Promise<boolean> {
  await request(`/tasks/${taskId}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ dependsOnTaskId }),
  })
  return true
}

export async function removeDependency(
  taskId: string,
  dependsOnTaskId: string
): Promise<boolean> {
  await request(`/tasks/${taskId}/dependencies/${dependsOnTaskId}`, {
    method: 'DELETE',
    parseJson: false,
  })
  return true
}
