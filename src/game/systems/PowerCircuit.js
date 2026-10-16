/** Readable diagnosis variants. The run planner supplies a seeded random stream. */
export function createPowerCircuit(random = Math.random, previous = null) {
  const pick = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid circuit random value');
    return Math.floor(value * 3);
  };
  let damaged = pick(), backup = pick();
  const requiredVoltage = [24,48,72][pick()];
  // A retry never gets the identical pair, even with unlucky random draws.
  if (previous && previous.damaged === damaged && previous.backup === backup) damaged = (damaged+1)%3;
  const feeds = Object.freeze(['A','B','C'].map((name,index) => Object.freeze({
    id:`feed-${name}`, label:`Feed ${name}`, tripped:index===damaged,
    voltage:index===damaged ? 0 : requiredVoltage,
  })));
  const banks = Object.freeze(['A','B','C'].map((name,index) => Object.freeze({
    id:`bank-${name}`, label:`Backup ${name}`,
    voltage:[24,48,72][([24,48,72].indexOf(requiredVoltage)+index-backup+3)%3],
  })));
  return Object.freeze({damaged,backup,requiredVoltage,feeds,banks});
}
