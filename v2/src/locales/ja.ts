import type { JevContent } from "./jev";
import type { LocaleContent } from "./types";

export default {
  openNavigation: "ナビゲーションを開く",
  closeNavigation: "ナビゲーションを閉じる",
  postsLabel: "記事",
  postsPage: {
    title: "記事",
    description: "huihui の音楽、リズムゲーム、日々の記録。",
    noScript: "このサイトには JavaScript が必要です。GitHub でもプロジェクトをご覧いただけます。",
    introduction: "好きな音楽、ゲームでの小さな達成、日々のひとこま。テーマごとにまとめて、少しずつ書き留めています。",
    categories: {
      music: "音楽",
      "rhythm-games": "リズムゲーム",
      journal: "日々の記録"
    },
    articles: {
      "ave-mujica-exitus-taipei-day2-2026-08-09": {
        title: "Ave Mujica「Exitus」台北 DAY2",
        excerpt: "ありがとう！最高のライブでした！"
      },
      "arcaea-course-mode-phase-10-clear-2026-07-31": {
        title: "Arcaea Course Mode：Phase 10 完走",
        excerpt: "Course Mode Phase 10 完走！！"
      },
      "arcaea-boss-song-ex-scores-2026-06-28": {
        title: "Arcaea：3曲の EX 記録",
        excerpt: "初代ボス曲 Grievous Lady（FUTURE 11）、3.0 のボス曲 Tempestissimo（FUTURE 10+）、6.0 の Lament Rain（FUTURE 10）で EX を達成。"
      },
      "arcaea-potential-12-2026-06-27": {
        title: "Arcaea：Potential 12.00 到達",
        excerpt: "2021年に Arcaea を始めた頃は本当に難しく、慣れるまで大変でした。ずっと目標だった Potential 12.00 に、ついに到達しました。\nFracture Ray（FUTURE 11）で EX を達成。これからも Arcaea を続けていきます。"
      },
      "arcaea-potential-11-90-2026-05-03": {
        title: "Arcaea：Potential 11.90",
        excerpt: "Potential 11.90 に到達！Aether Crest: Astral（FUTURE 10）で EX を達成。"
      },
      "arcaea-cyaegha-ex-plus-2026-04-19": {
        title: "Arcaea：Cyaegha EX+",
        excerpt: "Cyaegha（FUTURE 10+）で EX+ を達成！"
      },
      "hello-world-2026-04-14": {
        title: "Hello, World!",
        excerpt: "Hello, World!"
      }
    }
  },
  worksPage: {
    title: "制作実績",
    description: "huihui の Web 開発、ブラウザツール、写真作品を紹介します。",
    noScript: "このサイトには JavaScript が必要です。GitHub でもプロジェクトをご覧いただけます。",
    introduction: "Web サイトやツールから旅先の写真まで。デザイン、開発、観察を通じて形にしたものを紹介します。",
    website: {
      title: "huihui.dev",
      description: "3 言語、レスポンシブな画面、ライト・ダークテーマを備えた、進化を続ける個人サイト。カバーには自分で撮影した富士山の写真を使用しています。",
      alt: "青空の下に雪をいただく富士山。huihui.dev のカバーに使用している写真。",
      linkLabel: "サイトのソースを見る",
    },
    tool: {
      title: "Tier Maker",
      description: "画像をアップロードし、ランクを並べて PNG に書き出す。お気に入りをブラウザで整理して共有できる小さなツールです。",
      linkLabel: "Tier Maker を開く（現行サイト）",
    },
    photography: {
      title: "旅と日常のひとこま",
      description: "通天閣の夜の光と柴犬のクローズアップ。旅先の風景や日常の出会いを写真に残しています。",
      alt: "夜空を背景に紫色にライトアップされた通天閣。",
      shibaAlt: "日差しの中でカメラを見上げる柴犬。",
    },
    viewer: {
      title: "画像ビューアー",
      open: "プレビューを開く",
      close: "閉じる",
      previous: "前の画像",
      next: "次の画像",
      load: "高解像度画像を読み込む",
      loading: "高解像度画像を読み込み中です。プレビューは引き続き表示されます。",
      loaded: "高解像度画像を読み込みました。",
      error: "高解像度画像を読み込めませんでした。プレビューは引き続き表示されます。",
    },
  },
  contact: { label: "お問い合わせ", email: "contact@huihui.dev" },
  aboutPage: {
    title: "私について",
    description: "huihui のプロフィール。電子工学、Web デザインと開発、写真、ゲーム、音楽について。",
    noScript: "このサイトには JavaScript が必要です。GitHub でもプロジェクトをご覧いただけます。",
    introduction: "huihui です。電子工学を専攻し、Web サイト制作、写真、音楽ゲーム、ビジュアルノベルが好きです。",
    backgroundTitle: "電子工学から Web へ",
    background: [
      "専攻は電子工学で、Web インターフェースや組み込みシステムに関心があります。huihui.dev は、制作したものと自分の好きなことをまとめる個人の開発スペースです。",
      "現在は Web Design、Website Development、UI / UX を主な軸に、見た目、読みやすさ、実装を一緒に考えています。このサイトも、学びや試みとともに少しずつ育てています。",
    ],
    practiceTitle: "Web サイトの作り方",
    practice: [
      { title: "Web 標準を土台に", description: "HTML、CSS、JavaScript を使い、さまざまな端末やキーボード操作にも配慮した、わかりやすく使いやすい画面を作ります。" },
      { title: "変更を確認できる形に", description: "Git と GitHub を使い、Issues、Branches、Pull Requests、GitHub Actions で要件整理、変更のレビュー、テストを進めます。" },
      { title: "作りながら確かめる", description: "AI を活用した開発と Cloudflare のデプロイ・API ツールを取り入れ、出力や使い心地は自分でも確認します。" },
    ],
    interestsTitle: "コードを離れて楽しむこと",
    interests: [
      { title: "写真", description: "趣味のひとつは写真です。撮影した作品もこの個人サイトにまとめています。" },
      { title: "音楽ゲーム", description: "maimai でらっくすや Arcaea が好きです。音楽とリズム、繰り返し練習する過程を楽しんでいます。" },
      { title: "ビジュアルノベル", description: "好きな作品のひとつは Summer Pockets REFLECTION BLUE。ほかにもビジュアルノベルを集めています。" },
    ],
    musicTitle: "好きな音楽とイラスト",
    music: [
      { title: "作曲家", description: "Laur、USAO、Sakuzyo、ak+q。" },
      { title: "バンドと楽曲", description: "Morfonica や Ave Mujica が好きで、「One step at a time」や「顏」を聴いています。TOGENASHI TOGEARI の「雑踏、僕らの街」もお気に入りです。" },
      { title: "イラストレーター", description: "@momoco_haru、@horuhara、@kurumi_lm の作品を追いかけています。" },
    ],
    worksCta: "ピックアップした作品を見る",
  },
  language: { label: "日本語", shortLabel: "日本語" },
  skip: "メインコンテンツへ移動",
  navigation: "メインナビゲーション",
  languages: "言語",
  theme: "テーマ",
  themeAuto: "自動",
  themeLight: "ライト",
  themeDark: "ダーク",
  worksLabel: "制作実績",
  aboutLabel: "プロフィール",
  home: {
    playing: "音楽ゲーム",
    time: "現在の時刻",
    localTime: "ローカル時刻",
    status: "システム状況",
    statusUnavailable: "このプレビューは稼働状況に未接続です。",
    website: "ウェブサイト",
    notChecked: "未取得",
    version: "サイトのバージョン",
    development: "開発中",
    notes: [
      "全面的に再設計",
      "TypeScript + モジュール化 CSS アーキテクチャを採用"
    ],
    close: "ウィンドウを閉じる",
    move: { label: "移動", up: "上に移動", down: "下に移動", left: "左に移動", right: "右に移動" }
  },
} satisfies LocaleContent;

export const jev = {
  signIn: "再読み込みしてログイン",
  intro: "質問と条件を書いて、Jev の判断を参考にしましょう。", question: "質問", questionHint: "一度にひとつの明確な質問をしてください。",
  context: "背景と条件", contextHint: "任意。判断に関わる事実を補足します。", criteria: "評価基準", criteriaHint: "低い順に 2〜10 段階を説明します。番号は 0 から始まります。",
  options: "選択肢", optionsHint: "異なる選択肢を 2〜12 個追加します。", addContext: "条件を追加", addCriterion: "基準を追加", addOption: "選択肢を追加", remove: "削除",
  ask: "Jev に聞く", loading: "Jev が判断しています…", ready: "結果を更新しました。", result: "Jev の判断", empty: "質問を送信すると、ここに結果が表示されます。",
  yes: "True · はい", no: "False · いいえ", highest: "最も高い確率", confidence: "信頼度", score: "スコア", between: "スコアの位置",
  error: "Jev の応答を取得できませんでした。もう一度お試しください。", authError: "ログインの有効期限が切れました。ページを再読み込みしてください。", rateError: "リクエストが多すぎます。1 分ほど待ってからお試しください。",
  inputError: "文字数と、異なる基準または選択肢が 2 個以上あることを確認してください。", timeoutError: "応答がタイムアウトしました。再送信するか確認してください。",
  privacy: "送信すると、質問と条件が TypeSafe に渡されます。このサイトは判断履歴を保存しません。確率はモデルの判断であり、事実を保証するものではありません。",
  mode: "判断モード", language: "言語", home: "ホームに戻る", skip: "フォームへ移動", modes: { noul: "はい・いいえの確率", score: "基準に沿って評価", choice: "選択肢を比較" },
} satisfies JevContent;
