import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius } from '../theme';

type Variant = 'gradient' | 'outline' | 'success' | 'error';

interface ButtonProps {
  children: string;
  onPress?: () => void;
  variant?: Variant;
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({ children, onPress, variant = 'gradient', isLoading, disabled, style }: ButtonProps) {
  const isDisabled = disabled || isLoading;

  const content = (
    <View style={styles.contentRow}>
      {isLoading ? (
        <ActivityIndicator color={variant === 'outline' ? colors.textPrimary : '#fff'} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'outline' && { color: colors.textPrimary },
            (variant === 'gradient' || variant === 'success' || variant === 'error') && { color: '#fff' },
          ]}
        >
          {children}
        </Text>
      )}
    </View>
  );

  if (variant === 'gradient') {
    return (
      <Pressable onPress={onPress} disabled={isDisabled} style={({ pressed }) => [{ opacity: pressed || isDisabled ? 0.75 : 1 }, style]}>
        <LinearGradient colors={[colors.uvPurple, colors.uvBlue]} style={styles.base}>
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  const variantStyle =
    variant === 'success' ? { backgroundColor: colors.success }
    : variant === 'error' ? { backgroundColor: 'rgba(255,77,109,0.15)', borderWidth: 1, borderColor: colors.error }
    : { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [styles.base, variantStyle, { opacity: pressed || isDisabled ? 0.75 : 1 }, style]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',z
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
