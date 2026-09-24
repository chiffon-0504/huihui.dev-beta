import type { JevContent } from "./jev";
import type { LocaleContent } from "./types";

export default {
  openNavigation: "開啟導覽選單",
  closeNavigation: "關閉導覽選單",
  postsLabel: "文章",
  postsPage: {
    title: "文章",
    description: "huihui 的音樂、節奏遊戲與日常紀錄。",
    noScript: "這個網站需要 JavaScript。你也可以在 GitHub 查看我的專案。",
    introduction: "記下喜歡的音樂、遊戲裡的小小突破，以及生活中的片刻。依主題整理，慢慢累積。",
    categories: {
      music: "音樂",
      "rhythm-games": "節奏遊戲",
      journal: "日常"
    },
    articles: {
      "ave-mujica-exitus-taipei-day2-2026-08-09": {
        title: "Ave Mujica「Exitus」台北 DAY2",
        excerpt: "謝謝！這是最棒的演唱會！"
      },
      "arcaea-course-mode-phase-10-clear-2026-07-31": {
        title: "Arcaea Course Mode：Phase 10 完成",
        excerpt: "Course Mode Phase 10 完成！！"
      },
      "arcaea-boss-song-ex-scores-2026-06-28": {
        title: "Arcaea：三首歌曲的 EX 紀錄",
        excerpt: "初代魔王 Grievous Lady（FUTURE 11）、3.0 魔王 Tempestissimo（FUTURE 10+），以及 6.0 Lament Rain（FUTURE 10），都達成 EX。"
      },
      "arcaea-potential-12-2026-06-27": {
        title: "Arcaea：Potential 12.00 摘星",
        excerpt: "從 2021 年開始玩 Arcaea，當初真的覺得上手難度很高。以前一直把「摘星」當成一個夢想，現在終於到達 Potential 12.00 了。\nFracture Ray（FUTURE 11）達成 EX。未來也會繼續玩 Arcaea。"
      },
      "arcaea-potential-11-90-2026-05-03": {
        title: "Arcaea：Potential 11.90",
        excerpt: "到達 Potential 11.90！Aether Crest: Astral（FUTURE 10）達成 EX。"
      },
      "arcaea-cyaegha-ex-plus-2026-04-19": {
        title: "Arcaea：Cyaegha EX+",
        excerpt: "Cyaegha（FUTURE 10+）達成 EX+！"
      },
      "hello-world-2026-04-14": {
        title: "Hello, World!",
        excerpt: "Hello, World!"
      }
    }
  },
  worksPage: {
    title: "作品",
    description: "huihui 的網站開發、瀏覽器工具與精選攝影作品。",
    noScript: "此網站需要 JavaScript。你也可以在 GitHub 查看我的專案。",
    introduction: "從網站與工具到旅行攝影，記錄我在設計、開發與觀察中的實作。",
    website: {
      title: "huihui.dev",
      description: "持續演進的個人網站，以三種語言、響應式介面與明暗主題，實踐網站設計與開發。封面使用我的富士山攝影作品。",
      alt: "藍天下覆雪的富士山，huihui.dev 使用的攝影封面。",
      linkLabel: "查看網站原始碼",
    },
    tool: {
      title: "Tier Maker",
      description: "上傳圖片、排列喜好分級，再匯出 PNG。讓整理與分享都能在瀏覽器中完成的小工具。",
      linkLabel: "開啟 Tier Maker（現行網站）",
    },
    photography: {
      title: "旅行與日常片刻",
      description: "通天閣的夜間燈光與柴犬特寫，記錄沿途風景與日常相遇。",
      alt: "夜空中亮起紫色燈光的通天閣。",
      shibaAlt: "陽光下抬頭看向鏡頭的柴犬。",
    },
    viewer: {
      title: "圖片檢視器",
      open: "開啟預覽",
      close: "關閉",
      previous: "上一張",
      next: "下一張",
      load: "載入高解析圖片",
      loading: "正在載入高解析圖片，仍可觀看預覽。",
      loaded: "高解析圖片已載入。",
      error: "無法載入高解析圖片，仍可觀看預覽。",
    },
  },
  contact: { label: "聯絡", email: "contact@huihui.dev" },
  aboutPage: {
    title: "關於我",
    description: "認識 huihui：電子工程背景、網站設計與開發，以及攝影、遊戲和音樂。",
    noScript: "此網站需要 JavaScript。你也可以在 GitHub 瀏覽我的專案。",
    introduction: "我是 huihui，電子工程背景，喜歡做網站，也喜歡攝影、音樂遊戲與 Galgame。",
    backgroundTitle: "從電子工程到網站",
    background: [
      "我的主修是電子工程，關注 Web 介面與嵌入式系統。huihui.dev 是我的個人開發空間，用來整理作品，也記錄自己的興趣。",
      "現在，我以 Web Design、Website Development 與 UI / UX 為主要方向，把視覺設計、閱讀體驗與實作放在一起思考。這個網站也隨著學習與嘗試持續演進。",
    ],
    practiceTitle: "我如何做網站",
    practice: [
      { title: "從原生技術開始", description: "以 HTML、CSS 與 JavaScript 為基礎，製作清楚、易用的介面，兼顧不同裝置與鍵盤操作。" },
      { title: "讓修改可以被檢查", description: "使用 Git 與 GitHub，透過 Issues、Branches、Pull Requests 和 GitHub Actions 整理需求、檢查修改與執行測試。" },
      { title: "持續實作與驗證", description: "將 AI 輔助開發融入工作流程，搭配 Cloudflare 的部署與 API 工具，並親自確認產出與使用體驗。" },
    ],
    interestsTitle: "螢幕之外與遊戲之中",
    interests: [
      { title: "攝影", description: "攝影是我的興趣之一，作品也收錄在個人網站裡。" },
      { title: "音樂遊戲", description: "喜歡 maimai DX 與 Arcaea。音樂、節奏與一次次練習，是我享受遊戲的方式。" },
      { title: "Galgame", description: "喜歡的作品包括 Summer Pockets REFLECTION BLUE，也收藏其他視覺小說遊戲。" },
    ],
    musicTitle: "喜歡的聲音與創作",
    music: [
      { title: "作曲家", description: "Laur、USAO、Sakuzyo、ak+q。" },
      { title: "樂團與歌曲", description: "喜歡 Morfonica 與 Ave Mujica，包括〈One step at a time〉與〈顏〉；也喜歡 TOGENASHI TOGEARI 的〈雑踏、僕らの街〉。" },
      { title: "插畫創作者", description: "關注 @momoco_haru、@horuhara 與 @kurumi_lm 的作品。" },
    ],
    worksCta: "看看我的精選作品",
  },
  language: { label: "繁體中文", shortLabel: "中文" },
  skip: "跳至主要內容",
  navigation: "主要導覽",
  languages: "語言",
  theme: "主題",
  themeAuto: "自動",
  themeLight: "淺色",
  themeDark: "深色",
  worksLabel: "作品",
  aboutLabel: "關於",
  home: {
    playing: "音樂遊戲",
    bishoujo: "美少女遊戲",
    time: "現在時間",
    localTime: "本地時間",
    status: "系統狀態",
    statusUnavailable: "此預覽尚未連接即時狀態。",
    website: "網站",
    notChecked: "尚未取得",
    version: "網站版本",
    development: "開發中",
    notes: [
      "重新設計",
      "採用 TypeScript + 模組化 CSS 架構"
    ],
    close: "關閉視窗",
    move: { label: "移動", up: "向上移動", down: "向下移動", left: "向左移動", right: "向右移動" }
  },
} satisfies LocaleContent;

export const jev = {
  signIn: "重新載入並登入",
  intro: "把問題與條件寫下來，讓 Jev 提供一個判斷。", question: "問題", questionHint: "一次問一個明確的問題。",
  context: "背景與條件", contextHint: "選填。補充會影響判斷的事實。", criteria: "評分標準", criteriaHint: "由低到高描述 2–10 個等級，編號從 0 開始。",
  options: "選項", optionsHint: "加入 2–12 個不同的選項。", addContext: "新增條件", addCriterion: "新增標準", addOption: "新增選項", remove: "刪除",
  ask: "詢問 Jev", loading: "Jev 正在判斷…", ready: "結果已更新。", result: "Jev 的判斷", empty: "寫下你的問題，結果會顯示在這裡。",
  yes: "True · 是", no: "False · 否", highest: "最高機率", confidence: "信心值", score: "分數", between: "分數位置",
  error: "目前無法取得 Jev 回應，請稍後再試。", authError: "登入已失效，請重新載入頁面以登入。", rateError: "詢問次數較多，請稍候一分鐘再試。",
  inputError: "請確認內容長度，並填入至少兩個不同的標準或選項。", timeoutError: "等待回應逾時。請確認是否需要再次送出。",
  privacy: "送出後，問題與條件會交由 TypeSafe 處理。本站不儲存決策紀錄；機率是模型的判斷，並非事實保證。",
  mode: "判斷模式", language: "語言", home: "回到首頁", skip: "跳到表單", modes: { noul: "是與否的機率", score: "依標準評分", choice: "比較不同選項" },
} satisfies JevContent;
