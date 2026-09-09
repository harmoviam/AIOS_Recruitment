import { useEffect } from 'react';

/**
 * Sets the document title and (optionally) meta description for public
 * careers pages so each page is shareable and SEO-friendly.
 */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title || 'Careers';
    let meta: HTMLMetaElement | null = null;
    if (description) {
      meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'description';
        document.head.appendChild(meta);
      }
      meta.content = description;
    }
    return () => {
      document.title = previous;
      meta?.remove();
    };
  }, [title, description]);
}