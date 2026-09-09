import { EXPERIENCE_BUCKETS, EMPLOYMENT_TYPES, POSTED_BUCKETS, SALARY_BUCKETS, type Filters } from './careers';

export interface FilterCounts {
  cities: Record<string, number>;
  industries: Record<string, number>;
  skills: Record<string, number>;
  employment: Record<string, number>;
  workModes: Record<string, number>;
}

interface JobFiltersProps {
  filters: Filters;
  counts: FilterCounts;
  onChange: (next: Filters) => void;
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Filter sections shared by the desktop sidebar and the mobile bottom sheet. */
export default function JobFilters({ filters, counts, onChange }: JobFiltersProps) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const reset = () =>
    onChange({
      cities: [],
      states: [],
      industries: [],
      employment: [],
      workModes: [],
      skills: [],
      experienceBucket: '',
      salaryBucket: '',
      postedBucket: '',
    });

  const multi = (
    title: string,
    key: keyof Pick<Filters, 'cities' | 'industries' | 'skills' | 'employment' | 'workModes'>,
    options: string[],
    countsFor: Record<string, number>
  ) => (
    <div className="careers-filter-group">
      <h4 className="careers-filter-title">{title}</h4>
      <div className="careers-filter-opts">
        {options.map((opt) => {
          const selected = filters[key].includes(opt);
          const cnt = countsFor[opt];
          return (
            <label key={opt} className="careers-filter-opt">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => set({ [key]: toggle(filters[key], opt) })}
              />
              <span>{opt}</span>
              {cnt != null && <span className="cnt">{cnt}</span>}
            </label>
          );
        })}
      </div>
    </div>
  );

  const radio = (
    title: string,
    key: 'experienceBucket' | 'salaryBucket' | 'postedBucket',
    options: { value: string; label: string }[]
  ) => (
    <div className="careers-filter-group">
      <h4 className="careers-filter-title">{title}</h4>
      <div className="careers-filter-opts">
        <button
          type="button"
          className={`careers-filter-radio ${!filters[key] ? 'is-active' : ''}`}
          onClick={() => set({ [key]: '' })}
        >
          Any
        </button>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`careers-filter-radio ${filters[key] === opt.value ? 'is-active' : ''}`}
            onClick={() => set({ [key]: filters[key] === opt.value ? '' : opt.value })}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      {multi('City', 'cities', Object.keys(counts.cities), counts.cities)}
      {multi('Role type', 'employment', EMPLOYMENT_TYPES.filter((t) => counts.employment[t]), counts.employment)}
      {multi('Work mode', 'workModes', Object.keys(counts.workModes), counts.workModes)}
      {multi('Industry', 'industries', Object.keys(counts.industries), counts.industries)}
      {multi('Skills', 'skills', Object.keys(counts.skills), counts.skills)}
      {radio('Experience', 'experienceBucket', EXPERIENCE_BUCKETS)}
      {radio('Salary (annual)', 'salaryBucket', SALARY_BUCKETS)}
      {radio('Posted', 'postedBucket', POSTED_BUCKETS)}
      <div className="careers-filter-group" style={{ borderBottom: 0 }}>
        <button type="button" className="careers-btn careers-btn-ghost careers-btn-sm" onClick={reset}>
          Clear all filters
        </button>
      </div>
    </div>
  );
}