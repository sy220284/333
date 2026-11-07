import { createStore } from '../../state/store.js'
import { getDefaultAppState, type AppState } from '../../state/AppStateStore.js'

/** Shared application state for terminal, SDK and desktop hosts. The existing
 * onChangeAppState callback remains the single model/permission sync path. */
export function createConversationAppStateStore(
  initialState?: AppState,
  onChange?: (change: { newState: AppState; oldState: AppState }) => void,
) {
  return createStore(initialState ?? getDefaultAppState(), onChange)
}
