import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { colors } from '../../theme';
import { supabase } from '../../lib/supabase';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminLogin'>;

export function AdminLoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    setIsLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);

    if (authError) {
      setError(authError.message || 'Authentication failed');
    } else {
      navigation.replace('AdminDashboard');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Text style={styles.logoGlyph}>♪</Text>
        </View>
        <Text style={styles.title}>
          LiveDance <Text style={{ color: colors.uvBlue }}>Console</Text>
        </Text>
        <Text style={styles.subtitle}>Instructor dashboard management login</Text>
      </View>

      <Card glow>
        <Text style={styles.sectionTitle}>Admin Authentication</Text>
        <View style={{ gap: 16 }}>
          <Input
            label="Email Address"
            placeholder="admin@livedance.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!isLoading}
          />
          <Input
            label="Password"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!isLoading}
          />

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Button onPress={handleLogin} isLoading={isLoading}>
            Sign In
          </Button>
        </View>
      </Card>

      <Pressable onPress={() => navigation.navigate('JoinSession')} style={styles.studentLink}>
        <Text style={styles.studentLinkText}>← Back to student login</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBase,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    height: 48,
    width: 48,
    borderRadius: 16,
    backgroundColor: colors.uvPurple,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoGlyph: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    marginBottom: 18,
  },
  errorBox: {
    backgroundColor: 'rgba(255,77,109,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,77,109,0.3)',
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  studentLink: {
    alignSelf: 'center',
    marginTop: 24,
    padding: 8,
  },
  studentLinkText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});
