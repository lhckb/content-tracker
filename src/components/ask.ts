// A yes/no question in the app's own dialog (see ConfirmHost), in place of
// the browser's confirm(). Without a host on screen, as in tests, it falls
// back to confirm().

export interface Question {
  message: string
  confirmLabel: string
  danger: boolean
  answer: (yes: boolean) => void
}

let show: ((question: Question) => void) | null = null

export function registerConfirmHost(host: (question: Question) => void): () => void {
  show = host
  return () => {
    if (show === host) show = null
  }
}

export function ask(
  message: string,
  { confirmLabel = 'OK', danger = false }: { confirmLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  const host = show
  if (!host) return Promise.resolve(confirm(message))
  return new Promise((resolve) => host({ message, confirmLabel, danger, answer: resolve }))
}
