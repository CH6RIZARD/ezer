// =============================================================================
// EZER Mobile App - Custom Date Range Picker Modal
// Native: DateTimePicker; Web: YYYY-MM-DD inputs
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Platform,
  TextInput,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../utils/ThemeContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = Math.min(SCREEN_HEIGHT * 0.45, 320);

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromYYYYMMDD(s: string): Date | null {
  if (!s || s.length !== 10) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

interface CustomDateRangeModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (start: Date, end: Date) => void;
  initialStart?: Date;
  initialEnd?: Date;
  /** Min date (e.g. earliest charge from API); constrains picker. */
  minDate?: Date;
  /** Max date (e.g. today or latest from API); constrains picker. */
  maxDate?: Date;
}

export function CustomDateRangeModal({
  visible,
  onClose,
  onApply,
  initialStart,
  initialEnd,
  minDate,
  maxDate,
}: CustomDateRangeModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const cappedMax = maxDate && maxDate < now ? maxDate : now;
  const defaultStart = minDate || new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultEnd = initialEnd || cappedMax;

  const [start, setStart] = useState<Date>(initialStart || defaultStart);
  const [end, setEnd] = useState<Date>(defaultEnd);
  const [webStartStr, setWebStartStr] = useState(toYYYYMMDD(start));
  const [webEndStr, setWebEndStr] = useState(toYYYYMMDD(end));
  const [showNativeStart, setShowNativeStart] = useState(false);
  const [showNativeEnd, setShowNativeEnd] = useState(false);

  const minStr = minDate ? toYYYYMMDD(minDate) : undefined;
  const maxStr = maxDate ? toYYYYMMDD(cappedMax) : toYYYYMMDD(now);

  useEffect(() => {
    if (visible) {
      const s = initialStart || defaultStart;
      const e = initialEnd || cappedMax;
      setStart(s);
      setEnd(e);
      setWebStartStr(toYYYYMMDD(s));
      setWebEndStr(toYYYYMMDD(e));
    }
  }, [visible, initialStart, initialEnd, minDate, maxDate]);

  const handleApply = () => {
    let s = start;
    let e = end;
    if (Platform.OS === 'web') {
      const parsedStart = fromYYYYMMDD(webStartStr);
      const parsedEnd = fromYYYYMMDD(webEndStr);
      if (parsedStart) s = parsedStart;
      if (parsedEnd) e = parsedEnd;
    }
    if (s > e) [s, e] = [e, s];
    onApply(s, e);
    onClose();
  };

  const isWeb = Platform.OS === 'web';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.card, maxHeight: SHEET_MAX_HEIGHT, paddingBottom: insets.bottom + 16 },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>Select date range</Text>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {isWeb ? (
            <View style={styles.webRow}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Start</Text>
              {typeof document !== 'undefined' && document.createElement ? (
                React.createElement('input', {
                  type: 'date',
                  value: webStartStr,
                  min: minStr,
                  max: maxStr,
                  onChange: (e: { target: { value: string } }) => setWebStartStr(e.target.value),
                  style: {
                    width: '100%',
                    padding: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    color: colors.text,
                    fontSize: 16,
                  },
                })
              ) : (
                <TextInput
                  style={[styles.webInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  value={webStartStr}
                  onChangeText={setWebStartStr}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                />
              )}
            </View>
          ) : (
            <View style={styles.nativeRow}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Start</Text>
              <Pressable
                style={[styles.dateButton, { backgroundColor: colors.background }]}
                onPress={() => setShowNativeStart(true)}
              >
                <Text style={{ color: colors.text }}>{start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
              </Pressable>
              {showNativeStart && (
                <DateTimePicker
                  value={start}
                  mode="date"
                  display="default"
                  minimumDate={minDate}
                  maximumDate={maxDate || now}
                  onChange={(_, d) => {
                    if (d) setStart(d);
                    setShowNativeStart(false);
                  }}
                />
              )}
            </View>
          )}

          {isWeb ? (
            <View style={styles.webRow}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>End</Text>
              {typeof document !== 'undefined' && document.createElement ? (
                React.createElement('input', {
                  type: 'date',
                  value: webEndStr,
                  min: minStr,
                  max: maxStr,
                  onChange: (e: { target: { value: string } }) => setWebEndStr(e.target.value),
                  style: {
                    width: '100%',
                    padding: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    color: colors.text,
                    fontSize: 16,
                  },
                })
              ) : (
                <TextInput
                  style={[styles.webInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  value={webEndStr}
                  onChangeText={setWebEndStr}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                />
              )}
            </View>
          ) : (
            <View style={styles.nativeRow}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>End</Text>
              <Pressable
                style={[styles.dateButton, { backgroundColor: colors.background }]}
                onPress={() => setShowNativeEnd(true)}
              >
                <Text style={{ color: colors.text }}>{end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
              </Pressable>
              {showNativeEnd && (
                <DateTimePicker
                  value={end}
                  mode="date"
                  display="default"
                  minimumDate={minDate}
                  maximumDate={maxDate || now}
                  onChange={(_, d) => {
                    if (d) setEnd(d);
                    setShowNativeEnd(false);
                  }}
                />
              )}
            </View>
          )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={[styles.cancelBtn, { backgroundColor: colors.background }]} onPress={onClose}>
              <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.applyBtn, { backgroundColor: colors.accent }]} onPress={handleApply}>
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  scrollContent: {
    flexGrow: 0,
  },
  label: {
    fontSize: 13,
    marginBottom: 6,
  },
  webRow: {
    marginBottom: 10,
  },
  webInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  nativeRow: {
    marginBottom: 10,
  },
  dateButton: {
    borderRadius: 12,
    padding: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  applyBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
});
