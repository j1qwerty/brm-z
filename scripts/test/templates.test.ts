/**
 * Templates CRUD test suite.
 *
 * Verifies the template kinds, layoutJson shape, the make-default logic
 * (exactly one default per kind), and the create+edit+delete cycle.
 * Mirrors src/features/templates/TemplatesPage.tsx.
 */
import type { SuiteContext, AssertAPI, TestResult } from './harness'
import { runSuite } from './harness'
import type { TemplateDoc } from '../../src/lib/types'

export function templatesSuite() {
  return {
    name: 'Templates',
    run: async (ctx: SuiteContext, results: TestResult[]) => {
      const p = ctx.provider
      ctx.resetDb()

      const tests = [
        {
          name: 'create idcard-student template with empty layout',
          run: async (t: AssertAPI) => {
            const id = await p.create(
              'templates',
              {
                kind: 'idcard-student',
                name: 'New ID card',
                images: { logo: '', background: '', extra1: '' },
                isDefault: false,
                layoutJson: { page: { w: 640, h: 400 }, elements: [] },
              },
            )
            const got = await p.get<TemplateDoc>('templates', id)
            t.equals(got!.kind, 'idcard-student', 'kind matches')
            t.equals(got!.name, 'New ID card', 'name matches')
            t.deepEquals(got!.layoutJson.page, { w: 640, h: 400 }, 'page dimensions match')
            t.deepEquals(got!.layoutJson.elements, [], 'elements array empty on new template')
            t.equals(got!.isDefault, false, 'isDefault false on create')
          },
        },
        {
          name: 'update layout elements via update',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const id = await p.create('templates', {
              kind: 'receipt',
              name: 'Receipt v1',
              images: {},
              isDefault: false,
              layoutJson: { page: { w: 420, h: 600 }, elements: [] },
            })
            await p.update('templates', id, {
              layoutJson: {
                page: { w: 420, h: 600 },
                elements: [
                  { id: 'e-1', type: 'name', label: 'Student name', x: 20, y: 20, w: 200, h: 30, fontSize: 14 },
                ],
              },
            })
            const got = await p.get<TemplateDoc>('templates', id)
            t.equals(got!.layoutJson.elements.length, 1, 'one element added')
            t.equals(got!.layoutJson.elements[0].label, 'Student name', 'element label correct')
          },
        },
        {
          name: 'list filters templates by kind',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('templates', { kind: 'idcard-student', name: 'A', images: {}, isDefault: false, layoutJson: { page: { w: 640, h: 400 }, elements: [] } }, 't-a')
            await p.create('templates', { kind: 'idcard-teacher', name: 'B', images: {}, isDefault: false, layoutJson: { page: { w: 640, h: 400 }, elements: [] } }, 't-b')
            await p.create('templates', { kind: 'idcard-student', name: 'C', images: {}, isDefault: false, layoutJson: { page: { w: 640, h: 400 }, elements: [] } }, 't-c')
            const idStudent = await p.list<TemplateDoc>('templates', { where: [['kind', '==', 'idcard-student']] })
            t.equals(idStudent.length, 2, 'two idcard-student templates')
          },
        },
        {
          name: 'make-default flow: only one default per kind at a time',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            await p.create('templates', { kind: 'idcard-student', name: 'A', images: {}, isDefault: true, layoutJson: { page: { w: 640, h: 400 }, elements: [] } }, 't-d1')
            await p.create('templates', { kind: 'idcard-student', name: 'B', images: {}, isDefault: false, layoutJson: { page: { w: 640, h: 400 }, elements: [] } }, 't-d2')
            const all = await p.list<TemplateDoc>('templates', { where: [['kind', '==', 'idcard-student']] })
            for (const tpl of all) {
              if (tpl.isDefault && tpl.id !== 't-d2') {
                await p.update('templates', tpl.id, { isDefault: false })
              }
            }
            await p.update('templates', 't-d2', { isDefault: true })
            const after = await p.list<TemplateDoc>('templates', { where: [['kind', '==', 'idcard-student']] })
            const defaults = after.filter((t) => t.isDefault)
            t.equals(defaults.length, 1, 'exactly one default')
            t.equals(defaults[0].id, 't-d2', 'the new template is the default')
          },
        },
        {
          name: 'soft-delete template hides from list',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const id = await p.create('templates', { kind: 'certificate', name: 'Bonafide', images: {}, isDefault: false, layoutJson: { page: { w: 1000, h: 700 }, elements: [] } }, 't-del')
            await p.softDelete('templates', id, 'u-admin')
            const list = await p.list<TemplateDoc>('templates')
            t.equals(list.length, 0, 'deleted template hidden from default list')
            const trash = await p.listDeleted<TemplateDoc>('templates')
            t.equals(trash.length, 1, 'template in trash')
          },
        },
        {
          name: 'update template name and images',
          run: async (t: AssertAPI) => {
            ctx.resetDb()
            const id = await p.create('templates', { kind: 'receipt', name: 'Old', images: { logo: '', background: '', extra1: '' }, isDefault: false, layoutJson: { page: { w: 420, h: 600 }, elements: [] } }, 't-upd')
            await p.update('templates', id, { name: 'New Name', images: { logo: 'https://x.com/logo.png', background: '', extra1: '' } })
            const got = await p.get<TemplateDoc>('templates', id)
            t.equals(got!.name, 'New Name', 'name updated')
            t.equals(got!.images.logo, 'https://x.com/logo.png', 'logo updated')
          },
        },
      ]

      console.log(`\n${'Templates'.toUpperCase()} suite`)
      await runSuite('Templates', ctx, tests, results)
    },
  }
}
