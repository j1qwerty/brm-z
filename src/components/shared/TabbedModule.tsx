import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/toggle'
import { Badge } from '@/components/ui/display'
import { PageHeader } from './PageHeader'

export interface ModuleTab {
  key: string
  label: string
  badge?: number | string
  content: ReactNode
}

/**
 * Modules are grouped with tabs, not scattered pages (Hard Rule 7).
 * Tab state lives in the URL: /fees?tab=payments&student=...
 */
export function TabbedModule({
  title,
  info,
  description,
  tabs,
  defaultTab,
  actions,
  extraQueryKeys = [],
}: {
  title: string
  info?: ReactNode
  description?: string
  tabs: ModuleTab[]
  defaultTab?: string
  actions?: ReactNode
  extraQueryKeys?: string[]
}) {
  const [params, setParams] = useSearchParams()
  const active = params.get('tab') ?? defaultTab ?? tabs[0]?.key
  const valid = tabs.some((t) => t.key === active) ? active : tabs[0]?.key

  useEffect(() => {
    if (!params.get('tab') && valid) {
      setParams((p) => {
        p.set('tab', valid)
        return p
      }, { replace: true })
    }
  }, [params, valid, setParams])

  const switchTab = (key: string) => {
    setParams((p) => {
      p.set('tab', key)
      for (const k of extraQueryKeys) p.delete(k)
      return p
    })
  }

  return (
    <div>
      <PageHeader title={title} info={info} description={description} actions={actions} />
      <Tabs value={valid} onValueChange={switchTab}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              {t.badge !== undefined && t.badge !== 0 ? (
                <Badge variant="neutral" className="ml-1 h-4.5 min-w-4.5 px-1 text-[10px] tabular">{t.badge}</Badge>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-4">
            {t.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
