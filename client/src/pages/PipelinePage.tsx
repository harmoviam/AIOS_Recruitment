import { useEffect, useState } from 'react';
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
import type { Candidate, Job, StageId } from '../types';
import { STAGES } from '../types';

function CandidateCard({ candidate }: { candidate: Candidate }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: candidate.id,
    data: { candidate, stage: candidate.stage },
  });

  const skills = Array.isArray(candidate.skills) ? candidate.skills : [];

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="candidate-card"
      {...attributes}
      {...listeners}
    >
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
  const [active, setActive] = useState<Candidate | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const load = () => {
    const params: Record<string, string> = {};
    if (jobId) params.job_id = jobId;
    if (search) params.search = search;
    api.getCandidates(params).then(setCandidates);
  };

  useEffect(() => {
    api.getJobs().then(setJobs);
  }, []);

  useEffect(() => {
    load();
  }, [jobId, search]);

  const onDragEnd = async (event: DragEndEvent) => {
    setActive(null);
    const { active: dragged, over } = event;
    if (!over) return;

    const candidate = candidates.find((c) => c.id === dragged.id);
    if (!candidate) return;

  let newStage = candidate.stage;
  if (over.data.current?.stage) {
    newStage = over.data.current.stage as string;
  } else if (typeof over.id === 'string' && STAGES.some((s) => s.id === over.id)) {
    newStage = over.id;
  } else {
    const overCandidate = candidates.find((c) => c.id === over.id);
    if (overCandidate) newStage = overCandidate.stage;
  }

    if (newStage === candidate.stage) return;

    setCandidates((prev) => prev.map((c) => (c.id === candidate.id ? { ...c, stage: newStage } : c)));
    await api.updateCandidate(candidate.id, { stage: newStage as StageId });
  };

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
        <p className="section-description">Drag candidates between stages. Click a card for full profile.</p>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(e) => {
            const c = candidates.find((x) => x.id === e.active.id);
            if (c) setActive(c);
          }}
          onDragEnd={onDragEnd}
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
              <div className="candidate-card" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
                <div className="candidate-name">{active.name}</div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </>
  );
}
