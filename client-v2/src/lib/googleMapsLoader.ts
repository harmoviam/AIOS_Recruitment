/** Shared Google Maps JS loader (Maps + Places). */

let mapsScriptPromise: Promise<void> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps?.places && window.google.maps.Map) {
    return Promise.resolve();
  }
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-aios-google-maps]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps')));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.aiosGoogleMaps = '1';
    script.onload = () => {
      if (!window.google?.maps?.Map) {
        reject(new Error('Google Maps loaded but Map API is unavailable. Enable Maps JavaScript API.'));
        return;
      }
      resolve();
    };
    script.onerror = () => {
      mapsScriptPromise = null;
      reject(new Error('Failed to load Google Maps script'));
    };
    document.head.appendChild(script);
  });

  return mapsScriptPromise;
}

export function getGoogleMapsApiKey(): string | undefined {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  return key?.trim() || undefined;
}
