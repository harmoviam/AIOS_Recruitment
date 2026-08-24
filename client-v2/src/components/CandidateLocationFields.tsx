import { useEffect, useRef, useState } from 'react';
import { getGoogleMapsApiKey, loadGoogleMaps } from '../lib/googleMapsLoader';

export interface CandidateLocationValue {
  current_location: string;
  latitude: number | null;
  longitude: number | null;
  relocation_allowed: boolean;
}

interface Props {
  value: CandidateLocationValue;
  onChange: (value: CandidateLocationValue) => void;
  disabled?: boolean;
}

/** City autocomplete for the candidate's current location with lat/lng capture. */
export default function CandidateLocationFields({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const [hint, setHint] = useState('');
  const apiKey = getGoogleMapsApiKey();

  onChangeRef.current = onChange;
  valueRef.current = value;

  // Bind Google Autocomplete once — re-binding on every keystroke stacks broken suggestion UI.
  useEffect(() => {
    if (!apiKey || !inputRef.current) {
      setHint(apiKey ? '' : 'Add VITE_GOOGLE_MAPS_API_KEY for address autocomplete.');
      return;
    }
    let cancelled = false;
    let listener: { remove: () => void } | null = null;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !inputRef.current || !window.google) return;
        const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
          types: ['geocode'],
          fields: ['formatted_address', 'geometry'],
        });
        listener = ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          if (!place.geometry?.location) return;
          const prev = valueRef.current;
          onChangeRef.current({
            current_location: place.formatted_address || prev.current_location,
            latitude: place.geometry.location.lat(),
            longitude: place.geometry.location.lng(),
            relocation_allowed: prev.relocation_allowed,
          });
        });
      })
      .catch((err: Error) => setHint(err.message));

    return () => {
      cancelled = true;
      listener?.remove();
    };
  }, [apiKey]);

  // Keep the input text in sync when parent loads/resets a candidate (not while composing).
  useEffect(() => {
    const el = inputRef.current;
    if (!el || document.activeElement === el) return;
    if (el.value !== value.current_location) {
      el.value = value.current_location;
    }
  }, [value.current_location]);

  return (
    <div className="candidate-location-fields">
      <div className="form-group">
        <label className="form-label" htmlFor="candidate-location">Current City</label>
        <input
          id="candidate-location"
          ref={inputRef}
          className="input-field"
          defaultValue={value.current_location}
          onChange={(e) =>
            onChangeRef.current({
              ...valueRef.current,
              current_location: e.target.value,
              // Typing clears pin until a Places suggestion is chosen.
              latitude: null,
              longitude: null,
            })
          }
          disabled={disabled}
          placeholder="Start typing a city, then pick a Google suggestion"
          autoComplete="off"
        />
        {hint && <p className="text-muted" style={{ fontSize: '0.85rem' }}>{hint}</p>}
        <p className="text-muted" style={{ fontSize: '0.85rem' }}>
          Choose a city from the suggestions to save its map coordinates.
        </p>
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={value.relocation_allowed}
          onChange={(e) => onChange({ ...value, relocation_allowed: e.target.checked })}
          disabled={disabled}
        />
        Ready to Relocate
      </label>
      {(value.latitude != null || value.longitude != null) && (
        <p className="text-muted" style={{ fontSize: '0.85rem' }}>
          Coordinates: {value.latitude?.toFixed(4) ?? '—'}, {value.longitude?.toFixed(4) ?? '—'}
        </p>
      )}
    </div>
  );
}
