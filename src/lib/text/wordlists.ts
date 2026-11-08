/**
 * Small, embedded English word lists used by the rule-based blank selector.
 *
 * FREQUENCY_LIST is an approximate frequency ordering of everyday English
 * vocabulary (most common first), compiled for this project from general
 * spoken/written frequency knowledge. It is a heuristic, not a corpus-exact
 * ranking: a word's position is used only to separate "very common",
 * "common" and "less common / unlisted" vocabulary.
 */

const words = (s: string) => s.trim().split(/\s+/);

/** Function words that are never blanked on their own. */
export const STOP_WORDS: ReadonlySet<string> = new Set(
  words(`
  a an the and or but nor so yet if then than because as while though although
  of to in on at by for with from into onto upon about above below over under
  between among through during before after since until till against without within
  across along around behind beyond near off out up down toward towards via per
  i me my mine myself you your yours yourself yourselves he him his himself she her
  hers herself it its itself we us our ours ourselves they them their theirs themselves
  this that these those who whom whose which what whatever whoever whichever
  am is are was were be been being have has had having do does did doing done
  will would shall should can could may might must ought
  i'm you're he's she's it's we're they're i've you've we've they've i'd you'd
  he'd she'd we'd they'd i'll you'll he'll she'll we'll they'll it'll that's
  there's here's what's who's let's isn't aren't wasn't weren't don't doesn't
  didn't haven't hasn't hadn't won't wouldn't can't cannot couldn't shouldn't
  mustn't mightn't
  not no yes oh ah uh um hmm okay ok yeah
  there here where when why how all any both each few more most other some such
  own same too very just also only even ever still again once every many much
  another less least lot
  s t d ll m re ve
`),
);

export const FREQUENCY_LIST: readonly string[] = words(`
  time people way year day thing man world life hand part child eye woman place
  work week case point number group problem fact know get make go see come think
  look want give use find tell ask seem feel try leave call good new first last
  long great little old big high different small large next early young important
  public bad able right sure real best better home school family state student
  country money story house night water room mother father area book job word
  business issue side kind head friend hour game line end member law car city
  community name president team minute idea kid body information back parent face
  others level office door health person art war history party result change
  morning reason research girl guy moment air teacher force education foot boy age
  policy everything process music market sense nation plan college interest death
  experience effect class control care field development role effort rate heart
  drug show leader light voice wife police mind price report decision son view
  relationship town road arm difference value building action model season society
  tax director position player record paper space ground form event official matter
  center couple site project activity star table need court oil situation cost
  industry figure street image phone data picture practice piece land product
  doctor wall patient worker news test movie north love support technology step
  baby computer type attention film tree source organization hair window evidence
  population truth song bit language
  say said says saying tell told talk talked speak spoke spoken hear heard listen
  listened read write wrote written learn learned learnt teach taught study studied
  understand understood remember remembered forget forgot forgotten believe believed
  mean meant need needed keep kept let put bring brought begin began begun start
  started show showed shown hold held stand stood turn turned move moved live
  lived happen happened become became run ran walk walked sit sat stay stayed
  open opened close closed play played pay paid buy bought sell sold send sent
  build built spend spent grow grew grown lose lost win won wait waited watch
  watched follow followed stop stopped create created offer offered love loved
  like liked help helped allow allowed add added change changed lead led carry
  carried break broke broken fall fell fallen cut reach reached kill killed
  remain remained suggest suggested raise raised pass passed decide decided
  return returned explain explained hope hoped develop developed drive drove
  driven eat ate eaten drink drank sleep slept wake woke choose chose chosen
  thought knew known got gotten made went gone saw seen came took taken gave
  given found felt left tried asked used looked wanted worked called seemed
  yesterday today tomorrow tonight always never often sometimes usually really
  actually probably maybe perhaps already almost enough quite rather pretty
  together soon later early late away else anyway instead certainly especially
  finally simply exactly recently suddenly quickly slowly easily nearly clearly
  definitely basically
  happy sad nice beautiful hard easy free full special clear whole strong possible
  certain human local late open hot cold warm short low dark white black red
  green blue true false main major serious ready simple available likely natural
  similar central recent popular entire private difficult personal common physical
  final huge wrong single safe dead deep rich poor fine wide heavy hungry tired
  busy quiet loud angry afraid excited interested interesting boring amazing
  wonderful terrible funny strange lucky careful
  food breakfast lunch dinner coffee tea weather rain sun sky sea river city
  village street office shop store restaurant hotel hospital station airport train
  bus plane ticket trip holiday vacation journey weekend birthday party gift
  question answer example rule chance choice mistake plan dream goal future past
  present minute second month summer winter spring autumn fall season clothes shirt
  shoes bag box letter email message phone camera picture photo screen video
  internet website app class lesson homework exam teacher library university
  company manager boss customer meeting interview salary career skill habit
  friendship neighbor neighbour brother sister husband daughter uncle aunt cousin
  animal dog cat bird fish garden flower forest mountain island beach ocean
  country capital culture tradition festival holiday weekend
`);

const FREQUENCY_RANK: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  FREQUENCY_LIST.forEach((w, i) => {
    if (!map.has(w)) map.set(w, map.size);
  });
  return map;
})();

export const FREQUENCY_LIST_SIZE = FREQUENCY_RANK.size;

/** Rank in the embedded frequency list (0 = most common) or null when the word is unlisted. */
export function frequencyRank(lower: string): number | null {
  const direct = FREQUENCY_RANK.get(lower);
  if (direct !== undefined) return direct;
  // Light inflection fallback: "books" → "book", "watching" → "watch", "smiled" → "smile".
  for (const base of baseCandidates(lower)) {
    const r = FREQUENCY_RANK.get(base);
    if (r !== undefined) return r;
  }
  return null;
}

function baseCandidates(w: string): string[] {
  const out: string[] = [];
  if (w.endsWith("ies") && w.length > 4) out.push(w.slice(0, -3) + "y");
  if (w.endsWith("es") && w.length > 3) out.push(w.slice(0, -2));
  if (w.endsWith("s") && w.length > 3) out.push(w.slice(0, -1));
  if (w.endsWith("ing") && w.length > 5) out.push(w.slice(0, -3), w.slice(0, -3) + "e");
  if (w.endsWith("ed") && w.length > 4) out.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith("ly") && w.length > 4) out.push(w.slice(0, -2));
  return out;
}

/** Common verbs (base and frequent inflections) used to recognise verb-like tokens. */
export const COMMON_VERBS: ReadonlySet<string> = new Set(
  words(`
  say said tell told talk speak spoke hear heard listen read write wrote learn
  learned teach taught study understand understood remember forget forgot believe
  mean meant need keep kept let put bring brought begin began start show hold held
  stand stood turn move live happen become became run ran walk sit sat stay open
  close play pay paid buy bought sell sold send sent build built spend spent grow
  grew lose lost win won wait watch follow stop create offer love like help allow
  add change lead led carry break broke fall fell cut reach kill remain suggest
  raise pass decide return explain hope develop drive drove eat ate drink drank
  sleep slept wake woke choose chose know knew get got make made go went gone see
  saw seen come came take took taken give gave given find found feel felt leave
  left try tried ask asked use used look looked want wanted work worked call called
  seem seemed think thought pick figure set check sign give find point turn carry
  fill hang settle slow speed sort work wake set
`),
);

/** Particles that combine with a preceding verb into a phrasal verb. */
export const PARTICLES: ReadonlySet<string> = new Set(
  words(`up out off down over back away on in around through along`),
);

/**
 * Fixed multiword expressions. Matched case-insensitively against consecutive
 * word tokens; longest match wins.
 */
export const PHRASES: readonly string[] = [
  "a lot of",
  "lots of",
  "kind of",
  "sort of",
  "in order to",
  "as well as",
  "as soon as",
  "as long as",
  "at least",
  "at last",
  "at all",
  "at first",
  "at the same time",
  "in fact",
  "of course",
  "for example",
  "for instance",
  "in front of",
  "next to",
  "instead of",
  "because of",
  "according to",
  "in addition",
  "on the other hand",
  "by the way",
  "all of a sudden",
  "as a result",
  "in the end",
  "at the end of",
  "used to",
  "going to",
  "have to",
  "has to",
  "had to",
  "want to",
  "be able to",
  "look forward to",
  "get rid of",
  "take care of",
  "pay attention to",
  "make sure",
  "find out",
  "figure out",
  "come up with",
  "give up",
  "pick up",
  "set up",
  "turn out",
  "look after",
  "look for",
  "deal with",
  "end up",
  "carry on",
  "run out of",
  "keep in mind",
  "right now",
  "each other",
  "one another",
  "more or less",
  "sooner or later",
  "every day",
  "once in a while",
  "from time to time",
  "no longer",
  "even though",
  "as if",
  "so that",
  "rather than",
  "a little bit",
  "a couple of",
];
