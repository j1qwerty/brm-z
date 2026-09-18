import { dataProvider } from './data/index'
import type { UserDoc } from './types'

/** Fire-and-forget in-app notification (bell). Never blocks the caller's mutation. */
export async function notify(userId: string, title: string, body: string, link?: string) {
  try {
    await dataProvider.create('notifications', { userId, title, body, link, readAt: null })
  } catch (e) {
    console.warn('notify failed', e)
  }
}

export async function notifyMany(userIds: string[], title: string, body: string, link?: string) {
  const unique = [...new Set(userIds)].filter(Boolean)
  if (!unique.length) return
  try {
    await dataProvider.bulkWrite(
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
  opts: { classStudentIds?: (classId: string) => Promise<string[]> } ,
): Promise<string[]> {
  const users = await dataProvider.list<UserDoc>('users')
  if (audience.type === 'all') return users.filter((u) => u.status === 'active').map((u) => u.id)
  if (audience.type === 'roles') return users.filter((u) => u.status === 'active' && audience.value.includes(u.role)).map((u) => u.id)
  // classes: students (users with studentId whose student doc is in class) + their parents
  const resolve = opts.classStudentIds
  const studentUsers: string[] = []
  const parentUsers: string[] = []
  const students = await dataProvider.list<{ id: string; parentUserId?: string }>('students')
  for (const classId of audience.value) {
    const ids = resolve ? await resolve(classId) : students.filter((s) => (s as { classId?: string }).classId === classId).map((s) => s.id)
    for (const u of users) {
      if (u.studentId && ids.includes(u.studentId)) studentUsers.push(u.id)
      if (u.childIds?.some((c) => ids.includes(c))) parentUsers.push(u.id)
    }
  }
  return [...studentUsers, ...parentUsers]
}
