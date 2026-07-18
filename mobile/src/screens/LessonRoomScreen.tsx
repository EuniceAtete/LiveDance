import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Modal,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  LiveKitRoom,
  AudioSession,
  useTracks,
  useLocalParticipant,
  useChat,
  VideoTrack,
  isTrackReference,
  type TrackReference,
  type TrackReferenceOrPlaceholder,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, MonitorUp, MessageSquare, LogOut } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Badge } from '../components/Badge';
import { colors } from '../theme';
import { Lesson } from '../types';
import { resolveSession, leaveLessonAttendance, getLiveKitToken } from '../lib/api';
import { supabase } from '../lib/supabase';

type Props = NativeStackScreenProps<RootStackParamList, 'LessonRoom'>;

export function LessonRoomScreen({ route, navigation }: Props) {
  const { lessonId, token } = route.params;
  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const leftRef = useRef(false);
  const insets = useSafeAreaInsets();

  // The native audio engine WebRTC captures/plays through must be started before
  // connecting to a room and stopped when leaving, independent of React lifecycle.
  useEffect(() => {
    AudioSession.startAudioSession();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  useEffect(() => {
    const verify = async () => {
      // Admin/instructor bypass — skip the student session entirely, just confirm
      // an authenticated admin session, mirroring app/lesson/[id]/page.tsx on the web.
      if (token === 'admin') {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          navigation.replace('AdminLogin');
          return;
        }
        const { data: lessonData, error } = await supabase.from('lessons').select('*').eq('id', lessonId).single();
        if (error || !lessonData) {
          navigation.replace('AdminDashboard');
          return;
        }
        const lkRes = await getLiveKitToken(lessonId, 'admin', session.access_token);
        if (!lkRes.success || !lkRes.url || !lkRes.token) {
          navigation.replace('AdminDashboard');
          return;
        }
        setLesson(lessonData as Lesson);
        setLivekitUrl(lkRes.url);
        setLivekitToken(lkRes.token);
        setLoading(false);
        return;
      }

      const res = await resolveSession(token);
      if (!res.success || !res.lesson || res.lesson.id !== lessonId || res.lesson.status !== 'live' || res.paymentStatus !== 'approved') {
        navigation.replace('Status', { token });
        return;
      }
      const lkRes = await getLiveKitToken(lessonId, token);
      if (!lkRes.success || !lkRes.url || !lkRes.token) {
        navigation.replace('Status', { token });
        return;
      }
      setLesson(res.lesson);
      setLivekitUrl(lkRes.url);
      setLivekitToken(lkRes.token);
      setLoading(false);
    };
    verify();
  }, [lessonId, token, navigation]);

  const handleLeave = React.useCallback(async () => {
    if (leftRef.current) return;
    leftRef.current = true;
    if (token === 'admin') {
      navigation.replace('AdminDashboard');
      return;
    }
    try {
      await leaveLessonAttendance(token);
    } finally {
      navigation.replace('Status', { token });
    }
  }, [token, navigation]);

  // Watch for the instructor ending the lesson while the student is still in the room.
  useEffect(() => {
    if (!lesson) return;
    const channel = supabase
      .channel(`lesson-room:${lesson.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lessons', filter: `id=eq.${lesson.id}` },
        (payload) => {
          const updated = payload.new as Lesson;
          if (updated.status === 'ended') handleLeave();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lesson, handleLeave]);

  if (loading || !lesson || !livekitUrl || !livekitToken) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.uvPurple} size="large" />
        <Text style={styles.loadingText}>Connecting to Live Room...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={styles.title}>{lesson.title}</Text>
          <Text style={styles.subtitle}>LiveDance Room</Text>
        </View>
        <View style={styles.headerRight}>
          <Badge status="live" label="LIVE" />
          <Pressable style={styles.leaveBtn} onPress={handleLeave}>
            <Text style={styles.leaveText}>Leave</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.room}>
        <LiveKitRoom serverUrl={livekitUrl} token={livekitToken} connect audio video={false} onDisconnected={handleLeave}>
          <CallView insetsBottom={insets.bottom} onLeave={handleLeave} />
        </LiveKitRoom>
      </View>
    </View>
  );
}

function initials(label: string) {
  return label.trim().charAt(0).toUpperCase() || '?';
}

// A camera toggled off mutes the existing publication rather than removing
// it, so isTrackReference alone still returns true — without also checking
// isMuted, the last rendered frame stays frozen on screen instead of
// switching to the avatar placeholder.
function hasLiveVideo(track: TrackReferenceOrPlaceholder): track is TrackReference {
  return isTrackReference(track) && !track.publication.isMuted;
}

function Avatar({ label }: { label: string }) {
  return (
    <View style={styles.avatarPlaceholder}>
      <LinearGradient colors={[colors.uvPurple, colors.uvBlue]} style={styles.avatarCircle}>
        <Text style={styles.avatarInitial}>{initials(label)}</Text>
      </LinearGradient>
    </View>
  );
}

type IconComponent = React.ComponentType<{ size?: number; color?: string }>;

function ControlButton({
  icon: Icon,
  label,
  active,
  danger,
  badge,
  onPress,
}: {
  icon: IconComponent;
  label: string;
  active?: boolean;
  danger?: boolean;
  badge?: number;
  onPress: () => void;
}) {
  const iconColor = active || danger ? '#fff' : colors.textPrimary;

  const content = (
    <>
      <Icon size={20} color={iconColor} />
      {!!badge && (
        <View style={styles.chatBadge}>
          <Text style={styles.chatBadgeText}>{badge}</Text>
        </View>
      )}
    </>
  );

  // Always render the same tree shape (Pressable > LinearGradient > content) and
  // only vary the gradient colors/border by state — branching to a structurally
  // different tree per state made React remount the button on every toggle,
  // which showed up as the button flickering/disappearing on press.
  const fillColors = active
    ? ([colors.uvPurple, colors.uvBlue] as const)
    : danger
      ? ([colors.error, colors.error] as const)
      : ([colors.bgElevated2, colors.bgElevated2] as const);

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.controlBtnShape, pressed && styles.pressed]}
    >
      <LinearGradient colors={fillColors} style={[styles.controlBtnFill, !active && !danger && styles.controlBtnBordered]}>
        {content}
      </LinearGradient>
    </Pressable>
  );
}

function CallView({ insetsBottom, onLeave }: { insetsBottom: number; onLeave: () => void }) {
  // withPlaceholder keeps every participant visible (as an avatar) even before
  // they've published a camera track — otherwise anyone joining camera-off is
  // invisible instead of just showing without video.
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const screenShareTracks = useTracks([Track.Source.ScreenShare]);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const { chatMessages, send, isSending } = useChat();

  const [focusedIdentity, setFocusedIdentity] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const seenMessageCount = useRef(0);

  useEffect(() => {
    if (!chatOpen && chatMessages.length > seenMessageCount.current) {
      setUnreadCount(chatMessages.length - seenMessageCount.current);
    }
  }, [chatMessages.length, chatOpen]);

  const openChat = () => {
    setChatOpen(true);
    setUnreadCount(0);
    seenMessageCount.current = chatMessages.length;
  };

  const handleSend = async () => {
    const text = chatText.trim();
    if (!text) return;
    setChatText('');
    await send(text);
  };

  // An active screen share always takes over the main view — someone sharing
  // their screen wants everyone looking at it, overriding any manual focus.
  const activeScreenShare = screenShareTracks[0];
  const focusedCameraTrack = cameraTracks.find((t) => t.participant.identity === focusedIdentity);
  const mainTrack: TrackReferenceOrPlaceholder | undefined = activeScreenShare || focusedCameraTrack;
  const mainLabel = mainTrack ? mainTrack.participant.name || mainTrack.participant.identity : '';

  return (
    <View style={styles.callArea}>
      {mainTrack ? (
        <Pressable
          style={styles.videoTileFull}
          onPress={() => !activeScreenShare && setFocusedIdentity(null)}
        >
          {hasLiveVideo(mainTrack) ? (
            <VideoTrack trackRef={mainTrack} style={styles.video} objectFit="contain" />
          ) : (
            <Avatar label={mainLabel} />
          )}
          <Text style={styles.videoLabel} numberOfLines={1}>
            {mainLabel}
            {activeScreenShare ? ' — Sharing Screen' : ''}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.videoGrid}>
          {cameraTracks.map((track) => {
            const label = track.participant.name || track.participant.identity;
            return (
              <Pressable
                key={`${track.participant.identity}-${track.source}`}
                style={cameraTracks.length === 1 ? styles.videoTileFull : styles.videoTileGrid}
                onPress={() => setFocusedIdentity(track.participant.identity)}
              >
                {hasLiveVideo(track) ? (
                  <VideoTrack trackRef={track} style={styles.video} objectFit="cover" />
                ) : (
                  <Avatar label={label} />
                )}
                <Text style={styles.videoLabel} numberOfLines={1}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Modal visible={chatOpen} animationType="slide" transparent onRequestClose={() => setChatOpen(false)}>
        <KeyboardAvoidingView
          style={styles.chatBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.chatPanel}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle}>Chat</Text>
              <Pressable onPress={() => setChatOpen(false)}>
                <Text style={styles.chatClose}>Close</Text>
              </Pressable>
            </View>
            <FlatList
              data={chatMessages}
              keyExtractor={(item) => item.id}
              style={styles.chatList}
              contentContainerStyle={{ gap: 10, paddingVertical: 10 }}
              renderItem={({ item }) => (
                <View>
                  <Text style={styles.chatSender}>{item.from?.name || item.from?.identity || 'Someone'}</Text>
                  <Text style={styles.chatMessageText}>{item.message}</Text>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyCallText}>No messages yet — say hi!</Text>}
            />
            <View style={[styles.chatInputRow, { paddingBottom: insetsBottom + 10 }]}>
              <TextInput
                style={styles.chatInput}
                value={chatText}
                onChangeText={setChatText}
                placeholder="Message"
                placeholderTextColor={colors.textSecondary}
                onSubmitEditing={handleSend}
                returnKeyType="send"
              />
              <Pressable style={styles.chatSendBtn} disabled={isSending || !chatText.trim()} onPress={handleSend}>
                <Text style={styles.controlText}>Send</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={[styles.controls, { paddingBottom: insetsBottom + 14 }]}>
        <ControlButton
          icon={isMicrophoneEnabled ? Mic : MicOff}
          label={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
          active={isMicrophoneEnabled}
          onPress={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        />
        <ControlButton
          icon={isCameraEnabled ? Video : VideoOff}
          label={isCameraEnabled ? 'Camera Off' : 'Camera On'}
          active={isCameraEnabled}
          onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
        />
        <ControlButton
          icon={MonitorUp}
          label={isScreenShareEnabled ? 'Stop Sharing' : 'Share Screen'}
          active={isScreenShareEnabled}
          onPress={() => localParticipant.setScreenShareEnabled(!isScreenShareEnabled)}
        />
        <ControlButton icon={MessageSquare} label="Chat" badge={unreadCount} onPress={openChat} />
        <ControlButton icon={LogOut} label="Leave" danger onPress={onLeave} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.uvPurple + '55',
    backgroundColor: colors.bgElevated,
    shadowColor: colors.uvPurple,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 10,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  leaveBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  leaveText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  room: {
    flex: 1,
    backgroundColor: '#000',
  },
  callArea: {
    flex: 1,
  },
  videoGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 3,
    backgroundColor: colors.bgBase,
  },
  videoTileFull: {
    width: '100%',
    height: '100%',
    padding: 3,
    backgroundColor: colors.bgBase,
  },
  videoTileGrid: {
    width: '50%',
    height: '50%',
    padding: 3,
  },
  video: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 16,
    overflow: 'hidden',
  },
  videoLabel: {
    position: 'absolute',
    left: 14,
    bottom: 12,
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    backgroundColor: 'rgba(13,13,18,0.75)',
    borderWidth: 1,
    borderColor: colors.uvPurple + '66',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  avatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated2,
    borderRadius: 16,
    overflow: 'hidden',
  },
  avatarCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.uvPurple,
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.uvPurple + '33',
  },
  controlBtnShape: {
    position: 'relative',
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
  },
  controlBtnFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnBordered: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.8,
  },
  controlText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  controlTextActive: {
    color: '#fff',
  },
  chatBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBadgeText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  chatBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  chatPanel: {
    height: '65%',
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chatTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  chatClose: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  chatList: {
    flex: 1,
  },
  chatSender: {
    color: colors.uvBlue,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  chatMessageText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  emptyCallText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
  },
  chatSendBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.bgElevated2,
  },
});
