import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { NearbyCompaniesResponse } from '../types';

type DistanceFilter = '10' | '20' | '50' | '100';

interface Props {
  /** Fallback origin: load companies near this saved candidate. */
  candidateId?: number;
  /** Live coordinates (e.g. after a Places pick); take priority over candidateId. */
  latitude?: number | null;
  longitude?: number | null;
}

export default function NearbyCompaniesPanel({ candidateId, latitude, longitude }: Props) {
  const [data, setData] = useState<NearbyCompaniesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>('50');

  const hasCoords =
    latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude);
  const hasOrigin = hasCoords || candidateId != null;

  const load = useCallback(() => {
    if (!hasOrigin) {
      setData(null);
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const params = { max_distance_km: distanceFilter };

    const req = hasCoords
      ? api.getNearbyCompanies(latitude!, longitude!, params)
      : api.getCompaniesNearCandidate(candidateId!, params);

    req
      .then(setData)
      .catch((err: Error) => {
        setData(null);
        setError(err.message || 'Failed to load nearby companies');
      })
      .finally(() => setLoading(false));
  }, [candidateId, latitude, longitude, distanceFilter, hasOrigin, hasCoords]);

  useEffect(() => {
    load();
  }, [load]);

  if (!hasOrigin) {
    return (
      <section className="nearby-companies-section">
        <div className="nearby-companies-head">
          <div>
            <h3 className="card-heading">Nearby Companies</h3>
            <p className="text-muted">
              Select the candidate&apos;s stay location on Google Maps to see companies nearby.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const companies = data?.companies ?? [];

  return (
    <section className="nearby-companies-section">
      <div className="nearby-companies-head">
        <div>
          <h3 className="card-heading">Nearby Companies</h3>
          <p className="text-muted">Companies near the candidate&apos;s stay location.</p>
        </div>
        <select
          className="input-field filter-select"
          value={distanceFilter}
          onChange={(e) => setDistanceFilter(e.target.value as DistanceFilter)}
          aria-label="Maximum distance"
        >
          <option value="10">Within 10 KM</option>
          <option value="20">Within 20 KM</option>
          <option value="50">Within 50 KM</option>
          <option value="100">Within 100 KM</option>
        </select>
      </div>

      {loading && <p className="text-muted">Finding nearby companies…</p>}
      {error && <p className="text-muted nearby-companies-msg">{error}</p>}

      {!loading && !error && companies.length === 0 && (
        <p className="text-muted nearby-companies-msg">
          No companies with a map pin within {distanceFilter} km.{' '}
          <Link to="/companies">Add company locations</Link>
        </p>
      )}

      {!loading && companies.length > 0 && (
        <ul className="company-name-list">
          {companies.map((co) => (
            <li key={co.id}>
              <span className="company-name-list-name">{co.name}</span>
              <span className="company-name-list-meta">{co.distance_km} km</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
