import { can } from '@/lib/permissions'
import { useAuth } from '@/lib/auth'
import { TabbedModule } from '@/components/shared/TabbedModule'
import { useList } from '@/lib/data/hooks'
import type { ClassDoc } from '@/lib/types'
import { StudentsTable } from './students'
import { StaffTable } from './staff'
import { ParentsTable } from './parents'

export default function PeoplePage() {
  const { user } = useAuth()
  const { data: classes } = useList<ClassDoc>('classes')
  const isTeacher = user?.role === 'teacher'


  return (
    <TabbedModule
      title="People"
      info="Everything about people in the school: students, teachers, non-teaching staff and parent accounts. Every list can be filtered, exported to CSV and bulk-deleted (to Trash - nothing is ever permanently removed)."
      tabs={[
        {
          key: 'students',
          label: 'Students',
          content: can(user?.role, 'people.manage') ? (
            <StudentsTable classes={classes ?? []} />
          ) : (
            <ScopedStudentsNotice isTeacher={isTeacher} />
          ),
        },
        { key: 'teachers', label: 'Teachers', content: <StaffTable staffType="teaching" /> },
        { key: 'staff', label: 'Staff', content: <StaffTable staffType="nonteaching" /> },
        {
          key: 'parents',
          label: 'Parents',
          content: can(user?.role, 'people.manage') ? (
            <ParentsTable classes={classes ?? []} />
          ) : (
            <ScopedStudentsNotice isTeacher={isTeacher} />
          ),
        },
      ]}
    />
  )
}

function ScopedStudentsNotice({ isTeacher }: { isTeacher?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
      {isTeacher ? (
        <>
          As a class teacher you have full access to your own classes. Open a student's profile from the dashboard or the attendance register.
          Editing of school-wide records is limited to the admin.
        </>
      ) : (
        <>
          Your role has read-limited access to people records. The admin manages records here; you can find the people you need from the
          dashboard or the search palette (Ctrl K).
        </>
      )}
    </div>
  )
}
