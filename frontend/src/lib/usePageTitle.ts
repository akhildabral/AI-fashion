import { useEffect } from 'react'

const APP_NAME = 'AI Fashion'

/**
 * Sets the document title for the current page ("Closet · AI Fashion"),
 * restoring the bare app name on unmount so stale titles never linger.
 */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
    return () => {
      document.title = APP_NAME
    }
  }, [title])
}
