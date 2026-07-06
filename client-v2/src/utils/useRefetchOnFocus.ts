import { useEffect, useRef } from 'react';

/**
 * Re-runs `refetch` whenever the window regains focus or the tab becomes
 * visible again, so pages pick up changes made elsewhere (e.g. Kanban stage
 * moves in another tab) without a manual reload.
 */
export function useRefetchOnFocus(refetch: () => void) {
  const ref = useRef(refetch);
  ref.current = refetch;

  useEffect(() => {
    const onFocus = () => ref.current();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') ref.current();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
