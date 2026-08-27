window.HUIHUI_I18N = window.HUIHUI_I18N || {};

window.HUIHUI_I18N.en = {
  layout: {
    skipLink: "Skip to main content",
    scrollControls: {
      top: "Scroll to top",
      bottom: "Scroll to bottom"
    },
    nav: {
      about: "About",
      works: "Works",
      posts: "Milestones",
      contact: "Contact",
      tools: "Tools"
    },
    languageSwitch: {
      label: "Language switch",
      zh: "中",
      en: "English",
      ja: "日本語"
    },
    drawer: {
      open: "Open navigation",
      close: "Close navigation"
    },
    beta: "Beta",
    rights: "All rights reserved."
  },
  home: {
    hero: {
      subtitle: "A personal development space focused on Web UI, code rendering, and embedded systems.",
      about: "About",
      contact: "Contact"
    },
    projectUpdate: {
      label: "Website Status",
      title: "🟢 Active",
      desc: "huihui.dev · Continuously updated"
    },
    tech: {
      title: "Tech Updates",
      desc: "Daily updates from OpenAI, Anthropic and Apple.",
      loading: "Loading tech updates…",
      empty: "No tech updates are available.",
      loadError: "Failed to load tech updates.",
      timeout: "Tech updates timed out.",
      sourceLabel: "Source:"
    },
    infrastructure: {
      title: "Infrastructure Status",
      desc: "Official upstream service status from Cloudflare and GitHub.",
      loading: "Loading infrastructure status…",
      loadError: "Unable to load infrastructure status.",
      cloudflareTitle: "Cloudflare Status",
      githubTitle: "GitHub Status",
      cloudflareLink: "View Cloudflare Status →",
      githubLink: "View GitHub Status →",
      statuses: {
        operational: "Operational",
        underMaintenance: "Under Maintenance",
        degradedPerformance: "Degraded Performance",
        partialOutage: "Partial Outage",
        majorOutage: "Major Outage",
        unknown: "Unknown"
      },
      components: {
        pages: "Pages",
        workers: "Workers",
        dns: "DNS",
        cdn: "CDN",
        actions: "Actions",
        apiRequests: "API Requests",
        gitOperations: "Git Operations"
      }
    }
  },
  contact: {
    title: "Contact",
    intro: "For questions, collaborations, or feedback, you can reach me through the form below.",
    name: "Name",
    namePlaceholder: "Your name",
    email: "Email",
    message: "Message",
    messagePlaceholder: "Your message",
    submit: "Send Message",
    submitting: "Sending...",
    success: "Message sent.",
    error: "Failed to send. Please try again later.",
    fallbackPrefix: "Or email directly:"
  },
  works: {
    title: "Works",
    lead: "Projects, interface experiments, and selected photography from huihui.dev.",
    accessibility: {
      showcase: "Works showcase",
      websiteProject: "huihui.dev project",
      tierMakerTool: "Tier Maker tool"
    },
    cards: {
      website: {
        type: "Website",
        title: "huihui.dev",
        desc: "Personal portfolio site with shared layout, multilingual pages, and Cloudflare deployment.",
        tag: "HTML / CSS / JavaScript"
      },
      tierMaker: {
        type: "Tool",
        title: "Tier Maker",
        desc: "Drag-and-drop ranking tool with custom images and PNG export.",
        tag: "Canvas / UI"
      },
      workers: {
        type: "API",
        title: "Workers API",
        desc: "Fetches tech updates, processes Steam data, and forwards contact forms.",
        tag: "Cloudflare Workers"
      },
      photography: "Photography",
      travel: "Travel",
      train: "Railway",
      deer: "Nara",
      penguin: "Aquarium"
    },
    images: {
      fuji: "Mount Fuji",
      tsutenkaku: "Tsutenkaku",
      yokohama: "Yokohama Port",
      train: "Train",
      deer: "Deer",
      penguin: "Penguin",
      preview: "Image preview"
    }
  },
  posts: {
    title: "Milestones",
    intro: "Recent moments, achievements, and game records.",
    scoreAlt: "Arcaea score screenshot",
    preview: "Preview"
  },
  about: {
    title: "About Me",
    interests: "Interests",
    copy: {
      label: "Copy code",
      success: "Code copied",
      failure: "Could not copy code. Select and copy it manually."
    },
    images: {
      maimai: "maimai DX",
      maimaiFavorite: "Favorite maimai DX song",
      maimaiBest: "Best maimai DX record",
      arcaea: "Arcaea",
      arcaeaFavorite: "Favorite Arcaea song",
      arcaeaBest: "Best Arcaea record",
      galgame: "Summer Pockets REFLECTION BLUE",
      preview: "Preview"
    },
    rhythm: {
      favorite: "Favorite",
      best: "Best",
      level: "Level",
      bestScore: "Best Score"
    },
    steam: {
      loading: "Loading Steam library...",
      bannerUnavailable: "The featured game is currently unavailable.",
      gamesUnavailable: "No favorite Steam games are currently available.",
      loadError: "Steam games are temporarily unavailable.",
      timeout: "Steam games took too long to load. Please try again.",
      hours: "hrs"
    },
    copyright: "Images © respective owners (SEGA, lowiro, VISUAL ARTS/Key, YUZUSOFT, sprite, NekoNyan Ltd., Sister Position, etc.)"
  },
  tierMaker: {
    title: "Tier Maker",
    save: "Download PNG",
    intro: "No built-in asset library. Images are uploaded by the user and sorted only in the browser.",
    addTier: "Add Tier",
    upload: "Upload Images",
    imageSize: "Image Size",
    pool: "Unsorted",
    note: "Reminder: Before sharing publicly, make sure you have the rights to use the uploaded images or that your use fits fair-use conditions.",
    toolbarLabel: "Tier Maker controls",
    tierName: "Tier name",
    tierColor: "Tier color",
    deleteTier: "Delete tier",
    uploadedImageAlt: "Uploaded image",
    newTier: "NEW",
    keyboardInstructions: "Use Left and Right Arrow to reorder this image. Use Up and Down Arrow to move it between tiers and Unsorted.",
    moveAnnouncement: "{item} moved to {destination}, position {position} of {count}.",
    tierRegionLabel: "{name} tier",
    deleteNamedTier: "Delete {name} tier",
    uploadCountLimit: "The 50-image limit was reached. Extra files were not added.",
    uploadFileTooLarge: "{file} was not added because it exceeds 10 MiB.",
    uploadDimensionsTooLarge: "{file} was not added because its dimensions exceed 4096 × 4096 pixels.",
    uploadInvalidImage: "{file} was not added because it is not a readable image.",
    uploadSuccess: "Images added: {count}.",
    exportSuccess: "PNG download started.",
    exportFailure: "The PNG could not be created. Please try again.",
    downloadFileName: "tier-list.png"
  }
};
