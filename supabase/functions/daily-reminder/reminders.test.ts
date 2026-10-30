import { describe, expect, it } from 'vitest'
import { handleReminderRequest, reminderText, type DueDevice, type ReminderDeps } from './reminders.ts'

describe('reminderText', () => {
  it('counts the tasks for today and their projects', () => {
    expect(reminderText({ tasks: 3, projects: 2, overdue: 0 })).toBe('You have 3 tasks for 2 projects today')
    expect(reminderText({ tasks: 1, projects: 1, overdue: 0 })).toBe('You have 1 task for 1 project today')
  })

  it('adds the overdue ones at the end', () => {
    expect(reminderText({ tasks: 3, projects: 2, overdue: 1 })).toBe(
      'You have 3 tasks for 2 projects today, plus 1 overdue',
    )
    expect(reminderText({ tasks: 1, projects: 1, overdue: 4 })).toBe(
      'You have 1 task for 1 project today, plus 4 overdue',
    )
  })

  it('names only the overdue ones on a day with nothing else', () => {
    expect(reminderText({ tasks: 0, projects: 0, overdue: 1 })).toBe('You have 1 overdue task')
    expect(reminderText({ tasks: 0, projects: 0, overdue: 2 })).toBe('You have 2 overdue tasks')
  })

  it('has nothing to say on an empty day', () => {
    expect(reminderText({ tasks: 0, projects: 0, overdue: 0 })).toBeNull()
  })
})

describe('handleReminderRequest', () => {
  const TOKEN = 'the-reminder-token'

  function device(name: string, counts: Partial<DueDevice> = {}): DueDevice {
    return { endpoint: `https://push.example/${name}`, p256dh: 'key', auth: 'secret', tasks: 1, projects: 1, overdue: 0, ...counts }
  }

  function setUp(due: DueDevice[], refuse: Record<string, number> = {}) {
    const sent: { endpoint: string; payload: string }[] = []
    const forgotten: string[][] = []
    const logged: string[] = []
    let claims = 0
    const deps: ReminderDeps = {
      token: TOKEN,
      claim: async () => {
        claims++
        return due
      },
      send: async (subscription, payload) => {
        const status = refuse[subscription.endpoint]
        if (status) throw Object.assign(new Error('refused'), { statusCode: status })
        sent.push({ endpoint: subscription.endpoint, payload })
      },
      forget: async (endpoints) => void forgotten.push(endpoints),
      log: (message) => void logged.push(message),
    }
    return { deps, sent, forgotten, logged, claims: () => claims }
  }

  function call(token: string | null, method = 'POST') {
    const headers = new Headers()
    if (token !== null) headers.set('x-reminder-token', token)
    return new Request('https://project.supabase.co/functions/v1/daily-reminder', { method, headers })
  }

  it('refuses a call without the right token, before claiming anything', async () => {
    const { deps, claims } = setUp([device('phone')])
    expect((await handleReminderRequest(call(null), deps)).status).toBe(403)
    expect((await handleReminderRequest(call('wrong'), deps)).status).toBe(403)
    expect((await handleReminderRequest(call(`${TOKEN}x`), deps)).status).toBe(403)
    expect((await handleReminderRequest(call(TOKEN, 'GET'), deps)).status).toBe(405)
    expect(claims()).toBe(0)
  })

  it('refuses every call when no token is set up', async () => {
    const { deps, claims } = setUp([device('phone')])
    expect((await handleReminderRequest(call(''), { ...deps, token: undefined })).status).toBe(403)
    expect((await handleReminderRequest(call(''), { ...deps, token: '' })).status).toBe(403)
    expect(claims()).toBe(0)
  })

  it('sends each due device its own sentence', async () => {
    const { deps, sent } = setUp([
      device('phone', { tasks: 3, projects: 2, overdue: 1 }),
      device('laptop', { tasks: 0, projects: 0, overdue: 2 }),
    ])
    const response = await handleReminderRequest(call(TOKEN), deps)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ due: 2, sent: 2, gone: 0, failed: 0 })
    expect(sent).toEqual([
      {
        endpoint: 'https://push.example/phone',
        payload: JSON.stringify({ title: 'You have 3 tasks for 2 projects today, plus 1 overdue' }),
      },
      { endpoint: 'https://push.example/laptop', payload: JSON.stringify({ title: 'You have 2 overdue tasks' }) },
    ])
  })

  it('forgets devices the push service says are gone, and logs other refusals without the address', async () => {
    const { deps, sent, forgotten, logged } = setUp([device('phone'), device('deleted'), device('expired'), device('busy')], {
      'https://push.example/deleted': 410,
      'https://push.example/expired': 404,
      'https://push.example/busy': 429,
    })
    const response = await handleReminderRequest(call(TOKEN), deps)
    expect(await response.json()).toEqual({ due: 4, sent: 1, gone: 2, failed: 1 })
    expect(sent.map((s) => s.endpoint)).toEqual(['https://push.example/phone'])
    expect(forgotten).toEqual([['https://push.example/deleted', 'https://push.example/expired']])
    expect(logged).toEqual(['A push was refused (429).'])
  })

  it('does nothing more when no device is due', async () => {
    const { deps, sent, forgotten } = setUp([])
    expect(await (await handleReminderRequest(call(TOKEN), deps)).json()).toEqual({ due: 0, sent: 0, gone: 0, failed: 0 })
    expect(sent).toEqual([])
    expect(forgotten).toEqual([])
  })
})
