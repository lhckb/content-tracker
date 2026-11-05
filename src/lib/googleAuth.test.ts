import { describe, expect, it } from 'vitest'
import { authUrl, parseAuthResult, runCallbackPage, type ChannelLike } from './googleAuth'

describe('Google’s answer', () => {
  it('reads a token, its lifetime and scopes', () => {
    expect(
      parseAuthResult('#state=s1&access_token=ya29.x&token_type=Bearer&expires_in=3599&scope=email%20profile'),
    ).toEqual({ state: 's1', accessToken: 'ya29.x', expiresIn: 3599, scope: 'email profile' })
  })

  it('reads a refusal, and a page opened with only its state', () => {
    expect(parseAuthResult('#error=access_denied&state=s1')).toEqual({ state: 's1', error: 'access_denied' })
    expect(parseAuthResult('#state=s2')).toEqual({ state: 's2' })
  })

  it('is nothing without a state', () => {
    expect(parseAuthResult('')).toBeNull()
    expect(parseAuthResult('#access_token=ya29.x')).toBeNull()
  })

  it('leaves out the account hint when there’s no email', () => {
    const url = new URL(authUrl({ clientId: 'c', redirectUri: 'https://app.example/cb', state: 's', email: '' }))
    expect(url.searchParams.has('login_hint')).toBe(false)
  })
})

describe('the callback page', () => {
  function page(hash: string) {
    const posted: unknown[] = []
    const listeners: ((event: MessageEvent) => void)[] = []
    const channel: ChannelLike = {
      postMessage: (message) => void posted.push(message),
      addEventListener: (_type, listener) => void listeners.push(listener),
    }
    const result = { posted, went: [] as string[], shown: [] as string[], cleared: false }
    runCallbackPage({
      hash,
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      channel,
      clearAddress: () => void (result.cleared = true),
      go: (url) => void result.went.push(url),
      appUrl: 'https://app.example/',
      show: (message) => void result.shown.push(message),
      every: () => () => {},
    })
    const answer = (data: unknown) => listeners.forEach((listener) => listener({ data } as MessageEvent))
    return { ...result, answer }
  }

  it('opened by hand: says what it is, and asks nothing', () => {
    const opened = page('')
    expect(opened.cleared).toBe(true)
    expect(opened.shown).toEqual(["This page is part of Content Tracker's Google Docs. You can close it."])
    expect(opened.posted).toEqual([])
  })

  it('hands Google’s answer to the app once, with the state', () => {
    const opened = page('#state=s1&access_token=ya29.x&scope=x')
    expect(opened.posted).toEqual([
      { type: 'ready', state: 's1', result: { state: 's1', accessToken: 'ya29.x', scope: 'x' } },
    ])
  })

  it('ignores answers for other requests, and won’t go anywhere but a Google Doc', () => {
    const opened = page('#state=s1')
    opened.answer({ type: 'status', state: 'other', docId: 'abc' })
    expect(opened.went).toEqual([])
    opened.answer({ type: 'status', state: 's1', docId: '../../elsewhere' })
    expect(opened.went).toEqual([])
    expect(opened.shown.at(-1)).toMatch(/didn’t expect/)
  })

  it('keeps waiting while the app is still working', () => {
    const opened = page('#state=s1')
    opened.answer({ type: 'status', state: 's1' })
    expect(opened.shown).toEqual(['Making the Google Doc…'])
    opened.answer({ type: 'status', state: 's1', docId: 'doc-1' })
    expect(opened.went).toEqual(['https://docs.google.com/document/d/doc-1/edit'])
  })
})
