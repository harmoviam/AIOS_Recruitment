import { useEffect } from 'react';

const DEFAULT_OG_IMAGE = '/og-default.png';

interface TagDef {
  name?: string;
  property?: string;
  content: string;
}

function setTag(tag: TagDef): HTMLMetaElement {
  const selector = tag.property
    ? `meta[property="${tag.property}"]`
    : `meta[name="${tag.name}"]`;
  let el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    if (tag.property) el.setAttribute('property', tag.property);
    if (tag.name) el.setAttribute('name', tag.name);
    document.head.appendChild(el);
  }
  el.content = tag.content;
  return el;
}

function setLinkTag(rel: string, href: string): HTMLLinkElement {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.href = href;
  return el;
}

function setScriptTag(json: string): HTMLScriptElement {
  let el = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = json;
  return el;
}

interface UsePageMetaOptions {
  image?: string;
  type?: 'website' | 'article';
  canonicalUrl?: string;
  jsonLd?: object;
}

export function usePageMeta(
  title: string,
  description?: string,
  options?: UsePageMetaOptions
) {
  useEffect(() => {
    const previous = document.title;
    const previousOgTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || '';
    const previousOgDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content || '';
    const previousOgImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || '';
    const previousOgUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content || '';
    const previousTwitterTitle = document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.content || '';
    const previousTwitterDescription = document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.content || '';
    const previousTwitterImage = document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]')?.content || '';
    const previousCanonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || '';
    const previousJsonLd = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]')?.textContent || '';

    document.title = title || 'Careers';

    const rawUrl = options?.canonicalUrl || (typeof window !== 'undefined' ? window.location.href : '');
    const url = rawUrl.split('?')[0].split('#')[0];
    const image = options?.image || DEFAULT_OG_IMAGE;
    const siteName = title;

    const tags: TagDef[] = [
      { name: 'description', content: description || '' },
      { property: 'og:title', content: title || siteName },
      { property: 'og:description', content: description || '' },
      { property: 'og:url', content: url },
      { property: 'og:type', content: options?.type || 'website' },
      { property: 'og:site_name', content: siteName },
      { property: 'og:image', content: image },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title || siteName },
      { name: 'twitter:description', content: description || '' },
      { name: 'twitter:image', content: image },
    ];
    const managedElements: (HTMLMetaElement | HTMLLinkElement | HTMLScriptElement)[] = [];
    for (const tag of tags) managedElements.push(setTag(tag));
    managedElements.push(setLinkTag('canonical', url));

    if (options?.jsonLd) {
      managedElements.push(setScriptTag(JSON.stringify(options.jsonLd)));
    }

    return () => {
      document.title = previous;
      const ogTags = [
        { property: 'og:title', prev: previousOgTitle },
        { property: 'og:description', prev: previousOgDescription },
        { property: 'og:image', prev: previousOgImage },
        { property: 'og:url', prev: previousOgUrl },
        { name: 'twitter:title', prev: previousTwitterTitle },
        { name: 'twitter:description', prev: previousTwitterDescription },
        { name: 'twitter:image', prev: previousTwitterImage },
      ];
      for (const { property, name, prev } of ogTags) {
        const el = document.querySelector<HTMLMetaElement>(
          property ? `meta[property="${property}"]` : `meta[name="${name}"]`
        );
        if (el) {
          if (prev) {
            el.content = prev;
          } else {
            el.remove();
          }
        }
      }
      const canonicalEl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (canonicalEl) {
        if (previousCanonical) {
          canonicalEl.href = previousCanonical;
        } else {
          canonicalEl.remove();
        }
      }
      const jsonLdEl = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
      if (jsonLdEl) {
        if (previousJsonLd) {
          jsonLdEl.textContent = previousJsonLd;
        } else {
          jsonLdEl.remove();
        }
      }
    };
  }, [title, description, options?.image, options?.canonicalUrl, options?.type, options?.jsonLd]);
}
