/**
 * English and Japanese.
 *
 * Keyed by the English text itself rather than by invented ids. Two reasons,
 * both about what happens when someone edits a screen months from now: the
 * source of a string and its use are the same thing, so they cannot drift
 * apart; and anything missing from the dictionary renders as English, which is
 * rename a key and the screen shows `settings.storage.title` to a real person.
 *
 * The Japanese comes from the design handoff's own string table where it had
 * one, which is why the bowling vocabulary is what a Japanese house actually
 * uses: アベレージ rather than 平均, スペア成功率 rather than a literal rendering
 * of "spare conversion", and 本 rather than ピン for counting pins left.
 */

import { useCallback } from 'react';
import { loadPreferences, usePreferences, type Language } from './preferences';

/**
 * English → Japanese. Anything absent falls through to the English.
 *
 * Keep entries grouped by where they appear, and keep the English exactly as
 * the screen writes it — including the curly apostrophe, which is a different
 * character from the straight one and will not match if it is typed wrong.
 */
export const JA: Record<string, string> = {
  // ── First run ──
  'Welcome': 'ようこそ',
  'Welcome to Lane Log': 'レーンログへようこそ',
  'First, who are you?': 'まず、あなたのことを教えてください',
  'This is the name and tile your crew sees. Both change later in settings.':
    'クルーに表示される名前とアイコンです。どちらも後から設定で変更できます。',
  'Your name': '名前',
  'Bowler': 'ボウラー',
  'Your mark': 'マーク',
  'Your colour': 'カラー',
  'Initials': 'イニシャル',
  'That’s me': 'これでOK',
  'Violet': 'バイオレット',
  'Rose': 'ローズ',
  'Amber': 'アンバー',
  'Teal': 'ティール',
  'Sky': 'スカイ',
  'Moss': 'モス',
  'Next · {n} of {total}': '次へ · {n} / {total}',
  'Back': '戻る',
  'Start bowling': 'はじめる',
  'Skip the tour': 'スキップ',
  'Show the tour again': '使い方をもう一度見る',
  'How it works': '使い方',
  'Tour': 'ガイド',
  'This is what your crew sees.': 'クルーにはこのように表示されます。',
  'Tap the pins, not a number': '数字ではなくピンをタップ',
  'Scoring on the rack records which pins fell, so a 10-pin and a 7-10 show up in your stats as themselves. There is a number pad too, if you are just keeping up with a league.':
    'ラックで入力すると倒れたピンが記録されるので、10番ピンや7-10スプリットがそのまま統計に残ります。リーグに追いつきたいときは数字パッドも使えます。',
  'Or photograph the sheet': 'シートを撮影しても入力できます',
  'Slide the paper until one game sits inside the bar, like scanning a barcode. It reads that row only, and you check every frame before it saves.':
    'バーコードを読むように、1ゲーム分の行がバーの中に入るまで紙を動かします。その行だけを読み取り、保存前に全フレームを確認できます。',
  'A crew is opt-in, game by game': '共有は1ゲームずつ、あなたが決めます',
  'Nothing you bowl is shared until you say so. Sharing sends that one game to one crew, and you can take it back down.':
    'あなたが選ぶまで何も共有されません。共有すると、そのゲームだけが1つのクルーに送られ、いつでも取り消せます。',
  'Your games live on this phone': 'ゲームはこの端末に保存されます',
  'No account needed, and they work with no signal at all. That also means a lost phone is a lost season — Settings has an export, and it is the only copy there is.':
    'アカウントは不要で、電波がなくても使えます。ただし端末をなくすとシーズンごと失われます。設定から書き出せるファイルが唯一の控えです。',

  'Nothing shared here yet.': 'まだ共有されたゲームはありません。',

  // ── Chat and sharing ──
  'Loading the thread…': 'メッセージを読み込み中…',
  'Nothing said yet. Start it off.': 'まだ投稿がありません。最初のひとことをどうぞ。',
  'Message {crew}': '{crew}にメッセージ',
  'Already shared with {crews}.': '共有済み：{crews}',
  'a crew you have left': '退会したクルー',

  // ── Crews ──
  'Loading your crews…': 'クルーを読み込み中…',
  'Loading the crew…': 'クルーを読み込み中…',
  'No crews yet. Create one, or join with a code somebody sent you.':
    'まだクルーがありません。作成するか、受け取ったコードで参加してください。',
  'That crew is not one of yours, or no longer exists.':
    'そのクルーには参加していないか、すでに存在しません。',
  'is live. Send this code to the people you want in it.':
    'を作成しました。参加してほしい人にこのコードを送ってください。',
  'expires in {n} days': '有効期限：あと{n}日',
  'Code copied': 'コードをコピーしました',
  'Copy code': 'コードをコピー',
  'Show QR': 'QRを表示',
  'Hide QR': 'QRを隠す',
  'Creating…': '作成中…',
  'Joining…': '参加中…',
  'Join the crew': 'クルーに参加',

  // ── Signing in ──
  'Handing over to your provider': '認証プロバイダに移動中',
  'This leaves Lane Log and comes back signed in.':
    'レーンログを一度離れ、サインイン後に戻ります。',
  'Your {n} games stay on this device either way.':
    'どちらの場合も、この端末の{n}ゲームはそのまま残ります。',
  'or': 'または',
  'Checking your account…': 'アカウントを確認中…',
  'No groups, no chat, no shared games': 'グループ・チャット・共有ゲームは使えません',
  'Nothing is backed up — a lost phone is a lost season':
    'バックアップされません。端末をなくすとシーズンごと失われます',
  'Everything else works: scoring, scanning, history and analytics':
    'それ以外はすべて使えます。スコア入力・撮影・履歴・分析',
  'Signing in never moves your games. They stay on this device either way.':
    'サインインしてもゲームは移動しません。この端末に残ります。',
  'Google sign-in is not switched on for this project yet.':
    'Googleサインインはまだ有効になっていません。',
  'This build has no server configured, so there is nothing to sign in to.':
    'このビルドにはサーバーが設定されていないため、サインインできません。',
  'Cannot reach the server. Your games are safe on this device — only the crew screens need a connection.':
    'サーバーに接続できません。ゲームはこの端末に安全に保存されています。接続が必要なのはクルー画面だけです。',
  'That session has expired. Sign in again to reach your crews.':
    'セッションの有効期限が切れました。もう一度サインインしてください。',
  'You are not in that crew, so there is nothing to show.':
    'そのクルーに参加していないため、表示できるものがありません。',
  'Something went wrong reaching the server.': 'サーバーへの接続で問題が発生しました。',

  // ── Play: the frame strip and the rack ──
  'Frames': 'フレーム',
  'Frame {n} of 10': '第{n}フレーム / 全10',
  'Running': '現在の合計',
  'Second ball — {n} standing': '2投目 — {n}本残り',
  'Bonus ball — fresh rack, {n} pins': 'ボーナス投球 — 新しいラック、{n}本',
  'The tenth keeps three boxes — the bonus ball is the accented one.':
    '第10フレームは3枠。ボーナス投球は色付きの枠です。',
  'STRIKE': 'ストライク',
  'SPARE': 'スペア',
  'standing': '残り',
  'knocked': '倒した',
  'down': '倒れた',
  'Strike — all ten': 'ストライク（10本）',
  'Spare — everything left': 'スペア（残り全部）',
  'Clear': 'クリア',
  '{n} down': '{n}本',
  'Pin {n}, already down': '{n}番ピン、すでに倒れています',
  'Pin {n}, knocked down — tap to stand it back up': '{n}番ピン、倒しました。タップで元に戻します',
  'Pin {n}, standing — tap to knock it down': '{n}番ピン、残っています。タップで倒します',
  'Game finished — {n} pins. Add the house if you want it on the record.':
    'ゲーム終了 — {n}ピン。記録に残す場合はボウリング場を入力してください。',
  'Saving…': '保存中…',

  // ── Home dashboard ──
  'of 300': '/ 300',
  'Bowl a game or scan a sheet and it starts here.':
    'ゲームを入力するかシートを撮影すると、ここに表示されます。',
  'You’re {rank} of {size}': '{size}人中{rank}',
  '{n}{suffix}': '{n}位',
  '{n} new messages': '新着{n}件',
  'Last 5 games': '直近5ゲーム',
  'All {n}': 'すべて{n}件',
  'View analytics': '分析を見る',
  'No alley recorded': 'ボウリング場の記録なし',
  '{n} X': '{n}X',
  '{n} /': '{n}/',
  'Since {date}': '{date}から',
  'No games yet': 'まだゲームがありません',

  // ── Crew trend ──
  'Your form against the crew': 'クルーとの比較',
  'You': 'あなた',
  'Crew average': 'クルー平均',
  'Difference': '差',
  'Week': '週',
  'Week {n}': '第{n}週',
  'This week': '今週',
  'Your average against the crew, week by week': '週ごとのあなたとクルー平均',
  'Your average against the crew over {n} weeks.': '直近{n}週間のあなたとクルー平均の比較。',
  'Each game': '各ゲーム',

  // ── Clearing everything ──
  'Data': 'データ',
  'Clear all data': 'すべてのデータを消去',
  'Clear all data?': 'すべてのデータを消去しますか？',
  'Yes, delete everything': 'はい、すべて削除する',
  'Keep my games': '削除しない',
  'Clearing…': '消去中…',
  'Removes every game and every scanned sheet on this device. Your preferences and this device’s notification setting are left alone.':
    'この端末のゲームと撮影したシートをすべて削除します。設定と通知の許可はそのまま残ります。',
  '{n} games and {sheets} scanned sheets will be deleted from this device.':
    'この端末から{n}ゲームと{sheets}枚のシートを削除します。',
  'There is no account and no server, so this cannot be undone. Export a backup first if you want one.':
    'アカウントもサーバーもないため、元に戻せません。控えが必要な場合は先にバックアップを書き出してください。',
  '{n} games removed. Nothing is left to undo it with.': '{n}ゲームを削除しました。元に戻す手段はありません。',
  'There is nothing stored on this device yet.': 'この端末にはまだ何も保存されていません。',

  // ── Explanations ──
  'Nothing has been deleted — Lane Log simply cannot read or write here. A private window, or a browser set to block site data, will do this.': 'データは削除されていません。このブラウザで読み書きができないだけです。プライベートウィンドウや、サイトデータをブロックする設定が原因です。',
  'If this keeps happening, export your games from Settings before doing anything else — that file is the only copy there is.': '繰り返す場合は、まず設定からゲームを書き出してください。そのファイルが唯一の控えです。',
  'An account gets you groups, a shared board and cloud backup. Everything else works without one.': 'アカウントがあるとグループ・共有ボード・クラウドバックアップが使えます。それ以外の機能はアカウントなしで動きます。',
  'Neither provider is connected yet — signing in records the choice on this device so the rest of the flow can be built against it.': 'どちらの認証もまだ接続されていません。サインインの選択はこの端末に記録されるだけです。',
  'Rotating the code later cuts off anyone still holding this one. That is in group settings.': 'コードを更新すると、今のコードを持っている人は参加できなくなります。グループ設定から行えます。',
  'A printable score sheet, saved to this device. Open it and print to save it as a PDF — which is how a phone makes one.': '印刷用のスコアシートをこの端末に保存します。開いて印刷するとPDFとして保存できます。スマートフォンではこれがPDFの作り方です。',
  'Switching the metric re-ranks in place — rows slide to their new position. Tap anyone to see their season.': '指標を切り替えると順位がその場で入れ替わり、行が新しい位置へ動きます。名前をタップするとその人の記録が見られます。',
  'A group is shared with other people, so it cannot live only on this phone. Your games stay exactly where they are — linking an account does not move them.': 'グループは他の人と共有するため、この端末だけでは成り立ちません。ゲームはそのまま残ります。アカウントを連携しても移動しません。',
  'Groups are invite-only. Nobody finds one by searching — you get in with a code or a QR somebody sent you.': 'グループは招待制です。検索では見つかりません。コードかQRを受け取って参加します。',
  'No group uses that code. Check it against the message you were sent — codes expire after 14 days.': 'そのコードのグループはありません。受け取ったメッセージと照合してください。コードは14日で失効します。',
  'This one opens Tuesday Crew. A phone\'s own camera app reads it too — it is a link, not just a code.': 'これはTuesday Crewを開きます。スマートフォンのカメラアプリでも読み取れます。コードではなくリンクだからです。',
  'One tap a ball. Faster when you are keeping up with a league, but it cannot tell you what you left.': '1投1タップ。リーグに追いつきながら入力するときは速いですが、残りピンは記録されません。',
  'Photograph a finished sheet and Lane Log reads the marks off it. Best for games already bowled — you check every frame before it is saved.': '投げ終えたスコアシートを撮影すると、マークを読み取ります。すでに投げたゲーム向けで、保存前に全フレームを確認できます。',
  'Records which pins fell, so a 10-pin and a 7-10 show up later as themselves rather than as "9" and "8".': '倒れたピンを記録するので、10番ピンと7-10スプリットが「9」「8」ではなくそのまま残ります。',
  'One game at a time. Point the camera at your sheet and slide it until the game you want lies inside the bar, the way you would scan a barcode — only that strip is read. Nothing is saved until you have seen the score and can fix it.': '1ゲームずつ読み取ります。バーコードを読むように、目的のゲームの行がバーの中に入るようシートを動かしてください。その帯だけを読み取ります。スコアを確認して修正できるまで保存されません。',
  'You draw the box around one game yourself, so a sheet of six reads as easily as a sheet of one.': '1ゲーム分を自分で枠で囲むので、6ゲームのシートでも1ゲームのシートと同じように読み取れます。',
  'Everything is stored on this device only. There is no account and nothing is uploaded, so a file is the only backup — and the only way to move a season to another phone.': 'すべてこの端末にのみ保存されます。アカウントもアップロードもないため、ファイルが唯一のバックアップであり、別の端末へ移す唯一の方法です。',
  'Lane Log keeps everything on this device. There is no account, no server and nothing uploaded — which is also why a backup file is the only way to move a season to another phone.': 'レーンログはすべてこの端末に保存します。アカウントもサーバーもアップロードもありません。だからこそ、別の端末へ移すにはバックアップファイルが必要です。',
  'Notifications are blocked for this site. Re-allow them in your browser settings — the app cannot ask again once they are blocked.': 'このサイトの通知はブロックされています。ブラウザの設定で許可してください。一度ブロックされるとアプリからは再度求められません。',
  'Storage is nearly full. Export your games, then delete some older ones — scanned sheets take by far the most room.': '空き容量がわずかです。ゲームを書き出してから古いものを削除してください。撮影したシートが最も容量を使います。',
  'This browser has not offered to install Lane Log. It still works as a normal page; notifications may not.': 'このブラウザはインストールを提案していません。通常のページとしては動きますが、通知は使えない場合があります。',
  'Without this, a browser short of space may clear your games. Installing the app usually makes the browser grant it.': 'これを許可しないと、空き容量が少ないときにブラウザがゲームを消すことがあります。アプリをインストールすると許可されやすくなります。',
  'Sharing sends the score sheet, not your whole history. You can retract it from the group\'s shared games at any time and it stays in your own history either way.': '共有されるのはスコアのみで、履歴全体ではありません。グループの共有ゲームからいつでも取り消せます。取り消しても自分の履歴には残ります。',
  'Sharing sends the score sheet only — video comes later. Unsharing retracts a game from the board; it stays in your own history.': '共有されるのはスコアのみです。動画は今後対応します。共有を解除するとボードから消えますが、自分の履歴には残ります。',
  'Counts the ball thrown at a full rack in each frame. The tenth frame\'s bonus balls are left out — they would flatter the distribution.': '各フレームで10本すべて立った状態の1投目を数えます。第10フレームのボーナス投球は分布を良く見せてしまうため除いています。',
  'A phone will not hold that, and neither will a browser\'s storage quota. Clips need somewhere to live and something to pay for it.': 'スマートフォンにもブラウザの保存容量にも収まりません。動画には保存場所とその費用が必要です。',
  'Score sheets, though. Photograph a finished sheet and the frames are read off it — a few hundred kilobytes rather than a few hundred megabytes.': 'スコアシートなら可能です。投げ終えたシートを撮影するとフレームを読み取ります。数百メガバイトではなく数百キロバイトで済みます。',
  'Single pin': '1本残り',
  'Multi pin': '複数本',
  'Single-pin spares': '1本残りスペア',
  'Multi-pin spares': '複数本残りスペア',
  'Strikes': 'ストライク',
  'Spares': 'スペア',
  'Open': 'オープン',
  'Games': 'ゲーム数',
  'Rolling avg': 'ローリング平均',
  'Best run': '最長連続',
  'Score': 'スコア',
  'Game': 'ゲーム',
  'Tap a point for detail.': '点をタップすると詳細が出ます。',

  '{games} games · high {high}': '{games}ゲーム · 最高 {high}',
  '{n} vs base': '基準比 {n}',
  'Show the numbers': '数値を表示',
  'Hide the numbers': '数値を隠す',
  '▲ {n} place vs rolling avg': 'ローリング平均比 ▲{n}',
  '▲ {n} places vs rolling avg': 'ローリング平均比 ▲{n}',
  '▼ {n} place vs rolling avg': 'ローリング平均比 ▼{n}',
  '▼ {n} places vs rolling avg': 'ローリング平均比 ▼{n}',
  'same place as the rolling avg': 'ローリング平均と同順位',
  'Aya Sato shared a 234 — group record': 'Aya Sato が 234 を共有 — グループ記録',
  'Rika Tanabe joined with your invite code': 'Rika Tanabe があなたの招待コードで参加',
  'You passed Daniel on the rolling average': 'ローリング平均で Daniel を抜きました',
  'All ten down': '10本すべて倒した',
  'Clear the rack': '残りをすべて倒した',
  'Strike': 'ストライク',
  'Spare': 'スペア',
  'Ball down · {n}': '投球確定 · {n}本',
  'Tap the pins this ball took down': 'この投球で倒したピンをタップ',
  'leaves {leave}': '残り {leave}',
  'pin': '本',
  // ── Crew data ──
  'Season high': 'シーズン最高',
  'Pins this month': '今月のピン数',
  'Handicap avg': 'ハンディ平均',
  'Improvement': '伸び',
  'last 10 games': '直近10ゲーム',
  'best single game': '1ゲーム最高',
  'august total': '8月の合計',
  '90% of 220': '220の90%',
  'vs own baseline': '自分の基準との比較',
  'Average of the ten most recent games shared here.': 'ここに共有された直近10ゲームの平均です。',
  'Highest single game since the season opened in January.': '1月のシーズン開始以降の1ゲーム最高スコアです。',
  'Total pins felled in August — rewards showing up, not peaking.': '8月に倒したピンの合計です。調子の良さよりも通った回数が効きます。',
  'Average plus handicap, so a 150 bowler and a 200 bowler can share one board.': 'アベレージにハンデを加えるので、150の人と200の人が同じボードで並べます。',
  'Change against each bowler\'s own first-ten-game baseline.': '各自の最初の10ゲームを基準とした変化です。',
  'Group avg': 'グループ平均',
  'Games this week': '今週のゲーム',
  'Pins in August': '8月のピン',
  'open': '誰でも参加可',
  'invite-only': '招待制',
  'you own it': 'あなたがオーナー',
  '{n} members': '{n}人',
  'the group\'s default board': 'グループの既定ボード',

  // ── Navigation and screen titles ──
  'Home': 'ホーム',
  'Play': '入力',
  'History': '履歴',
  'Stats': '分析',
  'Crew': 'クルー',
  'Settings': '設定',
  'Lane Log': 'レーンログ',
  'Dashboard': 'ダッシュボード',
  'New game': '新しいゲーム',
  'Frame entry': 'スコア入力',
  'Scan a sheet': 'スコアシートを撮影',
  'Import': '読み込み',
  'Match history': '対戦履歴',
  'Archive': '記録',
  'Analytics': '分析',
  'Preferences': '各種設定',
  'Play day': 'プレイ日',
  'Session': 'セッション',
  'Video gallery': '動画',
  'Slow motion': 'スローモーション',
  'Game record': 'ゲーム記録',
  'Sign in': 'サインイン',
  'Account': 'アカウント',
  'Groups': 'グループ',
  'Social': 'ソーシャル',
  'Group': 'グループ',
  'Group chat': 'グループチャット',
  'Group settings': 'グループ設定',
  'Create a group': 'グループを作成',
  'Join a group': 'グループに参加',
  'Invite': '招待',
  'Share this game': 'このゲームを共有',
  'Game finished': 'ゲーム終了',
  'Shared games': '共有したゲーム',

  // ── Common ──
  'Cancel': 'キャンセル',
  'Delete': '削除',
  'Close': '閉じる',
  'Undo': '取り消す',
  'Try again': 'もう一度試す',
  'Soon': '近日',
  'Try': '試す',
  'Send': '送信',
  'Average': 'アベレージ',
  'High game': '最高スコア',
  'Strike rate': 'ストライク率',
  'Best': 'ベスト',
  'Series': 'シリーズ',
  'Change': '変化',
  'Date': '日付',
  'Time': '時刻',
  'Marks': 'マーク',
  'Photo': '写真',
  'No photo': '写真なし',
  'Not now': '今はしない',
  'Where you bowled': 'ボウリング場',
  'Home alley': 'ホーム場',
  'Home alley (optional)': 'ホーム場（任意）',
  'Details': '詳細',
  'Remove': '削除',
  'Rotate': '更新',
  'Leave': '退出',
  'Keep them': '残す',
  'Keep it': '残す',
  'Unshare': '共有を解除',
  'Sharing': '共有',
  'Shared': '共有済み',
  'Scan': '撮影',

  // ── Home ──
  'Your average': 'アベレージ',
  'Nothing bowled yet': 'まだ記録がありません',
  'Start a new game': '新しいゲームを始める',
  'Recent games': '最近のゲーム',
  'View all games': 'すべてのゲームを見る',
  'Your crew': 'クルー',
  'Nothing logged yet. Bowl a game or scan a sheet.': 'まだ記録がありません。ゲームを入力するか、スコアシートを撮影してください。',

  // ── History and the play day ──
  'Order': '並び替え',
  'Newest': '新しい順',
  'Oldest': '古い順',
  'Highest': '高得点順',
  'Lowest': '低得点順',
  'Search games': 'ゲームを検索',
  'Search house or date': 'ボウリング場・日付で検索',
  'Grouped by the day you bowled. Tap a day for the whole session.': 'プレイした日ごとにまとめています。日付をタップするとその日の全ゲームを表示します。',
  'Series total': 'シリーズ合計',
  'Across the session': 'セッション全体',
  'Per game': 'ゲームごと',
  'Export this day': 'この日を書き出す',
  'That day has no games on it.': 'この日のゲームはありません。',
  'Best game': 'ベストゲーム',
  'Open frames': 'オープンフレーム',
  'Spare rate': 'スペア成功率',

  // ── Analytics ──
  'Personal records': '自己記録',
  'Highest game': '最高スコア',
  'Best 10-game average': '直近10ゲーム平均',
  'Longest strike streak': '最長連続ストライク',
  'Spare conversion': 'スペア成功率',
  'Metric': '指標',
  'Date range': '期間',
  'Average progression': 'アベレージの推移',
  'Strike %': 'ストライク%',
  'Spare %': 'スペア%',
  'Pins': 'ピン数',
  'Total pins per game': '1ゲームの総ピン数',
  'Last 5': '直近5',
  '30 days': '30日',
  '90 days': '90日',
  '6 months': '6ヶ月',
  'Lifetime': '通算',
  'Spare analysis': 'スペア分析',
  'Strike streaks': '連続ストライク',
  'How frames finish': 'フレームの結果',
  'What you leave': '残りピンの傾向',
  'First ball': '1投目',
  'Splits': 'スプリット',
  'Achievements': '実績',
  'Consecutive strikes': '連続ストライク',
  'Consecutive strikes per occurrence, across this range.': 'この期間の連続ストライク回数の分布。',
  'Strike runs by length': '連続ストライクの長さ別回数',
  'No strikes in this range yet.': 'この期間にはまだストライクがありません。',
  'Dashed line = lifetime average. Tap a point for detail.': '破線は通算アベレージ。点をタップすると詳細が出ます。',
  'Two finished games and the trend starts here.': '2ゲーム終えると推移が表示されます。',
  'No finished games in this range. Bowl one, or widen the range above.': 'この期間に完了したゲームがありません。ゲームを入力するか、期間を広げてください。',
  'No frames in this range.': 'この期間のフレームがありません。',
  'No finished frames in this range.': 'この期間に完了したフレームがありません。',
  'First-ball pin counts': '1投目の倒したピン数',
  'Frame outcomes': 'フレームの結果',
  'No spares with pin data in this range. Score a game on the rack and the split appears here.': 'この期間にはピン情報のあるスペアがありません。ピンをタップして入力すると内訳が表示されます。',
  'Spare attempts and conversions by what was left': '残りピン別のスペア試投数と成功数',
  'Tap a badge to see exactly how it is measured.': 'バッジをタップすると判定方法がわかります。',

  // ── Play and the game record ──
  'How are you scoring this game?': 'このゲームをどう入力しますか？',
  'Tap the pins you knocked down': '倒したピンをタップ',
  'Just count the pins': 'ピン数だけ入力',
  'Scan a paper score sheet': '紙のスコアシートを撮影',
  'Discard this game': 'このゲームを破棄',
  'Pin rack': 'ピンラック',
  'Correct it': '修正する',
  'Corrected game': '修正後のゲーム',
  'Fix a frame': 'フレームを修正',
  'Delete this game': 'このゲームを削除',
  'Keep a copy': '控えを残す',
  'Export this game': 'このゲームを書き出す',
  'Share to a crew': 'クルーに共有',
  'Share to another crew': '別のクルーに共有',
  'The sheet it came from': '元のスコアシート',
  'The sheet, for checking against': '照合用のスコアシート',
  'Loading the photo…': '写真を読み込み中…',
  'The photo for this game could not be read.': 'このゲームの写真を読み込めませんでした。',
  'One group a frame. X for a strike, / for a spare, - for a miss.': '1フレームずつ入力します。Xはストライク、/はスペア、-はミスです。',
  'That game is no longer on this device.': 'このゲームはこの端末にありません。',

  // ── Scanning ──
  'Open the camera': 'カメラを開く',
  'Use a photo instead': '写真から読み込む',
  'Scan this row': 'この行を読み取る',
  'Read this game': 'このゲームを読み取る',
  'What will be read': '読み取る範囲',
  'Drag a box around one game’s row. Only what is inside it is read.': '1ゲーム分の行を枠で囲んでください。枠の中だけを読み取ります。',
  'Reading the sheet': 'スコアシートを読み取り中',
  'Recognition runs on this device — the photo is not uploaded anywhere.': '解析は端末内で行われ、写真はどこにも送信されません。',
  'Scanned game': '読み取ったゲーム',
  'Which row is yours': 'どの行があなたのものですか',
  'Marks — correct anything the scan got wrong': 'マーク — 読み取り間違いを修正してください',
  'What the scan read': '読み取り結果',
  'Scan a different sheet': '別のシートを読み取る',
  'That date is not one the calendar has — check it before saving.': 'その日付は存在しません。保存前に確認してください。',
  'The photo will not be kept with this game. The score sheet itself is unaffected.': '写真はこのゲームと一緒には保存されません。スコアシート自体には影響ありません。',

  // ── Crew ──
  'Your groups': '参加中のグループ',
  'Add a group': 'グループを追加',
  'Join with a code': 'コードで参加',
  'Link an account': 'アカウントを連携',
  'Groups need an account.': 'グループにはアカウントが必要です。',
  'Group name': 'グループ名',
  'Who can get in': '参加方法',
  'Create the group': 'グループを作成する',
  'Invite code': '招待コード',
  'Open the group': 'グループを開く',
  'The doors': '参加受付',
  'Doors open': '誰でも参加可',
  'Remove from group': 'グループから削除',
  'Leaderboard metric': 'ランキング指標',
  'Your rank': 'あなたの順位',
  'Recent activity': '最近の動き',
  'Message': 'メッセージ',
  'Shared to board': 'ボードに共有済み',
  'Across every board': 'すべてのボード',
  'Shared with this group': 'このグループに共有',
  'Shared by you': 'あなたの共有',
  'Shared by the crew': 'クルーの共有',
  'Nobody else has shared a game here yet.': 'まだ誰もゲームを共有していません。',
  'Nothing of yours is on this board. Share a game from your history.': 'あなたのゲームはまだこのボードにありません。履歴から共有してください。',
  'This game is already on every board you belong to.': 'このゲームは参加中のすべてのボードに共有済みです。',
  'Which crew': 'どのクルーに',
  'What goes with it': '一緒に送るもの',
  'Score sheet only': 'スコアのみ',
  'This game': 'このゲーム',
  'Tell the crew': 'クルーに知らせる',
  'Send a notification': '通知を送る',
  'The frames, marks and totals. A couple of kilobytes — instant, and it works offline.': 'フレーム・マーク・合計のみ。数キロバイトなので即時に送信でき、オフラインでも動きます。',
  'Members with notifications on get a nudge. Needs the push server running.': '通知をオンにしているメンバーに届きます。プッシュサーバーが必要です。',
  'Keep your games, or just start bowling.': '記録を残す。まずは投げるだけでも。',
  'Continue with Google': 'Googleで続ける',
  'Play as a guest': 'ゲストとして始める',
  'What a guest gives up': 'ゲストでできないこと',
  'Guests can read a group they were sent, but posting needs an account.': 'ゲストは送られたグループを閲覧できますが、投稿にはアカウントが必要です。',
  'How to join': '参加方法',
  'Enter the six-character code': '6文字のコードを入力',
  'QR code': 'QRコード',
  'Scan a QR code': 'QRコードを読み取る',
  'Stop scanning': '読み取りを停止',
  'Or show yours': '自分のコードを表示',
  'Point at the group\'s QR code': 'グループのQRコードに向けてください',
  'That QR is not a Lane Log invite. Still looking.': 'レーンログの招待QRではありません。読み取りを続けます。',
  'This browser will not give the app a camera. Use the invite code instead.': 'このブラウザではカメラを使えません。招待コードをお使いください。',
  'The QR code could not be drawn. The code itself still works.': 'QRコードを描画できませんでした。コード自体は有効です。',

  // ── Settings ──
  'Language': '言語',
  'Titles and navigation switch instantly.': '表示はすぐに切り替わります。',
  'Player profile': 'プロフィール',
  'Player name': '選手名',
  'Profile icon': 'アイコン',
  'Share finished games with your crew': '終了したゲームをクルーに共有',
  'Off by default. Turn it on and every game you save is posted to the crew as soon as it is finished.': '初期設定はオフです。オンにすると、保存したゲームが終了時にクルーへ投稿されます。',
  'Install': 'インストール',
  'Add to Home Screen': 'ホーム画面に追加',
  'Lane Log is installed on this device.': 'このアプリはこの端末にインストール済みです。',
  'Add Lane Log to your Home Screen so it opens full-screen and works offline.': 'ホーム画面に追加すると全画面で開き、オフラインでも使えます。',
  'Notifications': '通知',
  'Push notifications': 'プッシュ通知',
  'Send a test notification': 'テスト通知を送る',
  'Sync': '同期',
  'Cloud sync': 'クラウド同期',
  'Back up games and share stats with friends. Coming soon.': 'ゲームのバックアップと友達との共有。近日対応。',
  'About': 'このアプリについて',
  'Version': 'バージョン',
  'Storage': 'ストレージ',
  'Games on this device': 'この端末のゲーム数',
  'Scanned sheets kept': '保存中のスコアシート',
  'Used': '使用量',
  'Ask the browser to keep this data': 'このデータの保持をブラウザに要求',
  'Restore': '復元',
  'Restore from a file': 'ファイルから復元',
  'Clips': '動画',
  'Video is not built yet — it is the one feature that needs a backend.': '動画は未実装です。唯一サーバーが必要な機能です。',
  'What it would take': '必要なもの',

  // ── Videos ──
  'Clips are not built yet.': '動画はまだ実装されていません。',
  'What works today': '今できること',
  'Why it needs a backend first': 'サーバーが先に必要な理由',
  'Scan a score sheet': 'スコアシートを撮影',
  'A full game': '1ゲーム',
  'One throw at 1080p': '1080pの1投',
  'Video is the one feature that cannot live on the device. This is where it will go.': '動画だけは端末内に収まりません。ここに入る予定です。',

  // ── Errors ──
  'Something broke': '問題が発生しました',
  'Sorry': '申し訳ありません',
  'This screen could not be drawn.': 'この画面を表示できませんでした。',
  'What happened': '発生した内容',
  'Go back to the start': '最初に戻る',
  'Your games are still on this device — nothing has been lost.': 'ゲームはこの端末に残っています。データは失われていません。',

  // ── Counted phrases ──
  '{n} games': '{n}ゲーム',
  '{n} game': '{n}ゲーム',
  'of {n}': '{n}中',
  '{n} pins': '{n}ピン',
  'Show {n} more': 'さらに{n}件を表示',
};

export function translate(text: string, language: Language): string {
  if (language !== 'ja') return text;
  return JA[text] ?? text;
}

/**
 * Fill `{name}` placeholders after translating.
 *
 * Placeholders rather than string concatenation because Japanese does not put
 * the pieces in the same order — "3 games" is 3ゲーム but "in 3 days" is 3日後
 * and "of 6" is 6人中. A sentence assembled from fragments in English order
 * comes out wrong in half of them.
 */
export function format(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * The language, cached at module scope so a plain `t()` works anywhere.
 *
 * Safe because nothing in this app is memoised: changing the language sets
 * state in `App`, the whole tree re-renders, and every `t()` below it is
 * called again. If a component is ever wrapped in `React.memo`, it must take
 * `language` from `useTranslation()` instead, or it will keep the old words.
 */
let current: Language = 'en';

if (typeof window !== 'undefined') {
  const sync = () => {
    current = loadPreferences().language;
  };
  sync();
  window.addEventListener('lane-log:preferences', sync);
  window.addEventListener('storage', sync);
}

/** Translate, anywhere — components, helpers, or a plain function. */
export function t(text: string): string {
  return translate(text, current);
}

/** …and the same with `{placeholder}` filling. */
export function tf(text: string, vars: Record<string, string | number>): string {
  return format(t(text), vars);
}

/** `t('Save this game')` in a component, following the language preference. */
export function useTranslation() {
  const { preferences } = usePreferences();
  const language = preferences.language;

  const t = useCallback((text: string) => translate(text, language), [language]);

  const tf = useCallback(
    (text: string, vars: Record<string, string | number>) => format(translate(text, language), vars),
    [language],
  );

  return { t, tf, language };
}

/** True when a string is missing its Japanese — used by the coverage test. */
export function untranslated(texts: string[]): string[] {
  return texts.filter((text) => !(text in JA));
}

/**
 * The language `t()` is currently using.
 *
 * Exposed so that formatters which are not string lookups — dates, times —
 * can follow the app's own setting rather than the browser's. Someone whose
 * phone is in English and who has set Lane Log to Japanese should not get
 * "Aug 31" in the middle of a Japanese screen.
 */
export function currentLanguage(): Language {
  return current;
}
