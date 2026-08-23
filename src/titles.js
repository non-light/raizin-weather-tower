import {
  fogTurns, windTurns, stormTurns, hardTurns, roughSeen,
  specialSeen, distinctColors, ratio,
} from './stats.js'

/** レア度。数字が大きいほど優先される */
export const RARITY = {
  COMMON: { key: 'COMMON', rank: 0, label: 'COMMON' },
  UNCOMMON: { key: 'UNCOMMON', rank: 1, label: 'UNCOMMON' },
  RARE: { key: 'RARE', rank: 2, label: 'RARE' },
  EPIC: { key: 'EPIC', rank: 3, label: 'EPIC' },
  LEGENDARY: { key: 'LEGENDARY', rank: 4, label: 'LEGENDARY' },
}

/** カテゴリごとの雷神のひとこと（title 側で line を持てば上書きされる） */
const CATEGORY_LINE = {
  ROOKIE: '次は、もっといけるかも！',
  STEADY: 'すごく安定してた〜！',
  FOG: '真っ白なのに、すごい…！',
  WIND: 'ゆらゆらだったね〜！',
  STORM: '嵐、こわかったね…！',
  ROULETTE: 'いろんな色、出たね〜',
  MASTER: '雷神、びっくり…！',
}

/**
 * 称号データ。
 * condition(stats) が true になったもののうち、
 * レア度 → priority の順で高いものが選ばれる。
 * 追加するときはこの配列に1件足すだけでよい。
 */
export const TITLES = [
  /* ---------------- 初心者・早期崩壊系 ---------------- */
  { id: 1, name: 'はじめの一歩', category: 'ROOKIE', rarity: RARITY.COMMON, priority: 1,
    condition: (s) => s.turns <= 5 },
  { id: 2, name: '3手で崩した人', category: 'ROOKIE', rarity: RARITY.COMMON, priority: 3,
    condition: (s) => s.turns <= 3 },
  { id: 3, name: 'タワー初心者', category: 'ROOKIE', rarity: RARITY.COMMON, priority: 2,
    condition: (s) => s.turns <= 5 && s.dangerShakes === 0 },
  { id: 4, name: 'そーっとが苦手', category: 'ROOKIE', rarity: RARITY.UNCOMMON, priority: 4,
    condition: (s) => s.turns <= 6 && s.dangerShakes >= 2 },
  { id: 5, name: '勢いだけは一人前', category: 'ROOKIE', rarity: RARITY.UNCOMMON, priority: 4,
    condition: (s) => s.turns <= 4 && s.durationSec < 60 },
  { id: 6, name: '雷神もびっくり', category: 'ROOKIE', rarity: RARITY.UNCOMMON, priority: 5,
    condition: (s) => s.turns <= 2, line: 'あれれ…もう終わっちゃった…' },
  { id: 7, name: 'あっという間だった', category: 'ROOKIE', rarity: RARITY.COMMON, priority: 3,
    condition: (s) => s.durationSec < 40 },
  // 何にも当てはまらなかったときの受け皿（priority 0）
  { id: 8, name: '次はいける', category: 'ROOKIE', rarity: RARITY.COMMON, priority: 0,
    condition: () => true, line: '次はどこまでいけるかな？' },
  { id: 9, name: '最初からクライマックス', category: 'ROOKIE', rarity: RARITY.UNCOMMON, priority: 5,
    condition: (s) => s.turns <= 3 && s.dangerShakes >= 1 },
  { id: 10, name: '豪快な一手', category: 'ROOKIE', rarity: RARITY.UNCOMMON, priority: 4,
    condition: (s) => s.turns <= 8 && s.finalShake >= 2.5 },

  /* ---------------- 安定・慎重系 ---------------- */
  { id: 11, name: '慎重な積み師', category: 'STEADY', rarity: RARITY.RARE, priority: 5,
    condition: (s) => s.turns >= 10 && s.dangerShakes <= 1 },
  { id: 12, name: '石橋を叩く者', category: 'STEADY', rarity: RARITY.RARE, priority: 5,
    condition: (s) => s.durationSec >= 180 && s.dangerShakes <= 2 && s.turns >= 8 },
  { id: 13, name: 'タワー職人', category: 'STEADY', rarity: RARITY.RARE, priority: 4,
    condition: (s) => s.turns >= 12 },
  { id: 14, name: '静かなる挑戦者', category: 'STEADY', rarity: RARITY.RARE, priority: 6,
    condition: (s) => s.turns >= 8 && s.dangerShakes === 0 },
  { id: 15, name: 'バランスの達人', category: 'STEADY', rarity: RARITY.EPIC, priority: 5,
    condition: (s) => s.turns >= 15 && s.dangerShakes <= 2 },
  { id: 16, name: '安定第一', category: 'STEADY', rarity: RARITY.UNCOMMON, priority: 3,
    condition: (s) => s.turns >= 8 && s.dangerShakes <= 1 },
  { id: 17, name: '無理をしない者', category: 'STEADY', rarity: RARITY.UNCOMMON, priority: 2,
    condition: (s) => s.turns >= 6 && s.slotSeen.DANGER === 0 },
  { id: 18, name: '冷静な指先', category: 'STEADY', rarity: RARITY.RARE, priority: 6,
    condition: (s) => s.turns >= 10 && hardTurns(s) >= 4 && s.dangerShakes <= 3 },
  { id: 19, name: '崩さぬ者', category: 'STEADY', rarity: RARITY.EPIC, priority: 6,
    condition: (s) => s.turns >= 18 },
  { id: 20, name: '塔の守護者', category: 'STEADY', rarity: RARITY.EPIC, priority: 7,
    condition: (s) => s.turns >= 20 && s.dangerShakes <= 2 },

  /* ---------------- 霧系 ---------------- */
  { id: 21, name: '霧の生還者', category: 'FOG', rarity: RARITY.UNCOMMON, priority: 4,
    condition: (s) => fogTurns(s) >= 3 },
  { id: 22, name: '霧の中の達人', category: 'FOG', rarity: RARITY.RARE, priority: 5,
    condition: (s) => fogTurns(s) >= 5 },
  { id: 23, name: '見えなくても平気', category: 'FOG', rarity: RARITY.RARE, priority: 6,
    condition: (s) => s.denseFogTurns >= 3 },
  { id: 24, name: '白い世界の挑戦者', category: 'FOG', rarity: RARITY.UNCOMMON, priority: 3,
    condition: (s) => s.weatherSeen.FOG >= 4 },
  { id: 25, name: '霧を読む者', category: 'FOG', rarity: RARITY.RARE, priority: 6,
    condition: (s) => fogTurns(s) >= 4 && s.dangerShakes <= 2 },
  { id: 26, name: '目より勘', category: 'FOG', rarity: RARITY.RARE, priority: 7,
    condition: (s) => fogTurns(s) >= 3 && ratio(fogTurns(s), s) >= 0.5 },
  { id: 27, name: '霧の塔攻略者', category: 'FOG', rarity: RARITY.EPIC, priority: 6,
    condition: (s) => fogTurns(s) >= 5 && s.score >= 1200 },

  /* ---------------- 風系 ---------------- */
  { id: 28, name: '風にも負けない', category: 'WIND', rarity: RARITY.UNCOMMON, priority: 4,
    condition: (s) => windTurns(s) >= 3 },
  { id: 29, name: '風乗り', category: 'WIND', rarity: RARITY.RARE, priority: 5,
    condition: (s) => windTurns(s) >= 5 },
  { id: 30, name: '揺れる塔の支配者', category: 'WIND', rarity: RARITY.RARE, priority: 7,
    condition: (s) => s.dangerShakes >= 3 && s.turns >= 10 },
  { id: 31, name: '向かい風上等', category: 'WIND', rarity: RARITY.UNCOMMON, priority: 5,
    condition: (s) => windTurns(s) >= 3 && s.dangerShakes >= 2 },
  { id: 32, name: '風を読む者', category: 'WIND', rarity: RARITY.RARE, priority: 6,
    condition: (s) => windTurns(s) >= 4 && s.score >= 1000 },
  { id: 33, name: '嵐の前の達人', category: 'WIND', rarity: RARITY.UNCOMMON, priority: 4,
    condition: (s) => windTurns(s) >= 4 && s.weatherSeen.STORM === 0 },
  { id: 34, name: '風神じゃなくて雷神', category: 'WIND', rarity: RARITY.RARE, priority: 7,
    condition: (s) => windTurns(s) >= 3 && ratio(windTurns(s), s) >= 0.5,
    line: '雷神だよ〜、風神じゃないよ！' },

  /* ---------------- 嵐系 ---------------- */
  { id: 35, name: '嵐の生還者', category: 'STORM', rarity: RARITY.RARE, priority: 5,
    condition: (s) => stormTurns(s) >= 1 },
  { id: 36, name: 'STORM SURVIVOR', category: 'STORM', rarity: RARITY.EPIC, priority: 6,
    condition: (s) => stormTurns(s) >= 2 },
  { id: 37, name: '荒天突破', category: 'STORM', rarity: RARITY.EPIC, priority: 6,
    condition: (s) => roughSeen(s) >= 8 && s.score >= 1200 },
  { id: 38, name: '雷雨の挑戦者', category: 'STORM', rarity: RARITY.UNCOMMON, priority: 4,
    condition: (s) => s.weatherSeen.STORM >= 2 },
  { id: 39, name: '嵐でも抜く人', category: 'STORM', rarity: RARITY.RARE, priority: 6,
    condition: (s) => stormTurns(s) >= 1 && s.dangerShakes >= 1 },
  { id: 40, name: '雷神も認めた', category: 'STORM', rarity: RARITY.EPIC, priority: 8,
    condition: (s) => stormTurns(s) >= 2 && s.turns >= 20, line: 'すごい…！ 雷神、びっくり！' },

  /* ---------------- ルーレット系 ---------------- */
  { id: 41, name: '色の狩人', category: 'ROULETTE', rarity: RARITY.RARE, priority: 5,
    condition: (s) => distinctColors(s) >= 5 },
  { id: 42, name: 'ルーレットマスター', category: 'ROULETTE', rarity: RARITY.RARE, priority: 6,
    condition: (s) => s.spins >= 15 && s.score >= 1200 },
  { id: 43, name: '虹の申し子', category: 'ROULETTE', rarity: RARITY.RARE, priority: 5,
    condition: (s) => s.slotSeen.RAINBOW >= 3 },
  { id: 44, name: '黒を恐れぬ者', category: 'ROULETTE', rarity: RARITY.RARE, priority: 6,
    condition: (s) => s.slotCleared.DANGER >= 2 },
  { id: 45, name: '雷神チャンスの達人', category: 'ROULETTE', rarity: RARITY.RARE, priority: 6,
    condition: (s) => s.slotCleared.RAIZIN >= 2 },
  { id: 46, name: '色運最強', category: 'ROULETTE', rarity: RARITY.EPIC, priority: 6,
    condition: (s) => specialSeen(s) >= 4 && s.score >= 1000 },

  /* ---------------- 高スコア・長時間系 ---------------- */
  { id: 47, name: 'タワーマスター', category: 'MASTER', rarity: RARITY.EPIC, priority: 8,
    condition: (s) => s.turns >= 20 && s.score >= 2000 },
  { id: 48, name: '雷神泣かせ', category: 'MASTER', rarity: RARITY.EPIC, priority: 8,
    condition: (s) => s.durationSec >= 420 && hardTurns(s) >= 10,
    line: 'ながかった〜…！ 雷神もへとへと…' },
  { id: 49, name: '天空の積み師', category: 'MASTER', rarity: RARITY.EPIC, priority: 8,
    condition: (s) => s.maxLevel >= 20 },
  { id: 50, name: 'RAIZIN LEGEND', category: 'MASTER', rarity: RARITY.LEGENDARY, priority: 10,
    condition: (s) =>
      s.score >= 3000 && s.turns >= 30
      && fogTurns(s) >= 3 && windTurns(s) >= 3 && stormTurns(s) >= 1
      && s.slotCleared.DANGER >= 1,
    line: 'すごい…雷神、負けたかも…！' },
]

/* ------------------------------------------------------------------
 * 図鑑用の説明とヒント。
 * description は獲得後に、hint は未獲得でも見せる。
 * hint には具体的な数値を書かない（「これどうやったら取れるんだろう？」を残す）
 * ------------------------------------------------------------------ */
const DETAILS = {
  1:  ['はじめてタワーに触れた証', 'まずは1本、抜いてみよう'],
  2:  ['ごく早い段階でタワーが崩れた証', 'あっという間に終わってしまったとき'],
  3:  ['落ち着いて始めたけれど早めに終わった証', '揺らさずに、でも短めに終えてみよう'],
  4:  ['何度もひやりとしながら終えた証', 'ぐらぐら揺らしながら進んでみよう'],
  5:  ['短時間で一気に駆け抜けた証', '深く考えずに、さくっと遊んでみよう'],
  6:  ['雷神も目を丸くした超短期決着の証', 'ほんの数手で終わってしまったとき'],
  7:  ['ほんの短い時間で幕を閉じた証', 'あっという間に終わってしまったとき'],
  8:  ['まだまだこれからの証', 'とにかく一度、遊んでみよう'],
  9:  ['序盤から大きく揺らしたまま終えた証', '最初から派手にいってみよう'],
  10: ['最後に豪快な崩れ方をした証', '思いきり崩してみよう'],
  11: ['ひやりとせずに積み重ねた証', '揺らさずに、たくさん積んでみよう'],
  12: ['じっくり時間をかけて積み上げた証', 'あわてず、ゆっくり長く遊んでみよう'],
  13: ['何本も積み上げた職人の証', 'たくさん積み重ねてみよう'],
  14: ['一度も危ない揺れを起こさなかった証', '最後まで、まったく揺らさずに進んでみよう'],
  15: ['長く積んでもほとんど揺らさなかった証', 'かなりの本数を、静かに積んでみよう'],
  16: ['安定して積み続けた証', '落ち着いて積み重ねてみよう'],
  17: ['危ない場面を避け続けた証', '難しい条件を引かずに積んでみよう'],
  18: ['荒れた天気の中でも落ち着いていた証', '悪天候でも冷静に積んでみよう'],
  19: ['ひときわ多くの手数を重ねた証', 'とにかく長く積み続けてみよう'],
  20: ['塔を守り抜いた者の証', '長く、そして静かに積み上げてみよう'],
  21: ['霧の中を何度も抜けた証', '霧のターンを何度か成功しよう'],
  22: ['白い世界を知り尽くした証', '霧の中で何度も成功してみよう'],
  23: ['濃い霧でも迷わなかった証', '真っ白なときでも、あきらめず進んでみよう'],
  24: ['何度も霧に出会った証', '霧の日に何度も出会ってみよう'],
  25: ['霧の中でも揺らさなかった証', '霧の日を、静かに乗り切ってみよう'],
  26: ['見えなくても勘で進んだ証', 'ほとんどの手を霧の中で決めてみよう'],
  27: ['霧の塔を攻略した証', '霧の中で、たくさん点を稼いでみよう'],
  28: ['風に負けずに積んだ証', '風のターンを何度か成功しよう'],
  29: ['風を乗りこなした証', '風の中で何度も成功してみよう'],
  30: ['揺れる塔を制した証', 'ぐらぐらしながらも、長く積んでみよう'],
  31: ['向かい風の中を進んだ証', '風の日に、ひやりとしながら進んでみよう'],
  32: ['風を読み切った証', '風の中で、たくさん点を稼いでみよう'],
  33: ['嵐が来る前に鍛えた証', '嵐に会わずに、風の日を重ねてみよう'],
  34: ['ほとんどを風の中で戦った証', 'ほとんどの手を風の中で決めてみよう'],
  35: ['激しい嵐を乗り越えた証', '荒れた空の中でも、生き残ってみよう'],
  36: ['嵐を何度も越えた者の証', '荒れた日を、何度も乗り越えてみよう'],
  37: ['荒れた空を突破し続けた証', '悪天候ばかりの中で、たくさん点を稼いでみよう'],
  38: ['何度も雷雨に挑んだ証', '荒れた空に、何度も出会ってみよう'],
  39: ['嵐の最中でも抜いてみせた証', '荒れた空の中で、ひやりとしながら成功しよう'],
  40: ['雷神が認めた嵐の勇者の証', '荒れた日を何度も越えて、長く積んでみよう'],
  41: ['すべての色を狩り尽くした証', 'いろいろな色で成功してみよう'],
  42: ['ルーレットを回し尽くした証', '何度も回して、たくさん点を稼いでみよう'],
  43: ['虹に何度も出会った証', '虹のマスに何度か止まってみよう'],
  44: ['黒を恐れずに挑んだ証', '黒のマスでも、成功してみよう'],
  45: ['雷神チャンスを活かした証', '雷神のマスを活かして成功しよう'],
  46: ['特別なマスに愛された証', '特別なマスをたくさん引いて、点も稼いでみよう'],
  47: ['塔を極めた者の証', 'たくさん積んで、高い点を目指してみよう'],
  48: ['雷神を根負けさせた証', 'とても長い時間、荒れた空の中で戦ってみよう'],
  49: ['天まで届く塔を積んだ証', 'とにかく高く積み上げてみよう'],
  50: ['すべてを乗り越えた伝説の証', 'あらゆる天気と条件を越えて、限界まで積んでみよう'],
}

for (const t of TITLES) {
  const d = DETAILS[t.id] || ['', '']
  t.number = t.id
  t.description = d[0]
  t.hint = d[1]
  // 初心者向けの COMMON は最初から名前を見せる
  t.hiddenName = t.rarity.rank <= 0 ? t.name : '？？？'
}

/** 図鑑のカテゴリ表示名 */
export const CATEGORY_LABEL = {
  ROOKIE: '初心者',
  STEADY: '安定',
  FOG: '霧',
  WIND: '風',
  STORM: '嵐',
  ROULETTE: 'ルーレット',
  MASTER: '高スコア',
}

/** その称号のときの雷神のひとこと */
export function titleLine(title) {
  return title.line || CATEGORY_LINE[title.category] || 'おつかれさま〜！'
}

/**
 * プレイ統計から称号を1つ決める。
 * レア度 → priority の順で絞り、同点なら複数から1つ選ぶ
 * （同じプレイ内容でも毎回同じにならないように）。
 */
export function pickTitle(stats) {
  const matched = TITLES.filter((t) => {
    try { return t.condition(stats) } catch { return false }
  })
  if (matched.length === 0) return TITLES.find((t) => t.id === 8)

  matched.sort((a, b) => b.rarity.rank - a.rarity.rank || b.priority - a.priority)
  const top = matched[0]
  const tied = matched.filter(
    (t) => t.rarity.rank === top.rarity.rank && t.priority === top.priority
  )
  return tied[Math.floor(Math.random() * tied.length)]
}

/** 図鑑などで使えるように、全称号と獲得状況を返す */
export function evaluateAll(stats) {
  return TITLES.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    rarity: t.rarity.key,
    earned: (() => { try { return t.condition(stats) } catch { return false } })(),
  }))
}
