/**
 * Recover bytes emitted by an independent PTY host while its supervisor was
 * unavailable. The host sends a bounded replay of its recent output on
 * reconnect. Compare it with the persisted log suffix before appending.
 * KMP keeps the check linear even for long repetitive terminal output.
 */
export function unrecordedPtyReplay317(
  persistedTail:Buffer,replay:Buffer,
):Buffer{
  if(replay.length===0)return Buffer.alloc(0)
  const prefix=new Uint32Array(replay.length)
  let m=0
  for(let i=1;i<replay.length;i++){
    const byte=replay[i]!
    while(m>0&&replay[m]!==byte)m=prefix[m-1]!
    if(replay[m]===byte)m++
    prefix[i]=m
  }
  m=0
  for(let i=0;i<persistedTail.length;i++){
    const byte=persistedTail[i]!
    while(m>0&&(m===replay.length||replay[m]!==byte))m=prefix[m-1]!
    if(replay[m]===byte)m++
  }
  return replay.subarray(m)
}
