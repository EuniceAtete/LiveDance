import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme';
import { supabase } from '../../lib/supabase';

type Nav = NativeStackNavigationProp<RootStackParamList, any>;

const TABS: { key: keyof RootStackParamList; label: string }[] = [
  { key: 'AdminDashboard', label: 'Dashboard' },
  { key: 'AdminLessons', label: 'Lessons' },
  { key: 'AdminPayments', label: 'Payments' },
  { key: 'AdminStudents', label: 'Students' },
  { key: 'AdminAttendance', label: 'Attendance' },
];

interface AdminShellProps {
  navigation: Nav;
  active: keyof RootStackParamList;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

// Mirrors app/admin/layout.tsx: gate every admin screen behind an active Supabase
// Auth session, and provide the tab bar admin-navbar.tsx renders on the web.
export function AdminShell({ navigation, active, title, subtitle, children }: AdminShellProps) {
  const [checking, setChecking] = useState(true);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (!session) {
        navigation.replace('AdminLogin');
      } else {
        setChecking(false);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigation.replace('AdminLogin');
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigation]);

  if (checking) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.uvPurple} size="large" />
      </View>
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigation.replace('AdminLogin');
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.tabBarRow, { paddingTop: insets.top + 10 }]}>
        <View style={styles.tabRow}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => tab.key !== active && navigation.replace(tab.key as any)}
              style={[styles.tab, tab.key === active && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab.key === active && styles.tabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    backgroundColor: colors.bgBase,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarRow: {
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingRight: 12,
  },
  tabRow: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 8,
    gap: 3,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: colors.uvPurple,
  },
  tabText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: '#fff',
  },
  logoutBtn: {
    flexGrow: 0,
    flexShrink: 0,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.error,
  },
  logoutText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.error,
    textTransform: 'uppercase',
  },
  titleRow: {
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 20,
    paddingTop: 8,
    gap: 16,
  },
});
