// A Google Doc is remembered by its Drive file id: letters, digits, "-" and
// "_". The link is built from it when shown, never stored. Checking the id
// keeps a damaged backup or row from turning into a link somewhere else.
// supabase/migrations/20261103120000_google_docs.sql checks the same.
const DOC_ID = /^[A-Za-z0-9_-]{1,200}$/

export function isDocId(value: unknown): value is string {
  return typeof value === 'string' && DOC_ID.test(value)
}

export function docUrl(docId: string): string {
  return `https://docs.google.com/document/d/${encodeURIComponent(docId)}/edit`
}
