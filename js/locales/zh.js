window.HUIHUI_I18N = window.HUIHUI_I18N || {};

window.HUIHUI_I18N.zh = {
  layout: {
    nav: {
      about: "關於我",
      works: "作品",
      posts: "里程碑",
      contact: "聯絡",
      tools: "工具"
    },
    languageSwitch: {
      label: "語言切換",
      zh: "中",
      en: "English",
      ja: "日本語"
    },
    drawer: {
      open: "開啟導覽選單",
      close: "關閉導覽選單"
    },
    beta: "Beta",
    rights: "保留所有權利。"
  },
  home: {
    hero: {
      subtitle: "開發者 / 攝影",
      about: "關於",
      contact: "聯絡"
    },
    projectUpdate: {
      label: "Website Status",
      title: "🟢 更新中",
      desc: "huihui.dev · 持續更新"
    },
    tech: {
      title: "科技動態",
      desc: "每日整理 AI、iOS 與 Android 的最新消息。",
      loading: "載入科技動態中……",
      empty: "目前沒有科技動態。",
      loadError: "無法載入科技動態。",
      timeout: "科技動態載入逾時。",
      sourceLabel: "來源："
    }
  },
  contact: {
    title: "聯絡我",
    intro: "有問題、合作或回饋，可以用下面的表單聯絡我。",
    name: "名稱",
    namePlaceholder: "你的名稱",
    email: "Email",
    message: "訊息",
    messagePlaceholder: "想說的內容",
    submit: "送出訊息",
    submitting: "送出中...",
    success: "訊息已送出。",
    error: "送出失敗，請稍後再試。",
    fallbackPrefix: "或直接寄信："
  },
  works: {
    title: "作品",
    lead: "專案、介面實驗，以及我拍攝的精選照片。",
    cards: {
      website: {
        type: "網站",
        title: "huihui.dev",
        desc: "使用共用版面、多語系頁面與 Cloudflare 部署的個人網站。",
        tag: "HTML / CSS / JavaScript"
      },
      tierMaker: {
        type: "工具",
        title: "Tier Maker",
        desc: "支援拖曳排序、自訂圖片與 PNG 匯出的分級表工具。",
        tag: "Canvas / UI"
      },
      workers: {
        type: "API",
        title: "Workers API",
        desc: "處理科技動態抓取、Steam 資料整理與聯絡表單轉送。",
        tag: "Cloudflare Workers"
      },
      photography: "攝影",
      travel: "旅拍",
      train: "鐵道",
      deer: "奈良",
      penguin: "水族館"
    },
    images: {
      fuji: "富士山",
      tsutenkaku: "通天閣",
      yokohama: "橫濱港",
      train: "電車",
      deer: "小鹿",
      penguin: "企鵝",
      preview: "放大預覽"
    }
  },
  posts: {
    title: "里程碑",
    intro: "一些近況、成就與遊戲紀錄。",
    scoreAlt: "Arcaea 成績截圖",
    preview: "放大預覽"
  },
  about: {
    title: "關於我",
    interests: "興趣",
    copy: {
      label: "複製程式碼",
      success: "已複製程式碼",
      failure: "複製失敗，請手動選取並複製"
    },
    images: {
      maimai: "maimai DX",
      arcaea: "Arcaea",
      galgame: "Summer Pockets REFLECTION BLUE",
      preview: "放大預覽"
    },
    steam: {
      loading: "正在載入 Steam 遊戲庫...",
      bannerUnavailable: "精選遊戲目前沒有資料。",
      gamesUnavailable: "目前沒有可顯示的 Steam 收藏遊戲。",
      loadError: "Steam 遊戲暫時無法載入。",
      timeout: "Steam 遊戲載入逾時，請稍後再試。",
      hours: "小時"
    },
    copyright: "Images © respective owners (SEGA, lowiro, VISUAL ARTS/Key, YUZUSOFT, sprite, NekoNyan Ltd., Sister Position, etc.)"
  },
  tierMaker: {
    title: "分級表製作器",
    save: "下載 PNG",
    intro: "不內建素材庫。圖片由使用者自行上傳，並只在瀏覽器內排序。",
    addTier: "新增等級",
    upload: "上傳照片",
    imageSize: "圖片大小",
    pool: "待排序",
    note: "提醒：公開分享前，請確認上傳圖片具有使用權或符合合理使用情境。",
    toolbarLabel: "分級表製作器控制項",
    tierName: "等級名稱",
    tierColor: "等級顏色",
    deleteTier: "刪除等級",
    uploadedImageAlt: "上傳的圖片",
    newTier: "新等級",
    keyboardInstructions: "使用左右方向鍵調整圖片在目前區域中的順序，使用上下方向鍵在各等級與待排序區之間移動。",
    moveAnnouncement: "{item} 已移至 {destination}，位置 {position} / {count}。",
    tierRegionLabel: "{name} 等級",
    deleteNamedTier: "刪除 {name} 等級",
    uploadCountLimit: "已達 50 張圖片上限，多餘的檔案未新增。",
    uploadFileTooLarge: "{file} 未新增：檔案大小超過 10 MiB。",
    uploadDimensionsTooLarge: "{file} 未新增：圖片尺寸超過 4096 × 4096 像素。",
    uploadInvalidImage: "{file} 未新增：無法讀取這個圖片檔案。",
    uploadSuccess: "已新增 {count} 張圖片。",
    exportSuccess: "PNG 下載已開始。",
    exportFailure: "無法建立 PNG，請再試一次。",
    downloadFileName: "tier-list.png"
  }
};
