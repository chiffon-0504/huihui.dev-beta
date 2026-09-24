import type { JevContent } from "./jev";
import type { LocaleContent } from "./types";

export default {
  openNavigation: "Open navigation",
  closeNavigation: "Close navigation",
  postsLabel: "Posts",
  postsPage: {
    title: "Posts",
    description: "Notes on music, rhythm games, and everyday moments by huihui.",
    noScript: "This website needs JavaScript. You can also explore my projects on GitHub.",
    introduction: "Music I love, small breakthroughs in games, and moments from everyday life. A growing collection of notes, organized by topic.",
    categories: {
      music: "Music",
      "rhythm-games": "Rhythm games",
      journal: "Journal"
    },
    articles: {
      "ave-mujica-exitus-taipei-day2-2026-08-09": {
        title: "Ave Mujica “Exitus” Taipei DAY2",
        excerpt: "Thank you! This was the best concert ever!"
      },
      "arcaea-course-mode-phase-10-clear-2026-07-31": {
        title: "Arcaea Course Mode: Phase 10 clear",
        excerpt: "Course Mode Phase 10 cleared!"
      },
      "arcaea-boss-song-ex-scores-2026-06-28": {
        title: "Arcaea: three EX scores",
        excerpt: "EX on the original boss song Grievous Lady (FUTURE 11), the 3.0 boss song Tempestissimo (FUTURE 10+), and 6.0 Lament Rain (FUTURE 10)."
      },
      "arcaea-potential-12-2026-06-27": {
        title: "Arcaea: reaching Potential 12.00",
        excerpt: "I started playing Arcaea in 2021 and found it very difficult to get into. Reaching Potential 12.00 had always been a goal, and now I have finally achieved it.\nEX on Fracture Ray (FUTURE 11). I will keep playing Arcaea."
      },
      "arcaea-potential-11-90-2026-05-03": {
        title: "Arcaea: Potential 11.90",
        excerpt: "Reached Potential 11.90! EX on Aether Crest: Astral (FUTURE 10)."
      },
      "arcaea-cyaegha-ex-plus-2026-04-19": {
        title: "Arcaea: Cyaegha EX+",
        excerpt: "EX+ on Cyaegha (FUTURE 10+)!"
      },
      "hello-world-2026-04-14": {
        title: "Hello, World!",
        excerpt: "Hello, World!"
      }
    }
  },
  worksPage: {
    title: "Works",
    description: "Selected web development, browser tools, and photography by huihui.",
    noScript: "This website needs JavaScript. You can also explore my projects on GitHub.",
    introduction: "Websites, tools, and travel photography: a selection of my work in design, development, and observation.",
    website: {
      title: "huihui.dev",
      description: "An evolving personal website with three languages, responsive interfaces, and light and dark themes. My Mount Fuji photograph serves as its cover.",
      alt: "Snow-covered Mount Fuji under a blue sky, the photographic cover used on huihui.dev.",
      linkLabel: "View the website source",
    },
    tool: {
      title: "Tier Maker",
      description: "Upload images, arrange your tiers, and export a PNG. A small browser tool for organizing and sharing your favorites.",
      linkLabel: "Open Tier Maker (current site)",
    },
    photography: {
      title: "Travel and everyday moments",
      description: "Night lights at Tsutenkaku and a close-up of a Shiba Inu: photographs of places and small encounters.",
      alt: "Tsutenkaku illuminated in purple against the night sky.",
      shibaAlt: "A Shiba Inu looking up in the sunlight.",
    },
    viewer: {
      title: "Image viewer",
      open: "Open preview",
      close: "Close",
      previous: "Previous image",
      next: "Next image",
      load: "Load high-resolution",
      loading: "Loading high-resolution image. Preview remains available.",
      loaded: "High-resolution image loaded.",
      error: "Could not load high-resolution image. Preview remains available.",
    },
  },
  contact: { label: "Contact", email: "contact@huihui.dev" },
  aboutPage: {
    title: "About me",
    description: "Meet huihui: an electronic engineering background, web design and development, photography, games, and music.",
    noScript: "This website needs JavaScript. You can also explore my projects on GitHub.",
    introduction: "I'm huihui. My background is in electronic engineering, and I enjoy building websites, photography, rhythm games, and visual novels.",
    backgroundTitle: "From electronics to the web",
    background: [
      "My major is Electronic Engineering, with interests in web interfaces and embedded systems. huihui.dev is my personal development space, where I collect my work and share my interests.",
      "Today, my main focus is Web Design, Website Development, and UI / UX. I think about visual design, the reading experience, and implementation together. This website keeps evolving as I learn and experiment.",
    ],
    practiceTitle: "How I build websites",
    practice: [
      { title: "Start with native web technologies", description: "I use HTML, CSS, and JavaScript to make clear, usable interfaces, considering different devices and keyboard interaction." },
      { title: "Make changes reviewable", description: "I use Git and GitHub, with Issues, Branches, Pull Requests, and GitHub Actions to organize requirements, review changes, and run tests." },
      { title: "Keep building and checking", description: "I bring AI-assisted development into my workflow alongside Cloudflare's deployment and API tools, and check the results and user experience myself." },
    ],
    interestsTitle: "Away from code, into play",
    interests: [
      { title: "Photography", description: "Photography is one of my hobbies. I also share my work on this personal website." },
      { title: "Rhythm games", description: "I enjoy maimai DX and Arcaea: the music, the rhythm, and the practice that goes into each play." },
      { title: "Visual novels", description: "Summer Pockets REFLECTION BLUE is among my favorites, alongside other visual novels in my collection." },
    ],
    musicTitle: "Music and art I enjoy",
    music: [
      { title: "Composers", description: "Laur, USAO, Sakuzyo, and ak+q." },
      { title: "Bands and songs", description: "I enjoy Morfonica and Ave Mujica, including “One step at a time” and “顏”, as well as “雑踏、僕らの街” by TOGENASHI TOGEARI." },
      { title: "Illustrators", description: "I follow the work of @momoco_haru, @horuhara, and @kurumi_lm." },
    ],
    worksCta: "Explore my selected work",
  },
  language: { label: "English", shortLabel: "English" },
  skip: "Skip to main content",
  navigation: "Main navigation",
  languages: "Language",
  theme: "Theme",
  themeAuto: "Auto",
  themeLight: "Light",
  themeDark: "Dark",
  worksLabel: "Works",
  aboutLabel: "About",
  home: {
    playing: "Rhythm games",
    bishoujo: "Bishoujo Games",
    time: "Now time",
    localTime: "Local time",
    status: "System status",
    statusUnavailable: "Live status is not connected in this preview.",
    website: "Website",
    notChecked: "Not checked",
    version: "Website version",
    development: "In Development",
    notes: [
      "Redesigned from the ground up",
      "TypeScript + modular CSS architecture"
    ],
    close: "Close window",
    move: { label: "Move", up: "Move up", down: "Move down", left: "Move left", right: "Move right" }
  },
} satisfies LocaleContent;

export const jev = {
  signIn: "Reload to sign in",
  intro: "Write down a question and its context. Let Jev offer a judgment.", question: "Question", questionHint: "Ask one specific question at a time.",
  context: "Context", contextHint: "Optional facts that could affect the decision.", criteria: "Scoring criteria", criteriaHint: "Describe 2–10 levels, from low to high. Numbering starts at 0.",
  options: "Options", optionsHint: "Add 2–12 distinct options.", addContext: "Add context", addCriterion: "Add criterion", addOption: "Add option", remove: "Remove",
  ask: "Ask Jev", loading: "Jev is considering…", ready: "Result updated.", result: "Jev’s judgment", empty: "Your result will appear here after you ask a question.",
  yes: "True · Yes", no: "False · No", highest: "Highest probability", confidence: "Confidence", score: "Score", between: "Score position",
  error: "Unable to get a Jev response. Please try again.", authError: "Your session has expired. Reload the page to sign in.", rateError: "Too many requests. Please wait a minute before trying again.",
  inputError: "Check the text lengths and enter at least two distinct criteria or options.", timeoutError: "The response timed out. Check whether you want to submit again.",
  privacy: "Submitting sends your question and context to TypeSafe. This site does not save decision history. Probabilities reflect a model judgment, not a guarantee.",
  mode: "Decision mode", language: "Language", home: "Back to home", skip: "Skip to form", modes: { noul: "Yes or no probability", score: "Evaluate against a rubric", choice: "Compare your options" },
} satisfies JevContent;
