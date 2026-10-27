import { useSyncExternalStore } from 'react'

// Below Tailwind's md breakpoint: the phone layout. Keep in step with the
// max-md: classes and the 767px media query in index.css.
export const PHONE_QUERY = '(max-width: 767px)'

// Whether a CSS media query matches, updating as it changes (rotating the
// phone, resizing the window). False when rendering outside a browser.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
