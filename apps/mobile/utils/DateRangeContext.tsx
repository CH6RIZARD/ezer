// =============================================================================
// EZER Mobile App - Date Range Context
// Canonical date range state shared by Wallet and CardDetail
// =============================================================================

import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';
import type { DateRangeType, DateRange } from '../types';
import { getResolvedDateRange } from './calculations';

interface DateRangeContextValue {
  /** Current range (type + start/end/label). */
  dateRange: DateRange;
  /** Set preset (thisMonth | lastYear). */
  setPreset: (type: 'thisMonth' | 'lastYear') => void;
  /** Set custom range; updates type to 'custom' and label to "Jan 2 – Feb 14". */
  setCustomRange: (start: Date, end: Date) => void;
  /** Resolved { start, end } for filtering (same logic everywhere). */
  resolved: { start: Date; end: Date };
  /** Open custom picker (caller shows modal; this just holds state). */
  isCustomPickerOpen: boolean;
  setCustomPickerOpen: (open: boolean) => void;
}

const defaultRange = getResolvedDateRange('thisMonth');

const DateRangeContext = createContext<DateRangeContextValue | undefined>(undefined);

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [type, setType] = useState<DateRangeType>(defaultRange.type);
  const [customStart, setCustomStart] = useState<Date | undefined>(defaultRange.type === 'custom' ? defaultRange.start : undefined);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(defaultRange.type === 'custom' ? defaultRange.end : undefined);
  const [isCustomPickerOpen, setCustomPickerOpen] = useState(false);

  const dateRange = useMemo(
    () => getResolvedDateRange(type, undefined, customStart, customEnd),
    [type, customStart, customEnd]
  );

  const setPreset = useCallback((preset: 'thisMonth' | 'lastYear') => {
    setType(preset);
    setCustomStart(undefined);
    setCustomEnd(undefined);
  }, []);

  const setCustomRange = useCallback((start: Date, end: Date) => {
    setType('custom');
    setCustomStart(start);
    setCustomEnd(end);
    setCustomPickerOpen(false);
  }, []);

  const value: DateRangeContextValue = useMemo(
    () => ({
      dateRange,
      setPreset,
      setCustomRange,
      resolved: { start: dateRange.start, end: dateRange.end },
      isCustomPickerOpen,
      setCustomPickerOpen,
    }),
    [dateRange, setPreset, setCustomRange, isCustomPickerOpen]
  );

  return (
    <DateRangeContext.Provider value={value}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (ctx === undefined) {
    throw new Error('useDateRange must be used within DateRangeProvider');
  }
  return ctx;
}
