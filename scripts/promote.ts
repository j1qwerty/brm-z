/**
 * Promote (or demote) an existing user's role, or approve/suspend.
 * Usage:
 *   pnpm users:promote -- --email someone@school.in --role admin
 *   pnpm users:promote -- --email someone@school.in --status active
 */
import 'dotenv/config'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as admin from 'firebase-admin'

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v]
  }),
)

const email = args.email
const role = args.role
const status = args.status

if (!email || (!role && !status)) {
  console.error('Usage: pnpm users:promote -- --email someone@school.in --role admin  (or --status active|suspended|pending)')
  process.exit(1)
}
if (role && !['admin', 'teacher', 'accountant', 'staff', 'student', 'parent'].includes(role)) {
  console.error(`Invalid role "${role}".`)
  process.exit(1)
}
if (status && !['active', 'suspended', 'pending'].includes(status)) {
  console.error(`Invalid status "${status}".`)
  process.exit(1)
}

const serviceAccountPath = resolve(process.env.SERVICE_ACCOUNT_PATH ?? './scripts/service-account.json')
if (!existsSync(serviceAccountPath)) {
  console.error('Service account key missing. See README "Firebase setup".')
  process.exit(1)
}
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: process.env.FIREBASE_PROJECT_ID ?? serviceAccount.project_id })

async function main() {
  let user
  try {
    user = await admin.auth().getUserByEmail(email)
  } catch {
    console.error(`No auth user with email ${email}. Create one first with users:create.`)
    process.exit(1)
  }
  const patch: Record<string, unknown> = { updatedAt: Date.now() }
  if (role) patch.role = role
  if (status) patch.status = status
  await admin.firestore().collection('users').doc(user.uid).set(patch, { merge: true })
  console.log(`Updated ${email}: ${role ? `role → ${role}` : ''}${role && status ? ', ' : ''}${status ? `status → ${status}` : ''}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
