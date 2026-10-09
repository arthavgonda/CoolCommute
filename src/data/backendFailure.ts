export type BackendFailureKind = 'not-found' | 'server' | 'network' | 'http' | 'invalid-response';

export type BackendFailure = {
  kind: BackendFailureKind;
  status?: number;
  retry: () => Promise<unknown>;
};

type Listener = (failure: BackendFailure | null) => void;

const listeners = new Set<Listener>();

export const subscribeBackendFailure = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const reportBackendFailure = (failure: BackendFailure) => {
  listeners.forEach(listener => listener(failure));
};

export const clearBackendFailure = () => {
  listeners.forEach(listener => listener(null));
};
