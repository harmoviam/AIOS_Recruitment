import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../api/client';
import { useRefetchOnFocus } from '../utils/useRefetchOnFocus';
import type { Candidate, Job, StageId } from '../types';
import { STAGES } from '../types';

function CandidateCardContent({ candidate }: { candidate: Candidate }) {
  const skills = Array.isArray(candidate.skills) ? candidate.skills : [];

  return (
    <>
      <Link to={`/candidates/${candidate.id}`} onClick={(e) => e.stopPropagation()} className="candidate-name">
        {candidate.name}
      </Link>
      <div className="candidate-skills">
        {skills.slice(0, 3).map((s) => (
          <div key={s} className="skill-tag">
            {s}
          </div>
        ))}
      </div>
      <div className="candidate-meta">
        <span>{candidate.experience_years} yrs</span>
        <span className="ai-score">{candidate.ai_score}</span>
      </div>
    </>
  );
}

function CandidateCard({ candidate }: { candidate: Candidate }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: candidate.id,
    data: { candidate, stage: candidate.stage },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="candidate-card"
      {...attributes}
      {...listeners}
    >
      <CandidateCardContent candidate={candidate} />
    </div>
  );
}

function KanbanColumn({ stage, candidates }: { stage: string; candidates: Candidate[] }) {
  const label = STAGES.find((s) => s.id === stage)?.label || stage;
  const { setNodeRef, isOver } = useDroppable({ id: stage, data: { stage } });

  return (
    <div ref={setNodeRef} className="kanban-column" style={{ outline: isOver ? '2px dashed var(--primary)' : undefined }}>
      <div className="column-header">
        <span>{label}</span>
        <span className="column-count">{candidates.length}</span>
      </div>
      <SortableContext items={candidates.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {candidates.map((c) => (
          <CandidateCard key={c.id} candidate={c} />
        ))}
      </SortableContext>
    </div>
  );
}

export default function PipelinePage() {
  const [searchParams] = useSearchParams();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState(searchParams.get('job_id') || '');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [active, setActive] = useState<Candidate | null>(null);
  const [saveError, setSaveError] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const load = useCallback(() => {
    const params: Record<string, string> = {};
    if (jobId) params.job_id = jobId;
    if (search) params.search = search;
    setLoading(true);
    setLoadError('');
    api
      .getCandidates(params)
      .then((rows) => setCandidates(Array.isArray(rows) ? rows : []))
      .catch((err) => {
        setCandidates([]);
        setLoadError(err instanceof Error ? err.message : 'Failed to load candidates');
      })
      .finally(() => setLoading(false));
  }, [jobId, search]);

  useEffect(() => {
    api.getJobs().then(setJobs);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRefetchOnFocus(() => {
    if (!active) load();
  });

  const stageFromOver = (over: DragEndEvent['over'], roster: Candidate[]): StageId | null => {
    if (!over) return null;
    if (over.data.current?.stage) return over.data.current.stage as StageId;
    if (typeof over.id === 'string' && STAGES.some((s) => s.id === over.id)) return over.id as StageId;
    const overCandidate = roster.find((c) => c.id === over.id);
    return overCandidate ? (overCandidate.stage as StageId) : null;
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setActive(null);
    const { active: dragged, over } = event;
    if (!over) return;

    const candidateId = dragged.id as Candidate['id'];
    const candidate = candidates.find((c) => c.id === candidateId);
    if (!candidate) return;

    const previousStage = candidate.stage as StageId;
    const newStage = stageFromOver(over, candidates) ?? previousStage;
    if (newStage === previousStage) return;

    setSaveError('');
    setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, stage: newStage } : c)));
    try {
      await api.updateCandidate(candidateId, { stage: newStage });
    } catch (err) {
      setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, stage: previousStage } : c)));
      setSaveError(err instanceof Error ? err.message : 'Failed to update candidate stage');
    }
  };

  const onDragCancel = () => setActive(null);

  const visibleStages = STAGES.filter((s) => s.id !== 'rejected');

  return (
    <>
      <div className="topbar">
        <input
          className="search-bar input-field"
          placeholder="Search candidates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input-field" value={jobId} onChange={(e) => setJobId(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="">All jobs</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
      </div>
      <div className="page-content">
        <h1 className="section-title">Candidate Pipeline</h1>
        <p className="section-description">
          Drag candidates between stages. Click a card for full profile.
          {!loading && candidates.length > 0 && (
            <span className="text-muted"> · {candidates.length} candidate{candidates.length === 1 ? '' : 's'}</span>
          )}
        </p>
        {loadError && (
          <p role="alert" style={{ color: 'var(--danger, #dc2626)', marginBottom: '0.75rem' }}>
            Could not load candidates: {loadError}
          </p>
        )}
        {saveError && (
          <p role="alert" style={{ color: 'var(--danger, #dc2626)', marginBottom: '0.75rem' }}>
            Could not save stage change: {saveError}
          </p>
        )}

        {loading ? (
          <p className="text-muted">Loading pipeline…</p>
        ) : candidates.length === 0 && !loadError ? (
          <p className="empty-inline">
            No candidates match your filters yet. Try clearing the job filter or add candidates from the Candidates page.
          </p>
        ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(e) => {
            const c = candidates.find((x) => x.id === e.active.id);
            if (c) setActive(c);
          }}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className="kanban">
            {visibleStages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage.id}
                candidates={candidates.filter((c) => c.stage === stage.id)}
              />
            ))}
          </div>
          <DragOverlay>
            {active ? (
              <div className="candidate-card" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.15)', cursor: 'grabbing' }}>
                <CandidateCardContent candidate={active} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        )}
      </div>
    </>
  );
}
