import { useCallback, useEffect, useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from '@livekit/components-react';
import '@livekit/components-styles';

export interface VideoSession {
  serverUrl: string;
  token: string;
  roomName: string;
  participantName: string;
}

interface InterviewVideoRoomProps {
  session: VideoSession;
  title: string;
  subtitle?: string;
  onLeave: () => void;
  headerExtra?: React.ReactNode;
}

export default function InterviewVideoRoom({ session, title, subtitle, onLeave, headerExtra }: InterviewVideoRoomProps) {
  const [error, setError] = useState<string | null>(null);

  const handleDisconnected = useCallback(() => {
    onLeave();
  }, [onLeave]);

  useEffect(() => {
    setError(null);
  }, [session.token]);

  return (
    <div className="interview-video-shell">
      <header className="interview-video-header">
        <div>
          <h1 className="interview-video-title">{title}</h1>
          {subtitle && <p className="interview-video-subtitle">{subtitle}</p>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="button-pill button-secondary" onClick={onLeave}>
          Leave call
        </button>
        {headerExtra}
        </div>
      </header>

      {error && <div className="interview-video-error">{error}</div>}

      <div className="interview-video-stage">
        <LiveKitRoom
          video
          audio
          token={session.token}
          serverUrl={session.serverUrl}
          connect
          onDisconnected={handleDisconnected}
          onError={(err) => setError(err.message)}
          data-lk-theme="default"
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>
    </div>
  );
}
