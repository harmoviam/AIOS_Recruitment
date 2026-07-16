/** Minimal Google Maps JS API typings for Places + Map usage in the client. */
export interface GoogleLatLng {
  lat: () => number;
  lng: () => number;
}

export interface GoogleMapInstance {
  setCenter: (c: { lat: number; lng: number }) => void;
  setZoom?: (zoom: number) => void;
}

export interface GoogleMarkerInstance {
  setPosition: (c: { lat: number; lng: number }) => void;
  getPosition: () => GoogleLatLng;
  addListener: (event: string, fn: () => void) => GoogleMapsListener;
}

export interface GooglePlaceResult {
  formatted_address?: string;
  name?: string;
  geometry?: { location: GoogleLatLng };
  address_components?: { long_name: string; short_name: string; types: string[] }[];
}

export interface GoogleMapsListener {
  remove: () => void;
}

export interface GoogleAutocompleteInstance {
  addListener: (event: string, fn: () => void) => GoogleMapsListener;
  getPlace: () => GooglePlaceResult;
}

declare global {
  interface Window {
    gm_authFailure?: () => void;
    google?: {
      maps: {
        Map: new (el: HTMLElement, opts: object) => GoogleMapInstance;
        Marker: new (opts: object) => GoogleMarkerInstance;
        event?: { trigger: (instance: unknown, eventName: string) => void };
        places: {
          Autocomplete: new (input: HTMLInputElement, opts?: object) => GoogleAutocompleteInstance;
        };
      };
    };
  }
}

export {};
