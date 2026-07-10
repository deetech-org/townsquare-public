import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SessionState } from '../types';

const SELF_KEY = 'townsquare_self_v1';
const ROSTER_KEY = 'townsquare_roster_v1';

export class PersistenceStore {
  static async save(state: SessionState): Promise<void> {
    const { roster, pendingActions, ...selfScoped } = state;
    await SecureStore.setItemAsync(SELF_KEY, JSON.stringify(selfScoped));
    if (state.deviceMode === 'MODERATOR') {
      await AsyncStorage.setItem(ROSTER_KEY, JSON.stringify({ roster, pendingActions }));
    }
  }

  static async load(): Promise<SessionState | null> {
    const rawSelf = await SecureStore.getItemAsync(SELF_KEY);
    if (!rawSelf) return null;
    const selfScoped = JSON.parse(rawSelf) as SessionState;
    if (selfScoped.deviceMode !== 'MODERATOR') return selfScoped;

    const rawRoster = await AsyncStorage.getItem(ROSTER_KEY);
    const rosterScoped = rawRoster ? JSON.parse(rawRoster) : { roster: [], pendingActions: [] };
    return { ...selfScoped, ...rosterScoped };
  }

  /** Called on "New Game Night" — the only way session data is ever discarded. */
  static async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(SELF_KEY);
    await AsyncStorage.removeItem(ROSTER_KEY);
  }
}
