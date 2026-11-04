import axios from 'axios'
import { getBridgeBaseUrl } from './bridgeConfig.js'
import { getSelfBridgeSessionId } from './replBridgeHandle.js'
import { getClaudeAIOAuthTokens } from '../utils/auth.js'
import { prepareApiRequest } from '../utils/teleport/api.js'
import { discoverAccountPeers, peerIdentityKey } from '../utils/accountPeerDirectory.ts'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'

/** Account-backed peers are discovered with existing authenticated OAuth config.
 * A caller without account credentials still sees all active local peers.
 */
export async function discoverAuthenticatedPeers(local: Array<Record<string, unknown>>) {
  if (!getClaudeAIOAuthTokens()?.accessToken) {
    return { peers: [], notes: [], available: false, identityKey: null }
  }
  let credentials: Awaited<ReturnType<typeof prepareApiRequest>>
  try { credentials = await prepareApiRequest() }
  catch (error) {
    logForDebugging(`[ListAgents] account identity unavailable: ${errorMessage(error)}`)
    return {peers:[], notes:[{kind:'account_list_failed',
      text:'(account session identity unavailable; a later listing retries)'}],available:false,identityKey:null}
  }
  const result = await discoverAccountPeers({
    local, selfId:getSelfBridgeSessionId(),
    baseUrl:getBridgeBaseUrl(),
    accessToken:credentials.accessToken,
    orgUUID:credentials.orgUUID,
    request:async (url: string, headers: Record<string,string>) => {
      const response=await axios.get(url,{headers,timeout:15000,validateStatus:status=>status<500})
      return {status:response.status,data:response.data}
    },
  })
  return { ...result, identityKey:peerIdentityKey(credentials.accessToken, credentials.orgUUID) }
}

/** Revalidate the current credentials before resolving an advertised peer address. */
export async function getCurrentPeerIdentityKey(): Promise<string | null> {
  if (!getClaudeAIOAuthTokens()?.accessToken) return null
  try {
    const { accessToken, orgUUID } = await prepareApiRequest()
    return peerIdentityKey(accessToken, orgUUID)
  } catch (error) {
    logForDebugging(`[ListAgents] peer identity unavailable: ${errorMessage(error)}`)
    return null
  }
}
