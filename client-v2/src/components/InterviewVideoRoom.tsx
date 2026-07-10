import { useCallback, useEffect, useState } from 'react';
import {
  LiveKitRoom,
  PreJoin,
  RoomAudioRenderer,
  StartAudio,
  VideoConference,
  useLocalParticipant,
  useRoomContext,
  type LocalUserChoices,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { ConnectionState, MediaDeviceFailure } from 'livekit-client';

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

function mediaFailureMessage(failure?: MediaDeviceFailure, kind?: MediaDeviceKind): string {
  const device = kind === 'videoinput' ? 'camera' : 'microphone';
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return `${device.charAt(0).toUpperCase()}${device.slice(1)} access was blocked. Allow ${device} in your browser settings, then rejoin.`;
    case MediaDeviceFailure.NotFound:
      return `No ${device} found. Connect a ${device} or check your device settings.`;
    case MediaDeviceFailure.DeviceInUse:
      return `Your ${device} is in use by another app. Close other apps using it and rejoin.`;
    default:
      return `Unable to access your ${device}. Check browser permissions and try again.`;
  }
}

function captureOptions(enabled: boolean, deviceId: string) {
  if (!enabled) return false;
  return deviceId ? { deviceId } : true;
}

/** Re-enable mic/camera after connect using the devices chosen in PreJoin. */
function EnsureMediaEnabled({ choices }: { choices: LocalUserChoices }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (room.state !== ConnectionState.Connected) return;

    void (async () => {
      try {
        if (choices.audioEnabled) {
          await localParticipant.setMicrophoneEnabled(true, {
            deviceId: choices.audioDeviceId || undefined,
          });
        }
        if (choices.videoEnabled) {
          await localParticipant.setCameraEnabled(true, {
            deviceId: choices.videoDeviceId || undefined,
          });
        }
      } catch {
        // LiveKitRoom onMediaDeviceFailure / onError surface this to the user.
      }
    })();
  }, [room.state, localParticipant, choices]);

  return null;
}

export default function InterviewVideoRoom({ session, title, subtitle, onLeave, headerExtra }: InterviewVideoRoomProps) {
  const [error, setError] = useState<string | null>(null);
  const [userChoices, setUserChoices] = useState<LocalUserChoices | null>(null);

  const handleDisconnected = useCallback(() => {
    onLeave();
  }, [onLeave]);

  const handleMediaDeviceFailure = useCallback((failure?: MediaDeviceFailure, kind?: MediaDeviceKind) => {
    setError(mediaFailureMessage(failure, kind));
  }, []);

  useEffect(() => {
    setError(null);
    setUserChoices(null);
  }, [session.token]);

  const header = (
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
  );

  if (!userChoices) {
    return (
      <div className="interview-video-shell">
        {header}
        {error && <div className="interview-video-error">{error}</div>}
        <div className="interview-video-stage interview-video-prejoin" data-lk-theme="default">
          <PreJoin
            defaults={{
              username: session.participantName,
              audioEnabled: true,
              videoEnabled: true,
            }}
            persistUserChoices={false}
            joinLabel="Join interview"
            micLabel="Microphone"
            camLabel="Camera"
            userLabel="Display name"
            onSubmit={setUserChoices}
            onError={(err) => setError(err.message)}
          />
          <p className="interview-video-prejoin-tip">
            Test your microphone before joining. Speak and watch the audio level indicator — if it does not move,
            select a different microphone or check browser permissions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="interview-video-shell">
      {header}
      {error && <div className="interview-video-error">{error}</div>}

      <div className="interview-video-stage">
        <LiveKitRoom
          video={captureOptions(userChoices.videoEnabled, userChoices.videoDeviceId)}
          audio={captureOptions(userChoices.audioEnabled, userChoices.audioDeviceId)}
          token={session.token}
          serverUrl={session.serverUrl}
          connect
          onDisconnected={handleDisconnected}
          onError={(err) => setError(err.message)}
          onMediaDeviceFailure={handleMediaDeviceFailure}
          data-lk-theme="default"
        >
          <EnsureMediaEnabled choices={userChoices} />
          <VideoConference />
          <RoomAudioRenderer />
          <StartAudio label="Click to enable audio playback" />
        </LiveKitRoom>
      </div>
    </div>
  );
}
