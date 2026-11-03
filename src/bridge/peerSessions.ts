import axios from 'axios'
import { randomUUID } from 'node:crypto'
import { getOauthConfig } from '../constants/oauth.js'
import { errorMessage } from '../utils/errors.js'
import { wrapCrossSessionMessage } from '../utils/peerMessageEnvelope.mjs'
import { peerIdentityKey } from '../utils/accountPeerDirectory.mjs'
import { getSelfBridgeSessionId } from './replBridgeHandle.js'
import {
  CCR_BYOC_BETA,
  getOAuthHeaders,
  prepareApiRequest,
} from '../utils/teleport/api.js'
import { toSessionApiId } from './sessionIdProtocol.js'

/**
 * OAuth-authenticated cross-session user event transport.
 * The envelope matches the /v1/sessions/{id}/events contract used by
 * bridgeApi.sendPermissionResponseEvent and the 2.1.310 peer sender.
 */
export async function postInterClaudeMessage(
  targetSessionId: string,
  text: string,
  expectedIdentityKey: string | null,
): Promise<{ ok: boolean; error?: string; msgId?: string }> {
  const sessionId = toSessionApiId(targetSessionId)
  if (!/^session_[A-Za-z0-9_-]+$/.test(sessionId)) {
    return { ok: false, error: `invalid session ID format: ${targetSessionId}` }
  }
  if (!text.trim()) return { ok: false, error: 'empty peer message' }
  let accessToken: string
  let orgUUID: string
  try {
    ;({ accessToken, orgUUID } = await prepareApiRequest())
  } catch (error) {
    return { ok: false, error: `auth: ${errorMessage(error)}` }
  }
  if (peerIdentityKey(accessToken, orgUUID) !== expectedIdentityKey) {
    return { ok: false, error: 'authenticated account changed before remote delivery' }
  }
  const msgId = randomUUID()
  const event = {
    msgV: 1,
    msg_id: msgId,
    type: 'user',
    message: { role: 'user', content: wrapCrossSessionMessage(text, getSelfBridgeSessionId() ? `bridge:${getSelfBridgeSessionId()}` : 'unknown') },
    parent_tool_use_id: null,
    session_id: sessionId,
    uuid: randomUUID(),
  }
  try {
    const response = await axios.post(
      `${getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}/events`,
      { events: [event] },
      {
        headers: {
          ...getOAuthHeaders(accessToken),
          'anthropic-beta': CCR_BYOC_BETA,
          'x-organization-uuid': orgUUID,
        },
        timeout: 10_000,
        validateStatus: status => status < 500,
      },
    )
    if (response.status === 200 || response.status === 201 || response.status === 204) {
      return { ok: true, msgId }
    }
    return { ok: false, error: `HTTP ${response.status}` }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}
