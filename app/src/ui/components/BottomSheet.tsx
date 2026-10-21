// Bottom sheet: slides up over a dimmed backdrop; tap the backdrop or the close button to dismiss.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, font, radius, sp } from '../theme';
import { IconButton } from './buttons';

export function BottomSheet({ visible, onClose, title, children }: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const h = Dimensions.get('window').height;
  const y = useRef(new Animated.Value(h)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(y, { toValue: 0, damping: 22, stiffness: 220, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(y, { toValue: h, duration: 220, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + sp(2), maxHeight: h * 0.88, transform: [{ translateY: y }] }]}>
        <View style={s.grabber} />
        {title ? (
          <View style={s.head}>
            <Text style={s.title} accessibilityRole="header">{title}</Text>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
        ) : null}
        <ScrollView contentContainerStyle={{ gap: sp(2), paddingBottom: sp(1) }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: color.backdrop },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.surface, borderTopLeftRadius: radius.card + 4, borderTopRightRadius: radius.card + 4, borderWidth: 1, borderBottomWidth: 0, borderColor: color.border, paddingHorizontal: sp(2), paddingTop: sp(1), gap: sp(1.5) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: color.border },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...font.title, color: color.text, flex: 1 },
});
