import { useContext, type ContextType } from 'react'
import AppContext from '../components/AppContext.js'

/**
 * `useApp` is a React hook, which exposes a method to manually exit the app (unmount).
 */
const useApp = (): ContextType<typeof AppContext> => useContext(AppContext)
export default useApp
