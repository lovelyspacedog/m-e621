/** Fair-use summaries of third-party site terms. Not legal advice; originals control. */

export interface TosSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface TosSummary {
  id: string;
  name: string;
  /** Official document URL; omit for in-app-only notes with no external original */
  sourceUrl?: string;
  /** Short label for the official document */
  sourceLabel: string;
  /** Optional caveat (e.g. site has Rules instead of a named TOS) */
  note?: string;
  sections: TosSection[];
}

export const tosIntro =
  "These are unofficial plain-language summaries for quick reference while browsing with PawDeck. They are not legal advice and may omit details. Always read the official document before uploading, scraping, or relying on a site’s rules.";

/**
 * Supported remote sites with a public terms-like document, plus Fluffle.
 * Tailspace.com has no public TOS page and is omitted.
 */
export const tosSummaries: TosSummary[] = [
  {
    id: "e621",
    name: "e621",
    sourceUrl: "https://e621.net/wiki_pages/e621:terms_of_service",
    sourceLabel: "Terms of Service",
    note: "Official wiki page last revised October 2, 2025. PawDeck summary checked against that revision; the live wiki always controls.",
    sections: [
      {
        heading: "Who it binds",
        paragraphs: [
          "Dragon Fruit Ventures LLC operates e621. Using the site (guest or registered) accepts these Terms of Use, the Code of Conduct, and the Privacy Policy.",
        ],
        bullets: [
          "18+ only",
          "Terms can change at any time; continued use after posting means acceptance",
          "You must keep account credentials confidential and not share login access",
        ],
      },
      {
        heading: "Your content",
        bullets: [
          "You keep ownership of uploads, but grant a limited license so the site can host, display, and moderate them",
          "Posts must follow Content Standards and the Code of Conduct",
          "Staff may remove content or disable accounts for violations",
        ],
      },
      {
        heading: "Prohibited use (high level)",
        bullets: [
          "Illegal activity; harming or exploiting minors",
          "Spam, impersonation, malware, or attacks on the service",
          "Bots/crawlers only for non-malicious use that follows their published API / bot guidelines",
        ],
      },
      {
        heading: "Liability and disputes",
        paragraphs: [
          "The service is provided as-is with disclaimers and liability limits. US/Canada users are under a special arbitration clause (individual claims; AAA); other users follow the jurisdiction terms in the full document. Claims generally must be brought within one year.",
        ],
      },
    ],
  },
  {
    id: "e6ai",
    name: "e6AI",
    sourceUrl: "https://e6ai.net/wiki_pages/2",
    sourceLabel: "Terms of Service",
    note: "Official wiki page last revised October 2, 2025. Structure matches e621; PawDeck summary checked against that revision.",
    sections: [
      {
        heading: "Who it binds",
        paragraphs: [
          "Also operated by Dragon Fruit Ventures LLC. Structure mirrors e621: Terms of Use plus Code of Conduct and Privacy Policy.",
        ],
        bullets: [
          "18+ only",
          "Changes take effect when posted; continued use accepts them",
          "Keep credentials confidential; do not share login access",
        ],
      },
      {
        heading: "Your content",
        bullets: [
          "Limited license for hosting/display/moderation; you retain ownership",
          "Must meet content standards and community rules",
          "Enforcement can include removal and account disablement",
        ],
      },
      {
        heading: "Prohibited use (high level)",
        bullets: [
          "Illegal activity; harming or exploiting minors",
          "Spam, impersonation, malware, or attacks on the service",
          "Bots/crawlers only for non-malicious use that follows their published API / bot guidelines",
        ],
      },
      {
        heading: "Liability and disputes",
        paragraphs: [
          "As-is service with disclaimers and liability limits. US/Canada users fall under a special arbitration clause; bring claims promptly (generally within one year). Read the e6AI original for AI-site-specific wording — do not assume every e621 sentence is identical.",
        ],
      },
    ],
  },
  {
    id: "furbooru",
    name: "Furbooru",
    sourceUrl: "https://furbooru.org/pages/rules",
    sourceLabel: "Rules of the Booru",
    note: "Furbooru does not publish a separate document titled Terms of Service. This summary covers their Rules of the Booru, which function as the site’s primary usage terms.",
    sections: [
      {
        heading: "Community",
        bullets: [
          "Be excellent: no trolling, slurs, or antagonistic attacks",
          "Respect artists: no unauthorized edits (including AI-only edits/upscales), no private/paywalled leaks, no commercial screencaps/scans",
        ],
      },
      {
        heading: "Tagging and content",
        bullets: [
          "Tag and source properly; ratings tags required",
          "Keep uploads furry-related (with limited, tagged exceptions)",
          "Raw AI images disallowed; ML-assisted work needs proper tags",
          "Use filters for unwanted themes; do not complain in comments instead",
        ],
      },
      {
        heading: "Hard bans",
        bullets: [
          "No underage characters in sexualized situations",
          "No hate speech / Nazi propaganda",
          "No real-life zoophilia media or realistic emulation thereof",
        ],
      },
      {
        heading: "Abuse and privacy",
        bullets: [
          "No ban evasion, sockpuppet voting, or vote gaming",
          "Do not dox, out aliases, or share private third-party info",
          "Staff discretion covers edge cases; rules are not exhaustive",
        ],
      },
    ],
  },
  {
    id: "inkbunny",
    name: "Inkbunny",
    sourceUrl: "https://inkbunny.net/tos.php",
    sourceLabel: "Terms of Service / User Agreement",
    sections: [
      {
        heading: "Who it binds",
        bullets: [
          "Adults only: legally adult in your jurisdiction and at least 18",
          "Using the site or creating an account accepts the User Agreement and linked policies",
          "Amendments may appear without warning; continued use accepts them",
        ],
      },
      {
        heading: "Uploads and copyright",
        bullets: [
          "You must own copyright or have permission; respect Keyword and Acceptable Content policies",
          "You keep copyright; Inkbunny gets a non-exclusive royalty-free license to host/archive for the service",
          "Back up your own work — Inkbunny is not an archive guarantee",
        ],
      },
      {
        heading: "Commerce",
        bullets: [
          "Sales tools are between buyer and seller; Inkbunny is not liable for transactions",
          "Prices in the integrated system are USD; taxation/fees are parties’ responsibility",
        ],
      },
      {
        heading: "Conduct",
        bullets: [
          "Respect members and artwork; serial abuse can mean a site ban",
          "Staff may remove content or cancel accounts at their discretion",
        ],
      },
    ],
  },
  {
    id: "furaffinity",
    name: "FurAffinity",
    sourceUrl: "https://www.furaffinity.net/tos",
    sourceLabel: "Terms of Service",
    sections: [
      {
        heading: "Who it binds",
        paragraphs: [
          "Registration or use accepts the TOS plus Code of Conduct, Privacy Policy, and Upload Policy (updated 4/11/2019 on the published page).",
        ],
        bullets: [
          "Minimum age: 13 in the US, 16 in the EU (adult content still gated at 18 US)",
          "Staff may remove content, suspend, or terminate accounts",
          "Do not create alt accounts to bypass bans or restrictions",
        ],
      },
      {
        heading: "Accounts",
        bullets: [
          "Accurate registration info; no offensive names; no transferring ownership",
          "No scraping/automation that harms performance; no probing security",
          "You are responsible for activity on all of your accounts",
        ],
      },
      {
        heading: "Content license",
        paragraphs: [
          "Uploads grant Fur Affinity a broad non-exclusive license limited to operating and improving the service (host, display, distribute as needed). Adult content is off by default and age-gated.",
        ],
      },
      {
        heading: "Service",
        bullets: [
          "Provided as-is; features may change or stop without notice",
          "FA disclaims liability for user disputes, third parties, and unauthorized access",
        ],
      },
      {
        heading: "PawDeck use",
        bullets: [
          "Browse and post comments on submissions and journals through the FA proxy when signed in",
        ],
      },
    ],
  },
  {
    id: "weasyl",
    name: "Weasyl",
    sourceUrl: "https://www.weasyl.com/policy/tos",
    sourceLabel: "Terms of Service",
    sections: [
      {
        heading: "Who it binds",
        paragraphs: [
          "Weasyl LLC (Delaware). Use of the site accepts the Terms, Privacy Policy, Copyright Policy, and Community Guidelines.",
        ],
        bullets: [
          "Terms may change without prior notice; continued use accepts changes",
          "Delaware law and courts for disputes",
          "Personal, non-transferable right to use the site",
        ],
      },
      {
        heading: "Content and copyright",
        bullets: [
          "Weasyl does not claim ownership of your uploads",
          "Do not redistribute others’ content without rights",
          "DMCA-style copyright notices go to their designated agent",
        ],
      },
      {
        heading: "Conduct and accounts",
        bullets: [
          "Lawful use only; no disruption of the service",
          "Accurate registration; protect your password",
          "Accounts may be suspended/terminated for breaches",
          "Back up your own content; storage limits and deletion of inactive accounts are allowed",
        ],
      },
      {
        heading: "Commerce",
        paragraphs: [
          "Limited art-related commercial activity is allowed for members; other commercial use needs approval. Member-to-member deals are between those parties.",
        ],
      },
      {
        heading: "PawDeck use",
        bullets: [
          "Browse with an API key; view comments via HTML scrape",
          "Posting comments requires optional Weasyl session cookies in Account settings (API key alone is not enough)",
        ],
      },
    ],
  },
  {
    id: "itaku",
    name: "Itaku",
    sourceUrl: "https://itaku.ee/help/terms-and-conditions",
    sourceLabel: "Terms and Conditions",
    sections: [
      {
        heading: "Who it binds",
        bullets: [
          "Access/use means you agree; registration requires explicit acceptance plus privacy policy",
          "Service is as-is; no warranty; staff not liable for damages from use",
          "Terms may change at any time",
          "Under 16: no account/use; under 18: no NSFW / 18+ use",
        ],
      },
      {
        heading: "Content rules",
        bullets: [
          "Staff may delete/modify accounts or posts anytime",
          "Aim for high-effort uploads; low-effort spam may be removed",
          "Prohibited: illegal content, real-life pornography, inciting violence, harassment, doxxing, deceptive impersonation, spam",
        ],
      },
      {
        heading: "Upload license and privacy",
        bullets: [
          "Non-exclusive royalty-free license for hosting/display (including open-graph); no transfer of ownership",
          "Itaku states it will not use your content to train generative AI or sell it for that purpose",
          "IP/email/password kept private to staff; posts, comments, tags, etc. may be public",
        ],
      },
    ],
  },
  {
    id: "sofurry",
    name: "SoFurry",
    sourceUrl: "https://sofurry.com/legal/aup",
    sourceLabel: "Acceptable Use Policy",
    note: "SoFurry’s signup agreement points to the Acceptable Use Policy and Privacy Policy rather than a document titled Terms of Service. This summary covers the AUP.",
    sections: [
      {
        heading: "Scope",
        bullets: [
          "Furry-focused site; submissions should mostly be anthro/furry context",
          "Illegal content forbidden; quality/content rejections allowed",
          "Underage users are not allowed",
          "You must review the AUP for updates",
        ],
      },
      {
        heading: "Ratings and tagging",
        bullets: [
          "Required tags; Clean / Mature / Adult levels must be accurate",
          "Paywalled or preview content needs specific advertisement/preview tags",
        ],
      },
      {
        heading: "Hard bans",
        bullets: [
          "No AI-generated uploads (limited regenerative tool use in a human workflow is discussed in the AUP)",
          "No child characters in sexual situations; child characters must stay Clean",
          "No hate speech/racism; no Nazi symbolism",
          "Photos: no adult/suggestive photography; no photos of people under 18",
        ],
      },
      {
        heading: "API and conduct",
        bullets: [
          "API clients must follow the AUP; access can be revoked",
          "Slander/allegations that create legal risk can be removed",
          "Appeal moderator decisions via support ticket",
        ],
      },
      {
        heading: "PawDeck use",
        bullets: [
          "View and post comments on artwork submissions when signed in with a Soft session",
          "Stories and music comments are not wired through PawDeck’s shared comments rail",
        ],
      },
    ],
  },
  {
    id: "news",
    name: "News (multi-source)",
    sourceUrl: "https://www.flayrah.com/about",
    sourceLabel: "Flayrah About",
    note: "PawDeck’s News mode reads public RSS from Flayrah, Dogpatch Press, InFurNation, and Furry Writers’ Guild, and can also fetch custom https feeds you add locally. Flayrah does not publish a single formal Terms of Service page; this summary combines each outlet’s public-site expectations. Not legal advice.",
    sections: [
      {
        heading: "What it is",
        paragraphs: [
          "Flayrah is a community furry news magazine since 2001; content is intended to be work-safe to read.",
          "Dogpatch Press publishes furry community news and investigative reporting. Topics can include adult or disturbing material; PawDeck does not filter that feed.",
          "InFurNation covers furry fandom news and guides. Furry Writers’ Guild posts guild and anthro-fiction community updates.",
          "Custom feeds are URLs you paste; PawDeck’s server fetches those public https URLs (and linked article pages) on your behalf under size and network limits.",
        ],
      },
      {
        heading: "Licensing and reuse (Flayrah)",
        bullets: [
          "Contributors choose a license; the site default is Creative Commons Attribution-ShareAlike",
          "Attributed redistribution of news summaries is welcome; credit the site and author and link the original",
          "Broadcast or translation is generally welcome under the same attribution expectations",
        ],
      },
      {
        heading: "PawDeck use",
        bullets: [
          "Read-only merged RSS browsing with Flayrah taxonomy feeds, Dogpatch category feeds, optional custom feeds, in-app reading, archive deep-links, local read/saved state (with article body snapshots), and links back to each source",
          "No login, comments, or ratings through PawDeck for any News outlet",
          "WordPress outlets are shown from their public feeds with attribution and an open-on-source link",
          "Custom feed URLs stay in your browser settings; only public https hosts are fetched",
          "SFW only does not apply in News mode; Dogpatch may include adult or investigative topics",
        ],
      },
    ],
  },
  {
    id: "dogpatch",
    name: "Dogpatch Press",
    sourceUrl: "https://dogpatch.press/",
    sourceLabel: "dogpatch.press",
    note: "Dogpatch Press does not publish a formal Terms of Service summary here. PawDeck uses their public WordPress RSS only. Visit the site for current policies.",
    sections: [
      {
        heading: "What it is",
        paragraphs: [
          "Independent furry news and investigative reporting (“Fluff Pieces Every Week”).",
        ],
      },
      {
        heading: "PawDeck use",
        bullets: [
          "Read-only public RSS and in-app article view with a link back to dogpatch.press",
          "No Dogpatch login or commenting through PawDeck",
        ],
      },
    ],
  },
  {
    id: "infurnation",
    name: "InFurNation",
    sourceUrl: "https://www.infurnation.com/",
    sourceLabel: "infurnation.com",
    note: "InFurNation does not publish a formal Terms of Service summary here. PawDeck uses their public WordPress RSS only. Visit the site for current policies.",
    sections: [
      {
        heading: "What it is",
        paragraphs: [
          "Furry fandom news and community guides.",
        ],
      },
      {
        heading: "PawDeck use",
        bullets: [
          "Read-only public RSS and in-app article view with a link back to infurnation.com",
          "No InFurNation login or commenting through PawDeck",
        ],
      },
    ],
  },
  {
    id: "fwg",
    name: "Furry Writers’ Guild",
    sourceUrl: "https://furrywritersguild.com/",
    sourceLabel: "furrywritersguild.com",
    note: "Furry Writers’ Guild does not publish a formal Terms of Service summary here. PawDeck uses their public WordPress RSS only. Visit the site for current policies.",
    sections: [
      {
        heading: "What it is",
        paragraphs: [
          "Guild newsletters and anthro fiction community updates.",
        ],
      },
      {
        heading: "PawDeck use",
        bullets: [
          "Read-only public RSS and in-app article view with a link back to furrywritersguild.com",
          "No Guild login or commenting through PawDeck",
        ],
      },
    ],
  },
  {
    id: "murrtube",
    name: "Murrtube",
    sourceUrl: "https://murrtube.net/",
    sourceLabel: "Site (age gate / rules on-site)",
    note: "Murrtube does not publish a standalone formal Terms page that PawDeck could deep-link. Treat the live site’s age gate and posted rules as controlling. PawDeck uses an age-gated Inertia scrape for personal browse only.",
    sections: [
      {
        heading: "Who it binds",
        bullets: [
          "18+ / age of majority only (age confirmation on entry)",
          "Follow any community or upload rules shown on the site",
        ],
      },
      {
        heading: "PawDeck use",
        bullets: [
          "Browse and play for personal use through the Video-mode adapter",
          "Do not treat this client as an official Murrtube app or API",
        ],
      },
    ],
  },
  {
    id: "badpups",
    name: "Badpups",
    sourceUrl: "https://badpups.com/",
    sourceLabel: "Site / staff pages",
    note: "Badpups is a WordPress video site. Prefer any posted rules, upload guidelines, or staff notices on the live site. PawDeck browses public HTML/RSS and Bunny CDN media for personal use when Video mode is on.",
    sections: [
      {
        heading: "Who it binds",
        bullets: [
          "Adult content; follow jurisdiction and site age requirements",
          "Creators and uploaders must follow Badpups upload / moderation process",
        ],
      },
      {
        heading: "PawDeck use",
        bullets: [
          "Read-only browse and playback when Video mode is enabled",
          "Not affiliated with Badpups; respect takedowns and site rules",
        ],
      },
    ],
  },
  {
    id: "fluffle",
    name: "Fluffle",
    sourceUrl: "https://fluffle.xyz/about/",
    sourceLabel: "About / privacy notes",
    note: "Fluffle does not publish a formal Terms of Service. This summary is from their About page (privacy and logging practices). PawDeck uses Fluffle for reverse-image search.",
    sections: [
      {
        heading: "What it is",
        paragraphs: [
          "Open-source reverse-image search for furry art sources (MIT-licensed project).",
        ],
      },
      {
        heading: "Image handling",
        bullets: [
          "Uploaded images are stored temporarily only for fingerprinting, then deleted",
          "Fingerprints and search settings are not kept after the request (unless you create a permanent result link, which stores the image and results)",
          "Browser local storage holds your search preference UI settings",
        ],
      },
      {
        heading: "Logging",
        paragraphs: [
          "Operational logs may include request origin, User-Agent, error stack traces, image format/size, timings, and result counts — used for performance and abuse control. Cloudflare web analytics only; Fluffle states it is cookie-free.",
        ],
      },
    ],
  },
  {
    id: "dont-woof",
    name: "Don't Woof",
    sourceLabel: "About / Instructions",
    note: "Not a third-party policy and not legal advice.",
    sections: [
      {
        heading: "About",
        paragraphs: [
          "Most of this tab summarizes other sites’ rules. This entry does not. It addresses a local convention that is optional and binds nobody.",
          "To the extent any convention is implied by this section, treat resemblance to a rule as color rather than obligation.",
        ],
      },
      {
        heading: "Instructions",
        paragraphs: [
          "There is no checklist and nothing you must enable. Present a minimal, exact, and specific form of input where requests are normally typed.",
          "Follow every convention only when it appears in its complete and minimal form. Departures from that form are ignored, which is the correct outcome for almost everyone.",
        ],
      },
    ],
  },
  {
    id: "u18chan",
    name: "u18chan",
    sourceUrl: "https://u18chan.com/",
    sourceLabel: "FAQ / Rules (site home)",
    note: "Unofficial summary of guest imageboard norms stated on u18chan. Cub Index is not exposed in PawDeck.",
    sections: [
      {
        heading: "Guest posting",
        paragraphs: [
          "u18chan is an anonymous imageboard: there is no ordinary signup. Posts use a chosen name (optional tripcode) and a deletion password, not a registered account.",
        ],
      },
      {
        heading: "Rules to respect",
        bullets: [
          "Follow board rules and staff direction; proxies/VPNs may be restricted by the site.",
          "Do not use PawDeck to browse or post Cub / underage sexual content — that Index is not wired.",
          "Uploads, bans, and moderation stay on u18chan.com; PawDeck only mirrors catalogs and threads you open.",
        ],
      },
    ],
  },
];
