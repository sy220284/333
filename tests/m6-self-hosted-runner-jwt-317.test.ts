import {test,expect} from 'bun:test'
import {generateKeyPairSync,sign} from 'node:crypto'
import {decodeSessionToken317} from '../src/cli/selfHostedRunner/decodeToken317.ts'

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048})
const jwk={...publicKey.export({format:'jwk'}),kid:'original-jwk-1',alg:'RS256',use:'sig'}
const enc=(object:unknown)=>Buffer.from(JSON.stringify(object)).toString('base64url')
function makeToken(payload:Record<string,unknown>, signature?:string){
  const input=enc({alg:'RS256',kid:'original-jwk-1',typ:'JWT'})+'.'+enc(payload)
  return input+'.'+(signature??sign('sha256',Buffer.from(input),privateKey).toString('base64url'))
}
const fetchJwks=(async()=>Response.json({keys:[jwk]})) as typeof fetch
const base={
  verify:true,checkExpiry:true,header:false,apiUrl:'https://runner.example.test',
  fetchImpl:fetchJwks,now:()=>1_786_000_000_000,
}

test('317 JWT verifies a real RSA signature against the exact JWKS and expiry',async()=>{
  const token=makeToken({sub:'session_123',exp:1_900_000_000,nbf:1_780_000_000})
  const value=await decodeSessionToken317('sk-ant-si-'+token,base)
  expect(value.payload.sub).toBe('session_123')
  expect(value.verifiedKid).toBe('original-jwk-1')
  const cc=await decodeSessionToken317('sk-ant-cc-'+token,base)
  expect(cc.payload).toEqual(value.payload)
})

test('317 JWT declines signatures, unknown keys and expired or future tokens',async()=>{
  await expect(decodeSessionToken317(makeToken({exp:1_900_000_000},'invalid'),base))
    .rejects.toThrow('signature')
  await expect(decodeSessionToken317(makeToken({exp:100}),base))
    .rejects.toThrow('expired')
  await expect(decodeSessionToken317(makeToken({nbf:2_000_000_000}),base))
    .rejects.toThrow('not valid yet')
  await expect(decodeSessionToken317(makeToken({exp:100}),{...base,checkExpiry:false}))
    .resolves.toHaveProperty('verifiedKid','original-jwk-1')
  await expect(decodeSessionToken317(makeToken({exp:1_900_000_000}),{
    ...base,fetchImpl:(async()=>Response.json({keys:[]})) as typeof fetch,
  })).rejects.toThrow('matching signing key')
  await expect(decodeSessionToken317('a.b.c',base)).rejects.toThrow('header')
})

test('317 JWT --no-verify only decodes, and never treats it as a verified identity',async()=>{
  const token=makeToken({exp:1},'invalid')
  const decoded=await decodeSessionToken317(token,{...base,verify:false})
  expect(decoded.payload.exp).toBe(1)
  expect(decoded.verifiedKid).toBeUndefined()
  await expect(decodeSessionToken317('no.jwt', {...base,verify:false})).rejects.toThrow()
})

test('317 JWT rejects unsigned algorithm and enforces allowed JWKS origin',async()=>{
  const token=enc({alg:'none',kid:'original-jwk-1'})+'.'+enc({sub:'bad'})+'.invalid'
  await expect(decodeSessionToken317(token,base)).rejects.toThrow('algorithm')
  await expect(decodeSessionToken317(makeToken({sub:'foo'}),{...base,
    apiUrl:'file:///etc/passwd'})).rejects.toThrow('URL')
})
