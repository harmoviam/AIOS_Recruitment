import { useEffect, useRef, useState } from 'react';
import { getGoogleMapsApiKey, loadGoogleMaps } from '../lib/googleMapsLoader';
import type { GooglePlaceResult } from '../types/googleMaps.d.ts';

export interface JobLocationValue {
  address: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  country: string;
  pincode: string;
  locationLabel: string;
}

interface Props {
  value: Partial<JobLocationValue>;
  onChange: (value: JobLocationValue) => void;
  disabled?: boolean;
  /** Field label; defaults to "Address *". */
  label?: string;
  inputId?: string;
}

function component(place: GooglePlaceResult, type: string, short = false): string {
  const c = place.address_components?.find((x) => x.types.includes(type));
  return c ? (short ? c.short_name : c.long_name) : '';
}

function placeToLocation(place: GooglePlaceResult): JobLocationValue | null {
  if (!place.geometry?.location) return null;
  const lat = place.geometry.location.lat();
  const lng = place.geometry.location.lng();
  const city =
    component(place, 'locality') ||
    component(place, 'administrative_area_level_2') ||
    component(place, 'sublocality') ||
    '';
  const state = component(place, 'administrative_area_level_1');
  const country = component(place, 'country');
  const pincode = component(place, 'postal_code');
  const address = place.formatted_address || '';
  const locationLabel =
    [city, state].filter(Boolean).join(', ') ||
    address ||
    place.name ||
    '';
  return {
    address,
    latitude: lat,
    longitude: lng,
    city,
    state,
    country,
    pincode,
    locationLabel,
  };
}

export default function JobLocationPicker({
  value,
  onChange,
  disabled,
  label = 'Address *',
  inputId = 'job-address',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<import('../types/googleMaps.d.ts').GoogleMapInstance | null>(null);
  const markerRef = useRef<import('../types/googleMaps.d.ts').GoogleMarkerInstance | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const apiKey = getGoogleMapsApiKey();

  onChangeRef.current = onChange;
  valueRef.current = value;

  useEffect(() => {
    if (!apiKey) {
      setError('Set VITE_GOOGLE_MAPS_API_KEY in the project root .env, then restart the Vite client.');
      return;
    }

    let cancelled = false;
    let placeListener: { remove: () => void } | null = null;
    let dragListener: { remove: () => void } | null = null;

    const prevAuthFailure = (window as Window & { gm_authFailure?: () => void }).gm_authFailure;
    (window as Window & { gm_authFailure?: () => void }).gm_authFailure = () => {
      setError(
        'Google Maps authentication failed. In Google Cloud: enable Maps JavaScript API + Places API, enable billing, and allow HTTP referrer http://localhost:5174/* on the API key.'
      );
      setReady(false);
    };

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !inputRef.current || !mapRef.current || !window.google?.maps?.Map) {
          if (!cancelled) {
            setError('Google Maps Map API unavailable. Enable Maps JavaScript API in Google Cloud.');
          }
          return;
        }

        const startLat = valueRef.current.latitude ?? 12.9716;
        const startLng = valueRef.current.longitude ?? 77.5946;
        const center = { lat: startLat, lng: startLng };
        const hasPin = valueRef.current.latitude != null && valueRef.current.longitude != null;

        mapInstance.current = new window.google.maps.Map(mapRef.current, {
          center,
          zoom: hasPin ? 14 : 11,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        markerRef.current = new window.google.maps.Marker({
          map: mapInstance.current,
          position: center,
          draggable: !disabled,
          title: 'Drag to adjust pin',
        });

        // Map often paints blank until resize when mounted inside a freshly opened form.
        window.setTimeout(() => {
          if (cancelled || !mapInstance.current || !mapRef.current) return;
          const g = window.google;
          if (g?.maps && 'event' in g.maps && typeof (g.maps as { event?: { trigger: (m: unknown, e: string) => void } }).event?.trigger === 'function') {
            (g.maps as { event: { trigger: (m: unknown, e: string) => void } }).event.trigger(mapInstance.current, 'resize');
          }
          mapInstance.current.setCenter(center);
          markerRef.current?.setPosition(center);
        }, 150);

        dragListener = markerRef.current.addListener('dragend', () => {
          const pos = markerRef.current?.getPosition();
          if (!pos) return;
          const prev = valueRef.current;
          onChangeRef.current({
            address: prev.address || '',
            latitude: pos.lat(),
            longitude: pos.lng(),
            city: prev.city || '',
            state: prev.state || '',
            country: prev.country || '',
            pincode: prev.pincode || '',
            locationLabel: prev.locationLabel || '',
          });
        });

        const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
          fields: ['formatted_address', 'geometry', 'address_components', 'name'],
          types: ['geocode'],
        });

        placeListener = autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          const loc = placeToLocation(place);
          if (!loc) {
            setError('Select a full address from the Google suggestions list (not free text only).');
            return;
          }
          setError('');
          onChangeRef.current(loc);
          mapInstance.current?.setCenter({ lat: loc.latitude, lng: loc.longitude });
          mapInstance.current?.setZoom?.(14);
          markerRef.current?.setPosition({ lat: loc.latitude, lng: loc.longitude });
          if (inputRef.current) inputRef.current.value = loc.address;
        });

        if (valueRef.current.address && inputRef.current) {
          inputRef.current.value = valueRef.current.address;
        }

        setReady(true);
        setError('');
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load Google Maps');
        setReady(false);
      });

    return () => {
      cancelled = true;
      placeListener?.remove();
      dragListener?.remove();
      (window as Window & { gm_authFailure?: () => void }).gm_authFailure = prevAuthFailure;
    };
  }, [apiKey, disabled]);

  useEffect(() => {
    if (!ready || value.latitude == null || value.longitude == null) return;
    mapInstance.current?.setCenter({ lat: value.latitude, lng: value.longitude });
    markerRef.current?.setPosition({ lat: value.latitude, lng: value.longitude });
  }, [ready, value.latitude, value.longitude]);

  return (
    <div className="job-location-picker">
      <div className="form-group">
        <label className="form-label" htmlFor={inputId}>{label}</label>
        <input
          id={inputId}
          ref={inputRef}
          className="input-field"
          placeholder="Search address, then pick a Google suggestion…"
          defaultValue={value.address || ''}
          disabled={disabled || !apiKey}
          autoComplete="off"
        />
        <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
          Typing alone does not set coordinates — click a suggestion, or drag the map pin.
        </p>
      </div>
      {error && <p className="form-error" style={{ marginTop: '0.5rem' }}>{error}</p>}
      {!ready && !error && apiKey && (
        <p className="text-muted" style={{ fontSize: '0.85rem' }}>Loading map…</p>
      )}
      <div
        ref={mapRef}
        className={`job-location-map${ready ? ' is-ready' : ''}`}
        aria-label="Location map"
      />
      <div className="job-location-meta">
        <span>Lat: {value.latitude != null ? value.latitude.toFixed(5) : '—'}</span>
        <span>Lng: {value.longitude != null ? value.longitude.toFixed(5) : '—'}</span>
        <span>{value.city || '—'}, {value.state || '—'}</span>
        <span>{value.pincode || '—'}</span>
      </div>
    </div>
  );
}
