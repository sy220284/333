/**
 * Claude Code 2.1.317 self-hosted-runner decode-token.
 * This is a diagnostic command: verification uses the API's published JWKS
 * and enforces signature and temporal claims unless disabled explicitly.
 */
import { createPublicKey, constants, verify as verifySignature, type JsonWebKey } from 'node:crypto'
import { stdin, stdout, stderr } from 'node:process'

type JwtObject = Record<string, unknown>
type VerifyFlags = { verify: boolean; checkExpiry: boolean; header: boolean; apiUrl: string }
export type DecodeResult317 = { header: JwtObject; payload: JwtObject; verifiedKid?: string }
export type DecodeOptions317 = VerifyFlags & {
  now?: () => number; fetchImpl?: typeof fetch; signal?: AbortSignal
}
const CLOCK_SKEW_SECONDS = 60
const JWKS_PATH = '/v1/code/.well-known/jwks.json'
const cryptoAlgorithms = new Set(['RS256','RS384','RS512','PS256','PS384','PS512','ES256','ES384','ES512','EdDSA'])
const PREFIXES = ['sk-ant-si-','sk-ant-cc-']
function object(value: unknown, label: string): JwtObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('decode-token: '+label+' is not a JSON object')
  }
  return value as JwtObject
}
function base64UrlJson(segment: string, label: string): JwtObject {
  let value: unknown
  try { value=JSON.parse(Buffer.from(segment,'base64url').toString('utf8')) }
  catch (error) {
    throw new Error('decode-token: '+label+' is not valid JSON: '+
      (error instanceof Error ? error.message : String(error)))
  }
  return object(value,label)
}
function stripPrefix(raw: string): string {
  const token=raw.trim()
  for (const prefix of PREFIXES) if (token.startsWith(prefix)) return token.slice(prefix.length)
  return token
}
function verifyTimestamp(claims: JwtObject, now: number): void {
  if (claims.exp !== undefined) {
    if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) {
      throw new Error('decode-token: exp claim is invalid')
    }
    if (claims.exp < now-CLOCK_SKEW_SECONDS) throw new Error('decode-token: JWT has expired')
  }
  if (claims.nbf !== undefined) {
    if (typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf)) {
      throw new Error('decode-token: nbf claim is invalid')
    }
    if (claims.nbf > now+CLOCK_SKEW_SECONDS) throw new Error('decode-token: JWT is not valid yet')
  }
}
export async function decodeSessionToken317(raw: string, flags: DecodeOptions317): Promise<DecodeResult317> {
  const token=stripPrefix(raw)
  const segments=token.split('.')
  if (segments.length!==3 || segments.some(segment=>!segment)) {
    throw new Error('decode-token: not a JWT — expected 3 dot-separated base64url segments '+
      '(after stripping any sk-ant- prefix), got '+segments.length)
  }
  const header=base64UrlJson(segments[0],'header')
  const payload=base64UrlJson(segments[1],'payload')
  if (!flags.verify) return {header,payload}
  const algorithm=header.alg
  if (typeof algorithm!=='string' || !cryptoAlgorithms.has(algorithm)) {
    throw new Error('decode-token: unsupported JWT signature algorithm: '+String(algorithm))
  }
  const base=new URL(flags.apiUrl)
  if (!['https:','http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('decode-token: invalid API URL')
  }
  const target=new URL(JWKS_PATH,base).toString()
  let document: unknown
  try {
    const response=await (flags.fetchImpl??fetch)(target,{
      method:'GET',signal:flags.signal??AbortSignal.timeout(10_000),redirect:'error',
    })
    if (!response.ok) throw new Error('HTTP '+response.status)
    document=await response.json()
  } catch (error) {
    throw new Error('decode-token: failed to fetch JWKS from '+target+': '+
      (error instanceof Error ? error.message : String(error)))
  }
  const jwks=object(document,'JWKS')
  if (!Array.isArray(jwks.keys)) throw new Error('decode-token: JWKS contains no keys')
  const kid=typeof header.kid==='string'?header.kid:undefined
  const key=jwks.keys.map((item:unknown)=>object(item,'JWK'))
    .find(jwk=>(typeof jwk.kid==='string' && jwk.kid===kid) &&
      (jwk.alg===undefined || jwk.alg===algorithm) &&
      (jwk.use===undefined || jwk.use==='sig'))
  if (!key) throw new Error('decode-token: no matching signing key in JWKS'+(kid?' for kid='+kid:''))
  const signingInput=Buffer.from(segments[0]+'.'+segments[1],'utf8')
  const signature=Buffer.from(segments[2],'base64url')
  const digest=algorithm==='EdDSA'?null:'sha'+algorithm.slice(-3)
  const keyOptions={key:createPublicKey({key:key as JsonWebKey,format:'jwk'})}
  const verified=algorithm.startsWith('PS')
    ? verifySignature(digest,signingInput,{
        ...keyOptions,padding:constants.RSA_PKCS1_PSS_PADDING,
        saltLength:Number(algorithm.slice(-3))/8,
      },signature)
    : algorithm.startsWith('ES')
      ? verifySignature(digest,signingInput,{...keyOptions,dsaEncoding:'ieee-p1363'},signature)
      : verifySignature(digest,signingInput,keyOptions.key,signature)
  if (!verified) throw new Error('decode-token: JWT signature verification failed')
  if (flags.checkExpiry) verifyTimestamp(payload, (flags.now??Date.now)()/1000)
  return {header,payload,verifiedKid:kid??'(none)'}
}
function parseCli(argv: readonly string[],env:NodeJS.ProcessEnv): {
  token?: string;help:boolean;flags:VerifyFlags
} {
  let token: string|undefined
  const flags: VerifyFlags={
    verify:true,checkExpiry:true,header:false,
    apiUrl:env.ANTHROPIC_BASE_URL??'https://api.anthropic.com',
  }
  let help=false
  for(let i=0;i<argv.length;i++){
    const arg=argv[i]
    switch(arg){
      case '--help':case '-h':help=true;break
      case '--header':flags.header=true;break
      case '--no-verify':flags.verify=false;break
      case '--verify':flags.verify=true;break
      case '--no-check-expiry':flags.checkExpiry=false;break
      case '--api-url': {
        const url=argv[++i]
        if(!url) throw new Error('decode-token: --api-url requires a value')
        flags.apiUrl=url
        break
      }
      default:
        if(arg.startsWith('-')) throw new Error('decode-token: unknown option '+arg)
        if(token!==undefined) throw new Error('decode-token: only one token may be provided')
        token=arg
    }
  }
  return {token,help,flags}
}
const HELP = [
  'Usage: claude self-hosted-runner decode-token [token] [options]',
  '',
  'Decode a session-ingress JWT and print its claims as JSON to stdout.',
  'Token source: positional argument, CLAUDE_CODE_SESSION_ACCESS_TOKEN, or stdin.',
  '  --header           Print the JWT header instead of claims',
  '  --no-verify        Skip signature verification (offline inspection only)',
  '  --no-check-expiry  Skip exp/nbf checking; signature verification remains enabled',
  '  --api-url <url>    Base URL for JWKS fetch',
  '  --verify           Verify the signature (default)',
  '  --help, -h         Show this help message',
].join('\n')
export async function selfHostedRunnerDecodeTokenMain317(argv: readonly string[],
  env: NodeJS.ProcessEnv=process.env): Promise<void> {
  const parsed=parseCli(argv,env)
  if(parsed.help){stdout.write(HELP+'\n');return}
  let token=parsed.token || env.CLAUDE_CODE_SESSION_ACCESS_TOKEN
  if(!token && !stdin.isTTY){
    const chunks:Buffer[]=[]
    for await(const item of stdin) chunks.push(Buffer.isBuffer(item)?item:Buffer.from(item))
    token=Buffer.concat(chunks).toString('utf8').trim()
  }
  if(!token) throw new Error('decode-token: no token supplied. Pass it as an argument, '+
    'pipe it on stdin, or set $CLAUDE_CODE_SESSION_ACCESS_TOKEN.')
  const result=await decodeSessionToken317(token,parsed.flags)
  stdout.write(JSON.stringify(parsed.flags.header?result.header:result.payload,null,2)+'\n')
  if(result.verifiedKid){
    stderr.write('verified (kid='+result.verifiedKid+', '+
      (parsed.flags.checkExpiry?'sig+exp':'sig')+')\n')
  }
}
