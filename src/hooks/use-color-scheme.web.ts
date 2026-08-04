import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const subscribe = () => () => {};

/**
 * Static web rendering has no OS appearance to read, so the server pass has to
 * agree on something and the client pass corrects it. `useSyncExternalStore`
 * expresses exactly that — a server snapshot and a client snapshot — without
 * the hydration flag and cascading render the effect version caused.
 */
export function useColorScheme() {
  const scheme = useRNColorScheme();
  return useSyncExternalStore(
    subscribe,
    () => scheme,
    // The enamel appearance is the app's default, so an unstyled first paint
    // matches what the client is about to resolve for most people.
    () => 'dark' as const,
  );
}
