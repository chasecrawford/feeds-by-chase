/**
 * ============================================================================
 *  FEED DEFINITIONS  —  edit this file to recreate / tune your SkyFeed feeds
 * ============================================================================
 *
 * Each feed can be defined two ways:
 *
 *   (a) RAW REGEX (faithful to SkyFeed's "Regex" block):
 *       includeRegex / excludeRegex — pasted straight from SkyFeed. Use
 *       String.raw`...` so backslashes don't need doubling.
 *
 *   (b) KEYWORD LISTS (convenience for simple feeds):
 *       include / exclude — arrays of terms, matched with word boundaries.
 *       Prefix a term with "#" to require it as a hashtag.
 *
 * If both are present for a side, the regex wins.
 *
 * Other fields:
 *   - blockLists:   at:// graph.list URIs. Posts whose AUTHOR is a member are
 *                   dropped (SkyFeed "Remove authors in list" block). Members
 *                   are fetched on startup and refreshed periodically.
 *   - regexFlags:   flags for raw regex. Default 'is' (case-insensitive +
 *                   dotAll, so co-occurrence matches across line breaks).
 *   - langs:        keep only these post languages (default: any).
 *   - allowReplies: include replies (default: false).
 */

export interface FeedDef {
  shortname: string
  // Existing app.bsky.feed.generator record key to migrate IN PLACE. When set,
  // `npm run publish` repoints that existing feed (keeping its followers, likes,
  // avatar, and creation date) to this self-hosted service instead of creating
  // a new feed. Leave unset to publish a brand-new feed under `shortname`.
  rkey?: string
  displayName: string
  description: string
  includeRegex?: string
  excludeRegex?: string
  include?: string[]
  exclude?: string[]
  regexFlags?: string
  blockLists?: string[]
  langs?: string[]
  allowReplies?: boolean
}

export const FEEDS: FeedDef[] = [
  {
    // SkyFeed original: "Louisville Football" (rkey aaaps4w6ssniy)
    shortname: 'uofl-football',
    rkey: 'aaaps4w6ssniy', // migrate in place (keeps followers/likes)
    displayName: 'Louisville Football',
    description:
      'Posts that contain keywords related to the University of Louisville football team sorted chronologically',
    // Built from the SkyFeed export, then trimmed/refreshed (2026-06-05):
    // dropped last season's opponents + departed players; kept the durable
    // core; added verified 2026 well-known players and the football venue.
    // Each line below is one alternative; they're joined with "|".
    //
    // ROSTER MAINTENANCE:
    //   - Add a player with a distinctive name (standalone):  String.raw`\bkienholz\b`
    //   - Add a player with a common name (scope to Louisville, both orders):
    //       String.raw`\b(louisville\b.{0,500}\bisaac\b\W+\bbrown)\b`,
    //       String.raw`\b(isaac\b\W+\bbrown\b.{0,500}\blouisville)\b`,
    //   - Add a seasonal OPPONENT (game-week, both orders), e.g. EKU:
    //       String.raw`\b(louisville\b.*?\s*.*?\beku)\b`,
    //       String.raw`\b(eku\b.*?\s*.*?\blouisville)\b`,
    //   2026 opponents on file: Ole Miss, Villanova, SMU, Wake Forest, NC State,
    //   Florida State, Syracuse, Stanford, Georgia Tech, North Carolina, Pitt, Kentucky.
    //   Removed players (re-add if back): miller moss, stanquan, caullin lacy, chris bell.
    includeRegex: [
      // Coach (evergreen)
      String.raw`\bbrohm\b`,
      // Core: louisville + football, either order
      String.raw`\b(louisville\b.{0,500}\bfootball)\b`,
      String.raw`\b(football\b.{0,500}\blouisville)\b`,
      // Card Chronicle (SB Nation Louisville) + football
      String.raw`\b(cardchronicle.com\b.{0,500}\bfootball)\b`,
      String.raw`\b(football\b.{0,500}\bcardchronicle.com)\b`,
      // Well-known 2026 players — distinctive names, standalone
      String.raw`\bkienholz\b`, // Lincoln Kienholz, QB
      String.raw`\bclev\b\W+\blubin\b`, // Clev Lubin, EDGE
      String.raw`\btayon\b\W+\bholloway\b`, // Tayon Holloway, CB
      // Isaac Brown, RB — common name, scoped to Louisville context
      String.raw`\b(louisville\b.{0,500}\bisaac\b\W+\bbrown)\b`,
      String.raw`\b(isaac\b\W+\bbrown\b.{0,500}\blouisville)\b`,
      // Football venue (football-specific)
      String.raw`\bcardinals?\b\W+\bstadium\b`,
      String.raw`\bl&n\b\W+(?:federal\W+credit\W+union\W+)?stadium\b`,
    ].join('|'),
    // Excludes: filter non-UofL-football noise that trips louisville×football —
    // other "football" leagues (UFL), the pro/spring "Louisville Kings" team,
    // soccer (Louisville City FC / USL), the St. Louis Cardinals' & other schools'
    // "Cardinal Stadium" (vs UofL's), and radio "now playing" bots (musician BROHM).
    excludeRegex: String.raw`racing louisville|louisville-area|brohm ridge|#tennesseesports|sportskeeda|#spartans|inmate|prison|united football league|\bufl\b|louisville city|\busl\b|\blegion\b|\blouisville\b\W+\bkings\b|st\.?\s*louis|robertson high|#nowplaying`,
    blockLists: [
      'at://did:plc:7csbewiebijimkryjynrmtc2/app.bsky.graph.list/3lxcbpfhbbd2w',
    ],
    langs: ['en'],
    allowReplies: false,
  },
  {
    // SkyFeed original: "Louisville Basketball" (rkey aaalxyswlqxco)
    // From the exact SkyFeed regex, refreshed for 2026-27 (2026-06-03):
    // removed departed players, added current well-known names + the arena.
    // ROSTER MAINTENANCE: player names churn yearly — review each season.
    //   Distinctive name -> standalone: String.raw`\bbidunga\b`
    //   Common surname   -> full name:  String.raw`\btaj\b\W+\broberts\b`
    // Removed (re-add if they return): Mikel Brown Jr (2026 NBA draft),
    //   Kasean Pryor (transfer portal / out of eligibility).
    shortname: 'uofl-basketball',
    rkey: 'aaalxyswlqxco', // migrate in place (keeps followers/likes)
    displayName: 'Louisville Basketball',
    description:
      'Posts that contain keywords related to the University of Louisville basketball teams sorted chronologically',
    includeRegex: [
      // Coaches (current)
      String.raw`\bpat\b\W+\bkelsey\b`, // Pat Kelsey (men's HC)
      String.raw`\bjeff\b\W+\bwalz\b`, // Jeff Walz (women's HC)
      // Well-known players (2026-27, roster-dependent — review each season)
      // Men's:
      String.raw`\bbidunga\b`, // Flory Bidunga, F/C (distinctive)
      String.raw`\bshelstad\b`, // Jackson Shelstad, G (distinctive)
      String.raw`\bkarter\b\W+\bknox\b`, // Karter Knox, wing (full name)
      // Women's:
      String.raw`\bmackenly\b\W+\brandolph\b`, // Mackenly Randolph, F
      String.raw`\bimari\b\W+\bberry\b`, // Imari Berry, G
      String.raw`\btaj\b\W+\broberts\b`, // Taj Roberts, G
      // Arena (basketball-specific venue) — scoped to a UofL/basketball signal so
      // concerts at the Yum Center (Weird Al, Billy Strings, etc.) don't match.
      String.raw`\b(yum\b\W+\bcenter\b.{0,500}\b(?:louisville|uofl|cards?|cardinals|basketball|hoops|kelsey|walz)\b)`,
      String.raw`\b((?:louisville|uofl|cards?|cardinals|basketball|hoops|kelsey|walz)\b.{0,500}\byum\b\W+\bcenter)\b`,
      // louisville × {basketball, hoops, 2013 champion} — bounded gap (.{0,500})
      // so the two words must co-occur within one post/headline, not across a
      // whole shared article's concatenated link-card text.
      String.raw`\b(louisville\b.{0,500}\bbasketball)\b`,
      String.raw`\b(basketball\b.{0,500}\blouisville)\b`,
      String.raw`\b(louisville\b.{0,500}\bhoops)\b`,
      String.raw`\b(hoops\b.{0,500}\blouisville)\b`,
      String.raw`\b(louisville\b.{0,500}\b2013\b\W+\bchampion)\b`,
      String.raw`\b(2013\b\W+\bchampion\b.{0,500}\blouisville)\b`,
      // uofl × {basketball, hoops, 2013 champion}
      String.raw`\b(uofl\b.{0,500}\bbasketball)\b`,
      String.raw`\b(basketball\b.{0,500}\buofl)\b`,
      String.raw`\b(uofl\b.{0,500}\bhoops)\b`,
      String.raw`\b(hoops\b.{0,500}\buofl)\b`,
      String.raw`\b(uofl\b.{0,500}\b2013\b\W+\bchampion)\b`,
      String.raw`\b(2013\b\W+\bchampion\b.{0,500}\buofl)\b`,
      // cardchronicle.com × {basketball, hoops, 2013 champion}
      String.raw`\b(cardchronicle.com\b.{0,500}\bbasketball)\b`,
      String.raw`\b(basketball\b.{0,500}\bcardchronicle.com)\b`,
      String.raw`\b(cardchronicle.com\b.{0,500}\bhoops)\b`,
      String.raw`\b(hoops\b.{0,500}\bcardchronicle.com)\b`,
      String.raw`\b(cardchronicle.com\b.{0,500}\b2013\b\W+\bchampion)\b`,
      String.raw`\b(2013\b\W+\bchampion\b.{0,500}\bcardchronicle.com)\b`,
    ].join('|'),
    excludeRegex: String.raw`scam|rawchili.com`,
    blockLists: [
      'at://did:plc:7csbewiebijimkryjynrmtc2/app.bsky.graph.list/3lxcbpfhbbd2w',
    ],
    langs: ['en'],
    allowReplies: false,
  },
  {
    // SkyFeed original: "Alien: Earth (spoilers)" (rkey aaaf2gyhpeav6)
    // Exact SkyFeed regex. Uses character-name co-occurrence to disambiguate
    // common names (Wendy/Isaac/Arthur/Slightly/etc.). Add new characters as
    // standalone (distinctive) or co-occurrence (common) lines as seasons air.
    shortname: 'alien-earth',
    rkey: 'aaaf2gyhpeav6', // migrate in place (keeps followers/likes)
    displayName: 'Alien: Earth (spoilers)',
    description:
      'A chronological feed of commentary on Alien: Earth (TV Show). Likely contains spoilers #AlienEarth',
    includeRegex: [
      // Show / world / orgs
      String.raw`\balien\b\W+\bearth\b`,
      String.raw`\balienearth\b`,
      String.raw`\bprodigy\b\W+\bcorporation\b`,
      String.raw`\bkirsh\b`,
      String.raw`\bnew\b\W+\bsiam\b`,
      String.raw`\beyectopus\b`,
      String.raw`\beyeoctopus\b`,
      String.raw`\bmr.\b\W+\bstrawberry\b`,
      // Boy Kavalier (kavalier × boy/eye, both orders). Bounded gap (.{0,80}): the
      // names must co-occur within one phrase, not anywhere across a long shared
      // article's concatenated link-card text. (Unbounded .*?\s*.*? matched common
      // names — e.g. "Wendy Liu"+"hermit-kingdom", "Wendy Becker"+"Isaac Sherman" —
      // across whole articles, and was a regex-backtracking hazard.)
      String.raw`\b(kavalier\b.{0,80}\bboy)\b`,
      String.raw`\b(boy\b.{0,80}\bkavalier)\b`,
      String.raw`\b(kavalier\b.{0,80}\beye)\b`,
      String.raw`\b(eye\b.{0,80}\bkavalier)\b`,
      // Wendy × {nibs, curly, isaac, tootles, xenomorph, hermit, smee}
      String.raw`\b(wendy\b.{0,80}\bnibs)\b`,
      String.raw`\b(nibs\b.{0,80}\bwendy)\b`,
      String.raw`\b(wendy\b.{0,80}\bcurly)\b`,
      String.raw`\b(curly\b.{0,80}\bwendy)\b`,
      String.raw`\b(wendy\b.{0,80}\bisaac)\b`,
      String.raw`\b(isaac\b.{0,80}\bwendy)\b`,
      String.raw`\b(wendy\b.{0,80}\btootles)\b`,
      String.raw`\b(tootles\b.{0,80}\bwendy)\b`,
      String.raw`\b(wendy\b.{0,80}\bxenomorph)\b`,
      String.raw`\b(xenomorph\b.{0,80}\bwendy)\b`,
      String.raw`\b(wendy\b.{0,80}\bhermit)\b`,
      String.raw`\b(hermit\b.{0,80}\bwendy)\b`,
      String.raw`\b(wendy\b.{0,80}\bsmee)\b`,
      String.raw`\b(smee\b.{0,80}\bwendy)\b`,
      // NOTE: all "slightly ×" pairs were removed — "slightly" is too common a
      // word and caused false positives. This also dropped the morrow/egg/arthur
      // pairings, which only existed alongside slightly. To bring a character
      // back, pair it with a DISTINCTIVE anchor, e.g.:
      //   String.raw`\b(morrow\b.{0,80}\bxenomorph)\b`,
    ].join('|'),
    // Trimmed the Sept-2025 Kimmel "cancel-culture" excludes (stale + they
    // blocked legit renewal/cancellation news); kept glitchart. No language
    // filter — it's a globally-watched show.
    // KIRSH brand markers: the synth character "Kirsh" (\bkirsh\b above) collides
    // with the Korean streetwear brand KIRSH, which spams JP "KIRSH × Charmy Kitty"
    // Harajuku-flagship launch posts. These markers never appear in real Alien:Earth
    // chatter, so excluding them is safe. (原宿 = Harajuku, チャーミーキティ = Charmy Kitty.)
    excludeRegex: String.raw`glitchart|原宿|チャーミーキティ|charmy ?kitty|kirsh ?[×x]`,
    blockLists: [
      'at://did:plc:7csbewiebijimkryjynrmtc2/app.bsky.graph.list/3lxcbpfhbbd2w',
    ],
    allowReplies: false,
  },
]
