// Authored first-person characters. No external AI or simulated repair states.
export const dialogueData = Object.freeze({
  cactus: { speaker: 'SPIKE', role: 'PIPE ORGAN CACTUS', intro: "I'm Spike. Resident cactus, unofficial security officer. Welcome aboard, intern. Mind the personal space.", lines: [
    "I've been standing guard all shift. Nobody has offered me a chair.",
    "Moss says I should relax. Easy advice from someone with a portable house."
  ] },
  'desert-cactus': { speaker: 'BLOOM', role: 'FLOWERING CACTUS', intro: "I'm Bloom. Yes, a cactus can have flowers and boundaries. Nice to meet you.", lines: [
    "Spike handles security. I handle looking excellent under glass.",
    "You can admire the flowers. Picking them would make this introduction awkward."
  ] },
  console: { speaker: 'PATCH', role: 'RESEARCH CONSOLE', intro: "I'm Patch, your research console. I've been warned about interns. Let's start by learning where everything is.", lines: [
    "I have many buttons. We do not need to meet all of them today.",
    "Scout brings me samples. You bring me questions. I prefer both with labels."
  ] },
  rover: { speaker: 'SCOUT', role: 'SURVEY ROVER', intro: "I'm Scout. I collect lunar samples and try to avoid interns. Please leave my wheels some room.", lines: [
    "Another rock collected. Pebble insists it's a distant cousin.",
    "If you follow me, watch your feet. I only came with wheels."
  ] },
  tortoise: { speaker: 'MOSS', role: 'RESIDENT TORTOISE', intro: "I'm Moss. Resident tortoise, independent explorer. My expedition is slower than Scout's, but the accommodation is better.", lines: [
    "No rush. The Moon has been here a while.",
    "Spike calls this loitering. I call it field research."
  ] },
  astronaut: { speaker: 'DR VALE', role: 'RESEARCH SCIENTIST', intro: "I'm Dr Vale. Welcome to Habitat 07. Learn the station first. We'll leave the heroic button pressing for later.", lines: [
    "Patch is helpful. That does not mean every flashing light needs your attention.",
    "If the plants start giving career advice, listen. They've survived more shifts than you."
  ] },
  flowers: { speaker: 'PETAL', role: 'CACTUS FLOWERS', intro: "I'm Petal, Spike's flowering neighbor. He does the intimidating part. I do the dramatic entrance.", lines: [
    "Please don't confuse small with unimportant. I have a whole personality down here.",
    "Bloom says my petals are theatrical. Coming from Bloom, that's a compliment."
  ] },
  marigold: { speaker: 'SUNNY', role: 'DESERT MARIGOLD', intro: "I'm Sunny, the desert marigold. A little sunlight, a little water, and a very long way from home.", lines: [
    "Ray collects sunlight for the station. I collect it for myself. Fair arrangement.",
    "I recommend growing toward the light. Career advice included."
  ] },
  rocks: { speaker: 'THE CORE SAMPLES', role: 'ROCK CLUSTER', intro: "We're the Core Samples. Three very experienced rocks. We've been doing geology longer than anyone here.", lines: [
    "Scout keeps asking if we're related to his latest sample. It's a complicated family tree.",
    "We have unanimously voted to remain exactly here."
  ] },
  rock: { speaker: 'PEBBLE', role: 'LUNAR ROCK', intro: "I'm Pebble. Geological specimen, excellent listener. Apparently that makes me qualified to mentor an intern.", lines: [
    "My advice? Stay grounded. I've built an entire career on it.",
    "Dr Vale calls me fascinating. Scout calls me cargo. I'm choosing the first opinion."
  ] },
  pod: { speaker: 'CAPSULE', role: 'RESEARCH POD', intro: "I'm Capsule, the research pod. I keep things contained. That includes samples, equipment, and occasionally my opinions.", lines: [
    "Captain calls himself important. I prefer dependable.",
    "A sealed lid is a boundary. Spike and I agree on that."
  ] },
  'command-pod': { speaker: 'CAPTAIN', role: 'COMMAND POD', intro: "I'm Captain, the command pod. The title came with the equipment. I promise to use it responsibly.", lines: [
    "Patch has the buttons. I have the title. We make an excellent management team.",
    "Capsule says I take myself too seriously. A command pod must maintain standards."
  ] },
  'solar-panel': { speaker: 'RAY', role: 'SOLAR ARRAY', intro: "I'm Ray. I collect sunlight for the station. Yes, even solar panels enjoy a little recognition.", lines: [
    "Sunny and I share a hobby. Mine comes with cables.",
    "Watt saves my work for later. A good colleague, if a little highly strung."
  ] },
  'power-cell': { speaker: 'WATT', role: 'POWER CELL', intro: "I'm Watt. I store the station's energy. Please bring curiosity, not a screwdriver. Relay shares my radio uplink.", lines: [
    "Ray does the collecting. I do the saving. Neither of us approves of waste.",
    "Relay lives upstairs and still expects me to take his calls."
  ] },
  dish: { speaker: 'RELAY', role: 'ROOFTOP RADIO DISH', intro: "I'm Relay, the dish above the dome. I'm speaking through Watt's uplink. Welcome to the long-distance department.", lines: [
    "I point at space all day. Someone has to keep an eye on the neighbors.",
    "Watt says I talk too much. For a communications dish, I consider that praise."
  ] }
});

export const dialogueRoster = Object.freeze([
  { model: 'cactus', id: 'cactus', radius: 3.4 },
  { model: 'desertCactus', id: 'desert-cactus', radius: 3.4 },
  { model: 'controlCenter', id: 'console', radius: 5.5 },
  { model: 'rover', id: 'rover', radius: 5.5 },
  { model: 'tortoise', id: 'tortoise', radius: 3.4 },
  { model: 'astronautPoly', id: 'astronaut', radius: 4 },
  { model: 'flowers', id: 'flowers', radius: 3.4 },
  { model: 'marigold', id: 'marigold', radius: 3.4 },
  { model: 'rocks', id: 'rocks', radius: 4.5 },
  { model: 'rock', id: 'rock', radius: 3.4 },
  { model: 'pod', id: 'pod', radius: 5.5 },
  { model: 'commandPod', id: 'command-pod', radius: 5 },
  { model: 'solarPanel', id: 'solar-panel', radius: 5 },
  { model: 'powerCell', id: 'power-cell', radius: 5 },
  // The exterior rooftop dish is heard through a reachable, visible uplink.
  { model: 'dish', id: 'dish', radius: 5, anchor: 'powerCell', visibilityId: 'power-cell' }
]);

// Brief first meetings retain identity without assuming the shift is onboarding.
const firstMeetings = Object.freeze({
  cactus: "I'm Spike. Resident cactus, unofficial security officer.",
  'desert-cactus': "I'm Bloom. Flowers and boundaries included.",
  console: "I'm Patch, your research console. Lab cooling is handled here.",
  rover: "I'm Scout, the survey rover. Please leave my wheels some room.",
  tortoise: "I'm Moss. Resident tortoise, independent explorer.",
  astronaut: "Dr Vale. Research scientist. Keep an eye on life support, intern.",
  flowers: "I'm Petal, Spike's flowering neighbor.",
  marigold: "I'm Sunny, the desert marigold. A long way from home.",
  rocks: "We're the Core Samples. Very experienced rocks.",
  rock: "I'm Pebble. Geological specimen, excellent listener.",
  pod: "I'm Capsule, the research pod. The oxygen regulator is here.",
  'command-pod': "I'm Captain, the command pod. The title came with the equipment.",
  'solar-panel': "I'm Ray. I collect sunlight for the station.",
  'power-cell': "I'm Watt. Power service and Relay's uplink are here.",
  dish: "I'm Relay, the rooftop dish. You're hearing me through Watt's uplink.",
});

export function orientationIntroduction(context) {
  if (!context) return true;
  const shift = context.shift;
  const orientation = shift?.difficultyStage?.id === 'orientation' ||
    (!shift?.difficultyStage && Number.isFinite(shift?.elapsed) && shift.elapsed < 90);
  return shift?.status === 'running' && orientation && !Object.values(context.systems ?? {}).some(system => system?.needsRepair);
}

export function dialogueLine(id, encounter, context) {
  const data = dialogueData[id];
  if (!data) throw new Error(`Unknown dialogue character: ${id}`);
  return encounter <= 0 ? (orientationIntroduction(context) ? data.intro : firstMeetings[id]) : data.lines[(encounter - 1) % data.lines.length];
}
