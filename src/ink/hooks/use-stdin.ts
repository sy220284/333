import { useContext, type ContextType } from 'react'
import StdinContext from '../components/StdinContext.js'

/**
 * `useStdin` is a React hook, which exposes stdin stream.
 */
const useStdin = (): ContextType<typeof StdinContext> => useContext(StdinContext)
export default useStdin
