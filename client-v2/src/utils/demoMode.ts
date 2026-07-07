/** Demo credentials and hints are for local development only — hidden in production Cloud Run builds. */
export const showDemoCredentials = import.meta.env.DEV;

const DEMO_PASSWORD_PATTERN = /password123/i;

/** Strip demo emails/passwords from walkthrough step highlights in production. */
export function sanitizeWalkthroughHighlights(highlights?: string[]): string[] | undefined {
  if (!highlights || showDemoCredentials) return highlights;
  return highlights.filter((h) => !DEMO_PASSWORD_PATTERN.test(h) && !h.includes('@'));
}
