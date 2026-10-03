import type { DataProvider } from './data/provider'
import type { UserDoc } from './types'

// Lazy singleton: importing './data/index' statically would pull firebase.ts
// (import.meta.env) at module load, which breaks pure-Node test runs.
// Resolved only when a caller doesn't inject a provider (tests always do).
async function defaultProvider(): Promise<DataProvider> {
  return (await import('./data/index')).dataProvider
}

/** Fire-and-forget in-app notification (bell). Never blocks the caller's mutation.
 *  The trailing provider param defaults to the app singleton; tests inject memory. */
export async function notify(userId: string, title: string, body: string, link?: string, provider?: DataProvider) {
  const db = provider ?? await defaultProvider()
  try {
    await db.create('notifications', { userId, title, body, link, readAt: null })
  } catch (e) {
    console.warn('notify failed', e)
  }
}

export async function notifyMany(userIds: string[], title: string, body: string, link?: string, provider?: DataProvider) {
  const unique = [...new Set(userIds)].filter(Boolean)
  if (!unique.length) return
  const db = provider ?? await defaultProvider()
  try {
    await db.bulkWrite(
      'notifications',
      unique.map((userId) => ({ data: { userId, title, body, link, readAt: null } })),
    )
  } catch (e) {
    console.warn('notifyMany failed', e)
  }
}

/** Build a userId list from a notice audience definition. */
export async function audienceUserIds(
  audience: { type: 'all' | 'roles' | 'classes'; value: string[] },
  opts: { classStudentIds?: (classId: string) => Promise<string[]> },
  provider?: DataProvider,
): Promise<string[]> {
  const db = provider ?? await defaultProvider()
  const users = await db.list<UserDoc>('users')
  if (audience.type === 'all') return users.filter((u) => u.status === 'active').map((u) => u.id)
  if (audience.type === 'roles') return users.filter((u) => u.status === 'active' && audience.value.includes(u.role)).map((u) => u.id)
  // classes: students (users with studentId whose student doc is in class) + their parents
  const resolve = opts.classStudentIds
  const studentUsers: string[] = []
  const parentUsers: string[] = []
  const students = await db.list<{ id: string; parentUserId?: string }>('students')
  for (const classId of audience.value) {
    const ids = resolve ? await resolve(classId) : students.filter((s) => (s as { classId?: string }).classId === classId).map((s) => s.id)
    for (const u of users) {
      if (u.studentId && ids.includes(u.studentId)) studentUsers.push(u.id)
      if (u.childIds?.some((c) => ids.includes(c))) parentUsers.push(u.id)
    }
  }
  return [...studentUsers, ...parentUsers]
}
