/**
 * English and Japanese.
 *
 * A flat table of `[English, 日本語]` pairs rather than a library: the app has
 * a few hundred strings, no pluralisation rules beyond "s", and no runtime
 * locale loading worth the bytes. The English is the key's own default, so a
 * missing translation shows English rather than a key name — an untranslated
 * screen is usable, a screen full of `settings.storage.title` is not.
 *
 * The Japanese comes from the design handoff's own string table where it had
 * one, which is why the bowling vocabulary is the vocabulary a Japanese house
 * actually uses: アベレージ rather than 平均, スペア成功率 rather than a literal
 * rendering of "spare conversion".
 */

import { useCallback } from 'react';
import { usePreferences, type Language } from './preferences';

type Pair = readonly [en: string, ja: string];

export const STRINGS = {
  // ── Navigation and chrome ──
  home: ['Home', 'ホーム'],
  play: ['Play', '入力'],
  history: ['History', '履歴'],
  stats: ['Stats', '分析'],
  crew: ['Crew', 'クルー'],
  settings: ['Settings', '設定'],
  back: ['Back', '戻る'],

  titleHome: ['Lane Log', 'レーンログ'],
  titlePlay: ['New game', '新しいゲーム'],
  titleHistory: ['Match history', '対戦履歴'],
  titleStats: ['Analytics', '分析'],
  titleSettings: ['Settings', '設定'],
  titleDay: ['Play day', 'プレイ日'],
  titleGame: ['Game record', 'ゲーム記録'],
  titleVideos: ['Video gallery', '動画'],
  titleScan: ['Scan a sheet', 'スコアシートを撮影'],

  kickerDashboard: ['Dashboard', 'ダッシュボード'],
  kickerFrameEntry: ['Frame entry', 'スコア入力'],
  kickerArchive: ['Archive', '記録'],
  kickerAnalytics: ['Analytics', '分析'],
  kickerPrefs: ['Preferences', '各種設定'],
  kickerSession: ['Session', 'セッション'],
  kickerRecord: ['Game record', 'ゲーム記録'],
  kickerImport: ['Import', '読み込み'],

  // ── Common words ──
  games: ['games', 'ゲーム'],
  game: ['game', 'ゲーム'],
  pins: ['pins', 'ピン'],
  average: ['Average', 'アベレージ'],
  strikeRate: ['Strike rate', 'ストライク率'],
  bestGame: ['Best game', 'ベストゲーム'],
  best: ['Best', 'ベスト'],
  total: ['Total', '合計'],
  cancel: ['Cancel', 'キャンセル'],
  save: ['Save', '保存'],
  delete: ['Delete', '削除'],
  notes: ['Notes', 'メモ'],
  strikes: ['strikes', 'ストライク'],
  spares: ['spares', 'スペア'],

  // ── History ──
  sortNew: ['Newest', '新しい順'],
  sortOld: ['Oldest', '古い順'],
  sortHigh: ['Highest', '高得点順'],
  sortLow: ['Lowest', '低得点順'],
  searchPlaceholder: ['Search house or date', 'ボウリング場・日付で検索'],
  dayHint: [
    'Grouped by the day you bowled. Tap a day for the whole session.',
    'プレイした日ごとにまとめています。日付をタップするとその日の全ゲームを表示します。',
  ],
  series: ['Series', 'シリーズ'],
  seriesTotal: ['Series total', 'シリーズ合計'],
  acrossSession: ['Across the session', 'セッション全体'],
  perGame: ['Per game', 'ゲームごと'],
  exportDay: ['Export this day', 'この日を書き出す'],
  openFrames: ['Open frames', 'オープンフレーム'],
  spareRate: ['Spare rate', 'スペア成功率'],

  // ── Analytics ──
  personalRecords: ['Personal records', '自己記録'],
  highGame: ['High game', '最高スコア'],
  recentAverage: ['Average, last 10', '直近10ゲーム平均'],
  longestStrikeRun: ['Longest strike run', '最長連続ストライク'],
  spareConversion: ['Spare conversion', 'スペア成功率'],
  metricAverage: ['Average', 'アベレージ'],
  metricStrike: ['Strike %', 'ストライク%'],
  metricSpare: ['Spare %', 'スペア%'],
  metricPins: ['Pins', 'ピン数'],
  labelAverage: ['Average progression', 'アベレージの推移'],
  labelStrike: ['Strike %', 'ストライク率'],
  labelSpare: ['Spare conversion', 'スペア成功率'],
  labelPins: ['Total pins per game', '1ゲームの総ピン数'],
  change: ['Change', '変化'],
  achievements: ['Achievements', '実績'],
  howFramesFinish: ['How frames finish', 'フレームの結果'],
  whatYouLeave: ['What you leave', '残りピンの傾向'],
  firstBall: ['First ball', '1投目'],
  singlePinSpares: ['From one pin', '1本残りスペア'],
  multiPinSpares: ['From two or more', '複数本残りスペア'],
  earned: ['Earned', '獲得'],
  progress: ['Progress', '進捗'],
  close: ['Close', '閉じる'],

  // ── Ranges ──
  rangeLast5: ['Last 5', '直近5'],
  range30: ['30 days', '30日'],
  range90: ['90 days', '90日'],
  range180: ['6 months', '6ヶ月'],
  rangeAll: ['Lifetime', '通算'],

  // ── Settings ──
  language: ['Language', '言語'],
  languageHint: ['Titles and navigation switch instantly.', 'タイトルとナビゲーションはすぐに切り替わります。'],
  playerProfile: ['Player profile', 'プロフィール'],
  playerName: ['Player name', '選手名'],
  profileIcon: ['Profile icon', 'アイコン'],
  data: ['Data', 'データ'],
  exportCsv: ['Export stats as CSV', '統計をCSVで書き出す'],
  clearAllData: ['Clear all data', 'すべてのデータを消去'],
  clearTitle: ['Clear all data?', 'すべてのデータを消去しますか？'],
  clearBody: [
    'Every game, photo and preference on this device is removed. Nothing is recoverable without a backup file.',
    'この端末のゲーム・写真・設定がすべて削除されます。バックアップがなければ復元できません。',
  ],
  clearOk: ['Clear all', 'すべて消去'],
  sync: ['Sync', '同期'],
  cloudSync: ['Cloud sync', 'クラウド同期'],
  cloudDesc: [
    'Back up games and share stats with friends. Coming soon.',
    'ゲームのバックアップと友達との共有。近日対応。',
  ],
  sharing: ['Sharing', '共有'],
  autoShare: ['Share finished games with your crew', '終了したゲームをクルーに共有'],
  autoShareHint: [
    'Off by default. Turn it on and every game you save is posted to the crew as soon as it is finished.',
    '初期設定はオフです。オンにすると、保存したゲームが終了時にクルーへ投稿されます。',
  ],
  about: ['About', 'このアプリについて'],
  version: ['Version', 'バージョン'],
  help: ['Help & FAQ', 'ヘルプ・よくある質問'],
  privacy: ['Privacy policy', 'プライバシーポリシー'],
  terms: ['Terms of service', '利用規約'],
} as const satisfies Record<string, Pair>;

export type StringKey = keyof typeof STRINGS;

export function translate(key: StringKey, language: Language): string {
  const pair = STRINGS[key];
  return language === 'ja' ? pair[1] : pair[0];
}

/** `t('home')` in a component, following the language preference. */
export function useTranslation() {
  const { preferences } = usePreferences();
  const language = preferences.language;

  const t = useCallback((key: StringKey) => translate(key, language), [language]);

  return { t, language };
}
