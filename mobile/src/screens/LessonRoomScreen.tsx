import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Badge } from '../components/Badge';
import { colors } from '../theme';
import { Lesson } from '../types';
import { resolveSession, leaveLessonAttendance } from '../lib/api';
import { supabase } from '../lib/supabase';

type Props = NativeStackScreenProps<RootStackParamList, 'LessonRoom'>;

export function LessonRoomScreen({ route, navigation }: Props) {
  const { lessonId, token } = route.params;
  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const leftRef = useRef(false);
  const insets = useSafeAreaInsets();

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
        setLesson(lessonData as Lesson);
        setLoading(false);
        return;
      }

      const res = await resolveSession(token);
      if (!res.success || !res.lesson || res.lesson.id !== lessonId || res.lesson.status !== 'live' || res.paymentStatus !== 'approved') {
        navigation.replace('Status', { token });
        return;
      }
      setLesson(res.lesson);
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

  if (loading || !lesson) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.uvPurple} size="large" />
        <Text style={styles.loadingText}>Connecting to Live Room...</Text>
      </View>
    );
  }

  const jitsiRoomName = `LiveDance_${lesson.meeting_room || lesson.id.substring(0, 8)}`;
  const jitsiUrl = `https://meet.jit.si/${jitsiRoomName}#config.prejoinPageEnabled=false&config.startWithAudioMuted=true&config.startWithVideoMuted=true&interfaceConfig.SHOW_JITSI_WATERMARK=false`;

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

      <WebView
  source={{ uri: jitsiUrl }}
  style={styles.webview}
  mediaPlaybackRequiresUserAction={false}
  allowsInlineMediaPlayback
  javaScriptEnabled
  domStorageEnabled
  originWhitelist={['*']}
  onShouldStartLoadWithRequest={(request) => request.url.startsWith('http')}
  onPermissionRequest={(request) => {
    request.grant(request.resources);
  }}
  mediaCapturePermissionGrantType="grant"
/>
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
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
});
