/* =========================================================
   노은 — app.js
   정해진 영역(이미지 슬라이드 · 음악 · 디데이 · 방명록 · 캘린더 · 갤러리 ·
   문서 정리 · 세션카드 · 체크보드)이 항상 같은 구성으로 보이도록
   각각 고정 렌더 함수로 관리함. 위젯 제목은 전부 없음(애플 위젯 스타일),
   사이트 이름/잠금/테마 버튼은 배너 하단에 통합되어 있음.
   ========================================================= */

let editMode = sessionStorage.getItem('gh_edit') === '1';

// ▼ 위젯별 "편집 잠금 해제" 상태.
//   편집모드(editMode)에 들어와도 각 위젯의 삭제버튼·이동손잡이 등은 바로 보이지
//   않고, 그 위젯의 연필(✎) 버튼을 한 번 눌러야만 나타남 — 실수로 건드리는 걸
//   막기 위한 2단계 안전장치. 위젯 키(문자열) 단위로 관리하며, 잠금(로그아웃)
//   하거나 새로고침하면 초기화됨(세션에 굳이 남길 필요 없는 임시 UI 상태).
let widgetUnlocked = new Set();
// 이 위젯 안의 삭제버튼/이동손잡이/개별 편집버튼 등을 지금 보여줘도 되는지.
function isWidgetOpen(key){ return editMode && widgetUnlocked.has(key); }
// 위젯 카드 우상단에 붙는 연필 버튼 HTML. key가 이미 열려있으면 active 스타일.
// wCardEditKeys에 없는(=이미 자체 편집버튼이 있는 speech/shaker 같은) 위젯은
// 이 함수를 안 쓰고 넘어가면 됨.
function widgetEditToggleBtnHtml(key, label){
  if(!editMode) return '';
  const open = widgetUnlocked.has(key);
  return `<button class="w-edit-toggle-btn ${open ? 'active' : ''}" data-wkey="${key}" title="${escapeHtml(label || '편집')}" aria-label="${escapeHtml(label || '편집')}">✎</button>`;
}
// 연필 버튼 클릭 → 해당 위젯만 잠금 해제 토글 후 전체 다시 그림(각 렌더 함수가
// isWidgetOpen()을 참조하므로 renderAllModules 한 번이면 반영됨).
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.w-edit-toggle-btn');
  if(!btn) return;
  e.stopPropagation();
  const key = btn.dataset.wkey;
  if(widgetUnlocked.has(key)) widgetUnlocked.delete(key); else widgetUnlocked.add(key);
  // 연필 버튼 하나만 눌러도 renderAllModules()가 위젯 13개의 innerHTML을 전부
  // 통째로 새로 그림 — 이때 브라우저의 스크롤 앵커링(Scroll Anchoring)이 기준으로
  // 삼고 있던 옛 DOM 노드들이 한꺼번에 사라졌다가 새 노드로 바뀌면서 앵커를 놓쳐,
  // 스크롤 위치가 엉뚱한 곳으로 훅 튀는 현상이 있었음. 다시 그리기 직전 스크롤
  // 위치를 기억해뒀다가, 그린 직후와 다음 프레임에 한 번 더 그대로 되돌려줌
  // (다음 프레임까지 보는 이유는 위젯 높이가 막 반영되는 그 찰나에 브라우저가
  // 다시 한번 앵커를 다시 잡으며 위치를 흔드는 경우가 있어서임).
  const scrollY = window.scrollY;
  renderAllModules();
  window.scrollTo(0, scrollY);
  requestAnimationFrame(()=> window.scrollTo(0, scrollY));
});
// 카드 자체는 index.html에 고정 마크업으로 있고(내부 리스트만 다시 그리는)
// 위젯들(캘린더/방명록/세션카드 등)을 위한 공용 헬퍼 — 연필 버튼을 카드
// 우상단에 붙였다 뗐다 하고, 열림 상태에 따라 active 클래스만 갱신함.
function syncCardEditToggle(cardId, key, label){
  const card = document.getElementById(cardId);
  if(!card) return;
  let btn = card.querySelector(':scope > .w-edit-toggle-btn');
  if(!editMode){
    if(btn) btn.remove();
    return;
  }
  if(!btn){
    btn = document.createElement('button');
    btn.dataset.wkey = key;
    card.prepend(btn);
  }
  btn.className = 'w-edit-toggle-btn' + (isWidgetOpen(key) ? ' active' : '');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.textContent = '✎';
}

// 편집 비밀번호(해시)를 기억해뒀다가, 실제로 DB에 쓸 때마다 자동으로 같이 실어 보냄.
// Firestore 보안 규칙이 이 값을 meta/lock에 저장된 해시와 대조해서, 비밀번호를 아는
// 사람이 보낸 요청만 통과시킴. sessionStorage에 저장해 새로고침해도 편집 상태 유지.
let currentPwHash = sessionStorage.getItem('gh_pw') || null;

// ▼ 모든 Firestore 쓰기(set)에 비밀번호 해시(_pw)를 자동으로 끼워 넣는 패치.
//   앱 코드 곳곳의 .set(...) 호출을 일일이 고치지 않아도, 여기 한 곳만 고치면
//   editMode일 때의 모든 쓰기 요청에 _pw가 실려서 나감.
(function patchFirestoreWritesWithPassword(){
  const origDocSet = firebase.firestore.DocumentReference.prototype.set;
  firebase.firestore.DocumentReference.prototype.set = function(data, options){
    const payload = currentPwHash ? Object.assign({}, data, { _pw: currentPwHash }) : data;
    return origDocSet.call(this, payload, options);
  };
  const origBatchSet = firebase.firestore.WriteBatch.prototype.set;
  firebase.firestore.WriteBatch.prototype.set = function(ref, data, options){
    const payload = currentPwHash ? Object.assign({}, data, { _pw: currentPwHash }) : data;
    return origBatchSet.call(this, ref, payload, options);
  };
})();

const lockBtn = document.getElementById('lockBtn');
const lockBadge = document.getElementById('lockBadge');
const modalRoot = document.getElementById('modalRoot');
const siteBannerEl = document.getElementById('siteBanner');
const bgImageLayerEl = document.getElementById('bgImageLayer');
const bannerEditBtn = document.getElementById('bannerEditBtn');
const bgEditBtn = document.getElementById('bgEditBtn');
const globalStyleBtn = document.getElementById('globalStyleBtn');
const modeToggleBtn = document.getElementById('modeToggleBtn');

/* ---------------- 라이트모드 / 다크모드 ----------------
   방문자마다 원하는 모드를 볼 수 있도록 브라우저(localStorage)에만 저장, 다크모드가
   기본값. 배너/배경/테마는 모드별로 완전히 분리되도록 Firestore 문서명 뒤에 'Light'를
   붙인 전용 문서를 씀(meta/banner ↔ meta/bannerLight 등) — 다크모드에서 꾸민 걸 그대로
   두고 라이트모드만 새로 자유롭게 꾸밀 수 있음. */
let siteMode = localStorage.getItem('gh_mode') === 'light' ? 'light' : 'dark';
function metaDoc(base){
  return db.collection('meta').doc(siteMode === 'light' ? base + 'Light' : base);
}
const MODE_LABELS = { dark: '멧돼지관', light: '사슴관' };
const MODE_ICONS = {
  dark: '<svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  light: '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>'
};
const ICONS = {
  lock: '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  unlock: '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>'
};
// 매번 innerHTML을 통째로 새로 그리면 .mt-thumb가 매번 새 DOM 노드가 되어버려서
// CSS의 left 트랜지션이 재생될 새가 없이(이미 최종 위치로 그려진 새 엘리먼트라)
// 그냥 순간이동처럼 보임. 그래서 마크업은 처음 한 번만 만들고, 이후로는 같은
// 노드의 텍스트/아이콘만 갈아끼워서 위치(left) 변화가 실제로 애니메이션되게 함.
function ensureModeToggleMarkup(){
  if(!modeToggleBtn || modeToggleBtn.querySelector('.mt-thumb')) return;
  modeToggleBtn.classList.remove('btn','small');
  modeToggleBtn.classList.add('mode-toggle');
  modeToggleBtn.innerHTML =
    '<span class="mt-track-fill"></span>' +
    '<span class="mt-thumb"><span class="mt-icon"></span></span>' +
    '<span class="mt-label"></span>';
}
function applyModeClass(){
  document.body.classList.toggle('theme-light', siteMode === 'light');
  if(modeToggleBtn){
    ensureModeToggleMarkup();
    modeToggleBtn.classList.toggle('mt-target-light', siteMode === 'light');
    modeToggleBtn.querySelector('.mt-icon').innerHTML = MODE_ICONS[siteMode];
    modeToggleBtn.querySelector('.mt-label').textContent = MODE_LABELS[siteMode];
    modeToggleBtn.setAttribute('aria-label', MODE_LABELS[siteMode] + ' 적용 중 · 눌러서 전환');
  }
}
applyModeClass();

/* ---------------- 설정 미완료 안내 ---------------- */

if (typeof FIREBASE_NOT_CONFIGURED !== 'undefined' && FIREBASE_NOT_CONFIGURED) {
  const banner = document.createElement('div');
  banner.style.cssText = 'background:#f4d9d9;color:#7a2b2b;padding:12px 20px;font-size:.85rem;text-align:center;position:sticky;top:0;z-index:999;';
  banner.innerHTML = '⚠️ 아직 firebase-config.js에 실제 Firebase 값을 넣지 않았어요. 설정가이드.md의 ①②단계를 먼저 완료해주세요. (지금은 저장이 되지 않아요)';
  document.body.prepend(banner);
}

/* ---------------- 공통 유틸 ---------------- */

function docRef(name){ return db.collection('content').doc(name); }

function toast(msg){
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), 1800);
}

// 위젯 항목을 지울 때 공통으로 쓰는 삭제 확인 팝업 — 브라우저 기본 confirm() 대신
// 사이트 톤에 맞는 커스텀 UI로 통일함. modalRoot가 아니라 document.body에 직접
// 붙여서(toast와 같은 방식) 이미 다른 모달/라이트박스가 열려 있는 위에서 띄워도
// 그 아래 모달을 지우지 않고 그대로 겹쳐 뜸. Promise<boolean>으로 사용:
//   if(!(await confirmDelete('정말 삭제할까요?'))) return;
// message는 이미 escapeHtml된 텍스트(또는 고정 문구)만 넘겨야 함 — innerHTML로 들어감.
function confirmDelete(message){
  return new Promise(resolve=>{
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay confirm-delete-overlay';
    overlay.innerHTML = `
      <div class="modal confirm-delete-modal">
        <p class="confirm-delete-msg">${message}</p>
        <div class="modal-actions">
          <button class="btn ghost" id="cdCancel" type="button">취소</button>
          <button class="btn danger" id="cdOk" type="button">삭제</button>
        </div>
      </div>
    `;
    let done = false;
    const finish = (result)=>{
      if(done) return;
      done = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e)=>{ if(e.key === 'Escape') finish(false); };
    overlay.addEventListener('click', (e)=>{ if(e.target === overlay) finish(false); });
    overlay.querySelector('#cdCancel').onclick = ()=> finish(false);
    overlay.querySelector('#cdOk').onclick = ()=> finish(true);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  });
}

async function sha256(str){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function openModal(innerHtml, onMount, extraClass){
  // 쉐이커 위젯을 전체화면으로 띄운 상태(#shakerFrame이 그 오버레이 안으로
  // 옮겨가 있는 상태)에서 다른 모달이 열리면, 아래 modalRoot.innerHTML = ''가
  // 실제 DOM 요소인 #shakerFrame까지 통째로 지워버려 위젯이 영구히 사라짐.
  // 그래서 어떤 모달이든 열리기 직전엔 항상 먼저 프레임을 제자리로 돌려놓음.
  if(typeof closeShakerFullscreen === 'function') closeShakerFullscreen();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal${extraClass ? ' ' + extraClass : ''}">${innerHtml}</div>`;
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) closeModal(); });
  modalRoot.innerHTML = '';
  modalRoot.appendChild(overlay);
  if(onMount) onMount(overlay.querySelector('.modal'));
}
function closeModal(){
  if(typeof closeShakerFullscreen === 'function') closeShakerFullscreen();
  modalRoot.innerHTML = '';
}

/* FLIP(First-Last-Invert-Play) 방식의 간단한 자리바꿈 애니메이션. el은 이미 최종
   위치/크기로 그려져 있는 상태 — 거기서 시작하는 대신, 우선 fromRect(트랜지션
   전 다른 자리에 있던 사각형) 크기/위치로 보이도록 transform만 걸어뒀다가
   (Invert), 강제 리플로우 후 그 transform을 없애며 트랜지션시킴(Play) — 그러면
   fromRect 자리에 있던 게 자연스럽게 지금 자리로 자라나거나 줄어드는 것처럼 보임 */
function flipAnimateElement(el, fromRect){
  const toRect = el.getBoundingClientRect();
  if(!toRect.width || !toRect.height) return;
  const scaleX = fromRect.width / toRect.width;
  const scaleY = fromRect.height / toRect.height;
  const dx = (fromRect.left + fromRect.width/2) - (toRect.left + toRect.width/2);
  const dy = (fromRect.top + fromRect.height/2) - (toRect.top + toRect.height/2);
  el.style.animation = 'none'; // 기본으로 걸려있는 등장 애니메이션과 겹치지 않게 끔
  el.style.transition = 'none';
  el.style.transformOrigin = 'center center';
  el.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
  el.getBoundingClientRect(); // 강제 리플로우: 위 transform이 트랜지션 없이 먼저 반영되게 함
  requestAnimationFrame(()=>{
    el.style.transition = 'transform .32s cubic-bezier(.22,.68,.32,1)';
    el.style.transform = '';
    el.addEventListener('transitionend', function done(){
      el.style.transition = ''; el.style.transformOrigin = '';
      el.removeEventListener('transitionend', done);
    });
  });
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function uid(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function debounce(fn, wait){
  let t;
  return (...args)=>{ clearTimeout(t); t = setTimeout(()=> fn(...args), wait); };
}

/* ---------------- 말풍선(본체+꼬리)을 SVG path 하나로 합쳐 clip-path로 자르기 ----------------
   기존 방식(회전시킨 사각형을 겹쳐 꼬리처럼 보이게 함)은 본체·꼬리가 둘 다 반투명이라
   겹치는 부분이 두 겹만큼 진해지고, 테두리를 넣으면 겹치는 선이 이중선으로 보였음.
   지금은 본체(둥근 사각형)+꼬리(삼각형)를 path 하나로 합쳐 그 모양 그대로 오려내고,
   배경/블러/테두리를 그 하나의 도형에만 적용해 겹침 자체를 없앰. 폭은 내용에 따라
   달라지므로 매번 렌더된 실제 크기를 재서 경로를 다시 계산함. */
const BUBBLE_TAIL_KAPPA = 0.5522847498; // 사분원을 3차 베지어로 근사할 때 쓰는 표준 상수

function buildBubbleTailPath(w, bodyH, radius, tailLeft, tailWidth, tailHeight){
  const r = Math.max(0, Math.min(radius, w/2, bodyH/2));
  const k = BUBBLE_TAIL_KAPPA * r;
  const tx1 = Math.min(Math.max(tailLeft, r), w - r - tailWidth);
  const tx2 = tx1 + tailWidth;
  const tipX = (tx1 + tx2) / 2;
  return [
    `M ${r} 0`,
    `L ${w - r} 0`,
    `C ${w - r + k} 0 ${w} ${r - k} ${w} ${r}`,
    `L ${w} ${bodyH - r}`,
    `C ${w} ${bodyH - r + k} ${w - r + k} ${bodyH} ${w - r} ${bodyH}`,
    `L ${tx2} ${bodyH}`,
    `L ${tipX} ${bodyH + tailHeight}`,
    `L ${tx1} ${bodyH}`,
    `L ${r} ${bodyH}`,
    `C ${r - k} ${bodyH} 0 ${bodyH - r + k} 0 ${bodyH - r}`,
    `L 0 ${r}`,
    `C 0 ${r - k} ${r - k} 0 ${r} 0`,
    'Z'
  ].join(' ');
}

// 말풍선처럼 "폭이 넘치면 줄바꿈, 안 넘치면 내용에 딱 맞게"가 필요한 요소용 헬퍼.
// width:max-content + max-width만 쓰면, 줄바꿈이 필요한 경우 브라우저가 폭을
// max-width 값 그대로 써버려서(그 줄 수를 유지하는 더 좁은 폭이 있어도) 짧은
// 줄 옆에 불필요한 여백이 남음 — 그래서 줄바꿈이 필요한 경우엔 "같은 줄 수를
// 유지하는 가장 좁은 폭"을 이분탐색으로 찾아 실제 폭으로 줌.
function shrinkToFitWidth(el, maxW, minW){
  el.style.width = 'max-content';
  el.style.maxWidth = maxW + 'px';
  if(el.scrollWidth <= maxW){ el.style.width = ''; return; } // 안 넘치면 max-content가 이미 딱 맞음
  const targetH = el.offsetHeight; // maxW 폭일 때 줄 수(=높이) — 이걸 유지하는 선에서 최대한 좁힘
  let lo = minW, hi = maxW, best = maxW;
  for(let i=0;i<8;i++){
    const mid = Math.round((lo+hi)/2);
    el.style.width = mid + 'px';
    if(el.offsetHeight <= targetH){ best = mid; hi = mid - 1; }
    else{ lo = mid + 1; }
  }
  el.style.width = best + 'px';
}
// opts.tailLeft: 꼬리 왼쪽 끝의 x좌표(px) 또는 실제 렌더링 폭(w)을 받아 x좌표를
// 반환하는 함수(가운데 정렬 등 폭에 따라 위치가 달라질 때 사용)
function shapeSpeechBubble(el, opts){
  if(!el) return;
  const w = el.offsetWidth, totalH = el.offsetHeight;
  if(!w || !totalH) return;
  const tailHeight = opts.tailHeight;
  const bodyH = totalH - tailHeight; // 꼬리용으로 미리 늘려둔 padding-bottom만큼 뺀, 본래 본체 높이
  const tailLeft = typeof opts.tailLeft === 'function' ? opts.tailLeft(w) : opts.tailLeft;
  const path = buildBubbleTailPath(w, bodyH, opts.radius, tailLeft, opts.tailWidth, tailHeight);
  el.style.clipPath = `path('${path}')`;
}

/* ---------------- 메인 갤러리 매스너리(핀터레스트형) 실제 배치 ----------------
   예전엔 CSS column-count로 다단을 흉내냈는데, 브라우저가 전체 높이를 균형있게
   나눠 채우다 보니 배열 앞쪽(최신 — storeGalleryImage가 항상 맨 앞에 추가함) 사진이
   둘째/셋째 열 중간에 놓일 수 있어 "최신일수록 위"가 보장 안 됐음. 그래서 배열
   순서대로 보며 "그 시점 가장 짧은 열"에 하나씩 쌓는 진짜 핀터레스트 방식으로 바꿈. */
const PIN_MASONRY_GAP = 12;
function pinMasonryColumnCount(width){
  if(width < 700) return 2;   // 모바일: 2열
  return 4;                   // PC: 4열
}
function layoutPinMasonry(gridEl){
  if(!gridEl) return;
  // gridEl로는 스크롤 래퍼(#galleryGrid, .pin-grid-scroll)가 넘어오는 경우가 많은데,
  // 실제 사진 타일(.pin-item)은 그 안쪽의 .pin-grid의 직계 자식임. 예전엔 래퍼의
  // 직계 자식(=.pin-grid 딱 하나)을 타일인 것처럼 잘못 순회해서, 실제 타일들은 위치/크기가
  // 한 번도 계산되지 않아 높이가 0으로 접혀 사진이 전혀 보이지 않는 문제가 있었음.
  // 그래서 항상 실제 타일을 담고 있는 .pin-grid를 찾아서 그 안에서 계산하도록 함.
  const inner = gridEl.classList.contains('pin-grid') ? gridEl : (gridEl.querySelector(':scope > .pin-grid') || gridEl);
  const tiles = Array.from(inner.children);
  const width = gridEl.clientWidth;
  if(!tiles.length){ inner.style.height = '0px'; return; }
  // 갤러리 탭이 아직 한 번도 화면에 보이지 않았을 때(content-visibility:auto로 옆 탭이
  // 렌더링을 건너뛴 상태)는 폭이 0으로 읽혀서 사진들이 자리를 못 잡고 겹쳐 보일 수 있음.
  // 이럴 땐 포기하지 않고 ResizeObserver로 실제 폭이 잡히는 순간(탭 전환 등) 다시 계산함
  if(!width){ ensurePinMasonryResizeWatch(gridEl); return; }
  const cols = pinMasonryColumnCount(width);
  const colW = (width - PIN_MASONRY_GAP * (cols - 1)) / cols;
  // 타일마다 "폭 쓰기 → 높이 읽기"를 번갈아 하면 폭 쓰기가 레이아웃을 무효화시켜
  // 매번 강제 동기 리플로우가 발생함(사진 N장이면 N번). 모든 타일 폭이 어차피
  // 같은 colW이므로, 폭 쓰기를 전부 먼저 끝내고 → 높이를 한 번에 몰아 읽고 →
  // 위치(transform, 레이아웃에 영향 없음)만 계산해 쓰면 리플로우가 1번으로 줄어듦.
  tiles.forEach(tile=>{ tile.style.width = colW + 'px'; });
  const tileHeights = tiles.map(tile=> tile.getBoundingClientRect().height);
  const colHeights = new Array(cols).fill(0);
  tiles.forEach((tile, i)=>{
    let target = 0;
    for(let c = 1; c < cols; c++){ if(colHeights[c] < colHeights[target]) target = c; }
    const x = target * (colW + PIN_MASONRY_GAP);
    const y = colHeights[target];
    tile.style.transform = `translate(${x}px, ${y}px)`;
    colHeights[target] = y + tileHeights[i] + PIN_MASONRY_GAP;
  });
  inner.style.height = Math.max(0, Math.max(...colHeights) - PIN_MASONRY_GAP) + 'px';
}
let pinMasonryResizeObserver = null;
function ensurePinMasonryResizeWatch(gridEl){
  if(typeof ResizeObserver === 'undefined') return;
  if(pinMasonryResizeObserver) pinMasonryResizeObserver.disconnect();
  pinMasonryResizeObserver = new ResizeObserver(()=> layoutPinMasonry(gridEl));
  pinMasonryResizeObserver.observe(gridEl);
}
const relayoutPinMasonryDebounced = debounce((gridEl)=> layoutPinMasonry(gridEl), 80);
window.addEventListener('resize', ()=>{
  const g = document.getElementById('galleryGrid');
  if(g) relayoutPinMasonryDebounced(g);
});
/* 그리드 안 이미지들이 로드될 때마다(썸네일 실제 크기를 알게 될 때마다) 다시 배치해서,
   플레이스홀더 높이로 어림잡았던 자리가 실제 사진 비율에 맞게 자연스럽게 자리잡게 함.
   사진이 많을 땐 로드 완료 이벤트가 짧은 시간에 몰려서 들어오는데, 그때마다 매번
   즉시 layoutPinMasonry를 부르면 타일 개수만큼 강제 리플로우가 그대로 겹쳐 쌓여서
   렉으로 느껴질 수 있음. 그래서 디바운스된 재계산(relayoutPinMasonryDebounced)을 써서
   몰려 들어오는 로드 이벤트를 한 번의 재계산으로 묶어 처리함 */
function watchPinTileImagesForRelayout(gridEl){
  gridEl.querySelectorAll('img').forEach(img=>{
    if(img.complete) return;
    img.addEventListener('load', ()=> relayoutPinMasonryDebounced(gridEl), { once:true });
  });
}

/* ---------------- 옵션(분류) 관리 + 필터 칩 — 문서 위젯과 모든 갤러리가 공용으로 씀 ----------------
   위젯마다 별도의 옵션 문서(storeName)를 두고, 그 안의 options 배열을 목록/필터에 함께 씀.
   각 항목(카드/사진)은 opt 필드에 옵션 문자열 하나를 들고 있고, "전체" 또는 옵션 하나를
   골라 그것만 모아볼 수 있음. */

function openOptionsManagerModal(storeName, currentOptions, onSaved){
  let workingOptions = [...(currentOptions||[])];
  openModal(`
    <h3>옵션 관리</h3>
    <p class="hint">추가할 때 고르거나 필터링할 옵션이에요.</p>
    <div class="opt-list" id="optList"></div>
    <div class="w-edit-row" style="display:flex;gap:6px;">
      <input type="text" id="optNew" placeholder="새 옵션">
      <button class="btn small" id="optAddBtn">+ 추가</button>
    </div>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">저장</button></div>
  `, m=>{
    const listEl = m.querySelector('#optList');
    // 지우거나 순서를 바꾸기 전에, 화면에 남아있던(아직 저장 전인) 이름 수정 내용부터
    // workingOptions에 반영해둬야 다른 옵션의 이름 변경이 날아가지 않음
    const syncFromInputs = ()=>{
      workingOptions = Array.from(listEl.querySelectorAll('.opt-input')).map(inp=> inp.value);
    };
    let dragIdx = null;
    let dragEl = null;
    let liveTiles = [];
    let originalTiles = [];
    let dropped = false;
    const FLIP_MS = 220;
    const FLIP_EASE = 'cubic-bezier(.22,1,.36,1)';
    // 여기도 다른 위젯들과 똑같이, 옮기는 동안 나머지 줄들이 실시간으로 자리를
    // 비켜주며 미끄러지게 함(FLIP 애니메이션). 입력창 내용을 잃지 않도록 draw()로
    // 다시 그리지 않고 실제 DOM 노드를 그대로 옮김
    const flip = (tiles, fn)=>{
      const before = new Map();
      tiles.forEach(t=> before.set(t, t.getBoundingClientRect()));
      fn();
      tiles.forEach(t=>{
        if(t === dragEl) return;
        const firstRect = before.get(t);
        if(!firstRect) return;
        const lastRect = t.getBoundingClientRect();
        const dy = firstRect.top - lastRect.top;
        if(!dy) return;
        if(t._flipCleanup) t._flipCleanup();
        t.style.transition = 'none';
        t.style.transform = `translateY(${dy}px)`;
        void t.offsetWidth; // 강제 리플로우: 순간이동을 먼저 적용한 뒤에 트랜지션이 걸리게 함
        t.style.transition = `transform ${FLIP_MS}ms ${FLIP_EASE}`;
        t.style.transform = '';
        const cleanup = ()=>{
          t.style.transition = '';
          t.removeEventListener('transitionend', onEnd);
          clearTimeout(timer);
          t._flipCleanup = null;
        };
        const onEnd = (e)=>{ if(e.target === t) cleanup(); };
        const timer = setTimeout(cleanup, FLIP_MS + 80);
        t.addEventListener('transitionend', onEnd);
        t._flipCleanup = cleanup;
      });
    };
    const restoreOriginalOrder = ()=>{
      if(!originalTiles.length) return;
      flip(liveTiles, ()=>{
        const parent = originalTiles[0] && originalTiles[0].parentNode;
        if(parent) originalTiles.forEach(t=> parent.appendChild(t));
      });
      liveTiles = originalTiles.slice();
    };
    const draw = ()=>{
      listEl.innerHTML = workingOptions.map((opt,i)=> `
        <div class="opt-row" data-idx="${i}">
          <span class="opt-drag-handle" title="드래그해서 순서 바꾸기">⠿</span>
          <input type="text" class="opt-input" value="${escapeHtml(opt)}">
          <button class="btn small danger" data-del="${i}">✕</button>
        </div>
      `).join('') || `<div class="w-empty">등록된 옵션이 없어요</div>`;
      listEl.querySelectorAll('[data-del]').forEach(btn=> btn.addEventListener('click', ()=>{
        syncFromInputs();
        workingOptions.splice(Number(btn.dataset.del), 1);
        draw();
      }));
      // 옵션칩(필터 칩)이 보여지는 순서는 이 목록 순서를 그대로 따르므로,
      // 여기서 드래그로 줄을 옮기면 실제 칩 위치도 그대로 바뀜
      listEl.querySelectorAll('.opt-row').forEach(row=>{
        row.setAttribute('draggable', 'true');
        row.addEventListener('dragstart', e=>{
          // 손잡이(⠿)에서 시작한 드래그만 순서 변경으로 처리 — 입력창 텍스트 드래그(선택)와 안 겹치게
          if(!e.target.closest('.opt-drag-handle')){ e.preventDefault(); return; }
          dragIdx = Number(row.dataset.idx);
          dragEl = row;
          dropped = false;
          row.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          try{ e.dataTransfer.setData('text/plain', String(dragIdx)); }catch(_){}
          originalTiles = Array.from(listEl.querySelectorAll('.opt-row'));
          liveTiles = originalTiles.slice();
        });
        row.addEventListener('dragend', ()=>{
          row.classList.remove('dragging');
          if(!dropped) restoreOriginalOrder();
          dragEl = null; dragIdx = null; dropped = false;
          liveTiles = []; originalTiles = [];
        });
        row.addEventListener('dragover', e=>{
          if(dragIdx === null || !dragEl) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const rect = row.getBoundingClientRect();
          const before = (e.clientY - rect.top) < rect.height / 2;
          const srcPos = liveTiles.indexOf(dragEl);
          const targetPos = liveTiles.indexOf(row);
          if(srcPos === -1 || targetPos === -1) return;
          let insertPos = before ? targetPos : targetPos + 1;
          if(srcPos < insertPos) insertPos--;
          if(insertPos === srcPos) return; // 이미 그 자리라 다시 배치할 필요 없음
          flip(liveTiles, ()=>{
            liveTiles.splice(srcPos, 1);
            liveTiles.splice(insertPos, 0, dragEl);
            liveTiles.forEach(t=> listEl.appendChild(t));
          });
        });
        row.addEventListener('drop', e=>{
          e.preventDefault();
          dropped = true;
          // 드래그하는 동안 이미 DOM 순서 자체가 실시간으로 바뀌어 있으므로, 화면에
          // 보이는 순서 그대로 읽어서 반영하면 됨
          syncFromInputs();
          draw();
        });
      });
    };
    draw();
    m.querySelector('#optAddBtn').onclick = ()=>{
      const input = m.querySelector('#optNew');
      const val = input.value.trim();
      if(!val) return;
      syncFromInputs();
      workingOptions.push(val);
      input.value = '';
      draw();
    };
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const options = Array.from(listEl.querySelectorAll('.opt-input')).map(inp=> inp.value.trim()).filter(Boolean);
      saveBtn.disabled = true; saveBtn.textContent = '저장 중…';
      try{ await docRef(storeName).set({ options }, {merge:true}); }
      catch(err){ toast('저장하지 못했어요'); saveBtn.disabled=false; saveBtn.textContent='저장'; return; }
      onSaved(options);
      closeModal();
    };
  });
}

function renderOptionFilterChips(container, options, active, onSelect){
  if(!container) return;
  if(!options || !options.length){ container.innerHTML=''; container.style.display='none'; return; }
  container.style.display='flex';
  container.innerHTML = `
    <button class="tag-chip ${!active?'active':''}" data-opt="">전체</button>
    ${options.map(o=> `<button class="tag-chip ${active===o?'active':''}" data-opt="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join('')}
  `;
  container.querySelectorAll('[data-opt]').forEach(btn=> btn.onclick = ()=> onSelect(btn.dataset.opt || null));
}

/* 옵션 여러 개를 체크박스로 동시에 고를 수 있게 하는 공용 UI.
   문서 위젯/모든 갤러리의 "추가" 모달과 항목별 옵션 지정 모달에서 공용으로 씀 */
function renderOptionCheckboxes(options, selected){
  if(!options || !options.length) return `<p class="hint">등록된 옵션이 없어요. "⚙ 옵션 관리"에서 추가해주세요.</p>`;
  const sel = selected || [];
  return `<div class="opt-checkbox-group">${options.map(o=> `
    <label class="opt-checkbox">
      <input type="checkbox" value="${escapeHtml(o)}" ${sel.includes(o) ? 'checked' : ''}>
      <span>${escapeHtml(o)}</span>
    </label>
  `).join('')}</div>`;
}
function getCheckedOptionValues(container){
  if(!container) return [];
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb=> cb.value);
}

/* 사진 한 장의 옵션(태그)들을 바로 바꾸는 작은 모달 — 갤러리들에서 씀. 여러 개 동시 선택 가능 */
function openItemOptEditModal(currentOpts, optionsList, onSave){
  openModal(`
    <h3>옵션 지정</h3>
    <div id="itemOptBox">${renderOptionCheckboxes(optionsList, currentOpts)}</div>
    <p class="hint">옵션 추가/수정은 "⚙ 옵션 관리"에서.</p>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">저장</button></div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      await onSave(getCheckedOptionValues(m.querySelector('#itemOptBox')));
      closeModal();
    };
  });
}

/* 여러 장 선택한 상태(사진 묶기와 같은 선택 모드)에서 한꺼번에 태그를 추가하는 모달.
   기존에 각 사진에 붙어있던 태그는 그대로 두고, 여기서 고른 태그만 추가로 더함 */
function openBulkOptAddModal(optionsList, onSave){
  openModal(`
    <h3>선택한 사진에 태그 추가</h3>
    <p class="hint">기존 태그는 유지한 채 추가돼요.</p>
    <div id="bulkOptBox">${renderOptionCheckboxes(optionsList, [])}</div>
    <p class="hint">옵션 추가/수정은 "⚙ 옵션 관리"에서.</p>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">추가</button></div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const opts = getCheckedOptionValues(m.querySelector('#bulkOptBox'));
      if(!opts.length){ toast('추가할 태그를 선택해주세요'); return; }
      await onSave(opts);
      closeModal();
    };
  });
}

/* 이미지 슬라이드/갤러리에서 공통으로 쓰는 확대보기 팝업.
   cfg = {
     items,             // 정규화된 아이템 배열 (이 팝업 안에서 좌우로 넘겨볼 목록)
     index,             // 시작 인덱스
     resolve(item, onReady), // item -> 표시할 url. 청크 저장이라 아직 없으면 null을 반환하고, 다 불러오면 onReady()로 다시 그림
     onDelete(idx),     // 있으면 삭제 버튼 표시. idx의 사진을 지우는 함수
     meta(item),        // 있으면 {title, desc} 반환 — 사진 아래 정보로 표시
     onEditMeta(idx),    // 있으면 "정보 편집" 버튼 표시 — 눌렀을 때 호출
     tag(item),         // 있으면 현재 옵션(태그) 배열을 반환 — 사진 아래 태그 칩들로 표시
     onEditTag(idx)      // 있으면 "태그 수정" 버튼 표시 — 눌렀을 때 호출
   }
   화살표 버튼/키보드 ←→로 같은 목록 안에서 트위터처럼 옆 사진으로 바로 넘어갈 수 있음 */

function openImageLightbox(cfg){
  const items = cfg.items.slice();
  let index = cfg.index || 0;
  let opened = false; // 첫 렌더는 항상 진행하고, 그 다음부터는 모달이 실제로 열려있을 때만 다시 그림

  /* 묶음(모아올리기) 안에서 옆으로 이동할 때는, 다시 그리기 전/후의 DOM에서
     "지금 큰 사진이 어디 있었는지"와 "다음에 큰 사진이 될 조각이 어디 있었는지"를
     각각 좌표로 기록해뒀다가, 다시 그린 뒤 그 좌표를 시작점 삼아 원래 크기로
     트랜지션시킴(FLIP 기법) — 그러면 눌렀던 옆 조각이 실제로 넓어지면서 가운데로
     들어오고, 있던 사진은 옆으로 줄어들며 빠지는 것처럼 자연스럽게 보임 */
  function goToIndex(newIndex){
    if(items.length === 0) return;
    const norm = ((newIndex % items.length) + items.length) % items.length;
    if(norm === index) return;
    const oldIndex = index;
    const oldItem = items[oldIndex];
    const newItem = items[norm];
    const sameGroup = !!(oldItem && newItem && oldItem.__srcIdx === newItem.__srcIdx && oldItem.__groupLen > 1 && newItem.__groupLen > 1);
    const modalElBefore = modalRoot.querySelector('.modal-lightbox');
    let beforeMainRect = null, beforeTargetRect = null;
    if(sameGroup && modalElBefore){
      const beforeMain = modalElBefore.querySelector('#lbImgWrap .lightbox-img, #lbImgWrap .lightbox-loading');
      const beforeTarget = modalElBefore.querySelector(`[data-jump-idx="${norm}"]`);
      if(beforeMain) beforeMainRect = beforeMain.getBoundingClientRect();
      if(beforeTarget) beforeTargetRect = beforeTarget.getBoundingClientRect();
    }
    index = norm;
    render();
    if(!sameGroup || !beforeMainRect || !beforeTargetRect || !beforeMainRect.width || !beforeTargetRect.width) return;
    const modalElAfter = modalRoot.querySelector('.modal-lightbox');
    if(!modalElAfter) return;
    const afterMain = modalElAfter.querySelector('#lbImgWrap .lightbox-img, #lbImgWrap .lightbox-loading');
    const afterPeek = modalElAfter.querySelector(`[data-jump-idx="${oldIndex}"]`);
    if(afterMain) flipAnimateElement(afterMain, beforeTargetRect);
    if(afterPeek) flipAnimateElement(afterPeek, beforeMainRect);
  }

  function render(){
    // 사진이 늦게 로딩 완료돼서 onReady가 불릴 때, 그 사이에 사용자가 이미 라이트박스를
    // 닫아버렸다면 다시 열어버리지 않도록 함 (닫은 뒤 갑자기 다시 뜨는 현상 방지)
    if(opened && !modalRoot.querySelector('.modal-lightbox')) return;
    if(items.length === 0){ closeModal(); return; }
    if(index >= items.length) index = items.length - 1;
    if(index < 0) index = 0;
    const item = items[index];
    // 라이트박스는 사용자가 지금 바로 보려고 연 것이므로 priority=true로 불러와서
    // 백그라운드로 미리 불러오던 썸네일들보다 먼저 처리되게 함
    const url = cfg.resolve(item, render, true);
    // 바로 옆(이전/다음) 사진도 미리 슬쩍 불러와둠 — 갤러리가 쌓일수록 "눌러야
    // 그제서야 불러오기 시작"하는 방식은 한 장씩 넘길 때마다 매번 로딩을 기다리게
    // 되므로, 지금 사진을 보는 동안(생각하는 시간)에 다음 걸 먼저 받아두면 실제로
    // 넘기는 순간엔 이미 캐시에 있을 가능성이 높아져 체감 네비게이션 속도가 나아짐.
    // 다만 지금 화면에 있는 사진보다 먼저 처리되면 안 되므로 priority 없이(=대기열
    // 맨 뒤) 조용히 넣어두기만 하고 결과는 버림(다음에 실제로 그 사진으로 넘어갈 때
    // render()가 캐시를 다시 확인해서 반영함).
    if(items.length > 1){
      const prevIdx = ((index - 1) % items.length + items.length) % items.length;
      const nextIdx = (index + 1) % items.length;
      cfg.resolve(items[nextIdx], ()=>{});
      cfg.resolve(items[prevIdx], ()=>{});
    }
    const metaInfo = cfg.meta ? cfg.meta(item) : null;
    const tagInfo = cfg.tag ? cfg.tag(item) : null;
    const showNav = items.length > 1;
    // 묶음(모아올리기) 사진일 때만, 지금 사진 뒤로 "같은 묶음 안에" 남은 사진들을
    // (최대 3장) 장식용 빈 도형이 아니라 실제 그 사진 그대로 모서리를 살짝 어긋나게
    // 겹쳐 그려서 "겹쳐진 사진 뭉치"라는 걸 시각적으로 보여줌. 지금 넘겨보고 있는
    // 위치(item.__groupPos) 다음 순서의 사진들을 flat 배열(items)에서 그대로
    // 찾아와 resolve하므로, 사진을 넘길 때마다 실제 다음 사진들로 다시 계산됨
    const isStack = !!(item.__groupLen && item.__groupLen > 1);
    // 묶음(모아올리기) 사진일 때, 지금 보는 사진 좌우로 "같은 묶음 안에서" 이전/다음
    // 순서의 사진들을 캐러셀처럼 가늘게 크롭해 보여줌. 한쪽 방향엔 최대 2장까지만
    // 놓고(가까운 사진일수록 안쪽/넓게, 먼 사진일수록 바깥쪽/좁게), 그보다 더 있으면
    // 그 바깥쪽 자리를 "···" 생략 표시로 채움. 매번 items(flat 배열) 안에서 groupPos
    // 기준으로 다시 계산하므로, 사진을 넘길 때마다 실제 이웃 사진들로 자동 갱신됨
    let prevPeek = [], nextPeek = [], prevMore = 0, nextMore = 0;
    if(isStack){
      const groupEntries = items
        .map((it2, idx2)=> ({ it: it2, idx: idx2 }))
        .filter(x=> x.it.__srcIdx === item.__srcIdx)
        .sort((a,b)=> a.it.__groupPos - b.it.__groupPos);
      const curPos = groupEntries.findIndex(x=> x.it.__groupPos === item.__groupPos);
      const prevAll = groupEntries.slice(0, curPos);
      const nextAll = groupEntries.slice(curPos+1);
      prevMore = Math.max(0, prevAll.length - 2);
      nextMore = Math.max(0, nextAll.length - 2);
      prevPeek = prevAll.slice(-2); // [먼 사진, 가까운 사진] 순 (바깥→안쪽)
      nextPeek = nextAll.slice(0,2); // [가까운 사진, 먼 사진] 순 (안쪽→바깥)
    }
    const peekCellHtml = (entry, distFromCenter)=>{
      const peekUrl = cfg.resolve(entry.it, render);
      return `<div class="lightbox-carousel-peek pk-${distFromCenter}" data-jump-idx="${entry.idx}">${peekUrl ? `<img src="${escapeHtml(peekUrl)}">` : ''}</div>`;
    };
    const prevSideHtml = prevPeek.map((entry,i)=> peekCellHtml(entry, prevPeek.length - i)).join('');
    const nextSideHtml = nextPeek.map((entry,i)=> peekCellHtml(entry, i+1)).join('');
    const moreCellHtml = `<div class="lightbox-carousel-more">···</div>`;
    const bodyHtml = `
      <button class="lightbox-x" id="c" title="닫기" aria-label="닫기">✕</button>
      <div class="lightbox-body">
        <div class="lightbox-carousel ${isStack ? 'is-stack' : ''}">
          ${isStack ? `<div class="lightbox-carousel-side side-prev">${prevMore>0?moreCellHtml:''}${prevSideHtml}</div>` : ''}
          <div class="lightbox-imgwrap" id="lbImgWrap">
            ${url ? `<img src="${escapeHtml(url)}" class="lightbox-img">` : `<div class="lightbox-loading">불러오는 중…</div>`}
            ${isStack ? `<div class="lightbox-group-count"> ${item.__groupPos+1}/${item.__groupLen}</div>` : ''}
            ${showNav ? `<div class="lightbox-zone prev" id="lbPrev" title="이전 사진"><span class="lightbox-zone-arrow">‹</span></div><div class="lightbox-zone next" id="lbNext" title="다음 사진"><span class="lightbox-zone-arrow">›</span></div>` : ''}
          </div>
          ${isStack ? `<div class="lightbox-carousel-side side-next">${nextSideHtml}${nextMore>0?moreCellHtml:''}</div>` : ''}
        </div>
        ${showNav ? `<div class="lightbox-count">${index+1} / ${items.length}</div>` : ''}
      </div>
      ${metaInfo && (metaInfo.title || metaInfo.desc) ? `
        <div class="lightbox-meta">
          ${metaInfo.title ? `<div class="lightbox-meta-title">${escapeHtml(metaInfo.title)}</div>` : ''}
          ${metaInfo.desc ? `<div class="lightbox-meta-desc">${escapeHtml(metaInfo.desc)}</div>` : ''}
        </div>` : ''}
      ${cfg.tag && tagInfo && tagInfo.length ? `<div class="lightbox-tag">${tagInfo.map(t=> `<span class="lightbox-tag-chip">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      ${(cfg.onEditMeta || cfg.onEditTag || (cfg.onUngroup && isStack) || cfg.onDelete) ? `
      <div class="modal-actions">
        ${cfg.onEditMeta ? `<button class="btn ghost" id="editMeta">${metaInfo && (metaInfo.title || metaInfo.desc) ? '정보 수정' : '정보 추가'}</button>` : ''}
        ${cfg.onEditTag ? `<button class="btn ghost" id="editTag">태그 수정</button>` : ''}
        ${cfg.onUngroup && isStack ? `<button class="btn ghost" id="ungroupBtn" title="묶음을 풀어 낱장 사진으로 나눠요">묶음 해체</button>` : ''}
        ${cfg.onDelete ? `<button class="btn danger" id="del">삭제</button>` : ''}
      </div>` : ''}
    `;
    const mountLightbox = m=>{
      m.querySelector('#c').onclick = closeModal;
      if(url) attachImgFallback(m.querySelector('.lightbox-img'));
      if(cfg.onDelete) m.querySelector('#del').onclick = async ()=>{
        if(!(await confirmDelete('이 사진을 정말 삭제할까요?<br>되돌릴 수 없어요.'))) return;
        await cfg.onDelete(index);
        items.splice(index,1);
        render();
      };
      if(cfg.onEditMeta) m.querySelector('#editMeta').onclick = ()=> cfg.onEditMeta(index);
      if(cfg.onEditTag) m.querySelector('#editTag').onclick = ()=> cfg.onEditTag(index);
      if(cfg.onUngroup){ const ub = m.querySelector('#ungroupBtn'); if(ub) ub.onclick = ()=> cfg.onUngroup(index); }
      const prevZone = m.querySelector('#lbPrev');
      const nextZone = m.querySelector('#lbNext');
      if(prevZone) prevZone.onclick = ()=> goToIndex(index - 1);
      if(nextZone) nextZone.onclick = ()=> goToIndex(index + 1);
      // 좌우로 살짝 보이는 이웃 사진(캐러셀 조각)을 눌러도 바로 그 사진으로 넘어감
      m.querySelectorAll('[data-jump-idx]').forEach(el=>{
        el.onclick = ()=> goToIndex(Number(el.dataset.jumpIdx));
      });

      // 모바일 스와이프: 이미지 영역을 좌우(넓은 화면)/위아래(좁은 화면)로 밀면 이전/다음 사진으로 이동
      const imgWrap = m.querySelector('#lbImgWrap');
      if(imgWrap && items.length > 1){
        let touchStartX = 0, touchStartY = 0, touchTracking = false, touchLocked = false, touchVertical = false;
        imgWrap.addEventListener('touchstart', e=>{
          if(e.touches.length !== 1) return;
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          touchTracking = true;
          touchLocked = false;
          // matchMedia는 스타일 재계산이 걸리는 호출이라, 손가락이 움직이는 동안(touchmove)
          // 매번 다시 물으면 스와이프 한 번에 수십 번씩 불필요하게 반복됨. 제스처 시작
          // 시점에 딱 한 번만 물어서 저장해두고, 같은 제스처 안에서는 그 값을 재사용함
          touchVertical = window.matchMedia('(max-width: 640px)').matches;
        }, { passive:true });
        // touchend에서만 preventDefault를 걸면 그땐 이미 브라우저가 배경 페이지를
        // 스크롤시켜버린 뒤라 늦음. 드래그 중(touchmove)에 방향이 스와이프 축(모바일=세로,
        // PC=가로)으로 확정되는 즉시 여기서 막아야 배경이 안 딸려 움직임(touch-action
        // CSS가 1차 방어, 이건 2차 방어) */
        imgWrap.addEventListener('touchmove', e=>{
          if(!touchTracking || touchLocked || e.touches.length !== 1) return;
          const dx = e.touches[0].clientX - touchStartX;
          const dy = e.touches[0].clientY - touchStartY;
          const swipeAxisDist = touchVertical ? Math.abs(dy) : Math.abs(dx);
          const otherAxisDist = touchVertical ? Math.abs(dx) : Math.abs(dy);
          if(swipeAxisDist > 10 && swipeAxisDist > otherAxisDist * 1.2){
            touchLocked = true; // 한 번 스와이프 축으로 확정되면 손을 뗄 때까지 계속 막음
          }
          if(touchLocked) e.preventDefault();
        }, { passive:false });
        imgWrap.addEventListener('touchend', e=>{
          if(!touchTracking) return;
          touchTracking = false;
          const touch = e.changedTouches[0];
          const dx = touch.clientX - touchStartX;
          const dy = touch.clientY - touchStartY;
          // 모바일 화면 폭에서는 캐러셀도 세로로 눕혀 보여주므로, 스와이프도 위/아래로
          // 받아야 손가락 방향과 화면에 보이는 방향이 서로 맞음(넓은 화면에서는 계속 좌우로)
          if(touchVertical){
            // 세로로 충분히(40px 이상) 움직였고, 가로 움직임보다 뚜렷하게 세로 움직임이 클 때만 스와이프로 인식
            if(Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 1.5){
              e.preventDefault();
              goToIndex(dy > 0 ? index - 1 : index + 1); // 아래로 쓸면 이전, 위로 쓸면 다음
            }
          } else if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5){
            // 가로로 충분히(40px 이상) 움직였고, 세로 움직임보다 뚜렷하게 가로 움직임이 클 때만 스와이프로 인식
            e.preventDefault(); // 스와이프 뒤에 이어지는 합성 클릭이 새로 그려진 화면을 또 눌러버리는 것 방지
            goToIndex(dx > 0 ? index - 1 : index + 1);
          }
        });
      }
    };
    // 묶음(모아올리기) 안에서 사진을 넘길 때 매번 openModal로 오버레이(배경 어둡게+블러)
    // 전체를 지우고 새로 만들면, 그 순간 오버레이가 통째로 사라졌다가 다시 그려지면서
    // 라이트박스 박스 자체가 깜빡여 보임. 이미 라이트박스가 열려있는 상태라면 오버레이는
    // 그대로 두고 그 안의 내용(.modal-lightbox)만 갈아 끼워서, FLIP 애니메이션 대상
    // 사진 외의 나머지(배경 블러/테두리)는 안 흔들리게 함.
    const existingModal = modalRoot.querySelector('.modal-lightbox');
    if(existingModal){
      existingModal.innerHTML = bodyHtml;
      mountLightbox(existingModal);
    } else {
      openModal(bodyHtml, mountLightbox, 'modal-lightbox');
    }
    opened = true;
  }

  const onKey = (e)=>{
    if(!modalRoot.querySelector('.modal-lightbox')) return;
    // ArrowLeft/Right를 막지 않으면, 브라우저가 이 키를 "배경의 가로 스크롤 영역"
    // (보드 탭 뷰포트)에도 기본 스크롤 동작으로 전달해서 라이트박스로 사진을 넘길 때마다
    // 뒤에 있는 위젯/갤러리 탭 페이지가 같이 좌우로 슬라이드되어 버림. preventDefault로
    // 그 기본 동작을 막아서, 라이트박스가 열려있는 동안은 화살표키가 사진 넘기기에만 쓰이게 함.
    if(e.key === 'ArrowLeft' && items.length > 1){ e.preventDefault(); goToIndex(index - 1); }
    else if(e.key === 'ArrowRight' && items.length > 1){ e.preventDefault(); goToIndex(index + 1); }
    else if(e.key === 'Escape'){ e.preventDefault(); closeModal(); }
  };
  document.addEventListener('keydown', onKey);
  const mo = new MutationObserver(()=>{
    if(!modalRoot.querySelector('.modal-lightbox')){
      document.removeEventListener('keydown', onKey);
      mo.disconnect();
    }
  });
  mo.observe(modalRoot, { childList:true });

  render();
}

/* 프로필의 "기타 설명"을 큰 글씨로 크게 읽기 위한 팝업. 사진 라이트박스와 같은
   .modal-lightbox 톤(어두운 반투명 배경+우상단 동그란 닫기 버튼)을 그대로 가져다
   쓰고, 안쪽 내용만 사진 대신 큰 텍스트로 바꿔치기함 — 완전히 새 모달 스타일을
   만들지 않고 이미 있는 라이트박스 느낌을 재사용해서 톤을 통일함 */
function openProfileDescModal(name, desc){
  openModal(`
    <button class="lightbox-x" id="c" title="닫기" aria-label="닫기">✕</button>
    <div class="desc-lightbox-body">
      ${name ? `<div class="desc-lightbox-name">${escapeHtml(name)}</div>` : ''}
      <div class="desc-lightbox-text">${escapeHtml(desc || '')}</div>
    </div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
  }, 'modal-lightbox modal-desc-lightbox');
}

/* 그리드에 보이는 항목들(낱장+묶음)을 "낱장 사진 하나하나" 기준으로 펼친
   배열로 만들어줌. 묶음(모아올리기)에 속한 사진은 겹쳐진 카드(스택) 모양으로
   보이돼, 그 앞뒤로 자연스럽게 다른(묶음 밖) 사진으로도 넘어감 — 묶음 안에서만
   갇혀서 보이던 예전 방식과 다른 점. 각 낱장에는 원래 배열에서 자기 자리
   (__srcIdx), 같은 묶음 안에서의 순서(__groupPos)/총 장수(__groupLen), 태그
   (__tags, 묶음이면 묶음 전체 태그)를 함께 붙여서 돌려줌 */
function buildFlatGalleryLightboxItems(allItems, filterOpt){
  const flat = [];
  allItems.forEach((it, srcIdx)=>{
    const tags = it.opts || [];
    if(filterOpt && !tags.includes(filterOpt)) return;
    if(it.group && Array.isArray(it.images)){
      it.images.forEach((img, groupPos)=>{
        flat.push({ ...img, __srcIdx: srcIdx, __groupPos: groupPos, __groupLen: it.images.length, __tags: tags });
      });
    } else {
      flat.push({ ...it, __srcIdx: srcIdx, __groupPos: 0, __groupLen: 1, __tags: tags });
    }
  });
  return flat;
}

/* 갤러리1/갤러리2/레퍼런스갤러리 3곳이 공용으로 쓰는 라이트박스 열기 로직.
   clickedSrcIdx: 그리드에서 누른 타일의 원본 배열(items) 인덱스.
   getItems: 지금 저장된 원본 배열을 돌려주는 함수, normalize: 그 갤러리의
   정규화 함수, save: 새 배열을 저장하는 함수, getFilterOpt: 지금 걸린 옵션
   필터, markSkipRender: 필터가 없을 때 태그만 바뀐 재렌더링을 생략시키는
   함수, reopen: 태그 수정 후 같은 항목을 다시 여는 함수(원본 인덱스 하나 받음) */
function openGalleryLightboxCore(clickedSrcIdx, { getItems, normalize, save, getFilterOpt, markSkipRender, reopen }){
  const allItems = (getItems() || []).map(normalize);
  const filterOpt = getFilterOpt();
  const flat = buildFlatGalleryLightboxItems(allItems, filterOpt);
  let startPos = flat.findIndex(f=> f.__srcIdx === clickedSrcIdx && f.__groupPos === 0);
  if(startPos === -1) startPos = flat.findIndex(f=> f.__srcIdx === clickedSrcIdx);
  if(startPos === -1) startPos = 0;
  openImageLightbox({
    items: flat,
    index: startPos,
    resolve: resolveGalleryItemUrl,
    tag: (item)=> item.__tags,
    onEditTag: editMode ? (pos)=>{
      const it = flat[pos];
      const srcIdx = it.__srcIdx;
      closeModal();
      openItemOptEditModal(it.__tags, sharedGalleryOptionsData.options, (opts)=>{
        const arr = (getItems()||[]).map(normalize);
        arr[srcIdx] = { ...arr[srcIdx], opts };
        markSkipRender();
        save(arr);
        // openItemOptEditModal이 저장 직후 자기 모달을 닫으므로, 그보다 한 틱 뒤에
        // 다시 열어야 방금 연 라이트박스가 그 closeModal()에 같이 지워지지 않음
        setTimeout(()=> reopen(srcIdx), 0);
      });
    } : null,
    // 묶음(모아올리기) 해체 — 지금 보고 있는 묶음을 풀어서 낱장 사진들로
    // 되돌림(순서/자리는 그대로 유지). 더 이상 스택으로 안 묶이므로 라이트박스는
    // 닫고 그리드로 돌아가서 결과(낱장으로 나뉜 그리드)를 바로 보게 함
    onUngroup: editMode ? (pos)=>{
      const it = flat[pos];
      if(!it.__groupLen || it.__groupLen <= 1) return;
      const srcIdx = it.__srcIdx;
      const arr = (getItems()||[]).map(normalize);
      const grp = arr[srcIdx];
      if(!grp || !grp.group) return;
      const singles = grp.images.map(img=> ({ ...img, blur: !!grp.blur, opts: grp.opts||[] }));
      arr.splice(srcIdx, 1, ...singles);
      save(arr);
      closeModal();
    } : null,
    onDelete: editMode ? (pos)=>{
      const it = flat[pos];
      const srcIdx = it.__srcIdx, groupLen = it.__groupLen, groupPos = it.__groupPos;
      const arr = (getItems()||[]).map(normalize);
      if(groupLen <= 1){
        const [removed] = arr.splice(srcIdx,1);
        deleteGalleryImageIfChunked(removed);
        // 이 라이트박스 세션 안에서 이어서 또 삭제해도 자리가 안 어긋나게,
        // 방금 지운 자리를 flat에서도 빼고 그 뒤 항목들의 원본 인덱스를 당겨줌
        flat.splice(pos,1);
        flat.forEach(f=>{ if(f.__srcIdx > srcIdx) f.__srcIdx--; });
      } else {
        const grp = arr[srcIdx];
        const removedImg = grp.images[groupPos];
        deleteGalleryImageIfChunked(removedImg);
        const newImages = grp.images.slice();
        newImages.splice(groupPos, 1);
        // 묶음에 한 장만 남으면 더 이상 묶음이 아니므로 낱장 항목으로 되돌림
        // (레퍼런스 갤러리처럼 blur 필드가 아예 없는 경우 undefined가 그대로
        // Firestore에 저장 시도되지 않도록 항상 boolean으로 넣어줌)
        arr[srcIdx] = newImages.length === 1
          ? { ...newImages[0], blur: !!grp.blur, opts: grp.opts }
          : { ...grp, images: newImages };
        flat.splice(pos,1);
        flat.forEach(f=>{
          if(f.__srcIdx === srcIdx){
            f.__groupLen = newImages.length;
            if(f.__groupPos > groupPos) f.__groupPos--;
          }
        });
      }
      save(arr);
    } : null
  });
}


/* 드래그로 옮길 때 "여기로 들어갑니다" 선 대신, 커서가 지나가는 동안 다른 타일들이
   실시간으로 밀려나는 모습을 FLIP 기법으로 바로 보여줌(위치 재기→DOM 순서 변경→
   바뀐 위치 다시 재기→그 차이만큼 순간이동 후 원래 자리로 트랜지션). 열이 나뉜
   그리드(갤러리2/레퍼런스갤러리)는 열마다 따로 추적해 다른 열로 넘어가는 이동도
   그 자리에서 따라와 보이게 함. 저장(drop) 시점의 최종 순서 계산은 예전 그대로임 */
function bindPinDragReorder(container, tileSelector, getItems, saveItems, opts = {}){
  // opts.widgetKey를 넘기면, editMode여도 그 위젯이 연필 버튼으로 잠금해제된 상태일 때만
  // 실제로 드래그가 가능해짐(이동손잡이가 안 보이는데 드래그만 되는 상황을 막기 위함)
  if(!editMode || (opts.widgetKey && !isWidgetOpen(opts.widgetKey))) return;
  // axis 'x': 사진 그리드처럼 칸이 가로로 늘어서 있어 커서가 타일 왼쪽/오른쪽 중
  // 어디 있는지로 "앞/뒤"를 가름. axis 'y': 음악 재생목록처럼 세로로 쌓인 목록이라
  // 커서가 위/아래 중 어디 있는지로 "앞/뒤"를 가름
  const axis = opts.axis || 'x';
  // opts.rowMajor: 갤러리2/레퍼런스갤러리처럼 화면엔 여러 DOM 열로 보이지만 실제
  // 저장 순서는 왼쪽→오른쪽·위→아래로 흐르는 하나의 배열인 그리드용 옵션. 없으면
  // 열마다 독립된 목록으로 다루는데(매스너리·재생목록엔 맞음), 그 방식으로 열이 있는
  // 가로형 그리드를 다루면 열을 넘는 순간 그 열 전체가 밀리는 것처럼 보여 원래
  // 순서와 어긋남. rowMajor는 열 구분 없이 하나의 순서(liveFlat)로 끼워넣은 뒤
  // 화면과 같은 규칙(order % colCount)으로 다시 열에 나눠 담아 이동 축을 맞춤
  const rowMajor = !!opts.rowMajor;
  const FLIP_MS = 260;
  const FLIP_EASE = 'cubic-bezier(.22,1,.36,1)';
  // 핀터레스트식 매스너리 그리드(메인 갤러리)는 layoutPinMasonry가 타일 위치를
  // transform으로 직접 계산해 넣으므로, 순서가 바뀔 때마다 그 계산을 다시 불러줘야
  // 실시간 위치가 맞게 나옴. 그 외(재생목록/문서/일정/체크리스트/탭 등)는 그냥
  // flex/flow 레이아웃이라 DOM 순서만 바꿔주면 브라우저가 알아서 다시 배치함
  const masonryRoot = container.classList.contains('pin-grid')
    ? container
    : (container.querySelector(':scope > .pin-grid') ? container : null);

  let dragEl = null;
  let dragIdx = null;
  let dropped = false;
  let liveColumns = [];      // [[열1의 타일들…], [열2의 타일들…], …] — 드래그 중 실시간으로 바뀜
  let colParents = [];       // liveColumns와 같은 순서의 실제 부모 엘리먼트(열 컨테이너)
  let originalColumns = [];  // 드롭 없이 드래그가 취소됐을 때 되돌리기용 원래 배치
  let liveFlat = [];         // rowMajor 전용: 열 구분 없는 하나의 순서(왼쪽→오른쪽, 위→아래)

  // 지금 화면에 있는 타일들을, 실제 부모(열 컨테이너)별로 묶어서 스냅샷을 뜸.
  // 갤러리1처럼 열 구분 없이 전부 한 부모 밑에 있으면 결과는 그냥 [[전체 타일들]]이 됨
  const snapshotColumns = ()=>{
    const tiles = Array.from(container.querySelectorAll(tileSelector));
    const cols = []; const parents = [];
    tiles.forEach(t=>{
      let ci = parents.indexOf(t.parentNode);
      if(ci === -1){ ci = parents.length; parents.push(t.parentNode); cols.push([]); }
      cols[ci].push(t);
    });
    return { cols, parents };
  };

  const applyColumnsToDom = (cols, parents)=>{
    cols.forEach((colTiles, ci)=>{
      const parent = parents[ci];
      colTiles.forEach(t=> parent.appendChild(t));
    });
  };

  // rowMajor 전용: 렌더링 때 쓰는 것과 똑같은 규칙(order % colCount로 각 열에 순서대로
  // 담기)의 역방향/정방향 변환. flattenRowMajor는 열별 배치를 "화면에 보이는 순서
  // 그대로" 하나의 배열로 풀고, distributeRowMajor는 그 하나의 배열을 다시 같은
  // 규칙으로 열에 나눠 담아서, 갤러리2/레퍼런스 갤러리 렌더링 함수가 실제로 하는
  // 열 배치와 항상 일치하게 함
  const flattenRowMajor = (cols)=>{
    const flat = [];
    const maxLen = Math.max(0, ...cols.map(c=> c.length));
    for(let r = 0; r < maxLen; r++){
      for(let c = 0; c < cols.length; c++){
        const t = cols[c][r];
        if(t) flat.push(t);
      }
    }
    return flat;
  };
  const distributeRowMajor = (flat, colCount)=>{
    const cols = Array.from({length: colCount}, ()=> []);
    flat.forEach((t, i)=> cols[i % colCount].push(t));
    return cols;
  };

  // rects를 잰 뒤 fn()으로 실제 DOM(과 필요하면 매스너리 위치)을 바꾸고, 바뀌기
  // 전/후 위치 차이만큼 순간이동 → 트랜지션으로 되돌리는 고전적인 FLIP 기법
  const flip = (tiles, fn)=>{
    const before = new Map();
    tiles.forEach(t=> before.set(t, t.getBoundingClientRect()));
    fn();
    if(masonryRoot) layoutPinMasonry(container);
    tiles.forEach(t=>{
      if(t === dragEl) return; // 드래그 중인 타일 자체는 커서를 따라가는 브라우저 기본 드래그 이미지로 이미 보이는 중이라 애니메이션 대상에서 뺌
      const firstRect = before.get(t);
      if(!firstRect) return;
      const lastRect = t.getBoundingClientRect();
      const dx = firstRect.left - lastRect.left;
      const dy = firstRect.top - lastRect.top;
      if(!dx && !dy) return;
      if(t._flipCleanup) t._flipCleanup();
      const finalTransform = (t.style.transform || '').trim();
      t.style.transition = 'none';
      t.style.transform = `translate(${dx}px, ${dy}px) ${finalTransform}`.trim();
      void t.offsetWidth; // 강제 리플로우: 위 순간이동을 먼저 적용한 뒤에 트랜지션이 걸리게 함
      t.style.transition = `transform ${FLIP_MS}ms ${FLIP_EASE}`;
      t.style.transform = finalTransform;
      const cleanup = ()=>{
        t.style.transition = '';
        t.removeEventListener('transitionend', onEnd);
        clearTimeout(timer);
        t._flipCleanup = null;
      };
      const onEnd = (e)=>{ if(e.target === t) cleanup(); };
      const timer = setTimeout(cleanup, FLIP_MS + 80);
      t.addEventListener('transitionend', onEnd);
      t._flipCleanup = cleanup;
    });
  };

  const restoreOriginal = ()=>{
    if(!originalColumns.length) return;
    const allTiles = liveColumns.flat();
    flip(allTiles, ()=> applyColumnsToDom(originalColumns, colParents));
    liveColumns = originalColumns.map(c=> c.slice());
  };

  container.querySelectorAll(tileSelector).forEach(el=>{
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', e=>{
      if(e.target.closest('button')){ e.preventDefault(); return; }
      dragIdx = Number(el.dataset.idx);
      dragEl = el;
      dropped = false;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try{ e.dataTransfer.setData('text/plain', String(dragIdx)); }catch(_){}
      const snap = snapshotColumns();
      liveColumns = snap.cols.map(c=> c.slice());
      colParents = snap.parents;
      originalColumns = snap.cols.map(c=> c.slice());
      liveFlat = rowMajor ? flattenRowMajor(liveColumns) : [];
    });
    el.addEventListener('dragend', ()=>{
      el.classList.remove('dragging');
      if(!dropped) restoreOriginal();
      dragEl = null; dragIdx = null; dropped = false;
      liveColumns = []; colParents = []; originalColumns = []; liveFlat = [];
    });
    el.addEventListener('dragover', e=>{
      if(dragIdx === null || !dragEl) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const colCount = colParents.length || 1;
      // rowMajor 그리드는 실제로 열이 두 개 이상일 때만 가로(X) 기준으로 앞/뒤를
      // 가름 — 화면에 보이는 원래 배열 방향(왼쪽→오른쪽, 위→아래)과 드래그 중 이동
      // 방향을 맞추기 위함. 좁은 화면 등으로 열이 하나뿐일 땐 그냥 세로로 쌓인
      // 목록과 같으므로 기존처럼 위/아래로 판단함
      const useX = rowMajor ? colCount > 1 : axis !== 'y';
      const before = useX
        ? (e.clientX - rect.left) < rect.width / 2
        : (e.clientY - rect.top) < rect.height / 2;
      el.dataset.dropBefore = before ? '1' : '0';

      // 갤러리2/레퍼런스 갤러리처럼 여러 DOM 열에 나뉘어 있어도 실제 순서는 하나의
      // 가로형 배열이므로, 열별로 따로 추적하는 대신 liveFlat 하나만 놓고 앞/뒤로
      // 끼워넣은 뒤 그 결과를 다시 같은 규칙으로 열에 나눠 담음
      if(rowMajor){
        const srcPos = liveFlat.indexOf(dragEl);
        const targetPos = liveFlat.indexOf(el);
        if(srcPos === -1 || targetPos === -1) return;
        let insertPos = before ? targetPos : targetPos + 1;
        if(srcPos < insertPos) insertPos--;
        if(insertPos === srcPos) return; // 이미 그 자리라 다시 배치할 필요 없음
        const allTiles = liveFlat.slice();
        flip(allTiles, ()=>{
          liveFlat.splice(srcPos, 1);
          liveFlat.splice(insertPos, 0, dragEl);
          liveColumns = distributeRowMajor(liveFlat, colCount);
          applyColumnsToDom(liveColumns, colParents);
        });
        return;
      }

      const targetColIdx = colParents.indexOf(el.parentNode);
      const srcColIdx = liveColumns.findIndex(col=> col.includes(dragEl));
      if(targetColIdx === -1 || srcColIdx === -1) return;
      const targetPos = liveColumns[targetColIdx].indexOf(el);
      let insertPos = before ? targetPos : targetPos + 1;

      if(srcColIdx === targetColIdx){
        const srcPos = liveColumns[srcColIdx].indexOf(dragEl);
        if(srcPos < insertPos) insertPos--;
        if(insertPos === srcPos) return; // 이미 그 자리라 다시 배치할 필요 없음
        flip(liveColumns[targetColIdx], ()=>{
          liveColumns[targetColIdx].splice(srcPos, 1);
          liveColumns[targetColIdx].splice(insertPos, 0, dragEl);
          applyColumnsToDom([liveColumns[targetColIdx]], [colParents[targetColIdx]]);
        });
      } else {
        // 다른 열로 넘어가는 이동: 원래 열은 한 칸씩 당겨지고, 새 열은 그 자리만큼 밀려남
        const affected = [...liveColumns[srcColIdx], ...liveColumns[targetColIdx]];
        flip(affected, ()=>{
          liveColumns[srcColIdx] = liveColumns[srcColIdx].filter(t=> t !== dragEl);
          liveColumns[targetColIdx].splice(insertPos, 0, dragEl);
          applyColumnsToDom(
            [liveColumns[srcColIdx], liveColumns[targetColIdx]],
            [colParents[srcColIdx], colParents[targetColIdx]]
          );
        });
      }
    });
    el.addEventListener('drop', async e=>{
      e.preventDefault();
      dropped = true;
      if(dragIdx === null) return;
      // liveColumns는 dragover 도중 "지금 화면에 실제로 보이는 열 배치"를 계속
      // 반영해왔음. 갤러리2/레퍼런스갤러리처럼 여러 열로 라운드로빈 배치되는
      // 위젯은 저장 순서(한 줄)와 화면 배치(N열) 규칙이 서로 달라서, 세로로(같은
      // 열 안에서) 옮긴 사진을 targetIdx 기준 한 줄 배열에 그대로 끼워넣으면
      // 다시 불러왔을 때 열/행이 튀는 문제가 있었음. liveColumns를 렌더링과 같은
      // 라운드로빈 규칙(왼쪽 열부터 한 칸씩, 다 채우면 다음 행)으로 한 줄로 풀어
      // 저장하면 화면 배치가 그대로 저장 순서가 됨(열 하나뿐인 위젯은 동일 동작).
      const rowMajorTiles = [];
      const maxLen = Math.max(0, ...liveColumns.map(col=> col.length));
      for(let row = 0; row < maxLen; row++){
        for(let c = 0; c < liveColumns.length; c++){
          const t = liveColumns[c][row];
          if(t) rowMajorTiles.push(t);
        }
      }
      const newOrderIdxs = rowMajorTiles.map(t=> Number(t.dataset.idx));
      const visibleSlots = newOrderIdxs.slice().sort((a,b)=> a - b);
      if(newOrderIdxs.every((idx,k)=> idx === visibleSlots[k])) return; // 순서가 그대로면 저장 생략
      const arr = getItems();
      // 필터링 등으로 화면에 없는(숨겨진) 항목은 원래 자리 그대로 두고, 보이는 항목끼리만
      // 새 순서로 맞바꿔 끼워 넣음 — 절대 인덱스(slot) 자체는 유지하고 값만 재배치
      const newValuesInOrder = rowMajorTiles.map(t=> arr[Number(t.dataset.idx)]);
      visibleSlots.forEach((slot, k)=>{ arr[slot] = newValuesInOrder[k]; });
      await saveItems(arr);
    });
  });
}

/* imgur 공유 페이지 링크(예: imgur.com/xxxxx)는 실제 이미지 파일이 아니라 HTML 페이지라
   <img>에 넣으면 깨짐. 직접 이미지 주소(i.imgur.com/xxxxx.jpg)로 자동 변환해줌. */
function normalizeImageUrl(url){
  if(!url) return url;
  url = url.trim();
  const m = url.match(/^https?:\/\/(?:www\.)?imgur\.com\/(?!a\/|gallery\/|t\/)([a-zA-Z0-9]+)(?:[.?#].*)?$/i);
  if(m) return `https://i.imgur.com/${m[1]}.jpg`;
  return url;
}

/* 갤러리류 위젯은 매번 innerHTML을 통째로 새로 그리는 방식이라, 그 직후 바로
   scrollTop을 지정해도 사진(이미지)이 아직 로딩/레이아웃되기 전이라 컨테이너
   높이가 작아서 값이 0으로 잘려버리는 경우가 있음. 그래서 (1) 즉시 한 번,
   (2) 다음 프레임에 한 번, (3) 아직 안 불러와진 이미지들이 로드될 때마다 다시
   여러 차례 재적용해서 최종 레이아웃이 잡힌 뒤에도 스크롤 위치가 유지되게 함 */
function restoreScrollPos(el, pos){
  if(!el || !pos || (!pos.top && !pos.left)) return;
  const apply = ()=>{ el.scrollTop = pos.top; el.scrollLeft = pos.left; };
  apply();
  requestAnimationFrame(apply);
  el.querySelectorAll('img').forEach(img=>{
    if(!img.complete){
      img.addEventListener('load', apply, { once:true });
      img.addEventListener('error', apply, { once:true });
    }
  });
  /* 사진이 여러 장(멀티컬럼 매스너리)일 땐 로드되며 컬럼 균형이 다시 잡히느라
     목록 크기가 여러 번 바뀔 수 있어 위 방법만으론 타이밍을 놓치는 경우가 있음.
     그래서 크기가 바뀔 때마다(ResizeObserver) 다시 스크롤을 맞추고, 두 번 연속
     안 바뀌면 안정됐다고 보고 감시를 멈춤 */
  if(typeof ResizeObserver !== 'undefined'){
    let lastW = el.scrollWidth, lastH = el.scrollHeight;
    let stableCount = 0;
    const ro = new ResizeObserver(()=>{
      apply();
      if(el.scrollWidth === lastW && el.scrollHeight === lastH){
        stableCount++;
        if(stableCount >= 2) ro.disconnect();
      } else {
        lastW = el.scrollWidth; lastH = el.scrollHeight;
        stableCount = 0;
      }
    });
    ro.observe(el);
    setTimeout(()=> ro.disconnect(), 3000); // 안전장치: 3초 뒤엔 무조건 감시 종료
  }
}


/* 확장자를 정확히 몰라도(.jpg로 변환했는데 실제로는 png/gif인 경우 등) 로딩에 실패하면
   다른 확장자로 자동 재시도. i.imgur.com 주소에만 적용됨 */
function attachImgFallback(imgEl){
  if(!imgEl) return;
  const markBroken = ()=>{
    const tile = imgEl.closest('.pin-item, .pin-item-dense');
    if(tile) tile.classList.add('img-broken');
  };
  const src = imgEl.getAttribute('src') || '';
  const m = src.match(/^(https:\/\/i\.imgur\.com\/[a-zA-Z0-9]+)\.[a-zA-Z]+$/i);
  if(!m){
    // imgur 확장자 재시도 대상이 아닌 일반 URL — 로드 실패하면 바로 깨짐 표시
    imgEl.addEventListener('error', markBroken, { once:true });
    return;
  }
  const exts = ['jpg','jpeg','png','gif','webp'];
  let tries = 0;
  imgEl.addEventListener('error', function handler(){
    tries++;
    if(tries < exts.length){ imgEl.src = `${m[1]}.${exts[tries]}`; }
    else{ imgEl.removeEventListener('error', handler); markBroken(); }
  });
}

/* 배너/배경은 <img>가 아니라 CSS background-image라 위 방식이 안 통해서, 미리 로드 테스트 후 적용.
   el에 배경으로 넣고 싶은 대상 엘리먼트를 넘김 (배너, 전체 배경 레이어 등 공용으로 사용) */
function setElementBgImageWithFallback(el, url){
  if(!el || !url) return;
  const m = url.match(/^(https:\/\/i\.imgur\.com\/[a-zA-Z0-9]+)\.[a-zA-Z]+$/i);
  if(!m){ el.style.backgroundImage = `url('${url}')`; return; }
  el.style.backgroundImage = `url('${url}')`; // 우선 낙관적으로 적용
  const exts = ['jpg','jpeg','png','gif','webp'];
  let i = 0;
  const tryNext = ()=>{
    if(i >= exts.length) return;
    const testUrl = `${m[1]}.${exts[i]}`;
    const testImg = new Image();
    testImg.onload = ()=>{ el.style.backgroundImage = `url('${testUrl}')`; };
    testImg.onerror = ()=>{ i++; tryNext(); };
    testImg.src = testUrl;
  };
  tryNext();
}

/* ---------------- 배경 이미지 크로스페이드 (배너 · 페이지 전체 배경 공용) ----------------
   background-image는 브라우저가 두 url() 사이를 보간해주지 않아 그냥 갈아치우면
   뚝 끊기듯 바뀜. 그래서 레이어를 2장 준비해두고, 새 사진이 준비되면 "다음
   레이어"에 얹고 opacity만 1로 올리며 "현재 레이어"는 0으로 내려 겹쳐 지나가듯
   전환함(opacity 전환은 backdrop-filter와 달리 합성만 하면 되어 가벼움).
   배너와 전체 배경 둘 다 같은 방식이 필요해, 컨테이너/레이어 클래스만 받으면
   전용 setter를 만들어주는 팩토리로 일반화함(아래 setBannerBgImageCrossfade /
   setPageBgImageCrossfade가 각 인스턴스). */
function createBgImageCrossfader(containerEl, layerClass){
  const a = document.createElement('div');
  a.className = layerClass;
  const b = document.createElement('div');
  b.className = layerClass;
  // scrim/내용보다 먼저(=아래) 오도록 맨 앞에 끼워 넣음
  containerEl.prepend(b);
  containerEl.prepend(a);
  const layers = [a, b];
  let activeIdx = 0;

  return function setImage(url){
    const activeEl = layers[activeIdx];
    const nextEl   = layers[activeIdx === 0 ? 1 : 0];

    const swapIn = (finalUrl)=>{
      nextEl.style.backgroundImage = finalUrl ? `url('${finalUrl}')` : '';
      nextEl.classList.add('active');
      activeEl.classList.remove('active');
      activeIdx = activeIdx === 0 ? 1 : 0;
    };

    if(!url){ swapIn(''); return; }

    // 크로스페이드는 사진이 실제로 준비된 뒤에만 시작해야, 로딩 중인 빈 레이어가
    // 그대로 페이드인되어 잠깐 휑해 보이는 걸 막을 수 있음(그래서 기존
    // setElementBgImageWithFallback의 "일단 낙관적으로 적용" 방식 대신, 여기서는
    // Image()로 미리 불러와본 뒤에 swapIn함) — imgur 확장자 깨짐 폴백 로직은 동일하게 유지.
    const m = url.match(/^(https:\/\/i\.imgur\.com\/[a-zA-Z0-9]+)\.[a-zA-Z]+$/i);
    if(!m){
      const probe = new Image();
      probe.onload = ()=> swapIn(url);
      probe.onerror = ()=> swapIn(url); // 실패해도 예전과 동일하게 일단 그대로 시도
      probe.src = url;
      return;
    }
    const exts = ['jpg','jpeg','png','gif','webp'];
    let i = 0;
    const tryNext = ()=>{
      if(i >= exts.length) return;
      const testUrl = `${m[1]}.${exts[i]}`;
      const probe = new Image();
      probe.onload = ()=> swapIn(testUrl);
      probe.onerror = ()=>{ i++; tryNext(); };
      probe.src = testUrl;
    };
    tryNext();
  };
}
const setBannerBgImageCrossfade = createBgImageCrossfader(siteBannerEl, 'site-banner-bg-layer');
const setPageBgImageCrossfade   = createBgImageCrossfader(bgImageLayerEl, 'bg-image-layer-slot');

function extractYouTubeId(url){
  if(!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/* 캔버스에 실제로 투명한(완전 불투명이 아닌) 픽셀이 있는지 검사.
   WebP를 못 쓰는 폴백 경로에서, 투명도가 없는 "사진"은 JPEG로 보내 해상도
   손실을 피하고, 진짜 투명 PNG(스티커/로고 등)만 PNG로 남기기 위한 판단용. */
function canvasHasTransparency(canvas){
  const ctx = canvas.getContext('2d');
  let data;
  try{ data = ctx.getImageData(0, 0, canvas.width, canvas.height).data; }
  catch(e){ return true; } // 픽셀을 못 읽으면 안전하게 "투명 있음"으로 간주해 PNG 경로 유지
  for(let i = 3; i < data.length; i += 4){
    if(data[i] < 255) return true;
  }
  return false;
}

/* 이 브라우저가 캔버스에서 WebP로 인코딩할 수 있는지 검사(결과는 캐싱).
   WebP를 지원 안 하는 구형 브라우저(특히 오래된 Safari)는 toDataURL('image/webp')를
   호출해도 에러 없이 조용히 PNG를 돌려주는 경우가 있어서, try/catch가 아니라
   실제 반환된 data URL이 "data:image/webp"로 시작하는지를 직접 확인해야 함. */
let _webpSupportCache = null;
function supportsWebP(){
  if(_webpSupportCache !== null) return _webpSupportCache;
  try{
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    _webpSupportCache = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  }catch(e){
    _webpSupportCache = false;
  }
  return _webpSupportCache;
}

/* 사진을 화면에서 바로 올릴 수 있도록 브라우저에서 리사이즈+압축 후 base64로 변환.
   Firestore 문서 1건당 최대 1MB라서, 별도 유료 스토리지 없이 쓰려면 이렇게 줄여서 저장해야 함. */
function compressImageFile(file, maxDim=1600, maxBytes=700000, gifMaxBytes=700000){
  return new Promise((resolve, reject)=>{
    // GIF는 캔버스로 다시 그리면 첫 프레임만 남고 움직임이 사라져버려서,
    // 압축(리사이즈)을 건너뛰고 원본 그대로 base64로 저장해 애니메이션을 보존함.
    // 사진용 압축 목표치(maxBytes)는 GIF에 쓰기엔 너무 작아서(예: 260KB) 대부분의
    // 움직이는 GIF가 거절됐었음 — GIF는 별도의 더 넉넉한 한도(gifMaxBytes)를 씀.
    if(file.type === 'image/gif'){
      if(file.size > gifMaxBytes){
        reject(new Error(`GIF 용량이 너무 커요(최대 약 ${Math.round(gifMaxBytes/1024)}KB). 더 작은 GIF를 쓰거나, URL 방식(Giphy/Tenor/imgur 등)을 이용해주세요.`));
        return;
      }
      const reader = new FileReader();
      reader.onload = ()=> resolve(reader.result);
      reader.onerror = ()=> reject(new Error('파일을 읽지 못했어요'));
      reader.readAsDataURL(file);
      return;
    }
    // 원본이 PNG면(투명한 부분이 있을 수 있음) 브라우저가 WebP 인코딩을 지원할 때
    // WebP로 압축함 — WebP는 JPEG처럼 quality로 용량을 조절하면서도 PNG처럼
    // 투명도(알파 채널)도 그대로 유지되기 때문에, 해상도를 깎지 않고도 용량을
    // 줄일 수 있음. WebP를 지원 안 하는 구형 브라우저에서는 기존 방식(PNG 유지 +
    // 목표 용량 못 맞추면 해상도를 단계적으로 축소)으로 폴백함.
    const isPng = file.type === 'image/png';
    const reader = new FileReader();
    reader.onload = ()=>{
      const img = new Image();
      img.onload = ()=>{
        let { width, height } = img;
        if(width > height && width > maxDim){ height = Math.round(height * (maxDim/width)); width = maxDim; }
        else if(height >= width && height > maxDim){ width = Math.round(width * (maxDim/height)); height = maxDim; }
        const drawAt = (w, h)=>{
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          // 여러 장을 한꺼번에 올릴 때도 화질이 떨어지지 않도록, 캔버스 축소
          // 리샘플링 품질을 명시적으로 "high"로 지정함(지정 안 하면 브라우저마다
          // 기본값이 달라서, 사진을 여러 장 연달아 처리할 때 저품질 리샘플링이
          // 섞여 들어가는 경우가 있었음)
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          return canvas;
        };
        if(isPng){
          const canvas = drawAt(width, height);
          if(supportsWebP()){
            // WebP는 손실 압축이어도 알파 채널은 별도로 무손실에 가깝게 보존되므로,
            // 투명 여부를 따로 검사할 필요 없이 항상 이 경로를 타도 됨.
            let quality = 0.85;
            let dataUrl = canvas.toDataURL('image/webp', quality);
            while(dataUrl.length > maxBytes * 1.37 && quality > 0.25){
              quality -= 0.1;
              dataUrl = canvas.toDataURL('image/webp', quality);
            }
            resolve(dataUrl);
          } else {
            // 폴백: WebP 미지원 브라우저. 투명 영역이 없으면(대부분 사진 PNG)
            // JPEG로 quality를 조절해 해상도 손실 없이 압축하고, 진짜 투명이
            // 있는 PNG(스티커/로고 등)만 화질 옵션이 없는 PNG로 남기되 목표
            // 용량을 못 맞추면 해상도를 단계적으로 줄임.
            if(!canvasHasTransparency(canvas)){
              let quality = 0.85;
              let dataUrl = canvas.toDataURL('image/jpeg', quality);
              while(dataUrl.length > maxBytes * 1.37 && quality > 0.25){
                quality -= 0.1;
                dataUrl = canvas.toDataURL('image/jpeg', quality);
              }
              resolve(dataUrl);
            } else {
              let w = width, h = height, dim = maxDim;
              let dataUrl = canvas.toDataURL('image/png');
              while(dataUrl.length > maxBytes * 1.37 && dim > 200){
                dim = Math.round(dim * 0.8);
                if(w > h){ h = Math.round(h * (dim/w)); w = dim; }
                else{ w = Math.round(w * (dim/h)); h = dim; }
                dataUrl = drawAt(w, h).toDataURL('image/png');
              }
              resolve(dataUrl);
            }
          }
        } else {
          const canvas = drawAt(width, height);
          let quality = 0.85;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          while(dataUrl.length > maxBytes * 1.37 && quality > 0.25){
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          resolve(dataUrl);
        }
      };
      img.onerror = ()=> reject(new Error('이미지를 불러오지 못했어요'));
      img.src = reader.result;
    };
    reader.onerror = ()=> reject(new Error('파일을 읽지 못했어요'));
    reader.readAsDataURL(file);
  });
}

function fileToBase64(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = ()=> reject(new Error('파일을 읽지 못했어요'));
    reader.readAsDataURL(file);
  });
}

/* 프로필 사진 전용 압축: compressImageFile은 항상 JPEG로 인코딩해서 투명한 부분을
   검은/흰 배경으로 덮어버리므로, 배경이 투명한 PNG 캐릭터 이미지를 올리면 망가짐.
   원본이 PNG면 PNG로 그대로 인코딩해서 투명도를 살리고, PNG는 화질(quality) 옵션이
   없으므로 용량이 넘치면 해상도를 단계적으로 줄여가며 목표 용량에 맞춤. */

// 캐릭터컷 PNG는 캔버스 자체에 투명 여백이 꽤 있는 경우가 많아서(예: 정사각형 캔버스인데
// 캐릭터는 가로로 70%만 차지), 그대로 압축하면 아바타 박스 안에서 캐릭터가 작아 보임.
// 투명하지 않은 픽셀의 경계 상자를 찾아서, 그 부분만 잘라 쓰면 캐릭터가 박스를 꽉 채움.
function findOpaqueBBox(img){
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  let data;
  try{ data = ctx.getImageData(0, 0, c.width, c.height).data; }
  catch(e){ return null; } // 캔버스 보안 제약 등으로 못 읽으면 원본 그대로 사용
  let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
  const w = c.width, h = c.height;
  for(let y=0; y<h; y++){
    const rowBase = y * w;
    for(let x=0; x<w; x++){
      if(data[(rowBase + x) * 4 + 3] > 10){
        if(x < minX) minX = x;
        if(x > maxX) maxX = x;
        if(y < minY) minY = y;
        if(y > maxY) maxY = y;
      }
    }
  }
  if(maxX < minX || maxY < minY) return null; // 완전히 빈(전부 투명) 이미지
  return { x:minX, y:minY, w:(maxX - minX + 1), h:(maxY - minY + 1) };
}

function compressAvatarImageFile(file, maxDim=900, maxBytes=320000, gifMaxBytes=650000){
  return new Promise((resolve, reject)=>{
    if(file.type === 'image/gif'){
      if(file.size > gifMaxBytes){
        reject(new Error(`GIF 용량이 너무 커요(최대 약 ${Math.round(gifMaxBytes/1024)}KB). 더 작은 GIF를 쓰거나, URL 방식을 이용해주세요.`));
        return;
      }
      const reader = new FileReader();
      reader.onload = ()=> resolve(reader.result);
      reader.onerror = ()=> reject(new Error('파일을 읽지 못했어요'));
      reader.readAsDataURL(file);
      return;
    }
    const isPng = file.type === 'image/png';
    const reader = new FileReader();
    reader.onload = ()=>{
      const img = new Image();
      img.onload = ()=>{
        if(isPng){
          // 투명 여백을 뺀 실제 캐릭터 영역(약간의 여유 마진 포함)만 잘라서 리사이즈
          const bbox = findOpaqueBBox(img);
          const margin = bbox ? Math.round(Math.max(bbox.w, bbox.h) * 0.04) : 0;
          const sx = bbox ? Math.max(0, bbox.x - margin) : 0;
          const sy = bbox ? Math.max(0, bbox.y - margin) : 0;
          const sw = bbox ? Math.min(img.width - sx, bbox.w + margin * 2) : img.width;
          const sh = bbox ? Math.min(img.height - sy, bbox.h + margin * 2) : img.height;
          const drawTrimmed = (dim)=>{
            let width = sw, height = sh;
            if(width > height && width > dim){ height = Math.round(height * (dim/width)); width = dim; }
            else if(height >= width && height > dim){ width = Math.round(width * (dim/height)); height = dim; }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
            return canvas;
          };
          let dim = maxDim;
          let dataUrl = drawTrimmed(dim).toDataURL('image/png');
          while(dataUrl.length > maxBytes * 1.37 && dim > 200){
            dim = Math.round(dim * 0.8);
            dataUrl = drawTrimmed(dim).toDataURL('image/png');
          }
          resolve(dataUrl);
        } else {
          const drawAt = (dim)=>{
            let { width, height } = img;
            if(width > height && width > dim){ height = Math.round(height * (dim/width)); width = dim; }
            else if(height >= width && height > dim){ width = Math.round(width * (dim/height)); height = dim; }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            return canvas;
          };
          const canvas = drawAt(maxDim);
          let quality = 0.85;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          while(dataUrl.length > maxBytes * 1.37 && quality > 0.25){
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          resolve(dataUrl);
        }
      };
      img.onerror = ()=> reject(new Error('이미지를 불러오지 못했어요'));
      img.src = reader.result;
    };
    reader.onerror = ()=> reject(new Error('파일을 읽지 못했어요'));
    reader.readAsDataURL(file);
  });
}


/* ---------------- 큰 파일(문서/PDF) 청크 저장 ----------------
   Firestore는 문서 1개당 1MB 제한이 있어서, 큰 파일은 하나의 문서에
   통째로 못 넣음. 그래서 base64 문자열을 잘게 잘라 fileChunks 컬렉션에
   여러 문서로 나눠 저장하고, 카드에는 이 조각들을 다시 찾을 수 있는
   fileId/chunkTotal만 남겨둠(파이어 스토리지 없이 파이어스토어만으로 해결). */
const CHUNK_SIZE = 700000; // 조각 하나당 글자 수 (문서 1MB 제한에 여유있게 안전한 크기)

// Firestore 문서 하나의 실제 한도는 1,048,576바이트인데, 문서 위젯(content/documents)은
// 작은 파일을 base64로 카드 안에 바로 저장하다 보니 카드가 하나씩 쌓일수록 문서 전체
// 용량이 커짐. 새 파일 하나만 보고 "이 파일은 작으니 바로 저장" 이라고 판단하면,
// 이미 쌓여있던 다른 카드들과 합쳐서 1MB를 넘겨 저장 자체가 실패할 수 있음.
// 그래서 실제로 저장을 시도하기 전에 "이 카드까지 합쳤을 때 문서 전체가 몇 바이트가
// 되는지"를 미리 계산해서, 안전 한도를 넘으면 (파일 자체는 작더라도) 청크 저장으로
// 돌려 항상 저장이 성공하도록 함.
const DOC_TOTAL_SAFE_BYTES = 900000; // 실제 한도(1,048,576B)보다 여유있게 잡은 안전선

function estimateCardsBytes(cards){
  try{ return new Blob([JSON.stringify({ cards })]).size; }
  catch(e){ return JSON.stringify({ cards }).length; }
}

function splitIntoChunks(str, size){
  const out = [];
  for(let i=0; i<str.length; i+=size) out.push(str.slice(i, i+size));
  return out;
}

async function saveFileChunked(base64DataUrl){
  const fileId = uid();
  const chunks = splitIntoChunks(base64DataUrl, CHUNK_SIZE);
  const batch = db.batch();
  chunks.forEach((chunk, i)=>{
    batch.set(db.collection('fileChunks').doc(`${fileId}_${i}`), { fileId, index: i, data: chunk });
  });
  await batch.commit();
  return { fileId, total: chunks.length };
}

async function loadFileChunked(fileId, total){
  const snaps = await Promise.all(
    Array.from({ length: total }, (_, i)=> db.collection('fileChunks').doc(`${fileId}_${i}`).get())
  );
  return snaps.map(s=> (s.exists ? s.data().data : '')).join('');
}

async function deleteFileChunked(fileId, total){
  const batch = db.batch();
  for(let i=0; i<total; i++){
    batch.delete(db.collection('fileChunks').doc(`${fileId}_${i}`));
  }
  await batch.commit();
}

// 프로필의 시점/IF(들)를 통째로 삭제할 때, 그 안에 청크로 저장돼 있던 프로필 사진들도
// 같이 정리해주는 헬퍼. sections는 삭제된(또는 삭제될) 시점/IF들의 배열.
function deleteAvatarChunksInSections(sections){
  (sections || []).forEach(sec=>{
    (sec.peopleFields || []).forEach(pf=>{
      if(pf && pf.avatarChunked && pf.avatarFileId){
        deleteFileChunked(pf.avatarFileId, pf.avatarChunkTotal || 0).catch(()=>{});
      }
    });
  });
}

/* base64 데이터 URL을 Blob으로 바꿔서 새 탭에 열어줌.
   큰 파일을 data: URL 그대로 window.open에 넘기면 브라우저별 주소 길이
   제한에 걸릴 수 있어서, 실제 파일처럼 동작하는 Blob 주소로 변환해서 씀. */
function openDataUrlAsBlob(dataUrl){
  const commaIdx = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for(let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(()=> URL.revokeObjectURL(url), 60000);
}

/* ---------------- 잠금 / 편집모드 ---------------- */

function refreshLockUI(){
  document.body.classList.toggle('edit-mode', editMode);
  bannerEditBtn.style.display = editMode ? 'inline-flex' : 'none';
  bgEditBtn.style.display = editMode ? 'inline-flex' : 'none';
  globalStyleBtn.style.display = editMode ? 'inline-flex' : 'none';
  const shakerManageBtn = document.getElementById('shakerManageBtn');
  if(shakerManageBtn) shakerManageBtn.style.display = editMode ? 'inline-flex' : 'none';
  const shakerBgBtn = document.getElementById('shakerBgBtn');
  if(shakerBgBtn) shakerBgBtn.style.display = editMode ? 'inline-flex' : 'none';
  lockBadge.classList.toggle('unlocked', editMode);
  lockBtn.innerHTML = '<span class="icon-accent">' + (editMode ? ICONS.unlock : ICONS.lock) + '</span>';
  lockBtn.setAttribute('aria-label', editMode ? '잠그기' : '잠금 해제');
}

function renderAllModules(){
  renderImages(); renderProfile(); renderMusic(); renderDday(); renderGuestbook();
  renderCalendar(); renderGallery(); renderGallery2(); renderRefGallery(); renderVideos(); renderDocs(); renderSessions(); renderChecklist();
  renderSpeechCard();
}

lockBtn.addEventListener('click', async ()=>{
  if(editMode){
    editMode = false;
    currentPwHash = null;
    widgetUnlocked.clear();
    sessionStorage.removeItem('gh_edit');
    sessionStorage.removeItem('gh_pw');
    refreshLockUI();
    renderAllModules();
    return;
  }
  let lockDoc;
  try{
    lockDoc = await db.collection('meta').doc('lock').get();
  }catch(err){
    console.error(err);
    toast('저장소 연결에 실패했어요. firebase-config.js 설정을 확인해주세요.');
    return;
  }
  if(!lockDoc.exists){
    openModal(`
      <h3>편집 비밀번호 설정</h3>
      <p style="font-size:.8rem;color:var(--ink-soft)">이 갠홈을 처음 여셨네요. 앞으로 사용할 편집 비밀번호를 정해주세요. 이 비밀번호를 아는 사람만 내용을 수정할 수 있어요.</p>
      <label>비밀번호</label>
      <input type="password" id="pwSet1">
      <label>비밀번호 확인</label>
      <input type="password" id="pwSet2">
      <div class="modal-actions">
        <button class="btn ghost" id="pwCancel">취소</button>
        <button class="btn primary" id="pwSave">설정하고 시작</button>
      </div>
    `, (m)=>{
      m.querySelector('#pwCancel').onclick = closeModal;
      m.querySelector('#pwSave').onclick = async ()=>{
        const p1 = m.querySelector('#pwSet1').value;
        const p2 = m.querySelector('#pwSet2').value;
        if(!p1 || p1.length < 4){ toast('4자 이상 입력해주세요'); return; }
        if(p1 !== p2){ toast('비밀번호가 서로 달라요'); return; }
        const hash = await sha256(p1);
        currentPwHash = hash;
        await db.collection('meta').doc('lock').set({ passwordHash: hash });
        editMode = true;
        sessionStorage.setItem('gh_edit','1');
        sessionStorage.setItem('gh_pw', hash);
        refreshLockUI(); renderAllModules(); closeModal();
        toast('편집 모드가 시작됐어요');
        migrateOversizedGalleries();
        migrateOversizedProfileAvatars();
      };
    });
    return;
  }
  openModal(`
    <h3>편집 비밀번호 입력</h3>
    <input type="password" id="pwEnter" placeholder="비밀번호">
    <div class="modal-actions">
      <button class="btn ghost" id="pwCancel">취소</button>
      <button class="btn primary" id="pwOk">확인</button>
    </div>
  `, (m)=>{
    const input = m.querySelector('#pwEnter');
    input.focus();
    const submit = async ()=>{
      const hash = await sha256(input.value);
      if(hash === lockDoc.data().passwordHash){
        currentPwHash = hash;
        editMode = true;
        sessionStorage.setItem('gh_edit','1');
        sessionStorage.setItem('gh_pw', hash);
        refreshLockUI(); renderAllModules(); closeModal();
        toast('편집 모드로 전환됐어요');
        migrateOversizedGalleries();
        migrateOversizedProfileAvatars();
      } else {
        toast('비밀번호가 일치하지 않아요');
      }
    };
    m.querySelector('#pwOk').onclick = submit;
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
    m.querySelector('#pwCancel').onclick = closeModal;
  });
});

/* ---------------- 배너 (항상 최상단 고정) ---------------- */

bannerEditBtn.addEventListener('click', async ()=>{
  const doc = await metaDoc('banner').get();
  const cur = doc.exists ? doc.data() : {};
  const curIsUrl = cur.image && !cur.image.startsWith('data:');
  openModal(`
    <h3>배너 편집 <span style="font-size:.7rem;font-weight:400;color:var(--ink-soft);">(${siteMode === 'light' ? '라이트모드' : '다크모드'})</span></h3>
    <label>배너 사진 올리기 (기기에서 바로 선택)</label>
    <input type="file" id="bImgFile" accept="image/*">
    <p class="hint">선택하면 자동으로 압축해서 저장돼요.</p>
    <label>또는, 이미지 URL 직접 입력</label>
    <input type="url" id="bImg" placeholder="https://..." value="${curIsUrl ? cur.image : ''}">
    <p class="hint">직접 링크 URL도 가능해요. (사진 선택 시 이 입력은 무시돼요)</p>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">저장</button></div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const file = m.querySelector('#bImgFile').files[0];
      const urlInput = normalizeImageUrl(m.querySelector('#bImg').value.trim());
      const oldChunked = !!cur.chunked, oldFileId = cur.fileId || '', oldChunkTotal = cur.chunkTotal || 0;
      if(!file && !urlInput){ closeModal(); return; }
      saveBtn.disabled = true;
      saveBtn.textContent = file ? '사진 처리 중…' : '저장 중…';
      try{
        if(file){
          // 배너는 사이트에서 가장 크고 눈에 띄는 사진이라 다른 썸네일용 압축보다
          // 해상도/용량 목표치를 훨씬 넉넉하게 줌. Firestore 문서 하나엔 1MB 제한이
          // 있어서 예전엔 그 한도에 맞추려고 압축을 심하게 걸었었는데(700KB), 그러다
          // 보니 사진이 큼직하게 깔리는 배너 특성상 화질이 눈에 띄게 뭉개졌음. 이제는
          // 다른 큰 사진들과 같은 방식(fileChunks 컬렉션에 조각내어 저장)을 배너에도
          // 써서 문서 크기 제한 없이 고화질 그대로 저장함.
          const compressed = await compressImageFile(file, 2400, 3000000);
          const { fileId, total } = await saveFileChunked(compressed);
          await metaDoc('banner').set({ image:'', chunked:true, fileId, chunkTotal: total }, {merge:true});
        } else {
          await metaDoc('banner').set({ image: urlInput, chunked:false, fileId:'', chunkTotal:0 }, {merge:true});
        }
        if(oldChunked && oldFileId) deleteFileChunked(oldFileId, oldChunkTotal).catch(()=>{});
        closeModal();
        toast('배너를 저장했어요');
      }catch(err){
        toast(err.message || '이미지를 처리하지 못했어요');
        saveBtn.disabled = false;
        saveBtn.textContent = '저장';
      }
    };
  });
});

/* ---------------- 홈페이지 전체 배경 이미지 (배너와 별개) ---------------- */

bgEditBtn.addEventListener('click', async ()=>{
  const doc = await metaDoc('background').get();
  const cur = doc.exists ? doc.data() : {};
  const curIsUrl = cur.image && !cur.image.startsWith('data:');
  openModal(`
    <h3>홈페이지 배경 이미지 <span style="font-size:.7rem;font-weight:400;color:var(--ink-soft);">(${siteMode === 'light' ? '라이트모드' : '다크모드'})</span></h3>
    <p class="hint">배너와 별개로 사이트 전체 뒤에 깔리는 배경이에요.</p>
    <label>배경 사진 올리기 (기기에서 바로 선택)</label>
    <input type="file" id="bgImgFile" accept="image/*">
    <label>또는, 이미지 URL 직접 입력</label>
    <input type="url" id="bgImg" placeholder="https://..." value="${curIsUrl ? cur.image : ''}">
    <div class="modal-actions">
      <button class="btn danger" id="rm" type="button">배경 사진 없애기</button>
      <button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">저장</button>
    </div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#rm').onclick = async ()=>{
      await metaDoc('background').set({ image:'' }, {merge:true});
      closeModal();
      toast('배경 사진을 없앴어요');
    };
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const file = m.querySelector('#bgImgFile').files[0];
      let image = normalizeImageUrl(m.querySelector('#bgImg').value.trim());
      if(file){
        saveBtn.disabled = true;
        saveBtn.textContent = '사진 처리 중…';
        try{
          image = await compressImageFile(file, 1920, 700000);
        }catch(err){
          toast(err.message || '이미지를 처리하지 못했어요');
          saveBtn.disabled = false;
          saveBtn.textContent = '저장';
          return;
        }
      } else if(!image){
        image = cur.image || '';
      }
      await metaDoc('background').set({ image }, {merge:true});
      closeModal();
      toast('배경 이미지를 저장했어요');
    };
  });
});

/* ---------------- 테마 편집 (전체 색/폰트 일괄 적용) ---------------- */

/* <input type=color>는 알파(투명도)를 다룰 수 없어서, 카드 배경색은
   "색상(hex) + 투명도(슬라이더)"를 따로 받아 rgba()로 합성함.
   이렇게 해야 사용자가 테마를 바꿔도 유리카드 특유의 반투명함이 유지됨. */
function hexToRgba(hex, alpha){
  const h = (hex||'#20141d').replace('#','');
  const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
  const bigint = parseInt(full, 16) || 0;
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function parseColorToHexAlpha(str){
  if(!str) return {hex:'#20141d', alpha:.38};
  str = str.trim();
  const rgbaMatch = str.match(/rgba?\(([^)]+)\)/);
  if(rgbaMatch){
    const parts = rgbaMatch[1].split(',').map(s=>s.trim());
    const r = Math.max(0, Math.min(255, Math.round(parseFloat(parts[0])||0)));
    const g = Math.max(0, Math.min(255, Math.round(parseFloat(parts[1])||0)));
    const b = Math.max(0, Math.min(255, Math.round(parseFloat(parts[2])||0)));
    const a = parts.length>3 ? parseFloat(parts[3]) : 1;
    const hex = '#' + [r,g,b].map(x=> x.toString(16).padStart(2,'0')).join('');
    return {hex, alpha: isNaN(a) ? 1 : a};
  }
  if(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(str)) return {hex:str, alpha:1};
  return {hex:'#20141d', alpha:.38};
}

const THEME_VARS = ['--rose','--sage','--gold','--paper','--card-bg','--card-bg2','--ink'];
const FONT_DISPLAY_OPTIONS = ['ZEN SERIF','Song Myung','Noto Serif KR','Nanum Myeongjo','Gowun Batang'];
const FONT_BODY_OPTIONS = ['ZEN SERIF','Noto Sans KR','Gowun Dodum'];
const CUSTOM_FONT_MAX_BYTES = 500000;

function injectCustomFontFace(srcDecl){
  let styleTag = document.getElementById('customFontFace');
  if(!styleTag){
    styleTag = document.createElement('style');
    styleTag.id = 'customFontFace';
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = srcDecl
    ? `@font-face{ font-family:'CustomUserFont'; src:${srcDecl}; font-weight:400; font-style:normal; font-display:swap; }`
    : '';
}

/* ⚠️ 커스텀 테마 값은 반드시 document.documentElement(html)이 아니라
   document.body에 적용해야 함. 라이트모드 기본 팔레트가 body.theme-light{...}
   처럼 body 자기 자신에 직접 걸려있는 규칙이라서, html에 인라인으로
   값을 넣어봤자 상속 전에 body 자신의 규칙이 이겨버려 라이트모드에서는
   커스텀 색이 통째로 무시되는 문제가 있었음(다크모드는 body에 직접
   걸린 규칙이 없어서 html의 인라인 값이 그대로 상속돼 우연히 잘 됐던 것). */
function hexToRgbTriple(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex||'');
  if(!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n>>16)&255},${(n>>8)&255},${n&255}`;
}

function applyTheme(theme){
  if(!theme) return;
  THEME_VARS.forEach(v=>{
    const key = v.replace('--','');
    if(theme[key]) document.body.style.setProperty(v, theme[key]);
  });
  // 라이트모드 보정 규칙들이 검정 대신 --ink 톤의 rgba(var(--ink-rgb), 알파)를 쓰므로,
  // 사용자가 테마 편집에서 글자색을 바꾸면 이 r,g,b 성분도 같이 갱신해야
  // 그림자/스크림/버튼 배경 등 보정 색이 새 글자색을 따라감(안 그러면 커스텀
  // 잉크컬러를 골라도 보정 부분만 옛 기본색 그대로 남아있게 됨).
  if(theme.ink){
    const rgb = hexToRgbTriple(theme.ink);
    if(rgb){
      document.body.style.setProperty('--ink-rgb', rgb);
      // --ink-soft는 이제 --ink-rgb에서 실시간으로 파생되지 않고 직접 등록된
      // 색상값이라(부드러운 전환을 위해 — style.css의 @property 주석 참고),
      // 커스텀 글자색을 적용할 때 여기서도 같이 맞춰줘야 계속 따라감
      document.body.style.setProperty('--ink-soft', `rgba(${rgb},0.62)`);
    }
  }
  if(theme.customFontData){
    injectCustomFontFace(`url(${theme.customFontData}) format('truetype')`);
    document.body.style.setProperty('--font-display', `'CustomUserFont', 'ZEN SERIF', serif`);
    document.body.style.setProperty('--font-body', `'CustomUserFont', 'ZEN SERIF', serif`);
  } else if(theme.customFontFile){
    injectCustomFontFace(`url('./fonts/${theme.customFontFile}') format('truetype')`);
    document.body.style.setProperty('--font-display', `'CustomUserFont', 'ZEN SERIF', serif`);
    document.body.style.setProperty('--font-body', `'CustomUserFont', 'ZEN SERIF', serif`);
  } else {
    injectCustomFontFace(null);
    if(theme.fontDisplay) document.body.style.setProperty('--font-display', `'${theme.fontDisplay}', 'Noto Serif KR', serif`);
    if(theme.fontBody) document.body.style.setProperty('--font-body', `'${theme.fontBody}', serif`);
  }
}

/* 배너/배경/테마는 모드별로 완전히 분리된 문서를 구독하며, 모드 전환 시 재구독함.
   배너는 청크 재조립(loadFileChunked)이 필요해 배경보다 항상 늦게 준비되므로, 재구독
   직후엔 둘 다의 "첫 스냅샷"이 도착할 때까지 기다렸다가 한 틱에 같이 크로스페이드함
   (그 이후엔 각자 도착 즉시 반영). 이 함수가 반환하는 Promise를
   runModeBlurTransition()이 실제로 기다린 뒤 베일을 걷으므로, 느린 모바일 네트워크에서
   베일이 사진보다 먼저 걷혀버리는 문제도 해결됨 — 안전 타임아웃도 700ms→1600ms로 늘림. */
const MODE_META_READY_TIMEOUT_MS = 1600;
let unsubBanner = null, unsubBackground = null, unsubTheme = null;
let modeMetaGen = 0;
function subscribeModeMeta(){
  if(unsubBanner) unsubBanner();
  if(unsubBackground) unsubBackground();
  if(unsubTheme) unsubTheme();

  const gen = ++modeMetaGen;
  let bannerFirstDone = false, backgroundFirstDone = false;
  let pendingBannerApply = null, pendingBackgroundApply = null;
  let resolveReady;
  const readyPromise = new Promise(res=>{ resolveReady = res; });
  const releasePending = ()=>{
    if(pendingBannerApply){ pendingBannerApply(); pendingBannerApply = null; }
    if(pendingBackgroundApply){ pendingBackgroundApply(); pendingBackgroundApply = null; }
    resolveReady();
  };
  const tryRelease = ()=>{ if(bannerFirstDone && backgroundFirstDone) releasePending(); };
  setTimeout(()=>{ if(gen === modeMetaGen) releasePending(); }, MODE_META_READY_TIMEOUT_MS);

  unsubBanner = metaDoc('banner').onSnapshot(async doc=>{
    if(gen !== modeMetaGen) return;
    const d = doc.exists ? doc.data() : {};
    let apply;
    if(d.chunked && d.fileId){
      let dataUrl = '';
      try{ dataUrl = await loadFileChunked(d.fileId, d.chunkTotal || 0); }catch(e){ dataUrl = ''; }
      if(gen !== modeMetaGen) return;
      apply = ()=> setBannerBgImageCrossfade(dataUrl);
    } else if(d.image){
      apply = ()=> setBannerBgImageCrossfade(d.image);
    } else {
      apply = ()=> setBannerBgImageCrossfade('');
    }
    if(!bannerFirstDone){ bannerFirstDone = true; pendingBannerApply = apply; tryRelease(); }
    else apply();
  });

  unsubBackground = metaDoc('background').onSnapshot(doc=>{
    if(gen !== modeMetaGen) return;
    const d = doc.exists ? doc.data() : {};
    const apply = ()=>{
      if(d.image){
        setPageBgImageCrossfade(d.image);
        bgImageLayerEl.classList.add('has-image');
      } else {
        setPageBgImageCrossfade('');
        bgImageLayerEl.classList.remove('has-image');
      }
    };
    if(!backgroundFirstDone){ backgroundFirstDone = true; pendingBackgroundApply = apply; tryRelease(); }
    else apply();
  });

  unsubTheme = metaDoc('theme').onSnapshot(doc=>{
    // 이전 모드에서 적용해둔 색/폰트 인라인 오버라이드를 먼저 걷어내야, 그 값이
    // 새로 전환한 모드에도 그대로 남아있는(색이 안 바뀌는) 문제가 생기지 않음.
    THEME_VARS.forEach(v=> document.body.style.removeProperty(v));
    document.body.style.removeProperty('--ink-rgb');
    document.body.style.removeProperty('--ink-soft');
    document.body.style.removeProperty('--font-display');
    document.body.style.removeProperty('--font-body');
    injectCustomFontFace(null);
    const data = doc.exists ? doc.data() : null;
    if(data) applyTheme(data);
  });

  return readyPromise;
}
subscribeModeMeta();

/* ---------------- 모드 전환 연출 ----------------
   색 전환 자체는 style.css의 @property + transition이 크로스페이드로 처리하므로,
   여기 오버레이는 완전히 가릴 필요 없이 짧게만 걸침: 1) 스위치 썸 프리롤 →
   2) 블러 베일을 얹으며 테마 즉시 교체(Firestore 값이 막 도착하는 순간만 살짝
   가리는 용도, 전용 변수 --glass-blur-mode-veil이라 다른 UI 블러엔 영향 없음) →
   3) 환영 문구 표시 → 4) 문구/베일 해제. 베일 인/아웃 시간은 항상 style.css
   .mode-blur-overlay의 transition 시간 이상으로 맞출 것(아래 MODE_VEIL_IN_MS). */
const MODE_BLUR_PREROLL_MS = 180;   // 스위치 프리롤 ~ 베일 시작 사이 간격
// ⚠️ style.css .mode-blur-overlay의 opacity transition(.34s)보다 짧으면, 베일이 배경을
// 다 덮기 전에 테마 교체발 리페인트가 겹쳐 일부 환경(삼성인터넷 등)에서 버벅였음 —
// 항상 그 340ms 이상으로 유지(현재 +10ms 여유).
const MODE_VEIL_IN_MS = 350;        // 베일이 걸리는 시간(=테마가 실제로 바뀌는 시점)
/* 문구 글자색은 style.css에서 흰색으로 고정해뒀음(뜨는 배경이 사진이든 어떤
   팔레트든 항상 대비가 확보되게). 예전엔 모드의 강조색(lastKnownAccent)을
   인라인으로 확정해 씌웠었는데, 그 색이 검은 text-shadow와 겹쳐 오히려 잘 안
   보이는 문제가 있어서 흰색 고정으로 바꿈. */
const MODE_TEXT_DELAY_MS = 90;      // 베일이 자리잡은 뒤 문구가 뜨기 시작하기까지의 짧은 텀
const MODE_TEXT_FADE_MS = 320;      // 문구가 서서히 뜨고/사라지는 시간 — style.css .mode-welcome-text의 transition(.32s)과 반드시 같아야 함
const MODE_TEXT_HOLD_MS = 700;      // 문구가 "완전히 다 뜬 채로" 유지되는 최소 시간(배너/배경 이미지가 이보다 늦게 도착하면 실제로는 더 길어짐 — 아래 subscribeModeMeta 참고)
const MODE_VEIL_OUT_MS = 380;       // 베일이 걷히는 시간
/* 예전엔 문구가 다 뜨기도 전에(페이드인 320ms가 끝나기 전) 사라지는 타이머가 먼저
   발동해버려서, 문구가 최대 밝기까지 못 올라가고 바로 꺼지는 버그가 있었음(그래서
   "뜨는 시간이 너무 짧다"고 느껴졌던 것). 지금도 아래 runModeBlurTransition()에서
   "페이드인이 다 끝난 뒤에" hold 시간을 더하는 방식으로 순서를 명확히 유지함. */

let modeTransitionBusy = false;

// 오버레이/문구는 딱 한 번만 만들어 재사용(전환마다 새로 생성/제거하지 않음)
let modeBlurOverlayEl = null;
let modeWelcomeTextEl = null;
function ensureModeBlurOverlay(){
  if(modeBlurOverlayEl) return modeBlurOverlayEl;
  modeBlurOverlayEl = document.createElement('div');
  modeBlurOverlayEl.className = 'mode-blur-overlay';
  modeWelcomeTextEl = document.createElement('div');
  modeWelcomeTextEl.className = 'mode-welcome-text';
  modeBlurOverlayEl.appendChild(modeWelcomeTextEl);
  document.body.appendChild(modeBlurOverlayEl);
  return modeBlurOverlayEl;
}

function runModeBlurTransition(newMode){
  const overlay = ensureModeBlurOverlay();
  modeWelcomeTextEl.textContent = MODE_LABELS[newMode] + '에 오신 것을 환영합니다.';
  // 문구 색은 이제 style.css에서 흰색으로 고정돼 있어 여기서 인라인으로 덮어쓸 필요가 없음

  // setSiteMode()에서 이미 베일을 미세 opacity(.001)로 워밍업해뒀으므로, 여기서는
  // 그 워밍업을 실제 트랜지션으로 이어받기만 하면 됨 — 인라인 오버라이드를 지우고
  // .show를 붙이면, 직전 프레임에 그려져 있던 .001에서 진짜 트랜지션(→1)이 시작됨
  requestAnimationFrame(()=>{
    overlay.style.transition = '';
    overlay.style.opacity = '';
    overlay.classList.add('show');
  });

  // 아래 시각 하나하나가 "그 앞 단계가 실제로 끝난 뒤"를 기준으로 이어 붙게
  // 계산됨(중간에 겹치면 문구가 최대 밝기까지 못 올라가고 꺼져버리는 예전 버그가
  // 재발함) — 순서: 베일 인 → 테마 교체 → (텀) → 문구 페이드인 → 문구 유지(HOLD,
  // 단 배너/배경 이미지가 아직 준비 안 됐으면 그때까지 더 유지) → 문구 페이드아웃 → 베일 아웃
  const themeSwapAt = MODE_VEIL_IN_MS;
  const textShowAt = themeSwapAt + MODE_TEXT_DELAY_MS;
  const textFullyShownAt = textShowAt + MODE_TEXT_FADE_MS;
  const minHideAt = textFullyShownAt + MODE_TEXT_HOLD_MS;

  // 베일을 걷는 실제 시점은 "최소 유지시간이 지났는가"와 "배너·배경 이미지가
  // 실제로 다 반영됐는가"를 둘 다 만족해야 함 — 그래야 네트워크가 느릴 때도
  // 화면 전환이 끝난 뒤에 이미지가 뒤늦게 팝인하는 일 없이, 베일이 걷히는 그
  // 순간엔 이미 새 이미지까지 다 반영돼 있음(단 subscribeModeMeta 쪽 자체
  // 안전 타임아웃이 있어 무한정 기다리진 않음)
  let minTimeElapsed = false, metaReady = false, veilHidden = false;
  const hideVeilNow = ()=>{
    if(veilHidden) return;
    veilHidden = true;
    modeWelcomeTextEl.classList.remove('show');
    overlay.classList.remove('show');
    // 베일이 걷히기 시작하는 시점에 떼어둠 — 이후 테마 편집 모달에서 배경색을
    // 저장하는 등 베일 없는 경로는 원래대로 부드러운 크로스페이드를 그대로 씀
    document.body.classList.remove('mode-swap-snap');
    setTimeout(()=>{
      modeTransitionBusy = false;
      modeToggleBtn.classList.remove('mt-busy');
    }, Math.max(MODE_TEXT_FADE_MS, MODE_VEIL_OUT_MS));
  };
  const tryHideVeil = ()=>{ if(minTimeElapsed && metaReady) hideVeilNow(); };

  setTimeout(()=>{
    // 베일이 옅게 걸리는 시점에 곧바로 테마를 바꿔치기 — 색 자체는 여기서부터
    // body의 transition을 타고 실제로 부드럽게 이어짐(더 이상 "숨겼다가 짠"이 아님).
    // mode-swap-snap은 반드시 applyModeClass()보다 먼저 걸어야, background-color/
    // --paper가 "이전 값→새 값"을 보간하지 않고 이 프레임에 곧바로 스냅됨(둘 다
    // 베일에 가려 안 보이는 구간이라 안전함)
    document.body.classList.add('mode-swap-snap');
    applyModeClass();
    subscribeModeMeta().then(()=>{ metaReady = true; tryHideVeil(); });
  }, themeSwapAt);

  setTimeout(()=>{
    modeWelcomeTextEl.classList.add('show');
  }, textShowAt);

  setTimeout(()=>{ minTimeElapsed = true; tryHideVeil(); }, minHideAt);
}
function setSiteMode(newMode){
  if(newMode !== 'light' && newMode !== 'dark') return;
  if(newMode === siteMode) return;
  if(modeTransitionBusy) return;
  modeTransitionBusy = true;
  modeToggleBtn.classList.add('mt-busy');

  // 삼성인터넷 등 일부 모바일 브라우저는 opacity:0으로 오래 머문 베일의 GPU 레이어를
  // 내려놨다가 트랜지션 시작 프레임에야 재승격을 시도해, 블러 없는 프레임이 한 장
  // 섞여 "끊기는" 것처럼 보임. 트랜지션 시작 1프레임 전 워밍업만으로는 부족해서,
  // 토글을 누른 즉시 감지 불가능한 opacity(.001)로 강제 리플로우해 리드타임을
  // 약 530ms(프리롤+베일)까지 늘림. 평소엔 opacity:0으로 비용 없음 — 그래도 프레임이
  // 새면 삼성인터넷 한정 backdrop-filter 제거 후 단색 페이드 대체를 고려할 것.
  const overlay = ensureModeBlurOverlay();
  overlay.style.transition = 'none';
  overlay.style.opacity = '0.001';
  overlay.getBoundingClientRect(); // 강제 리플로우로 위 값을 즉시 반영

  siteMode = newMode;
  localStorage.setItem('gh_mode', siteMode);

  // 프리롤: 도어를 열기 전에 스위치 썸/라벨부터 먼저 움직여 보여줌
  ensureModeToggleMarkup();
  modeToggleBtn.classList.toggle('mt-target-light', newMode === 'light');
  modeToggleBtn.querySelector('.mt-icon').innerHTML = MODE_ICONS[newMode];
  modeToggleBtn.querySelector('.mt-label').textContent = MODE_LABELS[newMode];
  modeToggleBtn.setAttribute('aria-label', MODE_LABELS[newMode] + ' 적용 중 · 눌러서 전환');

  setTimeout(()=> runModeBlurTransition(newMode), MODE_BLUR_PREROLL_MS);
}

// ---- 탭(클릭)은 그냥 반대쪽으로 토글, 슬라이드(드래그/스와이프)는 놓은 위치에
// 따라 전환 — 모바일에서 스위치를 직접 밀어서 바꿀 수 있게. 드래그가 실제로
// 일정 거리 이상 움직였을 때만 뒤이어 발생하는 click 이벤트를 무시해서
// 드래그 종료 시 토글이 두 번 겹쳐 일어나지 않게 함.
let mtDrag = null;
let mtSuppressClick = false;
modeToggleBtn.addEventListener('pointerdown', (e)=>{
  const rect = modeToggleBtn.getBoundingClientRect();
  mtDrag = { startX: e.clientX, moved:false, width: rect.width, startMode: siteMode };
  try{ modeToggleBtn.setPointerCapture(e.pointerId); }catch(_){}
  modeToggleBtn.classList.add('dragging');
});
modeToggleBtn.addEventListener('pointermove', (e)=>{
  if(!mtDrag) return;
  const dx = e.clientX - mtDrag.startX;
  if(Math.abs(dx) > 4) mtDrag.moved = true;
  const thumb = modeToggleBtn.querySelector('.mt-thumb');
  if(!thumb) return;
  const min = 4, max = mtDrag.width - 28;
  const base = mtDrag.startMode === 'light' ? max : min;
  const next = Math.min(max, Math.max(min, base + dx));
  thumb.style.left = next + 'px';
});
function mtEndDrag(e){
  if(!mtDrag) return;
  const thumb = modeToggleBtn.querySelector('.mt-thumb');
  if(thumb) thumb.style.left = '';
  if(mtDrag.moved){
    mtSuppressClick = true;
    const dx = (e.clientX || 0) - mtDrag.startX;
    if(Math.abs(dx) > mtDrag.width * 0.28){
      setSiteMode(dx > 0 ? 'light' : 'dark');
    }
  }
  modeToggleBtn.classList.remove('dragging');
  mtDrag = null;
}
modeToggleBtn.addEventListener('pointerup', mtEndDrag);
modeToggleBtn.addEventListener('pointercancel', mtEndDrag);

modeToggleBtn.addEventListener('click', ()=>{
  if(mtSuppressClick){ mtSuppressClick = false; return; }
  setSiteMode(siteMode === 'light' ? 'dark' : 'light');
});

const DEFAULT_THEME_BY_MODE = {
  dark:  { rose:'#C4425F', sage:'#A9727F', gold:'#95929C', paper:'#0F0406', ink:'#F3ECEE',
           'card-bg':'rgba(32,16,20,0.075)', 'card-bg2':'rgba(32,16,20,0.045)',
           fontDisplay:'ZEN SERIF', fontBody:'ZEN SERIF' },
  light: { rose:'#DF688F', sage:'#d7d9c3', gold:'#DADBD4', paper:'#EFF4F0', ink:'#a71a36',
           'card-bg':'rgba(239,244,240,0.55)', 'card-bg2':'rgba(239,244,240,0.38)',
           fontDisplay:'ZEN SERIF', fontBody:'ZEN SERIF' }
};
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
// 컴퓨티드 스타일 값이 타이밍 문제 등으로 비거나 깨져서 들어오면 <input type="color">가
// 조용히 검정(#000000)으로 표시되고, 그 상태로 저장하면 진짜 검정이 그대로 박제됨.
// 그래서 여기서 미리 "유효한 hex인지" 검증하고, 아니면 저장된 문서값 → 코드 기본값 순으로
// 대체해서 절대 빈 값/이상한 값이 색상 피커에 그대로 들어가지 않게 함.
function safeThemeHex(computedVal, savedVal, key){
  if(HEX_COLOR_RE.test((computedVal||'').trim())) return computedVal.trim();
  if(HEX_COLOR_RE.test((savedVal||'').trim())) return savedVal.trim();
  return (DEFAULT_THEME_BY_MODE[siteMode] || DEFAULT_THEME_BY_MODE.dark)[key];
}

globalStyleBtn.addEventListener('click', async ()=>{
  if(!editMode){ toast('잠금 해제 후 편집모드에서 변경할 수 있어요'); return; }
  // 라이트모드 기본 팔레트는 body.theme-light 클래스로만 지정돼 있어서(html이 아니라
  // body 스코프), 지금 실제로 적용되고 있는 값을 정확히 읽으려면 documentElement가
  // 아니라 body에서 계산된 스타일을 읽어야 함(저장된 커스텀 색이 있으면 그 값이,
  // 없으면 현재 모드의 기본 팔레트 값이 그대로 잡힘).
  const cs = getComputedStyle(document.body);
  const rawCur = {};
  THEME_VARS.forEach(v=> rawCur[v.replace('--','')] = cs.getPropertyValue(v).trim());
  const themeDoc = await metaDoc('theme').get();
  const saved = themeDoc.exists ? themeDoc.data() : {};
  const cur = { ...rawCur };
  ['rose','sage','gold','paper','ink'].forEach(key=>{
    cur[key] = safeThemeHex(rawCur[key], saved[key], key);
  });
  const cardBgParsed = parseColorToHexAlpha(cur['card-bg']);
  const cardBgAlphaPct = Math.round(cardBgParsed.alpha*100);
  openModal(`
    <h3>테마 편집 <span style="font-size:.7rem;font-weight:400;color:var(--ink-soft);">(${siteMode === 'light' ? '라이트모드' : '다크모드'})</span></h3>
    <p style="font-size:.78rem;color:var(--ink-soft)">여기서 바꾸면 사이트 전체에 한 번에 적용돼요.</p>
    <label>메인 포인트 컬러</label>
    <div class="color-row"><input type="color" id="tRose" value="${cur.rose}"></div>
    <label>보조 포인트 컬러</label>
    <div class="color-row"><input type="color" id="tSage" value="${cur.sage}"></div>
    <label>라인/코너 컬러</label>
    <div class="color-row"><input type="color" id="tGold" value="${cur.gold}"></div>
    <label>배경색</label>
    <div class="color-row"><input type="color" id="tPaper" value="${cur.paper}"></div>
    <label>카드 색상 · 투명도</label>
    <div class="color-row">
      <input type="color" id="tCardBgHex" value="${cardBgParsed.hex}">
      <input type="range" id="tCardBgAlpha" min="0" max="90" value="${cardBgAlphaPct}" style="flex:1;">
      <span id="tCardBgAlphaLabel" style="font-size:.78rem;color:var(--ink-soft);min-width:34px;">${cardBgAlphaPct}%</span>
    </div>
    <p class="hint">왼쪽일수록 배경이 더 비쳐요.</p>
    <label>글자색</label>
    <div class="color-row"><input type="color" id="tInk" value="${cur.ink}"></div>
    <label>제목 폰트</label>
    <select id="tFontDisplay">${FONT_DISPLAY_OPTIONS.map(f=>`<option value="${f}" ${saved.fontDisplay===f?'selected':''}>${f}</option>`).join('')}</select>
    <label>본문 폰트</label>
    <select id="tFontBody">${FONT_BODY_OPTIONS.map(f=>`<option value="${f}" ${saved.fontBody===f?'selected':''}>${f}</option>`).join('')}</select>

    <label style="margin-top:16px;">커스텀 폰트 파일로 전체 글자체 통일 (선택)</label>
    <input type="file" id="tFontUpload" accept=".ttf,.otf,font/ttf,font/otf">
    <p class="hint">올리면 제목/본문 폰트 대신 이 폰트로 통일돼요. (500KB 이하만 가능)</p>
    <label>또는, GitHub의 fonts 폴더에 직접 올린 폰트 파일명</label>
    <input type="text" id="tFontFileName" placeholder="예: ZenSerif.ttf" value="${escapeHtml(saved.customFontFile||'')}">
    <p class="hint">500KB보다 크면 fonts 폴더에 올린 뒤 파일명만 입력해주세요.</p>
    <div style="margin-top:6px;">
      <button class="btn small ghost" id="tFontClear" type="button">커스텀 폰트 해제 (기본 ZEN SERIF로)</button>
    </div>

    <div class="modal-actions">
      <button class="btn ghost" id="tReset" type="button" style="margin-right:auto;">테마 전체 초기화</button>
      <button class="btn ghost" id="c">취소</button>
      <button class="btn primary" id="s">전체 적용</button>
    </div>
  `, m=>{
    m.querySelector('#tCardBgAlpha').addEventListener('input', (e)=>{
      m.querySelector('#tCardBgAlphaLabel').textContent = `${e.target.value}%`;
    });
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#tFontClear').onclick = async ()=>{
      await metaDoc('theme').set({ customFontData:'', customFontFile:'' }, {merge:true});
      closeModal();
      toast('커스텀 폰트를 해제했어요');
    };
    m.querySelector('#tReset').onclick = async ()=>{
      const defaults = DEFAULT_THEME_BY_MODE[siteMode] || DEFAULT_THEME_BY_MODE.dark;
      try{
        // delete()는 문서를 지우는 거라, 혹시 실패하거나 그 사이 리스너가 예전
        // 값을 다시 읽어오면 화면이 순간 기본값처럼 보였다가 곧바로 예전 커스텀
        // 값으로 되돌아가버릴 수 있음. 그 대신 기본값 자체를 문서에 확실히
        // 써넣으면(set, merge 없이 통째로 교체) 이후에 리스너가 몇 번을 다시
        // 읽어와도 항상 같은 기본값이라 되돌아갈 예전 값 자체가 없음.
        await metaDoc('theme').set(defaults);
      }catch(err){
        console.error(err);
        toast('초기화 중 오류가 발생했어요. 콘솔을 확인해주세요.');
        return;
      }
      THEME_VARS.forEach(v=> document.body.style.removeProperty(v));
      document.body.style.removeProperty('--ink-rgb');
      document.body.style.removeProperty('--ink-soft');
      document.body.style.removeProperty('--font-display');
      document.body.style.removeProperty('--font-body');
      injectCustomFontFace(null);
      closeModal();
      toast('테마를 기본값으로 초기화했어요');
    };
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const cardHex = m.querySelector('#tCardBgHex').value;
      const cardAlpha = Number(m.querySelector('#tCardBgAlpha').value)/100;
      const theme = {
        rose: m.querySelector('#tRose').value,
        sage: m.querySelector('#tSage').value,
        gold: m.querySelector('#tGold').value,
        paper: m.querySelector('#tPaper').value,
        'card-bg': hexToRgba(cardHex, cardAlpha),
        'card-bg2': hexToRgba(cardHex, Math.max(0.08, +(cardAlpha*0.6).toFixed(2))),
        ink: m.querySelector('#tInk').value,
        fontDisplay: m.querySelector('#tFontDisplay').value,
        fontBody: m.querySelector('#tFontBody').value
      };
      const fontFile = m.querySelector('#tFontUpload').files[0];
      const fontFileName = m.querySelector('#tFontFileName').value.trim();
      if(fontFile){
        if(fontFile.size > CUSTOM_FONT_MAX_BYTES){
          toast('폰트 파일이 너무 커요(500KB 이하 권장). 대신 fonts 폴더에 올리고 파일명을 입력해주세요.');
          return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = '폰트 처리 중…';
        try{
          theme.customFontData = await fileToBase64(fontFile);
          theme.customFontFile = '';
        }catch(err){
          toast('폰트 파일을 읽지 못했어요');
          saveBtn.disabled = false;
          saveBtn.textContent = '전체 적용';
          return;
        }
      } else if(fontFileName){
        theme.customFontFile = fontFileName;
        theme.customFontData = '';
      }
      await metaDoc('theme').set(theme, {merge:true});
      closeModal();
      toast('테마를 적용했어요');
    };
  });
});

/* ================================================================
   콘텐츠 모듈 8종 — 각자 독립된 Firestore 문서(collection 'content')를
   구독하고, 자기 영역만 렌더링함
   ================================================================ */

/* ---------------- 1. 이미지 위젯 (가로형 슬라이드) ---------------- */

let imagesData = { items: [] };
let imgSlideIndex = 0;

/* 예전 데이터(문자열 URL 배열 / 단일 caption 필드)와 새 데이터(모서리 4개짜리 captions 객체)를
   함께 지원. 예전에 쓰던 caption은 그대로 좌하단(bl)으로 이어짐 */
function normalizeImageItem(it){
  if(typeof it === 'string') return { url: it, chunked:false, fileId:'', chunkTotal:0, captions: { tl:'', tr:'', bl:'', br:'' } };
  const c = it.captions || {};
  return {
    url: it.url || '',
    chunked: !!it.chunked, fileId: it.fileId || '', chunkTotal: it.chunkTotal || 0,
    captions: {
      tl: c.tl || '',
      tr: c.tr || '',
      bl: c.bl || it.caption || '',
      br: c.br || ''
    }
  };
}

function renderImages(){
  const box = document.getElementById('cardImages');
  const items = (imagesData.items || []).map(normalizeImageItem);
  if(items.length === 0){
    box.innerHTML = `
      ${widgetEditToggleBtnHtml('images', '사진 위젯 편집')}
      <div class="slide-empty">아직 사진이 없어요</div>
      ${editMode ? `<button class="btn small slide-add" id="imgAddBtn">+ 사진 추가</button>` : ''}
    `;
  } else {
    if(imgSlideIndex >= items.length) imgSlideIndex = 0;
    const cur = items[imgSlideIndex];
    const resolvedUrl = resolveGalleryItemUrl(cur, ()=> renderImages()) || '';
    // resolvedUrl이 아직 없을 때(청크 로딩 중) <img src="">를 그대로 넣으면, 빈 src를
    // 브라우저가 "깨진 이미지"로 처리해서 실제로는 로딩 중일 뿐인데도 이미지가
    // 아예 깨진 것처럼 보이는 그림 아이콘이 떠 버림. 그래서 그 사이에는 <img> 대신
    // 갤러리 타일과 같은 느낌의 "불러오는 중" 플레이스홀더를 보여줌
    const slideMediaHtml = resolvedUrl
      ? `<img src="${resolvedUrl}" id="slideImg" title="눌러서 크게 보기">`
      : `<div class="slide-loading">불러오는 중…</div>`;
    box.innerHTML = `
      ${widgetEditToggleBtnHtml('images', '사진 위젯 편집')}
      <div class="slide-viewport" id="slideViewport">
        ${slideMediaHtml}
        ${['tl','tr','bl','br'].map(pos=> cur.captions[pos] ? `<div class="slide-caption cap-${pos}">${escapeHtml(cur.captions[pos]).replace(/\n/g,'<br>')}</div>` : '').join('')}
        ${isWidgetOpen('images') ? `<button class="icon-btn slide-caption-btn" id="imgCaptionBtn" title="문구 편집">Aa</button>` : ''}
        ${isWidgetOpen('images') ? `<button class="icon-btn slide-del" id="imgDelBtn" title="이 사진 삭제">✕</button>` : ''}
        ${items.length>1 ? `<button class="slide-nav prev" id="imgPrev">‹</button><button class="slide-nav next" id="imgNext">›</button>` : ''}
        ${items.length>1 ? `<div class="slide-dots slide-dots-overlay">${items.map((_,i)=>`<span class="dot ${i===imgSlideIndex?'active':''}" data-dot="${i}"></span>`).join('')}</div>` : ''}
      </div>
      ${editMode ? `<button class="btn small slide-add" id="imgAddBtn">+ 사진 추가</button>` : ''}
    `;
  }
  bindImages();
}

function bindImages(){
  const box = document.getElementById('cardImages');
  const items = (imagesData.items || []).map(normalizeImageItem);
  const prev = box.querySelector('#imgPrev');
  const next = box.querySelector('#imgNext');
  if(prev) prev.onclick = ()=>{ imgSlideIndex = (imgSlideIndex - 1 + items.length) % items.length; renderImages(); };
  if(next) next.onclick = ()=>{ imgSlideIndex = (imgSlideIndex + 1) % items.length; renderImages(); };
  box.querySelectorAll('[data-dot]').forEach(d=> d.onclick = ()=>{ imgSlideIndex = Number(d.dataset.dot); renderImages(); });
  const viewport = box.querySelector('#slideViewport');
  if(viewport && items.length > 1){
    let touchStartX = 0, touchStartY = 0, touchTracking = false, touchAxis = null;
    viewport.addEventListener('touchstart', e=>{
      if(e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchTracking = true;
      touchAxis = null;
    }, { passive:true });
    viewport.addEventListener('touchmove', e=>{
      if(!touchTracking) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if(touchAxis === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)){
        touchAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      // 가로 스와이프로 판단되면 상위 갠홈 탭(board-viewport)이 함께 좌우로 넘어가지 않도록 막음
      if(touchAxis === 'x') e.preventDefault();
    }, { passive:false });
    viewport.addEventListener('touchend', e=>{
      if(!touchTracking) return;
      touchTracking = false;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5){
        e.preventDefault(); // 스와이프 뒤에 이어지는 합성 클릭이 사진을 열어버리는 것 방지
        imgSlideIndex = dx > 0 ? (imgSlideIndex - 1 + items.length) % items.length : (imgSlideIndex + 1) % items.length;
        renderImages();
      }
    });
  }
  const del = box.querySelector('#imgDelBtn');
  if(del) del.onclick = async (e)=>{
    e.stopPropagation();
    if(!(await confirmDelete('이 사진을 정말 삭제할까요?<br>되돌릴 수 없어요.'))) return;
    const arr = [...items]; deleteGalleryImageIfChunked(arr[imgSlideIndex]); arr.splice(imgSlideIndex,1);
    await docRef('images').set({items:arr}, {merge:true});
  };
  const capBtn = box.querySelector('#imgCaptionBtn');
  if(capBtn) capBtn.onclick = (e)=>{ e.stopPropagation(); openImageCaptionModal(imgSlideIndex, items); };
  const addBtn = box.querySelector('#imgAddBtn');
  if(addBtn) addBtn.onclick = openImagesAddModal;
  const img = box.querySelector('#slideImg');
  if(img){
    attachImgFallback(img);
    img.onclick = ()=>{
      openImageLightbox({
        items,
        index: imgSlideIndex,
        resolve: resolveGalleryItemUrl,
        onDelete: isWidgetOpen('images') ? async (idx)=>{
          const arr = [...items]; deleteGalleryImageIfChunked(arr[idx]); arr.splice(idx,1);
          await docRef('images').set({items:arr}, {merge:true});
        } : null
      });
    };
  }
}

function openImageCaptionModal(idx, items){
  const cur = items[idx];
  const c = cur.captions || {};
  openModal(`
    <h3>사진 위 문구</h3>
    <p class="hint">비워두면 그 자리엔 문구가 안 보여요.</p>
    <label>좌상단</label>
    <textarea id="capTL" style="min-height:50px;">${escapeHtml(c.tl||'')}</textarea>
    <label>우상단</label>
    <textarea id="capTR" style="min-height:50px;">${escapeHtml(c.tr||'')}</textarea>
    <label>좌하단</label>
    <textarea id="capBL" style="min-height:50px;">${escapeHtml(c.bl||'')}</textarea>
    <label>우하단</label>
    <textarea id="capBR" style="min-height:50px;">${escapeHtml(c.br||'')}</textarea>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">저장</button></div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const arr = [...items];
      arr[idx] = { ...cur, captions: {
        tl: m.querySelector('#capTL').value.trim(),
        tr: m.querySelector('#capTR').value.trim(),
        bl: m.querySelector('#capBL').value.trim(),
        br: m.querySelector('#capBR').value.trim()
      }};
      await docRef('images').set({items:arr}, {merge:true});
      closeModal();
    };
  });
}

function openImagesAddModal(){
  openModal(`
    <h3>사진 추가</h3>
    <label>사진 올리기 (기기에서 여러 장 선택 가능)</label>
    <input type="file" id="imgFiles" accept="image/*" multiple>
    <p class="hint">자동으로 압축해서 추가돼요.</p>
    <label>또는, 이미지 URL 직접 입력</label>
    <input type="url" id="imgUrl" placeholder="https://...">
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">추가</button></div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const files = Array.from(m.querySelector('#imgFiles').files || []);
      const url = normalizeImageUrl(m.querySelector('#imgUrl').value.trim());
      const newItems = [];
      if(files.length){
        saveBtn.disabled = true;
        for(let i=0;i<files.length;i++){
          saveBtn.textContent = `처리 중… (${i+1}/${files.length})`;
          // storeGalleryImage를 거쳐 청크로 저장(다른 갤러리들과 동일한 방식).
          // 예전엔 압축된 base64를 문서에 바로 박아넣었는데, 사진 하나가 최대
          // 480KB라 2장만 추가돼도 Firestore 문서 1MB 한도를 넘어 저장 자체가
          // 실패하는 문제가 있었음(사진 슬라이드 위젯이 사실상 사진 한두 장
          // 이상은 못 담는 상태였음).
          try{
            const compressed = await compressImageFile(files[i], 2000, 480000);
            newItems.push({ ...(await storeGalleryImage(compressed)), captions:{ tl:'', tr:'', bl:'', br:'' } });
          }
          catch(err){ toast(`"${files[i].name}" 처리 실패: ${err.message || err}`); }
          // 사진을 여러 장 연달아 압축할 때 브라우저(특히 모바일)가 메모리 정리를
          // 못 따라가면서 다음 사진 압축 품질이 낮아지는 경우가 있어, 한 장 처리
          // 후 잠깐 쉬어가며 정리할 틈을 줌
          await new Promise(r=> setTimeout(r, 0));
        }
      } else if(url){
        newItems.push({ url, caption:'' });
      } else {
        toast('사진을 선택하거나 URL을 입력해주세요');
        return;
      }
      try{
        await docRef('images').set({ items: [...(imagesData.items||[]).map(normalizeImageItem), ...newItems] }, {merge:true});
      }catch(err){
        toast(`저장하지 못했어요: ${err.message || err}`);
        saveBtn.disabled = false; saveBtn.textContent = '추가';
        return;
      }
      closeModal();
    };
  });
}

docRef('images').onSnapshot(doc=>{ imagesData = doc.exists ? doc.data() : {items:[]}; renderImages(); });

/* ---------------- 1-1. 프로필 위젯 (두 사람 프로필. AU는 맨 위 탭으로 전환, 그 안의 시점/IF는 슬라이드로 넘겨봄. 정보 항목은 IF슬라이드 공용이 아니라 각 프로필에 따로 붙음) ---------------- */

let profileData = { slides: [] };
let profileSlideIndex = 0; // 현재 선택된 AU 탭 인덱스
let profileSectionIndex = 0; // 현재 AU 안에서 보고 있는 시점/IF 슬라이드 인덱스
let profileInitializedDefault = false; // 페이지 로드 후 첫 렌더에서만 AU의 지정된 기본 시점/IF를 한 번 적용하기 위한 플래그
let profileMobileExpanded = false; // 모바일 간략보기 상태에서 "자세히 보기"를 눌러 기존 전체 위젯 모양으로 펼친 상태인지
// "사진·한마디·소개·이름"과 "정보 항목"은 예전처럼 한 모달에서 두 프로필을 같이 고치는 대신,
// 각 프로필(슬롯) 카드 자리에서 바로 펼쳐지는 인라인 패널로 따로따로 고침 — 두 슬롯을 동시에
// 열어둘 필요는 없어서 슬롯 번호(0|1) 하나만 기억해두면 됨(null이면 둘 다 안 열려있음)
let profileEditingBasicSlot = null;
let profileEditingFieldsSlot = null;
// 정보 항목 패널이 열려있는 동안의 임시(아직 저장 안 된) 항목 배열 — 슬롯별로 따로 둠
let profileFieldsDraft = { 0:null, 1:null };
// 다른 AU/시점·IF로 넘어가면 위 두 패널은 자동으로 닫아야 하므로, 마지막으로 렌더링한
// "AU:시점" 조합을 기억해뒀다가 바뀌면 초기화함(같은 조합 안에서의 재렌더링은 그대로 유지)
let profileEditingContextKey = null;

// 새 시점/IF를 만들 때 각 프로필에 기본으로 깔아주는 항목들 — 체형·성격 등 세분화된 설명을 쓰기 쉽도록 미리 틀을 마련해둠.
// "기타 설명"은 예전엔 항목마다 하나씩 붙는 부가 설명란이었는데, 이제는 그 자체로
// 다른 항목들과 똑같은 자리의 기본 항목 하나로 정리함. BWH는 키/몸무게 바로 다음 자리에 둠.
const PROFILE_FIELD_TEMPLATE = [
  { label:'나이', value:'' },
  { label:'생년월일', value:'' },
  { label:'키/몸무게', value:'' },
  { label:'BWH', value:'' },
  { label:'성격', value:'' },
  { label:'취향/취미', value:'' },
  { label:'기타 설명', value:'' },
];
function freshTemplateFields(){ return PROFILE_FIELD_TEMPLATE.map(f=>({...f})); }
// 나이·생년월일·키/몸무게·BWH처럼 정해진 자리 값을 다루는 항목은, 숫자만 입력해도
// 보기 좋게 정리되도록 라벨을 보고 자동으로 포맷을 입혀줌(글자가 섞여 있으면
// 이미 사용자가 원하는 형식대로 적은 것으로 보고 손대지 않음).
function formatProfileFieldValue(label, rawValue){
  const value = (rawValue || '').trim();
  if(!value) return '';
  const lbl = (label || '').trim();
  const digitsOnly = /^[\d\s./\-,]+$/;
  if(!digitsOnly.test(value)) return escapeHtml(value);
  const nums = value.match(/\d+/g) || [];

  if(lbl === '생년월일' && nums.length){
    let y, mo, d;
    if(nums.length === 1 && nums[0].length === 8){
      y = nums[0].slice(0,4); mo = nums[0].slice(4,6); d = nums[0].slice(6,8);
    } else if(nums.length >= 3){
      [y, mo, d] = nums;
    }
    if(y){
      const pad = n=> String(n).padStart(2,'0');
      return escapeHtml(`${y}.${d && mo ? pad(mo) : ''}${d ? '.' + pad(d) : ''}`);
    }
  }
  if(lbl === '나이' && nums.length === 1 && /^\d+$/.test(value)){
    return `${escapeHtml(value)}세`;
  }
  if(lbl === '키/몸무게' && nums.length >= 2){
    return `${escapeHtml(nums[0])}cm · ${escapeHtml(nums[1])}kg`;
  }
  if(lbl === 'BWH' && nums.length >= 3){
    return `B${escapeHtml(nums[0])} · W${escapeHtml(nums[1])} · H${escapeHtml(nums[2])}`;
  }
  return escapeHtml(value);
}
// 성격은 줄글 대신 해시태그 키워드로 보여줌 — 쉼표/슬래시/공백으로 입력한 걸 나눠서 각각 #키워드로 렌더링
function personalityHashtagsHtml(value){
  const tags = (value || '').split(/[,\/·\s]+/).map(t=> t.trim()).filter(Boolean);
  if(!tags.length) return '';
  return `<div class="pf-hashtags">${tags.map(t=> `<span class="pf-hashtag">#${escapeHtml(t)}</span>`).join('')}</div>`;
}
// 이름/한줄소개도 이제 시점/IF별로 따로 쓸 수 있음(비어 있으면 아래에서 legacy 공용값으로 자동 대체됨)
// 프로필 사진 박스는 세로로 긴 비율(3/4)로 잡아뒀지만, 사진마다 실제 비율은 다 달라서
// cover를 쓰면 여백은 안 남는 대신 위아래(또는 좌우)가 잘려 나감. "사진이 위아래로
// 잘리지 않았으면 좋겠다"는 요청으로 contain으로 바꿔서 잘리는 대신 남는 여백이
// 생기는 쪽을 택함(여백이 생기는 안쪽 아래에 한마디가 겹치면 그라데이션으로 가독성 확보).
function avatarBgSize(){
  return 'contain';
}
// 새 시점/IF의 사람별 정보 세트(항목 + 사진 + 한마디) 기본값
function freshPersonFieldSet(){ return { fields: freshTemplateFields(), avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'', name:'', role:'' }; }

function normalizeProfilePerson(p){
  p = p || {};
  // avatar는 예전 버전에서 AU 전체가 공유하던 사진의 흔적(마이그레이션용)으로만 남겨둠.
  // 화면에는 더 이상 여기서 직접 쓰지 않고, section.peopleFields[slot].avatar를 사용함.
  // bulk: "이 항목, 다른 시점/IF에도 똑같이 적용" 체크박스들의 상태. 예전엔 편집창을 열 때마다
  // 매번 기본값으로 초기화됐는데, 그러면 사용자가 체크해둔 게 다음에 열 때 도로 풀려 있어서
  // 불편했음. 이제 AU(사람 슬롯)에 영구 저장해서, 직접 바꾸기 전까진 그대로 유지되고
  // 새 시점/IF를 만들 때도 체크된 항목은 자동으로 이어받게 함.
  const b = p.bulk || {};
  return {
    name: p.name || '', role: p.role || '', avatar: p.avatar || '',
    bulk: {
      avatar: !!b.avatar,
      oneLiner: !!b.oneLiner,
      name: b.name === undefined ? true : !!b.name,
      role: b.role === undefined ? true : !!b.role,
      fields: (b.fields && typeof b.fields === 'object') ? { ...b.fields } : {}
    }
  };
}
function normalizeProfileField(f){
  f = f || {};
  // 항목은 두 종류: 일반(text, 라벨+내용)과 링크 전용(link, 라벨+URL만).
  // 링크는 이제 항목마다 따로 붙이는 게 아니라, 링크 전용 항목으로만 만들 수 있고
  // 화면에는 항상 일반 항목들 다음 맨 아래에 모아서 보여줌(렌더링 쪽에서 정렬).
  // "기타 설명"도 예전엔 항목마다 붙는 부가란이었지만, 이제 다른 항목들과 똑같은
  // 자리의 기본 항목(PROFILE_FIELD_TEMPLATE)으로 옮겨서 desc는 더 이상 쓰지 않음.
  // 예전 데이터에 desc가 남아있으면, 값이 비어있을 때 한해 desc를 값으로 이어받아 안 사라지게 함.
  if(f.type === 'link'){
    return { type:'link', label: f.label || '', link: f.link || '' };
  }
  return { type:'text', label: f.label || '', value: f.value || f.desc || '' };
}
function normalizePersonFieldSet(pf){
  // Firestore엔 배열 속 배열을 못 넣어서, 사람별 정보는 {fields:[...]} 형태의 객체로 감싸서 저장함.
  // 예전에 배열을 바로 넣었던 데이터가 있을 수도 있어 그것도 호환해줌.
  // 사진(avatar)과 한마디(oneLiner)는 시점/IF마다 따로 설정할 수 있도록 이 사람별 정보 세트에 같이 저장함.
  // 사진(avatar)이 크면 profile 문서 하나(모든 AU/시점 정보가 다 같이 들어있는 문서) 용량이
  // 금방 1MB 한도를 넘어버려서("시점/IF 추가 안 됨" 오류의 원인이었음), 이제 프로필 사진도
  // 갤러리/음악 자켓처럼 무조건 fileChunks 컬렉션에 따로 저장하고, 여기엔 참조(fileId)만 남김.
  // avatar 문자열은 외부 이미지 URL을 쓴 경우에만 값이 채워짐(그땐 짧은 문자열이라 문제없음).
  if(Array.isArray(pf)) return { fields: pf.map(normalizeProfileField), avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'', name:'', role:'' };
  pf = pf || {};
  return {
    fields: Array.isArray(pf.fields) ? pf.fields.map(normalizeProfileField) : [],
    avatar: pf.avatar || '',
    avatarChunked: !!pf.avatarChunked,
    avatarFileId: pf.avatarFileId || '',
    avatarChunkTotal: pf.avatarChunkTotal || 0,
    oneLiner: pf.oneLiner || '',
    name: pf.name || '',
    role: pf.role || ''
  };
}
function normalizeProfileSection(sec){
  sec = sec || {};
  let peopleFields;
  if(Array.isArray(sec.peopleFields)){
    peopleFields = [0,1].map(i=> normalizePersonFieldSet(sec.peopleFields[i]));
  } else if(Array.isArray(sec.fields)){
    // 이전 버전 호환: 두 프로필이 공유하던 정보를 그대로 양쪽에 복사해서 시작(이후 각자 따로 수정 가능)
    const legacy = sec.fields.map(normalizeProfileField);
    peopleFields = [
      { fields: legacy.map(f=>({...f})), avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'' },
      { fields: legacy.map(f=>({...f})), avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'' }
    ];
  } else {
    peopleFields = [{fields:[], avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:''}, {fields:[], avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:''}];
  }
  return { name: sec.name || '', desc: sec.desc || '', peopleFields };
}
function normalizeProfileSlide(s){
  s = s || {};
  const peopleRaw = Array.isArray(s.people) ? s.people : [];
  const people = [0,1].map(i=> normalizeProfilePerson(peopleRaw[i]));
  let sections = Array.isArray(s.sections) ? s.sections.map(normalizeProfileSection) : [];
  if(sections.length === 0){
    // 이전 버전(슬라이드당 항목 한 세트 / 자유 서술) 데이터 호환
    let legacyFields = Array.isArray(s.fields) ? s.fields.map(normalizeProfileField) : [];
    if(legacyFields.length === 0 && s.desc) legacyFields = [{ label:'설명', value: s.desc }];
    sections = [{ name:'', peopleFields: [
      { fields: legacyFields.map(f=>({...f})), avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'' },
      { fields: legacyFields.map(f=>({...f})), avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'' }
    ] }];
  }
  // 예전엔 사진·이름·한줄소개가 AU 전체(사람별)에서 공용이었음. 시점/IF마다 따로 쓸 수
  // 있게 구조를 바꾸면서, 아직 이 시점/IF에 값이 따로 저장돼 있지 않다면(=예전 데이터거나,
  // 방금 새로 만든 시점/IF라면) 예전 공용 값을 기본값으로 채워 넣어서 갑자기 비어 보이지
  // 않게 함. 프로필 편집 창에서 "다른 시점/IF에도 적용"을 체크하면 이 공용 값 대신
  // 각 시점/IF에 실제 값이 직접 채워짐.
  sections = sections.map(sec=> ({
    ...sec,
    peopleFields: sec.peopleFields.map((pf,i)=> ({
      ...pf,
      avatar: pf.avatarChunked ? (pf.avatar || '') : (pf.avatar || people[i].avatar || ''),
      name: pf.name || people[i].name || '',
      role: pf.role || people[i].role || ''
    }))
  }));
  // "시점"(연대기상 실제 있었던 시점들) / "IF"(가정) 구분은 시점/IF 하나하나가 아니라
  // AU 전체 단위로 일괄 적용함 — 한 AU 안에서 섞어 쓰는 경우가 드물기도 하고, 섞으면
  // 아래 슬라이드 표시(타임라인 여부)가 애매해지기 때문.
  const kind = s.kind === 'timeline' ? 'timeline' : 'if';
  // 이 AU를 눌러 들어왔을 때 처음 보여줄 시점/IF를 지정할 수 있게 함(따로 지정 안 하면 0번째 = 첫 슬라이드).
  const defaultSectionIndex = (Number.isInteger(s.defaultSectionIndex) && s.defaultSectionIndex >= 0 && s.defaultSectionIndex < sections.length)
    ? s.defaultSectionIndex : 0;
  return { label: s.label || '', desc: s.desc || '', kind, defaultSectionIndex, people, sections };
}
function cloneSlides(slides){
  return slides.map(s=> ({
    label: s.label,
    desc: s.desc || '',
    kind: s.kind === 'timeline' ? 'timeline' : 'if',
    defaultSectionIndex: Number.isInteger(s.defaultSectionIndex) ? s.defaultSectionIndex : 0,
    people: s.people.map(p=>({...p, bulk: { ...(p.bulk||{}), fields: { ...((p.bulk && p.bulk.fields) || {}) } } })),
    sections: s.sections.map(sec=> ({
      name: sec.name,
      desc: sec.desc || '',
      peopleFields: sec.peopleFields.map(pf=> ({
        fields: pf.fields.map(f=>({...f})),
        avatar: pf.avatar || '',
        avatarChunked: !!pf.avatarChunked,
        avatarFileId: pf.avatarFileId || '',
        avatarChunkTotal: pf.avatarChunkTotal || 0,
        oneLiner: pf.oneLiner || '',
        name: pf.name || '',
        role: pf.role || ''
      }))
    }))
  }));
}

// AU 제목 옆 ⓘ를 누르면 뜨는 짧은 설명 팝오버. 모달처럼 무겁게 만들지 않고,
// 버튼 바로 아래에 뜨는 작은 말풍선 하나로 처리함(입력이 없는 단순 보기용이라
// 블러/오버레이 없이 가볍게 둠). 같은 버튼을 다시 누르면 토글로 닫힘.
function closeAuDescPopover(){
  const existing = document.querySelector('.profile-au-desc-popover');
  if(existing) existing.remove();
  document.removeEventListener('click', closeAuDescPopoverOnOutsideClick, true);
}
function closeAuDescPopoverOnOutsideClick(e){
  const pop = document.querySelector('.profile-au-desc-popover');
  if(!pop) return;
  if(pop.contains(e.target) || (pop._anchor && pop._anchor.contains(e.target))) return;
  closeAuDescPopover();
}
function toggleAuDescPopover(anchorEl, text){
  const existing = document.querySelector('.profile-au-desc-popover');
  const reopening = existing && existing._anchor === anchorEl;
  closeAuDescPopover();
  if(reopening) return;
  const pop = document.createElement('div');
  pop.className = 'profile-au-desc-popover';
  pop.textContent = text;
  pop._anchor = anchorEl;
  document.body.appendChild(pop);
  const rect = anchorEl.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();
  let left = rect.left + rect.width/2 - popRect.width/2;
  left = Math.max(8, Math.min(left, window.innerWidth - popRect.width - 8));
  pop.style.left = left + 'px';
  pop.style.top = (rect.bottom + 6) + 'px';
  requestAnimationFrame(()=> pop.classList.add('show'));
  document.addEventListener('click', closeAuDescPopoverOnOutsideClick, true);
}

function renderProfile(){
  closeAuDescPopover();
  const box = document.getElementById('cardProfile');
  const slides = (profileData.slides || []).map(normalizeProfileSlide);

  if(slides.length === 0){
    box.innerHTML = `
      ${widgetEditToggleBtnHtml('profile', '프로필 위젯 편집')}
      <div class="slide-empty">아직 등록된 프로필이 없어요</div>
      ${editMode ? `<button class="btn small slide-add" id="profAddBtn">+ AU 추가</button>` : ''}
    `;
    bindProfile(slides);
    return;
  }

  if(profileSlideIndex >= slides.length) profileSlideIndex = 0;
  if(profileSlideIndex < 0) profileSlideIndex = slides.length - 1;
  const slide = slides[profileSlideIndex];
  if(!profileInitializedDefault){
    profileSectionIndex = slide.defaultSectionIndex || 0;
    profileInitializedDefault = true;
  }
  if(profileSectionIndex >= slide.sections.length) profileSectionIndex = 0;
  if(profileSectionIndex < 0) profileSectionIndex = 0;
  const section = slide.sections[profileSectionIndex];
  // 다른 AU/시점으로 넘어온 경우에만 열려있던 인라인 패널을 닫음(같은 자리에서 저장 등으로
  // 인해 다시 그려지는 경우엔 그대로 유지)
  const editingContextKey = profileSlideIndex + ':' + profileSectionIndex;
  if(profileEditingContextKey !== editingContextKey){
    profileEditingBasicSlot = null;
    profileEditingFieldsSlot = null;
    profileEditingContextKey = editingContextKey;
  }

  // 보기 전용(방문자) 모드에선 아직 값을 안 채운 항목(템플릿만 깔려있고 내용이 빈 항목)이
  // 그대로 보이면 빈 줄처럼 보여서 어색함 → 내용/기타설명/링크 중 하나도 없는 항목은 숨김.
  // 편집 모드에선 어떤 항목을 채울 수 있는지 알 수 있게 그대로 다 보여줌.
  // 나이·생년월일·키/몸무게·BWH·성격은 값 자체만 봐도 뭔지 알 수 있어서(예: "142cm · 32kg"),
  // 항목명을 따로 안 붙이고 값만 보여줌. 기타 설명은 목록 속 한 줄이 아니라 따로 떨어진
  // 박스로 보여줘서 다른 항목들과 헷갈리지 않게 함.
  const NO_LABEL_FIELDS = ['나이', '생년월일', '키/몸무게', 'BWH', '성격'];
  const fieldsHtml = (fields, slot)=>{
    const textFields = fields.filter(f=> f.type !== 'link');
    const linkFields = fields.filter(f=> f.type === 'link');
    const descField = textFields.find(f=> (f.label||'').trim() === '기타 설명');
    const listFields = textFields.filter(f=> f !== descField);
    const visibleLinks = isWidgetOpen('profile') ? linkFields : linkFields.filter(f=> f.link);

    // 나이/생년월일, 키몸무게/BWH, 성격 — 이 세 줄은 "표"처럼 사람/시점마다 자리가
    // 고정돼야 하는 항목이라, listFields 전체(값 유무·편집모드 상관없이)에서 먼저
    // 뽑아내고 남은 것들만 뒤에서 "자유 항목"으로 다룸
    const remaining = listFields.slice();
    const takeByLabel = (lbl)=>{
      const idx = remaining.findIndex(f=> (f.label||'').trim() === lbl);
      return idx === -1 ? null : remaining.splice(idx, 1)[0];
    };
    const ageField = takeByLabel('나이');
    const bdayField = takeByLabel('생년월일');
    const bodyField = takeByLabel('키/몸무게');
    const bwhField = takeByLabel('BWH');
    const personalityField = takeByLabel('성격');

    // 나이·생년월일, 키/몸무게·BWH는 각각 세로 구분선 하나로 나눠서 같은 줄에 보여줌
    // (둘 다 값이 있을 때만 한 줄로 묶고, 하나만 있으면 그 하나만 그대로 보여줌) —
    // 위젯이 위아래로 너무 길어진다는 요청에 따라 높이를 줄이기 위함.
    // PC에서는 값이 하나도 없어도 그 줄 자체는 항상 자리를 차지하게 비워서 렌더링함
    // (다른 사람/시점엔 값이 있어서 줄이 생기고 이 사람만 없어서 줄이 통째로
    // 사라지면, 그 아래 항목들 위치가 사람마다 달라져 "표"처럼 안 보였음).
    // .profile-field-empty는 모바일에서만 CSS로 다시 숨겨서(펼치기 포함) 기존
    // "빈 항목은 안 보이게" 동작을 그대로 유지함
    const pairFieldHtml = f=> `<span class="pf-value">${formatProfileFieldValue(f.label, f.value)}</span>`;
    const pairRowHtml = (a, b)=>{
      const av = a && a.value, bv = b && b.value;
      if(av && bv) return `<div class="profile-field profile-field-plain profile-field-pair">${pairFieldHtml(a)}<span class="pf-pair-divider"></span>${pairFieldHtml(b)}</div>`;
      const only = av ? a : (bv ? b : null);
      if(only) return `<div class="profile-field profile-field-plain">${pairFieldHtml(only)}</div>`;
      return `<div class="profile-field profile-field-plain profile-field-empty">&nbsp;</div>`;
    };
    const personalityRowHtml = (personalityField && personalityField.value)
      ? `<div class="profile-field profile-field-personality">${personalityHashtagsHtml(personalityField.value)}</div>`
      : `<div class="profile-field profile-field-personality profile-field-empty">&nbsp;</div>`;
    const fixedRowsHtml = pairRowHtml(ageField, bdayField) + pairRowHtml(bodyField, bwhField) + personalityRowHtml;

    // 이 뒤로 붙는 건 사람마다 자유롭게 추가한 커스텀 항목(취향/무기 등)이라 개수 자체가
    // 달라서 "표"처럼 자리를 고정할 수 없음 — 예전처럼 값 있는 것만(또는 편집모드면 전부) 보여줌
    const visibleCustom = isWidgetOpen('profile') ? remaining : remaining.filter(f=> f.value);
    const customHtml = visibleCustom.map(f=>{
      return `
        <div class="profile-field">
          <div class="pf-row">
            <span class="pf-label">${escapeHtml(f.label || '항목')}${f.label ? '：' : ''}</span>
            <span class="pf-value">${formatProfileFieldValue(f.label, f.value)}</span>
          </div>
        </div>
      `;
    }).join('');
    // 링크 전용 항목은 항목 목록 맨 아래에 따로 모아서, 버튼처럼 눌러서 여는 형태로 보여줌
    const linksHtml = visibleLinks.length ? `
        <div class="profile-links">
          ${visibleLinks.map(f=> f.link
            ? `<a class="pf-link-item" href="${escapeHtml(f.link)}" target="_blank" rel="noopener">🔗 ${escapeHtml(f.label || '링크')}</a>`
            : `<span class="pf-link-item empty-hint">🔗 ${escapeHtml(f.label || '링크')} (URL 없음)</span>`
          ).join('')}
        </div>
      ` : '';
    // 기타 설명도 나이/생년월일 등과 같은 "필수기재란" 취급 — 값이 없어도 아예
    // 사라지지 않고 자리(빈 줄)를 그대로 차지하게 함. 편집모드에선 기존처럼
    // "+ 기타 설명 추가" 안내를 보여주고, 보기 전용에서 값이 없으면 위 필드들과
    // 동일하게 profile-field-empty로 표시해서 PC에선 빈 자리 유지·모바일에선 숨김
    const descHasValue = !!(descField && descField.value);
    // 기타 설명은 칸이 작아 글자가 작게 보이므로, 값이 있으면 칸 한쪽에 확대 버튼을
    // 같이 두어 눌렀을 때 큰 창(라이트박스)으로 크게 읽을 수 있게 함. 이 버튼은
    // 편집모드에서도(칸 전체를 누르면 편집 패널이 열리는 것과 별개로) 항상 눌리도록
    // 클릭 시 이벤트 버블링을 막아서 편집 패널이 같이 열려버리지 않게 함(바인딩 쪽 처리)
    const descHtml = `
        <div class="profile-desc-box ${descHasValue ? 'has-value' : ''} ${isWidgetOpen('profile') ? (descHasValue ? '' : 'empty-hint') : (descHasValue ? '' : 'profile-field-empty')}">
          <span class="profile-desc-text">${descHasValue ? escapeHtml(descField.value) : (isWidgetOpen('profile') ? '+ 기타 설명 추가' : '&nbsp;')}</span>
          ${descHasValue ? `<button type="button" class="icon-btn profile-desc-expand" data-descexpand="${slot}" title="크게 보기" aria-label="크게 보기">⤢</button>` : ''}
        </div>
      `;
    // 나이/생년월일·키몸무게/BWH·성격까지는 항상 같은 자리(고정 표)라 위젯 높이에
    // 영향이 없지만, 그 아래 커스텀 항목(취향/무기 등)+링크+기타설명은 사람/시점마다
    // 개수·길이가 달라서 여기서 위젯 전체 높이가 들쭉날쭉해졌음. 그래서 이 아래
    // 부분만 따로 묶어 높이를 못박고(.profile-fields-scroll, CSS) 넘치면 그
    // 구역 안에서만 스크롤되게 해서, 위젯 전체 높이가 처음부터 항상 똑같게 함
    // (탭을 눌러봐야 알 수 있는 게 아니라 로드되는 순간부터 고정)
    return `<div class="profile-fields">${fixedRowsHtml}</div><div class="profile-fields-scroll">${customHtml}${linksHtml}${descHtml}</div>`;
  };

  // AU 이름은 항상 위젯 맨 위, 시점/IF 이름과는 확실히 구분되는 모양으로 고정 표시함.
  // AU가 여럿이거나 편집모드일 땐 눌러서 전환하는 탭 형태, AU가 하나뿐인 보기 모드에선
  // 탭 없이 이름표만 조용히 상단에 얹어서 보여줌 — 어느 쪽이든 세로 중앙 정렬되는
  // profile-viewport "밖"에 있어서 콘텐츠가 짧아도 아래로 처지지 않고 항상 맨 위에 붙음.
  const auDescIconHtml = (i, desc)=> desc
    ? `<button type="button" class="profile-au-desc-icon" data-audesc="${i}" title="설명 보기">ⓘ</button>`
    : '';
  const auHeaderHtml = (slides.length > 1 || isWidgetOpen('profile')) ? `
      <div class="profile-au-bar" id="profAuTabs">
        ${slides.map((s,i)=> `
          <span class="profile-section-tab ${i===profileSlideIndex?'active':''}" data-au="${i}" data-idx="${i}">
            ${escapeHtml(s.label || 'AU')}
            ${auDescIconHtml(i, s.desc)}
            ${isWidgetOpen('profile') ? `<button class="ps-edit" data-auedit="${i}" title="AU 이름 수정">✎</button>` : ''}
          </span>
        `).join('')}
        ${isWidgetOpen('profile') ? `<button class="profile-section-add" id="profAuAddBtn" title="AU 추가">＋</button>` : ''}
        ${isWidgetOpen('profile') ? `<button class="icon-btn profile-au-del" id="profAuDelBtn" title="이 AU 전체 삭제">✕</button>` : ''}
      </div>
    ` : (slide.label ? `
      <div class="profile-au-bar profile-au-bar-single">
        <span class="profile-au-name">${escapeHtml(slide.label)}${auDescIconHtml(profileSlideIndex, slide.desc)}</span>
      </div>
    ` : '');

  box.innerHTML = `
    ${widgetEditToggleBtnHtml('profile', '프로필 위젯 편집')}
    ${auHeaderHtml}
    <div class="profile-viewport" id="profileViewport">
      <div class="profile-headline" id="profileHeadline">
        <div class="profile-section-header" id="profSecHeader">
          <div class="profile-section-name ${(isWidgetOpen('profile') && !section.name) ? 'empty-hint':''}" id="profSecLabelBtn" ${isWidgetOpen('profile') ? 'title="눌러서 시점/IF 이름 수정"' : ''}>
            ${section.name ? escapeHtml(section.name) : (isWidgetOpen('profile') ? '+ 시점/IF 이름 추가 (예: 첫 만남)' : '&nbsp;')}
          </div>
          ${(slide.sections.length > 1 || isWidgetOpen('profile')) ? `
            <div class="profile-section-actions">
              ${slide.sections.length > 1 ? `<button class="icon-btn profile-section-order" id="profSecOrderBtn" title="시점/IF 목록 보기">☰</button>` : ''}
              ${isWidgetOpen('profile') ? `<button class="icon-btn profile-section-add" id="profSecAddBtn" title="시점/IF 추가">＋</button>` : ''}
              ${(isWidgetOpen('profile') && slide.sections.length > 1) ? `<button class="icon-btn profile-section-del" id="profSecDelBtn" title="이 시점/IF 삭제">✕</button>` : ''}
            </div>
          ` : ''}
        </div>
        <div class="profile-section-desc ${(isWidgetOpen('profile') && !section.desc) ? 'empty-hint':''}" id="profSecDescBtn" ${isWidgetOpen('profile') ? 'title="눌러서 시점/IF 설명 수정"' : ''}>
          ${section.desc ? escapeHtml(section.desc) : (isWidgetOpen('profile') ? '+ 짧은 설명 추가' : '&nbsp;')}
        </div>
      </div>
      <div class="profile-pair">
        ${[0,1].map(slot=>{
          const pf = section.peopleFields[slot] || { fields:[], avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'', name:'', role:'' };
          // 사진이 청크로 저장돼 있으면(대부분의 업로드 사진) 캐시에서 즉시 꺼내 쓰거나,
          // 아직 안 불러왔으면 비동기로 불러온 뒤 다 불러오면 다시 그림(갤러리 사진과 같은 방식).
          const avatar = resolveGalleryItemUrl(
            { chunked: !!pf.avatarChunked, fileId: pf.avatarFileId || '', chunkTotal: pf.avatarChunkTotal || 0, url: pf.avatar || '' },
            ()=> renderProfile()
          ) || '';
          const oneLiner = pf.oneLiner || '';
          const name = pf.name || '';
          const role = pf.role || '';
          const hasContent = name || avatar;
          const fields = pf.fields || [];
          // 모바일 간략보기에서는 성격만 함께 보여줌(나이·키/몸무게 등 나머지 항목은
          // "자세히 보기"를 눌러 기존 위젯 모양으로 펼쳤을 때만 보임)
          const personalityField = fields.find(f=> (f.label||'').trim() === '성격' && f.value);
          return `
            <div class="profile-person" data-slot="${slot}">
              <div class="profile-compact ${hasContent ? '' : 'profile-compact-empty'}">
                <div class="profile-compact-photo ${avatar ? 'has-image' : ''}" ${avatar ? `style="background-image:url('${avatar}')"` : ''}>
                  ${avatar ? '' : '👤'}
                </div>
                ${oneLiner ? `<div class="profile-compact-oneliner">“${escapeHtml(oneLiner)}”</div>` : ''}
                <div class="profile-compact-name">${escapeHtml(name || '(이름 없음)')}</div>
                ${role ? `<div class="profile-compact-role">${escapeHtml(role)}</div>` : ''}
                ${personalityField ? `<div class="profile-compact-personality">${personalityHashtagsHtml(personalityField.value)}</div>` : ''}
              </div>
              <div class="profile-full">
                <div class="profile-basic ${(isWidgetOpen('profile') && profileEditingBasicSlot!==slot) ? 'editable' : ''} ${profileEditingBasicSlot===slot ? 'editing' : ''}" data-slot="${slot}">
                  ${(isWidgetOpen('profile') && profileEditingBasicSlot===slot) ? profileBasicEditPanelHtml(
                    slot, pf,
                    (slide.people[slot] && slide.people[slot].bulk) || { avatar:false, oneLiner:false, name:true, role:true, fields:{} },
                    slide.sections.length > 1
                  ) : `
                  <div class="profile-photo">
                    <div class="profile-avatar ${avatar ? 'has-image' : ''}" ${avatar ? `style="background-image:url('${avatar}');background-size:${avatarBgSize(avatar)}"` : ''}>
                      ${avatar ? '' : '👤'}
                    </div>
                    <!-- 한마디도 나이/생년월일 등과 같은 "필수기재란" 취급 — 값이 없어도
                         자리를 그대로 차지함(편집모드가 아니면 blank 처리) -->
                    <div class="profile-oneliner ${oneLiner ? '' : (isWidgetOpen('profile') ? 'empty-hint' : 'profile-field-empty')}">${oneLiner ? '“' + escapeHtml(oneLiner) + '”' : (isWidgetOpen('profile') ? '+ 한마디 추가' : '&nbsp;')}</div>
                  </div>
                  <div class="profile-info">
                    <!-- 한줄소개(역할)도 마찬가지 — 값 없으면 통째로 사라지는 대신 자리만 비움 -->
                    <div class="profile-role ${role ? '' : (isWidgetOpen('profile') ? 'empty-hint' : 'profile-field-empty')}">${role ? escapeHtml(role) : (isWidgetOpen('profile') ? '+ 한줄소개 추가' : '&nbsp;')}</div>
                    <!-- 이름은 원래대로 복구 -->
                    <div class="profile-name">${hasContent ? escapeHtml(name || '(이름 없음)') : (isWidgetOpen('profile') ? '+ 프로필 추가' : '')}</div>
                  </div>
                  `}
                </div>
                <div class="profile-person-fields ${(isWidgetOpen('profile') && profileEditingFieldsSlot!==slot) ? 'editable' : ''} ${profileEditingFieldsSlot===slot ? 'editing' : ''}" data-fieldslot="${slot}">
                  ${(isWidgetOpen('profile') && profileEditingFieldsSlot===slot)
                    ? profileFieldsEditPanelHtml(slot, profileFieldsDraft[slot] || [], slide.sections.length > 1)
                    : fieldsHtml(fields, slot)}
                </div>
              </div>
            </div>
          `;
        }).join('<div class="profile-divider"></div>')}
      </div>
      <button class="profile-mobile-toggle" id="profileMobileToggleBtn" type="button">${profileMobileExpanded ? '간략히 보기 ▴' : '자세히 보기 ▾'}</button>
    </div>
    ${slide.sections.length > 1 ? `
      <div class="profile-slide-nav">
        <button class="icon-btn" id="profSecPrev">‹</button>
        ${slide.kind === 'timeline' ? `
          <div class="slide-dots timeline-dots">
            ${slide.sections.map((_,i)=>`<span class="dot ${i===profileSectionIndex?'active':''}" data-secdot="${i}"></span>`).join('')}
          </div>
        ` : `
          <div class="slide-dots">${slide.sections.map((_,i)=>`<span class="dot ${i===profileSectionIndex?'active':''}" data-secdot="${i}"></span>`).join('')}</div>
        `}
        <button class="icon-btn" id="profSecNext">›</button>
      </div>
    ` : ''}
  `;
  bindProfile(slides);
  if(typeof renderSpeechCard === 'function') renderSpeechCard();
}

function bindProfile(slides){
  const box = document.getElementById('cardProfile');
  box.classList.toggle('profile-mobile-expanded', profileMobileExpanded);

  // 한마디 말풍선: 본체+꼬리를 하나로 합친 모양으로 잘라냄 (렌더링된 실제 폭에
  // 맞춰 매번 다시 계산해야 하므로, 이 안에서 매 렌더링마다 새로 호출)
  box.querySelectorAll('.profile-compact-oneliner').forEach(el=>{
    shapeSpeechBubble(el, { radius:12, tailLeft:14, tailWidth:14, tailHeight:7 });
  });

  const mobileToggleBtn = box.querySelector('#profileMobileToggleBtn');
  if(mobileToggleBtn) mobileToggleBtn.onclick = ()=>{ profileMobileExpanded = !profileMobileExpanded; renderProfile(); };

  // AU 탭 전환
  box.querySelectorAll('.profile-au-bar .profile-section-tab').forEach(tab=>{
    tab.addEventListener('click', (e)=>{
      if(e.target.closest('[data-auedit]')) return;
      profileSlideIndex = Number(tab.dataset.au);
      profileSectionIndex = slides[profileSlideIndex].defaultSectionIndex || 0;
      renderProfile();
    });
  });
  box.querySelectorAll('[data-auedit]').forEach(btn=> btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    openProfileSlideModal(Number(btn.dataset.auedit), slides);
  }));
  // AU 제목 옆 ⓘ — 누르면 그 자리에 짧은 설명 팝오버가 뜸(다시 누르거나 바깥을 누르면 닫힘)
  box.querySelectorAll('[data-audesc]').forEach(btn=> btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const s = slides[Number(btn.dataset.audesc)];
    if(s && s.desc) toggleAuDescPopover(btn, s.desc);
  }));
  const auAddBtn = box.querySelector('#profAuAddBtn');
  if(auAddBtn) auAddBtn.onclick = async (e)=>{
    e.stopPropagation();
    const arr = cloneSlides(slides);
    arr.push({ label:'', kind:'if', sections:[{name:'', peopleFields:[freshPersonFieldSet(), freshPersonFieldSet()]}], people:[{name:'',role:'',avatar:''},{name:'',role:'',avatar:''}] });
    await docRef('profile').set({slides:arr}, {merge:true});
    profileSlideIndex = arr.length - 1;
    profileSectionIndex = 0;
  };
  const auDelBtn = box.querySelector('#profAuDelBtn');
  if(auDelBtn) auDelBtn.onclick = async (e)=>{
    e.stopPropagation();
    const auName = slides[profileSlideIndex] && slides[profileSlideIndex].label;
    if(!(await confirmDelete(`"${escapeHtml(auName || 'AU')}"를 정말 삭제하시겠어요?<br>이 AU에 담긴 모든 시점/IF와 정보가 함께 지워지고, 되돌릴 수 없어요.`))) return;
    const arr = [...slides]; arr.splice(profileSlideIndex,1);
    await docRef('profile').set({slides:arr}, {merge:true});
    deleteAvatarChunksInSections(slides[profileSlideIndex] && slides[profileSlideIndex].sections);
    profileSlideIndex = 0; profileSectionIndex = 0;
  };

  // 편집모드에서 드래그로 AU 탭 순서를 바꿀 수 있게 함(다른 위젯의 사진 순서 변경과
  // 동일한 방식). 지금 보고 있던 AU가 이동한 뒤에도 같은 AU가 계속 선택된 채로
  // 보이도록, 임시 표식(_dragFrom)을 붙여뒀다가 옮겨진 뒤의 새 위치를 찾아 반영함
  const auBar = box.querySelector('#profAuTabs');
  if(auBar){
    bindPinDragReorder(
      auBar, '.profile-section-tab',
      ()=> cloneSlides(slides).map((s,i)=> ({...s, _dragFrom:i})),
      async (arr)=>{
        const fromIdx = profileSlideIndex;
        const landedAt = arr.findIndex(s=> s._dragFrom === fromIdx);
        const clean = arr.map(({_dragFrom, ...rest})=> rest);
        await docRef('profile').set({slides:clean}, {merge:true});
        if(landedAt !== -1) profileSlideIndex = landedAt;
      },
      { pointerLine: true, axis: 'x', widgetKey: 'profile' }
    );
  }
  const addBtn = box.querySelector('#profAddBtn');
  if(addBtn) addBtn.onclick = async ()=>{
    const arr = [...slides, { label:'', kind:'if', sections:[{name:'', peopleFields:[freshPersonFieldSet(), freshPersonFieldSet()]}], people:[{name:'',role:'',avatar:''},{name:'',role:'',avatar:''}] }];
    await docRef('profile').set({slides:arr}, {merge:true});
    profileSlideIndex = arr.length - 1;
    profileSectionIndex = 0;
  };

  // 시점/IF 슬라이드 넘기기 (prev/next, 점, 스와이프)
  const secPrev = box.querySelector('#profSecPrev');
  const secNext = box.querySelector('#profSecNext');
  const slide = slides[profileSlideIndex];
  if(secPrev) secPrev.onclick = ()=>{ profileSectionIndex = (profileSectionIndex - 1 + slide.sections.length) % slide.sections.length; renderProfile(); };
  if(secNext) secNext.onclick = ()=>{ profileSectionIndex = (profileSectionIndex + 1) % slide.sections.length; renderProfile(); };
  box.querySelectorAll('[data-secdot]').forEach(d=> d.onclick = ()=>{ profileSectionIndex = Number(d.dataset.secdot); renderProfile(); });

  const viewport = box.querySelector('#profileViewport');
  if(viewport && slide.sections.length > 1){
    let touchStartX = 0, touchStartY = 0, touchTracking = false, touchAxis = null;
    viewport.addEventListener('touchstart', e=>{
      if(e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchTracking = true;
      touchAxis = null;
    }, { passive:true });
    viewport.addEventListener('touchmove', e=>{
      if(!touchTracking) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if(touchAxis === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)){
        touchAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if(touchAxis === 'x') e.preventDefault();
    }, { passive:false });
    viewport.addEventListener('touchend', e=>{
      if(!touchTracking) return;
      touchTracking = false;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5){
        profileSectionIndex = dx > 0 ? (profileSectionIndex - 1 + slide.sections.length) % slide.sections.length : (profileSectionIndex + 1) % slide.sections.length;
        renderProfile();
      }
    });
  }

  const secLabelBtn = box.querySelector('#profSecLabelBtn');
  if(secLabelBtn && isWidgetOpen('profile')) secLabelBtn.onclick = ()=> openProfileSectionModal(profileSlideIndex, profileSectionIndex, slides);
  const secDescBtn = box.querySelector('#profSecDescBtn');
  if(secDescBtn && isWidgetOpen('profile')) secDescBtn.onclick = ()=> openProfileSectionModal(profileSlideIndex, profileSectionIndex, slides);

  const secAddBtn = box.querySelector('#profSecAddBtn');
  if(secAddBtn) secAddBtn.onclick = (e)=>{
    e.stopPropagation();
    openProfileSectionAddModal(profileSlideIndex, slides);
  };

  // 시점/IF 순서 편집 — 전체 목록을 따로 모아 보여주는 창에서 ▲▼로 옮김
  const secOrderBtn = box.querySelector('#profSecOrderBtn');
  if(secOrderBtn) secOrderBtn.onclick = (e)=>{
    e.stopPropagation();
    openProfileSectionOrderModal(profileSlideIndex, slides);
  };

  // 지금 보고 있는 시점/IF만 삭제(AU 전체 삭제인 profAuDelBtn과는 별개) — 시점/IF가
  // 하나뿐일 땐 렌더링 단계에서 아예 버튼을 안 그려서 여기까지 오지 않음
  const secDelBtn = box.querySelector('#profSecDelBtn');
  if(secDelBtn) secDelBtn.onclick = async (e)=>{
    e.stopPropagation();
    const secName = slide.sections[profileSectionIndex] && slide.sections[profileSectionIndex].name;
    if(!(await confirmDelete(`"${escapeHtml(secName || '이 시점/IF')}"를 정말 삭제하시겠어요?<br>되돌릴 수 없어요.`))) return;
    const arr = cloneSlides(slides);
    const targetSlide = arr[profileSlideIndex];
    const removedSections = targetSlide.sections.splice(profileSectionIndex, 1);
    // 삭제된 시점/IF가 지정된 기본 시점/IF였거나 그보다 앞쪽이었다면, 나머지 항목들의
    // 인덱스가 한 칸씩 당겨진 것에 맞춰 기본 지정도 같이 보정함.
    const defIdx = targetSlide.defaultSectionIndex || 0;
    if(defIdx > profileSectionIndex) targetSlide.defaultSectionIndex = defIdx - 1;
    else if(defIdx >= targetSlide.sections.length) targetSlide.defaultSectionIndex = 0;
    await docRef('profile').set({slides:arr}, {merge:true});
    deleteAvatarChunksInSections(removedSections);
    profileSectionIndex = 0;
  };

  // 정보 항목에 링크가 달려 있으면 그 링크를 누를 땐 편집 패널 대신 링크가 바로 열리게 함
  box.querySelectorAll('.pf-link-item').forEach(a=> a.addEventListener('click', (e)=> e.stopPropagation()));

  // 기타 설명 확대 버튼 — 보기 모드/편집모드(칸을 눌러 편집 패널을 여는 동작) 상관없이
  // 항상 눌리도록, 버블링을 막아서 상위 .profile-person-fields.editable의 클릭
  // 핸들러(편집 패널 열기)로 이벤트가 넘어가지 않게 함
  box.querySelectorAll('[data-descexpand]').forEach(btn=> btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const slot = Number(btn.dataset.descexpand);
    const pf = slide.sections[profileSectionIndex].peopleFields[slot] || {};
    const descField = (pf.fields || []).find(f=> (f.label||'').trim() === '기타 설명');
    openProfileDescModal(pf.name || '', descField ? descField.value : '');
  }));

  // "사진·한마디·소개·이름"과 "정보 항목"은 예전처럼 둘 다 한 모달에서 같이 고치던 걸
  // 그대로 유지하되(그룹 자체는 안 나눔), 두 프로필(슬롯)을 한 번에 여는 대신 프로필
  // 카드 자리에서 바로 펼쳐지는 인라인 패널로 각자 따로 열고 저장할 수 있게 함.
  // 이미 펼쳐져 있는 슬롯은 패널 안 입력을 눌러도 다시 닫히지 않도록 열기 핸들러를 안 붙임.
  const section = slide.sections[profileSectionIndex];
  box.querySelectorAll('.profile-basic.editable').forEach(el=>{
    const slot = Number(el.dataset.slot);
    if(profileEditingBasicSlot === slot) return;
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      profileEditingBasicSlot = slot;
      renderProfile();
    });
  });
  box.querySelectorAll('.profile-person-fields.editable').forEach(el=>{
    const slot = Number(el.dataset.fieldslot);
    if(profileEditingFieldsSlot === slot) return;
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      const pf = section.peopleFields[slot] || { fields:[], avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'', name:'', role:'' };
      const personBulk = (slide.people[slot] && slide.people[slot].bulk) || { avatar:false, oneLiner:false, name:true, role:true, fields:{} };
      const fieldKey = (label)=> (label||'').trim().toLowerCase();
      profileFieldsDraft[slot] = (pf.fields||[]).map(f=> ({ ...f, bulk: !!personBulk.fields[fieldKey(f.label)] }));
      profileEditingFieldsSlot = slot;
      renderProfile();
    });
  });

  // 기본 정보(사진/한마디/소개/이름) 인라인 패널 바인딩
  box.querySelectorAll('.profile-basic-edit-panel').forEach(panel=>{
    const slot = Number(panel.dataset.slot);
    const avatarClearBtn = panel.querySelector('.pe-avatar-clear');
    if(avatarClearBtn) avatarClearBtn.onclick = (e)=>{
      e.stopPropagation();
      panel.dataset.avatarCleared = '1';
      panel.querySelector('.pe-avatar-preview').style.display = 'none';
      toast('저장하면 사진이 지워져요');
    };
    panel.querySelector('.pe-basic-cancel').onclick = (e)=>{
      e.stopPropagation();
      profileEditingBasicSlot = null;
      renderProfile();
    };
    panel.querySelector('.pe-basic-save').onclick = (e)=>{
      e.stopPropagation();
      saveProfileBasicSlot(slot, panel, slides);
    };
    panel.addEventListener('click', e=> e.stopPropagation());
  });

  // 정보 항목 인라인 패널 바인딩
  box.querySelectorAll('.profile-fields-edit-panel').forEach(panel=>{
    const slot = Number(panel.dataset.slot);
    const bulkNote = slide.sections.length > 1;
    const listEl = panel.querySelector('.pf-edit-list');
    const redrawList = ()=>{
      listEl.innerHTML = profileFieldsEditRowsHtml(profileFieldsDraft[slot] || [], bulkNote);
      bindFieldRows();
    };
    const bindFieldRows = ()=>{
      listEl.querySelectorAll('.pf-edit-del').forEach(btn=> btn.onclick = (e)=>{
        e.stopPropagation();
        profileFieldsDraft[slot].splice(Number(btn.dataset.idx), 1);
        redrawList();
      });
      listEl.querySelectorAll('.pf-edit-bulk').forEach(cb=> cb.addEventListener('change', ()=>{
        profileFieldsDraft[slot][Number(cb.dataset.idx)].bulk = cb.checked;
      }));
    };
    bindFieldRows();
    panel.querySelector('.pf-add-field').onclick = (e)=>{
      e.stopPropagation();
      profileFieldsDraft[slot].push({type:'text', label:'', value:'', bulk:false});
      redrawList();
    };
    panel.querySelector('.pf-add-link').onclick = (e)=>{
      e.stopPropagation();
      profileFieldsDraft[slot].push({type:'link', label:'', link:'', bulk:false});
      redrawList();
    };
    panel.querySelector('.pf-fields-cancel').onclick = (e)=>{
      e.stopPropagation();
      profileEditingFieldsSlot = null;
      profileFieldsDraft[slot] = null;
      renderProfile();
    };
    panel.querySelector('.pf-fields-save').onclick = (e)=>{
      e.stopPropagation();
      saveProfileFieldsSlot(slot, panel, slides);
    };
    panel.addEventListener('click', e=> e.stopPropagation());
  });

  if(!isWidgetOpen('profile')){
    box.querySelectorAll('.profile-avatar.has-image').forEach(av=>{
      const photoWrap = av.closest('.profile-basic');
      if(!photoWrap) return;
      const slot = Number(photoWrap.dataset.slot);
      const pf = slide.sections[profileSectionIndex].peopleFields[slot];
      const avatar = pf && (pf.avatarChunked ? chunkedImageCache.get(pf.avatarFileId) : pf.avatar);
      if(!avatar) return;
      av.style.cursor = 'pointer';
      av.addEventListener('click', (e)=>{
        e.stopPropagation();
        openImageLightbox({ items:[{url:avatar}], index:0, resolve: item=>item.url, onDelete:null });
      });
    });
  }
}

/* 예전엔 사진/한마디, 이름/한줄소개, 체형·성격 같은 세부 정보가 각각 다른 창으로
   나뉘어 있었고, 게다가 프로필 ①·②도 따로 눌러야 했음. 한동안 이걸 전부 한 창에
   합쳐뒀었는데, 창이 너무 길어진다는 의견에 따라 "사진/한마디/소개/이름"과
   "정보"를 다시 두 개의 창으로 나눔. 다만 프로필 ①·②는 계속 한 창 안에 나란히
   놓아 두 프로필을 같이 고칠 수 있게 유지함. */
// 사진·한마디·소개·이름 — 카드 자리에서 바로 펼쳐지는 인라인 패널(슬롯 하나만 다룸).
// 필드 구성 자체는 예전 모달의 한 컬럼(profile-edit-col)과 동일하게 그대로 묶어서 둠.
function profileBasicEditPanelHtml(slot, pf, personBulk, bulkNote){
  const bulkToggle = (cls, label, checked)=> bulkNote
    ? `<label class="pe-bulk-row" title="${escapeHtml(label)}을(를) 이 AU의 다른 시점/IF에도 함께 적용"><input type="checkbox" class="${cls}" ${checked ? 'checked' : ''}> 일괄적용</label>`
    : '';
  const cachedAvatar = pf.avatarChunked ? (chunkedImageCache.get(pf.avatarFileId) || '') : (pf.avatar || '');
  const hasAvatar = pf.avatarChunked || !!pf.avatar;
  return `
    <div class="profile-basic-edit-panel" data-slot="${slot}">
      <label>프로필 사진 (선택 — 배경이 투명한 PNG도 그대로 지원돼요)</label>
      <input type="file" class="pe-avatar-file" accept="image/*">
      <label style="margin-top:6px;">또는 이미지 URL</label>
      <input type="url" class="pe-avatar-url" placeholder="https://...">
      <div class="mp-modal-cover-preview pe-avatar-preview" ${hasAvatar ? '' : 'style="display:none;"'}>
        ${cachedAvatar ? `<img class="pe-avatar-preview-img" src="${cachedAvatar}" alt="">` : (hasAvatar ? `<p class="hint">현재 사진: 저장된 이미지 (용량이 커서 미리보기는 생략돼요)</p>` : '')}
        <button type="button" class="btn ghost small pe-avatar-clear">사진 지우기</button>
      </div>
      ${bulkToggle('pe-bulk-avatar', '이 사진', personBulk.avatar)}

      <label style="margin-top:10px;">사진 아래 한마디 (선택)</label>
      <input type="text" class="pe-oneliner" maxlength="60" value="${escapeHtml(pf.oneLiner)}" placeholder="예: 오늘도 좋은 하루 보내요">
      ${bulkToggle('pe-bulk-oneliner', '이 한마디', personBulk.oneLiner)}

      <label style="margin-top:10px;">한줄 소개 (선택 — 나이·역할 등)</label>
      <input type="text" class="pe-role" value="${escapeHtml(pf.role)}">
      ${bulkToggle('pe-bulk-role', '이 한줄 소개', personBulk.role)}

      <label style="margin-top:10px;">이름</label>
      <input type="text" class="pe-name" value="${escapeHtml(pf.name)}">
      ${bulkToggle('pe-bulk-name', '이 이름', personBulk.name)}

      <div class="profile-edit-panel-actions">
        <button type="button" class="btn small ghost pe-basic-cancel">취소</button>
        <button type="button" class="btn small primary pe-basic-save">저장</button>
      </div>
    </div>
  `;
}

async function saveProfileBasicSlot(slot, panel, slides){
  const slideIdx = profileSlideIndex, secIdx = profileSectionIndex;
  const slide = slides[slideIdx];
  const section = slide.sections[secIdx];
  const saveBtn = panel.querySelector('.pe-basic-save');
  saveBtn.disabled = true;
  saveBtn.textContent = '저장 중…';
  try{
    const file = panel.querySelector('.pe-avatar-file').files[0];
    const url = panel.querySelector('.pe-avatar-url').value.trim();
    const oneLiner = panel.querySelector('.pe-oneliner').value.trim();
    const name = panel.querySelector('.pe-name').value.trim();
    const role = panel.querySelector('.pe-role').value.trim();

    const bulkAvatar = !!panel.querySelector('.pe-bulk-avatar') && panel.querySelector('.pe-bulk-avatar').checked;
    const bulkOneliner = !!panel.querySelector('.pe-bulk-oneliner') && panel.querySelector('.pe-bulk-oneliner').checked;
    const bulkName = !!panel.querySelector('.pe-bulk-name') && panel.querySelector('.pe-bulk-name').checked;
    const bulkRole = !!panel.querySelector('.pe-bulk-role') && panel.querySelector('.pe-bulk-role').checked;

    const arr = cloneSlides(slides);
    const otherSecIdxs = arr[slideIdx].sections.map((_,i)=>i).filter(i=> i !== secIdx);
    const pf = section.peopleFields[slot] || { fields:[], avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'', name:'', role:'' };

    let avatar = pf.avatar || '';
    let avatarChunked = !!pf.avatarChunked;
    let avatarFileId = pf.avatarFileId || '';
    let avatarChunkTotal = pf.avatarChunkTotal || 0;
    let avatarDataUrl = null;
    const oldChunksToDelete = [];

    if(panel.dataset.avatarCleared === '1'){
      if(avatarChunked && avatarFileId) oldChunksToDelete.push({ fileId: avatarFileId, total: avatarChunkTotal });
      avatar = ''; avatarChunked = false; avatarFileId = ''; avatarChunkTotal = 0;
    }
    if(url){
      if(avatarChunked && avatarFileId) oldChunksToDelete.push({ fileId: avatarFileId, total: avatarChunkTotal });
      avatar = url; avatarChunked = false; avatarFileId = ''; avatarChunkTotal = 0;
    }
    if(file){
      saveBtn.textContent = '사진 처리 중…';
      let dataUrl;
      try{ dataUrl = await compressAvatarImageFile(file, 900, 320000); }
      catch(err){ toast(`이미지 처리 실패: ${err.message || err}`); saveBtn.disabled = false; saveBtn.textContent = '저장'; return; }
      if(avatarChunked && avatarFileId) oldChunksToDelete.push({ fileId: avatarFileId, total: avatarChunkTotal });
      saveBtn.textContent = '사진 저장 중…';
      let chunkInfo;
      try{ chunkInfo = await saveFileChunked(dataUrl); }
      catch(err){ toast('사진을 저장하지 못했어요.'); saveBtn.disabled = false; saveBtn.textContent = '저장'; return; }
      chunkedImageCache.set(chunkInfo.fileId, dataUrl);
      avatar = ''; avatarChunked = true; avatarFileId = chunkInfo.fileId; avatarChunkTotal = chunkInfo.total;
      avatarDataUrl = dataUrl;
    }

    arr[slideIdx].sections[secIdx].peopleFields[slot] = {
      ...pf, avatar, avatarChunked, avatarFileId, avatarChunkTotal, oneLiner, name, role
    };

    for(const si of otherSecIdxs){
      const targetPf = arr[slideIdx].sections[si].peopleFields[slot];
      if(bulkOneliner) targetPf.oneLiner = oneLiner;
      if(bulkName) targetPf.name = name;
      if(bulkRole) targetPf.role = role;
      if(!bulkAvatar) continue;
      if(avatarDataUrl){
        saveBtn.textContent = '사진 복제 저장 중…';
        try{
          const dup = await saveFileChunked(avatarDataUrl);
          chunkedImageCache.set(dup.fileId, avatarDataUrl);
          targetPf.avatar = ''; targetPf.avatarChunked = true; targetPf.avatarFileId = dup.fileId; targetPf.avatarChunkTotal = dup.total;
        }catch(err){ /* 복제 저장 실패해도 본 저장은 계속 진행 */ }
      } else {
        targetPf.avatar = avatar; targetPf.avatarChunked = avatarChunked; targetPf.avatarFileId = avatarFileId; targetPf.avatarChunkTotal = avatarChunkTotal;
      }
    }

    arr[slideIdx].people[slot] = {
      ...arr[slideIdx].people[slot], name, role, avatar: '',
      bulk: {
        ...(arr[slideIdx].people[slot].bulk || {}),
        avatar: bulkAvatar, oneLiner: bulkOneliner, name: bulkName, role: bulkRole
      }
    };

    saveBtn.textContent = '저장 중…';
    profileEditingBasicSlot = null;
    await docRef('profile').set({slides:arr}, {merge:true});
    oldChunksToDelete.forEach(({fileId, total})=> deleteFileChunked(fileId, total).catch(()=>{}));
  }catch(err){
    toast(`저장하지 못했어요: ${err.message || err}`);
    saveBtn.disabled = false; saveBtn.textContent = '저장';
  }
}

/* "정보" 항목(성격·나이·키/몸무게·링크 등) 인라인 패널. 사진/한마디/소개/이름은
   profileBasicEditPanelHtml 쪽에서 관리하고, 이 패널은 정보 목록만 다룸. */
function profileFieldsEditRowsHtml(list, bulkNote){
  const rowHtml = (f, i)=>{
    if(f.type === 'link'){
      return `
        <div class="pf-edit-row pf-edit-row-link" data-idx="${i}" data-type="link">
          <input type="text" class="pf-edit-label" placeholder="링크 이름 (예: 플레이리스트)" value="${escapeHtml(f.label)}">
          <input type="url" class="pf-edit-link" placeholder="링크 URL" value="${escapeHtml(f.link||'')}">
          ${bulkNote ? `
          <div class="pf-edit-row-actions">
            <label class="pe-bulk-row pf-bulk-row" title="이 링크를 이 AU의 다른 시점/IF에도 똑같이 적용"><input type="checkbox" class="pf-edit-bulk" data-idx="${i}" ${f.bulk ? 'checked' : ''}> 일괄적용</label>
            <button type="button" class="btn small danger pf-edit-del" data-idx="${i}">✕</button>
          </div>` : `<button type="button" class="btn small danger pf-edit-del" data-idx="${i}">✕</button>`}
        </div>
      `;
    }
    const isDesc = (f.label||'').trim() === '기타 설명';
    return `
      <div class="pf-edit-row ${isDesc ? 'pf-edit-row-desc' : ''}" data-idx="${i}" data-type="text">
        <input type="text" class="pf-edit-label" placeholder="항목명 (예: 키/몸무게)" value="${escapeHtml(f.label)}">
        ${isDesc
          ? `<textarea class="pf-edit-value pf-edit-value-desc" placeholder="내용">${escapeHtml(f.value)}</textarea>`
          : `<input type="text" class="pf-edit-value" placeholder="내용" value="${escapeHtml(f.value)}">`}
        ${bulkNote ? `
        <div class="pf-edit-row-actions">
          <label class="pe-bulk-row pf-bulk-row" title="이 항목을 이 AU의 다른 시점/IF에도 똑같이 적용"><input type="checkbox" class="pf-edit-bulk" data-idx="${i}" ${f.bulk ? 'checked' : ''}> 일괄적용</label>
          <button type="button" class="btn small danger pf-edit-del" data-idx="${i}">✕</button>
        </div>` : `<button type="button" class="btn small danger pf-edit-del" data-idx="${i}">✕</button>`}
      </div>
    `;
  };
  // "기타 설명"은 새 항목과 위치가 뒤섞이지 않도록 화면엔 항상 맨 아래로 고정해서 보여줌
  // (실제 배열 순서/삭제 인덱스는 그대로 유지 — 표시 순서만 바꿈)
  const descIdx = list.findIndex(f=> f.type !== 'link' && (f.label||'').trim() === '기타 설명');
  const order = list.map((_,i)=> i).filter(i=> i !== descIdx);
  if(descIdx !== -1) order.push(descIdx);
  return order.map(i=> rowHtml(list[i], i)).join('') || `<div class="w-empty">등록된 항목이 없어요</div>`;
}
function profileFieldsEditPanelHtml(slot, draftFields, bulkNote){
  return `
    <div class="profile-fields-edit-panel" data-slot="${slot}">
      <p class="hint">나이·생년월일·키/몸무게·BWH는 숫자만, 성격은 쉼표로 구분하면 해시태그로 표시돼요.</p>
      <div class="pf-edit-list">${profileFieldsEditRowsHtml(draftFields, bulkNote)}</div>
      <div class="pf-edit-add-row">
        <button type="button" class="btn small ghost pf-add-field">+ 항목 추가</button>
        <button type="button" class="btn small ghost pf-add-link">+ 링크 추가</button>
      </div>
      <div class="profile-edit-panel-actions">
        <button type="button" class="btn small ghost pf-fields-cancel">취소</button>
        <button type="button" class="btn small primary pf-fields-save">저장</button>
      </div>
    </div>
  `;
}

async function saveProfileFieldsSlot(slot, panel, slides){
  const slideIdx = profileSlideIndex, secIdx = profileSectionIndex;
  const saveBtn = panel.querySelector('.pf-fields-save');
  saveBtn.disabled = true;
  saveBtn.textContent = '저장 중…';
  try{
    const rows = Array.from(panel.querySelectorAll('.pf-edit-row'));
    const textRows = rows.filter(r=> r.dataset.type !== 'link');
    const linkRows = rows.filter(r=> r.dataset.type === 'link');
    const fields = [
      ...textRows.map(row=>({
        type:'text',
        label: row.querySelector('.pf-edit-label').value.trim(),
        value: row.querySelector('.pf-edit-value').value.trim(),
        bulk: !!row.querySelector('.pf-edit-bulk') && row.querySelector('.pf-edit-bulk').checked
      })).filter(f=> f.label || f.value),
      ...linkRows.map(row=>({
        type:'link',
        label: row.querySelector('.pf-edit-label').value.trim(),
        link: row.querySelector('.pf-edit-link').value.trim(),
        bulk: !!row.querySelector('.pf-edit-bulk') && row.querySelector('.pf-edit-bulk').checked
      })).filter(f=> f.label || f.link)
    ];

    const arr = cloneSlides(slides);
    const otherSecIdxs = arr[slideIdx].sections.map((_,i)=>i).filter(i=> i !== secIdx);
    const pf = arr[slideIdx].sections[secIdx].peopleFields[slot] || { fields:[], avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'', name:'', role:'' };

    arr[slideIdx].sections[secIdx].peopleFields[slot] = {
      ...pf, fields: fields.map(({bulk, ...f})=> f)
    };

    otherSecIdxs.forEach(si=>{
      const targetPf = arr[slideIdx].sections[si].peopleFields[slot];
      fields.forEach(f=>{
        if(!f.bulk) return;
        const existing = targetPf.fields.find(tf=> tf.label && tf.label.trim().toLowerCase() === f.label.trim().toLowerCase());
        if(f.type === 'link'){
          if(existing){ existing.type = 'link'; existing.link = f.link; delete existing.value; delete existing.desc; }
          else targetPf.fields.push({ type:'link', label: f.label, link: f.link });
        } else {
          if(existing){ existing.type = 'text'; existing.value = f.value; delete existing.link; }
          else targetPf.fields.push({ type:'text', label: f.label, value: f.value });
        }
      });
    });

    const fieldKey = (label)=> (label||'').trim().toLowerCase();
    const prevBulkFields = (arr[slideIdx].people[slot].bulk && arr[slideIdx].people[slot].bulk.fields) || {};
    const nextBulkFields = { ...prevBulkFields };
    fields.forEach(f=>{
      const key = fieldKey(f.label);
      if(key) nextBulkFields[key] = f.bulk;
    });
    arr[slideIdx].people[slot] = {
      ...arr[slideIdx].people[slot],
      bulk: { ...(arr[slideIdx].people[slot].bulk || {}), fields: nextBulkFields }
    };

    profileEditingFieldsSlot = null;
    profileFieldsDraft[slot] = null;
    await docRef('profile').set({slides:arr}, {merge:true});
  }catch(err){
    toast(`저장하지 못했어요: ${err.message || err}`);
    saveBtn.disabled = false; saveBtn.textContent = '저장';
  }
}

function openProfileSlideModal(slideIdx, slides){
  const slide = slides[slideIdx];
  const canDelete = slides.length > 1;
  openModal(`
    <h3>AU 이름</h3>
    <label>이름 (선택 — 예: 본편, 카페 AU, 학원 AU)</label>
    <input type="text" id="slLabel" value="${escapeHtml(slide.label)}" placeholder="비워두면 이름 없이 보여요">
    <label style="margin-top:10px;">설명 (선택 — 제목 옆 ⓘ를 누르면 보여요)</label>
    <textarea id="slDesc" rows="3" placeholder="이 AU에 대한 짧은 설명">${escapeHtml(slide.desc || '')}</textarea>
    <label style="margin-top:10px;">구분</label>
    <div class="sec-kind-row">
      <label class="sec-kind-opt"><input type="radio" name="slKind" value="timeline" ${slide.kind === 'timeline' ? 'checked' : ''}> 시점 (연대기 흐름)</label>
      <label class="sec-kind-opt"><input type="radio" name="slKind" value="if" ${slide.kind !== 'timeline' ? 'checked' : ''}> IF (가정)</label>
    </div>
    <p class="hint">"시점"으로 하면 타임라인 모양으로 보여요. (AU 전체에 적용)</p>
    <p class="hint">이름은 카드에서, 세부 정보는 프로필 이름 아래를 눌러 편집해요.</p>
    <div class="modal-actions">
      ${canDelete ? `<button class="btn danger" id="d" type="button">이 AU 전체 삭제</button>` : ''}
      <button class="btn ghost" id="c">취소</button>
      <button class="btn primary" id="s">저장</button>
    </div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    const delBtn = m.querySelector('#d');
    if(delBtn) delBtn.onclick = async ()=>{
      if(!(await confirmDelete(`"${escapeHtml(slide.label || 'AU')}"를 정말 삭제하시겠어요?<br>이 AU에 담긴 모든 시점/IF와 정보가 함께 지워지고, 되돌릴 수 없어요.`))) return;
      const arr = [...slides]; arr.splice(slideIdx,1);
      await docRef('profile').set({slides:arr}, {merge:true});
      deleteAvatarChunksInSections(slides[slideIdx] && slides[slideIdx].sections);
      profileSlideIndex = 0; profileSectionIndex = 0;
      closeModal();
    };
    m.querySelector('#s').onclick = async ()=>{
      const label = m.querySelector('#slLabel').value.trim();
      const desc = m.querySelector('#slDesc').value.trim();
      const kind = m.querySelector('input[name="slKind"]:checked').value === 'timeline' ? 'timeline' : 'if';
      const arr = cloneSlides(slides);
      arr[slideIdx].label = label;
      arr[slideIdx].desc = desc;
      arr[slideIdx].kind = kind;
      await docRef('profile').set({slides:arr}, {merge:true});
      closeModal();
    };
  });
}

// 시점/IF 순서 편집 — 카드 위 화살표로 하나씩 옮기는 것보다, 전체 목록을 한눈에 보면서
// ▲▼로 옮기는 게 더 직관적이라는 의견에 따라 별도 창으로 분리함. 창을 닫지 않고도
// 여러 번 옮길 수 있도록 저장할 때마다 목록을 다시 그림.
// 보기 전용(방문자) 모드에서도 이 목록 아이콘 자체는 보이게 해서, 어떤 시점/IF들이
// 있는지 한눈에 보고 원하는 항목으로 바로 이동할 수 있게 함(이땐 순서 편집은 안 되고
// 목록에서 눌러 이동만 가능).
function openProfileSectionOrderModal(slideIdx, slides){
  const workingSlides = cloneSlides(slides);
  const renderRows = ()=>{
    const secs = workingSlides[slideIdx].sections;
    const defIdx = workingSlides[slideIdx].defaultSectionIndex || 0;
    return secs.map((sec,i)=> `
      <div class="sec-order-row ${!isWidgetOpen('profile') ? 'viewonly' : ''}" data-idx="${i}">
        <span class="sec-order-idx">${i+1}</span>
        <span class="sec-order-name ${!sec.name ? 'empty-hint' : ''}">${sec.name ? escapeHtml(sec.name) : '(이름 없음)'}</span>
        ${isWidgetOpen('profile') ? `
          <button class="icon-btn sec-order-default ${i===defIdx ? 'active' : ''}" data-idx="${i}" title="${i===defIdx ? '이 AU를 열면 처음 보여지는 시점/IF예요' : '이 AU를 열었을 때 처음 보여줄 시점/IF로 지정'}">${i===defIdx ? '★' : '☆'}</button>
          <span class="sec-order-drag-handle" title="드래그해서 순서 바꾸기">⠿</span>
        ` : ''}
      </div>
    `).join('');
  };
  openModal(`
    <h3>시점/IF ${isWidgetOpen('profile') ? '순서 편집' : '목록'}</h3>
    <p class="hint">${isWidgetOpen('profile') ? '드래그로 순서를 바꾸고, ☆로 기본 시점/IF를 정해요.' : '눌러서 그 시점/IF로 바로 이동할 수 있어요.'}</p>
    <div id="secOrderList" class="sec-order-list">${renderRows()}</div>
    <div class="modal-actions">
      <button class="btn primary" id="s">닫기</button>
    </div>
  `, m=>{
    const listEl = m.querySelector('#secOrderList');
    const setDefault = async (i)=>{
      workingSlides[slideIdx].defaultSectionIndex = i;
      await docRef('profile').set({slides:workingSlides}, {merge:true});
      listEl.innerHTML = renderRows();
      bindRows();
    };
    const bindRows = ()=>{
      if(isWidgetOpen('profile')){
        listEl.querySelectorAll('.sec-order-default').forEach(btn=>{
          btn.onclick = (e)=>{ e.stopPropagation(); setDefault(Number(btn.dataset.idx)); };
        });
        // 드래그로 순서를 바꿈(다른 위젯과 동일한 방식). 옮긴 뒤에도
        // "기본으로 보여줄 시점/IF"와 "지금 보고 있는 시점/IF"가 같은 내용을 계속
        // 가리키도록, 임시 표식(_dragFrom)으로 원래 자리를 기억해뒀다가 새 자리를 찾아줌
        bindPinDragReorder(
          listEl, '.sec-order-row',
          ()=> workingSlides[slideIdx].sections.map((s,i)=> ({...s, _dragFrom:i})),
          async (arr)=>{
            const slideObj = workingSlides[slideIdx];
            const oldDefIdx = slideObj.defaultSectionIndex || 0;
            const newDefIdx = arr.findIndex(s=> s._dragFrom === oldDefIdx);
            const trackingThisSlide = profileSlideIndex === slideIdx;
            const newSectionIdx = trackingThisSlide ? arr.findIndex(s=> s._dragFrom === profileSectionIndex) : -1;
            slideObj.sections = arr.map(({_dragFrom, ...rest})=> rest);
            if(newDefIdx !== -1) slideObj.defaultSectionIndex = newDefIdx;
            await docRef('profile').set({slides:workingSlides}, {merge:true});
            if(trackingThisSlide && newSectionIdx !== -1) profileSectionIndex = newSectionIdx;
            listEl.innerHTML = renderRows();
            bindRows();
          },
          { pointerLine: true, axis: 'y', widgetKey: 'profile' }
        );
      } else {
        listEl.querySelectorAll('.sec-order-row.viewonly').forEach(row=>{
          row.onclick = ()=>{
            profileSlideIndex = slideIdx;
            profileSectionIndex = Number(row.dataset.idx);
            renderProfile();
            closeModal();
          };
        });
      }
    };
    bindRows();
    m.querySelector('#s').onclick = closeModal;
  });
}

// 새 시점/IF를 추가할 때 띄우는 창 — 바로 빈 슬라이드를 만들지 않고, 이름과 짧은
// 설명을 먼저 입력받은 뒤에 생성함. "다른 시점/IF에도 적용"으로 체크돼 있던 항목은
// 지금 보고 있는 시점/IF에서 값을 그대로 이어받아 새 시점/IF에도 채워 넣음.
function openProfileSectionAddModal(slideIdx, slides){
  openModal(`
    <h3>새 시점/IF 추가</h3>
    <label>이름 (선택 — 예: 첫 만남, 사귄 후, IF: 헤어졌다면)</label>
    <input type="text" id="secName" value="" placeholder="비워두면 이름 없이 보여요">
    <label style="margin-top:10px;">짧은 설명 (선택 — 이 시점/IF가 어떤 상황인지 한두 줄로)</label>
    <textarea id="secDesc" rows="3" placeholder="예: 두 사람이 아직 서로 어색하던 시절"></textarea>
    <p class="hint">세부 정보는 추가한 뒤 프로필 이름 아래를 눌러 편집해요.</p>
    <div class="modal-actions">
      <button class="btn ghost" id="c">취소</button>
      <button class="btn primary" id="s">추가</button>
    </div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    const saveBtn = m.querySelector('#s');
    saveBtn.onclick = async ()=>{
      const name = m.querySelector('#secName').value.trim();
      const desc = m.querySelector('#secDesc').value.trim();
      saveBtn.disabled = true; saveBtn.textContent = '추가 중…';
      const arr = cloneSlides(slides);
      const targetSlide = arr[slideIdx];
      const srcSection = targetSlide.sections[profileSectionIndex] || targetSlide.sections[0];
      // "다른 시점/IF에도 적용"으로 체크돼 있던 항목은 새 시점/IF를 만들 때도 그대로 이어받음
      // (다른 시점/IF들이 이미 서로 같은 값으로 맞춰져 있으므로, 그중 하나에서 값을 그대로 가져오면 됨)
      // 사진(avatar)은 청크로 저장돼 있어서, 여러 시점/IF가 같은 fileId를 그대로 나눠 쓰게 하면
      // 나중에 한쪽 사진만 바꾸거나 지울 때 다른 쪽 사진까지 같이 사라질 수 있음. 그래서
      // 새 시점/IF에도 사진을 그대로 복제(재업로드)해서 서로 완전히 독립적으로 만듦.
      const newPeopleFields = await Promise.all([0,1].map(async (slot)=>{
        const bulk = (targetSlide.people[slot] && targetSlide.people[slot].bulk) || { avatar:false, oneLiner:false, name:true, role:true, fields:{} };
        const src = (srcSection && srcSection.peopleFields[slot]) || { fields:[], avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'', name:'', role:'' };
        const base = freshPersonFieldSet();
        if(bulk.avatar){
          if(src.avatarChunked && src.avatarFileId){
            try{
              const dataUrl = chunkedImageCache.get(src.avatarFileId) || await loadFileChunked(src.avatarFileId, src.avatarChunkTotal);
              chunkedImageCache.set(src.avatarFileId, dataUrl);
              const dup = await saveFileChunked(dataUrl);
              chunkedImageCache.set(dup.fileId, dataUrl);
              base.avatarChunked = true; base.avatarFileId = dup.fileId; base.avatarChunkTotal = dup.total; base.avatar = '';
            }catch(err){ /* 복제 실패하면 이번 새 시점/IF는 사진 없이 시작(다른 시점/IF 사진은 안전) */ }
          } else {
            base.avatar = src.avatar || '';
          }
        }
        if(bulk.oneLiner) base.oneLiner = src.oneLiner || '';
        if(bulk.name) base.name = src.name || '';
        if(bulk.role) base.role = src.role || '';
        const key = (label)=> (label||'').trim().toLowerCase();
        base.fields = base.fields.map(f=>{
          if(!bulk.fields[key(f.label)]) return f;
          const found = (src.fields||[]).find(sf=> key(sf.label) === key(f.label));
          return found ? { ...found } : f;
        });
        (src.fields||[]).forEach(sf=>{
          if(bulk.fields[key(sf.label)] && !base.fields.find(f=> key(f.label) === key(sf.label))){
            base.fields.push({ ...sf });
          }
        });
        return base;
      }));
      targetSlide.sections.push({ name, desc, peopleFields:newPeopleFields });
      saveBtn.textContent = '저장 중…';
      try{
        // 이전엔 여기서 저장 실패(권한/네트워크 오류 등)가 조용히 씹혀서, 사용자 입장에선
        // 버튼을 눌러도 "추가가 안 되는" 것처럼 보이는 게 문제였음. 이제 실패 시 토스트로
        // 알리고 버튼을 다시 눌러볼 수 있게 원상복구함.
        await docRef('profile').set({slides:arr}, {merge:true});
      }catch(err){
        toast(`추가하지 못했어요: ${err.message || err}`);
        saveBtn.disabled = false; saveBtn.textContent = '추가';
        return;
      }
      profileSlideIndex = slideIdx;
      profileSectionIndex = arr[slideIdx].sections.length - 1;
      closeModal();
    };
  });
}

// 시점/IF 이름·설명을 고치는 창. 삭제 버튼은 이제 여기 없음 — 삭제는 카드 위
// 시점/IF 제목 옆의 ✕ 아이콘(경고 확인 포함)에서만 하도록 한곳으로 모음.
function openProfileSectionModal(slideIdx, secIdx, slides){
  const slide = slides[slideIdx];
  const section = slide.sections[secIdx];
  openModal(`
    <h3>시점/IF 이름</h3>
    <label>이름 (선택 — 예: 첫 만남, 사귄 후, IF: 헤어졌다면)</label>
    <input type="text" id="secName" value="${escapeHtml(section.name)}" placeholder="비워두면 이름 없이 보여요">
    <label style="margin-top:10px;">짧은 설명 (선택 — 이 시점/IF가 어떤 상황인지 한두 줄로)</label>
    <textarea id="secDesc" rows="3" placeholder="예: 두 사람이 아직 서로 어색하던 시절">${escapeHtml(section.desc || '')}</textarea>
    <p class="hint">세부 정보는 프로필 이름 아래를 눌러 편집해요. 삭제는 제목 옆 ✕ 버튼으로.</p>
    <div class="modal-actions">
      <button class="btn ghost" id="c">취소</button>
      <button class="btn primary" id="s">저장</button>
    </div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const name = m.querySelector('#secName').value.trim();
      const desc = m.querySelector('#secDesc').value.trim();
      const arr = cloneSlides(slides);
      arr[slideIdx].sections[secIdx].name = name;
      arr[slideIdx].sections[secIdx].desc = desc;
      await docRef('profile').set({slides:arr}, {merge:true});
      closeModal();
    };
  });
}

docRef('profile').onSnapshot(doc=>{ profileData = doc.exists ? doc.data() : {slides:[]}; renderProfile(); renderStickers(); });

/* ---------------- 2. 음악 위젯 ----------------
   플레이리스트 + 곡별 자켓 이미지(선택) + 반복재생(끄기/전체/1곡) + 연속재생(다음 곡 자동재생) 지원.
   Firestore 스냅샷은 다른 방문자가 곡을 추가/삭제해도 실시간으로 오기 때문에,
   재생 중인 오디오/유튜브 플레이어를 매번 통째로 밀어버리지 않도록 뼈대(mp-player)는
   한 번만 만들고, 이후에는 재생목록 부분만 갱신하도록 구성함(현재 재생을 방해하지 않기 위함). */

let musicData = { tracks: [] };
let mpSkeletonEditMode = null; // 뼈대를 만들었을 당시의 editMode(바뀌면 뼈대를 다시 만듦)
let mpCurrentId = null;        // 현재 선택/재생 중인 곡의 id
let mpPlaying = false;
let mpRepeatMode = 'off';      // 'off' | 'all' | 'one'
let mpContinuous = true;       // 곡이 끝나면 다음 곡을 자동으로 이어서 재생할지
let mpSeeking = false;
let mpYtPlayer = null;
let mpPollTimer = null;
let mpAutoCued = false;       // 처음 접속했을 때 첫 곡을 자동으로 띄웠는지 여부(한 번만 실행)
let mpCurrentType = null;     // 현재 재생 중인 곡의 소스 타입: 'youtube' | 'mp3'
const mpAudioCache = new Map(); // mp3 fileId -> 이미 불러온 data URL(캐시)

// 자켓 이미지(특히 움직이는 GIF)는 압축을 안 거치고 원본 그대로 저장되는데,
// 음악 문서 하나에 모든 곡 정보가 같이 들어있어서 큰 이미지를 그대로 넣으면
// 곡이 몇 개만 더 있어도 금방 Firestore 문서 1MB 한도를 넘겨버림.
// 그래서 일정 크기 이상이면 문서/PDF와 같은 방식으로 조각내어 fileChunks에
// 따로 저장하고, 곡 정보에는 fileId/조각 수만 남겨둠.
const COVER_INLINE_MAX_BYTES = 150000;               // 이 크기까지는 곡 정보 안에 바로 저장
const COVER_CHUNKED_MAX_BYTES = 8 * 1024 * 1024;     // 이보다 크면 조각으로 나눠 저장(최대 8MB)

function mpTracks(){
  return (musicData.tracks || []).map((t,i)=>({
    id: t.id || `legacy_${i}`,
    title: t.title || '(제목 없음)',
    artist: t.artist || '',
    type: t.type === 'mp3' ? 'mp3' : 'youtube',
    url: t.url || '',
    cover: t.cover || '',
    coverChunked: !!t.coverChunked,
    coverFileId: t.coverFileId || '',
    coverChunkTotal: t.coverChunkTotal || 0,
    audioUrl: t.audioUrl || '',
    chunked: !!t.chunked,
    fileId: t.fileId || '',
    chunkTotal: t.chunkTotal || 0
  }));
}

/* 곡의 자켓 이미지 URL을 가져옴. 조각 저장된(큰 GIF 등) 자켓이면 갤러리와 같은
   공용 청크 캐시/로더(chunkedImageCache, resolveGalleryItemUrl)를 그대로 재사용해서
   아직 안 불러왔으면 로딩을 시작하고 null 대신 빈 문자열을 반환하며, 다 불러오면
   onReady()로 다시 그리게 함 */
function mpResolveCoverUrl(track, onReady){
  if(!track) return '';
  if(!track.coverChunked) return track.cover || '';
  const resolved = resolveGalleryItemUrl({ chunked:true, fileId: track.coverFileId, chunkTotal: track.coverChunkTotal, url:'' }, onReady);
  return resolved || '';
}

function mpFormatTime(sec){
  if(!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec/60), s = Math.floor(sec%60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

function renderMusic(){
  const box = document.getElementById('cardMusic');
  const tracks = mpTracks();
  // 스켈레톤은 editMode 자체뿐 아니라 이 위젯의 잠금해제(isWidgetOpen) 상태가
  // 바뀔 때도(연필 버튼이 새로 생기거나, "+ 곡 추가" 버튼이 나타나거나 사라질 때) 다시 그려야 함
  const skeletonSig = editMode + ':' + isWidgetOpen('music');
  const needsSkeleton = !box.querySelector('.mp-player') || mpSkeletonEditMode !== skeletonSig;
  if(needsSkeleton){
    buildMusicSkeleton(box);
    mpSkeletonEditMode = skeletonSig;
  }
  // 재생 중이던 곡이 (다른 기기에서) 삭제됐으면 정지
  if(mpCurrentId && !tracks.find(t=>t.id===mpCurrentId)){
    mpStopPlayback();
  }
  // 접속 직후: 아직 아무 곡도 선택 안 됐다면 첫 곡을 일시정지 상태로 띄워줌 (한 번만)
  if(!mpAutoCued && !mpCurrentId && tracks.length){
    mpAutoCued = true;
    mpPlayById(tracks[0].id, false);
  }
  const current = tracks.find(t=>t.id===mpCurrentId) || null;
  updateMpMetaDisplay(current);
  renderMusicList();
  const addBtn = box.querySelector('#musicAddBtn');
  if(addBtn) addBtn.onclick = ()=> openMusicTrackModal(null);
}

function buildMusicSkeleton(box){
  box.innerHTML = `
    ${widgetEditToggleBtnHtml('music', '음악 위젯 편집')}
    <div class="mp-cover-bg" id="mpCoverBg"></div>
    <div class="mp-player">
      <div class="mp-nowplaying" id="mpNowPlaying">
        <div class="mp-meta">
          <div class="mp-title" id="mpTitle">재생할 곡을 선택해주세요</div>
          <div class="mp-artist-line">
            <div class="mp-artist" id="mpArtist"></div>
            <a class="mp-source-link" id="mpSourceLink" href="#" target="_blank" rel="noopener" title="원본 링크 열기" style="display:none;">🔗</a>
          </div>
        </div>
        <input type="range" class="mp-seek" id="mpSeek" min="0" max="1000" value="0">
        <div class="mp-times"><span id="mpCurTime">0:00</span><span id="mpDurTime">0:00</span></div>
        <div class="mp-controls">
          <button class="icon-btn mp-repeat-btn" id="mpRepeatBtn" title="반복재생"></button>
          <button class="icon-btn mp-prev-btn" id="mpPrevBtn" title="이전 곡">⏮</button>
          <button class="mp-play-btn" id="mpPlayBtn" title="재생/일시정지">▶</button>
          <button class="icon-btn mp-next-btn" id="mpNextBtn" title="다음 곡">⏭</button>
          <button class="icon-btn mp-continuous-btn" id="mpContinuousBtn" title="연속재생">➜</button>
        </div>
      </div>
      <div class="mp-side">
        <div class="player-tracks" id="mpTrackList"></div>
        ${editMode ? `<button class="btn small music-add" id="musicAddBtn">+ 곡 추가</button>` : ''}
      </div>
      <div id="mpYtHolder" style="display:none;"></div>
      <audio id="mpAudioEl" preload="metadata" style="display:none;"></audio>
    </div>
  `;
  bindMusicSkeleton(box);
  updateRepeatBtnUI();
  updateContinuousBtnUI();
  setPlayButtonUI(false);
}

function bindMusicSkeleton(box){
  const seek = box.querySelector('#mpSeek');
  seek.addEventListener('input', ()=>{ mpSeeking = true; });
  seek.addEventListener('change', mpOnSeekChange);
  box.querySelector('#mpPlayBtn').onclick = mpTogglePlayPause;
  box.querySelector('#mpPrevBtn').onclick = mpPrev;
  box.querySelector('#mpNextBtn').onclick = mpNext;
  box.querySelector('#mpRepeatBtn').onclick = mpCycleRepeat;
  box.querySelector('#mpContinuousBtn').onclick = mpToggleContinuous;
  const audioEl = box.querySelector('#mpAudioEl');
  if(audioEl){
    audioEl.addEventListener('timeupdate', ()=>{
      if(mpCurrentType === 'mp3') updateSeekUI(audioEl.currentTime, audioEl.duration || 0);
    });
    audioEl.addEventListener('loadedmetadata', ()=>{
      if(mpCurrentType === 'mp3') updateSeekUI(audioEl.currentTime, audioEl.duration || 0);
    });
    audioEl.addEventListener('play', ()=>{ if(mpCurrentType === 'mp3'){ mpPlaying = true; setPlayButtonUI(true); } });
    audioEl.addEventListener('pause', ()=>{ if(mpCurrentType === 'mp3'){ mpPlaying = false; setPlayButtonUI(false); } });
    audioEl.addEventListener('ended', ()=>{ if(mpCurrentType === 'mp3'){ mpPlaying = false; setPlayButtonUI(false); handleTrackEnded(); } });
  }
}

function renderMusicList(){
  const listEl = document.getElementById('mpTrackList');
  if(!listEl) return;
  const tracks = mpTracks();
  listEl.innerHTML = tracks.length ? tracks.map((t,i)=>{
    const thumbUrl = mpResolveCoverUrl(t, renderMusicList);
    return `
    <div class="player-track mp-track-row ${t.id===mpCurrentId?'active':''}" data-id="${t.id}" data-idx="${i}">
      <div class="mp-track-thumb" ${thumbUrl ? `style="background-image:url('${thumbUrl}')"` : ''}>${thumbUrl ? '' : '♪'}</div>
      <div class="mp-track-info">
        <div class="mp-track-title">${escapeHtml(t.title)}</div>
        ${t.artist ? `<div class="mp-track-artist">${escapeHtml(t.artist)}</div>` : ''}
      </div>
      ${(t.type === 'youtube' && t.url) ? `<a class="icon-btn mp-track-linkout" href="${escapeHtml(t.url)}" target="_blank" rel="noopener" title="원본 링크 열기" style="width:22px;height:22px;font-size:.6rem;">🔗</a>` : ''}
      ${isWidgetOpen('music') ? `<span class="mp-track-drag-handle" title="드래그해서 순서 바꾸기">⠿</span>` : ''}
      ${isWidgetOpen('music') ? `<button class="icon-btn" data-edit="${t.id}" title="수정" style="width:22px;height:22px;font-size:.6rem;">✎</button>` : ''}
      ${isWidgetOpen('music') ? `<button class="icon-btn" data-del="${t.id}" title="삭제" style="width:22px;height:22px;font-size:.6rem;">✕</button>` : ''}
    </div>
  `;
  }).join('') : `<div class="w-empty">등록된 곡이 없어요</div>`;
  listEl.querySelectorAll('[data-id]').forEach(row=>{
    row.addEventListener('click', (e)=>{
      if(e.target.closest('[data-edit]') || e.target.closest('[data-del]') || e.target.closest('.mp-track-drag-handle') || e.target.closest('.mp-track-linkout')) return;
      mpPlayById(row.dataset.id, true);
    });
  });
  // 링크로 올라온(유튜브) 곡의 🔗 버튼은 원본 링크를 새 탭으로 바로 여는 용도라,
  // 눌렀을 때 그 줄이 재생되거나(위 클릭 핸들러) 드래그 정렬이 같이 걸리지 않게 막음
  listEl.querySelectorAll('.mp-track-linkout').forEach(a=> a.addEventListener('click', e=> e.stopPropagation()));
  listEl.querySelectorAll('[data-edit]').forEach(btn=> btn.addEventListener('click', e=>{
    e.stopPropagation();
    const t = tracks.find(x=>x.id===btn.dataset.edit);
    if(t) openMusicTrackModal(t);
  }));
  listEl.querySelectorAll('[data-del]').forEach(btn=> btn.addEventListener('click', async e=>{
    e.stopPropagation();
    const t = tracks.find(x=>x.id===btn.dataset.del);
    if(!(await confirmDelete(`"${escapeHtml(t && t.title || '이 곡')}"을 정말 삭제할까요?`))) return;
    await mpDeleteTrack(btn.dataset.del);
  }));
  // 편집모드에서 드래그로 재생목록 순서를 바꿀 수 있게 함(다른 위젯의 사진 순서 변경과 동일한 방식)
  bindPinDragReorder(
    listEl, '.mp-track-row',
    ()=> (musicData.tracks || []).slice(),
    async (arr)=> docRef('music').set({tracks:arr}, {merge:true}),
    { pointerLine: true, axis: 'y' }
  );
}

function updateMpMetaDisplay(track){
  const bg = document.getElementById('mpCoverBg');
  const titleEl = document.getElementById('mpTitle');
  const artistEl = document.getElementById('mpArtist');
  const linkEl = document.getElementById('mpSourceLink');
  if(!bg) return;
  const coverUrl = track ? mpResolveCoverUrl(track, ()=> updateMpMetaDisplay(track)) : '';
  if(coverUrl){
    bg.style.backgroundImage = `url('${coverUrl}')`;
    bg.classList.add('has-cover');
  } else {
    bg.style.backgroundImage = '';
    bg.classList.remove('has-cover');
  }
  if(titleEl) titleEl.textContent = track ? track.title : '재생할 곡을 선택해주세요';
  if(artistEl) artistEl.textContent = track ? (track.artist || '') : '';
  // 링크(유튜브)로 올라온 곡일 때만, 지금 재생 중인 곡의 원본 링크로 바로 이동할 수
  // 있는 버튼을 보여줌 — href는 DOM 속성으로 직접 지정하므로 별도 escape가 필요 없음
  if(linkEl){
    if(track && track.type === 'youtube' && track.url){
      linkEl.href = track.url;
      linkEl.style.display = '';
    } else {
      linkEl.removeAttribute('href');
      linkEl.style.display = 'none';
    }
  }
}

function setPlayButtonUI(playing){
  const btn = document.getElementById('mpPlayBtn');
  if(btn) btn.textContent = playing ? '❚❚' : '▶';
}

function updateSeekUI(current, duration){
  const seek = document.getElementById('mpSeek');
  const curEl = document.getElementById('mpCurTime');
  const durEl = document.getElementById('mpDurTime');
  if(!seek) return;
  if(!mpSeeking){
    seek.value = duration > 0 ? Math.round((current/duration) * 1000) : 0;
  }
  if(curEl) curEl.textContent = mpFormatTime(current);
  if(durEl) durEl.textContent = mpFormatTime(duration);
}

const MP_REPEAT_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
const MP_REPEAT_ONE_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><line x1="11" y1="10" x2="11" y2="16"/><line x1="9.3" y1="11.3" x2="11" y2="10"/></svg>`;

function updateRepeatBtnUI(){
  const btn = document.getElementById('mpRepeatBtn');
  if(!btn) return;
  btn.innerHTML = mpRepeatMode === 'one' ? MP_REPEAT_ONE_SVG : MP_REPEAT_SVG;
  btn.classList.toggle('active', mpRepeatMode !== 'off');
  btn.title = mpRepeatMode === 'off' ? '반복재생: 꺼짐 (누르면 전체 반복)'
    : mpRepeatMode === 'all' ? '반복재생: 전체 반복 중 (누르면 1곡 반복)'
    : '반복재생: 1곡 반복 중 (누르면 끄기)';
}

function updateContinuousBtnUI(){
  const btn = document.getElementById('mpContinuousBtn');
  if(!btn) return;
  btn.classList.toggle('active', mpContinuous);
  btn.title = mpContinuous ? '연속재생: 켜짐 (곡이 끝나면 다음 곡 자동 재생, 누르면 끄기)'
    : '연속재생: 꺼짐 (곡이 끝나면 정지, 누르면 켜기)';
}

function mpCycleRepeat(){
  mpRepeatMode = mpRepeatMode === 'off' ? 'all' : mpRepeatMode === 'all' ? 'one' : 'off';
  updateRepeatBtnUI();
}

function mpToggleContinuous(){
  mpContinuous = !mpContinuous;
  updateContinuousBtnUI();
}

function destroyMpPollTimer(){
  if(mpPollTimer){ clearInterval(mpPollTimer); mpPollTimer = null; }
}

function ensureYtApi(cb){
  if(window.YT && window.YT.Player){ cb(); return; }
  if(!window._mpYtCallbacks) window._mpYtCallbacks = [];
  window._mpYtCallbacks.push(cb);
  if(!document.getElementById('ytIframeApiScript')){
    const tag = document.createElement('script');
    tag.id = 'ytIframeApiScript';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = function(){
      (window._mpYtCallbacks || []).forEach(fn=>fn());
      window._mpYtCallbacks = [];
    };
  }
}

function onYtStateChange(e){
  if(!window.YT || mpCurrentType !== 'youtube') return;
  if(e.data === YT.PlayerState.PLAYING){ mpPlaying = true; setPlayButtonUI(true); }
  else if(e.data === YT.PlayerState.PAUSED){ mpPlaying = false; setPlayButtonUI(false); }
  else if(e.data === YT.PlayerState.ENDED){ mpPlaying = false; setPlayButtonUI(false); handleTrackEnded(); }
}

function mpPauseAllMedia(){
  if(mpYtPlayer){ try{ mpYtPlayer.pauseVideo(); }catch(e){} }
  const audioEl = document.getElementById('mpAudioEl');
  if(audioEl){ try{ audioEl.pause(); }catch(e){} }
  destroyMpPollTimer();
}

async function mpResolveMp3Src(track){
  if(track.chunked){
    if(mpAudioCache.has(track.fileId)) return mpAudioCache.get(track.fileId);
    const dataUrl = await loadFileChunked(track.fileId, track.chunkTotal);
    mpAudioCache.set(track.fileId, dataUrl);
    return dataUrl;
  }
  return track.audioUrl || '';
}

async function mpPlayMp3(track, autoplay){
  const audioEl = document.getElementById('mpAudioEl');
  if(!audioEl) return;
  let src;
  try{ src = await mpResolveMp3Src(track); }
  catch(e){ toast('음원을 불러오지 못했어요'); return; }
  if(mpCurrentId !== track.id) return; // 불러오는 동안 다른 곡으로 바뀌었으면 무시
  if(!src){ toast('mp3 음원을 찾을 수 없어요. 곡 정보를 수정해주세요.'); return; }
  audioEl.src = src;
  audioEl.currentTime = 0;
  if(autoplay){ audioEl.play().catch(()=>{}); }
  else { mpPlaying = false; setPlayButtonUI(false); }
}

function mpPlayById(id, autoplay=true){
  const tracks = mpTracks();
  const track = tracks.find(t=>t.id===id);
  if(!track) return;
  if(track.type === 'mp3'){
    if(!track.chunked && !track.audioUrl){ toast('mp3 음원이 없어요. 곡 정보를 수정해주세요.'); return; }
    mpPauseAllMedia();
    mpCurrentId = id;
    mpCurrentType = 'mp3';
    mpPlaying = false;
    setPlayButtonUI(false);
    updateMpMetaDisplay(track);
    renderMusicList();
    mpPlayMp3(track, autoplay);
    return;
  }
  const ytId = extractYouTubeId(track.url);
  if(!ytId){ toast('유튜브 링크가 아니에요. 곡 정보를 수정해주세요.'); return; }
  mpPauseAllMedia();
  mpCurrentId = id;
  mpCurrentType = 'youtube';
  destroyMpPollTimer();
  const ytHolder = document.getElementById('mpYtHolder');
  ytHolder.style.display = 'block';
  ensureYtApi(()=>{
    if(mpYtPlayer && mpYtPlayer.loadVideoById){
      try{ if(autoplay) mpYtPlayer.loadVideoById(ytId); else mpYtPlayer.cueVideoById(ytId); }catch(e){}
    } else {
      ytHolder.innerHTML = '<div id="mpYtInner"></div>';
      mpYtPlayer = new YT.Player('mpYtInner', {
        height: '1', width: '1',
        videoId: ytId,
        playerVars: { autoplay: autoplay ? 1 : 0, playsinline: 1 },
        events: {
          onReady: ()=>{ if(autoplay){ try{ mpYtPlayer.playVideo(); }catch(e){} } },
          onStateChange: onYtStateChange
        }
      });
    }
    destroyMpPollTimer();
    mpPollTimer = setInterval(()=>{
      if(!mpYtPlayer || !mpYtPlayer.getCurrentTime) return;
      try{ updateSeekUI(mpYtPlayer.getCurrentTime(), mpYtPlayer.getDuration()); }catch(e){}
    }, 500);
  });
  mpPlaying = autoplay;
  setPlayButtonUI(mpPlaying);
  updateMpMetaDisplay(track);
  renderMusicList();
}

function mpStopPlayback(){
  mpCurrentId = null;
  mpCurrentType = null;
  mpPlaying = false;
  if(mpYtPlayer){ try{ mpYtPlayer.stopVideo(); }catch(e){} }
  const audioEl = document.getElementById('mpAudioEl');
  if(audioEl){ try{ audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); }catch(e){} }
  destroyMpPollTimer();
  setPlayButtonUI(false);
}

function mpTogglePlayPause(){
  const tracks = mpTracks();
  if(!mpCurrentId){
    if(tracks.length) mpPlayById(tracks[0].id, true);
    return;
  }
  if(mpCurrentType === 'mp3'){
    const audioEl = document.getElementById('mpAudioEl');
    if(!audioEl) return;
    if(mpPlaying){ audioEl.pause(); } else { audioEl.play().catch(()=>{}); }
    return;
  }
  if(!mpYtPlayer) return;
  if(mpPlaying){ mpYtPlayer.pauseVideo(); } else { mpYtPlayer.playVideo(); }
}

function mpPrev(){
  const tracks = mpTracks(); if(!tracks.length) return;
  let idx = tracks.findIndex(t=>t.id===mpCurrentId);
  idx = idx === -1 ? 0 : (idx - 1 + tracks.length) % tracks.length;
  mpPlayById(tracks[idx].id, true);
}

function mpNext(){
  const tracks = mpTracks(); if(!tracks.length) return;
  let idx = tracks.findIndex(t=>t.id===mpCurrentId);
  idx = idx === -1 ? 0 : (idx + 1) % tracks.length;
  mpPlayById(tracks[idx].id, true);
}

function mpOnSeekChange(){
  mpSeeking = false;
  const seek = document.getElementById('mpSeek');
  if(!mpCurrentId || !seek) return;
  const frac = Number(seek.value) / 1000;
  if(mpCurrentType === 'mp3'){
    const audioEl = document.getElementById('mpAudioEl');
    if(!audioEl || !isFinite(audioEl.duration)) return;
    try{ audioEl.currentTime = audioEl.duration * frac; }catch(e){}
    return;
  }
  if(!mpYtPlayer || !mpYtPlayer.getDuration) return;
  const dur = mpYtPlayer.getDuration() || 0;
  try{ mpYtPlayer.seekTo(dur * frac, true); }catch(e){}
}

function handleTrackEnded(){
  const tracks = mpTracks();
  if(!tracks.length) return;
  if(mpRepeatMode === 'one'){ mpPlayById(mpCurrentId, true); return; }
  if(mpContinuous){
    const idx = tracks.findIndex(t=>t.id===mpCurrentId);
    let nextIdx = idx + 1;
    if(nextIdx >= tracks.length){
      if(mpRepeatMode === 'all'){ nextIdx = 0; }
      else { mpPlaying = false; setPlayButtonUI(false); return; }
    }
    mpPlayById(tracks[nextIdx].id, true);
  } else {
    mpPlaying = false; setPlayButtonUI(false);
  }
}

async function mpUpdateTrack(id, patch){
  const tracks = mpTracks();
  const idx = tracks.findIndex(t=>t.id===id);
  if(idx === -1) return;
  const updated = [...tracks];
  updated[idx] = { ...updated[idx], ...patch };
  await docRef('music').set({ tracks: updated }, {merge:true});
}

async function mpDeleteTrack(id){
  const target = mpTracks().find(t=>t.id===id);
  const tracks = mpTracks().filter(t=>t.id!==id);
  await docRef('music').set({ tracks }, {merge:true});
  if(mpCurrentId === id) mpStopPlayback();
  if(target && target.chunked && target.fileId){
    deleteFileChunked(target.fileId, target.chunkTotal).catch(()=>{});
  }
  if(target && target.coverChunked && target.coverFileId){
    deleteFileChunked(target.coverFileId, target.coverChunkTotal).catch(()=>{});
  }
}

function openMusicTrackModal(existing){
  const isEdit = !!existing;
  const currentSourceDesc = !isEdit ? '' : (existing.type === 'mp3'
    ? (existing.chunked ? 'mp3 파일 (예전에 올린 파일, 자동 분할 저장됨)' : 'mp3 파일 또는 링크 (저장됨)')
    : '유튜브 링크');
  openModal(`
    <h3>${isEdit ? '곡 수정' : '곡 추가'}</h3>
    <label>곡 제목</label><input type="text" id="mTitle" value="${isEdit ? escapeHtml(existing.title) : ''}">
    <label>아티스트 (선택)</label><input type="text" id="mArtist" value="${isEdit ? escapeHtml(existing.artist||'') : ''}">
    ${isEdit ? `<p class="hint">현재 음원: ${currentSourceDesc}</p>` : ''}
    <div class="radio-row">
      ${isEdit ? `<label><input type="radio" name="music-src" value="keep" checked> 그대로 유지</label>` : ''}
      <label><input type="radio" name="music-src" value="youtube" ${!isEdit ? 'checked' : ''}> 유튜브 링크</label>
      <label><input type="radio" name="music-src" value="mp3link"> mp3 링크(직링크)</label>
    </div>
    <div id="mYoutubeWrap" style="display:${isEdit ? 'none' : ''}">
      <label>유튜브 링크</label><input type="url" id="mUrl" value="${isEdit && existing.type!=='mp3' ? escapeHtml(existing.url||'') : ''}" placeholder="https://youtu.be/... 또는 https://www.youtube.com/watch?v=...">
    </div>
    <div id="mMp3LinkWrap" style="display:none">
      <label>mp3 직링크</label><input type="url" id="mMp3Link" placeholder="https://.../song.mp3">
      <p class="hint">바로 재생되는 mp3 주소만 가능해요. (구글드라이브 등 공유 링크는 대부분 안 돼요)</p>
    </div>
    <label style="margin-top:6px;">자켓 이미지 (선택 — 비워두면 투명하게 보여요, 움직이는 GIF도 가능)</label>
    <input type="file" id="mCoverFile" accept="image/*">
    <p class="hint">GIF는 최대 ${Math.round(COVER_CHUNKED_MAX_BYTES/1024/1024)}MB까지 가능해요.</p>
    <label style="margin-top:6px;">또는 이미지 URL</label>
    <input type="url" id="mCoverUrl" placeholder="https://...">
    ${isEdit && (existing.cover || existing.coverChunked) ? `<div class="mp-modal-cover-preview" id="mCoverPreviewWrap">${existing.cover ? `<img src="${existing.cover}" alt="">` : `<p class="hint">현재 자켓: 저장된 이미지</p>`}<button type="button" class="btn ghost small" id="mCoverClear">이미지 지우기</button></div>` : ''}
    <div class="modal-actions">
      <button class="btn ghost" id="c">취소</button>
      <button class="btn primary" id="s">${isEdit ? '저장' : '추가'}</button>
    </div>
  `, m=>{
    let coverCleared = false;
    const clearBtn = m.querySelector('#mCoverClear');
    if(clearBtn) clearBtn.onclick = ()=>{
      coverCleared = true;
      const wrap = m.querySelector('#mCoverPreviewWrap');
      if(wrap) wrap.style.display = 'none';
      toast('저장하면 자켓 이미지가 지워져요');
    };
    m.querySelectorAll('input[name="music-src"]').forEach(r=> r.addEventListener('change', ()=>{
      const val = m.querySelector('input[name="music-src"]:checked').value;
      m.querySelector('#mYoutubeWrap').style.display = val === 'youtube' ? '' : 'none';
      m.querySelector('#mMp3LinkWrap').style.display = val === 'mp3link' ? '' : 'none';
    }));
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const resetBtn = ()=>{ saveBtn.disabled = false; saveBtn.textContent = isEdit ? '저장' : '추가'; };
      const title = m.querySelector('#mTitle').value.trim();
      const artist = m.querySelector('#mArtist').value.trim();
      if(!title){ toast('곡 제목을 입력해주세요'); return; }
      const mode = m.querySelector('input[name="music-src"]:checked').value;

      // 자켓 이미지 처리 (공통) — 용량이 크면(주로 움짤 GIF) 음악 문서 안에 바로 넣지 않고
      // 문서/PDF와 같은 방식으로 조각내어 별도 저장함(음악 문서 하나에 모든 곡이 같이
      // 들어있어서, 큰 이미지를 그대로 넣으면 곡이 몇 개만 있어도 1MB 한도를 넘기기 때문)
      const coverFile = m.querySelector('#mCoverFile').files[0];
      const coverUrl = m.querySelector('#mCoverUrl').value.trim();
      let cover = isEdit ? (existing.cover || '') : '';
      let coverChunked = isEdit ? !!existing.coverChunked : false;
      let coverFileId = isEdit ? (existing.coverFileId || '') : '';
      let coverChunkTotal = isEdit ? (existing.coverChunkTotal || 0) : 0;
      let oldCoverChunkToDelete = null;

      if(coverCleared){
        if(coverChunked) oldCoverChunkToDelete = { fileId: coverFileId, total: coverChunkTotal };
        cover = ''; coverChunked = false; coverFileId = ''; coverChunkTotal = 0;
      }
      if(coverUrl){
        if(coverChunked) oldCoverChunkToDelete = { fileId: coverFileId, total: coverChunkTotal };
        cover = coverUrl; coverChunked = false; coverFileId = ''; coverChunkTotal = 0;
      }
      if(coverFile){
        saveBtn.disabled = true; saveBtn.textContent = '이미지 처리 중…';
        let dataUrl;
        // 자켓 이미지는 위젯 배경 전체를 채우도록 크게 쓰이는 경우가 많아서, 다른
        // 썸네일류(800px/180KB)보다 해상도·용량 여유를 훨씬 넉넉히 줌 — 150KB(인라인
        // 한도)를 넘는 경우가 흔해지지만, 이미 위에서 자동으로 조각 저장(chunked)
        // 처리되므로 저장 방식은 그대로 안전함.
        try{ dataUrl = await compressImageFile(coverFile, 1400, 450000, COVER_CHUNKED_MAX_BYTES); }
        catch(err){ toast(`이미지 처리 실패: ${err.message || err}`); resetBtn(); return; }
        if(coverChunked) oldCoverChunkToDelete = { fileId: coverFileId, total: coverChunkTotal };
        if(dataUrl.length > COVER_INLINE_MAX_BYTES){
          saveBtn.textContent = '이미지 저장 중…';
          let chunkInfo;
          try{ chunkInfo = await saveFileChunked(dataUrl); }
          catch(err){ toast('이미지를 저장하지 못했어요.'); resetBtn(); return; }
          cover = ''; coverChunked = true; coverFileId = chunkInfo.fileId; coverChunkTotal = chunkInfo.total;
        } else {
          cover = dataUrl; coverChunked = false; coverFileId = ''; coverChunkTotal = 0;
        }
      }

      // 음원 소스 처리
      let patch = null;
      let oldChunkToDelete = null;

      if(mode === 'keep'){
        patch = { type: existing.type || 'youtube', url: existing.url || '', audioUrl: existing.audioUrl || '', chunked: !!existing.chunked, fileId: existing.fileId || '', chunkTotal: existing.chunkTotal || 0 };
      } else if(mode === 'youtube'){
        const url = m.querySelector('#mUrl').value.trim();
        if(!url || !extractYouTubeId(url)){ toast('유튜브 링크를 정확히 입력해주세요.'); resetBtn(); return; }
        if(isEdit && existing.chunked) oldChunkToDelete = { fileId: existing.fileId, total: existing.chunkTotal };
        patch = { type: 'youtube', url, audioUrl: '', chunked: false, fileId: '', chunkTotal: 0 };
      } else if(mode === 'mp3link'){
        const link = m.querySelector('#mMp3Link').value.trim();
        if(!link){ toast('mp3 링크를 입력해주세요.'); return; }
        if(isEdit && existing.chunked) oldChunkToDelete = { fileId: existing.fileId, total: existing.chunkTotal };
        patch = { type:'mp3', url:'', audioUrl: link, chunked:false, fileId:'', chunkTotal:0 };
      }

      saveBtn.disabled = true;
      saveBtn.textContent = isEdit ? '저장 중…' : '추가 중…';
      try{
        if(isEdit){
          await mpUpdateTrack(existing.id, { title, artist, cover, coverChunked, coverFileId, coverChunkTotal, ...patch });
        } else {
          await docRef('music').set({ tracks: [...mpTracks(), { id: uid(), title, artist, cover, coverChunked, coverFileId, coverChunkTotal, ...patch }] }, {merge:true});
        }
      }catch(err){
        toast(`저장하지 못했어요: ${err.message || err}`);
        resetBtn();
        return;
      }
      if(oldChunkToDelete && oldChunkToDelete.fileId) deleteFileChunked(oldChunkToDelete.fileId, oldChunkToDelete.total).catch(()=>{});
      if(oldCoverChunkToDelete && oldCoverChunkToDelete.fileId) deleteFileChunked(oldCoverChunkToDelete.fileId, oldCoverChunkToDelete.total).catch(()=>{});
      closeModal();
    };
  });
}

docRef('music').onSnapshot(doc=>{ musicData = doc.exists ? doc.data() : {tracks:[]}; renderMusic(); });

/* ---------------- 3. 디데이 ---------------- */

let ddayData = { items: [] };

function ddayDiffText(dateStr){
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr+'T00:00:00');
  const diff = Math.round((target - today) / 86400000);
  if(diff === 0) return 'D-DAY';
  return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
}

function ddayDateText(dateStr){
  const [y,m,d] = dateStr.split('-');
  // 연도와 월.일을 별개 span으로 나눠서, 좁은 화면(모바일)에서는 CSS로 이 사이를
  // 줄바꿈해 두 줄로("2026" / "08.09") 접히게 하고, 넓은 화면에선 평소처럼
  // "2026.08.09" 한 줄로 그대로 이어져 보이게 함
  return `<span class="dday-y">${y}</span><span class="dday-sep">.</span><span class="dday-md">${m}.${d}</span>`;
}

function renderDday(){
  syncCalendarEditToggle();
  const items = (ddayData.items || []).map((it,i)=>({...it, _i:i})).sort((a,b)=> a.date.localeCompare(b.date));
  const body = document.getElementById('ddayBody');
  body.innerHTML = items.map(it=> `
    <div class="dday-item">
      ${isWidgetOpen('calendar') ? `<button class="icon-btn" data-del="${it._i}">✕</button>` : ''}
      <div class="dday-info">
        <div class="dday-label">${escapeHtml(it.label)}</div>
        <div class="dday-date">${ddayDateText(it.date)}</div>
      </div>
      <div class="dday-count">${ddayDiffText(it.date)}</div>
    </div>
  `).join('') || `<div class="w-empty">등록된 디데이가 없어요</div>`;
  body.querySelectorAll('[data-del]').forEach(btn=> btn.addEventListener('click', async ()=>{
    const idx = Number(btn.dataset.del);
    const target = ddayData.items[idx];
    if(!(await confirmDelete(`"${escapeHtml(target && target.label || '이 디데이')}"를 정말 삭제할까요?`))) return;
    const arr = [...ddayData.items]; arr.splice(idx,1);
    await docRef('dday').set({items:arr}, {merge:true});
  }));

  const wrap = document.getElementById('ddayAddWrap');
  wrap.innerHTML = editMode ? `<button class="btn small" id="ddayAddBtn">+ 디데이 추가</button>` : '';
  const addBtn = document.getElementById('ddayAddBtn');
  if(addBtn) addBtn.onclick = openDdayAddModal;
}

// 디데이/캘린더는 한 위젯 카드(cardCalendar)를 같이 쓰지만 각자 다른 render 함수가
// 그 안의 일부만 다시 그리기 때문에(ddayBody / calContent), 카드 우상단 연필 버튼은
// 카드 전체에 한 번만 붙여두고 필요할 때만 만들거나 지움(중복 생성 방지를 위해
// 매번 먼저 있는지 확인).
function syncCalendarEditToggle(){
  syncCardEditToggle('cardCalendar', 'calendar', '캘린더 위젯 편집');
}

function openDdayAddModal(){
  openModal(`
    <h3>디데이 추가</h3>
    <label>이름</label><input type="text" id="dLabel" placeholder="예: 처음 만난 날">
    <label>날짜</label><input type="date" id="dDate">
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">추가</button></div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const label = m.querySelector('#dLabel').value.trim();
      const date = m.querySelector('#dDate').value;
      if(!label || !date){ toast('이름과 날짜를 입력해주세요'); return; }
      await docRef('dday').set({ items: [...(ddayData.items||[]), {label, date}] }, {merge:true});
      closeModal();
    };
  });
}

docRef('dday').onSnapshot(doc=>{ ddayData = doc.exists ? doc.data() : {items:[]}; renderDday(); renderCalendar(); });

/* ---------------- 4. 방명록 (누구나 남길 수 있음, 삭제만 편집모드 전용) ---------------- */

let guestbookData = { entries: [] };

function renderGuestbook(){
  syncGuestbookEditToggle();
  const entries = (guestbookData.entries || []).slice().sort((a,b)=> (b.ts||0) - (a.ts||0));
  const body = document.getElementById('guestbookBody');
  body.innerHTML = entries.map(e=> `
    <div class="gb-entry" data-id="${e.id}">
      ${isWidgetOpen('guestbook') ? `<button class="gb-del">✕</button>` : ''}
      <span class="gb-name">${escapeHtml(e.name||'익명')}</span>
      <span class="gb-time">${e.ts ? new Date(e.ts).toLocaleDateString('ko-KR') : ''}</span>
      <div class="gb-msg">${escapeHtml(e.message)}</div>
    </div>
  `).join('') || `<div class="w-empty">아직 남겨진 방명록이 없어요</div>`;
  body.querySelectorAll('.gb-del').forEach(btn=> btn.addEventListener('click', async ()=>{
    if(!(await confirmDelete('이 방명록을 정말 삭제할까요?'))) return;
    const id = btn.closest('.gb-entry').dataset.id;
    const arr = (guestbookData.entries||[]).filter(x=> x.id !== id);
    await docRef('guestbook').set({entries: arr}, {merge:true});
  }));
}

// 방명록 카드는 접기/펼치기(gbToggle)용 고정 마크업이라 이미지/음악처럼 카드
// 전체를 매번 새로 그리지 않음 — 그래서 편집 연필 버튼도 캘린더와 같은 방식으로
// 카드에 붙였다 뗐다만 함
function syncGuestbookEditToggle(){
  syncCardEditToggle('cardGuestbook', 'guestbook', '방명록 위젯 편집');
}

docRef('guestbook').onSnapshot(doc=>{ guestbookData = doc.exists ? doc.data() : {entries:[]}; renderGuestbook(); });

// 모바일 전용 접기/펼치기 버튼(PC에서는 CSS가 이 클래스를 무시하고 항상 펼쳐둠)
const gbToggleBtn = document.getElementById('gbToggle');
if(gbToggleBtn){
  gbToggleBtn.addEventListener('click', ()=>{
    const card = document.getElementById('cardGuestbook');
    const collapsed = card.classList.toggle('gb-collapsed');
    gbToggleBtn.setAttribute('aria-expanded', String(!collapsed));
  });
}

// 방명록은 잠금 상태와 관계없이 누구나 남길 수 있어요 (삭제만 편집모드 전용)
document.getElementById('gbSubmit').addEventListener('click', async ()=>{
  const nameInput = document.getElementById('gbName');
  const msgInput = document.getElementById('gbMsg');
  const name = nameInput.value.trim();
  const message = msgInput.value.trim();
  if(!message){ toast('메시지를 입력해주세요'); return; }
  try{
    await docRef('guestbook').set({
      entries: [...(guestbookData.entries||[]), { id: uid(), name: name || '익명', message, ts: Date.now() }]
    }, {merge:true});
    nameInput.value = ''; msgInput.value = '';
    toast('방명록을 남겼어요');
  }catch(err){
    console.error(err);
    toast('저장하지 못했어요. 잠시 후 다시 시도해주세요.');
  }
});

/* ---------------- 5. 캘린더 (내용만, 제목 없음) ---------------- */

let calendarData = { events: {} };
let calState = (()=>{ const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();

// 모바일에서는 캘린더를 달(月) 단위 대신 주(週) 단위 스트립으로 보여줌(칸이 좁아서
// 한 달치를 다 넣으면 너무 빽빽해지므로). calWeekStart는 그 주의 일요일 00:00.
function startOfWeek(date){
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}
let calWeekStart = startOfWeek(new Date());
function isMobileCalView(){ return window.innerWidth <= 900; }

function daysBetween(baseDateStr, targetDateStr){
  const base = new Date(baseDateStr + 'T00:00:00');
  const target = new Date(targetDateStr + 'T00:00:00');
  return Math.round((target - base) / 86400000);
}

const DDAY_MILESTONE_INTERVAL = 100; // 보통 커플들이 챙기는 "100일 단위" 기념일 표시 주기

// 디데이 위젯에 등록된 날짜를 기준으로, 100일 단위가 되는 날짜와
// 매년 돌아오는 N주년(같은 월/일)까지 전부 캘린더에 자동으로 기념일로 표시함
// (직접 캘린더에 따로 입력할 필요 없음)
function ddayMilestonesForDate(dateStr){
  const marks = [];
  (ddayData.items || []).forEach(it=>{
    if(!it.date) return;
    const diff = daysBetween(it.date, dateStr);
    if(diff < 0) return;
    if(diff === 0){ marks.push(`${it.label} 시작일`); return; }
    if(diff === 50){ marks.push(`${it.label} 50일`); }
    if(diff % DDAY_MILESTONE_INTERVAL === 0){
      marks.push(`${it.label} ${diff}일`);
    }
    const base = new Date(it.date + 'T00:00:00');
    const target = new Date(dateStr + 'T00:00:00');
    if(base.getMonth() === target.getMonth() && base.getDate() === target.getDate() && target.getFullYear() > base.getFullYear()){
      marks.push(`${it.label} ${target.getFullYear() - base.getFullYear()}주년`);
    }
  });
  return marks;
}

// 특정 연/월 한 달치 캘린더 블록의 HTML을 만들어줌.
// kind: 'prev' | 'current' | 'next'. 이동 버튼은 더 이상 각 달의 head에 붙이지 않고
// (아래 renderCalendar에서 전체 캘린더 위/아래에 상하 버튼으로 따로 배치함),
// 이전/다음 달은 요일(dow) 줄 없이 흐리게(opacity) 표시해서 이번 달과 구분함.
// refYear: 이번 달의 연도. 이전/다음 달도 거의 항상 같은 연도라서 매번 "2026. 1" 식으로
// 셋 다 연도를 반복하면 지저분해 보임 — 이번 달과 연도가 같으면 월만 표시하고,
// 연말/연초라 실제로 연도가 달라지는 경우에만 그 달에 연도를 같이 보여줌
function buildCalMonthHTML(y, m, kind, refYear){
  const events = calendarData.events || {};
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0,10);
  const isCurrent = kind === 'current';
  const showYear = isCurrent || refYear === undefined || y !== refYear;
  const headLabel = showYear ? `${y}. ${m+1}` : `${m+1}`;
  let cells = '';
  for(let i=0;i<startDow;i++) cells += `<div class="cal-day empty"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const hasManual = events[dateStr] && events[dateStr].length;
    const ddayMarks = ddayMilestonesForDate(dateStr);
    const cls = [
      'cal-day',
      dateStr===todayStr ? 'today' : '',
      (hasManual || ddayMarks.length) ? 'has-event' : '',
      ddayMarks.length ? 'has-dday' : ''
    ].filter(Boolean).join(' ');
    cells += `<div class="${cls}" data-day="${dateStr}" title="${ddayMarks.length ? escapeHtml(ddayMarks.join(', ')) : ''}">${d}</div>`;
  }
  return `
    <div class="cal-month cal-month-${kind} ${isCurrent ? 'cal-month-current' : 'cal-month-side'}">
      <div class="cal-head">
        <strong>${headLabel}</strong>
      </div>
      <div class="cal-clip">
        <div class="cal-grid">
          ${isCurrent ? ['일','월','화','수','목','금','토'].map(d=>`<div class="cal-dow">${d}</div>`).join('') : ''}
          ${cells}
        </div>
      </div>
    </div>
  `;
}

// 모바일 전용 주간 스트립: 해당 주(일~토)를 세로로 한 줄씩 나열함.
function buildCalWeekHTML(startDate){
  const events = calendarData.events || {};
  const todayStr = new Date().toISOString().slice(0,10);
  // 요일은 알파벳(영문 한 글자)으로 표시
  const dowNames = ['S','M','T','W','T','F','S'];
  const days = [];
  let rows = '';
  for(let i=0;i<7;i++){
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    days.push(d);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const hasManual = events[dateStr] && events[dateStr].length;
    const ddayMarks = ddayMilestonesForDate(dateStr);
    const cls = [
      'cal-week-day',
      dateStr===todayStr ? 'today' : '',
      (hasManual || ddayMarks.length) ? 'has-event' : '',
      ddayMarks.length ? 'has-dday' : ''
    ].filter(Boolean).join(' ');
    rows += `
      <div class="${cls}" data-day="${dateStr}" title="${ddayMarks.length ? escapeHtml(ddayMarks.join(', ')) : ''}">
        <span class="cal-week-dow">${dowNames[d.getDay()]}</span>
        <span class="cal-week-date">${d.getDate()}</span>
      </div>`;
  }
  // 상단 라벨: 해당 주의 수요일을 기준으로 한 '월'만 숫자로 표시(연도/텍스트 없음)
  const wednesday = days[3];
  const rangeLabel = `${wednesday.getMonth()+1}`;
  return `
    <div class="cal-week">
      <div class="cal-head"><strong>${rangeLabel}</strong></div>
      <div class="cal-week-list">
        ${rows}
      </div>
    </div>
  `;
}

let calViewWasMobile = null;
function renderCalendar(){
  const box = document.getElementById('calContent');
  const mobile = isMobileCalView();
  calViewWasMobile = mobile;

  if(mobile){
    box.innerHTML = `
      <div class="cal-nav cal-nav-prev"><span class="cal-nav-btn" id="calPrev">▲</span></div>
      ${buildCalWeekHTML(calWeekStart)}
      <div class="cal-nav cal-nav-next"><span class="cal-nav-btn" id="calNext">▼</span></div>
    `;
    box.querySelector('#calPrev').onclick = ()=>{ calWeekStart.setDate(calWeekStart.getDate() - 7); renderCalendar(); };
    box.querySelector('#calNext').onclick = ()=>{ calWeekStart.setDate(calWeekStart.getDate() + 7); renderCalendar(); };
    box.querySelectorAll('[data-day]').forEach(el=> el.addEventListener('click', ()=> openDayModal(el.dataset.day)));
    fitRefGalleryToCalendarHeight();
    return;
  }

  let prevM = calState.m - 1, prevY = calState.y;
  if(prevM < 0){ prevM = 11; prevY--; }
  let nextM = calState.m + 1, nextY = calState.y;
  if(nextM > 11){ nextM = 0; nextY++; }

  // 넘김 버튼을 좌우가 아니라 상하(▲ 이전달 / ▼ 다음달)로 배치.
  // 캘린더 자체가 위(이전달)-가운데(이번달)-아래(다음달) 순으로 쌓여 있으므로
  // 버튼도 그 흐름과 같은 방향(위/아래)에 놓음.
  box.innerHTML = `
    <div class="cal-nav cal-nav-prev"><span class="cal-nav-btn" id="calPrev">▲</span></div>
    <div class="cal-months">
      ${buildCalMonthHTML(prevY, prevM, 'prev', calState.y)}
      ${buildCalMonthHTML(calState.y, calState.m, 'current')}
      ${buildCalMonthHTML(nextY, nextM, 'next', calState.y)}
    </div>
    <div class="cal-nav cal-nav-next"><span class="cal-nav-btn" id="calNext">▼</span></div>
  `;
  box.querySelector('#calPrev').onclick = ()=>{ calState.m--; if(calState.m<0){calState.m=11; calState.y--;} renderCalendar(); };
  box.querySelector('#calNext').onclick = ()=>{ calState.m++; if(calState.m>11){calState.m=0; calState.y++;} renderCalendar(); };
  box.querySelectorAll('[data-day]').forEach(el=> el.addEventListener('click', ()=> openDayModal(el.dataset.day)));

  fitRefGalleryToCalendarHeight();
}
// 창 폭이 900px 경계를 넘나들 때(주간뷰 ↔ 월간뷰) 캘린더를 다시 그려줌
// (리사이즈/기기 회전 등으로 모바일·PC 전환이 생겨도 항상 알맞은 뷰로 유지됨)
window.addEventListener('resize', debounce(()=>{
  if(calViewWasMobile === null) return;
  if(isMobileCalView() !== calViewWasMobile) renderCalendar();
}, 150));

function openDayModal(dateStr){
  const events = calendarData.events || {};
  const manual = events[dateStr] || [];
  const ddayMarks = ddayMilestonesForDate(dateStr);
  if(!isWidgetOpen('calendar')){
    if(!manual.length && !ddayMarks.length){ toast('이 날은 등록된 일정이 없어요'); return; }
    const lines = [...ddayMarks.map(t=>`🎉 ${t}`), ...manual];
    openModal(`<h3>${dateStr}</h3><div style="white-space:pre-wrap;font-size:.88rem;">${escapeHtml(lines.join('\n'))}</div>
      <div class="modal-actions"><button class="btn ghost" id="c">닫기</button></div>`,
      m=> m.querySelector('#c').onclick = closeModal);
    return;
  }
  openModal(`
    <h3>${dateStr} 일정</h3>
    ${ddayMarks.length ? `<p class="hint">🎉 디데이 연동: ${escapeHtml(ddayMarks.join(', '))} (자동 표시, 지울 필요 없어요)</p>` : ''}
    <label>내용 (줄바꿈으로 여러 개 가능)</label>
    <textarea id="evText">${escapeHtml(manual.join('\n'))}</textarea>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">저장</button></div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const text = m.querySelector('#evText').value.trim();
      const newEvents = {...events};
      if(text) newEvents[dateStr] = text.split('\n').filter(Boolean); else delete newEvents[dateStr];
      await docRef('calendar').set({events:newEvents}, {merge:true});
      closeModal();
    };
  });
}

docRef('calendar').onSnapshot(doc=>{ calendarData = doc.exists ? doc.data() : {events:{}}; renderCalendar(); });

/* ---------------- 6-0. 기존 사진들을 나중에 골라 "모아올리기" 묶음으로 합치기
   (갤러리1/갤러리2/레퍼런스 갤러리 3곳이 공용으로 씀) ----------------
   업로드할 때 체크박스로 묶는 것과 달리, 이미 낱장으로 올라와 있는 사진들을
   나중에 여러 장 골라서 하나의 묶음(라이트박스에서 겹쳐 넘겨보는 그 묶음)으로
   합치는 기능. 그리드 DOM/저장 방식은 갤러리마다 다르지만 "선택 → 합치기"
   로직 자체는 동일해서 여기 하나로 모아둠. 한 번에 한 갤러리에서만 선택
   모드를 쓸 수 있음(key로 구분) */
let galleryGroupPick = { key: null, selected: new Set() };
function isGalleryGroupPicking(key){ return galleryGroupPick.key === key; }
function galleryGroupPickCount(){ return galleryGroupPick.selected.size; }
function toggleGalleryGroupPickMode(key, renderFn){
  galleryGroupPick = { key: (galleryGroupPick.key === key ? null : key), selected: new Set() };
  renderFn();
}
function toggleGalleryGroupPickItem(key, idx, it, renderFn){
  if(galleryGroupPick.key !== key) return;
  if(it && it.group){ toast('이미 묶음인 사진은 함께 묶을 수 없어요'); return; }
  if(galleryGroupPick.selected.has(idx)) galleryGroupPick.selected.delete(idx);
  else galleryGroupPick.selected.add(idx);
  renderFn();
}
// items: 지금 화면에 쓰인(정규화된) 전체 배열, saveFn(newArr): 저장 함수, renderFn: 다시 그리기.
// 선택된 사진들을 배열에서 빼내고, 그중 가장 앞자리(첫 선택 위치)에 묶음 하나로 끼워 넣음
// — 나머지 사진들의 순서는 그대로 유지됨
function confirmGalleryGroupPick(key, items, saveFn, renderFn){
  const idxs = Array.from(galleryGroupPick.selected).sort((a,b)=> a-b);
  if(idxs.length < 2){ toast('2장 이상 선택해주세요'); return; }
  const idxSet = new Set(idxs);
  const picked = idxs.map(i=> items[i]);
  const images = picked.map(it=> it.chunked ? {chunked:true, fileId:it.fileId, chunkTotal:it.chunkTotal} : {url:it.url});
  const groupItem = { group:true, images, blur:false, opts:[], blurText:'' };
  const firstIdx = idxs[0];
  let insertAt = 0;
  for(let i=0;i<firstIdx;i++){ if(!idxSet.has(i)) insertAt++; }
  const rest = items.filter((_,i)=> !idxSet.has(i));
  rest.splice(insertAt, 0, groupItem);
  galleryGroupPick = { key: null, selected: new Set() };
  saveFn(rest);
  renderFn();
}
function cancelGalleryGroupPick(renderFn){
  galleryGroupPick = { key: null, selected: new Set() };
  renderFn();
}
// items: 지금 화면에 쓰인(정규화된) 전체 배열, saveFn(newArr): 저장 함수, renderFn: 다시 그리기.
// 선택된 사진들 각각에 골라둔 태그를 추가함(기존 태그는 유지, 중복 태그는 합쳐짐).
// "사진 묶기"와 같은 선택 모드를 그대로 재사용해서, 여러 장 고르는 방식은 동일하고
// 마지막에 "묶기" 대신 "태그 추가"를 고르는 것만 다름
function confirmGalleryGroupTag(key, items, saveFn, renderFn){
  const idxs = Array.from(galleryGroupPick.selected);
  if(idxs.length < 1){ toast('사진을 선택해주세요'); return; }
  openBulkOptAddModal(sharedGalleryOptionsData.options, async (newOpts)=>{
    const arr = items.slice();
    idxs.forEach(i=>{
      const merged = Array.from(new Set([...(arr[i].opts || []), ...newOpts]));
      arr[i] = { ...arr[i], opts: merged };
    });
    galleryGroupPick = { key: null, selected: new Set() };
    await saveFn(arr);
    renderFn();
  });
}
// 타일 위에 얹는 선택 체크 표시(선택 모드가 아니면 빈 문자열)
function galleryPickOverlayHtml(key, idx){
  if(galleryGroupPick.key !== key) return '';
  const picked = galleryGroupPick.selected.has(idx);
  return `<div class="pin-pick-check ${picked ? 'picked' : ''}"></div>`;
}
// 선택 모드 툴바 버튼 + 확정/취소 바(선택 모드가 아니면 버튼만)
function galleryGroupPickToggleBtnHtml(key, idLabel){
  return `<button class="btn small ghost" id="${idLabel}">${isGalleryGroupPicking(key) ? '선택 모드 종료' : '🖼 사진 선택'}</button>`;
}
function galleryGroupPickBarHtml(key){
  if(!isGalleryGroupPicking(key)) return '';
  const n = galleryGroupPickCount();
  return `
    <div class="gallery-pick-bar">
      <span>${n}장 선택됨</span>
      <button class="btn small ghost" id="galPickCancel">취소</button>
      <button class="btn small ghost" id="galPickTag" ${n < 1 ? 'disabled' : ''}>🏷 태그 추가</button>
      <button class="btn small primary" id="galPickConfirm" ${n < 2 ? 'disabled' : ''}>선택한 사진 묶기</button>
    </div>
  `;
}

/* ---------------- 6. 갤러리 (핀터레스트형 매스너리) ---------------- */

/* 예전엔 items가 그냥 URL 문자열 배열이었어서, 새로 추가된 블러 옵션과 호환되도록
   문자열이면 {url, blur:false}로, 객체면 그대로 정규화해줌 */
// 사진 여러 장을 인스타그램 여러 장 게시물처럼 "하나로 묶어서" 올릴 때 쓰는 항목 모양.
// 낱장 항목은 그대로 두고, 묶음만 { group:true, images:[...] } 형태로 별도 표시함
function normalizeGalleryImageRef(img){
  if(!img) return { url:'' };
  if(img.chunked) return { chunked:true, fileId: img.fileId, chunkTotal: img.chunkTotal };
  return { url: img.url };
}
function normalizeGalleryItem(it){
  if(typeof it === 'string') return { url: it, blur: false, opts: [], blurText: '' };
  if(it.group && Array.isArray(it.images)) return { group:true, images: it.images.map(normalizeGalleryImageRef), blur: !!it.blur, opts: it.opts || (it.opt ? [it.opt] : []), blurText: it.blurText || '' };
  if(it.chunked) return { chunked:true, fileId: it.fileId, chunkTotal: it.chunkTotal, blur: !!it.blur, opts: it.opts || (it.opt ? [it.opt] : []), blurText: it.blurText || '' };
  return { url: it.url, blur: !!it.blur, opts: it.opts || (it.opt ? [it.opt] : []), blurText: it.blurText || '' };
}
// 묶음이면 대표(첫 번째) 사진을, 낱장이면 자기 자신을 돌려줌 — 썸네일/지연로딩은
// 항상 이 대표 사진 기준으로 동작하면 됨
function galleryItemCover(it){ return (it && it.group) ? (it.images[0] || {url:''}) : it; }

/* 정사각형(빽빽한) 그리드에서 모아올리기 묶음 사진이 한 칸을 채울 때, 대표 사진 위에
   "N장" 글자 배지를 얹던 방식 대신 세로로 가늘게 크롭한 다음 사진들을 옆으로 이어
   붙여서 몇 장이 더 있는지 한눈에 보이게 함. 한 칸 안에는 최대 3장까지만 나눠 보여주고,
   그보다 많으면 마지막 칸을 "···" 생략 표시로 채움 */
function galleryGroupStripHtml(it){
  const imgs = it.images || [];
  const n = imgs.length;
  const showMore = n > 3;
  const shownCount = showMore ? 2 : Math.min(n, 3);
  const totalCols = shownCount + (showMore ? 1 : 0);
  const widths = totalCols <= 1 ? [100] : totalCols === 2 ? [64, 36] : [50, 30, 20];
  let html = '';
  for(let i = 0; i < shownCount; i++){
    const img = imgs[i];
    const cached = img.chunked ? chunkedImageCache.get(img.fileId) : img.url;
    html += `<div class="dense-strip" style="flex:${widths[i]} 1 0;">${cached ? `<img src="${escapeHtml(cached)}" loading="lazy" decoding="async">` : ''}</div>`;
  }
  if(showMore){
    html += `<div class="dense-strip dense-strip-more" style="flex:${widths[totalCols-1]} 1 0;"><span>···</span></div>`;
  }
  return `<div class="dense-stack">${html}</div>`;
}
/* 위 HTML 중 아직 캐시에 없어서 비어있던 칸(청크 사진이라 바로 못 채웠던 칸)만 골라
   그때부터 불러오기 시작함 — 대표 사진과 같은 지연 로딩 방식(resolveGalleryItemUrl)을
   그대로 재사용하고, 다 불러오면 그 칸 하나만 바꿔 끼워서 나머지는 건드리지 않음 */
function loadGalleryGroupStrips(tileEl, it){
  if(!tileEl || !it || !it.group) return;
  const imgs = it.images || [];
  const n = imgs.length;
  const shownCount = n > 3 ? 2 : Math.min(n, 3);
  const cells = tileEl.querySelectorAll('.dense-strip:not(.dense-strip-more)');
  for(let i = 0; i < shownCount; i++){
    const cell = cells[i];
    const img = imgs[i];
    if(!cell || !img || !img.chunked || cell.querySelector('img')) continue;
    resolveGalleryItemUrl(img, (url)=>{
      if(!tileEl.isConnected || cell.querySelector('img')) return;
      const finalUrl = url || chunkedImageCache.get(img.fileId) || '';
      cell.innerHTML = `<img src="${escapeHtml(finalUrl)}" loading="lazy" decoding="async">`;
      attachImgFallback(cell.querySelector('img'));
    }, false);
  }
}

/* 갤러리는 사진 여러 장이 문서 하나(gallery/gallery2)에 배열로 함께 저장되는데,
   사진을 그대로 base64로 박아넣으면 Firestore 문서 1MB 한도를 여러 장이
   나눠 써야 해서, 사진이 늘어날수록(특히 용량 큰 GIF는 몇 장만 있어도) 저장이
   막혀버림. 일정 크기 이상인 파일은 이미 있는 청크 저장 방식(saveFileChunked)으로
   따로 보관하고, 갤러리 문서에는 작은 참조 정보만 남겨서 사진이 몇 장이든
   용량 걱정 없이 계속 추가할 수 있게 함. */
/* 예전엔 200KB보다 작은 사진은 문서 안에 그대로(inline) 저장했는데, 사진이 여러 장
   쌓이면 "각각은 작아도 합치면 1MB 넘는" 문제가 생겨서(실제로 레퍼런스 갤러리에서 발생),
   이제는 무조건 전부 청크로 분리 저장해서 갤러리 문서 자체는 항상 작게 유지되게 함. */
const GALLERY_INLINE_MAX = 0; // 사실상 전부 청크 저장
const chunkedImageCache = new Map(); // fileId -> 이미 불러온 data URL(캐시)

async function storeGalleryImage(dataUrl){
  if(dataUrl.length <= GALLERY_INLINE_MAX) return { url: dataUrl };
  const { fileId, total } = await saveFileChunked(dataUrl);
  chunkedImageCache.set(fileId, dataUrl); // 방금 올린 사진은 바로 캐시해서 다시 안 불러와도 되게 함
  return { chunked: true, fileId, chunkTotal: total };
}

/* 예전 방식(inline)으로 이미 저장돼 있던 사진들을 청크 저장으로 옮겨서
   갤러리 문서 용량을 다시 줄여주는 일회성 정리 작업.
   data: URL로 저장된 항목만 대상으로 하고, 외부 링크(URL)는 그대로 둠. */
async function migrateInlineGalleryImages(docName, getItems){
  const items = getItems();
  let changed = false;
  const newItems = [];
  for(const raw of items){
    if(raw && typeof raw === 'object' && !raw.chunked && typeof raw.url === 'string' && raw.url.startsWith('data:')){
      try{
        const { fileId, total } = await saveFileChunked(raw.url);
        chunkedImageCache.set(fileId, raw.url);
        newItems.push({ chunked:true, fileId, chunkTotal: total, blur: !!raw.blur, opts: raw.opts || (raw.opt ? [raw.opt] : []), blurText: raw.blurText || '' });
        changed = true;
      }catch(err){ newItems.push(raw); }
    } else {
      newItems.push(raw);
    }
  }
  if(changed){
    try{
      await docRef(docName).set({ items: newItems }, {merge:true});
    }catch(err){ console.error('갤러리 정리 실패:', docName, err); }
  }
}

async function migrateOversizedGalleries(){
  await migrateInlineGalleryImages('gallery', ()=> galleryData.items || []);
  await migrateInlineGalleryImages('gallery2', ()=> gallery2Data.items || []);
  await migrateInlineGalleryImages('refgallery', ()=> refGalleryData.items || []);
  await migrateInlineImageSlides();
}

// 사진 슬라이드 위젯(content/images)도 예전엔 압축된 base64를 문서에 바로 저장했어서,
// 그때 이미 쌓인 사진들을 다른 갤러리와 마찬가지로 청크 저장으로 옮겨줌. 캡션(4모서리
// 문구) 필드는 그대로 유지해야 해서 migrateInlineGalleryImages를 그대로 재사용하지 않고
// 별도로 둠.
async function migrateInlineImageSlides(){
  const items = (imagesData.items || []).map(normalizeImageItem);
  let changed = false;
  const newItems = [];
  for(const it of items){
    if(!it.chunked && it.url && it.url.startsWith('data:')){
      try{
        const stored = await storeGalleryImage(it.url);
        newItems.push({ ...stored, captions: it.captions });
        changed = true;
      }catch(err){ newItems.push(it); }
    } else {
      newItems.push(it);
    }
  }
  if(changed){
    try{ await docRef('images').set({ items: newItems }, {merge:true}); }
    catch(err){ console.error('사진 슬라이드 정리 실패:', err); }
  }
}

/* 프로필 문서 하나에 모든 AU/시점/IF 정보가 같이 들어있어서, 예전에 사진을 그대로(inline
   base64)로 저장해뒀으면 시점/IF가 몇 개만 늘어나도 금세 1MB 한도를 넘겨버림
   ("시점/IF를 추가하려는데 저장 안 됨" 오류의 원인). 새로 올리는 사진은 이제 항상 청크로
   저장되지만, 예전에 이미 inline으로 저장돼 있던 사진들은 여기서 한 번에 청크로 옮겨서
   문서 용량을 다시 줄여줌. */
async function migrateOversizedProfileAvatars(){
  const raw = profileData.slides || [];
  if(!raw.length) return;
  const slides = raw.map(normalizeProfileSlide);
  let changed = false;
  for(const slide of slides){
    for(const sec of slide.sections){
      for(const pf of sec.peopleFields){
        if(!pf.avatarChunked && pf.avatar && pf.avatar.startsWith('data:')){
          try{
            const { fileId, total } = await saveFileChunked(pf.avatar);
            chunkedImageCache.set(fileId, pf.avatar);
            pf.avatarChunked = true; pf.avatarFileId = fileId; pf.avatarChunkTotal = total; pf.avatar = '';
            changed = true;
          }catch(err){ /* 실패하면 이번엔 건너뛰고 inline 상태 그대로 둠(다음에 다시 시도됨) */ }
        }
      }
    }
  }
  if(changed){
    try{ await docRef('profile').set({ slides }, {merge:true}); }
    catch(err){ console.error('프로필 사진 정리 실패:', err); }
  }
}

/* 화면을 열자마자 여러 위젯(메인 갤러리·갤러리2·레퍼런스 갤러리 등)의 사진이 동시에
   "화면 근처"로 잡혀서 한꺼번에 불러와지면, 그 순간에 몰린 Firestore 요청과 이미지
   디코딩 작업이 메인 스레드를 잠깐 막아서 렉으로 느껴질 수 있음. 그래서 실제로
   동시에 진행되는 청크 로딩 개수를 CHUNK_LOAD_CONCURRENCY로 제한하고, 그 이상은
   줄을 세워서 하나 끝나면 다음 게 시작되도록 함(모든 갤러리가 이 큐를 공유함)
   원래 4였는데, 사진이 쌓일수록(그룹 해체로 낱장이 늘어난 경우 포함) 이 대기줄이
   여러 바퀴 돌면서 첫 화면 전체가 다 뜨는 데 걸리는 시간이 눈에 띄게 늘어난다는
   피드백으로 6으로 올림 — 사진 대부분이 압축돼 청크 1개(문서 1개)짜리라 요청
   자체는 가벼워서, 6 정도는 메인 스레드를 막을 정도의 부담 없이 대기줄만 줄여줌 */
const CHUNK_LOAD_CONCURRENCY = 6;
let activeChunkLoads = 0;
const chunkLoadQueue = [];
function runChunkLoad(fileId, chunkTotal, priority){
  return new Promise((resolve)=>{
    const task = ()=>{
      activeChunkLoads++;
      loadFileChunked(fileId, chunkTotal)
        .then(url=>{ chunkedImageCache.set(fileId, url); })
        .catch(()=>{ chunkedImageCache.set(fileId, ''); })
        .finally(()=>{
          activeChunkLoads--;
          resolve();
          if(chunkLoadQueue.length) chunkLoadQueue.shift()();
        });
    };
    if(activeChunkLoads < CHUNK_LOAD_CONCURRENCY) task();
    // 라이트박스처럼 사용자가 지금 당장 보려고 여는 경우(priority)는 대기줄 맨 앞으로
    // 끼워넣어서, 백그라운드로 미리 불러오던 썸네일들보다 먼저 처리되게 함
    else if(priority) chunkLoadQueue.unshift(task);
    else chunkLoadQueue.push(task);
  });
}

/* 청크로 저장된 사진은 비동기로 불러와야 해서, 아직 캐시에 없으면 null을 반환하고
   (그동안 로딩 타일을 보여줌) 다 불러오면 onReady()로 다시 그리게 함.
   같은 사진(fileId)에 대해 여러 곳(지연 로딩 타일 + 크게 보기 모달 등)에서
   동시에 요청이 들어와도 실제 Firestore 요청은 한 번만 나가도록
   진행 중인 로딩을 pendingChunkedLoads에 캐시해뒀다가 재사용함 */
const pendingChunkedLoads = new Map(); // fileId -> 로딩 중인 Promise
function resolveGalleryItemUrl(item, onReady, priority){
  if(item && item.group) return resolveGalleryItemUrl(galleryItemCover(item), onReady, priority);
  if(!item.chunked) return item.url;
  if(chunkedImageCache.has(item.fileId)) return chunkedImageCache.get(item.fileId);
  if(!pendingChunkedLoads.has(item.fileId)){
    const p = runChunkLoad(item.fileId, item.chunkTotal, priority)
      .finally(()=> pendingChunkedLoads.delete(item.fileId));
    pendingChunkedLoads.set(item.fileId, p);
  }
  pendingChunkedLoads.get(item.fileId).then(onReady);
  return null;
}

/* 사진이 아무리 많아도, 화면(스크롤 영역) 진짜 근처에 온 것만 그때그때 하나씩 불러와서
   렉 없이 부드럽게 스크롤되게 하는 범용 지연 로딩 설정기. rootMargin은 살짝 미리
   불러와두는 정도(200px)로만 잡아서, 페이지를 열자마자 카드 안의 사진 전체가 한꺼번에
   요청되는 걸 막음(카드가 작을수록 여유분을 넉넉히 주면 사실상 전체가 한 번에 걸리는
   문제가 있었음). 하나씩 불러올 때마다 그리드 전체가 아니라 그 타일 하나만
   바꿔치기해서 다른 사진들(과 이미 진행 중인 드래그 정렬 등)은 건드리지 않음.
   observerHolder는 { current: IntersectionObserver|null } 형태의 객체로, 그리드마다
   하나씩 만들어서 넘겨주면 재렌더링 때마다 이전 관찰자를 정리하고 새로 등록함. */
function setupPinGalleryLazyLoad(gridEl, pairs, observerHolder, loadingSelector, fillTile){
  if(observerHolder.current) observerHolder.current.disconnect();
  const targets = gridEl.querySelectorAll(loadingSelector);
  if(!targets.length) return;
  const byIdx = new Map(pairs.map(({it,i})=> [i, it]));
  observerHolder.current = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      const tile = entry.target;
      observerHolder.current.unobserve(tile);
      const idx = Number(tile.dataset.idx);
      const item = byIdx.get(idx);
      if(!item) return;
      // 그룹 사진(item.group)은 실제 fileId가 item이 아니라 대표 사진
      // (galleryItemCover(item))에 있음. 캐시 조회를 item.fileId로 하면
      // (그룹엔 그 값이 없어서 undefined) 청크 로딩 자체는 성공해도 콜백에서
      // 엉뚱한 키로 캐시를 찾아 빈 URL로 채워버려서 썸네일이 영영 안 뜨는
      // 문제가 있었음 — 대표 사진의 fileId로 조회하도록 고침
      const coverFileId = galleryItemCover(item).fileId;
      const resolved = resolveGalleryItemUrl(item, ()=> fillTile(tile, idx, chunkedImageCache.get(coverFileId) || '', item));
      if(resolved !== null) fillTile(tile, idx, resolved, item);
    });
  }, { root: gridEl, rootMargin: '200px 0px' });
  targets.forEach(tile=> observerHolder.current.observe(tile));
}

function deleteGalleryImageIfChunked(item){
  if(!item) return;
  if(item.group && Array.isArray(item.images)){ item.images.forEach(deleteGalleryImageIfChunked); return; }
  if(item.chunked){ deleteFileChunked(item.fileId, item.chunkTotal).catch(()=>{}); }
}

let galleryData = { items: [] };
let sharedGalleryOptionsData = { options: [] };
let galleryFilterOpt = null;
let galleryObserverHolder = { current: null }; // 지연 로딩 관찰자(재렌더링 때마다 새로 등록)
/* 블러 토글/태그 변경처럼 "보이는 사진 구성/순서"는 그대로인 채 특정 사진의 속성만
   바뀌는 편집은, 사진이 많아질수록 무거워지는 전체 그리드 재렌더링(캐시된 사진들을
   전부 다시 그려서 브라우저가 다시 디코딩하게 됨) 없이 해당 타일만 즉시 바로 바꿔주고
   이 플래그로 뒤이어 오는 스냅샷의 재렌더링을 건너뜀 */
let skipNextGalleryRender = false;

/* 이미 이번 세션에서 한 번 불러와 캐시된 사진(또는 애초에 다운로드가 필요 없는 외부 URL)은
   바로 표시하고, 아직 안 불러온 청크 사진만 빈 플레이스홀더로 그림 — 실제 로딩은
   setupPinGalleryLazyLoad가 화면 근처로 스크롤됐을 때 시작함 */
// 사진(또는 묶음)의 실제 미디어 마크업 — 초기 렌더(galleryTileMarkup)와 지연 로딩 후
// 채워넣기(fillGalleryTile)가 항상 같은 내용을 만들어야 해서 공용 함수로 뺌
function galleryMediaHtml(it, url){
  return it.group ? galleryGroupStripHtml(it) : `<img src="${escapeHtml(url)}" loading="lazy" decoding="async">`;
}
// 편집모드에서만 보이는 삭제/블러/옵션 버튼 3종 — 위와 같은 이유로 공용 함수로 뺌
function galleryActionButtonsHtml(idx, it, picking){
  if(!(isWidgetOpen('gallery') && !picking)) return '';
  return `<button class="pin-del-btn" data-del="${idx}" title="삭제">✕</button>
      <button class="pin-blur-btn" data-blur="${idx}" title="${it.blur ? '블러 해제' : '블러 처리'}">${it.blur ? '🙈' : '👁'}</button>
      <button class="pin-opt-btn" data-opt-edit="${idx}" title="옵션 지정" style="bottom:8px;right:8px;top:auto;">🏷</button>`;
}
function galleryTileHtml(it, i){
  const cover = galleryItemCover(it);
  if(cover.chunked && chunkedImageCache.has(cover.fileId)) return galleryTileMarkup(it, chunkedImageCache.get(cover.fileId) || '', i);
  if(!cover.chunked) return galleryTileMarkup(it, cover.url, i);
  return `<div class="pin-item pin-loading" data-idx="${i}"><span>불러오는 중…</span></div>`;
}
function galleryTileMarkup(it, url, i){
  const picking = isGalleryGroupPicking('gallery');
  return `
    <div class="pin-item ${it.blur ? 'blurred' : ''} ${it.group ? 'pin-item-group' : ''} ${picking ? 'pin-item-picking' : ''}" data-idx="${i}">
      ${galleryMediaHtml(it, url)}
      ${galleryPickOverlayHtml('gallery', i)}
      ${galleryActionButtonsHtml(i, it, picking)}
    </div>`;
}
function fillGalleryTile(tile, idx, url, it){
  if(!tile.isConnected) return; // 그사이 그리드가 다시 그려져서 이 타일이 이미 화면에서 빠졌으면 무시
  const picking = isGalleryGroupPicking('gallery');
  tile.classList.remove('pin-loading');
  tile.classList.toggle('pin-item-group', !!it.group);
  tile.classList.toggle('pin-item-picking', picking);
  tile.innerHTML = `
    ${galleryMediaHtml(it, url)}
    ${galleryPickOverlayHtml('gallery', idx)}
    ${galleryActionButtonsHtml(idx, it, picking)}
  `;
  if(it.blur) tile.classList.add('blurred');
  const grid = tile.closest('#galleryGrid');
  if(it.group){
    // 묶음 사진 칸은 가상의 정사각형(CSS aspect-ratio)으로 높이가 이미 정해져 있어서
    // 사진 로딩을 기다릴 필요 없이 바로 재배치하면 됨
    loadGalleryGroupStrips(tile, it);
    if(grid) relayoutPinMasonryDebounced(grid);
  } else {
    const img = tile.querySelector('img');
    attachImgFallback(img);
    if(grid){
      if(img && !img.complete) img.addEventListener('load', ()=> relayoutPinMasonryDebounced(grid), { once:true });
      else relayoutPinMasonryDebounced(grid);
    }
  }
}
async function handleGalleryDelete(idx){
  if(!(await confirmDelete('이 사진을 정말 삭제할까요?<br>되돌릴 수 없어요.'))) return;
  const items = (galleryData.items || []).map(normalizeGalleryItem);
  const arr = items.slice();
  const [removed] = arr.splice(idx,1);
  docRef('gallery').set({items:arr}, {merge:true});
  deleteGalleryImageIfChunked(removed);
}
function handleGalleryBlurToggle(idx){
  const items = (galleryData.items || []).map(normalizeGalleryItem);
  const arr = items.slice();
  arr[idx] = { ...arr[idx], blur: !arr[idx].blur };
  // 사진 구성 자체는 안 바뀌니 전체를 다시 그리지 않고 해당 타일만 바로 바꿔줌
  const tile = document.querySelector(`#galleryGrid .pin-item[data-idx="${idx}"]`);
  if(tile){
    tile.classList.toggle('blurred', arr[idx].blur);
    const blurBtn = tile.querySelector('[data-blur]');
    if(blurBtn){ blurBtn.textContent = arr[idx].blur ? '🙈' : '👁'; blurBtn.title = arr[idx].blur ? '블러 해제' : '블러 처리'; }
  }
  skipNextGalleryRender = true;
  docRef('gallery').set({ items: arr }, {merge:true});
}
function handleGalleryOptEdit(idx){
  const items = (galleryData.items || []).map(normalizeGalleryItem);
  openItemOptEditModal(items[idx].opts, sharedGalleryOptionsData.options, (opts)=>{
    const arr = items.slice();
    arr[idx] = { ...arr[idx], opts };
    // 필터가 꺼져 있으면 태그만 바꿔선 보이는 사진 구성이 안 바뀌므로 재렌더링 생략
    if(!galleryFilterOpt) skipNextGalleryRender = true;
    docRef('gallery').set({ items: arr }, {merge:true}); // 응답을 기다리지 않아야 모달이 바로 닫힘
  });
}

function renderGallery(){
  const box = document.getElementById('cardGallery');
  const prevScrollEl = document.getElementById('galleryGrid');
  const savedScroll = prevScrollEl ? { top: prevScrollEl.scrollTop, left: prevScrollEl.scrollLeft } : { top:0, left:0 };
  const items = (galleryData.items || []).map(normalizeGalleryItem);
  const pairs = items.map((it,i)=>({it,i})).filter(({it})=> !galleryFilterOpt || (it.opts||[]).includes(galleryFilterOpt));
  box.innerHTML = `
    ${widgetEditToggleBtnHtml('gallery', '갤러리 위젯 편집')}
    <div class="pin-toolbar">
      <div class="tag-filter" id="galleryFilterChips" style="display:none;"></div>
      ${isWidgetOpen('gallery') ? `<button class="btn small ghost" id="galOptsBtn">⚙ 옵션 관리</button>` : ''}
      ${isWidgetOpen('gallery') ? galleryGroupPickToggleBtnHtml('gallery', 'galGroupPickBtn') : ''}
    </div>
    ${galleryGroupPickBarHtml('gallery')}
    <div class="pin-grid-scroll" id="galleryGrid">
      <div class="pin-grid">
        ${pairs.map(({it,i})=> galleryTileHtml(it, i)).join('')}
      </div>
    </div>
    ${items.length===0 ? `<div class="w-empty">아직 사진이 없어요</div>` : ''}
    ${pairs.length===0 && items.length>0 ? `<div class="w-empty">이 옵션에 해당하는 사진이 없어요</div>` : ''}
    ${editMode ? `<button class="gallery-add-fab" id="galAddBtn" title="사진 추가">＋</button>` : ''}
  `;
  const gridEl = box.querySelector('#galleryGrid');
  restoreScrollPos(gridEl, savedScroll);
  renderOptionFilterChips(box.querySelector('#galleryFilterChips'), sharedGalleryOptionsData.options, galleryFilterOpt, (opt)=>{ galleryFilterOpt = opt; renderGallery(); });
  gridEl.querySelectorAll('.pin-item:not(.pin-loading) img').forEach(attachImgFallback);
  gridEl.querySelectorAll('.pin-item.pin-item-group').forEach(tile=> loadGalleryGroupStrips(tile, items[Number(tile.dataset.idx)]));
  requestAnimationFrame(()=> layoutPinMasonry(gridEl));
  watchPinTileImagesForRelayout(gridEl);

  // 열기/삭제/블러/옵션 지정 클릭을 그리드 전체에 한 번만 위임해서 걸어둠.
  // 이렇게 하면 나중에 낱장 사진이 지연 로딩으로 채워져도(pin-loading → 실제 이미지)
  // 다시 걸어줄 필요가 없음 (레퍼런스 갤러리와 동일한 방식)
  gridEl.addEventListener('click', (e)=>{
    const tile = e.target.closest('.pin-item:not(.pin-loading)');
    if(isGalleryGroupPicking('gallery')){
      if(tile) toggleGalleryGroupPickItem('gallery', Number(tile.dataset.idx), items[Number(tile.dataset.idx)], renderGallery);
      return;
    }
    const delBtn = e.target.closest('[data-del]');
    if(delBtn){ e.stopPropagation(); handleGalleryDelete(Number(delBtn.dataset.del)); return; }
    const blurBtn = e.target.closest('[data-blur]');
    if(blurBtn){ e.stopPropagation(); handleGalleryBlurToggle(Number(blurBtn.dataset.blur)); return; }
    const optBtn = e.target.closest('[data-opt-edit]');
    if(optBtn){ e.stopPropagation(); handleGalleryOptEdit(Number(optBtn.dataset.optEdit)); return; }
    if(tile) openGalleryViewModal(Number(tile.dataset.idx));
  });

  const addBtn = box.querySelector('#galAddBtn');
  if(addBtn) addBtn.onclick = openGalleryAddModal;
  const optsBtn = box.querySelector('#galOptsBtn');
  if(optsBtn) optsBtn.onclick = ()=> openOptionsManagerModal('sharedGalleryOptions', sharedGalleryOptionsData.options, (options)=>{ sharedGalleryOptionsData = {options}; renderGallery(); });
  const groupPickBtn = box.querySelector('#galGroupPickBtn');
  if(groupPickBtn) groupPickBtn.onclick = ()=> toggleGalleryGroupPickMode('gallery', renderGallery);
  const pickCancelBtn = box.querySelector('#galPickCancel');
  if(pickCancelBtn) pickCancelBtn.onclick = ()=> cancelGalleryGroupPick(renderGallery);
  const pickTagBtn = box.querySelector('#galPickTag');
  if(pickTagBtn) pickTagBtn.onclick = ()=> confirmGalleryGroupTag('gallery', items, (arr)=> docRef('gallery').set({items:arr}, {merge:true}), renderGallery);
  const pickConfirmBtn = box.querySelector('#galPickConfirm');
  if(pickConfirmBtn) pickConfirmBtn.onclick = ()=> confirmGalleryGroupPick('gallery', items, (arr)=> docRef('gallery').set({items:arr}, {merge:true}), renderGallery);
  // 드래그 순서 변경은 로딩 중인 타일까지 포함해서 한 번만 걸어둠. 타일 엘리먼트 자체는
  // 사진이 나중에 채워져도 같은 노드를 그대로 재사용하기 때문에 다시 걸 필요가 없음
  if(!isGalleryGroupPicking('gallery')) bindPinDragReorder(
    gridEl, '.pin-item',
    ()=> items.slice(),
    async (arr)=> docRef('gallery').set({items:arr}, {merge:true}),
    { pointerLine: true, widgetKey: 'gallery' }
  );
  setupPinGalleryLazyLoad(gridEl, pairs, galleryObserverHolder, '.pin-item.pin-loading',
    (tile, idx, url, it)=> fillGalleryTile(tile, idx, url, it));
}

function openGalleryViewModal(idx){
  openGalleryLightboxCore(idx, {
    getItems: ()=> galleryData.items,
    normalize: normalizeGalleryItem,
    save: (arr)=> docRef('gallery').set({items:arr}, {merge:true}),
    getFilterOpt: ()=> galleryFilterOpt,
    markSkipRender: ()=>{ if(!galleryFilterOpt) skipNextGalleryRender = true; },
    reopen: (i)=> openGalleryViewModal(i)
  });
}

// 갤러리 3형제(gallery/gallery2/refgallery)는 "사진 추가" 모달이 사실상 동일한 로직이라
// 공용 코어로 묶고, 위젯별 차이(아이디 접두사·블러 옵션 유무·묶기 라벨 문구·데이터 소스)만
// config로 흘려보냄 — 아래 openGalleryViewModal 3형제가 openGalleryLightboxCore를 감싸는
// 것과 같은 패턴.
function openGalleryAddModalCore({ idPrefix, title='사진 추가', hasBlur=true, groupLabel='모아올리기', getData, normalize, collection }){
  const eid = name => idPrefix + name;
  openModal(`
    <h3>${title}</h3>
    <label>사진 올리기 (기기에서 여러 장 선택 가능)</label>
    <input type="file" id="${eid('Files')}" accept="image/*" multiple>
    <p class="hint">자동으로 압축해서 맨 앞에 추가돼요.</p>
    <label>또는, 이미지 URL 직접 입력</label>
    <input type="url" id="${eid('Url')}" placeholder="https://...">
    <label>옵션 (분류, 여러 개 선택 가능)</label>
    <div id="${eid('OptBox')}">${renderOptionCheckboxes(sharedGalleryOptionsData.options, [])}</div>
    <p class="hint">고른 옵션이 여러 장 전부에 적용돼요. (옵션 추가는 "⚙ 옵션 관리")</p>${hasBlur ? `
    <label style="display:flex;align-items:center;gap:8px;margin-top:12px;">
      <input type="checkbox" id="${eid('Blur')}" style="width:auto;">
      <span style="font-size:.82rem;color:var(--ink);">미리보기 방지</span>
    </label>` : ''}
    <label style="display:flex;align-items:center;gap:8px;margin-top:${hasBlur ? 8 : 12}px;">
      <input type="checkbox" id="${eid('Group')}" style="width:auto;">
      <span style="font-size:.82rem;color:var(--ink);">${groupLabel}</span>
    </label>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">추가</button></div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const files = Array.from(m.querySelector('#'+eid('Files')).files || []);
      const url = normalizeImageUrl(m.querySelector('#'+eid('Url')).value.trim());
      const blur = hasBlur ? m.querySelector('#'+eid('Blur')).checked : false;
      const asGroup = m.querySelector('#'+eid('Group')).checked;
      const opts = getCheckedOptionValues(m.querySelector('#'+eid('OptBox')));
      const newItems = [];
      if(files.length){
        saveBtn.disabled = true;
        for(let i=0;i<files.length;i++){
          saveBtn.textContent = `처리 중… (${i+1}/${files.length})`;
          try{
            const dataUrl = await compressImageFile(files[i], 1200, 260000);
            const stored = await storeGalleryImage(dataUrl);
            newItems.push(hasBlur ? { ...stored, blur, opts } : { ...stored, opts });
          }catch(err){ toast(`"${files[i].name}" 처리 실패: ${err.message || err}`); }
          await new Promise(r=> setTimeout(r, 0));
        }
      } else if(url){
        newItems.push(hasBlur ? { url, blur, opts } : { url, opts });
      } else {
        toast('사진을 선택하거나 URL을 입력해주세요');
        return;
      }
      // 두 장 이상이고 "묶어서 올리기"를 체크했으면, 낱장 여러 개 대신 묶음 하나로 합침
      const finalNewItems = (asGroup && newItems.length > 1)
        ? [{ group:true, images: newItems.map(it=> it.chunked ? {chunked:true, fileId:it.fileId, chunkTotal:it.chunkTotal} : {url:it.url}), ...(hasBlur ? {blur} : {}), opts }]
        : newItems;
      try{
        const existing = (getData().items||[]).map(normalize);
        await docRef(collection).set({ items: [...finalNewItems, ...existing] }, {merge:true});
      }catch(err){
        toast(`저장하지 못했어요: ${err.message || err}`);
        saveBtn.disabled = false; saveBtn.textContent = '추가';
        return;
      }
      closeModal();
    };
  });
}

function openGalleryAddModal(){
  openGalleryAddModalCore({ idPrefix:'gal', getData:()=>galleryData, normalize:normalizeGalleryItem, collection:'gallery' });
}

/* 갤러리 탭(탭2)은 화면을 옆으로 넘기기 전엔 보이지도 않는데, 아래 구독들
   (sharedGalleryOptions/gallery/gallery2/refgallery/videos + 아래 마이그레이션 1회성 조회)이
   지금까진 페이지가 열리자마자 전부 곧바로 등록되고 있었음 — 위젯 탭(탭1)만 보고
   떠나는 방문자도 갤러리 탭 데이터 요청 + 렌더링(DOM 생성)을 그대로 다 떠안은 것.
   content-visibility는 "보이지 않는 탭의 레이아웃/페인트 비용"은 막아주지만
   이 데이터 구독 자체(네트워크 요청 + DOM 생성)는 못 막아서 별도로 손봄.
   deferToTab2로 감싸서, 탭2를 실제로 한 번 봤을 때(initBoardTabs의 setActive) 또는
   브라우저가 한가할 때(requestIdleCallback, 아래 초기화 부분) 중 먼저 오는 시점에만
   실행되게 미룸. */
let _tab2Inits = [];
let _tab2Started = false;
function deferToTab2(fn){ _tab2Inits.push(fn); }
function startTab2Widgets(){
  if(_tab2Started) return;
  _tab2Started = true;
  _tab2Inits.forEach(fn=> fn());
  _tab2Inits = [];
}

deferToTab2(()=> docRef('sharedGalleryOptions').onSnapshot(doc=>{
  sharedGalleryOptionsData = doc.exists ? doc.data() : {options:[]};
  renderGallery(); renderGallery2(); renderRefGallery();
}));

/* 예전엔 갤러리마다 옵션 목록을 따로 저장했는데, 그때 만들어둔 옵션이 있으면
   공유 목록이 아직 비어있을 때 한 번만 자동으로 합쳐줌 */
deferToTab2(async function migrateGalleryOptionsToShared(){
  try{
    const sharedDoc = await docRef('sharedGalleryOptions').get();
    if(sharedDoc.exists && (sharedDoc.data().options||[]).length) return;
    const [g1, g2, g3] = await Promise.all([
      docRef('galleryOptions').get(), docRef('gallery2Options').get(), docRef('refGalleryOptions').get()
    ]);
    const merged = [];
    [g1,g2,g3].forEach(d=>{ if(d.exists) (d.data().options||[]).forEach(o=>{ if(o && !merged.includes(o)) merged.push(o); }); });
    if(merged.length) await docRef('sharedGalleryOptions').set({ options: merged }, {merge:true});
  }catch(err){ console.error('갤러리 옵션 이전 실패', err); }
});
deferToTab2(()=> docRef('gallery').onSnapshot(doc=>{
  galleryData = doc.exists ? doc.data() : {items:[]};
  if(skipNextGalleryRender){ skipNextGalleryRender = false; }
  else { renderGallery(); }
  if(editMode) migrateInlineGalleryImages('gallery', ()=> galleryData.items || []);
}));

/* ---------------- 6-2. 갤러리 2번째 (기존 갤러리 바로 아래 — 완전히 독립된 두 번째 갤러리)
   빽빽한 정사각형 그리드로 세로 스크롤 ---------------- */

let gallery2Data = { items: [] };
let gallery2FilterOpt = null;
let gallery2ObserverHolder = { current: null }; // 지연 로딩 관찰자(재렌더링 때마다 새로 등록)
let skipNextGallery2Render = false;
let gallery2LastColCount = null; // 마지막으로 렌더링한 열 개수(폭이 바뀌어 열 개수가 달라질 때만 다시 그리기 위함)

const GALLERY2_MIN_COL_WIDTH = 110; // 이 폭 밑으로는 칼럼을 더 늘리지 않음(썸네일이 너무 작아지는 것 방지)
const GALLERY2_COL_GAP = 6;
// 레퍼런스 갤러리는 항상 2열 고정이지만, 갤러리2는 카드 폭에 맞춰 열 개수가 자동으로 늘고 줄어들게 함
function gallery2ColumnCount(width){
  if(!width) return 2;
  return Math.max(1, Math.floor((width + GALLERY2_COL_GAP) / (GALLERY2_MIN_COL_WIDTH + GALLERY2_COL_GAP)));
}
// 겹치는 정도는 레퍼런스 갤러리보다 훨씬 약하게(최대 겹침도, 늘어나는 속도도 줄임)
const GALLERY2_OVERLAP_STEP = 0.03;
const GALLERY2_OVERLAP_MAX = 0.28;
function applyGallery2Overlap(gridEl, itemCount, colCount){
  if(!gridEl) return;
  // 편집모드에서는 순서 변경(드래그) 작업을 하기 편하도록 겹침을 끄고 타일을 나란히 둠
  if(editMode){ gridEl.style.setProperty('--gallery2-overlap-px', '0px'); return; }
  const firstTile = gridEl.querySelector('.pin-item-dense');
  if(!firstTile){ gridEl.style.setProperty('--gallery2-overlap-px', '0px'); return; }
  const tileSize = firstTile.getBoundingClientRect().height || firstTile.getBoundingClientRect().width;
  if(!tileSize) return;
  const rows = Math.ceil(itemCount / Math.max(1, colCount||2));
  const overlapRatio = Math.min(GALLERY2_OVERLAP_MAX, Math.max(0, (rows - 1) * GALLERY2_OVERLAP_STEP));
  gridEl.style.setProperty('--gallery2-overlap-px', `-${(tileSize * overlapRatio).toFixed(1)}px`);
}
// 카드 폭이 바뀌어서(창 크기 변경, 갤러리 탭이 처음 화면에 보이게 됨 등) 열 개수가 달라져야 할 때만
// 다시 그림. 열 개수가 그대로면 겹침 비율만 다시 계산해서 불필요한 재렌더링을 피함
function refreshGallery2Layout(){
  const box = document.getElementById('cardGallery2');
  const gridEl = document.getElementById('gallery2Grid');
  if(!box || !gridEl) return;
  const desired = gallery2ColumnCount(box.clientWidth);
  if(desired !== gallery2LastColCount){ renderGallery2(); }
  else {
    const items = (gallery2Data.items || []).map(normalizeGalleryItem);
    const pairs = items.filter(it=> !gallery2FilterOpt || (it.opts||[]).includes(gallery2FilterOpt));
    applyGallery2Overlap(gridEl, pairs.length, gallery2LastColCount);
  }
}
const refreshGallery2LayoutDebounced = debounce(refreshGallery2Layout, 80);
window.addEventListener('resize', refreshGallery2LayoutDebounced);


function gallery2MediaHtml(it, url){
  return it.group ? galleryGroupStripHtml(it) : `<img src="${escapeHtml(url)}" loading="lazy" decoding="async">`;
}
function gallery2ActionButtonsHtml(idx, it, picking){
  if(!(isWidgetOpen('gallery2') && !picking)) return '';
  return `<button class="pin-del-btn" data-del="${idx}" title="삭제">✕</button>
      <button class="pin-blur-btn" data-blur="${idx}" title="${it.blur ? '블러 해제' : '블러 처리'}">${it.blur ? '🙈' : '👁'}</button>
      <button class="pin-opt-btn" data-opt-edit="${idx}" title="옵션 지정" style="bottom:4px;right:4px;top:auto;">🏷</button>`;
}
function gallery2TileHtml(it, i){
  const cover = galleryItemCover(it);
  if(cover.chunked && chunkedImageCache.has(cover.fileId)) return gallery2TileMarkup(it, chunkedImageCache.get(cover.fileId) || '', i);
  if(!cover.chunked) return gallery2TileMarkup(it, cover.url, i);
  return `<div class="pin-item-dense pin-loading" data-idx="${i}"><span>불러오는 중…</span></div>`;
}
function gallery2TileMarkup(it, url, i){
  const picking = isGalleryGroupPicking('gallery2');
  return `
    <div class="pin-item-dense ${it.blur ? 'blurred' : ''} ${it.group ? 'pin-item-group' : ''} ${picking ? 'pin-item-picking' : ''}" data-idx="${i}">
      ${gallery2MediaHtml(it, url)}
      ${galleryPickOverlayHtml('gallery2', i)}
      ${gallery2ActionButtonsHtml(i, it, picking)}
    </div>`;
}
function fillGallery2Tile(tile, idx, url, it){
  if(!tile.isConnected) return;
  const picking = isGalleryGroupPicking('gallery2');
  tile.classList.remove('pin-loading');
  tile.classList.toggle('pin-item-group', !!it.group);
  tile.classList.toggle('pin-item-picking', picking);
  tile.innerHTML = `
    ${gallery2MediaHtml(it, url)}
    ${galleryPickOverlayHtml('gallery2', idx)}
    ${gallery2ActionButtonsHtml(idx, it, picking)}
  `;
  if(it.blur) tile.classList.add('blurred');
  if(it.group) loadGalleryGroupStrips(tile, it);
  else attachImgFallback(tile.querySelector('img'));
}
async function handleGallery2Delete(idx){
  if(!(await confirmDelete('이 사진을 정말 삭제할까요?<br>되돌릴 수 없어요.'))) return;
  const items = (gallery2Data.items || []).map(normalizeGalleryItem);
  const arr = items.slice();
  const [removed] = arr.splice(idx,1);
  docRef('gallery2').set({items:arr}, {merge:true});
  deleteGalleryImageIfChunked(removed);
}
function handleGallery2BlurToggle(idx){
  const items = (gallery2Data.items || []).map(normalizeGalleryItem);
  const arr = items.slice();
  arr[idx] = { ...arr[idx], blur: !arr[idx].blur };
  const tile = document.querySelector(`#gallery2Grid .pin-item-dense[data-idx="${idx}"]`);
  if(tile){
    tile.classList.toggle('blurred', arr[idx].blur);
    const blurBtn = tile.querySelector('[data-blur]');
    if(blurBtn){ blurBtn.textContent = arr[idx].blur ? '🙈' : '👁'; blurBtn.title = arr[idx].blur ? '블러 해제' : '블러 처리'; }
  }
  skipNextGallery2Render = true;
  docRef('gallery2').set({ items: arr }, {merge:true});
}
function handleGallery2OptEdit(idx){
  const items = (gallery2Data.items || []).map(normalizeGalleryItem);
  openItemOptEditModal(items[idx].opts, sharedGalleryOptionsData.options, (opts)=>{
    const arr = items.slice();
    arr[idx] = { ...arr[idx], opts };
    if(!gallery2FilterOpt) skipNextGallery2Render = true;
    docRef('gallery2').set({ items: arr }, {merge:true}); // 응답을 기다리지 않아야 모달이 바로 닫힘
  });
}

function renderGallery2(){
  const box = document.getElementById('cardGallery2');
  if(!box) return;
  const prevScrollEl = document.getElementById('gallery2Grid');
  const savedScroll = prevScrollEl ? { top: prevScrollEl.scrollTop, left: prevScrollEl.scrollLeft } : { top:0, left:0 };
  const items = (gallery2Data.items || []).map(normalizeGalleryItem);
  const pairs = items.map((it,i)=>({it,i})).filter(({it})=> !gallery2FilterOpt || (it.opts||[]).includes(gallery2FilterOpt));
  // 카드 폭에 맞춰 열 개수를 정함(좁으면 1~2열, 넓으면 3열 이상). 레퍼런스 갤러리의 2열
  // row-major 배치 아이디어를 그대로 N열로 일반화: order % colCount로 각 열에 순서대로 담음
  const colCount = gallery2ColumnCount(box.clientWidth);
  gallery2LastColCount = colCount;
  const cols = Array.from({length: colCount}, ()=> []);
  pairs.forEach(({it,i}, order)=> cols[order % colCount].push(gallery2TileHtml(it, i)));
  const colsHtml = pairs.length>0
    ? cols.map(colArr=> `<div class="gallery2-col">${colArr.join('')}</div>`).join('')
    : '';
  box.innerHTML = `
    ${widgetEditToggleBtnHtml('gallery2', '갤러리2 위젯 편집')}
    <div class="pin-toolbar">
      <div class="tag-filter" id="gallery2FilterChips" style="display:none;"></div>
      ${isWidgetOpen('gallery2') ? `<button class="btn small ghost" id="gal2OptsBtn">⚙ 옵션 관리</button>` : ''}
      ${isWidgetOpen('gallery2') ? galleryGroupPickToggleBtnHtml('gallery2', 'gal2GroupPickBtn') : ''}
    </div>
    ${galleryGroupPickBarHtml('gallery2')}
    <div class="gallery2-grid" id="gallery2Grid">
      ${colsHtml}
      ${items.length===0 ? `<div class="w-empty">아직 사진이 없어요</div>` : ''}
      ${pairs.length===0 && items.length>0 ? `<div class="w-empty">이 옵션에 해당하는 사진이 없어요</div>` : ''}
    </div>
    ${editMode ? `<button class="gallery-add-fab" id="galAddBtn2" title="사진 추가">＋</button>` : ''}
  `;
  const gridEl = box.querySelector('#gallery2Grid');
  restoreScrollPos(gridEl, savedScroll);
  // 레퍼런스 갤러리는 자기 렌더링 안에서 fitRefGalleryToCalendarHeight()를 직접 불러서
  // 카드 높이를 먼저 확정한 뒤에 지연 로딩을 걸었는데, 갤러리2는 이 호출이 빠져 있어서
  // 캘린더 쪽 렌더링이 끝나기 전엔 카드 높이가 "내용물 크기만큼" 그대로 늘어나 있었음.
  // 이 상태에서 지연 로딩 관찰자를 걸면(root가 그리드 자기 자신이라) 관찰자 입장에서는
  // 이미 모든 사진이 "보이는 중"인 셈이 되어, 화면에 없는 사진까지 전부 한꺼번에 불러와
  // 버림(사진이 많을수록 초기 로딩이 크게 느려지는 원인). 레퍼런스 갤러리와 똑같이
  // 여기서도 직접 호출해서, 어느 쪽 스냅샷이 먼저 도착하든 항상 높이가 먼저 확정되게 함
  fitRefGalleryToCalendarHeight();
  applyGallery2Overlap(gridEl, pairs.length, colCount);
  renderOptionFilterChips(box.querySelector('#gallery2FilterChips'), sharedGalleryOptionsData.options, gallery2FilterOpt, (opt)=>{ gallery2FilterOpt = opt; renderGallery2(); });
  gridEl.querySelectorAll('.pin-item-dense:not(.pin-loading) img').forEach(attachImgFallback);
  gridEl.querySelectorAll('.pin-item-dense.pin-item-group').forEach(tile=> loadGalleryGroupStrips(tile, items[Number(tile.dataset.idx)]));

  // 열기/삭제/블러/옵션 지정 클릭을 그리드 전체에 한 번만 위임(지연 로딩으로 타일이
  // 나중에 채워져도 다시 걸어줄 필요 없음)
  gridEl.addEventListener('click', (e)=>{
    const tile = e.target.closest('.pin-item-dense:not(.pin-loading)');
    if(isGalleryGroupPicking('gallery2')){
      if(tile) toggleGalleryGroupPickItem('gallery2', Number(tile.dataset.idx), items[Number(tile.dataset.idx)], renderGallery2);
      return;
    }
    const delBtn = e.target.closest('[data-del]');
    if(delBtn){ e.stopPropagation(); handleGallery2Delete(Number(delBtn.dataset.del)); return; }
    const blurBtn = e.target.closest('[data-blur]');
    if(blurBtn){ e.stopPropagation(); handleGallery2BlurToggle(Number(blurBtn.dataset.blur)); return; }
    const optBtn = e.target.closest('[data-opt-edit]');
    if(optBtn){ e.stopPropagation(); handleGallery2OptEdit(Number(optBtn.dataset.optEdit)); return; }
    if(tile) openGallery2ViewModal(Number(tile.dataset.idx));
  });

  const addBtn = box.querySelector('#galAddBtn2');
  if(addBtn) addBtn.onclick = openGallery2AddModal;
  const optsBtn2 = box.querySelector('#gal2OptsBtn');
  if(optsBtn2) optsBtn2.onclick = ()=> openOptionsManagerModal('sharedGalleryOptions', sharedGalleryOptionsData.options, (options)=>{ sharedGalleryOptionsData = {options}; renderGallery2(); });
  const groupPickBtn2 = box.querySelector('#gal2GroupPickBtn');
  if(groupPickBtn2) groupPickBtn2.onclick = ()=> toggleGalleryGroupPickMode('gallery2', renderGallery2);
  const pickCancelBtn2 = box.querySelector('#galPickCancel');
  if(pickCancelBtn2) pickCancelBtn2.onclick = ()=> cancelGalleryGroupPick(renderGallery2);
  const pickTagBtn2 = box.querySelector('#galPickTag');
  if(pickTagBtn2) pickTagBtn2.onclick = ()=> confirmGalleryGroupTag('gallery2', items, (arr)=> docRef('gallery2').set({items:arr}, {merge:true}), renderGallery2);
  const pickConfirmBtn2 = box.querySelector('#galPickConfirm');
  if(pickConfirmBtn2) pickConfirmBtn2.onclick = ()=> confirmGalleryGroupPick('gallery2', items, (arr)=> docRef('gallery2').set({items:arr}, {merge:true}), renderGallery2);
  if(!isGalleryGroupPicking('gallery2')) bindPinDragReorder(
    gridEl, '.pin-item-dense',
    ()=> items.slice(),
    async (arr)=> docRef('gallery2').set({items:arr}, {merge:true}),
    { pointerLine: true, rowMajor: true, widgetKey: 'gallery2' }
  );
  setupPinGalleryLazyLoad(gridEl, pairs, gallery2ObserverHolder, '.pin-item-dense.pin-loading',
    (tile, idx, url, it)=> fillGallery2Tile(tile, idx, url, it));
}

function openGallery2ViewModal(idx){
  openGalleryLightboxCore(idx, {
    getItems: ()=> gallery2Data.items,
    normalize: normalizeGalleryItem,
    save: (arr)=> docRef('gallery2').set({items:arr}, {merge:true}),
    getFilterOpt: ()=> gallery2FilterOpt,
    markSkipRender: ()=>{ if(!gallery2FilterOpt) skipNextGallery2Render = true; },
    reopen: (i)=> openGallery2ViewModal(i)
  });
}

function openGallery2AddModal(){
  openGalleryAddModalCore({ idPrefix:'gal2', getData:()=>gallery2Data, normalize:normalizeGalleryItem, collection:'gallery2' });
}

deferToTab2(()=> docRef('gallery2').onSnapshot(doc=>{
  gallery2Data = doc.exists ? doc.data() : {items:[]};
  if(skipNextGallery2Render){ skipNextGallery2Render = false; }
  else { renderGallery2(); }
  if(editMode) migrateInlineGalleryImages('gallery2', ()=> gallery2Data.items || []);
}));

/* ---------------- 6-3. 레퍼런스 갤러리 (캘린더 옆, 완전히 독립된 세 번째 갤러리)
   작고 촘촘한 정사각형 썸네일. 다른 갤러리들과 똑같이 옵션(태그)만 붙일 수 있음 ---------------- */

function normalizeRefGalleryItem(it){
  if(typeof it === 'string') return { url: it, opts: [] };
  if(it.group && Array.isArray(it.images)) return { group:true, images: it.images.map(normalizeGalleryImageRef), opts: it.opts || (it.opt ? [it.opt] : []) };
  if(it.chunked) return { chunked:true, fileId: it.fileId, chunkTotal: it.chunkTotal, opts: it.opts || (it.opt ? [it.opt] : []) };
  return { url: it.url, opts: it.opts || (it.opt ? [it.opt] : []) };
}

let refGalleryData = { items: [] };
let refGalleryFilterOpt = null;
// 레퍼런스 갤러리 열 개수: PC에서는 2열, 모바일(폭이 좁아지는 구간)에서는 3열로
// 더 촘촘하게 보이도록 함. 다른 반응형 기준과 동일하게 900px을 모바일 경계로 씀
function refGalleryColumnCount(){
  return window.innerWidth <= 900 ? 3 : 2;
}
let refGalleryLastColCount = refGalleryColumnCount();
/* 태그(옵션)만 바뀌었을 땐 화면에 보이는 사진 구성/순서가 그대로라 그리드를 통째로
   다시 그릴 필요가 없음(태그는 타일에 표시되지 않고 필터링에만 쓰임). 사진이 많이
   쌓이면 매번 전체를 다시 그리는 비용이 커져서 태그 지정이 느려지므로, 필터가 꺼져
   있을 때 태그만 바꾸는 경우엔 이 플래그로 다음 스냅샷의 무거운 재렌더링을 건너뜀 */
let skipNextRefGalleryRender = false;

/* 썸네일 한 줄의 실제 렌더링 높이를 재서, 마지막 줄이 어중간하게 잘려 보이지 않도록
   "딱 완전한 N줄 높이"로만 스크롤 영역 높이를 고정함 (대략 440px 안쪽에서 꽉 채우는 줄 수를 고름) */
/* 레퍼런스 갤러리 안쪽 그리드의 높이를 "캘린더 위젯의 실제 높이"에 딱 맞춰 고정함.
   ref-gallery-grid에 overflow-y:auto가 걸려 있어서, 사진이 이 높이보다 많아지면
   내부 스크롤로만 늘어나고 카드 자체(그리고 같은 행에 있는 캘린더)는 절대 커지지 않음.
   반대로 캘린더 쪽 높이는 이 함수가 전혀 건드리지 않으므로, 캘린더가 레퍼런스 갤러리를
   따라 늘어나는 일도 없음(캘린더가 기준, 레퍼런스 갤러리가 거기에 맞추는 일방향) */
function fitRefGalleryToCalendarHeight(){
  const calCard = document.getElementById('cardCalendar');
  const refCard = document.getElementById('cardRefGallery');
  // row-refpair에서 레퍼런스 갤러리와 나란히 놓이는 갤러리2도 같이 잡아줌.
  // (레퍼런스 갤러리만 캘린더 높이에 맞추고 갤러리2는 내용물 높이만큼 자유롭게
  // 자라던 예전 방식에서는, 사진 개수가 서로 다르면 PC에서 두 카드 높이가
  // 어긋나 보이는 문제가 있었음 → 같은 값을 두 카드 모두에 명시적으로 줘서 항상 일치시킴)
  const gallery2Card = document.getElementById('cardGallery2');
  if(!calCard || !refCard) return;
  // 모바일(카드가 세로로 한 열로 쌓이는 폭)에서는 캘린더와 레퍼런스 갤러리가 서로
  // 다른 줄(row)에 놓이므로 높이를 맞출 이유가 없고, 오히려 캘린더 높이를 그대로
  // 강제하면 레퍼런스 갤러리 카드가 실제 사진 내용보다 커져서 하단에 빈 여백만
  // 남게 됨. 이 폭 이하에서는 보정을 끄고 자연스러운(내용에 맞는) 높이로 둠.
  if(window.innerWidth <= 900){
    refCard.style.height = '';
    if(gallery2Card) gallery2Card.style.height = '';
    return;
  }
  // 캘린더의 "진짜" 높이(=레퍼런스 갤러리 없이 음악/디데이 칸과만 맞췄을 때의 높이)를 재려면
  // 레퍼런스 갤러리 카드를 잠깐 행 계산에서 완전히 빼야 함(display:none).
  const prevDisplay = refCard.style.display;
  refCard.style.display = 'none';
  const calH = calCard.getBoundingClientRect().height;
  refCard.style.display = prevDisplay;
  if(!calH) return;
  // 그리드(flex:1, flex-basis:0)에 직접 height를 줘도 flex-grow가 다시 채워버려 소용없으므로,
  // 그리드 아이템인 카드 자체에 명시적 높이를 줌. 그리드 아이템은 명시적 높이가 있으면
  // align-items:stretch를 무시하고 그 값 그대로 확정되고, 안쪽 flex:1 그리드는 그 안에서만
  // 채워지다가 사진이 넘치면 overflow-y:auto로 스크롤됨.
  // 캘린더보다 조금 더 작게(-120) 잡았었는데, 세 갤러리를 모두 더 길게 늘려달라는
  // 요청으로 +200px만큼 더 키움(캘린더보다 오히려 커질 수 있음).
  const targetH = `${Math.max(200, Math.round(calH) + 80)}px`;
  refCard.style.height = targetH;
  // 갤러리2도 정확히 같은 값으로 고정 → 두 카드가 항상 같은 높이가 되고,
  // 안쪽 gallery2-grid(flex:1, overflow-y:auto)도 이제 부모 높이가 생겼으니
  // 사진이 넘칠 때 카드 자체가 커지지 않고 내부 스크롤로만 처리됨.
  if(gallery2Card) gallery2Card.style.height = targetH;
}
window.addEventListener('resize', debounce(()=>{
  // PC(2열) ↔ 모바일(3열) 경계를 넘어가면 열 구성 자체가 달라지므로 다시 그려야 함
  if(refGalleryColumnCount() !== refGalleryLastColCount){
    renderRefGallery();
    return;
  }
  fitRefGalleryToCalendarHeight();
  applyRefGalleryOverlap(document.getElementById('refGalleryGrid'), currentRefGalleryVisibleCount());
}, 150));

/* 사진이 많아질수록(행이 늘어날수록) 썸네일끼리 조금씩 더 겹치게 하되,
   REF_GALLERY_OVERLAP_MAX(썸네일 한 변 길이 대비 겹치는 비율)를 넘어서는 절대 더 겹치지 않도록 상한선을 둠.
   → 사진이 아무리 많아도 각 썸네일은 항상 최소 (1 - REF_GALLERY_OVERLAP_MAX)만큼은 보임.
   실제 렌더링된 썸네일 크기를 직접 재서 계산하므로 화면 크기가 달라져도(반응형) 항상 같은 비율로 동작함. */
const REF_GALLERY_OVERLAP_STEP = 0.08; // 행이 하나 늘어날 때마다 겹침 비율이 커지는 정도(취향껏 조절 가능)
const REF_GALLERY_OVERLAP_MAX = 0.7;   // 겹침 비율 상한. 0.7 = 최대 70%까지 겹침 = 최소 30%는 항상 보임

function currentRefGalleryVisibleCount(){
  const items = (refGalleryData.items || []).map(normalizeRefGalleryItem);
  return items.filter(it => !refGalleryFilterOpt || (it.opts||[]).includes(refGalleryFilterOpt)).length;
}

function applyRefGalleryOverlap(gridEl, itemCount, colCount){
  if(!gridEl) return;
  // 편집모드에서는 순서 변경(드래그) 작업을 하기 편하도록 겹침을 끄고 타일을 나란히 둠
  if(editMode){ gridEl.style.setProperty('--ref-overlap-px', '0px'); return; }
  colCount = colCount || refGalleryColumnCount();
  const firstTile = gridEl.querySelector('.pin-item-dense');
  if(!firstTile){ gridEl.style.setProperty('--ref-overlap-px', '0px'); return; }
  const tileSize = firstTile.getBoundingClientRect().height || firstTile.getBoundingClientRect().width;
  if(!tileSize) return;
  const rows = Math.ceil(itemCount / colCount);
  const overlapRatio = Math.min(REF_GALLERY_OVERLAP_MAX, Math.max(0, (rows - 1) * REF_GALLERY_OVERLAP_STEP));
  gridEl.style.setProperty('--ref-overlap-px', `-${(tileSize * overlapRatio).toFixed(1)}px`);
}

function renderRefGallery(){
  const box = document.getElementById('cardRefGallery');
  if(!box) return;
  const prevScrollEl = document.getElementById('refGalleryGrid');
  const savedScroll = prevScrollEl ? { top: prevScrollEl.scrollTop, left: prevScrollEl.scrollLeft } : { top:0, left:0 };
  // 옵션 칩 목록도 한 줄로 옆으로 스크롤되는 영역이라, 칩을 골라 다시 그릴 때마다
  // 스크롤이 맨 앞으로 튕기지 않도록 그리기 전에 위치를 저장해둠
  const prevChipsEl = document.getElementById('refGalleryFilterChips');
  const savedChipsScroll = prevChipsEl ? prevChipsEl.scrollLeft : 0;
  const items = (refGalleryData.items || []).map(normalizeRefGalleryItem);
  const pairs = items.map((it,i)=>({it,i})).filter(({it})=> !refGalleryFilterOpt || (it.opts||[]).includes(refGalleryFilterOpt));
  // 기존 grid의 row-major 배치(0번은 1열 1행, 1번은 2열 1행, ... 마지막 열까지 채우면
  // 다음 행으로)와 동일한 순서가 되도록, pairs 안에서의 순서(order)를 열 개수만큼
  // 나눠 각 열에 담음. 열 개수는 PC 2열 / 모바일 3열로 화면 폭에 따라 달라짐
  const colCount = refGalleryColumnCount();
  refGalleryLastColCount = colCount;
  const cols = Array.from({length: colCount}, ()=> []);
  pairs.forEach(({it,i}, order)=> cols[order % colCount].push(renderRefGalleryTileHtml(it, i)));
  const colsHtml = pairs.length>0
    ? cols.map(c=> `<div class="ref-gallery-col">${c.join('')}</div>`).join('')
    : '';
  box.innerHTML = `
    ${widgetEditToggleBtnHtml('refgallery', '레퍼런스 갤러리 위젯 편집')}
    <div class="pin-toolbar">
      <div class="tag-filter" id="refGalleryFilterChips" style="display:none;"></div>
      ${isWidgetOpen('refgallery') ? `<button class="btn small ghost" id="refGalOptsBtn">⚙ 옵션 관리</button>` : ''}
      ${isWidgetOpen('refgallery') ? galleryGroupPickToggleBtnHtml('refgallery', 'refGalGroupPickBtn') : ''}
    </div>
    ${galleryGroupPickBarHtml('refgallery')}
    <div class="ref-gallery-grid" id="refGalleryGrid">
      ${colsHtml}
      ${items.length===0 ? `<div class="w-empty">아직 사진이 없어요</div>` : ''}
      ${pairs.length===0 && items.length>0 ? `<div class="w-empty">이 옵션에 해당하는 사진이 없어요</div>` : ''}
    </div>
    ${editMode ? `<button class="gallery-add-fab" id="refGalAddBtn" title="사진 추가">＋</button>` : ''}
  `;
  const gridEl = box.querySelector('#refGalleryGrid');
  restoreScrollPos(gridEl, savedScroll);
  fitRefGalleryToCalendarHeight();
  applyRefGalleryOverlap(gridEl, pairs.length, colCount);
  renderOptionFilterChips(box.querySelector('#refGalleryFilterChips'), sharedGalleryOptionsData.options, refGalleryFilterOpt, (opt)=>{ refGalleryFilterOpt = opt; renderRefGallery(); });
  const chipsEl = box.querySelector('#refGalleryFilterChips');
  if(chipsEl) chipsEl.scrollLeft = savedChipsScroll;

  gridEl.querySelectorAll('.pin-item-dense:not(.pin-loading) img').forEach(attachImgFallback);
  gridEl.querySelectorAll('.pin-item-dense.pin-item-group').forEach(tile=> loadGalleryGroupStrips(tile, items[Number(tile.dataset.idx)]));

  // 열기/삭제/옵션 지정 클릭을 그리드 전체에 한 번만 위임해서 걸어둠.
  // 이렇게 하면 나중에 낱장 사진이 지연 로딩으로 채워져도(pin-loading → 실제 이미지)
  // 다시 걸어줄 필요가 없음
  gridEl.addEventListener('click', (e)=>{
    const tile = e.target.closest('.pin-item-dense:not(.pin-loading)');
    if(isGalleryGroupPicking('refgallery')){
      if(tile) toggleGalleryGroupPickItem('refgallery', Number(tile.dataset.idx), items[Number(tile.dataset.idx)], renderRefGallery);
      return;
    }
    const delBtn = e.target.closest('[data-del]');
    if(delBtn){ e.stopPropagation(); handleRefGalleryDelete(Number(delBtn.dataset.del)); return; }
    const optBtn = e.target.closest('[data-opt-edit]');
    if(optBtn){ e.stopPropagation(); handleRefGalleryOptEdit(Number(optBtn.dataset.optEdit)); return; }
    if(tile) openRefGalleryViewModal(Number(tile.dataset.idx));
  });

  const addBtn = box.querySelector('#refGalAddBtn');
  if(addBtn) addBtn.onclick = openRefGalleryAddModal;
  const optsBtn = box.querySelector('#refGalOptsBtn');
  if(optsBtn) optsBtn.onclick = ()=> openOptionsManagerModal('sharedGalleryOptions', sharedGalleryOptionsData.options, (options)=>{ sharedGalleryOptionsData = {options}; renderRefGallery(); });
  const groupPickBtnRef = box.querySelector('#refGalGroupPickBtn');
  if(groupPickBtnRef) groupPickBtnRef.onclick = ()=> toggleGalleryGroupPickMode('refgallery', renderRefGallery);
  const pickCancelBtnRef = box.querySelector('#galPickCancel');
  if(pickCancelBtnRef) pickCancelBtnRef.onclick = ()=> cancelGalleryGroupPick(renderRefGallery);
  const pickTagBtnRef = box.querySelector('#galPickTag');
  if(pickTagBtnRef) pickTagBtnRef.onclick = ()=> confirmGalleryGroupTag('refgallery', items, (arr)=> docRef('refgallery').set({items:arr}, {merge:true}), renderRefGallery);
  const pickConfirmBtnRef = box.querySelector('#galPickConfirm');
  if(pickConfirmBtnRef) pickConfirmBtnRef.onclick = ()=> confirmGalleryGroupPick('refgallery', items, (arr)=> docRef('refgallery').set({items:arr}, {merge:true}), renderRefGallery);

  // 드래그 순서 변경은 로딩 중인 타일까지 포함해서 한 번만 걸어둠. 타일 엘리먼트 자체는
  // 사진이 나중에 채워져도 같은 노드를 그대로 재사용하기 때문에 다시 걸 필요가 없음
  if(!isGalleryGroupPicking('refgallery')) bindPinDragReorder(
    gridEl, '.pin-item-dense',
    ()=> items.slice(),
    async (arr)=> docRef('refgallery').set({items:arr}, {merge:true}),
    { pointerLine: true, rowMajor: true, widgetKey: 'refgallery' }
  );

  setupRefGalleryLazyLoad(gridEl, pairs);
}

/* 이미 이번 세션에서 한 번 불러와 캐시된 사진(또는 애초에 다운로드가 필요 없는 외부 URL)은
   바로 표시하고, 아직 안 불러온 청크 사진만 빈 플레이스홀더로 그림 — 실제 로딩은
   setupRefGalleryLazyLoad가 화면 근처로 스크롤됐을 때 시작함 */
function refGalleryMediaHtml(it, url){
  return (it && it.group) ? galleryGroupStripHtml(it) : `<img src="${escapeHtml(url)}" loading="lazy" decoding="async">`;
}
function refGalleryActionButtonsHtml(idx, it, picking){
  if(!(isWidgetOpen('refgallery') && !picking)) return '';
  return `<button class="pin-del-btn" data-del="${idx}" title="삭제">✕</button>
      <button class="pin-opt-btn" data-opt-edit="${idx}" title="옵션 지정" style="top:4px;right:4px;">🏷</button>`;
}
function renderRefGalleryTileHtml(it, i){
  const cover = galleryItemCover(it);
  if(cover.chunked && chunkedImageCache.has(cover.fileId)) return refGalleryTileMarkup(it, chunkedImageCache.get(cover.fileId) || '', i);
  if(!cover.chunked) return refGalleryTileMarkup(it, cover.url, i);
  return `<div class="pin-item-dense pin-loading" data-idx="${i}"><span>...</span></div>`;
}

function refGalleryTileMarkup(it, url, i){
  const picking = isGalleryGroupPicking('refgallery');
  return `
    <div class="pin-item-dense ${it.group ? 'pin-item-group' : ''} ${picking ? 'pin-item-picking' : ''}" data-idx="${i}">
      ${refGalleryMediaHtml(it, url)}
      ${galleryPickOverlayHtml('refgallery', i)}
      ${refGalleryActionButtonsHtml(i, it, picking)}
    </div>`;
}

/* 지연 로딩 자체는 setupPinGalleryLazyLoad(공용 함수, 갤러리/갤러리2와 공유)가 처리함 */
let refGalleryObserverHolder = { current: null };
function setupRefGalleryLazyLoad(gridEl, pairs){
  setupPinGalleryLazyLoad(gridEl, pairs, refGalleryObserverHolder, '.pin-item-dense.pin-loading',
    (tile, idx, url, it)=> fillRefGalleryTile(tile, idx, url, it));
}

function fillRefGalleryTile(tile, idx, url, it){
  if(!tile.isConnected) return; // 그사이 그리드가 다시 그려져서 이 타일이 이미 화면에서 빠졌으면 무시
  const picking = isGalleryGroupPicking('refgallery');
  tile.classList.remove('pin-loading');
  tile.classList.toggle('pin-item-group', !!(it && it.group));
  tile.classList.toggle('pin-item-picking', picking);
  tile.innerHTML = `
    ${refGalleryMediaHtml(it, url)}
    ${galleryPickOverlayHtml('refgallery', idx)}
    ${refGalleryActionButtonsHtml(idx, it, picking)}
  `;
  if(it && it.group) loadGalleryGroupStrips(tile, it);
  else attachImgFallback(tile.querySelector('img'));
}

async function handleRefGalleryDelete(idx){
  if(!(await confirmDelete('이 사진을 정말 삭제할까요?<br>되돌릴 수 없어요.'))) return;
  const items = (refGalleryData.items || []).map(normalizeRefGalleryItem);
  const removed = items[idx];
  const arr = items.slice(); arr.splice(idx,1);
  docRef('refgallery').set({items:arr}, {merge:true});
  deleteGalleryImageIfChunked(removed);
}

function handleRefGalleryOptEdit(idx){
  const items = (refGalleryData.items || []).map(normalizeRefGalleryItem);
  openItemOptEditModal(items[idx].opts, sharedGalleryOptionsData.options, (opts)=>{
    const arr = items.slice();
    arr[idx] = { ...arr[idx], opts };
    // 필터가 꺼져 있으면 태그만 바꿔선 화면에 보이는 사진 구성이 안 바뀌므로 재렌더링 생략
    if(!refGalleryFilterOpt) skipNextRefGalleryRender = true;
    docRef('refgallery').set({ items: arr }, {merge:true}); // 응답을 기다리지 않아야 모달이 바로 닫힘
  });
}

function openRefGalleryViewModal(idx){
  openGalleryLightboxCore(idx, {
    getItems: ()=> refGalleryData.items,
    normalize: normalizeRefGalleryItem,
    save: (arr)=> docRef('refgallery').set({items:arr}, {merge:true}),
    getFilterOpt: ()=> refGalleryFilterOpt,
    markSkipRender: ()=>{ if(!refGalleryFilterOpt) skipNextRefGalleryRender = true; },
    reopen: (i)=> openRefGalleryViewModal(i)
  });
}

function openRefGalleryAddModal(){
  openGalleryAddModalCore({
    idPrefix:'refGal', title:'레퍼런스 사진 추가', hasBlur:false,
    groupLabel:'여러 장을 골랐다면, 낱장으로 따로 올리지 않고 한 장(칸 한 칸)으로 묶어서 올리기 — 눌러서 넘겨볼 수 있어요',
    getData:()=>refGalleryData, normalize:normalizeRefGalleryItem, collection:'refgallery'
  });
}

deferToTab2(()=> docRef('refgallery').onSnapshot(doc=>{
  refGalleryData = doc.exists ? doc.data() : {items:[]};
  // 데이터는 항상 최신으로 갱신하되, 태그만 바뀐 경우엔 무거운 전체 그리드 재렌더링을 건너뜀
  if(skipNextRefGalleryRender){ skipNextRefGalleryRender = false; }
  else { renderRefGallery(); }
  if(editMode) migrateInlineGalleryImages('refgallery', ()=> refGalleryData.items || []);
}));

/* ---------------- 5-1. 영상전용 플레이어 (갤러리 탭, 유튜브 링크 여러 개를 목록에서 골라 재생) ---------------- */
// 사진과 달리 영상은 원본을 우리 쪽에 저장하지 않고(용량이 너무 큼) 유튜브 링크만
// 저장해서 링크당 몇십 바이트 수준이라 청크 저장 같은 건 필요 없음. 재생은 그냥
// 표준 유튜브 임베드 iframe을 씀 (음악위젯의 숨겨진 오디오용 YT.Player API와는 별개 —
// 여긴 화면에 그대로 보여지는 "영상 전용" 재생이라 굳이 API로 제어할 필요가 없음).

let videosData = { items: [] };
let currentVideoIdx = 0;
// 평소엔 썸네일 목록만 보이다가, 목록에서 하나를 누르면 그 자리 위쪽으로 플레이어가
// 펼쳐지는 방식(팝업 X, 화면을 덮지 않고 카드 안에서 인라인으로 커짐). 안 보는 동안엔
// videoExpanded가 false라 플레이어(iframe)를 아예 렌더링하지 않아서 공간도 차지하지
// 않고 불필요한 로드도 안 함.
let videoExpanded = false;

function renderVideoPlayer(){
  const holder = document.getElementById('videoPlayer');
  const row = document.getElementById('refpairRow');
  const items = videosData.items || [];
  row.classList.toggle('video-open', videoExpanded && !!items.length);
  if(!videoExpanded || !items.length){
    holder.innerHTML = '';
    holder.classList.remove('open');
    return;
  }
  holder.classList.add('open');
  if(currentVideoIdx >= items.length) currentVideoIdx = items.length - 1;
  const cur = items[currentVideoIdx];
  const ytId = extractYouTubeId(cur.url);
  holder.innerHTML = `
    <button class="video-collapse" id="videoCollapseBtn" type="button" title="닫기">✕</button>
    ${ytId
      ? `<iframe src="https://www.youtube.com/embed/${ytId}?autoplay=1" title="${escapeHtml(cur.title || '')}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
      : `<div class="w-empty">영상 링크를 확인할 수 없어요</div>`}
  `;
  document.getElementById('videoCollapseBtn').addEventListener('click', (e)=>{
    e.stopPropagation();
    videoExpanded = false;
    renderVideos();
  });
}

function renderVideos(){
  syncCardEditToggle('cardVideo', 'video', '영상 위젯 편집');
  renderVideoPlayer();
  const list = document.getElementById('videoList');
  const items = videosData.items || [];
  if(!items.length){
    list.innerHTML = `<div class="w-empty">아직 등록된 영상이 없어요</div>`;
  } else {
    list.innerHTML = items.map((v, i)=> `
      <div class="video-item ${videoExpanded && i===currentVideoIdx ? 'active' : ''}" data-idx="${i}">
        <div class="video-thumb" style="background-image:url('https://img.youtube.com/vi/${extractYouTubeId(v.url) || ''}/hqdefault.jpg')"></div>
        <div class="video-title">${escapeHtml(v.title || '제목 없음')}</div>
        ${isWidgetOpen('video') ? `<button class="video-del" data-del="${i}" type="button">✕</button>` : ''}
      </div>
    `).join('');
  }
  list.querySelectorAll('.video-item').forEach(el=> el.addEventListener('click', (e)=>{
    if(e.target.closest('[data-del]')) return;
    const idx = Number(el.dataset.idx);
    // 펼쳐진 채로 재생 중인 걸 다시 누르면 접히고, 그 외엔 그 영상으로 펼쳐짐
    if(videoExpanded && idx === currentVideoIdx){ videoExpanded = false; }
    else { currentVideoIdx = idx; videoExpanded = true; }
    renderVideos();
  }));
  list.querySelectorAll('[data-del]').forEach(btn=> btn.addEventListener('click', async (e)=>{
    e.stopPropagation();
    const idx = Number(btn.dataset.del);
    const target = items[idx];
    if(!(await confirmDelete(`"${escapeHtml(target && target.title || '이 영상')}"을 정말 삭제할까요?`))) return;
    if(videoExpanded && idx === currentVideoIdx) videoExpanded = false;
    const arr = [...(videosData.items||[])];
    arr.splice(idx, 1);
    await docRef('videos').set({ items: arr }, {merge:true});
    toast('영상을 삭제했어요');
  }));
  const addWrap = document.getElementById('videoAddWrap');
  addWrap.innerHTML = editMode ? `<button class="btn small" id="videoAddBtn" type="button">+ 영상 추가</button>` : '';
  if(editMode) document.getElementById('videoAddBtn').addEventListener('click', openVideoAddModal);
}

function openVideoAddModal(){
  openModal(`
    <h3>영상 추가</h3>
    <label>유튜브 링크</label>
    <input type="url" id="vUrl" placeholder="https://youtu.be/... 또는 https://www.youtube.com/watch?v=...">
    <label>제목 (선택)</label>
    <input type="text" id="vTitle" placeholder="영상 제목">
    <div class="modal-actions">
      <button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">추가</button>
    </div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const url = m.querySelector('#vUrl').value.trim();
      const title = m.querySelector('#vTitle').value.trim();
      if(!extractYouTubeId(url)){ toast('유튜브 링크를 확인해주세요'); return; }
      const arr = [...(videosData.items||[]), { id: uid(), url, title }];
      await docRef('videos').set({ items: arr }, {merge:true});
      currentVideoIdx = arr.length - 1;
      closeModal();
      toast('영상을 추가했어요');
    };
  });
}

deferToTab2(()=> docRef('videos').onSnapshot(doc=>{
  videosData = doc.exists ? doc.data() : {items:[]};
  renderVideos();
}));

/* ---------------- 6-1. 문서 정리 (갤러리와 세션카드 사이) ---------------- */

let docsData = { cards: [] };
let docOptionsData = { options: [] };
let docFilterOpt = null;
const DOC_FILE_MAX_BYTES = 650000; // 이 크기까지는 카드 문서 안에 바로 저장(가장 빠름)
const DOC_FILE_CHUNKED_MAX_BYTES = 8 * 1024 * 1024; // 이보다 크면 여러 문서로 나눠 저장(파이어스토리지 없이 8MB까지)

/* 문서목록은 (1) 태그 필터로 일부만 보이고 (2) 최신 문서가 위로 오도록 뒤집혀 보이므로,
   화면에 보이는 순서 그대로 드래그해서 재배열한 뒤 이걸 실제 저장 배열(오래된 게 앞)로
   되돌려야 함. 필터에 걸려 화면에 안 보이던 문서는 원래 있던 자리에 그대로 두고,
   화면에 보였던 문서들끼리만 자리를 바꿔치기함 */
function docsDisplayToRaw(displayCards){
  const rawOrder = displayCards.slice().reverse();
  const all = docsData.cards || [];
  const passFilter = c=> !docFilterOpt || (c.opts||(c.opt?[c.opt]:[])).includes(docFilterOpt);
  const slots = [];
  all.forEach((c,i)=>{ if(passFilter(c)) slots.push(i); });
  const result = [...all];
  slots.forEach((slotIdx, k)=>{ result[slotIdx] = rawOrder[k]; });
  return result;
}

function renderDocs(){
  syncCardEditToggle('cardDocs', 'docs', '문서 정리 위젯 편집');
  const list = document.getElementById('docList');
  const allCards = docsData.cards || [];
  renderOptionFilterChips(document.getElementById('docFilter'), docOptionsData.options, docFilterOpt, (opt)=>{ docFilterOpt = opt; renderDocs(); });
  // 새로 추가한 문서가 배열 맨 뒤에 붙는 구조라, 화면에는 최신 문서가 위로 오도록 뒤집어서 보여줌
  const pairs = allCards.map((c,i)=>({c,i})).filter(({c})=> !docFilterOpt || (c.opts||(c.opt?[c.opt]:[])).includes(docFilterOpt)).reverse();
  // data-idx는 드래그 순서변경용 "화면에 보이는 위치"(k), data-abs는 기존 클릭/수정/삭제가
  // 쓰는 "원본 배열 위치"(i) — 서로 다른 용도라 따로 둠
  list.innerHTML = pairs.map(({c,i}, k)=> `
    <div class="doc-row" data-idx="${k}" data-abs="${i}">
      ${isWidgetOpen('docs') ? `<span class="doc-drag-handle" title="드래그해서 순서 바꾸기">⠿</span>` : ''}
      <span class="doc-icon">${escapeHtml(c.icon || '📄')}</span>
      <div class="doc-main">
        <div class="doc-title">${escapeHtml(c.title)}</div>
        ${(c.opts||(c.opt?[c.opt]:[])).length ? `<div class="doc-opt-row">${(c.opts||(c.opt?[c.opt]:[])).map(o=> `<span class="doc-opt">${escapeHtml(o)}</span>`).join('')}</div>` : ''}
        ${c.desc ? `<div class="doc-desc">${escapeHtml(c.desc)}</div>` : ''}
      </div>
      ${isWidgetOpen('docs') ? `<button class="doc-edit" data-edit="${i}">✎</button>` : ''}
      ${isWidgetOpen('docs') ? `<button class="doc-del" data-del="${i}">✕</button>` : ''}
    </div>
  `).join('') || `<div class="w-empty">${docFilterOpt ? '이 옵션에 해당하는 문서가 없어요' : '정리된 문서가 없어요'}</div>`;

  list.querySelectorAll('.doc-row').forEach(row=> row.addEventListener('click', async (e)=>{
    if(e.target.closest('[data-edit]') || e.target.closest('[data-del]') || e.target.closest('.doc-drag-handle')) return;
    const idx = Number(row.dataset.abs);
    const c = docsData.cards[idx];
    if(!c) return;
    if(c.chunked){
      toast('문서를 불러오는 중…');
      try{
        const base64 = await loadFileChunked(c.fileId, c.chunkTotal);
        openDataUrlAsBlob(base64);
      }catch(err){ toast('파일을 불러오지 못했어요'); }
    } else if(c.link){
      if(c.link.startsWith('data:')) openDataUrlAsBlob(c.link);
      else window.open(c.link, '_blank', 'noopener');
    } else {
      toast('연결된 문서가 없어요');
    }
  }));

  list.querySelectorAll('[data-edit]').forEach(btn=> btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    openDocEditModal(Number(btn.dataset.edit));
  }));

  list.querySelectorAll('[data-del]').forEach(btn=> btn.addEventListener('click', async (e)=>{
    e.stopPropagation();
    const idx = Number(btn.dataset.del);
    const removed = docsData.cards[idx];
    if(!(await confirmDelete(`"${escapeHtml(removed && removed.title || '이 문서')}"를 정말 삭제할까요?`))) return;
    const arr = [...docsData.cards]; arr.splice(idx,1);
    await docRef('documents').set({cards:arr}, {merge:true});
    if(removed && removed.chunked) deleteFileChunked(removed.fileId, removed.chunkTotal).catch(()=>{});
  }));

  const wrap = document.getElementById('docAddWrap');
  wrap.innerHTML = editMode ? `<div class="doc-add-row"><button class="btn small doc-add" id="docAddBtn">+ 문서 추가</button>${isWidgetOpen('docs') ? `<button class="btn small ghost" id="docOptsBtn">⚙ 옵션 관리</button>` : ''}</div>` : '';
  const addBtn = document.getElementById('docAddBtn');
  if(addBtn) addBtn.onclick = openDocAddModal;
  const optsBtn = document.getElementById('docOptsBtn');
  if(optsBtn) optsBtn.onclick = openDocOptionsModal;

  // 편집모드에서 드래그로 순서를 바꿀 수 있게 함(다른 위젯의 사진 순서 변경과 동일한
  // 방식). 화면에 보이는 순서대로 재배열한 뒤 docsDisplayToRaw로 저장 배열에 반영함
  bindPinDragReorder(
    list, '.doc-row',
    ()=> pairs.map(({c})=> c),
    async (arr)=> docRef('documents').set({cards: docsDisplayToRaw(arr)}, {merge:true}),
    { pointerLine: true, widgetKey: 'docs' }
  );
}

function openDocAddModal(){
  openModal(`
    <h3>문서 추가</h3>
    <label>아이콘(이모지, 선택)</label><input type="text" id="dcIcon" placeholder="📄" maxlength="2">
    <label>제목</label><input type="text" id="dcTitle" placeholder="예: 설정집, 규칙 정리">
    <label>설명 (선택)</label><input type="text" id="dcDesc" placeholder="한 줄 설명">
    <label>옵션 (부제, 여러 개 선택 가능)</label>
    <div id="dcOptBox">${renderOptionCheckboxes(docOptionsData.options, [])}</div>
    <p class="hint">옵션 추가/수정은 "⚙ 옵션 관리"에서.</p>
    <div class="radio-row">
      <label><input type="radio" name="doc-src" value="link" checked> 링크로 연결</label>
      <label><input type="radio" name="doc-src" value="file"> 파일 올리기</label>
    </div>
    <div id="dcLinkWrap">
      <label>문서 링크 (구글드라이브 공유 링크 등)</label><input type="url" id="dcLink" placeholder="https://drive.google.com/...">
    </div>
    <div id="dcFileWrap" style="display:none">
      <label>파일 선택</label><input type="file" id="dcFile">
      <p class="hint">최대 ${Math.round(DOC_FILE_CHUNKED_MAX_BYTES/1024/1024)}MB까지 가능해요. (넘으면 "링크로 연결" 이용)</p>
    </div>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">추가</button></div>
  `, m=>{
    m.querySelectorAll('input[name="doc-src"]').forEach(r=> r.addEventListener('change', ()=>{
      const isLink = m.querySelector('input[name="doc-src"]:checked').value === 'link';
      m.querySelector('#dcLinkWrap').style.display = isLink ? '' : 'none';
      m.querySelector('#dcFileWrap').style.display = isLink ? 'none' : '';
    }));
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const title = m.querySelector('#dcTitle').value.trim();
      const desc = m.querySelector('#dcDesc').value.trim();
      const icon = m.querySelector('#dcIcon').value.trim();
      if(!title){ toast('제목을 입력해주세요'); return; }
      const isLink = m.querySelector('input[name="doc-src"]:checked').value === 'link';
      const opts = getCheckedOptionValues(m.querySelector('#dcOptBox'));
      let link = '';
      let chunkInfo = null;
      if(isLink){
        link = m.querySelector('#dcLink').value.trim();
      } else {
        const file = m.querySelector('#dcFile').files[0];
        if(file){
          if(file.size > DOC_FILE_CHUNKED_MAX_BYTES){
            toast(`파일이 너무 커요 (최대 ${Math.round(DOC_FILE_CHUNKED_MAX_BYTES/1024/1024)}MB). "링크로 연결"을 이용해주세요.`);
            return;
          }
          saveBtn.disabled = true; saveBtn.textContent = '처리 중…';
          let base64;
          try{ base64 = await fileToBase64(file); }
          catch(err){ toast('파일을 읽지 못했어요'); saveBtn.disabled=false; saveBtn.textContent='추가'; return; }
          // 파일 자체는 작아도(<DOC_FILE_MAX_BYTES), 이미 쌓여있는 다른 카드들과 합쳐서
          // 문서 전체가 안전 한도를 넘는지 먼저 확인 — 넘으면 청크 저장으로 전환
          const wouldBeCards = [...(docsData.cards||[]), { icon, title, desc, opts, link: base64 }];
          const tooBigForInline = file.size > DOC_FILE_MAX_BYTES || estimateCardsBytes(wouldBeCards) > DOC_TOTAL_SAFE_BYTES;
          if(tooBigForInline){
            try{ chunkInfo = await saveFileChunked(base64); }
            catch(err){ toast('저장하지 못했어요. 링크 방식을 이용해주세요.'); saveBtn.disabled=false; saveBtn.textContent='추가'; return; }
          } else {
            link = base64;
          }
        }
      }
      const newCard = { icon, title, desc, opts, link };
      if(chunkInfo){ newCard.chunked = true; newCard.fileId = chunkInfo.fileId; newCard.chunkTotal = chunkInfo.total; }
      const updatedCards = [...(docsData.cards||[]), newCard];
      try{
        await docRef('documents').set({ cards: updatedCards }, {merge:true});
      }catch(err){
        toast('저장하지 못했어요. 링크 방식을 이용해주세요.');
        saveBtn.disabled = false; saveBtn.textContent = '추가';
        return;
      }
      docsData = { ...docsData, cards: updatedCards };
      renderDocs();
      closeModal();
    };
  });
}

docRef('documents').onSnapshot(doc=>{ docsData = doc.exists ? doc.data() : {cards:[]}; renderDocs(); });
docRef('docOptions').onSnapshot(doc=>{ docOptionsData = doc.exists ? doc.data() : {options:[]}; renderDocs(); });

function openDocOptionsModal(){
  openOptionsManagerModal('docOptions', docOptionsData.options||[], (options)=>{
    docOptionsData = { options };
    renderDocs();
  });
}

function openDocEditModal(idx){
  const c = docsData.cards[idx];
  const currentDesc = c.chunked ? '파일 (자동 분할 저장됨)' : (c.link ? (c.link.startsWith('data:') ? '파일 (직접 저장됨)' : '링크') : '없음');
  openModal(`
    <h3>문서 수정</h3>
    <label>아이콘(이모지, 선택)</label><input type="text" id="dcIcon" placeholder="📄" maxlength="2" value="${escapeHtml(c.icon||'')}">
    <label>제목</label><input type="text" id="dcTitle" value="${escapeHtml(c.title||'')}">
    <label>설명 (선택)</label><input type="text" id="dcDesc" value="${escapeHtml(c.desc||'')}">
    <label>옵션 (부제, 여러 개 선택 가능)</label>
    <div id="dcOptEBox">${renderOptionCheckboxes(docOptionsData.options, c.opts || (c.opt ? [c.opt] : []))}</div>
    <p class="hint">현재 연결: ${currentDesc}</p>
    <div class="radio-row">
      <label><input type="radio" name="doc-src-e" value="keep" checked> 그대로 유지</label>
      <label><input type="radio" name="doc-src-e" value="link"> 링크로 바꾸기</label>
      <label><input type="radio" name="doc-src-e" value="file"> 파일로 바꾸기</label>
    </div>
    <div id="dcLinkWrapE" style="display:none">
      <label>문서 링크 (구글드라이브 공유 링크 등)</label><input type="url" id="dcLinkE" placeholder="https://drive.google.com/...">
    </div>
    <div id="dcFileWrapE" style="display:none">
      <label>파일 선택</label><input type="file" id="dcFileE">
      <p class="hint">최대 ${Math.round(DOC_FILE_CHUNKED_MAX_BYTES/1024/1024)}MB까지 가능해요.</p>
    </div>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">저장</button></div>
  `, m=>{
    m.querySelectorAll('input[name="doc-src-e"]').forEach(r=> r.addEventListener('change', ()=>{
      const val = m.querySelector('input[name="doc-src-e"]:checked').value;
      m.querySelector('#dcLinkWrapE').style.display = val==='link' ? '' : 'none';
      m.querySelector('#dcFileWrapE').style.display = val==='file' ? '' : 'none';
    }));
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const title = m.querySelector('#dcTitle').value.trim();
      const desc = m.querySelector('#dcDesc').value.trim();
      const icon = m.querySelector('#dcIcon').value.trim();
      const opts = getCheckedOptionValues(m.querySelector('#dcOptEBox'));
      if(!title){ toast('제목을 입력해주세요'); return; }
      const mode = m.querySelector('input[name="doc-src-e"]:checked').value;
      const updated = { icon, title, desc, opts, link: c.link || '' };
      if(c.chunked){ updated.chunked = true; updated.fileId = c.fileId; updated.chunkTotal = c.chunkTotal; }
      let oldChunkToDelete = null;

      if(mode === 'link'){
        const link = m.querySelector('#dcLinkE').value.trim();
        if(!link){ toast('링크를 입력해주세요'); return; }
        if(c.chunked) oldChunkToDelete = { fileId: c.fileId, total: c.chunkTotal };
        updated.link = link;
        delete updated.chunked; delete updated.fileId; delete updated.chunkTotal;
      } else if(mode === 'file'){
        const file = m.querySelector('#dcFileE').files[0];
        if(!file){ toast('파일을 선택해주세요'); return; }
        if(file.size > DOC_FILE_CHUNKED_MAX_BYTES){
          toast(`파일이 너무 커요 (최대 ${Math.round(DOC_FILE_CHUNKED_MAX_BYTES/1024/1024)}MB).`);
          return;
        }
        saveBtn.disabled = true; saveBtn.textContent = '처리 중…';
        let base64;
        try{ base64 = await fileToBase64(file); }
        catch(err){ toast('파일을 읽지 못했어요'); saveBtn.disabled=false; saveBtn.textContent='저장'; return; }
        if(c.chunked) oldChunkToDelete = { fileId: c.fileId, total: c.chunkTotal };
        // 파일 자체는 작아도, 이 카드를 교체한 상태로 문서 전체 용량이 안전 한도를
        // 넘는지 먼저 확인 — 넘으면 청크 저장으로 전환 (openDocAddModal과 동일한 로직)
        const wouldBeCards = [...docsData.cards];
        wouldBeCards[idx] = { icon, title, desc, opts, link: base64 };
        const tooBigForInline = file.size > DOC_FILE_MAX_BYTES || estimateCardsBytes(wouldBeCards) > DOC_TOTAL_SAFE_BYTES;
        if(tooBigForInline){
          let chunkInfo;
          try{ chunkInfo = await saveFileChunked(base64); }
          catch(err){ toast('저장하지 못했어요.'); saveBtn.disabled=false; saveBtn.textContent='저장'; return; }
          updated.chunked = true; updated.fileId = chunkInfo.fileId; updated.chunkTotal = chunkInfo.total;
          updated.link = '';
        } else {
          updated.link = base64;
          delete updated.chunked; delete updated.fileId; delete updated.chunkTotal;
        }
      }

      const arr = [...docsData.cards]; arr[idx] = updated;
      saveBtn.disabled = true; saveBtn.textContent = '저장 중…';
      try{
        await docRef('documents').set({ cards: arr }, {merge:true});
      }catch(err){
        toast('저장하지 못했어요.');
        saveBtn.disabled = false; saveBtn.textContent = '저장';
        return;
      }
      if(oldChunkToDelete) deleteFileChunked(oldChunkToDelete.fileId, oldChunkToDelete.total).catch(()=>{});
      docsData = { ...docsData, cards: arr };
      renderDocs();
      closeModal();
    };
  });
}

/* ---------------- 7. 자료 카드 (썸네일 이미지만 보이고, 누르면 PDF/링크로 연결) ---------------- */

let sessionsData = { cards: [] };
const SESSION_PDF_MAX_BYTES = 650000; // 이 크기까지는 카드 문서 안에 바로 저장(가장 빠름)
const SESSION_PDF_CHUNKED_MAX_BYTES = 8 * 1024 * 1024; // 이보다 크면 여러 문서로 나눠 저장(파이어스토리지 없이 8MB까지)
const SESSION_THUMB_MAX_BYTES = 220000;

// 자료 카드도 레퍼런스 갤러리·갤러리2와 같은 방식으로, 카드가 많아질수록 살짝씩 더
// 겹치게 함. 다만 자료 카드는 한 줄(PC는 세로 한 열, 모바일은 가로 한 줄)짜리 목록이라
// "행 수" 대신 카드 개수를 그대로 겹침 계산에 씀. PC에서는 위아래로(margin-top),
// 모바일에서는 좌우로(margin-left) 겹치도록 방향을 나눔(레이아웃 자체도 CSS에서 같은
// 기준(900px)으로 세로↔가로 전환됨)
const SESSION_OVERLAP_STEP = 0.05;
const SESSION_OVERLAP_MAX = 0.35;
function sessionIsMobileLayout(){ return window.innerWidth <= 900; }
let sessionLastIsMobile = sessionIsMobileLayout();

function applySessionOverlap(gridEl, itemCount){
  if(!gridEl) return;
  // 편집모드에서는 순서 변경(드래그) 작업을 하기 편하도록 겹침을 끄고 카드를 나란히 둠
  if(editMode){ gridEl.style.setProperty('--session-overlap-px', '0px'); return; }
  const firstTile = gridEl.querySelector('.session-card');
  if(!firstTile){ gridEl.style.setProperty('--session-overlap-px', '0px'); return; }
  const isMobile = sessionIsMobileLayout();
  const tileSize = isMobile ? firstTile.getBoundingClientRect().width : firstTile.getBoundingClientRect().height;
  if(!tileSize) return;
  const overlapRatio = Math.min(SESSION_OVERLAP_MAX, Math.max(0, (itemCount - 1) * SESSION_OVERLAP_STEP));
  gridEl.style.setProperty('--session-overlap-px', `-${(tileSize * overlapRatio).toFixed(1)}px`);
}
window.addEventListener('resize', debounce(()=>{
  const nowMobile = sessionIsMobileLayout();
  if(nowMobile !== sessionLastIsMobile){ sessionLastIsMobile = nowMobile; renderSessions(); return; }
  applySessionOverlap(document.getElementById('sessionGrid'), (sessionsData.cards || []).length);
}, 150));

function renderSessions(){
  syncCardEditToggle('cardSessions', 'sessions', '세션카드 위젯 편집');
  const grid = document.getElementById('sessionGrid');
  const cards = sessionsData.cards || [];
  grid.innerHTML = cards.map((c,i)=> `
    <div class="session-card" data-idx="${i}" title="${escapeHtml(c.title||'')}">
      ${c.thumb ? `<img src="${escapeHtml(c.thumb)}" alt="${escapeHtml(c.title||'')}">` : `<div class="session-noimg">📄</div>`}
      ${isWidgetOpen('sessions') ? `<button class="edit" data-edit="${i}">✎</button>` : ''}
      ${isWidgetOpen('sessions') ? `<button class="del" data-del="${i}">✕</button>` : ''}
    </div>
  `).join('') || `<div class="w-empty">등록된 자료가 없어요</div>`;
  applySessionOverlap(grid, cards.length);

  grid.querySelectorAll('.session-card').forEach(el=> el.addEventListener('click', async (e)=>{
    if(e.target.closest('[data-del]') || e.target.closest('[data-edit]')) return;
    const idx = Number(el.dataset.idx);
    const card = sessionsData.cards[idx];
    if(card.chunked){
      toast('자료를 불러오는 중…');
      try{
        const base64 = await loadFileChunked(card.fileId, card.chunkTotal);
        openDataUrlAsBlob(base64);
      }catch(err){ toast('자료를 불러오지 못했어요'); }
    } else if(card.pdf){
      if(card.pdf.startsWith('data:')) openDataUrlAsBlob(card.pdf);
      else window.open(card.pdf, '_blank');
    } else {
      toast('연결된 자료가 없어요');
    }
  }));
  grid.querySelectorAll('[data-edit]').forEach(btn=> btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    openSessionEditModal(Number(btn.dataset.edit));
  }));
  grid.querySelectorAll('[data-del]').forEach(btn=> btn.addEventListener('click', async (e)=>{
    e.stopPropagation();
    const idx = Number(btn.dataset.del);
    const removed = sessionsData.cards[idx];
    if(!(await confirmDelete(`"${escapeHtml(removed && removed.title || '이 자료')}"를 정말 삭제할까요?`))) return;
    const arr = [...sessionsData.cards]; arr.splice(idx,1);
    await docRef('sessions').set({cards:arr}, {merge:true});
    if(removed && removed.chunked) deleteFileChunked(removed.fileId, removed.chunkTotal).catch(()=>{});
  }));

  const wrap = document.getElementById('sessionAddWrap');
  wrap.innerHTML = editMode ? `<button class="btn small session-add" id="sessAddBtn">+ 자료 추가</button>` : '';
  const addBtn = document.getElementById('sessAddBtn');
  if(addBtn) addBtn.onclick = openSessionAddModal;

  // 편집모드에서 드래그로 순서를 바꿀 수 있게 함(다른 위젯의 사진 순서 변경과 동일한 방식).
  // 모바일에서는 가로로 눕혀 보여주므로(가로 스크롤) 좌우 기준으로, PC에서는 세로로
  // 쌓이므로 위아래 기준으로 삽입 위치선을 표시함
  bindPinDragReorder(
    grid, '.session-card',
    ()=> (sessionsData.cards || []).slice(),
    async (arr)=> docRef('sessions').set({cards:arr}, {merge:true}),
    { pointerLine: true, axis: window.innerWidth <= 900 ? 'x' : 'y', widgetKey: 'sessions' }
  );
}

function openSessionAddModal(){
  openModal(`
    <h3>자료 추가</h3>
    <label>썸네일 이미지 (사진 한 장)</label>
    <input type="file" id="sThumbFile" accept="image/*">
    <p class="hint">자동으로 압축해서 저장돼요.</p>
    <label>제목 (선택 — 마우스를 올리면 보여요)</label><input type="text" id="sTitle" placeholder="예: 1화 - 첫 만남">
    <div class="radio-row">
      <label><input type="radio" name="pdf-src" value="none" checked> 연결 안 함</label>
      <label><input type="radio" name="pdf-src" value="file"> PDF 파일 올리기</label>
      <label><input type="radio" name="pdf-src" value="link"> 링크로 연결</label>
    </div>
    <div id="pdfFileWrap" style="display:none">
      <label>PDF 파일</label><input type="file" id="sPdfFile" accept="application/pdf">
      <p class="hint">최대 ${Math.round(SESSION_PDF_CHUNKED_MAX_BYTES/1024/1024)}MB까지 가능해요. (넘으면 "링크로 연결" 이용)</p>
    </div>
    <div id="pdfLinkWrap" style="display:none">
      <label>링크 (구글드라이브 공유 링크 등)</label><input type="url" id="sPdfLink" placeholder="https://drive.google.com/...">
    </div>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">추가</button></div>
  `, m=>{
    m.querySelectorAll('input[name="pdf-src"]').forEach(r=> r.addEventListener('change', ()=>{
      const val = m.querySelector('input[name="pdf-src"]:checked').value;
      m.querySelector('#pdfFileWrap').style.display = val==='file' ? '' : 'none';
      m.querySelector('#pdfLinkWrap').style.display = val==='link' ? '' : 'none';
    }));
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const title = m.querySelector('#sTitle').value.trim();
      const thumbFile = m.querySelector('#sThumbFile').files[0];
      if(!thumbFile){ toast('썸네일 이미지를 선택해주세요'); return; }
      const mode = m.querySelector('input[name="pdf-src"]:checked').value;
      let pdf = '';
      let pdfChunkInfo = null;
      if(mode === 'file'){
        const file = m.querySelector('#sPdfFile').files[0];
        if(!file){ toast('PDF 파일을 선택하거나 다른 방식을 골라주세요'); return; }
        if(file.size > SESSION_PDF_CHUNKED_MAX_BYTES){
          toast(`PDF 용량이 너무 커요 (최대 ${Math.round(SESSION_PDF_CHUNKED_MAX_BYTES/1024/1024)}MB). "링크로 연결"을 이용해주세요.`);
          return;
        }
        saveBtn.disabled = true; saveBtn.textContent = '처리 중…';
        let base64;
        try{ base64 = await fileToBase64(file); }
        catch(err){ toast('PDF를 읽지 못했어요'); saveBtn.disabled=false; saveBtn.textContent='추가'; return; }
        if(file.size > SESSION_PDF_MAX_BYTES){
          try{ pdfChunkInfo = await saveFileChunked(base64); }
          catch(err){ toast('저장하지 못했어요. 링크 방식을 이용해주세요.'); saveBtn.disabled=false; saveBtn.textContent='추가'; return; }
        } else {
          pdf = base64;
        }
      } else if(mode === 'link'){
        pdf = m.querySelector('#sPdfLink').value.trim();
        if(!pdf){ toast('링크를 입력해주세요'); return; }
      }
      // mode === 'none'인 경우 자료 연결 없이 썸네일만으로 카드를 만듦
      saveBtn.disabled = true; saveBtn.textContent = '처리 중…';
      let thumb = '';
      try{
        thumb = await compressImageFile(thumbFile, 900, SESSION_THUMB_MAX_BYTES);
      }catch(err){
        toast('썸네일 이미지를 처리하지 못했어요');
        saveBtn.disabled = false; saveBtn.textContent = '추가';
        return;
      }
      const newCard = { title, thumb, pdf };
      if(pdfChunkInfo){ newCard.chunked = true; newCard.fileId = pdfChunkInfo.fileId; newCard.chunkTotal = pdfChunkInfo.total; }
      const updatedCards = [...(sessionsData.cards||[]), newCard];
      try{
        await docRef('sessions').set({ cards: updatedCards }, {merge:true});
      }catch(err){
        toast('저장하지 못했어요. PDF 용량이 크면 링크 방식을 이용해주세요.');
        saveBtn.disabled = false; saveBtn.textContent = '추가';
        return;
      }
      sessionsData = { ...sessionsData, cards: updatedCards };
      renderSessions();
      closeModal();
    };
  });
}

docRef('sessions').onSnapshot(doc=>{ sessionsData = doc.exists ? doc.data() : {cards:[]}; renderSessions(); });

function openSessionEditModal(idx){
  const c = sessionsData.cards[idx];
  const pdfStatus = c.chunked ? '자료(자동 분할 저장됨)' : (c.pdf ? (c.pdf.startsWith('data:') ? '자료(직접 저장됨)' : '링크') : '없음');
  openModal(`
    <h3>자료 수정</h3>
    <label>제목 (선택 — 마우스를 올리면 보여요)</label><input type="text" id="sTitle" value="${escapeHtml(c.title||'')}">
    <label>썸네일 이미지 교체 (선택 — 비워두면 기존 사진 유지)</label>
    <input type="file" id="sThumbFileE" accept="image/*">
    <p class="hint">현재 연결된 자료: ${pdfStatus}</p>
    <div class="radio-row">
      <label><input type="radio" name="pdf-src-e" value="keep" checked> 그대로 유지</label>
      <label><input type="radio" name="pdf-src-e" value="file"> PDF 파일로 바꾸기</label>
      <label><input type="radio" name="pdf-src-e" value="link"> 링크로 바꾸기</label>
    </div>
    <div id="pdfFileWrapE" style="display:none">
      <label>PDF 파일</label><input type="file" id="sPdfFileE" accept="application/pdf">
      <p class="hint">최대 ${Math.round(SESSION_PDF_CHUNKED_MAX_BYTES/1024/1024)}MB까지 가능해요.</p>
    </div>
    <div id="pdfLinkWrapE" style="display:none">
      <label>링크 (구글드라이브 공유 링크 등)</label><input type="url" id="sPdfLinkE" placeholder="https://drive.google.com/...">
    </div>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">저장</button></div>
  `, m=>{
    m.querySelectorAll('input[name="pdf-src-e"]').forEach(r=> r.addEventListener('change', ()=>{
      const val = m.querySelector('input[name="pdf-src-e"]:checked').value;
      m.querySelector('#pdfFileWrapE').style.display = val==='file' ? '' : 'none';
      m.querySelector('#pdfLinkWrapE').style.display = val==='link' ? '' : 'none';
    }));
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const title = m.querySelector('#sTitle').value.trim();
      const mode = m.querySelector('input[name="pdf-src-e"]:checked').value;
      const updated = { title, thumb: c.thumb, pdf: c.pdf || '' };
      if(c.chunked){ updated.chunked = true; updated.fileId = c.fileId; updated.chunkTotal = c.chunkTotal; }
      let oldChunkToDelete = null;

      saveBtn.disabled = true; saveBtn.textContent = '처리 중…';

      const thumbFile = m.querySelector('#sThumbFileE').files[0];
      if(thumbFile){
        try{ updated.thumb = await compressImageFile(thumbFile, 900, SESSION_THUMB_MAX_BYTES); }
        catch(err){ toast('썸네일 이미지를 처리하지 못했어요'); saveBtn.disabled=false; saveBtn.textContent='저장'; return; }
      }

      if(mode === 'link'){
        const link = m.querySelector('#sPdfLinkE').value.trim();
        if(!link){ toast('링크를 입력해주세요'); saveBtn.disabled=false; saveBtn.textContent='저장'; return; }
        if(c.chunked) oldChunkToDelete = { fileId: c.fileId, total: c.chunkTotal };
        updated.pdf = link;
        delete updated.chunked; delete updated.fileId; delete updated.chunkTotal;
      } else if(mode === 'file'){
        const file = m.querySelector('#sPdfFileE').files[0];
        if(!file){ toast('PDF 파일을 선택해주세요'); saveBtn.disabled=false; saveBtn.textContent='저장'; return; }
        if(file.size > SESSION_PDF_CHUNKED_MAX_BYTES){
          toast(`PDF 용량이 너무 커요 (최대 ${Math.round(SESSION_PDF_CHUNKED_MAX_BYTES/1024/1024)}MB).`);
          saveBtn.disabled=false; saveBtn.textContent='저장'; return;
        }
        let base64;
        try{ base64 = await fileToBase64(file); }
        catch(err){ toast('PDF를 읽지 못했어요'); saveBtn.disabled=false; saveBtn.textContent='저장'; return; }
        if(c.chunked) oldChunkToDelete = { fileId: c.fileId, total: c.chunkTotal };
        if(file.size > SESSION_PDF_MAX_BYTES){
          let chunkInfo;
          try{ chunkInfo = await saveFileChunked(base64); }
          catch(err){ toast('저장하지 못했어요.'); saveBtn.disabled=false; saveBtn.textContent='저장'; return; }
          updated.chunked = true; updated.fileId = chunkInfo.fileId; updated.chunkTotal = chunkInfo.total;
          updated.pdf = '';
        } else {
          updated.pdf = base64;
          delete updated.chunked; delete updated.fileId; delete updated.chunkTotal;
        }
      }

      const arr = [...sessionsData.cards]; arr[idx] = updated;
      try{
        await docRef('sessions').set({ cards: arr }, {merge:true});
      }catch(err){
        toast('저장하지 못했어요.');
        saveBtn.disabled = false; saveBtn.textContent = '저장';
        return;
      }
      if(oldChunkToDelete) deleteFileChunked(oldChunkToDelete.fileId, oldChunkToDelete.total).catch(()=>{});
      sessionsData = { ...sessionsData, cards: arr };
      renderSessions();
      closeModal();
    };
  });
}

/* ---------------- 8. 체크보드 (체크된 항목은 아래로) ---------------- */

let checklistData = { items: [] };
// 항목을 눌렀을 때 모달을 새로 여는 대신, 그 항목 자리에서 바로 펼쳐지는
// 인라인 패널로 편집함 — 지금 어떤 항목(원본 배열 인덱스)이 펼쳐져 있는지만 기억해두면 됨.
let checklistEditingIdx = null;

function renderChecklist(){
  syncCardEditToggle('cardChecklist', 'checklist', '체크보드 위젯 편집');
  const body = document.getElementById('checklistBody');
  const all = (checklistData.items || []).map((it,i)=>({...it, _i:i}));
  const unchecked = all.filter(it=> !it.checked);
  const checked = all.filter(it=> it.checked);

  function editPanel(it){
    return `
      <div class="check-item check-item-editing" data-idx="${it._i}">
        <div class="check-item-edit-panel">
          <input type="text" class="ck-edit-text" value="${escapeHtml(it.text||'')}" placeholder="항목 내용">
          <input type="text" class="ck-edit-sub" value="${escapeHtml(it.subtitle||'')}" placeholder="부제목 (선택)">
          <input type="url" class="ck-edit-link" value="${escapeHtml(it.link||'')}" placeholder="링크 (선택)">
          <div class="check-item-edit-actions">
            <button type="button" class="btn small danger ck-edit-delete">삭제</button>
            <button type="button" class="btn small ghost ck-edit-cancel">취소</button>
            <button type="button" class="btn small primary ck-edit-save">저장</button>
          </div>
        </div>
      </div>
    `;
  }

  function row(it){
    const subtitle = it.subtitle || '';
    const open = isWidgetOpen('checklist');
    if(open && checklistEditingIdx === it._i) return editPanel(it);
    return `
      <div class="check-item ${it.checked?'checked':''}" data-idx="${it._i}">
        <input type="checkbox" ${it.checked?'checked':''} ${editMode?'':'disabled'}>
        <div class="check-item-main" ${open ? `data-itemedit="${it._i}"` : ''}>
          <span class="check-item-text ${it.link ? 'has-link' : ''}" ${(it.link && !open) ? `data-linkopen="${it._i}" title="${escapeHtml(it.link)}"` : ''}>${escapeHtml(it.text)}</span>
          ${(subtitle || open) ? `<span class="check-item-subtitle ${!subtitle ? 'empty-hint' : ''}">${subtitle ? escapeHtml(subtitle) : (open ? '부제목 없음' : '')}</span>` : ''}
        </div>
        ${open ? `<button class="check-link-edit" data-itemedit="${it._i}" title="항목 수정">✎</button>` : ''}
        ${open ? `<span class="check-item-drag-handle" title="드래그해서 순서 바꾸기">⠿</span>` : ''}
        ${open ? `<button class="del">✕</button>` : ''}
      </div>
    `;
  }

  // 미완료/완료를 좌우로 나눠서 별도 칸에 담던 방식에서, 하나의 2열 그리드로
  // 합쳐서 순서대로(미완료 먼저, 완료 나중) 흘려보내는 방식으로 바꿈 — 그리드가
  // 왼쪽→오른쪽, 위→아래 순으로 채워지므로, 배열 끝에 몰아둔 완료 항목들이
  // 자연히 그리드의 마지막 줄(맨 아래)에 두 칸을 걸쳐 깔리게 됨
  const sortedAll = [...unchecked, ...checked];
  if(!sortedAll.length){
    body.innerHTML = `<div class="w-empty">등록된 항목이 없어요</div>`;
  } else {
    body.innerHTML = sortedAll.map(row).join('');
  }

  body.querySelectorAll('.check-item').forEach(el=>{
    const idx = Number(el.dataset.idx);
    const cb = el.querySelector('input[type=checkbox]');
    if(cb) cb.addEventListener('change', async ()=>{
      if(!editMode) return;
      const arr = [...checklistData.items];
      arr[idx] = { ...arr[idx], checked: cb.checked };
      await docRef('checklist').set({items:arr}, {merge:true});
    });
    const linkOpen = el.querySelector('[data-linkopen]');
    if(linkOpen) linkOpen.addEventListener('click', ()=>{
      const cur = checklistData.items[idx];
      if(cur && cur.link) window.open(cur.link, '_blank', 'noopener');
    });
    // 텍스트/부제목/링크를 따로따로 여는 대신, 항목을 누르면 그 자리에서 바로
    // 인라인 패널이 펼쳐져 한 번에 수정하게 함(모달 대신)
    el.querySelectorAll('[data-itemedit]').forEach(trigger=>{
      trigger.addEventListener('click', (e)=>{
        e.stopPropagation();
        checklistEditingIdx = (checklistEditingIdx === idx) ? null : idx;
        renderChecklist();
      });
    });
    const del = el.querySelector('.del');
    if(del) del.addEventListener('click', async ()=>{
      const target = checklistData.items[idx];
      if(!(await confirmDelete(`"${escapeHtml(target && target.text || '이 항목')}"을 정말 삭제할까요?`))) return;
      const arr = [...checklistData.items]; arr.splice(idx,1);
      await docRef('checklist').set({items:arr}, {merge:true});
    });
  });

  // 인라인 편집 패널(펼쳐진 항목) 바인딩 — 저장/취소/삭제 모두 이 패널 안에서 바로 처리됨
  body.querySelectorAll('.check-item-editing').forEach(el=>{
    const idx = Number(el.dataset.idx);
    const textInput = el.querySelector('.ck-edit-text');
    const subInput = el.querySelector('.ck-edit-sub');
    const linkInput = el.querySelector('.ck-edit-link');
    const saveBtn = el.querySelector('.ck-edit-save');
    const doSave = async ()=>{
      const newText = textInput.value.trim();
      if(!newText) { textInput.focus(); return; }
      saveBtn.disabled = true;
      const arr = [...checklistData.items];
      arr[idx] = { ...arr[idx], text:newText, subtitle: subInput.value.trim(), link: linkInput.value.trim() };
      checklistEditingIdx = null;
      await docRef('checklist').set({items:arr}, {merge:true});
    };
    saveBtn.addEventListener('click', doSave);
    el.querySelector('.ck-edit-cancel').addEventListener('click', ()=>{ checklistEditingIdx = null; renderChecklist(); });
    el.querySelector('.ck-edit-delete').addEventListener('click', async ()=>{
      const target = checklistData.items[idx];
      if(!(await confirmDelete(`"${escapeHtml(target && target.text || '이 항목')}"을 정말 삭제할까요?`))) return;
      const arr = [...checklistData.items]; arr.splice(idx,1);
      checklistEditingIdx = null;
      await docRef('checklist').set({items:arr}, {merge:true});
    });
    [textInput, subInput, linkInput].forEach(inp=> inp.addEventListener('keydown', e=>{ if(e.key==='Enter') doSave(); }));
  });

  const wrap = document.getElementById('checklistAddWrap');
  wrap.style.display = editMode ? 'flex' : 'none';
  // 항목이 단순해서 접어둘 필요 없이, 부제목/링크 입력칸을 처음부터 항상 보이게 둠
  wrap.innerHTML = `
    <input type="text" id="checkNewInput" placeholder="새 항목">
    <input type="text" id="checkNewSubtitle" placeholder="부제목 (선택)">
    <input type="url" id="checkNewLink" placeholder="링크 (선택)">
    <button class="btn small primary" id="checkAddBtn">추가</button>
  `;
  const addBtn = document.getElementById('checkAddBtn');
  const input = document.getElementById('checkNewInput');
  const subInput = document.getElementById('checkNewSubtitle');
  const linkInput = document.getElementById('checkNewLink');
  const submit = async ()=>{
    const text = input.value.trim();
    if(!text) return;
    const subtitle = subInput.value.trim();
    const link = linkInput.value.trim();
    const newItem = { text, checked:false };
    if(subtitle) newItem.subtitle = subtitle;
    if(link) newItem.link = link;
    await docRef('checklist').set({ items: [...(checklistData.items||[]), newItem] }, {merge:true});
    input.value = ''; subInput.value = ''; linkInput.value = '';
  };
  addBtn.onclick = submit;
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
  subInput.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
  linkInput.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });

  // 편집모드에서 드래그로 순서를 바꿀 수 있게 함(체크된 항목이 자동으로 아래로 몰리는
  // 정렬은 그대로 유지된 채, 그 안에서의 순서만 바뀜). data-idx가 화면에 보이는 위치가
  // 아니라 원본 배열 위치(it._i)라서, 정렬로 화면 순서가 바뀌어도 항상 올바른 자리로
  // 반영됨. 폭이 좁아 1열로 쌓이는 화면에서는 좌우 대신 위아래 기준으로 표시함
  bindPinDragReorder(
    body, '.check-item',
    ()=> (checklistData.items || []).slice(),
    async (arr)=> docRef('checklist').set({items:arr}, {merge:true}),
    { pointerLine: true, axis: window.innerWidth <= 520 ? 'y' : 'x', widgetKey: 'checklist' }
  );
}

docRef('checklist').onSnapshot(doc=>{ checklistData = doc.exists ? doc.data() : {items:[]}; renderChecklist(); });

/* ---------------- row-2(캘린더+세션 / 문서+체크리스트) 높이 맞추기 ----------------
   캘린더는 이전달·이번달·다음달이 세로로 이어져서 표시되고, 요일 칸이
   정사각형(aspect-ratio)이라 폭에 따라 세로 높이가 자동으로 달라짐. 그래서
   캘린더를 기준으로 삼아 나머지 위젯들의 높이를 캘린더의 실제 렌더링 높이에
   맞춰줌(모두 이미 내부 스크롤 처리가 되어 있어서, 높이가 줄어들면 안에서
   스크롤됨). 세션 위젯은 캘린더 옆(나란히)이라 캘린더와 같은 높이를 그대로
   가지고, 문서·체크리스트 위젯은 캘린더 아래로 쌓여 있으므로 둘을 합친 높이가
   캘린더 높이와 같아지도록 반씩 나눠 가짐(문서/체크리스트 동일 면적). 900px
   이하(row-2가 1열로 쌓이는 모바일 레이아웃)에서는 보정을 끄고 각자 자연스러운
   높이로 둠. */
// row-strip(음악/프로필/방명록+디데이)에서 프로필 위젯만 align-self:start로
// stretch를 빠져나와 있는데, 그 실제 높이 값은 여기서 음악 위젯의 렌더링된
// 높이를 그대로 재서 맞춰줌 — 옆 두 위젯과 항상 정확히 같은 높이가 되도록.
// (calendar 기준으로 세션/문서/체크리스트 높이를 맞추는 syncRow2Height와 같은 패턴)
function syncRowStripHeight(){
  const music = document.getElementById('cardMusic');
  const profile = document.getElementById('cardProfile');
  const stripRight = document.querySelector('.row-strip-right');
  if(!music || !profile) return;
  if(window.innerWidth <= 900){
    profile.style.height = '';
    music.style.height = '';
    return;
  }
  // 예전엔 음악 위젯 높이에 프로필만 맞췄는데, 방명록·말풍선 위젯·디데이가 모인
  // 오른쪽 칸(row-strip-right)이 더 커질 수 있게 되면서(말풍선 위젯 추가) 그 경우엔
  // 음악/프로필이 오히려 짧아 보이는 문제가 있었음 — 셋 중 가장 큰 높이에 맞춤
  // 음악뿐 아니라 프로필도 재는 동안에는 인라인 높이를 비워둬야 함 — 프로필에
  // 예전 계산값이 그대로 남아있으면 row-strip의 align-items:stretch가 그 값에
  // 맞춰 행 전체(음악, 방명록칸)를 계속 그 크기로 늘려버려서, 방명록 쪽 CSS
  // 높이를 아무리 줄여도 반영이 안 되는 문제가 있었음(프로필의 옛 값이 계속
  // "가장 큰 값"으로 남아 자기 자신을 계속 정당화하는 순환이 생김).
  music.style.height = '';
  profile.style.height = '';
  const musicH = music.getBoundingClientRect().height;
  const rightH = stripRight ? stripRight.scrollHeight : 0;
  const h = Math.max(musicH, rightH);
  if(h > 0){ profile.style.height = h + 'px'; music.style.height = h + 'px'; }
}
function initRowStripHeightSync(){
  const music = document.getElementById('cardMusic');
  const stripRight = document.querySelector('.row-strip-right');
  if(!music) return;
  if(typeof ResizeObserver !== 'undefined'){
    let lastH = -1, lastRightH = -1;
    const ro = new ResizeObserver(()=>{
      const h = Math.round(music.getBoundingClientRect().height);
      const rightH = stripRight ? Math.round(stripRight.scrollHeight) : 0;
      if(h === lastH && rightH === lastRightH) return;
      lastH = h; lastRightH = rightH;
      syncRowStripHeight();
    });
    ro.observe(music);
    if(stripRight) ro.observe(stripRight); // 방명록 접힘/펼침, 말풍선 위젯 커버 설정 등으로 이 칸 높이가 바뀔 때도 다시 맞춤
  }
  // resize는 창을 드래그하는 동안 한 프레임에도 여러 번 발생함 — 이 함수는 호출마다
  // getBoundingClientRect(강제 리플로우)를 포함하므로, 다른 resize 핸들러들처럼
  // debounce로 묶어 드래그가 끝난 뒤 한 번만 계산하게 함
  window.addEventListener('resize', debounce(syncRowStripHeight, 80));
  syncRowStripHeight();
}

function syncRow2Height(){
  const cal = document.getElementById('cardCalendar');
  const docsCard = document.getElementById('cardDocs');
  const checklistCard = document.getElementById('cardChecklist');
  const sessionsCard = document.getElementById('cardSessions');
  if(!cal || !docsCard || !checklistCard || !sessionsCard) return;
  if(window.innerWidth <= 900){
    docsCard.style.height = '';
    checklistCard.style.height = '';
    sessionsCard.style.height = '';
    return;
  }
  const h = cal.getBoundingClientRect().height;
  if(h > 0){
    sessionsCard.style.height = h + 'px';
    const gap = 20;
    const checklistH = Math.max(120, Math.round((h - gap) * 0.5));
    const docsH = h - gap - checklistH;
    docsCard.style.height = docsH + 'px';
    checklistCard.style.height = checklistH + 'px';
  }
}
function initRow2HeightSync(){
  const cal = document.getElementById('cardCalendar');
  if(!cal) return;
  if(typeof ResizeObserver !== 'undefined'){
    // 캘린더는 이제 align-self:start라 자기 콘텐츠 높이만 갖지만, 혹시 모를
    // 반올림 오차 등으로 값이 미세하게 계속 흔들려 행이 서서히 부풀어오르는
    // 걸 막기 위해 실제로 높이가 바뀐 경우에만 다시 계산하도록 이중 안전장치를 둠
    let lastH = -1;
    new ResizeObserver(()=>{
      const h = Math.round(cal.getBoundingClientRect().height);
      if(h === lastH) return;
      lastH = h;
      syncRow2Height();
    }).observe(cal);
  }
  // 위와 같은 이유로(강제 리플로우 포함) resize는 debounce로 묶음
  window.addEventListener('resize', debounce(syncRow2Height, 80));
  syncRow2Height();
}

/* ---------------- 보드 탭(위젯 ↔ 갤러리) 좌우 스와이프 ---------------- */
function initBoardTabs(){
  const viewport = document.getElementById('boardViewport');
  const nav = document.getElementById('boardTabNav');
  if(!viewport || !nav) return;
  const btns = [...nav.querySelectorAll('.board-tab-dot')];
  const pages = [...viewport.querySelectorAll('.board-page')];
  const prevBtn = document.getElementById('boardTabPrev');
  const nextBtn = document.getElementById('boardTabNext');

  function setActive(idx){
    if(idx === 1) startTab2Widgets(); // 갤러리 탭에 처음 들어온 순간 지연해둔 구독을 시작
    btns.forEach((b,i)=> b.classList.toggle('active', i===idx));
    pages.forEach((p,i)=> p.classList.toggle('board-page-active', i===idx));
    if(prevBtn) prevBtn.classList.toggle('disabled', idx <= 0);
    if(nextBtn) nextBtn.classList.toggle('disabled', idx >= btns.length - 1);
    // 갤러리 탭이 방금 화면에 보이게 됐다면(content-visibility로 그동안 렌더링을 건너뛰고
    // 있었을 수 있음) 실제 폭을 다시 재서 사진 위치를 바로 잡아줌
    requestAnimationFrame(()=>{
      const g = document.getElementById('galleryGrid');
      if(g) layoutPinMasonry(g);
      refreshGallery2Layout();
    });
  }
  function goTo(idx, smooth=true){
    idx = Math.max(0, Math.min(btns.length - 1, idx));
    viewport.scrollTo({ left: idx * viewport.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    setActive(idx);
  }
  function currentIdx(){
    const i = btns.findIndex(b=> b.classList.contains('active'));
    return i >= 0 ? i : 0;
  }

  btns.forEach(btn=>{
    btn.addEventListener('click', ()=> goTo(Number(btn.dataset.tab)));
  });
  // 화살표(prev/next)는 화면 세로 전체(56px 폭)를 덮고 있어서, 그 폭 안쪽에 있는
  // 카드의 연필 버튼 같은 위젯 아이콘과 자리가 겹칠 수 있음. .w-card가 자체
  // 스태킹 컨텍스트를 만드는 탓에 z-index만으로는 우선순위를 못 정하므로,
  // 클릭 지점에 실제로 깔려있는 버튼이 있으면 탭 이동 대신 그 버튼 쪽 클릭을
  // 우선시켜서 대신 눌러줌.
  function arrowClick(step, arrowEl){
    return (e)=>{
      const stack = typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(e.clientX, e.clientY) : [];
      const covered = stack.find(el=> el !== arrowEl && el.closest &&
        el.closest('.board-viewport') &&
        (el.tagName === 'BUTTON' || el.tagName === 'A' || el.classList.contains('btn')));
      if(covered){
        e.preventDefault();
        covered.click();
        return;
      }
      goTo(currentIdx() + step);
    };
  }
  if(prevBtn) prevBtn.addEventListener('click', arrowClick(-1, prevBtn));
  if(nextBtn) nextBtn.addEventListener('click', arrowClick(1, nextBtn));

  // 스와이프/스크롤로 탭이 넘어갔을 때 활성 점/화살표 상태도 같이 맞춰줌
  let scrollTimer = null;
  viewport.addEventListener('scroll', ()=>{
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(()=>{
      const idx = Math.round(viewport.scrollLeft / viewport.clientWidth);
      setActive(idx);
    }, 80);
  });

  // 화면 크기가 바뀌어도(예: 회전) 현재 보고 있던 탭 위치를 그대로 유지.
  // goTo 안에서 scrollTo + 매스너리 재배치까지 같이 도므로, 다른 resize
  // 핸들러들처럼 debounce로 묶어 드래그 중 반복 호출을 피함
  window.addEventListener('resize', debounce(()=> goTo(currentIdx(), false), 80));

  setActive(0);
}

/* ---------------- 캐릭터 스티커(장식) ----------------
   프로필 위젯의 첫 번째 AU(본편) 사진/한마디를 기준으로, 인물 한 명당 스티커 하나씩
   화면에 떠 있게 하고, 드래그로 자리를 옮길 수 있게 함. 위치는 Firestore에 저장해서
   새로고침해도 유지되고, 다른 기기에서 봐도 같은 자리에 있음(뷰포트 비율로 저장).
   말풍선(한마디)은 스티커를 누르면(클릭/탭) 나타나고, 가끔은 랜덤한 타이밍에 둘이
   동시에 나타나기도 함. 나타날 때 스티커가 살짝 점프하는 효과도 같이 줌. */
let stickerPosData = { positions: {} };
const stickerEls = {}; // slot -> { root, avatarEl, bubbleEl, bubbleTextEl, bubbleTimer, dragging }
const STICKER_W = 160, STICKER_H = 206;
// 캐릭터1(slot 0)이 캐릭터2(slot 1)보다 120% 크게 보이도록 하는 배율.
// style.css의 .site-sticker[data-slot="0"] 크기(192×247, 미디어쿼리 110×142)와
// 반드시 같은 값을 유지해야 함 — 여기서 배치를 계산할 때도 이 배율로 캐릭터1의
// 실제 렌더 폭을 추정하기 때문.
const STICKER_SCALE_0 = 1.2;

// 접속(새로고침)할 때마다 등장하는 한 쌍(멧돼지+사슴)이 랜덤하게 바뀌도록,
// 데이터가 있는 모든 AU×시점/IF 조합 중 하나를 세션당 한 번만 랜덤으로 골라 고정해둠
// (렌더링될 때마다 다시 뽑으면 화면이 계속 바뀌어버리므로 세션 동안엔 값을 캐싱함).
let stickerChosenKey = null; // "slideIdx-secIdx" 형태로 캐싱
function getStickerPeople(){
  // 프로필 위젯이 쓰는 것과 같은 normalizeProfileSlide를 그대로 재사용해서, 예전 형식
  // 데이터가 섞여 있어도 프로필 위젯과 똑같이 안전하게 해석되게 함.
  const slides = (profileData.slides || []).map(normalizeProfileSlide);
  const candidates = [];
  // 사진은 URL로 그대로 들어있는 경우(pf.avatar)와, 1MB 문서 한도 때문에 따로
  // 청크로 저장되고 여기엔 참조만 남는 경우(pf.avatarChunked + pf.avatarFileId)가
  // 둘 다 있어서, 이 둘 중 하나라도 있으면 "사진 있음"으로 봐야 함. avatar만 보면
  // (실제로 프로필 사진을 올리면 거의 항상 청크로 저장되므로) 대부분의 경우
  // 사진이 있어도 없는 걸로 오판해서 스티커가 아예 안 뜨는 문제가 있었음.
  const hasPerson = (pf)=> !!(pf && (pf.avatar || (pf.avatarChunked && pf.avatarFileId)) && pf.oneLiner);
  slides.forEach((slide, slideIdx)=>{
    (slide.sections||[]).forEach((section, secIdx)=>{
      // 두 항목(슬롯0, 슬롯1)이 전부 채워져 있는 프로필만 스티커 후보로 삼음 —
      // 하나라도 비어있으면 그 프로필은 아예 건너뛰고 다른 프로필을 고름
      const pf0 = (section.peopleFields||[])[0];
      const pf1 = (section.peopleFields||[])[1];
      if(hasPerson(pf0) && hasPerson(pf1)) candidates.push({ slideIdx, secIdx, section });
    });
  });
  if(!candidates.length) return [];

  let chosen = stickerChosenKey ? candidates.find(c => `${c.slideIdx}-${c.secIdx}` === stickerChosenKey) : null;
  if(!chosen){
    chosen = candidates[Math.floor(Math.random() * candidates.length)];
    stickerChosenKey = `${chosen.slideIdx}-${chosen.secIdx}`;
  }
  const section = chosen.section;
  return [0,1].map(slot=>{
    const pf = (section.peopleFields||[])[slot];
    if(!pf || !((pf.avatar || (pf.avatarChunked && pf.avatarFileId)) && pf.oneLiner)) return null;
    // 말풍선엔 "한줄소개"(role)가 아니라 "한마디"(oneLiner)가 나와야 함
    return { slot, name: pf.name||'', oneLiner: (pf.oneLiner || ''), pf };
  }).filter(Boolean);
}

function stickerClamp(el){
  const w = el.offsetWidth || STICKER_W, h = el.offsetHeight || STICKER_H;
  const vw = window.innerWidth, vh = window.innerHeight;
  const maxX = Math.max(0, vw - w), maxY = Math.max(0, vh - h);
  const x = Math.min(maxX, Math.max(0, parseFloat(el.style.left)||0));
  const y = Math.min(maxY, Math.max(0, parseFloat(el.style.top)||0));
  el.style.left = x + 'px'; el.style.top = y + 'px';
  return {x, y, maxX, maxY};
}

function applyStickerFrac(el, xFrac, yFrac){
  const w = el.offsetWidth || STICKER_W, h = el.offsetHeight || STICKER_H;
  const vw = window.innerWidth, vh = window.innerHeight;
  const maxX = Math.max(0, vw - w), maxY = Math.max(0, vh - h);
  el.style.left = (xFrac * maxX) + 'px';
  el.style.top = (yFrac * maxY) + 'px';
}

const saveStickerPos = debounce((slot, xFrac, yFrac)=>{
  const positions = { ...(stickerPosData.positions||{}) };
  positions[slot] = { x: xFrac, y: yFrac };
  docRef('stickers').set({ positions }, { merge: true });
}, 400);

function showStickerBubble(slot){
  const s = stickerEls[slot];
  if(!s || !s.bubbleTextEl.textContent) return;
  clearTimeout(s.bubbleTimer);
  s.bubbleEl.classList.add('show');
  // 말풍선 뜨는 타이밍에 맞춰 살짝 점프
  s.avatarEl.classList.remove('jump');
  void s.avatarEl.offsetWidth; // 강제 reflow: 연달아 눌러도 애니메이션이 매번 다시 재생되게 함
  s.avatarEl.classList.add('jump');
  s.bubbleTimer = setTimeout(()=>{
    const cur = stickerEls[slot];
    if(cur) cur.bubbleEl.classList.remove('show');
  }, 4000);
}

// 가끔 둘이 동시에 말풍선을 띄우는 랜덤 스케줄러(클릭으로 보여주는 것과는 별개로 계속 돌아감)
let stickerBothScheduleStarted = false;
function scheduleBothStickerBubbles(){
  const delay = 70000 + Math.random()*80000; // 70~150초 사이 랜덤(너무 자주 뜨지 않게)
  setTimeout(()=>{
    Object.keys(stickerEls).forEach(slot=> showStickerBubble(Number(slot)));
    scheduleBothStickerBubbles();
  }, delay);
}

// 기본 위치(저장된 값이 없을 때): 앵커는 멧돼지(slot 0), 사슴(slot 1)은 그보다
// 오른쪽 아래에 둬서 프로필 위젯의 좌우 순서를 그대로 지킴. 말풍선이 위로 떠오르므로
// 위/왼쪽 여백을 넉넉히 둠. 모든 값은 고정 STICKER_W가 아니라 실제 렌더 크기
// (root.offsetWidth)에 비례해 계산해야, 화면이 좁아져 스티커가 작아질 때 간격도
// 같이 줄어듦(안 그러면 오히려 서로 멀어져 보임). 단, 캐릭터2의 가로 오프셋(hGap)은
// 120% 확대된 캐릭터1(slot 0)의 실제 렌더 폭 기준으로 잡아야 의도한 만큼만 겹침.
function positionStickerDefault(root, slot){
  const actualW = root.offsetWidth || (slot === 0 ? STICKER_W * STICKER_SCALE_0 : STICKER_W);
  const scale = actualW / (slot === 0 ? STICKER_W * STICKER_SCALE_0 : STICKER_W);
  const leftMargin = 64 * scale, topClearance = 92 * scale, vGap = 54 * scale;
  const anchorLeft = leftMargin;
  const anchorTop = topClearance;
  if(slot === 1){
    const slot0Root = stickerEls[0] && stickerEls[0].root;
    const slot0W = (slot0Root && slot0Root.offsetWidth) || (STICKER_W * STICKER_SCALE_0 * scale);
    const overlap = 15 * scale;
    const hGap = slot0W - overlap;
    root.style.left = (anchorLeft + hGap) + 'px';
    root.style.top = (anchorTop + vGap) + 'px';
  } else {
    root.style.left = anchorLeft + 'px';
    root.style.top = anchorTop + 'px';
  }
  stickerClamp(root);
}

// 저장된 위치가 있으면 그 비율(frac)로, 없으면 기본 자리로 배치 — 생성 시점과
// resize 시점 둘 다 이 함수 하나로 통일해서, 화면 크기가 바뀔 때도 "저장된
// 의도"를 기준으로 다시 계산하게 함(전에는 resize 때 그 순간의 픽셀 좌표에서
// 거꾸로 비율을 뽑아 그대로 재적용하는 식이라 사실상 아무것도 안 바뀌었고,
// 그 사이 미디어쿼리로 스티커 크기만 작아지면서 간격이 상대적으로 멀어져 보였음)
function positionSticker(root, slot){
  const saved = (stickerPosData.positions||{})[slot];
  if(saved){
    applyStickerFrac(root, saved.x, saved.y);
  } else {
    positionStickerDefault(root, slot);
  }
}

function ensureStickerEl(slot){
  if(stickerEls[slot]) return stickerEls[slot];
  const root = document.createElement('div');
  root.className = 'site-sticker';
  // 캐릭터1(slot 0)이 캐릭터2(slot 1)보다 120% 크게 보이도록 CSS에서
  // data-slot="0" 전용 크기를 적용함(위 style.css .site-sticker[data-slot="0"])
  root.dataset.slot = String(slot);
  root.innerHTML = `
    <div class="sticker-bubble" id="stickerBubble${slot}"><span class="sticker-bubble-text"></span></div>
    <div class="sticker-avatar" id="stickerAvatar${slot}"></div>
  `;
  document.body.appendChild(root);
  const avatarEl = root.querySelector('.sticker-avatar');
  const bubbleEl = root.querySelector('.sticker-bubble');
  const bubbleTextEl = root.querySelector('.sticker-bubble-text');

  positionSticker(root, slot);

  // 드래그(마우스/터치 공용, Pointer Events)
  let dragging = false, startX=0, startY=0, baseLeft=0, baseTop=0, moved=false;
  root.addEventListener('pointerdown', (e)=>{
    dragging = true; moved = false;
    root.setPointerCapture(e.pointerId);
    startX = e.clientX; startY = e.clientY;
    baseLeft = parseFloat(root.style.left)||0; baseTop = parseFloat(root.style.top)||0;
    root.classList.add('dragging');
  });
  root.addEventListener('pointermove', (e)=>{
    if(!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if(Math.abs(dx)>3 || Math.abs(dy)>3) moved = true;
    root.style.left = (baseLeft+dx) + 'px';
    root.style.top = (baseTop+dy) + 'px';
  });
  const endDrag = (e)=>{
    if(!dragging) return;
    dragging = false;
    root.classList.remove('dragging');
    const {x,y,maxX,maxY} = stickerClamp(root);
    const xFrac = maxX ? x/maxX : 0, yFrac = maxY ? y/maxY : 0;
    saveStickerPos(slot, xFrac, yFrac);
    // 드래그가 아니라 그냥 눌렀다 뗀 거면(움직인 거리가 거의 없으면) 말풍선을 보여줌
    if(!moved) showStickerBubble(slot);
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  // 화면 크기가 바뀌면(회전, 창 크기 조절, 모바일 미디어쿼리로 스티커 자체
  // 크기가 바뀌는 경우 등) "저장된 의도"를 기준으로 다시 배치 — 드래그로
  // 옮겨둔 적이 있으면 그 비율로, 없으면 기본 자리 공식으로 다시 계산
  window.addEventListener('resize', debounce(()=>{
    positionSticker(root, slot);
  }, 150));

  stickerEls[slot] = { root, avatarEl, bubbleEl, bubbleTextEl, bubbleTimer: null };
  return stickerEls[slot];
}

function renderStickers(){
  const people = getStickerPeople();
  const validSlots = new Set(people.map(p=>p.slot));
  // 더 이상 조건(사진+한마디 둘 다 있음)을 만족하지 않는 슬롯은 스티커도 치움
  Object.keys(stickerEls).forEach(slot=>{
    if(!validSlots.has(Number(slot))){
      clearTimeout(stickerEls[slot].bubbleTimer);
      stickerEls[slot].root.remove();
      delete stickerEls[slot];
    }
  });
  people.forEach(({slot, oneLiner, pf})=>{
    const s = ensureStickerEl(slot);
    const avatarUrl = resolveGalleryItemUrl(
      { chunked: !!pf.avatarChunked, fileId: pf.avatarFileId || '', chunkTotal: pf.avatarChunkTotal || 0, url: pf.avatar || '' },
      ()=> renderStickers()
    ) || '';
    s.avatarEl.style.backgroundImage = avatarUrl ? `url('${avatarUrl}')` : 'none';
    s.avatarEl.textContent = avatarUrl ? '' : '👤';
    s.bubbleTextEl.textContent = oneLiner || '';
    shapeSpeechBubble(s.bubbleEl, { radius:16, tailLeft:(w)=> (w-16)/2, tailWidth:16, tailHeight:8 });
  });
  if(!stickerBothScheduleStarted && people.length){
    stickerBothScheduleStarted = true;
    // 접속/새로고침한 순간엔 70~150초짜리 랜덤 스케줄을 기다리지 않고 바로 한 번
    // 말풍선을 띄워서, 처음 들어왔을 때도 스티커가 있다는 걸 바로 알 수 있게 함
    Object.keys(stickerEls).forEach(slot=> showStickerBubble(Number(slot)));
    scheduleBothStickerBubbles();
  }
}

/* ================================================================
   말풍선 위젯 — 캐릭터 이미지의 특정 부위를 누르면 말풍선이 뜨는 부가 기능.
   기본은 항상 꺼진 채(타인모드) 시작하고, 방문자가 오버레이 안에서만 토글함.
   탭 = "버전"(같은 캐릭터의 다른 이미지/대사 세트) 하나가 이미지 2장(캐릭터1/2)과
   그 위에 그려진 클릭 영역들을 통째로 갖고 있음.
   ================================================================ */

let speechWidgetData = { tabs: [], cover: null };
let speechEditorTabId = null;   // 편집기에서 지금 열려있는 탭
let speechDrawShape = 'box';    // 편집기의 현재 그리기 모드: box | lasso

// 평소 화면에 보이는 카드를 캐릭터 미리보기 2장 대신, 이미지 위젯처럼 칸을 꽉 채우는
// 사진 한 장 + 문구로 바꾸고 싶을 때 쓰는 설정. 탭/캐릭터 데이터와는 완전히 별개라서
// 톱니바퀴 편집을 건드려도 대사 데이터에는 전혀 영향이 없음.
function normalizeSpeechCover(c){
  c = c || {};
  return {
    image: c.image || '', imageChunked: !!c.imageChunked,
    imageFileId: c.imageFileId || '', imageChunkTotal: c.imageChunkTotal || 0,
    text: c.text || ''
  };
}

function normalizeSpeechTab(t){
  t = t || {};
  return {
    id: t.id || uid(),
    name: t.name || '탭',
    characters: [0,1].map(i=>{
      const c = (t.characters && t.characters[i]) || {};
      return {
        avatar: c.avatar || '', avatarChunked: !!c.avatarChunked, avatarFileId: c.avatarFileId || '', avatarChunkTotal: c.avatarChunkTotal || 0,
        defaultTextOther: c.defaultTextOther || '',       // 이 캐릭터의 영역 밖(빈 곳)을 눌렀을 때(모브) 뜨는 기본 문구
        defaultTextCharacter: c.defaultTextCharacter || '' // 이 캐릭터의 영역 밖을 눌렀을 때(서로) 뜨는 기본 문구
      };
    }),
    regions: Array.isArray(t.regions) ? t.regions.map(r=> ({
      id: r.id || uid(),
      character: r.character === 1 ? 1 : 0,   // 이 영역이 캐릭터1/캐릭터2 이미지 중 어디 위에 있는지
      shape: r.shape === 'lasso' ? 'lasso' : 'box',
      points: r.points,
      textOther: r.textOther || '',
      textCharacter: r.textCharacter || ''
    })) : []
  };
}

async function saveSpeechWidget(){
  await docRef('speechWidget').set({ tabs: speechWidgetData.tabs, cover: speechWidgetData.cover });
}

function speechRegionSvgShape(region, className){
  if(region.shape === 'box'){
    const p = region.points;
    return `<rect class="${className}" x="${p.x}%" y="${p.y}%" width="${p.w}%" height="${p.h}%" data-region="${region.id}"></rect>`;
  }
  const pts = (region.points||[]).map(p=> `${p.x},${p.y}`).join(' ');
  return `<polygon class="${className}" points="${pts}" data-region="${region.id}"></polygon>`;
}

async function speechResolveCharacterUrl(character){
  if(!character) return '';
  if(character.avatarChunked && character.avatarFileId){
    const cached = chunkedImageCache.get(character.avatarFileId);
    if(cached) return cached;
    try{
      const dataUrl = await loadFileChunked(character.avatarFileId, character.avatarChunkTotal || 0);
      chunkedImageCache.set(character.avatarFileId, dataUrl);
      return dataUrl;
    }catch(e){ return ''; }
  }
  return character.avatar || '';
}

// 프로필 카드가 지금 보여주고 있는 AU 이름과 같은 이름의 탭을 찾아 연동함.
// 못 찾으면 첫 번째 탭으로 시작함(단, 프로필/말풍선 위젯 데이터는 서로 저장 형식이
// 완전히 분리돼 있어서, 이 매칭이 실패해도 서로에게 영향 없음).
function speechPickLinkedTabId(){
  const tabs = speechWidgetData.tabs || [];
  if(tabs.length === 0) return null;
  const slides = (profileData.slides || []);
  const currentLabel = slides[profileSlideIndex] && slides[profileSlideIndex].label;
  const matched = currentLabel && tabs.find(t=> t.name === currentLabel);
  return (matched || tabs[0]).id;
}

/* ---------------- 카드(평소 화면) ---------------- */

async function renderSpeechCard(){
  const box = document.getElementById('cardSpeech');
  if(!box) return;
  const tabs = speechWidgetData.tabs || [];
  const linkedId = speechPickLinkedTabId();
  const tab = tabs.find(t=> t.id === linkedId);
  const cover = speechWidgetData.cover;
  const coverUrl = cover ? await speechResolveCharacterUrl({ avatar: cover.image, avatarChunked: cover.imageChunked, avatarFileId: cover.imageFileId, avatarChunkTotal: cover.imageChunkTotal }) : '';

  // 편집모드일 때 우상단에 뜨는 두 버튼 — 톱니바퀴(카드 겉모습: 커버 사진+문구)와
  // 연필(대사 내용: 탭/캐릭터/클릭영역)은 완전히 다른 걸 편집하는 거라 아이콘과
  // 자리를 뚜렷하게 구별해뒀음
  const editButtons = editMode ? `
    <button class="speech-card-cover-btn" id="speechCoverBtn" aria-label="위젯 카드 겉모습 설정" title="카드 겉모습(사진/문구) 설정">⚙</button>
    <button class="speech-card-edit-btn" id="speechEditBtn" aria-label="말풍선 위젯 편집" title="대사·탭 편집">✎</button>
  ` : '';

  if(coverUrl){
    box.className = 'w-card w-speech has-cover';
    box.innerHTML = `
      <img class="speech-card-cover-img" src="${coverUrl}" alt="">
      <div class="speech-card-cover-scrim"></div>
      ${cover.text ? `<div class="speech-card-cover-text">${escapeHtml(cover.text)}</div>` : ''}
      ${editButtons}
    `;
  } else {
    // 커버 사진을 안 정해뒀을 땐, 안에 담긴 캐릭터 이미지나 문구를 카드에서
    // 미리 드러내지 않음 — 그냥 중립적인 아이콘만 표시(캡션 텍스트도 없음)
    box.className = 'w-card w-speech';
    box.innerHTML = editButtons;
  }

  if(tab || coverUrl) box.onclick = ()=> openSpeechOverlay(linkedId);
  else box.onclick = null;

  const coverBtn = document.getElementById('speechCoverBtn');
  if(coverBtn) coverBtn.onclick = (e)=>{ e.stopPropagation(); openSpeechCoverEditor(); };
  const editBtn = document.getElementById('speechEditBtn');
  if(editBtn) editBtn.onclick = (e)=>{ e.stopPropagation(); openSpeechEditor(); };
}

/* ---------------- 방문자용 오버레이 ---------------- */

function closeSpeechOverlay(){
  const el = document.getElementById('speechOverlayRoot');
  if(el){ el.remove(); }
  if(window.__speechEscHandler){ document.removeEventListener('keydown', window.__speechEscHandler); window.__speechEscHandler = null; }
}

function openSpeechOverlay(initialTabId){
  const initialTabs = speechWidgetData.tabs || [];
  if(initialTabs.length === 0) return;
  let activeId = initialTabId || initialTabs[0].id;
  let mode = 'other'; // 오버레이를 열 때마다 항상 타인모드(=off)로 시작함

  closeSpeechOverlay();
  const el = document.createElement('div');
  el.className = 'speech-overlay';
  el.id = 'speechOverlayRoot';
  el.innerHTML = `
    <div class="speech-overlay-tint"></div>
    <button class="speech-overlay-close" id="speechCloseBtn" aria-label="닫기">✕</button>
    ${editMode ? `<button class="speech-overlay-edit" id="speechOverlayEditBtn" aria-label="말풍선 위젯 편집" title="대사·탭 편집">✎</button>` : ''}
    <div class="speech-tabs" id="speechTabs"></div>
    <div class="speech-stage-wrap"><div class="speech-stage" id="speechStage"></div></div>
    <button class="speech-toggle" id="speechModeBtn" aria-pressed="false">
      <span class="speech-toggle-knob"></span>
      <span class="speech-toggle-text"></span>
    </button>
  `;
  document.body.appendChild(el);

  el.addEventListener('click', (e)=>{ if(e.target === el) closeSpeechOverlay(); });
  window.__speechEscHandler = (e)=>{ if(e.key === 'Escape') closeSpeechOverlay(); };
  document.addEventListener('keydown', window.__speechEscHandler);
  el.querySelector('#speechCloseBtn').onclick = closeSpeechOverlay;

  const tabsEl = el.querySelector('#speechTabs');
  const modeBtn = el.querySelector('#speechModeBtn');
  const stage = el.querySelector('#speechStage');
  let bubbleEl = null;

  const overlayEditBtn = el.querySelector('#speechOverlayEditBtn');
  if(overlayEditBtn){
    overlayEditBtn.onclick = ()=>{
      openSpeechEditor(activeId, ()=>{
        // 편집기에서 탭이 삭제/추가됐을 수 있으니, 지금 보던 탭이 아직 있는지 다시 확인
        const freshTabs = speechWidgetData.tabs || [];
        if(!freshTabs.length){ closeSpeechOverlay(); return; }
        if(!freshTabs.find(t=> t.id === activeId)) activeId = freshTabs[0].id;
        renderTabs();
        renderStage();
      });
    };
  }

  const renderModeBtn = ()=>{
    const isOn = mode === 'character';
    modeBtn.classList.toggle('is-on', isOn);
    modeBtn.setAttribute('aria-pressed', String(isOn));
    modeBtn.querySelector('.speech-toggle-text').textContent = isOn ? '서로' : '모브';
    el.classList.toggle('is-on', isOn); // 켜졌을 때 배경에 은은한 핑크빛
  };

  const renderTabs = ()=>{
    const tabs = speechWidgetData.tabs || [];
    tabsEl.innerHTML = tabs.map(t=> `<button class="speech-tab-btn ${t.id===activeId?'active':''}" data-tab="${t.id}">${escapeHtml(t.name)}</button>`).join('');
    tabsEl.querySelectorAll('.speech-tab-btn').forEach(btn=>{
      btn.onclick = ()=>{ activeId = btn.dataset.tab; renderTabs(); renderStage(); };
    });
  };

  // 말풍선을 띄우는 공통 로직 — 영역을 눌렀을 때와, 영역 밖(빈 공간)을 눌러 기본 문구를
  // 보여줄 때 둘 다에서 씀
  const showBubbleAt = (box, e, text)=>{
    box.classList.remove('jump');
    void box.offsetWidth; // 강제 리플로우 — 연속으로 눌러도 매번 애니메이션이 다시 시작되게 함
    box.classList.add('jump');
    if(!text) return;
    if(bubbleEl){ bubbleEl.parentElement.remove(); bubbleEl = null; }
    // anchor(위치 고정용) 안에 실제 말풍선(팝인 애니메이션용)을 넣는 이중 구조.
    // 하나의 요소에 "위치 이동 transform"과 "팝인 transform"을 같이 걸면 서로
    // 덮어써서 말풍선이 떴다가 제자리로 툭 튀는 문제가 있었음 — 그래서 위치는
    // anchor(top/left, transform 없음)가, 팝인 애니메이션은 그 안의 본체가 각자 맡게 함.
    const anchor = document.createElement('div');
    anchor.className = 'speech-bubble-anchor';
    const stageRect = stage.getBoundingClientRect();
    anchor.style.left = (e.clientX - stageRect.left) + 'px';
    anchor.style.top = (e.clientY - stageRect.top) + 'px';
    bubbleEl = document.createElement('div');
    bubbleEl.className = 'speech-bubble'; // 스티커 말풍선과 같은 디자인(본체+꼬리 SVG clip-path)
    bubbleEl.textContent = text;
    // 말풍선은 누른 지점을 중심으로 좌우 반반씩 퍼지므로, 단순히 폭을 고정값으로
    // 줄이기만 하면 캐릭터가 화면 가장자리 쪽에 있을 때(둘이 나란히 있는 화면이라
    // 흔함) 여전히 한쪽만 화면 밖으로 넘치고, 반대쪽엔 다 못 쓴 여백만 남음.
    // 그래서 CSS 고정값 대신, 누른 지점에서 화면 양쪽 가장자리까지 각각 남은
    // 공간을 재서 그 중 더 좁은 쪽을 기준으로 폭을 미리 정함 — 그래야 여백을
    // 낭비하지 않으면서도 애초에 화면 밖으로 나갈 일이 없음.
    const edgeMargin = 14;
    const roomEachSide = Math.min(e.clientX, window.innerWidth - e.clientX) - edgeMargin;
    const maxW = Math.max(160, Math.min(280, roomEachSide * 2));
    anchor.appendChild(bubbleEl);
    stage.appendChild(anchor);
    shrinkToFitWidth(bubbleEl, maxW, 120);
    requestAnimationFrame(()=>{
      shapeSpeechBubble(bubbleEl, { radius:18, tailLeft:(w)=> (w-18)/2, tailWidth:18, tailHeight:9 });
      bubbleEl.classList.add('show');
      // 폭을 미리 딱 맞게 계산해뒀지만, 혹시 모를 반올림 오차 등으로 아주 살짝
      // 남는 경우를 대비한 최종 안전장치 — 화면 밖으로 넘치면 그만큼만 안쪽으로 밀어줌
      // (꼬리는 여전히 그 앵커를 가리키므로, 많이 밀렸을 때만 꼬리 위치가 클릭
      // 지점에서 살짝 벗어나 보일 수 있지만 텍스트가 잘리는 것보단 나음)
      const margin = 14;
      const rect = bubbleEl.getBoundingClientRect();
      let dx = 0;
      if(rect.left < margin) dx = margin - rect.left;
      else if(rect.right > window.innerWidth - margin) dx = (window.innerWidth - margin) - rect.right;
      if(dx) anchor.style.left = (parseFloat(anchor.style.left) + dx) + 'px';
    });
  };

  const renderStage = async ()=>{
    if(bubbleEl){ bubbleEl.parentElement.remove(); bubbleEl = null; }
    const tabs = speechWidgetData.tabs || [];
    const tab = tabs.find(t=> t.id === activeId);
    if(!tab){ stage.innerHTML = `<div class="speech-empty-hint">아직 준비 중이에요</div>`; return; }
    const urls = await Promise.all(tab.characters.map(speechResolveCharacterUrl));
    stage.innerHTML = urls.map((url, idx)=> url
      ? `<div class="speech-charbox" data-char="${idx}"><img src="${url}" alt=""><svg viewBox="0 0 100 100" preserveAspectRatio="none"></svg></div>`
      : ''
    ).join('');

    stage.querySelectorAll('.speech-charbox').forEach(box=>{
      const idx = Number(box.dataset.char);
      const svg = box.querySelector('svg');
      const regions = tab.regions.filter(r=> r.character === idx);
      svg.innerHTML = regions.map(r=> speechRegionSvgShape(r, 'speech-region')).join('');
      svg.querySelectorAll('[data-region]').forEach(regionEl=>{
        regionEl.addEventListener('click', (e)=>{
          const region = regions.find(r=> r.id === regionEl.dataset.region);
          if(!region) return;
          const text = mode === 'other' ? region.textOther : region.textCharacter;
          showBubbleAt(box, e, text);
        });
      });
      // 영역이 아닌 빈 곳(캐릭터 몸 어디든 지정 안 해둔 자리)을 눌렀을 때는 탭에 설정해둔
      // 기본 문구를 보여줌. e.target === svg일 때만(=영역 위가 아니라 배경 자체를 눌렀을
      // 때만) 걸리도록 해서 영역 클릭과 안 겹치게 함.
      svg.addEventListener('click', (e)=>{
        if(e.target !== svg) return;
        const text = mode === 'other' ? tab.characters[idx].defaultTextOther : tab.characters[idx].defaultTextCharacter;
        showBubbleAt(box, e, text);
      });
    });
  };

  modeBtn.onclick = ()=>{ mode = mode === 'other' ? 'character' : 'other'; renderModeBtn(); if(bubbleEl){ bubbleEl.parentElement.remove(); bubbleEl = null; } };

  renderModeBtn();
  renderTabs();
  renderStage();
}

/* ---------------- 카드 겉모습 설정(커버 사진/문구) — 대사 편집기와 별개 ---------------- */

function openSpeechCoverEditor(){
  const cover = normalizeSpeechCover(speechWidgetData.cover);
  let draftImage = { image: cover.image, imageChunked: cover.imageChunked, imageFileId: cover.imageFileId, imageChunkTotal: cover.imageChunkTotal };
  let imageChanged = false;

  openModal(`
    <h3>위젯 카드 겉모습 설정</h3>
    <p class="hint">카드가 이 사진 한 장으로 꽉 채워져요. (대사·탭 내용엔 영향 없음)</p>
    <div class="speech-editor-slot" id="scImgSlot">
      <input type="file" accept="image/png,image/jpeg,image/gif" id="scFile">
    </div>
    <label>카드에 같이 보여줄 문구 (선택)</label>
    <input type="text" id="scText" placeholder="예: 눌러서 대화해보기" value="${escapeHtml(cover.text)}">
    <div class="modal-actions">
      <button class="btn ghost" id="scCancelBtn">취소</button>
      <button class="btn primary" id="scSaveBtn">저장</button>
    </div>
  `, async (modal)=>{
    const slot = modal.querySelector('#scImgSlot');
    const fileInput = modal.querySelector('#scFile');

    const renderPreview = async ()=>{
      const url = draftImage.imageChunked || draftImage.image
        ? await speechResolveCharacterUrl({ avatar: draftImage.image, avatarChunked: draftImage.imageChunked, avatarFileId: draftImage.imageFileId, avatarChunkTotal: draftImage.imageChunkTotal })
        : '';
      slot.innerHTML = `
        ${url ? `<img src="${url}" alt="">` : '이미지를 올려주세요'}
        <input type="file" accept="image/png,image/jpeg,image/gif" id="scFile">
        ${url ? `<button class="btn small ghost" id="scRemoveBtn" type="button">이미지 제거</button>` : ''}
      `;
      slot.querySelector('#scFile').onchange = onFileChange;
      const removeBtn = slot.querySelector('#scRemoveBtn');
      if(removeBtn) removeBtn.onclick = ()=>{
        draftImage = { image:'', imageChunked:false, imageFileId:'', imageChunkTotal:0 };
        imageChanged = true;
        renderPreview();
      };
    };

    async function onFileChange(){
      const input = slot.querySelector('#scFile');
      const file = input.files[0];
      if(!file) return;
      try{
        const dataUrl = await compressAvatarImageFile(file);
        draftImage = { image: dataUrl, imageChunked: false, imageFileId:'', imageChunkTotal:0 };
        imageChanged = true;
        await renderPreview();
      }catch(err){ toast(err.message || '이미지를 올리지 못했어요'); }
    }
    fileInput.onchange = onFileChange;
    await renderPreview();

    modal.querySelector('#scCancelBtn').onclick = closeModal;
    modal.querySelector('#scSaveBtn').onclick = async ()=>{
      const text = modal.querySelector('#scText').value.trim();
      if(imageChanged && draftImage.image){
        // 새로 고른 이미지는 아직 압축된 base64 상태 — 저장 직전에 청크로 올림(다른 이미지들과 같은 방식)
        const old = cover;
        const chunkInfo = await saveFileChunked(draftImage.image);
        chunkedImageCache.set(chunkInfo.fileId, draftImage.image);
        if(old.imageChunked && old.imageFileId) deleteFileChunked(old.imageFileId, old.imageChunkTotal).catch(()=>{});
        draftImage = { image:'', imageChunked:true, imageFileId: chunkInfo.fileId, imageChunkTotal: chunkInfo.total };
      } else if(imageChanged && !draftImage.image){
        if(cover.imageChunked && cover.imageFileId) deleteFileChunked(cover.imageFileId, cover.imageChunkTotal).catch(()=>{});
      }
      speechWidgetData.cover = normalizeSpeechCover({ ...draftImage, text });
      await saveSpeechWidget();
      closeModal();
      renderSpeechCard();
      toast('저장했어요');
    };
  }, 'modal-speech-editor');
}

/* ---------------- 편집기(편집모드 전용) ---------------- */

function openSpeechEditor(initialTabId, onClose){
  const tabs = speechWidgetData.tabs || [];
  speechEditorTabId = (initialTabId && tabs.find(t=> t.id === initialTabId)) ? initialTabId : (tabs[0] ? tabs[0].id : null);

  openModal(`
    <h3>말풍선 위젯 편집</h3>
    <div class="speech-editor-tabbar" id="seTabbar"></div>
    <div id="seTabBody"></div>
    <div class="modal-actions"><button class="btn ghost" id="seCloseBtn">닫기</button></div>
  `, (modal)=>{
    modal.querySelector('#seCloseBtn').onclick = ()=>{ closeModal(); renderSpeechCard(); if(typeof onClose === 'function') onClose(); };
    renderEditorTabbar(modal);
    renderEditorTabBody(modal);
  }, 'modal-speech-editor');
}

function renderEditorTabbar(modal){
  const tabs = speechWidgetData.tabs || [];
  const bar = modal.querySelector('#seTabbar');
  bar.innerHTML = `
    ${tabs.map(t=> `<button class="speech-tab-btn ${t.id===speechEditorTabId?'active':''}" data-tab="${t.id}">${escapeHtml(t.name)}</button>`).join('')}
    <input type="text" id="seNewTabInput" placeholder="새 탭 이름" style="width:120px;">
    <button class="btn small" id="seAddTabBtn">+ 탭 추가</button>
  `;
  bar.querySelectorAll('[data-tab]').forEach(btn=>{
    btn.onclick = ()=>{ speechEditorTabId = btn.dataset.tab; renderEditorTabbar(modal); renderEditorTabBody(modal); };
  });
  const newInput = bar.querySelector('#seNewTabInput');
  const addTab = async ()=>{
    const name = newInput.value.trim();
    if(!name){ newInput.focus(); return; }
    const t = normalizeSpeechTab({ name });
    speechWidgetData.tabs = [...tabs, t];
    speechEditorTabId = t.id;
    await saveSpeechWidget();
    renderEditorTabbar(modal); renderEditorTabBody(modal);
  };
  bar.querySelector('#seAddTabBtn').onclick = addTab;
  newInput.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); addTab(); } });
}

function renderEditorTabBody(modal){
  const body = modal.querySelector('#seTabBody');
  const tabs = speechWidgetData.tabs || [];
  const tab = tabs.find(t=> t.id === speechEditorTabId);
  if(!tab){ body.innerHTML = `<p class="hint">왼쪽 위에서 탭을 추가해주세요.</p>`; return; }

  body.innerHTML = `
    <div class="modal-actions" id="seTabActions" style="justify-content:flex-start; margin-top:0; gap:8px; flex-wrap:wrap;"></div>
    <div class="speech-editor-tools">
      <label style="margin:0;"><input type="radio" name="seShape" value="box" checked> 박스로 그리기</label>
      <label style="margin:0;"><input type="radio" name="seShape" value="lasso"> 올가미로 그리기</label>
      <span class="hint" style="margin:0;">이미지 위에서 드래그해 영역을 그리고, 양옆에 대사를 입력해주세요.</span>
    </div>
    <div class="speech-editor-layout" id="seLayout">
      <div class="speech-editor-side" data-char="0"><h4>캐릭터1</h4></div>
      <div class="speech-editor-center">
        <div class="speech-editor-uploads">
          <div class="speech-editor-slot" id="seSlot0"><input type="file" accept="image/png,image/jpeg,image/gif" id="seFile0"></div>
          <div class="speech-editor-slot" id="seSlot1"><input type="file" accept="image/png,image/jpeg,image/gif" id="seFile1"></div>
        </div>
        <div class="speech-editor-stage-dual" id="seStageDual"></div>
      </div>
      <div class="speech-editor-side" data-char="1"><h4>캐릭터2</h4></div>
    </div>
  `;

  renderTabActions(modal, tab, false);
  modal.querySelectorAll('input[name="seShape"]').forEach(r=> r.onchange = ()=>{ speechDrawShape = r.value; });

  [0,1].forEach(idx=> renderEditorUploadSlot(modal, tab, idx));
  [0,1].forEach(idx=> renderEditorSide(modal, tab, idx));
  renderEditorDualStage(modal, tab);
}

// 가운데 업로드 칸(캐릭터1/2 사진) — 양옆 문구 패널과는 별개라 여기 따로 둠
function renderEditorUploadSlot(modal, tab, idx){
  const slot = modal.querySelector(`#seSlot${idx}`);
  const ch = tab.characters[idx];
  const hasImage = !!(ch.avatar || ch.avatarChunked);
  slot.innerHTML = `
    ${hasImage ? '' : `캐릭터${idx+1} 이미지`}
    <input type="file" accept="image/png,image/jpeg,image/gif" id="seFile${idx}">
  `;
  slot.querySelector(`#seFile${idx}`).onchange = async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    try{
      const dataUrl = await compressAvatarImageFile(file);
      const old = tab.characters[idx];
      if(old.avatarChunked && old.avatarFileId) deleteFileChunked(old.avatarFileId, old.avatarChunkTotal).catch(()=>{});
      const chunkInfo = await saveFileChunked(dataUrl);
      chunkedImageCache.set(chunkInfo.fileId, dataUrl);
      // 이미지만 바꾸는 거니까 기본 문구(defaultTextOther/Character) 등 나머지 필드는 그대로 유지
      tab.characters[idx] = { ...old, avatar:'', avatarChunked:true, avatarFileId: chunkInfo.fileId, avatarChunkTotal: chunkInfo.total };
      await saveSpeechWidget();
      renderEditorUploadSlot(modal, tab, idx);
      renderEditorDualStage(modal, tab);
    }catch(err){ toast(err.message || '이미지를 올리지 못했어요'); }
  };
}

// 양옆 문구 패널 — 이 캐릭터의 기본 문구 + 저장된 영역 목록만 담당(이미지/그리기는
// 가운데(renderEditorDualStage)가 담당)
function renderEditorSide(modal, tab, idx){
  const side = modal.querySelector(`.speech-editor-side[data-char="${idx}"]`);
  const ch = tab.characters[idx];
  side.innerHTML = `
    <h4>캐릭터${idx+1}</h4>
    <div class="speech-region-row" id="seDefaultTextRow${idx}">
      <div class="speech-region-row-top"><span>영역 밖(빈 곳)을 눌렀을 때 뜨는 기본 문구</span></div>
      <label>모브용</label>
      <textarea id="seDefaultOther${idx}">${escapeHtml(ch.defaultTextOther)}</textarea>
      <label>서로용</label>
      <textarea id="seDefaultCharacter${idx}">${escapeHtml(ch.defaultTextCharacter)}</textarea>
      <div class="modal-actions" style="justify-content:flex-start; margin-top:4px;">
        <button class="btn small primary" id="seDefaultSaveBtn${idx}">저장</button>
        <button class="btn small ghost" id="seDefaultCancelBtn${idx}">취소</button>
      </div>
    </div>
    <div class="speech-region-list" id="seRegionList${idx}"></div>
  `;

  const defaultRow = side.querySelector(`#seDefaultTextRow${idx}`);
  defaultRow.querySelector(`#seDefaultSaveBtn${idx}`).onclick = async ()=>{
    ch.defaultTextOther = defaultRow.querySelector(`#seDefaultOther${idx}`).value;
    ch.defaultTextCharacter = defaultRow.querySelector(`#seDefaultCharacter${idx}`).value;
    await saveSpeechWidget();
    toast('저장했어요');
  };
  defaultRow.querySelector(`#seDefaultCancelBtn${idx}`).onclick = ()=>{
    defaultRow.querySelector(`#seDefaultOther${idx}`).value = ch.defaultTextOther;
    defaultRow.querySelector(`#seDefaultCharacter${idx}`).value = ch.defaultTextCharacter;
  };

  renderEditorRegionList(modal, tab, idx);
}

// 가운데: 캐릭터 둘을 나란히(방문자가 실제로 보는 모습과 같게) 놓고 그 위에서 그리게 함.
// 캐릭터별 좌표계는 여전히 독립적으로 유지함(renderEditorCharStage 내부 로직은 그대로,
// 붙는 자리만 전용 mount로 바뀜)
function renderEditorDualStage(modal, tab){
  const wrap = modal.querySelector('#seStageDual');
  wrap.innerHTML = `<div class="speech-editor-mount" id="seCharBox0"></div><div class="speech-editor-mount" id="seCharBox1"></div>`;
  renderEditorCharStage(modal, tab, 0, null);
  renderEditorCharStage(modal, tab, 1, null);
}

// 탭 이름변경/삭제 액션 줄 — 브라우저 기본 prompt()/confirm() 대신, 사이트 톤에 맞는
// 인라인 입력창과 2단계 확인(먼저 눌렀을 때만 "정말요?"로 바뀜)으로 대체함.
function renderTabActions(modal, tab, confirmingDelete){
  const wrap = modal.querySelector('#seTabActions');
  if(confirmingDelete){
    wrap.innerHTML = `
      <span class="hint" style="margin:0;">이 탭을 삭제할까요? 이미지·대사도 함께 사라져요.</span>
      <button class="btn small danger" id="seDeleteConfirmBtn">삭제</button>
      <button class="btn small ghost" id="seDeleteCancelBtn">취소</button>
    `;
    wrap.querySelector('#seDeleteConfirmBtn').onclick = async ()=>{
      tab.characters.forEach(c=>{ if(c.avatarChunked && c.avatarFileId) deleteFileChunked(c.avatarFileId, c.avatarChunkTotal).catch(()=>{}); });
      speechWidgetData.tabs = (speechWidgetData.tabs || []).filter(t=> t.id !== tab.id);
      speechEditorTabId = speechWidgetData.tabs[0] ? speechWidgetData.tabs[0].id : null;
      await saveSpeechWidget();
      renderEditorTabbar(modal); renderEditorTabBody(modal);
    };
    wrap.querySelector('#seDeleteCancelBtn').onclick = ()=> renderTabActions(modal, tab, false);
    return;
  }
  wrap.innerHTML = `
    <input type="text" id="seNameInput" value="${escapeHtml(tab.name)}" style="width:140px;">
    <button class="btn small" id="seRenameBtn">이름 저장</button>
    <button class="btn small danger" id="seDeleteTabBtn">이 탭 삭제</button>
  `;
  const nameInput = wrap.querySelector('#seNameInput');
  const saveName = async ()=>{
    const name = nameInput.value.trim();
    if(!name || name === tab.name) return;
    tab.name = name;
    await saveSpeechWidget();
    renderEditorTabbar(modal);
  };
  wrap.querySelector('#seRenameBtn').onclick = saveName;
  nameInput.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); saveName(); } });
  wrap.querySelector('#seDeleteTabBtn').onclick = ()=> renderTabActions(modal, tab, true);
}

// 캐릭터 한 명 분(이미지 업로드 + 그리기 스테이지 + 대사 목록)을 통째로 그리고 관리함.
// 프로필 편집창의 "인물별 컬럼" 구성을 그대로 가져와서, 캐릭터1/캐릭터2 항목이 서로
// 이 캐릭터의 그리기 영역(가운데 공유 스테이지 안의 자기 자신 자리). pendingRegion이
// 있으면(방금 그려서 아직 저장 전) 점선으로 같이 보여줌 — 저장을 눌러야 진짜 데이터에
// 들어가고, 취소하면 흔적도 없이 사라짐.
async function renderEditorCharStage(modal, tab, idx, pendingRegion){
  const stage = modal.querySelector(`#seCharBox${idx}`);
  const url = await speechResolveCharacterUrl(tab.characters[idx]);
  if(!url){ stage.innerHTML = `<div class="speech-charbox-empty">캐릭터${idx+1} 이미지를 먼저 올려주세요</div>`; return; }

  stage.innerHTML = `<div class="speech-charbox"><img src="${url}" alt=""><svg viewBox="0 0 100 100" preserveAspectRatio="none"></svg></div>`;
  const svg = stage.querySelector('svg');
  const regions = tab.regions.filter(r=> r.character === idx);
  svg.innerHTML = regions.map(r=> speechRegionSvgShape(r, 'speech-editor-region')).join('')
    + (pendingRegion ? speechRegionSvgShape(pendingRegion, 'speech-editor-region speech-editor-region-pending') : '');

  const toPercent = (e)=>{
    const rect = svg.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return { x, y };
  };

  let drawing = false, startPt = null, currentPt = null, lassoPts = [], liveEl = null;

  svg.addEventListener('mousedown', (e)=>{
    if(pendingRegion) return; // 저장 전인 그리기가 이미 있으면, 그거부터 저장/취소해야 새로 그릴 수 있음
    if(e.target.dataset && e.target.dataset.region) return; // 기존 영역 클릭은 새로 그리기로 안 이어짐
    drawing = true;
    startPt = toPercent(e);
    currentPt = startPt;
    lassoPts = [startPt];
    liveEl = document.createElementNS('http://www.w3.org/2000/svg', speechDrawShape === 'box' ? 'rect' : 'polygon');
    liveEl.setAttribute('class', 'speech-editor-region speech-editor-region-pending');
    svg.appendChild(liveEl);
  });
  svg.addEventListener('mousemove', (e)=>{
    if(!drawing) return;
    const pt = toPercent(e);
    currentPt = pt; // 박스 모드는 이 값으로 끝점을 잡음(올가미처럼 lassoPts에만 의존하면 박스는 항상 시작점=끝점이 되어버림)
    if(speechDrawShape === 'box'){
      const x = Math.min(startPt.x, pt.x), y = Math.min(startPt.y, pt.y);
      const w = Math.abs(pt.x - startPt.x), h = Math.abs(pt.y - startPt.y);
      liveEl.setAttribute('x', x + '%'); liveEl.setAttribute('y', y + '%');
      liveEl.setAttribute('width', w + '%'); liveEl.setAttribute('height', h + '%');
    } else {
      lassoPts.push(pt);
      liveEl.setAttribute('points', lassoPts.map(p=> `${p.x},${p.y}`).join(' '));
    }
  });
  const finishDrawing = ()=>{
    if(!drawing) return;
    drawing = false;
    if(liveEl) liveEl.remove();
    let region;
    if(speechDrawShape === 'box'){
      const endPt = currentPt || startPt;
      const x = Math.min(startPt.x, endPt.x), y = Math.min(startPt.y, endPt.y);
      const w = Math.abs(endPt.x - startPt.x), h = Math.abs(endPt.y - startPt.y);
      if(w < 1 || h < 1) return; // 너무 작게 클릭만 한 경우는 무시
      region = { id: uid(), character: idx, shape:'box', points:{x,y,w,h}, textOther:'', textCharacter:'' };
    } else {
      if(lassoPts.length < 3) return;
      region = { id: uid(), character: idx, shape:'lasso', points: lassoPts, textOther:'', textCharacter:'' };
    }
    // 아직 tab.regions에는 안 넣고(=Firestore에도 저장 안 됨), 대사를 입력하고
    // "저장"을 눌러야만 실제로 반영됨. 아래 renderPendingRegionForm이 그 저장/취소를 담당.
    renderEditorCharStage(modal, tab, idx, region);
    renderPendingRegionForm(modal, tab, idx, region);
  };
  svg.addEventListener('mouseup', finishDrawing);
  svg.addEventListener('mouseleave', ()=>{ if(drawing){ drawing = false; if(liveEl) liveEl.remove(); } });
}

// 방금 그린(아직 저장 안 된) 영역의 대사 입력 폼 — 저장을 눌러야 tab.regions에 들어가고
// Firestore에 반영됨. 취소를 누르면 그린 도형 자체가 흔적 없이 사라짐.
function renderPendingRegionForm(modal, tab, idx, pendingRegion){
  const list = modal.querySelector(`#seRegionList${idx}`);
  const form = document.createElement('div');
  form.className = 'speech-region-row speech-region-row-pending';
  form.innerHTML = `
    <div class="speech-region-row-top">
      <span>새 영역 (${pendingRegion.shape === 'box' ? '박스' : '올가미'}) · 아직 저장 전이에요</span>
    </div>
    <div class="speech-text-pair">
      <div class="speech-text-pair-col">
        <label>모브용 대사</label>
        <textarea id="sePendingOther"></textarea>
      </div>
      <div class="speech-text-pair-col">
        <label>서로용 대사</label>
        <textarea id="sePendingCharacter"></textarea>
      </div>
    </div>
    <div class="modal-actions" style="justify-content:flex-start; margin-top:4px;">
      <button class="btn small primary" id="sePendingSave">저장</button>
      <button class="btn small ghost" id="sePendingCancel">취소</button>
    </div>
  `;
  list.prepend(form);
  form.querySelector('#sePendingSave').onclick = async ()=>{
    pendingRegion.textOther = form.querySelector('#sePendingOther').value;
    pendingRegion.textCharacter = form.querySelector('#sePendingCharacter').value;
    tab.regions.push(pendingRegion);
    await saveSpeechWidget();
    renderEditorCharStage(modal, tab, idx, null);
    renderEditorRegionList(modal, tab, idx);
  };
  form.querySelector('#sePendingCancel').onclick = ()=>{
    renderEditorCharStage(modal, tab, idx, null); // 저장 안 했으니 그린 도형만 그냥 지움
    renderEditorRegionList(modal, tab, idx);
  };
}

// 이미 저장된 영역들의 목록 — 텍스트를 고치면 곧바로 반영되지 않고, "저장"을 눌러야
// 반영되며 "취소"를 누르면 마지막으로 저장된 내용으로 되돌아감(맘대로 조용히 사라지지 않음).
function renderEditorRegionList(modal, tab, idx){
  const list = modal.querySelector(`#seRegionList${idx}`);
  const regions = tab.regions.filter(r=> r.character === idx);
  if(regions.length === 0){ list.innerHTML = `<p class="hint">아직 그려진 영역이 없어요.</p>`; return; }
  list.innerHTML = regions.map((r,i)=> `
    <div class="speech-region-row" data-region="${r.id}">
      <div class="speech-region-row-top">
        <span>영역 ${i+1} (${r.shape === 'box' ? '박스' : '올가미'})</span>
        <button class="btn small danger" data-del="${r.id}">삭제</button>
      </div>
      <div class="speech-text-pair">
        <div class="speech-text-pair-col">
          <label>모브용 대사</label>
          <textarea data-field="textOther">${escapeHtml(r.textOther)}</textarea>
        </div>
        <div class="speech-text-pair-col">
          <label>서로용 대사</label>
          <textarea data-field="textCharacter">${escapeHtml(r.textCharacter)}</textarea>
        </div>
      </div>
      <div class="modal-actions" style="justify-content:flex-start; margin-top:4px;">
        <button class="btn small primary" data-save="${r.id}">저장</button>
        <button class="btn small ghost" data-cancel="${r.id}">취소</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-del]').forEach(btn=>{
    btn.onclick = async ()=>{
      if(!(await confirmDelete('이 영역을 정말 삭제할까요?'))) return;
      tab.regions = tab.regions.filter(r=> r.id !== btn.dataset.del);
      await saveSpeechWidget();
      renderEditorCharStage(modal, tab, idx, null);
      renderEditorRegionList(modal, tab, idx);
    };
  });
  list.querySelectorAll('[data-save]').forEach(btn=>{
    btn.onclick = async ()=>{
      const row = btn.closest('.speech-region-row');
      const region = tab.regions.find(r=> r.id === row.dataset.region);
      if(!region) return;
      region.textOther = row.querySelector('[data-field="textOther"]').value;
      region.textCharacter = row.querySelector('[data-field="textCharacter"]').value;
      await saveSpeechWidget();
      toast('저장했어요');
    };
  });
  list.querySelectorAll('[data-cancel]').forEach(btn=>{
    btn.onclick = ()=>{ renderEditorRegionList(modal, tab, idx); }; // 마지막 저장 상태로 다시 그림(입력 중이던 내용 버림)
  });
}

/* ---------------- 쉐이커 위젯 ----------------
   아크릴 쉐이커 굿즈처럼, 프레임 안에 사진 조각들을 넣어두고 흔들면 서로
   부딪히며 자연스럽게 섞이는 연출. 사진 목록 자체는 다른 갤러리들과 똑같은
   방식(docRef('shaker'), 청크 저장, resolveGalleryItemUrl)으로 관리하고,
   위치/속도 같은 물리 상태는 그 목록과 별개로 이 위젯이 메모리에서만 들고
   있음 — Firestore 스냅샷이 다시 올 때마다(예: 다른 항목 편집으로 인한
   재알림) 위치가 리셋되지 않도록, 목록이 실제로 늘거나 줄었을 때만 조각을
   추가/삭제하고 나머지 조각은 그대로 둠. */
let shakerData = { items: [] };
let shakerPieces = []; // { key, url, chunked, fileId, chunkTotal, x, y, vx, vy, r, el, imgEl }
let shakerFrameEl = null;
let shakerFrameSize = { w: 0, h: 0 };

function normalizeShakerItem(it){
  if(typeof it === 'string') return { url: it, chunked:false, fileId:'', chunkTotal:0 };
  return { url: it.url || '', chunked: !!it.chunked, fileId: it.fileId || '', chunkTotal: it.chunkTotal || 0 };
}
function shakerItemKey(it){ return it.chunked ? ('f:'+it.fileId) : ('u:'+it.url); }

// 이미지 안에 투명한 픽셀이 하나라도 있으면(스티커성 PNG) 동그란 프레임을
// 씌우지 않고 원본 모양 그대로 보여주기 위한 검사. data: URL(청크 저장된
// 사진 대부분)은 캔버스로 안전하게 읽을 수 있지만, 외부 URL은 CORS 정책에
// 따라 캔버스가 "오염"돼 읽기가 막힐 수 있어서 그 경우엔 조용히 실패하고
// 기본값(프레임 적용)으로 둠.
function shakerDetectAlpha(imgEl){
  return new Promise(resolve=>{
    try{
      const w = Math.min(48, imgEl.naturalWidth || 48) || 48;
      const h = Math.min(48, imgEl.naturalHeight || 48) || 48;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(imgEl, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      for(let i = 3; i < data.length; i += 4){
        if(data[i] < 250){ resolve(true); return; }
      }
      resolve(false);
    }catch(err){ resolve(false); }
  });
}

// 조각 크기는 프레임 넓이/개수에 맞춰 자동으로 줄어들어서, 사진이 늘어나도
// 항상 프레임 안에 자연스럽게 들어차게 함(너무 작아지거나 커지지 않게 상하한만 둠)
function shakerPieceRadius(count, w, h){
  const area = Math.max(1, w) * Math.max(1, h);
  const r = Math.sqrt(area / (Math.max(1, count) * 5));
  // 예전엔 상한이 22px 고정이라, 위젯 카드 안에서든 전체화면에서든 조각이
  // 똑같이 작게만 보였음(전체화면에서 커져야 하는데 그대로였음). 프레임이 큰
  // 만큼(=전체화면) 조각도 실제로 커 보이도록, 상한을 프레임의 짧은 변에
  // 비례하게 바꿈 — 좁은 위젯 카드에서는 예전과 비슷하게, 넓은 전체화면에서는
  // 훨씬 크게 나옴
  const minSide = Math.min(w, h);
  const maxR = Math.max(22, minSide * 0.22);
  return Math.max(11, Math.min(maxR, r));
}

function syncShakerPieces(){
  shakerFrameEl = document.getElementById('shakerFrame');
  const emptyEl = document.getElementById('shakerEmpty');
  if(!shakerFrameEl) return;
  const items = (shakerData.items || []).map(normalizeShakerItem);
  if(emptyEl) emptyEl.style.display = items.length ? 'none' : 'flex';

  const keep = new Set(items.map(shakerItemKey));
  shakerPieces = shakerPieces.filter(p=>{
    if(keep.has(p.key)) return true;
    p.el.remove();
    return false;
  });
  const existingKeys = new Set(shakerPieces.map(p=> p.key));
  const rect = shakerFrameEl.getBoundingClientRect();
  shakerFrameSize = { w: rect.width || 200, h: rect.height || 140 };
  const r = shakerPieceRadius(Math.max(items.length, 1), shakerFrameSize.w, shakerFrameSize.h);

  items.forEach(it=>{
    const key = shakerItemKey(it);
    if(existingKeys.has(key)) return;
    const el = document.createElement('div');
    el.className = 'shaker-piece';
    const size = r * 2;
    el.style.width = size+'px'; el.style.height = size+'px';
    const imgEl = document.createElement('img');
    imgEl.alt = '';
    imgEl.draggable = false; // 흔들 때 브라우저 기본 "이미지 드래그(고스트)" 동작으로 오인식되지 않게 함
    el.appendChild(imgEl);
    shakerFrameEl.appendChild(el);
    const px = r + Math.random() * Math.max(1, shakerFrameSize.w - r*2);
    const py = r + Math.random() * Math.max(1, shakerFrameSize.h - r*2);
    shakerPieces.push({
      key, ...it, x: px, y: py,
      vx: (Math.random()-0.5) * 2, vy: (Math.random()-0.5) * 2,
      rot: Math.random() * 360, vr: (Math.random()-0.5) * 3,
      r, el, imgEl
    });
  });

  // 개수가 바뀌면 반지름도 전체에 다시 맞춤(새로 늘어난 사진 포함해서 자연스러운 크기로)
  shakerPieces.forEach(p=>{
    p.r = r;
    const size = r * 2;
    p.el.style.width = size+'px'; p.el.style.height = size+'px';
    if(!p.imgEl.src){
      const setSrc = (url)=>{
        p.imgEl.src = url;
        p.imgEl.onload = ()=> shakerDetectAlpha(p.imgEl).then(hasAlpha=>{
          p.el.classList.toggle('shaker-piece-plain', hasAlpha);
        });
      };
      // 청크(조각) 저장된 사진은 로딩이 끝나도 콜백 인자로 실제 주소가 넘어오지
      // 않고, chunkedImageCache에 다시 채워넣는 방식이라(다른 갤러리 위젯들도
      // 전부 이 패턴을 씀) 콜백 인자를 그대로 쓰면 안 되고 캐시에서 다시 읽어와야 함
      const resolved = resolveGalleryItemUrl(p, ()=> setSrc(chunkedImageCache.get(p.fileId) || ''));
      if(resolved) setSrc(resolved);
    }
  });
}

function shakerFrameResized(){
  if(!shakerFrameEl) return;
  const rect = shakerFrameEl.getBoundingClientRect();
  const nw = rect.width || shakerFrameSize.w, nh = rect.height || shakerFrameSize.h;
  if(nw === shakerFrameSize.w && nh === shakerFrameSize.h) return;
  // 창 크기 변화 등으로 프레임이 커지거나 작아지면, 조각들이 밖으로 튀어나가지
  // 않게 이전 프레임 대비 비율로 위치를 다시 맞춰줌
  shakerPieces.forEach(p=>{
    p.x = Math.min(Math.max(p.r, p.x / Math.max(1, shakerFrameSize.w) * nw), nw - p.r);
    p.y = Math.min(Math.max(p.r, p.y / Math.max(1, shakerFrameSize.h) * nh), nh - p.r);
  });
  // 프레임 크기가 큰 폭으로 바뀌면(전체화면 진입/복귀, 화면 회전 등) 조각 반지름도
  // 새 크기 기준으로 다시 계산해서, 커진 프레임에서 조각이 너무 작아 보이거나
  // 작아진 프레임에서 너무 커 보이지 않게 함
  const newR = shakerPieceRadius(Math.max(shakerPieces.length, 1), nw, nh);
  if(shakerPieces.length && Math.abs(newR - shakerPieces[0].r) > 1){
    const size = newR * 2;
    shakerPieces.forEach(p=>{
      p.r = newR;
      p.el.style.width = size+'px'; p.el.style.height = size+'px';
    });
  }
  shakerFrameSize = { w: nw, h: nh };
}

// 물리 튜닝값: 반발력은 세게(부딪히는 순간 딱딱하게 튕김) 주되, 중력·마찰·최고속도로
// 튕긴 뒤엔 금방 잦아들게 잡아서 "탱탱볼"이 아니라 "묵직한 조각"처럼 보이게 함.
// 중력은 프레임 대비 충분히 강하게 잡아 낙하가 무겁게 느껴지게 함.
const SHAKER_GRAVITY = 0.95;
const SHAKER_FRICTION = 0.9;
// 회전은 이동보다 빨리 잦아들되, 부딪히는 순간엔 매끈한 스핀 대신 툭툭 꺾이는
// 불규칙한 회전(아래 jag)을 줘서 "딱딱한 조각" 느낌을 냄
const SHAKER_ANGULAR_FRICTION = 0.82;
const SHAKER_WALL_RESTITUTION = 0.6;
const SHAKER_PIECE_RESTITUTION = 0.8;
// 벽 반사는 부딪힌 수직 성분만 튕기고, 벽을 타고 미끄러지는 접선 성분은 마찰로
// 깎아서 유리벽처럼 미끄러지지 않고 걸리는 느낌을 냄
const SHAKER_WALL_TANGENT_FRICTION = 0.75;
const SHAKER_MAX_SPEED = 26;
const SHAKER_MAX_ANGULAR_SPEED = 5; // deg/frame — 회전이 너무 어지럽게 빨라지지 않도록 상한
// 부동소수점 특성상 중력+반발이 반복되면 완전히 0으로 수렴하지 않고 미세하게
// 계속 튀는 상태가 남으므로, 이 밑으로 떨어지면 그냥 0으로 재워서 확실히 멈춤
const SHAKER_SLEEP_LINEAR = 0.4;   // px/frame
const SHAKER_SLEEP_ANGULAR = 0.4;  // deg/frame

// 전체화면 등에서 조각이 커지면 고정된 중력/속도/임펄스가 상대적으로 약해져
// 오히려 둔하게 느껴지므로, 이 스케일을 다 같이 곱해서 위젯 카드든 전체화면이든
// 항상 같은 느낌을 유지함
const SHAKER_BASE_R = 16; // 예전 고정 반지름(11~22)의 대략 중간값 — 이 기준 대비 비율
function shakerPhysicsScale(){
  const r = shakerPieces[0] ? shakerPieces[0].r : SHAKER_BASE_R;
  return r / SHAKER_BASE_R;
}

// 드래그 중엔 pointermove가 직접 힘을 쏘지 않고 목표 속도만 갱신해두고,
// stepShakerPhysics가 매 프레임 일정하게 힘을 흘려 넣음 — PC(이벤트 촘촘)와
// 모바일(이벤트 듬성) 둘 다 "힘이 들어오는 리듬"이 같아져 입력 방식 차이가 사라짐
let shakerDragActive = false;
let shakerDragVX = 0, shakerDragVY = 0;

function stepShakerPhysics(){
  requestAnimationFrame(stepShakerPhysics);
  if(document.hidden || !shakerPieces.length || !shakerFrameEl) return;
  // 지금 보이는 탭이 아니면(예: 갤러리 탭) 계산을 건너뛰어 불필요한 렉을 막음
  const page = shakerFrameEl.closest('.board-page');
  if(page && !page.classList.contains('board-page-active')) return;
  shakerFrameResized();
  const { w, h } = shakerFrameSize;
  const scale = shakerPhysicsScale();
  // 드래그 중이면 목표 속도만큼 매 프레임 일정하게 힘을 흘려 넣고, 입력이 없는
  // 동안엔 목표 속도를 서서히 줄여 손을 멈춰도 힘이 계속 나가지 않게 함
  if(shakerDragActive){
    const speed = Math.hypot(shakerDragVX, shakerDragVY);
    if(speed > 0.4) shakerApplyImpulse(shakerDragVX * 0.16, shakerDragVY * 0.16, Math.min(speed*0.22, 10));
    shakerDragVX *= 0.9; shakerDragVY *= 0.9;
  }
  const gravity = SHAKER_GRAVITY * scale;
  const maxSpeed = SHAKER_MAX_SPEED * scale;
  const sleepLinear = SHAKER_SLEEP_LINEAR * scale;
  const sleepAngular = SHAKER_SLEEP_ANGULAR * scale;
  shakerPieces.forEach(p=>{
    // 바닥/벽에 거의 붙어 속도가 작아지면 중력을 더 안 더하고 0으로 재움(안 그러면
    // 미세하게 계속 튐). 히트박스 p.r 기준이라 투명 여백 있는 스티커는 그만큼 더 파고듦
    const restingOnFloor = (h - (p.y + p.r)) < 0.6 * scale && Math.abs(p.vy) < sleepLinear;
    if(restingOnFloor){
      p.vy = 0; p.y = h - p.r;
    } else {
      p.vy += gravity;
    }
    // 공중에서는 마찰 없이 중력만 받아 자유낙하하게 해 무게감을 살리고, 바닥에
    // 정착 중일 때만 vy에 마찰을 걺
    p.vx *= SHAKER_FRICTION;
    if(restingOnFloor) p.vy *= SHAKER_FRICTION;
    const speed = Math.hypot(p.vx, p.vy);
    if(speed > maxSpeed){ const s = maxSpeed/speed; p.vx *= s; p.vy *= s; }
    if(Math.abs(p.vx) < sleepLinear) p.vx = 0;
    if(Math.abs(p.vy) < sleepLinear && restingOnFloor) p.vy = 0;
    p.x += p.vx; p.y += p.vy;
    // 회전 마찰은 이동보다 세게(전용 상수) 줘서 빨리 잦아들게 하고, 정지 기준도
    // scale에 비례시켜 전체화면처럼 조각이 커져도 비슷한 체감 속도로 멈추게 함
    p.vr *= SHAKER_ANGULAR_FRICTION;
    if(Math.abs(p.vr) < sleepAngular) p.vr = 0; // 회전도 충분히 느려지면 완전히 정지
    if(p.x - p.r < 0){ const before = p.vx; p.x = p.r; p.vx = -p.vx * SHAKER_WALL_RESTITUTION; p.vr += (p.vx - before) * 0.03; p.vy *= SHAKER_WALL_TANGENT_FRICTION; }
    if(p.x + p.r > w){ const before = p.vx; p.x = w - p.r; p.vx = -p.vx * SHAKER_WALL_RESTITUTION; p.vr += (p.vx - before) * 0.03; p.vy *= SHAKER_WALL_TANGENT_FRICTION; }
    if(p.y - p.r < 0){ const before = p.vy; p.y = p.r; p.vy = -p.vy * SHAKER_WALL_RESTITUTION; p.vr += (p.vy - before) * 0.03; p.vx *= SHAKER_WALL_TANGENT_FRICTION; }
    if(p.y + p.r > h){ const before = p.vy; p.y = h - p.r; p.vy = -p.vy * SHAKER_WALL_RESTITUTION; p.vr += (p.vy - before) * 0.03; p.vx *= SHAKER_WALL_TANGENT_FRICTION; }
    p.rot += p.vr;
  });
  // 겹치면 밀어내고 속도를 교환(단순 탄성충돌). 위치 보정은 매 pass마다 하되, 튕김은
  // "이번 프레임에 이 짝이 이미 튕겼는가"로 짝당 한 번만 처리해 에너지가 중복으로
  // 불어나는 걸 막음. 2 pass인 이유: 무더기 위로 떨어질 때 pass 0엔 아직 안 겹쳐
  // 있다가 다른 짝이 먼저 밀리며 pass 1에야 겹치는 경우도 튕길 기회를 줘야 하기 때문
  const boundedPairs = new Set();
  for(let pass=0; pass<2; pass++){
  for(let i=0;i<shakerPieces.length;i++){
    for(let j=i+1;j<shakerPieces.length;j++){
      const a = shakerPieces[i], b = shakerPieces[j];
      const dx = b.x-a.x, dy = b.y-a.y;
      const dist = Math.hypot(dx,dy) || 0.001;
      const minDist = a.r + b.r;
      if(dist < minDist){
        const nx = dx/dist, ny = dy/dist;
        const overlap = (minDist - dist) / 2;
        a.x -= nx*overlap; a.y -= ny*overlap;
        b.x += nx*overlap; b.y += ny*overlap;
        const pairKey = i + '_' + j;
        if(!boundedPairs.has(pairKey)){
          const relVel = (b.vx-a.vx)*nx + (b.vy-a.vy)*ny;
          if(relVel < 0){
            const imp = -(1+SHAKER_PIECE_RESTITUTION) * relVel / 2;
            a.vx -= imp*nx; a.vy -= imp*ny;
            b.vx += imp*nx; b.vy += imp*ny;
            // 접선 방향 반응에 무작위로 툭 꺾이는 회전(jag)을 더해, 매끈한 스핀이
            // 아니라 딱딱한 조각이 모서리에 걸려 불규칙하게 튀는 느낌을 냄
            const tx = -ny, ty = nx;
            const relVelT = (b.vx-a.vx)*tx + (b.vy-a.vy)*ty;
            const jag = Math.min(1, Math.abs(relVel)*0.045) * (Math.random()-0.5) * 1.1;
            a.vr -= relVelT * 0.028 + jag; b.vr -= relVelT * 0.028 - jag;
            boundedPairs.add(pairKey); // 이 짝은 이번 프레임엔 더 이상 안 튕김(중복 방지)
          }
        }
      }
    }
  }
  }
  shakerPieces.forEach(p=>{
    p.el.style.transform = `translate(${(p.x-p.r).toFixed(1)}px, ${(p.y-p.r).toFixed(1)}px) rotate(${p.rot.toFixed(1)}deg)`;
  });
}

// 흔들기로 주는 힘도 조각 크기(scale)에 비례해서 커지게 함 — 이 함수 하나만
// 고치면 마우스/터치 드래그, 실제 기기 흔들기(devicemotion) 양쪽 다 자동으로
// 적용됨(둘 다 이 함수를 통해서만 힘을 줌)
function shakerApplyImpulse(dvx, dvy, spread){
  const scale = shakerPhysicsScale();
  const mag = Math.hypot(dvx, dvy);
  const baseDir = Math.atan2(dvy, dvx);
  shakerPieces.forEach(p=>{
    // 모든 조각이 같은 방향으로만 움직이면 서로 상대속도가 없어 부딪혀도 안 튕기므로,
    // 조각마다 방향(최대 좌우 45도)과 세기(0.55~1.35배)를 흩뜨려 실제 통 안 참들처럼
    // 제각각 다른 속도로 흩어지게 함
    const dir = baseDir + (Math.random()-0.5) * 1.5;
    const power = mag * (0.55 + Math.random()*0.8) + (Math.random()-0.5) * spread * 0.5;
    p.vx += Math.cos(dir) * power * scale;
    p.vy += Math.sin(dir) * power * scale;
    p.vr += (Math.random()-0.5) * spread * 0.6 * scale;
  });
}

// PC는 가속도계가 없어 위젯을 마우스/터치로 빠르게 움직이는 걸 "흔들기"로 인식하고
// (속도 비례 임펄스), 카드 자체도 살짝 기울고 튕기게 해 "쥐고 흔드는" 느낌을 냄
// (손을 떼면 원래 각도로 복귀). 모바일은 여기에 더해 devicemotion 가속도 변화도
// 감지함. 전체화면 시엔 프레임(#shakerFrame)을 오버레이로 옮기되 물리 상태
// (shakerPieces)는 그대로 유지되고, 프레임 크기에 맞춰 위치만 다시 스케일됨.
let shakerFullOpen = false;
let shakerFullOverlay = null;
// 흔들 때 "기울고 튕기는" 시각 피드백을 줄 대상은 지금 보이는 게 카드인지
// 전체화면 모달인지에 따라 달라짐 — 매번 이 함수로 현재 대상을 다시 찾음
// (전체화면 모달은 열 때마다 새로 만들어지는 DOM이라 고정 참조를 못 씀)
function shakerWobbleTarget(){
  if(shakerFullOpen){
    return document.querySelector('.modal-shaker-full') || document.getElementById('cardShaker');
  }
  return document.getElementById('cardShaker');
}
function closeShakerFullscreen(){
  if(!shakerFullOpen) return;
  shakerFullOpen = false;
  const card = document.getElementById('cardShaker');
  if(card && shakerFrameEl) card.insertBefore(shakerFrameEl, card.firstChild);
  if(shakerFullOverlay) shakerFullOverlay.remove();
  shakerFullOverlay = null;
}
function openShakerFullscreen(){
  if(shakerFullOpen || !shakerFrameEl) return;
  shakerFullOpen = true;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay shaker-full-overlay';
  overlay.innerHTML = `
    <div class="modal modal-shaker-full">
      <button class="lightbox-x shaker-full-close" type="button" aria-label="닫기">✕</button>
      <div class="shaker-full-slot" id="shakerFullSlot"></div>
    </div>`;
  overlay.querySelector('#shakerFullSlot').appendChild(shakerFrameEl);
  overlay.addEventListener('click', e=>{ if(e.target === overlay) closeShakerFullscreen(); });
  overlay.querySelector('.shaker-full-close').onclick = closeShakerFullscreen;
  modalRoot.innerHTML = '';
  modalRoot.appendChild(overlay);
  shakerFullOverlay = overlay;
  // 카드에서 하던 "잡고 흔들기"를 전체화면 모달 박스 전체에도 그대로 붙여줌
  // (안 그러면 전체화면에서는 실제 기기 흔들기(devicemotion)만 먹히고,
  // 화면을 손가락으로 드래그하는 방식의 흔들기는 안 먹힘)
  attachShakerDragHandlers(overlay.querySelector('.modal-shaker-full'), { closeSelector: '.shaker-full-close' });
}

let shakerMotionAsked = false;
function shakerAskMotionPermission(){
  if(shakerMotionAsked) return; shakerMotionAsked = true;
  // iOS 13+는 devicemotion을 쓰려면 사용자 제스처 안에서 명시적으로 권한을
  // 물어봐야 해서, 위젯(또는 전체화면 모달)을 처음 누르는 순간(이미 제스처
  // 중) 같이 요청함
  if(typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function'){
    DeviceMotionEvent.requestPermission().catch(()=>{});
  }
}

// 카드(평소)와 전체화면 모달(모바일에서 탭해 확대했을 때) 양쪽 다 "잡고
// 흔들기"가 똑같이 동작해야 해서, 드래그 감지 로직을 여기 하나로 모아두고
// 두 군데(card, 전체화면 모달 박스)에서 재사용함. opts.tapOpensFullscreen이
// true면(카드 쪽만) 터치로 살짝 탭했을 때 전체화면을 열어줌.
function attachShakerDragHandlers(triggerEl, opts={}){
  if(!triggerEl) return;
  let dragging = false, lastX=0, lastY=0, lastT=0;
  let originX = 0, originY = 0;
  let downX = 0, downY = 0, downT = 0, downPointerType = 'mouse', downOnManage = false;
  const excludeSelector = ['.shaker-manage-btn', '.shaker-bg-btn', opts.closeSelector].filter(Boolean).join(', ');

  triggerEl.addEventListener('pointerdown', e=>{
    downOnManage = excludeSelector ? !!e.target.closest(excludeSelector) : false;
    if(downOnManage) return; // 관리/배경/닫기 버튼 클릭은 흔들기로 안 잡음
    dragging = true; lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
    originX = e.clientX; originY = e.clientY;
    downX = e.clientX; downY = e.clientY; downT = lastT; downPointerType = e.pointerType || 'mouse';
    shakerDragActive = true; shakerDragVX = 0; shakerDragVY = 0;
    const wobbleEl = shakerWobbleTarget();
    if(wobbleEl) wobbleEl.classList.add('shaker-grabbing');
    shakerAskMotionPermission();
    try{ triggerEl.setPointerCapture(e.pointerId); }catch(err){}
  });
  triggerEl.addEventListener('pointermove', e=>{
    if(!dragging) return;
    const t = performance.now();
    const dt = Math.max(8, t - lastT);
    // 예전엔 pointermove가 들어올 때마다 그 자리에서 바로 힘을 쐈는데, 그러면
    // PC(이벤트가 촘촘함)와 모바일 스와이프(이벤트가 듬성듬성 큰 폭으로 들어옴)가
    // 근본적으로 다른 리듬으로 힘을 받게 됨 — 상한을 낮추면 스와이프 쪽 총합이
    // 너무 약해지고, 올리면 스와이프 쪽이 한 방 한 방 튀는(경박한) 느낌이 됨.
    // 그래서 여기서는 힘을 직접 쏘지 않고, "지금 이 정도 속도로 움직이고 있다"는
    // 목표값만 부드럽게(저역통과 필터) 갱신해두고, 실제 힘 주입은 아래
    // stepShakerPhysics가 입력 방식과 무관하게 항상 똑같은 프레임 리듬(매 프레임
    // 조금씩)으로 함 — PC든 스와이프든 "물리 엔진이 힘을 넣는 리듬" 자체가
    // 같아지므로 입력 이벤트 빈도 차이가 더 이상 느낌 차이로 안 이어짐.
    const rawDvx = (e.clientX - lastX) / dt * 16;
    const rawDvy = (e.clientY - lastY) / dt * 16;
    shakerDragVX = shakerDragVX * 0.35 + rawDvx * 0.65;
    shakerDragVY = shakerDragVY * 0.35 + rawDvy * 0.65;
    // 카드(또는 전체화면 모달) 자체를 손 움직임에 맞춰 살짝 기울고 흔들리게
    // (과하지 않게 상한을 둠)
    const wobbleEl = shakerWobbleTarget();
    if(wobbleEl){
      const tiltX = Math.max(-10, Math.min(10, (e.clientY - originY) * 0.12));
      const tiltY = Math.max(-10, Math.min(10, -(e.clientX - originX) * 0.12));
      const shiftX = Math.max(-8, Math.min(8, (e.clientX - originX) * 0.08));
      const shiftY = Math.max(-8, Math.min(8, (e.clientY - originY) * 0.08));
      wobbleEl.style.transform = `translate(${shiftX}px, ${shiftY}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    }
    lastX = e.clientX; lastY = e.clientY; lastT = t;
  });
  const stopDrag = (e)=>{
    const wasDragging = dragging;
    dragging = false;
    shakerDragActive = false; // 손을 떼면 매 프레임 힘 주입을 멈춤(이미 조각에 붙은 속도는 관성으로 자연스럽게 남음)
    const wobbleEl = shakerWobbleTarget();
    if(wobbleEl){
      wobbleEl.classList.remove('shaker-grabbing');
      wobbleEl.style.transform = ''; // 스프링처럼 원래 각도로 되돌아감(CSS transition)
    }
    // 모바일(터치)에서 거의 움직이지 않고(작은 탭) 빠르게 뗐으면 흔들기가 아니라
    // "탭"으로 보고 전체화면으로 열어줌. PC(마우스)는 흔들기 동작과 겹치지 않게
    // 이 기능을 적용하지 않음(요청: 모바일에서만 클릭 시 전체화면). 이미
    // 전체화면인 상태(모달 쪽 핸들러)에서는 다시 열려고 하지 않음.
    if(opts.tapOpensFullscreen && wasDragging && !downOnManage && e && downPointerType === 'touch'){
      const dist = Math.hypot((e.clientX||downX) - downX, (e.clientY||downY) - downY);
      const elapsed = performance.now() - downT;
      if(dist < 12 && elapsed < 400) openShakerFullscreen();
    }
  };
  triggerEl.addEventListener('pointerup', stopDrag);
  triggerEl.addEventListener('pointercancel', stopDrag);
}

function initShakerInteraction(){
  const card = document.getElementById('cardShaker');
  const frame = document.getElementById('shakerFrame');
  if(!card || !frame) return;

  // 사진 자체를 브라우저 기본 동작으로 드래그해서 선택/이동시키려는 걸 막음
  // (pointer-events:none으로 이미 대부분 막히지만, 네이티브 dragstart는 그와
  // 별개로 발생할 수 있어 한 번 더 확실히 막아둠)
  frame.addEventListener('dragstart', e=> e.preventDefault());

  attachShakerDragHandlers(card, { tapOpensFullscreen: true });

  // 예전엔 기준값(14)을 넘기기만 하면 항상 같은 세기(최대 14)로만 튕겨서, 살짝
  // 흔들든 세게 흔들든 화면에서 거의 똑같아 보이는 문제가 있었음. 기준을 낮춰
  // 더 민감하게 반응하고(약하게 흔들어도 감지), 쿨다운도 짧게 둬서 세게 흔들수록
  // 더 자주 감지되게 하고, 임펄스/기울임 세기도 상한을 크게 올려 실제 흔드는
  // 세기 차이가 화면에도 뚜렷하게 비례해서 드러나게 함.
  let motionBaseline = null, lastShakeT = 0, lastAx = 0, lastAy = 0;
  window.addEventListener('devicemotion', e=>{
    const a = e.accelerationIncludingGravity || e.acceleration;
    if(!a) return;
    const ax = a.x||0, ay = a.y||0;
    const mag = Math.hypot(ax, ay, a.z||0);
    const now = performance.now();
    if(motionBaseline === null){ motionBaseline = mag; lastAx = ax; lastAy = ay; return; }
    // 예전엔 "이번 샘플이 바로 직전 샘플보다 얼마나 튀었나(delta)"로 흔들기를
    // 감지했음 — 가만히 있다가 처음 움직이기 시작하는 순간엔 직전(정지) 샘플과의
    // 차이가 크게 튀어서 잘 잡히는데, 일단 흔들리는 중엔 이미 움직이고 있는
    // 상태라 샘플 간 차이가 상대적으로 작아져서 계속 흔들어도 반응이 뚝 끊김
    // (그래서 "부딪히는 순간"만 잡고 "계속 흔드는 중"은 못 보는 것처럼 느껴졌음).
    // 대신 천천히 따라오는 기준선을 하나 두고 "지금이 그 기준선 대비 얼마나
    // 벗어나 있나(편차)"를 봄 — 계속 흔드는 동안엔 원시값이 기준선 위아래로
    // 계속 크게 진동하므로 편차도 계속 커서, 흔드는 내내 짤랑짤랑 반응함
    motionBaseline += (mag - motionBaseline) * 0.06;
    const dev = mag - motionBaseline;
    // → 문턱값을 올리고 힘을 낮췄더니 "확실히 흔든 느낌"이 잘 안 살아서
    // 답답하다는 피드백이 있었음. 감지 빈도/힘 모두 이전 값으로 되돌림.
    if(Math.abs(dev) > 3.5 && now - lastShakeT > 70){
      lastShakeT = now;
      // 실제 가속도 변화 방향을 그대로 써서 진짜 흔든 쪽으로 튀게 하고(약간의
      // 무작위성만 자연스러움을 위해 남김)
      const dirBase = Math.atan2(ay - lastAy, ax - lastAx) || (Math.random()*Math.PI*2);
      const dir = dirBase + (Math.random()-0.5) * 0.5;
      const power = Math.min(11, Math.abs(dev) * 0.8);
      shakerApplyImpulse(Math.cos(dir)*power, Math.sin(dir)*power, power*0.7);
      // 실제로 기기를 흔들 때도 카드(또는 지금 열려 있는 전체화면 모달)가
      // 짧게 흔들리는 걸 보여줌 — 흔든 세기에 비례해서 커짐
      const wobbleEl = shakerWobbleTarget();
      if(wobbleEl){
        wobbleEl.classList.add('shaker-grabbing');
        const shift = Math.min(18, power*0.8);
        const tilt = Math.min(12, power*0.45);
        wobbleEl.style.transform = `translate(${(Math.random()-0.5)*shift}px, ${(Math.random()-0.5)*shift}px) rotate(${(Math.random()-0.5)*tilt}deg)`;
        clearTimeout(wobbleEl._shakeResetT);
        wobbleEl._shakeResetT = setTimeout(()=>{ wobbleEl.classList.remove('shaker-grabbing'); wobbleEl.style.transform = ''; }, 160);
      }
    }
    lastAx = ax; lastAy = ay;
  });
}

function openShakerManageModal(){
  const items = (shakerData.items || []).map(normalizeShakerItem);
  openModal(`
    <h3>쉐이커 이미지 관리</h3>
    <div class="shaker-manage-grid">
      ${items.map((it,i)=>`
        <div class="shaker-manage-item">
          <div class="shaker-manage-thumb" data-idx="${i}"></div>
          <button class="icon-btn shaker-manage-del" data-idx="${i}" title="삭제">✕</button>
        </div>
      `).join('') || '<p class="hint">아직 이미지가 없어요</p>'}
    </div>
    <label>사진 올리기 (여러 장 선택 가능)</label>
    <input type="file" id="shakerFiles" accept="image/*" multiple>
    <p class="hint">자동으로 압축해서 추가돼요.</p>
    <label>또는, 이미지 URL 직접 입력</label>
    <input type="url" id="shakerUrl" placeholder="https://...">
    <div class="modal-actions"><button class="btn ghost" id="c">닫기</button><button class="btn primary" id="s">추가</button></div>
  `, m=>{
    items.forEach((it,i)=>{
      const thumb = m.querySelector(`.shaker-manage-thumb[data-idx="${i}"]`);
      const resolved = resolveGalleryItemUrl(it, (url)=>{ if(thumb) thumb.style.backgroundImage = `url(${url})`; });
      if(resolved && thumb) thumb.style.backgroundImage = `url(${resolved})`;
    });
    m.querySelectorAll('.shaker-manage-del').forEach(btn=>{
      btn.onclick = async ()=>{
        if(!(await confirmDelete('이 이미지를 정말 삭제할까요?'))) return;
        const idx = Number(btn.dataset.idx);
        const arr = [...items];
        deleteGalleryImageIfChunked(arr[idx]);
        arr.splice(idx,1);
        await docRef('shaker').set({ items: arr }, {merge:true});
        openShakerManageModal();
      };
    });
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const files = Array.from(m.querySelector('#shakerFiles').files || []);
      const url = normalizeImageUrl(m.querySelector('#shakerUrl').value.trim());
      const newItems = [];
      if(files.length){
        saveBtn.disabled = true;
        for(let i=0;i<files.length;i++){
          saveBtn.textContent = `처리 중… (${i+1}/${files.length})`;
          try{
            // 쉐이커 조각은 원 안에 꽉 채워 보여주는 작은 참(charm)이라 갤러리 사진과는
            // 필요한 해상도가 전혀 다름 — 전체화면으로 크게 띄워도 프레임이 최대
            // 520×520px로 제한돼 있고(.shaker-full-slot, style.css), 조각 지름 상한은
            // 그 프레임 짧은 변의 22%(shakerPieceRadius)라 실제로는 최대 약 229px
            // (고밀도 화면 3배 감안해도 물리 픽셀 약 690px)로만 보임. 갤러리와 같은
            // 1200px/300KB로 압축하면 실제 필요량의 3배 가까운 픽셀을 그냥 버리는
            // 셈이라, 700px/90KB로 낮춤(같은 화질 밀도를 유지하도록 갤러리와 같은
            // 바이트/픽셀 비율로 환산한 값 — 화질 저하 없이 용량만 줄어듦).
            const compressed = await compressImageFile(files[i], 700, 90000);
            newItems.push(await storeGalleryImage(compressed));
          }catch(err){ toast(`"${files[i].name}" 처리 실패: ${err.message || err}`); }
          await new Promise(r=> setTimeout(r, 0));
        }
      } else if(url){
        newItems.push({ url });
      } else {
        toast('사진을 선택하거나 URL을 입력해주세요');
        return;
      }
      try{
        await docRef('shaker').set({ items: [...items, ...newItems] }, {merge:true});
      }catch(err){
        toast(`저장하지 못했어요: ${err.message || err}`);
        saveBtn.disabled = false; saveBtn.textContent = '추가';
        return;
      }
      closeModal();
    };
  });
}

// 프레임 배경 편집 버튼은 정적 HTML에 없을 수도 있어서(예전 버전) 여기서
// 없으면 만들어 프레임 안(좌상단, 관리 버튼과 반대쪽)에 넣어둠. 이미 있으면
// 다시 안 만듦.
function ensureShakerBgBtn(){
  if(document.getElementById('shakerBgBtn')) return;
  const frame = document.getElementById('shakerFrame');
  if(!frame) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'shakerBgBtn';
  btn.className = 'icon-btn shaker-bg-btn';
  btn.title = '프레임 배경';
  btn.textContent = '🖼';
  btn.style.display = editMode ? 'inline-flex' : 'none';
  frame.appendChild(btn);
  btn.onclick = openShakerBgModal;
}

// 쉐이커 프레임 자체는 기본적으로 완전 투명(카드의 유리 배경이 그대로 비쳐
// 보임). 편집모드에서 frameBg를 따로 지정하면 그 사진이 프레임 배경으로
// 깔림(사이트 전체 배경과 별개, 이 위젯 하나에만 적용).
function applyShakerFrameBg(){
  const frame = document.getElementById('shakerFrame');
  if(!frame) return;
  if(shakerData.frameBg){
    setElementBgImageWithFallback(frame, shakerData.frameBg);
    frame.classList.add('has-bg');
  } else {
    frame.style.backgroundImage = '';
    frame.classList.remove('has-bg');
  }
}

async function openShakerBgModal(){
  const cur = shakerData || {};
  const curIsUrl = cur.frameBg && !cur.frameBg.startsWith('data:');
  openModal(`
    <h3>쉐이커 프레임 배경</h3>
    <p class="hint">비워두면 투명한 유리로 보여요.</p>
    <label>배경 사진 올리기</label>
    <input type="file" id="shakerBgFile" accept="image/*">
    <label>또는, 이미지 URL 직접 입력</label>
    <input type="url" id="shakerBgUrl" placeholder="https://..." value="${curIsUrl ? cur.frameBg : ''}">
    <div class="modal-actions">
      <button class="btn danger" id="rm" type="button">배경 없애기</button>
      <button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">저장</button>
    </div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#rm').onclick = async ()=>{
      await docRef('shaker').set({ frameBg: '' }, {merge:true});
      closeModal();
      toast('프레임 배경을 없앴어요');
    };
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const file = m.querySelector('#shakerBgFile').files[0];
      let image = normalizeImageUrl(m.querySelector('#shakerBgUrl').value.trim());
      if(file){
        saveBtn.disabled = true; saveBtn.textContent = '처리 중…';
        try{
          image = await compressImageFile(file, 1200, 500000);
        }catch(err){
          toast(err.message || '이미지를 처리하지 못했어요');
          saveBtn.disabled = false; saveBtn.textContent = '저장';
          return;
        }
      } else if(!image){
        image = cur.frameBg || '';
      }
      await docRef('shaker').set({ frameBg: image }, {merge:true});
      closeModal();
      toast('프레임 배경을 저장했어요');
    };
  });
}

function initShakerWidget(){
  initShakerInteraction();
  requestAnimationFrame(stepShakerPhysics);
  const manageBtn = document.getElementById('shakerManageBtn');
  if(manageBtn) manageBtn.onclick = openShakerManageModal;
  ensureShakerBgBtn();
}

docRef('shaker').onSnapshot(doc=>{
  shakerData = doc.exists ? doc.data() : {items:[]};
  syncShakerPieces();
  applyShakerFrameBg();
});

docRef('speechWidget').onSnapshot(doc=>{
  // 편집기가 열려있는 동안은 여기서 손대지 않음 — 편집기가 붙잡고 있는 탭 객체를
  // 여기서 새 객체로 통째로 갈아끼우면, 그 이후 편집기 안에서 그리거나 입력한 내용이
  // (이미 끊어진 옛 객체에 적히는 셈이라) 실제로는 저장이 하나도 안 되는 문제가 있었음.
  // 편집기는 어차피 이 데이터를 직접 들고 있다가 스스로 저장하므로, 열려있는 동안은
  // 건너뛰어도 안전함 — 편집기를 닫으면 그 다음 갱신부터 정상 반영됨.
  if(modalRoot.querySelector('#seTabbar')) return;
  const d = doc.exists ? doc.data() : {};
  speechWidgetData = { tabs: (d.tabs || []).map(normalizeSpeechTab), cover: normalizeSpeechCover(d.cover) };
  renderSpeechCard();
});

docRef('stickers').onSnapshot(doc=>{ stickerPosData = doc.exists ? doc.data() : { positions:{} }; renderStickers(); });

/* ---------------- 초기화 ---------------- */

refreshLockUI();
initRow2HeightSync();
initRowStripHeightSync();
initBoardTabs();
initShakerWidget();

// 방문자가 갤러리 탭을 안 눌러도, 위젯 탭이 먼저 자리잡고 나면 브라우저가 한가한 틈에
// 백그라운드로 갤러리 탭 데이터를 미리 준비해둠 — 그래야 나중에 실제로 탭을 눌렀을 때
// 빈 화면에서 뜨는 대신 바로 채워져 있고, 방문자가 계속 켜둔 화면에도 실시간 변경이 반영됨
if('requestIdleCallback' in window) requestIdleCallback(startTab2Widgets, { timeout: 4000 });
else setTimeout(startTab2Widgets, 2500);

// 화면 폭이 바뀌면(반응형 구간 전환 등) 말풍선 폭도 달라질 수 있어서 다시 오려냄
window.addEventListener('resize', debounce(()=>{
  document.querySelectorAll('.profile-compact-oneliner').forEach(el=>{
    shapeSpeechBubble(el, { radius:12, tailLeft:14, tailWidth:14, tailHeight:7 });
  });
  document.querySelectorAll('.speech-bubble.show').forEach(el=>{
    shapeSpeechBubble(el, { radius:16, tailLeft:(w)=> (w-16)/2, tailWidth:16, tailHeight:8 });
  });
  Object.values(stickerEls).forEach(s=>{
    shapeSpeechBubble(s.bubbleEl, { radius:16, tailLeft:(w)=> (w-16)/2, tailWidth:16, tailHeight:8 });
  });
}, 150));
