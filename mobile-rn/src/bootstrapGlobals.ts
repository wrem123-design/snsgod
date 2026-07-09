/**
 * Minimal globals required before React Native / Expo boot.
 * Do not import react-native internals here.
 */

type FormDataValue = string | { name?: string; type?: string; uri: string };

class SNSGodFormData {
  _parts: Array<[string, FormDataValue]> = [];

  append(key: string, value: FormDataValue): void {
    this._parts.push([String(key), value]);
  }

  getAll(key: string): FormDataValue[] {
    return this._parts.filter(([name]) => name === key).map(([, value]) => value);
  }

  // Used by React Native networking (RCTNetworking).
  getParts(): Array<Record<string, unknown>> {
    return this._parts.map(([name, value]) => {
      const contentDisposition = `form-data; name="${name}"`;
      const headers: Record<string, string> = { 'content-disposition': contentDisposition };
      if (typeof value === 'object' && value && !Array.isArray(value)) {
        if (typeof value.name === 'string') {
          headers['content-disposition'] += `; filename="${encodeURIComponent(value.name.replace(/\//g, '_'))}"`;
        }
        if (typeof value.type === 'string') {
          headers['content-type'] = value.type;
        }
        return { ...value, headers, fieldName: name };
      }
      return { string: String(value), headers, fieldName: name };
    });
  }
}

const root = globalThis as typeof globalThis & {
  FormData?: unknown;
  performance?: { now?: () => number; [key: string]: unknown };
  nativePerformanceNow?: () => number;
};

if (typeof root.FormData === 'undefined') {
  root.FormData = SNSGodFormData;
}

if (!root.performance || typeof root.performance !== 'object') {
  root.performance = {};
}
if (typeof root.performance.now !== 'function') {
  root.performance.now = () => {
    if (typeof root.nativePerformanceNow === 'function') {
      return root.nativePerformanceNow();
    }
    return Date.now();
  };
}
