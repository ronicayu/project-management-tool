import { Task } from './types'

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

export async function getTasks(): Promise<Task[]> {
  return request<Task[]>('/tasks')
}

export async function createTask(
  title: string,
  startDate: string,
  duration: number,
  parentId: string | null = null,
  dependencyIds: string[] = []
): Promise<Task> {
  return request<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title,
      startDate,
      duration,
      parentId,
      dependencyIds,
    }),
  })
}

export async function updateTask(
  id: string,
  updates: Partial<Pick<Task, 'title' | 'startDate' | 'duration' | 'dependencyIds'>>
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
  parentId: string,
  title: string,
  startDate: string,
  duration: number
): Promise<Task> {
  return createTask(title, startDate, duration, parentId, [])
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
