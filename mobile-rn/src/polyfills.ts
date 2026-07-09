/**
 * Keep globals healthy after RN/Expo initialize (they may overwrite them).
 */
import './bootstrapGlobals';

const root = globalThis as typeof globalThis & {
  FormData?: unknown;
  performance?: { now?: () => number; [key: string]: unknown };
  nativePerformanceNow?: () => number;
};

// Prefer RN's FormData if available; otherwise keep bootstrap implementation.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const formDataModule = require('react-native/Libraries/Network/FormData');
  const FormDataImpl = formDataModule?.default || formDataModule;
  if (FormDataImpl) {
    root.FormData = FormDataImpl;
  }
} catch {
  // bootstrap FormData remains
}

if (!root.performance || typeof root.performance !== 'object') {
  root.performance = {};
}
if (typeof root.performance.now !== 'function') {
  root.performance.now = () => {
    if (typeof root.nativePerformanceNow === 'function') return root.nativePerformanceNow();
    return Date.now();
  };
}
