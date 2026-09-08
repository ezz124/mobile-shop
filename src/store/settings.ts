import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/lib/ipc';
import type { AppSettings } from '@/shared/ipc';

export const FALLBACK_SETTINGS: AppSettings = {
  storeName: 'متجر الهواتف النقّالة',
  storePhone: '',
  storeAddress: '',
  currency: 'ج.م',
  invoiceFooter: 'شكراً لتعاملكم معنا',
  lowStockThreshold: 3,
  autoBackup: true,
  autoBackupIntervalHours: 12,
  printerWidth: '80mm',
  taxEnabled: false,
  taxRate: 0,
};

interface SettingsContextValue {
  settings: AppSettings;
  currency: string;
}

export const SettingsContext = createContext<SettingsContextValue>({
  settings: FALLBACK_SETTINGS,
  currency: FALLBACK_SETTINGS.currency,
});

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}

export function useSettingsQuery() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => invoke('settings:get'),
    staleTime: Infinity,
  });
}
