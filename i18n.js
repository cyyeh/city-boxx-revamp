/* ============================================================
 * i18n — English / Traditional Chinese
 * Exposes window.I18N with: current language, get(key, vars),
 * setLang(lang), apply() to rewrite [data-i18n] / [data-i18n-html].
 * ============================================================ */

(() => {
'use strict';

const STRINGS = {
  en: {
    subtitle: 'REVAMPED EDITION',
    selectMode: 'SELECT MODE',
    onePlayer: '1 PLAYER',
    twoPlayers: '2 PLAYERS',
    ctrl1p: '<b>1P:</b> press <kbd>↓</kbd> &mdash; or tap the screen on mobile &mdash; to release the swinging hook',
    ctrl2p: '<b>2P:</b> P1 = <kbd>↓</kbd> &nbsp; P2 = <kbd>S</kbd> &nbsp; <span class="hint-note">(keyboard only)</span>',
    goal: 'Endless mode — stack as high as you can! The hook swings faster with every floor. Misaligned blocks tilt the tower, and a lean too far brings it all down.',
    player: 'PLAYER',
    player1: 'PLAYER 1',
    player2: 'PLAYER 2',
    floors: 'FLOORS',
    score: 'SCORE',
    menu: 'MENU',
    playAgain: 'PLAY AGAIN',
    mainMenu: 'MAIN MENU',
    rotateHint: 'Rotate your device to landscape for the best experience',
    // end-screen messages
    youWin: 'YOU WIN!',
    towerCollapsed: 'TOWER COLLAPSED',
    p1Wins: 'P1 WINS!',
    p2Wins: 'P2 WINS!',
    tie: 'TIE GAME',
    detailFloorsScore: 'Floors: {floors}\nScore: {score}',
    detailFloorsBuilt: 'Floors built: {floors}\nScore: {score}',
    detailRace: 'P1 score: {p1score}\nP2 floors: {p2floors}',
    detailRace2: 'P2 score: {p2score}\nP1 floors: {p1floors}',
    detailScores: 'P1 score: {p1score}\nP2 score: {p2score}',
    detailBoth: 'P1: {p1floors} floors / {p1score}\nP2: {p2floors} floors / {p2score}',
  },
  zh: {
    subtitle: '重製版',
    selectMode: '選擇模式',
    onePlayer: '單人模式',
    twoPlayers: '雙人對戰',
    ctrl1p: '<b>單人：</b>按 <kbd>↓</kbd>（手機可直接點擊畫面）放開搖擺中的吊鉤',
    ctrl2p: '<b>雙人：</b>玩家一 = <kbd>↓</kbd> &nbsp; 玩家二 = <kbd>S</kbd> &nbsp; <span class="hint-note">（需鍵盤）</span>',
    goal: '無盡模式 — 看你能疊多高！每多一層吊鉤就晃得更快，對位不準大樓會越來越歪，歪太多整棟就會倒。',
    player: '玩家',
    player1: '玩家一',
    player2: '玩家二',
    floors: '樓層',
    score: '分數',
    menu: '選單',
    playAgain: '再玩一次',
    mainMenu: '回主選單',
    rotateHint: '請將裝置橫向擺放以獲得最佳體驗',
    youWin: '過關！',
    towerCollapsed: '大樓倒了',
    p1Wins: '玩家一獲勝！',
    p2Wins: '玩家二獲勝！',
    tie: '平手',
    detailFloorsScore: '樓層：{floors}\n分數：{score}',
    detailFloorsBuilt: '建造樓層：{floors}\n分數：{score}',
    detailRace: '玩家一分數：{p1score}\n玩家二樓層：{p2floors}',
    detailRace2: '玩家二分數：{p2score}\n玩家一樓層：{p1floors}',
    detailScores: '玩家一分數：{p1score}\n玩家二分數：{p2score}',
    detailBoth: '玩家一：{p1floors} 層 / {p1score}\n玩家二：{p2floors} 層 / {p2score}',
  },
};

const LANG_KEY = 'cityBloxxLang';
let current = (() => {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && STRINGS[saved]) return saved;
  // detect by browser
  const nav = (navigator.language || 'en').toLowerCase();
  return nav.startsWith('zh') ? 'zh' : 'en';
})();

function format(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

function get(key, vars) {
  const table = STRINGS[current] || STRINGS.en;
  const fallback = STRINGS.en[key] || key;
  return format(table[key] || fallback, vars);
}

function setLang(lang) {
  if (!STRINGS[lang]) return;
  current = lang;
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  apply();
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

function apply() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = get(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = get(el.dataset.i18nHtml);
  });
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === current);
  });
}

function init() {
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });
  document.documentElement.lang = current === 'zh' ? 'zh-Hant' : 'en';
  apply();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.I18N = {
  get,
  setLang,
  apply,
  get lang() { return current; },
};

})();
