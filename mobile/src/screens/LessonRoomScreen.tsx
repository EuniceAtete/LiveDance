import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LiveKitRoom,
  AudioSession,
  useTracks,
  useLocalParticipant,
  VideoTrack,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
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
          <CallView />
        </LiveKitRoom>
      </View>
    </View>
  );
}

function CallView() {
  const tracks = useTracks([Track.Source.Camera]);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();

  return (
    <View style={styles.callArea}>
      <View style={styles.videoGrid}>
        {tracks.length === 0 ? (
          <View style={styles.emptyCall}>
            <Text style={styles.emptyCallText}>Waiting for others to join…</Text>
          </View>
        ) : (
          tracks.map((track) => (
            <View
              key={`${track.participant.identity}-${track.source}`}
              style={tracks.length === 1 ? styles.videoTileFull : styles.videoTileGrid}
            >
              <VideoTrack trackRef={track} style={styles.video} objectFit="cover" />
              <Text style={styles.videoLabel} numberOfLines={1}>
                {track.participant.name || track.participant.identity}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.controls}>
        <Pressable
          style={[styles.controlBtn, !isMicrophoneEnabled && styles.controlBtnOff]}
          onPress={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        >
          <Text style={styles.controlText}>{isMicrophoneEnabled ? 'Mute' : 'Unmute'}</Text>
        </Pressable>
        <Pressable
          style={[styles.controlBtn, !isCameraEnabled && styles.controlBtnOff]}
          onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
        >
          <Text style={styles.controlText}>{isCameraEnabled ? 'Camera Off' : 'Camera On'}</Text>
        </Pressable>
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
    borderBottomColor: colors.border,
    backgroundColor: colors.bgElevated,
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
  },
  videoTileFull: {
    width: '100%',
    height: '100%',
  },
  videoTileGrid: {
    width: '50%',
    height: '50%',
  },
  video: {
    flex: 1,
    backgroundColor: '#111',
  },
  videoLabel: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  emptyCall: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCallText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 14,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  controlBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: colors.bgElevated2,
  },
  controlBtnOff: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  controlText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
});
