/**
 * Create a user (Auth + users doc) directly, bypassing the approval flow.
 * Usage: pnpm users:create -- --email principal@school.in --password StrongPass! --name "School Admin" --role admin
 */
import 'dotenv/config'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import admin from 'firebase-admin'

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v]
  }),
)

const email = args.email
const password = args.password
const name = args.name ?? 'BMRC User'
const role = args.role ?? 'student'

if (!email || !password) {
  console.error('Usage: pnpm users:create -- --email you@school.in --password "StrongPass!" --name "Full Name" --role admin')
  process.exit(1)
}
if (!['admin', 'teacher', 'accountant', 'staff', 'student', 'parent'].includes(role)) {
  console.error(`Invalid role "${role}". Use: admin, teacher, accountant, staff, student, parent`)
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
    console.log(`Auth user already exists (${user.uid}), updating password...`)
    await admin.auth().updateUser(user.uid, { password, displayName: name })
  } catch {
    user = await admin.auth().createUser({ email, password, displayName: name, emailVerified: true })
    console.log(`Auth user created (${user.uid})`)
  }
  await admin.firestore().collection('users').doc(user.uid).set(
    {
      id: user.uid, name, email, role, status: 'active',
      createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null, deletedBy: null,
    },
    { merge: true },
  )
  console.log(`users doc written: ${email} → ${role} (active). They can sign in immediately.`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
