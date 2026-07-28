window.HUIHUI_I18N = window.HUIHUI_I18N || {};

window.HUIHUI_I18N.ja = {
  layout: {
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
      subtitle: "開発者 / 写真",
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
      desc: "AI・iOS・Android の最新情報を表示します。"
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
    images: {
      maimai: "maimai DX",
      arcaea: "Arcaea",
      galgame: "Summer Pockets REFLECTION BLUE",
      preview: "プレビュー"
    },
    steam: {
      loading: "Steamライブラリを読み込み中...",
      bannerUnavailable: "注目のゲームは現在表示できません。",
      gamesUnavailable: "現在表示できるSteamのお気に入りゲームはありません。",
      loadError: "Steamゲームを一時的に読み込めません。",
      timeout: "Steamゲームの読み込みがタイムアウトしました。もう一度お試しください。",
      hours: "時間"
    },
    copyright: "Images © respective owners (SEGA, lowiro, VISUAL ARTS/Key, YUZUSOFT, sprite, NekoNyan Ltd., Sister Position, etc.)"
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
