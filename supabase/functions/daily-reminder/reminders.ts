// What the daily-reminder function does, kept apart from Deno, Supabase and
// web-push (index.ts wires those in) so Vitest can test it with the app's
// tests. See docs/plans/notifications.md.

// A device whose reminder is due, with its counts, as claim_due_reminders()
// returns it.
export interface DueDevice {
  endpoint: string
  p256dh: string
  auth: string
  tasks: number
  projects: number
  overdue: number
}

export interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface ReminderDeps {
  // The reminder token the scheduled job sends; unset refuses every call.
  token: string | undefined
  claim: () => Promise<DueDevice[]>
  // Rejects with the push service's statusCode when it refuses.
  send: (subscription: PushSubscription, payload: string) => Promise<void>
  forget: (endpoints: string[]) => Promise<void>
  log: (message: string) => void
}

// 'You have 3 tasks for 2 projects today, plus 1 overdue', 'You have 2
// overdue tasks', or null when there's nothing to say.
export function reminderText({ tasks, projects, overdue }: Pick<DueDevice, 'tasks' | 'projects' | 'overdue'>): string | null {
  if (tasks === 0) return overdue === 0 ? null : `You have ${plural(overdue, 'overdue task')}`
  const today = `You have ${plural(tasks, 'task')} for ${plural(projects, 'project')} today`
  return overdue === 0 ? today : `${today}, plus ${overdue} overdue`
}

// The scheduled job's call: refuses anything without the reminder token,
// then claims the due devices and sends each one its sentence. Devices the
// push service says are gone are forgotten.
export async function handleReminderRequest(request: Request, deps: ReminderDeps): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const token = request.headers.get('x-reminder-token')
  if (!deps.token || !token || !sameText(token, deps.token)) return new Response('Forbidden', { status: 403 })

  const due = await deps.claim()
  let sent = 0
  let failed = 0
  const gone: string[] = []
  await Promise.all(
    due.map(async (device) => {
      const title = reminderText(device)
      if (!title) return
      try {
        await deps.send(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          JSON.stringify({ title }),
        )
        sent++
      } catch (error) {
        const status = statusOf(error)
        if (status === 404 || status === 410) {
          gone.push(device.endpoint)
        } else {
          failed++
          // Not the endpoint: it's the device's private address.
          deps.log(`A push was refused (${status ?? (error instanceof Error ? error.message : String(error))}).`)
        }
      }
    }),
  )
  if (gone.length > 0) await deps.forget(gone)
  return Response.json({ due: due.length, sent, gone: gone.length, failed })
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown } | null)?.statusCode
  return typeof status === 'number' ? status : undefined
}

// Compares in time that doesn't depend on where the texts first differ.
function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let difference = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) difference |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return difference === 0
}
