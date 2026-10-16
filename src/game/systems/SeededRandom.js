export function normalizeRunSeed(value) {
  if(typeof value!=='string')return null;
  const seed=value.trim().toUpperCase();
  return /^LUNA-[0-9A-F]{8}$/.test(seed)?seed:null;
}

export function createRunSeed(previous=null, cryptoSource=globalThis.crypto) {
  const bytes=new Uint32Array(1);cryptoSource.getRandomValues(bytes);
  let value=bytes[0];
  if(`LUNA-${value.toString(16).padStart(8,'0').toUpperCase()}`===previous)value=(value^0x9e3779b9)>>>0;
  return `LUNA-${value.toString(16).padStart(8,'0').toUpperCase()}`;
}

/** FNV-1a namespace hashing plus Mulberry32. Versioned plans keep replay stable. */
export function seededRandom(seed, namespace='') {
  const canonical=normalizeRunSeed(seed);if(!canonical)throw new Error('Invalid run seed');
  let state=0x811c9dc5;
  for(const char of `${canonical}/${namespace}`)state=Math.imul(state^char.charCodeAt(0),0x01000193)>>>0;
  return ()=>{
    state=(state+0x6d2b79f5)>>>0;
    let value=state;value=Math.imul(value^(value>>>15),value|1);
    value^=value+Math.imul(value^(value>>>7),value|61);
    return ((value^(value>>>14))>>>0)/4294967296;
  };
}
