// google-callback.html: see runCallbackPage in src/lib/googleAuth.ts.
import { CHANNEL_NAME, runCallbackPage, type StorageLike } from './lib/googleAuth'

const message = document.getElementById('message')!

// Safari can refuse storage in some privacy settings; only the Home Screen
// app's round trip needs it.
const storage: StorageLike = {
  getItem: (key) => {
    try {
      return sessionStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => {
    try {
      sessionStorage.removeItem(key)
    } catch {
      // Nothing stored, then.
    }
  },
}

runCallbackPage({
  hash: window.location.hash,
  storage,
  channel: new BroadcastChannel(CHANNEL_NAME),
  clearAddress: () => window.history.replaceState(null, '', window.location.pathname),
  go: (url) => window.location.replace(url),
  appUrl: new URL('./', window.location.href).href,
  show: (text) => {
    message.textContent = text
  },
  every: (tick, ms) => {
    const timer = window.setInterval(tick, ms)
    return () => window.clearInterval(timer)
  },
})
