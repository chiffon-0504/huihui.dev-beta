window.HUIHUI_I18N = window.HUIHUI_I18N || {};

window.HUIHUI_I18N.ja = {
  layout: {
    skipLink: "メインコンテンツへ移動",
    scrollControls: {
      top: "ページ上部へ移動",
      bottom: "ページ下部へ移動"
    },
    nav: {
      about: "自己紹介",
      works: "作品",
      posts: "マイルストーン",
      contact: "連絡",
      tools: "ツール"
    },
    languageSwitch: {
      label: "言語切り替え",
      zh: "中",
      en: "English",
      ja: "日本語"
    },
    drawer: {
      open: "ナビゲーションを開く",
      close: "ナビゲーションを閉じる"
    },
    beta: "Beta",
    rights: "すべての権利を保有します。"
  },
  home: {
    hero: {
      subtitle: "Web UI、コードレンダリング、組み込みシステムに焦点を当てた個人開発スペースです。",
      about: "私について",
      contact: "連絡先"
    },
    projectUpdate: {
      label: "Website Status",
      title: "🟢 更新中",
      desc: "huihui.dev · 継続更新中"
    },
    tech: {
      title: "テックニュース",
      desc: "OpenAI・Anthropic・Apple の最新情報を表示します。",
      loading: "テクノロジー情報を読み込んでいます……",
      empty: "現在表示できるテクノロジー情報はありません。",
      loadError: "テクノロジー情報を読み込めませんでした。",
      timeout: "テクノロジー情報の読み込みがタイムアウトしました。",
      sourceLabel: "出典："
    },
    infrastructure: {
      title: "インフラストラクチャ状況",
      desc: "Cloudflare と GitHub が公開する公式の上流サービス状況です。",
      loading: "インフラストラクチャ状況を読み込んでいます……",
      loadError: "インフラストラクチャ状況を読み込めませんでした。",
      cloudflareTitle: "Cloudflare ステータス",
      githubTitle: "GitHub ステータス",
      cloudflareLink: "Cloudflare ステータスを見る →",
      githubLink: "GitHub ステータスを見る →",
      statuses: {
        operational: "正常稼働",
        underMaintenance: "メンテナンス中",
        degradedPerformance: "パフォーマンス低下",
        partialOutage: "一部停止",
        majorOutage: "重大な障害",
        unknown: "不明"
      },
      components: {
        pages: "Pages",
        workers: "Workers",
        dns: "DNS",
        cdn: "CDN",
        actions: "Actions",
        apiRequests: "APIリクエスト",
        gitOperations: "Git操作"
      }
    }
  },
  systemStatus: {
    history: {
      title: "可用性と履歴",
      intro: "Better Stack による独立した外部監視の記録です。可用率はプロバイダーが報告する集計値で、対象は下記の観測日のみです。必ずしも 90 日分ではありません。上部の現在の稼働状況は別途確認しています。",
      loading: "監視履歴を読み込み中…",
      unavailable: "履歴を読み込めません。履歴の状態は不明です。",
      incomplete: "外部監視データは一部不足しています。取得できた観測記録を表示しています。",
      availability: "可用率 {value}",
      availabilityUnknown: "可用率は不明",
      observedOne: "観測日数：{count} 日",
      observedMany: "観測日数：{count} 日",
      dateRange: "観測日の範囲",
      noHistory: "観測記録はまだありません。",
      recentImpact: "最近のサービス影響",
      noImpact: "観測履歴にサービスへの影響があった日はありません。",
      downtime: "停止時間",
      maintenance: "メンテナンス時間",
      fetched: "履歴データ取得日時",
      chronological: "観測日（古い順）",
      legend: "履歴の状態の凡例",
      lessThanSecond: "1 秒未満",
    },
    title: "システム状況",
    pageTitle: "huihui.dev システム状況",
    pageIntro: "Website、API、Contact Service の現在のファーストパーティー稼働状況です。",
    allOperational: "すべてのシステムが正常稼働中",
    statusUnknown: "システム状況は不明です",
    checking: "システム状況を確認しています……",
    unable: "現在のシステム状況を判定できません。",
    lastChecked: "最終確認",
    notChecked: "未確認",
    viewStatus: "状況を見る →",
    components: {
      website: "Website",
      api: "API",
      contact: "Contact Service"
    },
    descriptions: {
      website: "huihui.dev の静的ページ、HTML 応答、安定したサイトマーカー。",
      api: "huihui.dev Worker と API リクエスト経路の可用性。",
      contact: "送信を行わずに確認する Contact ハンドラーと必須ランタイム設定の準備状況。"
    },
    statuses: {
      operational: "正常稼働",
      degradedPerformance: "パフォーマンス低下",
      partialOutage: "一部停止",
      majorOutage: "重大な障害",
      unknown: "不明"
    }
  },
  contact: {
    title: "連絡先",
    intro: "ご質問、コラボレーション、フィードバックなどは、下のフォームからご連絡ください。",
    name: "名前",
    namePlaceholder: "お名前",
    email: "Email",
    message: "メッセージ",
    messagePlaceholder: "メッセージ内容",
    submit: "送信する",
    submitting: "送信中...",
    success: "送信されました。",
    error: "送信に失敗しました。後でもう一度お試しください。",
    fallbackPrefix: "直接メールする場合："
  },
  works: {
    title: "作品",
    lead: "プロジェクト、UI実験、そしてhuihui.devの写真作品。",
    accessibility: {
      showcase: "作品紹介",
      websiteProject: "huihui.dev プロジェクト",
      tierMakerTool: "Tier Maker ツール"
    },
    cards: {
      website: {
        type: "Webサイト",
        title: "huihui.dev",
        desc: "共通レイアウト、多言語ページ、Cloudflareデプロイを使った個人サイト。",
        tag: "HTML / CSS / JavaScript"
      },
      tierMaker: {
        type: "ツール",
        title: "Tier Maker",
        desc: "ドラッグ＆ドロップ排序、カスタム画像、PNG書き出しに対応したランク表ツール。",
        tag: "Canvas / UI"
      },
      workers: {
        type: "API",
        title: "Workers API",
        desc: "テック更新の取得、Steamデータ処理、問い合わせフォーム転送を担当。",
        tag: "Cloudflare Workers"
      },
      photography: "写真",
      travel: "旅写真",
      train: "鉄道",
      deer: "奈良",
      penguin: "水族館"
    },
    images: {
      fuji: "富士山",
      tsutenkaku: "通天閣",
      yokohama: "横浜港",
      train: "電車",
      deer: "鹿",
      penguin: "ペンギン",
      preview: "拡大プレビュー"
    }
  },
  posts: {
    title: "マイルストーン",
    intro: "近況、実績、ゲーム記録など。",
    scoreAlt: "Arcaea スコアスクリーンショット",
    preview: "プレビュー"
  },
  about: {
    title: "私について",
    interests: "趣味",
    copy: {
      label: "コードをコピー",
      success: "コードをコピーしました",
      failure: "コードをコピーできませんでした。手動で選択してコピーしてください。"
    },
    images: {
      maimai: "maimai DX",
      maimaiFavorite: "お気に入りのmaimai DX楽曲",
      maimaiBest: "maimai DXのベスト記録",
      arcaea: "Arcaea",
      arcaeaFavorite: "お気に入りのArcaea楽曲",
      arcaeaBest: "Arcaeaのベスト記録",
      galgame: "Summer Pockets REFLECTION BLUE",
      preview: "プレビュー"
    },
    rhythm: {
      favorite: "お気に入り",
      best: "ベスト",
      level: "レベル",
      bestScore: "ベストスコア"
    },
    steam: {
      loading: "Steamライブラリを読み込み中...",
      bannerUnavailable: "注目のゲームは現在表示できません。",
      gamesUnavailable: "現在表示できるSteamのお気に入りゲームはありません。",
      loadError: "Steamゲームを一時的に読み込めません。",
      timeout: "Steamゲームの読み込みがタイムアウトしました。もう一度お試しください。",
      hours: "時間"
    },
    copyright: "画像 © 各権利者（SEGA、lowiro、VISUAL ARTS/Key、YUZUSOFT、sprite、NekoNyan Ltd.、Sister Position など）"
  },
  tierMaker: {
    title: "Tier Maker",
    save: "PNGをダウンロード",
    intro: "素材ライブラリは内蔵していません。画像はユーザーがアップロードし、ブラウザ内だけで並べ替えます。",
    addTier: "ランクを追加",
    upload: "画像をアップロード",
    imageSize: "画像サイズ",
    pool: "未分類",
    note: "公開共有する前に、アップロードした画像の使用権または適切な利用条件を確認してください。",
    toolbarLabel: "Tier Maker コントロール",
    tierName: "ランク名",
    tierColor: "ランク色",
    deleteTier: "ランクを削除",
    uploadedImageAlt: "アップロード画像",
    newTier: "新規",
    keyboardInstructions: "左右の矢印キーで現在の領域内の順序を変更し、上下の矢印キーで各ランクと未分類の間を移動します。",
    moveAnnouncement: "{item} を {destination} に移動しました。位置 {position} / {count}。",
    tierRegionLabel: "{name} ランク",
    deleteNamedTier: "{name} ランクを削除",
    uploadCountLimit: "画像数が上限の50枚に達したため、残りのファイルは追加されませんでした。",
    uploadFileTooLarge: "{file} は追加されませんでした。ファイルサイズが10 MiBを超えています。",
    uploadDimensionsTooLarge: "{file} は追加されませんでした。画像サイズが4096 × 4096ピクセルを超えています。",
    uploadInvalidImage: "{file} は追加されませんでした。画像ファイルを読み込めません。",
    uploadSuccess: "{count}枚の画像を追加しました。",
    exportSuccess: "PNGのダウンロードを開始しました。",
    exportFailure: "PNGを作成できませんでした。もう一度お試しください。",
    downloadFileName: "tier-list.png"
  }
};
