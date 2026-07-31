/* =========================================================
   노은 — app.js
   정해진 영역(이미지 슬라이드 · 음악 · 디데이 · 방명록 · 캘린더 · 갤러리 ·
   문서 정리 · 세션카드 · 체크보드)이 항상 같은 구성으로 보이도록
   각각 고정 렌더 함수로 관리함. 위젯 제목은 전부 없음(애플 위젯 스타일),
   사이트 이름/잠금/테마 버튼은 배너 하단에 통합되어 있음.
   ========================================================= */

let editMode = sessionStorage.getItem('gh_edit') === '1';

const lockBtn = document.getElementById('lockBtn');
const lockBadge = document.getElementById('lockBadge');
const siteNameEl = document.getElementById('siteName');
const modalRoot = document.getElementById('modalRoot');
const siteBannerEl = document.getElementById('siteBanner');
const bgImageLayerEl = document.getElementById('bgImageLayer');
const bannerEditBtn = document.getElementById('bannerEditBtn');
const bgEditBtn = document.getElementById('bgEditBtn');
const globalStyleBtn = document.getElementById('globalStyleBtn');

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

async function sha256(str){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function openModal(innerHtml, onMount, extraClass){
  const overlay = document.createElement('div');
  // 라이트박스는 화면 전체(특히 큰 PC 모니터)를 매 프레임 블러 처리해야 해서 무거우므로,
  // 뒤쪽 전체화면 오버레이의 블러만 빼고 어둡게 깔리는 효과만 남김.
  // 라이트박스 박스 자체(사진 주변 유리 느낌)의 블러는 .modal.modal-lightbox에서 그대로 유지됨
  overlay.className = 'modal-overlay' + (extraClass === 'modal-lightbox' ? ' modal-overlay-plain' : '');
  overlay.innerHTML = `<div class="modal${extraClass ? ' ' + extraClass : ''}">${innerHtml}</div>`;
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) closeModal(); });
  modalRoot.innerHTML = '';
  modalRoot.appendChild(overlay);
  if(onMount) onMount(overlay.querySelector('.modal'));
}
function closeModal(){ modalRoot.innerHTML = ''; }

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function uid(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function debounce(fn, wait){
  let t;
  return (...args)=>{ clearTimeout(t); t = setTimeout(()=> fn(...args), wait); };
}

/* ---------------- 메인 갤러리 매스너리(핀터레스트형) 실제 배치 ----------------
   예전엔 CSS column-count로 다단을 흉내냈는데, 그 방식은 브라우저가 "전체 높이를
   균형있게" 나눠서 채우기 때문에 배열 앞쪽(=최신, storeGalleryImage에서 항상 맨 앞에
   추가함)에 있는 사진이 두 번째/세 번째 열 중간쯤에 놓일 수 있어서 "최신 사진일수록
   위"가 보장되지 않았음. 그래서 진짜 핀터레스트처럼, 사진을 배열 순서대로 보면서
   "그 시점에 가장 짧은 열"에 하나씩 쌓음 — 이렇게 하면 앞쪽(최신) 사진들이 자연스럽게
   위쪽 여러 열에 먼저 채워지고, 뒤쪽(오래된) 사진일수록 아래로 내려가게 됨. */
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
  const colHeights = new Array(cols).fill(0);
  tiles.forEach(tile=>{
    tile.style.width = colW + 'px';
    let target = 0;
    for(let c = 1; c < cols; c++){ if(colHeights[c] < colHeights[target]) target = c; }
    const x = target * (colW + PIN_MASONRY_GAP);
    const y = colHeights[target];
    tile.style.transform = `translate(${x}px, ${y}px)`;
    colHeights[target] = y + tile.getBoundingClientRect().height + PIN_MASONRY_GAP;
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
    <p class="hint">여기서 만든 옵션은 추가할 때 고를 수 있고, 옵션별로 필터링해서 모아볼 수 있어요.</p>
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
          row.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          try{ e.dataTransfer.setData('text/plain', String(dragIdx)); }catch(_){}
        });
        row.addEventListener('dragend', ()=>{
          row.classList.remove('dragging');
          listEl.querySelectorAll('.drag-over').forEach(x=> x.classList.remove('drag-over'));
          dragIdx = null;
        });
        row.addEventListener('dragover', e=>{
          if(dragIdx === null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          listEl.querySelectorAll('.drag-over').forEach(x=>{ if(x!==row) x.classList.remove('drag-over'); });
          row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', ()=> row.classList.remove('drag-over'));
        row.addEventListener('drop', e=>{
          e.preventDefault();
          row.classList.remove('drag-over');
          const targetIdx = Number(row.dataset.idx);
          const srcIdx = dragIdx;
          dragIdx = null;
          if(srcIdx === null || srcIdx === targetIdx) return;
          syncFromInputs();
          const [moved] = workingOptions.splice(srcIdx, 1);
          workingOptions.splice(targetIdx, 0, moved);
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
  if(!options || !options.length) return `<p class="hint">등록된 옵션이 없어요. 먼저 "⚙ 옵션 관리"에서 옵션을 추가해주세요.</p>`;
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
    <p class="hint">여러 개를 한꺼번에 고를 수 있어요.</p>
    <div id="itemOptBox">${renderOptionCheckboxes(optionsList, currentOpts)}</div>
    <p class="hint">옵션 목록 자체를 늘리거나 고치려면 위젯의 "⚙ 옵션 관리"를 이용해주세요.</p>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">저장</button></div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      await onSave(getCheckedOptionValues(m.querySelector('#itemOptBox')));
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
/* 라이트박스 뒤 전체화면 오버레이는 블러를 빼서 가볍게 하되(모달 자체 블러는 유지),
   대신 사진(모달 박스)에 가려서 안 보이는 부분만 블러를 빼는 게 아니라 —
   실제로 블러 연산 비용을 줄이려면 블러가 걸린 요소 자체의 실제 면적이 작아야 함(가려도 계산 비용은 그대로 듦).
   그래서 모달 박스 "바깥" 여백 부분에만 실제 크기가 작은 블러 조각 4개(위/아래/좌/우)를 깔아,
   화면 전체를 블러 처리했을 때와 비슷하게 보이면서도 실제 블러 면적은 훨씬 줄임 */
function updateLightboxBlurFrame(modalEl){
  const overlay = modalEl && modalEl.parentElement;
  if(!overlay) return;
  let frame = overlay.querySelector('.lightbox-blur-frame');
  if(!frame){
    frame = document.createElement('div');
    frame.className = 'lightbox-blur-frame';
    frame.innerHTML = `
      <div class="lightbox-blur-strip lbf-top"></div>
      <div class="lightbox-blur-strip lbf-bottom"></div>
      <div class="lightbox-blur-strip lbf-left"></div>
      <div class="lightbox-blur-strip lbf-right"></div>
    `;
    overlay.insertBefore(frame, modalEl);
  }
  const rect = modalEl.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const top = Math.max(0, rect.top), bottom = Math.max(0, vh - rect.bottom);
  const left = Math.max(0, rect.left), right = Math.max(0, vw - rect.right);
  frame.querySelector('.lbf-top').style.cssText = `top:0; left:0; width:100%; height:${top}px;`;
  frame.querySelector('.lbf-bottom').style.cssText = `bottom:0; left:0; width:100%; height:${bottom}px;`;
  frame.querySelector('.lbf-left').style.cssText = `top:${rect.top}px; left:0; width:${left}px; height:${rect.height}px;`;
  frame.querySelector('.lbf-right').style.cssText = `top:${rect.top}px; right:0; width:${right}px; height:${rect.height}px;`;
}

function openImageLightbox(cfg){
  const items = cfg.items.slice();
  let index = cfg.index || 0;
  let opened = false; // 첫 렌더는 항상 진행하고, 그 다음부터는 모달이 실제로 열려있을 때만 다시 그림

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
    const metaInfo = cfg.meta ? cfg.meta(item) : null;
    const tagInfo = cfg.tag ? cfg.tag(item) : null;
    const showNav = items.length > 1;
    openModal(`
      <div class="lightbox-body">
        <div class="lightbox-imgwrap" id="lbImgWrap">
          ${url ? `<img src="${escapeHtml(url)}" class="lightbox-img">` : `<div class="lightbox-loading">불러오는 중…</div>`}
          ${showNav ? `<div class="lightbox-zone prev" id="lbPrev" title="이전 사진"><span class="lightbox-zone-arrow">‹</span></div><div class="lightbox-zone next" id="lbNext" title="다음 사진"><span class="lightbox-zone-arrow">›</span></div>` : ''}
        </div>
        ${showNav ? `<div class="lightbox-count">${index+1} / ${items.length}</div>` : ''}
      </div>
      ${metaInfo && (metaInfo.title || metaInfo.desc) ? `
        <div class="lightbox-meta">
          ${metaInfo.title ? `<div class="lightbox-meta-title">${escapeHtml(metaInfo.title)}</div>` : ''}
          ${metaInfo.desc ? `<div class="lightbox-meta-desc">${escapeHtml(metaInfo.desc)}</div>` : ''}
        </div>` : ''}
      ${cfg.tag ? `<div class="lightbox-tag">${tagInfo && tagInfo.length ? tagInfo.map(t=> `<span class="lightbox-tag-chip">${escapeHtml(t)}</span>`).join('') : `<span class="lightbox-tag-chip empty">태그 없음</span>`}</div>` : ''}
      <div class="modal-actions">
        ${cfg.onEditMeta ? `<button class="btn ghost" id="editMeta">${metaInfo && (metaInfo.title || metaInfo.desc) ? '정보 수정' : '정보 추가'}</button>` : ''}
        ${cfg.onEditTag ? `<button class="btn ghost" id="editTag">태그 수정</button>` : ''}
        ${cfg.onDelete ? `<button class="btn danger" id="del">삭제</button>` : ''}
        <button class="btn ghost" id="c">닫기</button>
      </div>
    `, m=>{
      m.querySelector('#c').onclick = closeModal;
      if(url) attachImgFallback(m.querySelector('img'));
      if(cfg.onDelete) m.querySelector('#del').onclick = async ()=>{
        await cfg.onDelete(index);
        items.splice(index,1);
        render();
      };
      if(cfg.onEditMeta) m.querySelector('#editMeta').onclick = ()=> cfg.onEditMeta(index);
      if(cfg.onEditTag) m.querySelector('#editTag').onclick = ()=> cfg.onEditTag(index);
      const prevZone = m.querySelector('#lbPrev');
      const nextZone = m.querySelector('#lbNext');
      if(prevZone) prevZone.onclick = ()=>{ index = (index - 1 + items.length) % items.length; render(); };
      if(nextZone) nextZone.onclick = ()=>{ index = (index + 1) % items.length; render(); };

      // 모바일 스와이프: 이미지 영역을 좌우로 밀면 이전/다음 사진으로 이동
      const imgWrap = m.querySelector('#lbImgWrap');
      if(imgWrap && items.length > 1){
        let touchStartX = 0, touchStartY = 0, touchTracking = false;
        imgWrap.addEventListener('touchstart', e=>{
          if(e.touches.length !== 1) return;
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          touchTracking = true;
        }, { passive:true });
        imgWrap.addEventListener('touchend', e=>{
          if(!touchTracking) return;
          touchTracking = false;
          const touch = e.changedTouches[0];
          const dx = touch.clientX - touchStartX;
          const dy = touch.clientY - touchStartY;
          // 가로로 충분히(40px 이상) 움직였고, 세로 움직임보다 뚜렷하게 가로 움직임이 클 때만 스와이프로 인식
          if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5){
            e.preventDefault(); // 스와이프 뒤에 이어지는 합성 클릭이 새로 그려진 화면을 또 눌러버리는 것 방지
            index = dx > 0 ? (index - 1 + items.length) % items.length : (index + 1) % items.length;
            render();
          }
        });
      }
      updateLightboxBlurFrame(m);
    }, 'modal-lightbox');
    opened = true;
  }

  const onKey = (e)=>{
    if(!modalRoot.querySelector('.modal-lightbox')) return;
    if(e.key === 'ArrowLeft' && items.length > 1){ index = (index - 1 + items.length) % items.length; render(); }
    else if(e.key === 'ArrowRight' && items.length > 1){ index = (index + 1) % items.length; render(); }
    else if(e.key === 'Escape'){ closeModal(); }
  };
  document.addEventListener('keydown', onKey);
  // 창 크기가 바뀌면(가로/세로 회전 포함) 모달 박스 크기도 바뀌므로 블러 프레임도 다시 맞춰줌
  const onResize = ()=>{
    const modalEl = modalRoot.querySelector('.modal-lightbox');
    if(modalEl) updateLightboxBlurFrame(modalEl);
  };
  window.addEventListener('resize', onResize);
  const mo = new MutationObserver(()=>{
    if(!modalRoot.querySelector('.modal-lightbox')){
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      mo.disconnect();
    }
  });
  mo.observe(modalRoot, { childList:true });

  render();
}

/* 갤러리 사진 타일을 드래그로 끌어서 순서 바꾸기 (편집모드에서만 동작) */
function bindPinDragReorder(container, tileSelector, getItems, saveItems){
  if(!editMode) return;
  let dragIdx = null;
  container.querySelectorAll(tileSelector).forEach(el=>{
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', e=>{
      if(e.target.closest('button')){ e.preventDefault(); return; }
      dragIdx = Number(el.dataset.idx);
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try{ e.dataTransfer.setData('text/plain', String(dragIdx)); }catch(_){}
    });
    el.addEventListener('dragend', ()=>{
      el.classList.remove('dragging');
      container.querySelectorAll('.drag-over').forEach(x=> x.classList.remove('drag-over'));
      dragIdx = null;
    });
    el.addEventListener('dragover', e=>{
      if(dragIdx === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.querySelectorAll('.drag-over').forEach(x=>{ if(x!==el) x.classList.remove('drag-over'); });
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', ()=> el.classList.remove('drag-over'));
    el.addEventListener('drop', async e=>{
      e.preventDefault();
      el.classList.remove('drag-over');
      const targetIdx = Number(el.dataset.idx);
      const srcIdx = dragIdx;
      dragIdx = null;
      if(srcIdx === null || srcIdx === targetIdx) return;
      const arr = getItems();
      const [moved] = arr.splice(srcIdx, 1);
      arr.splice(targetIdx, 0, moved);
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
  /* 사진이 여러 장(멀티컬럼 매스너리)일 땐 사진들이 로드되며 컬럼 균형이
     다시 잡히느라 목록 크기가 여러 번 바뀔 수 있어서, 위 방법들만으로는
     타이밍을 놓치는 경우가 있었음. 그래서 목록 크기 자체가 바뀔 때마다
     감지해서(ResizeObserver) 그때마다 다시 스크롤을 맞춰주고, 두 번 연속
     크기가 안 바뀌면(=레이아웃이 안정됐다고 보고) 감시를 멈춤 */
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
  const src = imgEl.getAttribute('src') || '';
  const m = src.match(/^(https:\/\/i\.imgur\.com\/[a-zA-Z0-9]+)\.[a-zA-Z]+$/i);
  if(!m) return;
  const exts = ['jpg','jpeg','png','gif','webp'];
  let tries = 0;
  imgEl.addEventListener('error', function handler(){
    tries++;
    if(tries < exts.length){ imgEl.src = `${m[1]}.${exts[tries]}`; }
    else{ imgEl.removeEventListener('error', handler); }
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

function extractYouTubeId(url){
  if(!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
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
    const reader = new FileReader();
    reader.onload = ()=>{
      const img = new Image();
      img.onload = ()=>{
        let { width, height } = img;
        if(width > height && width > maxDim){ height = Math.round(height * (maxDim/width)); width = maxDim; }
        else if(height >= width && height > maxDim){ width = Math.round(width * (maxDim/height)); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        let quality = 0.85;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while(dataUrl.length > maxBytes * 1.37 && quality > 0.25){
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
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
            canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
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
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
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
  siteNameEl.setAttribute('contenteditable', editMode ? 'true' : 'false');
  bannerEditBtn.style.display = editMode ? 'inline-flex' : 'none';
  bgEditBtn.style.display = editMode ? 'inline-flex' : 'none';
  globalStyleBtn.style.display = editMode ? 'inline-flex' : 'none';
  document.getElementById('checklistAddWrap').style.display = editMode ? 'flex' : 'none';
  lockBadge.textContent = editMode ? '🔓 편집 가능' : '🔒 보기 전용';
  lockBadge.classList.toggle('unlocked', editMode);
  lockBtn.textContent = editMode ? '잠그기' : '잠금 해제';
}

function renderAllModules(){
  renderImages(); renderProfile(); renderMusic(); renderDday(); renderGuestbook();
  renderCalendar(); renderGallery(); renderGallery2(); renderRefGallery(); renderVideos(); renderDocs(); renderSessions(); renderChecklist();
}

lockBtn.addEventListener('click', async ()=>{
  if(editMode){
    editMode = false;
    sessionStorage.removeItem('gh_edit');
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
        await db.collection('meta').doc('lock').set({ passwordHash: hash });
        editMode = true;
        sessionStorage.setItem('gh_edit','1');
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
        editMode = true;
        sessionStorage.setItem('gh_edit','1');
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

siteNameEl.addEventListener('blur', ()=>{
  if(!editMode) return;
  db.collection('meta').doc('site').set({ name: siteNameEl.textContent.trim() || '노은' }, {merge:true});
});
db.collection('meta').doc('site').onSnapshot(doc=>{
  if(doc.exists && doc.data().name && document.activeElement !== siteNameEl){ siteNameEl.textContent = doc.data().name; }
});

/* ---------------- 배너 (항상 최상단 고정) ---------------- */

bannerEditBtn.addEventListener('click', async ()=>{
  const doc = await db.collection('meta').doc('banner').get();
  const cur = doc.exists ? doc.data() : {};
  const curIsUrl = cur.image && !cur.image.startsWith('data:');
  openModal(`
    <h3>배너 편집</h3>
    <label>배너 사진 올리기 (기기에서 바로 선택)</label>
    <input type="file" id="bImgFile" accept="image/*">
    <p class="hint">기기의 사진을 바로 선택하면 화면에 맞게 자동으로 압축해서 저장해요. 별도 사이트에 올릴 필요 없어요.</p>
    <label>또는, 이미지 URL 직접 입력</label>
    <input type="url" id="bImg" placeholder="https://..." value="${curIsUrl ? cur.image : ''}">
    <p class="hint">imgbb.com, postimages.org 등에 올린 "직접 링크" 주소를 붙여넣어도 돼요. 위에서 사진을 선택하면 이 URL 입력은 무시돼요.</p>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">저장</button></div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const file = m.querySelector('#bImgFile').files[0];
      let image = normalizeImageUrl(m.querySelector('#bImg').value.trim());
      if(file){
        saveBtn.disabled = true;
        saveBtn.textContent = '사진 처리 중…';
        try{
          image = await compressImageFile(file);
        }catch(err){
          toast(err.message || '이미지를 처리하지 못했어요');
          saveBtn.disabled = false;
          saveBtn.textContent = '저장';
          return;
        }
      } else if(!image){
        image = cur.image || '';
      }
      await db.collection('meta').doc('banner').set({ image }, {merge:true});
      closeModal();
      toast('배너를 저장했어요');
    };
  });
});

db.collection('meta').doc('banner').onSnapshot(doc=>{
  if(!doc.exists) return;
  const d = doc.data();
  if(d.image) setElementBgImageWithFallback(siteBannerEl, d.image);
});

/* ---------------- 홈페이지 전체 배경 이미지 (배너와 별개) ---------------- */

bgEditBtn.addEventListener('click', async ()=>{
  const doc = await db.collection('meta').doc('background').get();
  const cur = doc.exists ? doc.data() : {};
  const curIsUrl = cur.image && !cur.image.startsWith('data:');
  openModal(`
    <h3>홈페이지 배경 이미지</h3>
    <p class="hint">배너와는 별개로, 사이트 전체 뒤에 깔리는 배경이에요. 위젯들이 반투명 유리 카드라 배경이 은은하게 비쳐 보여요.</p>
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
      await db.collection('meta').doc('background').set({ image:'' }, {merge:true});
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
      await db.collection('meta').doc('background').set({ image }, {merge:true});
      closeModal();
      toast('배경 이미지를 저장했어요');
    };
  });
});

db.collection('meta').doc('background').onSnapshot(doc=>{
  const d = doc.exists ? doc.data() : {};
  if(d.image){
    setElementBgImageWithFallback(bgImageLayerEl, d.image);
    bgImageLayerEl.classList.add('has-image');
  } else {
    bgImageLayerEl.style.backgroundImage = '';
    bgImageLayerEl.classList.remove('has-image');
  }
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

function applyTheme(theme){
  if(!theme) return;
  THEME_VARS.forEach(v=>{
    const key = v.replace('--','');
    if(theme[key]) document.documentElement.style.setProperty(v, theme[key]);
  });
  if(theme.customFontData){
    injectCustomFontFace(`url(${theme.customFontData}) format('truetype')`);
    document.documentElement.style.setProperty('--font-display', `'CustomUserFont', 'ZEN SERIF', serif`);
    document.documentElement.style.setProperty('--font-body', `'CustomUserFont', 'ZEN SERIF', serif`);
  } else if(theme.customFontFile){
    injectCustomFontFace(`url('./fonts/${theme.customFontFile}') format('truetype')`);
    document.documentElement.style.setProperty('--font-display', `'CustomUserFont', 'ZEN SERIF', serif`);
    document.documentElement.style.setProperty('--font-body', `'CustomUserFont', 'ZEN SERIF', serif`);
  } else {
    injectCustomFontFace(null);
    if(theme.fontDisplay) document.documentElement.style.setProperty('--font-display', `'${theme.fontDisplay}', 'Noto Serif KR', serif`);
    if(theme.fontBody) document.documentElement.style.setProperty('--font-body', `'${theme.fontBody}', serif`);
  }
}

db.collection('meta').doc('theme').onSnapshot(doc=>{
  if(doc.exists) applyTheme(doc.data());
});

globalStyleBtn.addEventListener('click', async ()=>{
  if(!editMode){ toast('잠금 해제 후 편집모드에서 변경할 수 있어요'); return; }
  const cs = getComputedStyle(document.documentElement);
  const cur = {};
  THEME_VARS.forEach(v=> cur[v.replace('--','')] = cs.getPropertyValue(v).trim());
  const themeDoc = await db.collection('meta').doc('theme').get();
  const saved = themeDoc.exists ? themeDoc.data() : {};
  const cardBgParsed = parseColorToHexAlpha(cur['card-bg']);
  const cardBgAlphaPct = Math.round(cardBgParsed.alpha*100);
  openModal(`
    <h3>테마 편집</h3>
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
      <input type="range" id="tCardBgAlpha" min="5" max="90" value="${cardBgAlphaPct}" style="flex:1;">
      <span id="tCardBgAlphaLabel" style="font-size:.78rem;color:var(--ink-soft);min-width:34px;">${cardBgAlphaPct}%</span>
    </div>
    <p class="hint">투명도를 낮출수록(왼쪽) 배경이 카드 뒤로 더 비쳐서 유리 느낌이 강해져요.</p>
    <label>글자색</label>
    <div class="color-row"><input type="color" id="tInk" value="${cur.ink}"></div>
    <label>제목 폰트</label>
    <select id="tFontDisplay">${FONT_DISPLAY_OPTIONS.map(f=>`<option value="${f}" ${saved.fontDisplay===f?'selected':''}>${f}</option>`).join('')}</select>
    <label>본문 폰트</label>
    <select id="tFontBody">${FONT_BODY_OPTIONS.map(f=>`<option value="${f}" ${saved.fontBody===f?'selected':''}>${f}</option>`).join('')}</select>

    <label style="margin-top:16px;">커스텀 폰트 파일로 전체 글자체 통일 (선택)</label>
    <input type="file" id="tFontUpload" accept=".ttf,.otf,font/ttf,font/otf">
    <p class="hint">폰트 파일을 올리면 위에서 고른 제목/본문 폰트 대신, 사이트 전체 글자체가 이 폰트 하나로 통일돼요. 500KB 이하 파일만 여기서 바로 올릴 수 있어요.</p>
    <label>또는, GitHub의 fonts 폴더에 직접 올린 폰트 파일명</label>
    <input type="text" id="tFontFileName" placeholder="예: ZenSerif.ttf" value="${escapeHtml(saved.customFontFile||'')}">
    <p class="hint">500KB보다 큰 폰트는 저장소의 fonts 폴더에 파일을 올린 뒤, 정확한 파일 이름만 여기에 입력해주세요.</p>
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
      await db.collection('meta').doc('theme').set({ customFontData:'', customFontFile:'' }, {merge:true});
      closeModal();
      toast('커스텀 폰트를 해제했어요');
    };
    m.querySelector('#tReset').onclick = async ()=>{
      try{
        await db.collection('meta').doc('theme').delete();
      }catch(err){ console.error(err); }
      THEME_VARS.forEach(v=> document.documentElement.style.removeProperty(v));
      document.documentElement.style.removeProperty('--font-display');
      document.documentElement.style.removeProperty('--font-body');
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
      await db.collection('meta').doc('theme').set(theme, {merge:true});
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
      <div class="slide-empty">아직 사진이 없어요</div>
      ${editMode ? `<button class="btn small slide-add" id="imgAddBtn">+ 사진 추가</button>` : ''}
    `;
  } else {
    if(imgSlideIndex >= items.length) imgSlideIndex = 0;
    const cur = items[imgSlideIndex];
    const resolvedUrl = resolveGalleryItemUrl(cur, ()=> renderImages()) || '';
    box.innerHTML = `
      <div class="slide-viewport" id="slideViewport">
        <img src="${resolvedUrl}" id="slideImg" title="눌러서 크게 보기">
        ${['tl','tr','bl','br'].map(pos=> cur.captions[pos] ? `<div class="slide-caption cap-${pos}">${escapeHtml(cur.captions[pos]).replace(/\n/g,'<br>')}</div>` : '').join('')}
        ${editMode ? `<button class="icon-btn slide-caption-btn" id="imgCaptionBtn" title="문구 편집">Aa</button>` : ''}
        ${editMode ? `<button class="icon-btn slide-del" id="imgDelBtn" title="이 사진 삭제">✕</button>` : ''}
        ${items.length>1 ? `<button class="slide-nav prev" id="imgPrev">‹</button><button class="slide-nav next" id="imgNext">›</button>` : ''}
      </div>
      ${items.length>1 ? `<div class="slide-dots">${items.map((_,i)=>`<span class="dot ${i===imgSlideIndex?'active':''}" data-dot="${i}"></span>`).join('')}</div>` : ''}
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
        onDelete: editMode ? async (idx)=>{
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
    <p class="hint">사진 네 모서리에 각각 문구를 넣을 수 있어요. 비워두면 그 자리엔 문구가 안 보여요.</p>
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
    <p class="hint">화면에 맞게 자동으로 압축해서 슬라이드에 바로 추가돼요. 별도 사이트에 올릴 필요 없어요.</p>
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
  return { label: s.label || '', kind, defaultSectionIndex, people, sections };
}
function cloneSlides(slides){
  return slides.map(s=> ({
    label: s.label,
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

function renderProfile(){
  const box = document.getElementById('cardProfile');
  const slides = (profileData.slides || []).map(normalizeProfileSlide);

  if(slides.length === 0){
    box.innerHTML = `
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

  // 보기 전용(방문자) 모드에선 아직 값을 안 채운 항목(템플릿만 깔려있고 내용이 빈 항목)이
  // 그대로 보이면 빈 줄처럼 보여서 어색함 → 내용/기타설명/링크 중 하나도 없는 항목은 숨김.
  // 편집 모드에선 어떤 항목을 채울 수 있는지 알 수 있게 그대로 다 보여줌.
  // 나이·생년월일·키/몸무게·BWH·성격은 값 자체만 봐도 뭔지 알 수 있어서(예: "142cm · 32kg"),
  // 항목명을 따로 안 붙이고 값만 보여줌. 기타 설명은 목록 속 한 줄이 아니라 따로 떨어진
  // 박스로 보여줘서 다른 항목들과 헷갈리지 않게 함.
  const NO_LABEL_FIELDS = ['나이', '생년월일', '키/몸무게', 'BWH', '성격'];
  const fieldsHtml = (fields)=>{
    const textFields = fields.filter(f=> f.type !== 'link');
    const linkFields = fields.filter(f=> f.type === 'link');
    const descField = textFields.find(f=> (f.label||'').trim() === '기타 설명');
    const listFields = textFields.filter(f=> f !== descField);
    const visibleText = editMode ? listFields : listFields.filter(f=> f.value);
    const visibleLinks = editMode ? linkFields : linkFields.filter(f=> f.link);
    const showDescBox = editMode || (descField && descField.value);
    if(!visibleText.length && !visibleLinks.length && !showDescBox){
      return editMode ? `<div class="profile-slide-desc empty-hint">+ 정보 추가 (키/몸무게·성격 등)</div>` : '';
    }
    // 나이·생년월일, 키/몸무게·BWH는 각각 세로 구분선 하나로 나눠서 같은 줄에 보여줌
    // (둘 다 값이 있을 때만 한 줄로 묶고, 하나만 있으면 그 하나만 그대로 보여줌) —
    // 위젯이 위아래로 너무 길어진다는 요청에 따라 높이를 줄이기 위함.
    const pairFieldHtml = f=> `<span class="pf-value">${formatProfileFieldValue(f.label, f.value)}</span>`;
    const pairRowHtml = (a, b)=>{
      if(a && b) return `<div class="profile-field profile-field-plain profile-field-pair">${pairFieldHtml(a)}<span class="pf-pair-divider"></span>${pairFieldHtml(b)}</div>`;
      const only = a || b;
      return only ? `<div class="profile-field profile-field-plain">${pairFieldHtml(only)}</div>` : '';
    };
    const remaining = visibleText.slice();
    const takeByLabel = (lbl)=>{
      const idx = remaining.findIndex(f=> (f.label||'').trim() === lbl);
      return idx === -1 ? null : remaining.splice(idx, 1)[0];
    };
    const ageField = takeByLabel('나이');
    const bdayField = takeByLabel('생년월일');
    const bodyField = takeByLabel('키/몸무게');
    const bwhField = takeByLabel('BWH');
    const pairedRowsHtml = pairRowHtml(ageField, bdayField) + pairRowHtml(bodyField, bwhField);
    const textHtml = pairedRowsHtml + remaining.map(f=>{
      const label = (f.label || '').trim();
      const noLabel = NO_LABEL_FIELDS.includes(label);
      if(label === '성격' && f.value){
        return `<div class="profile-field profile-field-personality">${personalityHashtagsHtml(f.value)}</div>`;
      }
      if(noLabel){
        return `
          <div class="profile-field profile-field-plain">
            <span class="pf-value">${formatProfileFieldValue(f.label, f.value)}</span>
          </div>
        `;
      }
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
    // 기타 설명은 목록과 분리된 별도 박스로 — 값이 있을 때는 물론, 편집모드에선
    // 아직 비어있어도 여기에 채울 수 있다는 걸 알 수 있게 자리 안내를 보여줌
    const descHtml = showDescBox ? `
        <div class="profile-desc-box ${!(descField && descField.value) ? 'empty-hint' : ''}">
          ${(descField && descField.value) ? escapeHtml(descField.value) : (editMode ? '+ 기타 설명 추가' : '')}
        </div>
      ` : '';
    return `<div class="profile-fields">${textHtml}${linksHtml}</div>${descHtml}`;
  };

  // AU 이름은 항상 위젯 맨 위, 시점/IF 이름과는 확실히 구분되는 모양으로 고정 표시함.
  // AU가 여럿이거나 편집모드일 땐 눌러서 전환하는 탭 형태, AU가 하나뿐인 보기 모드에선
  // 탭 없이 이름표만 조용히 상단에 얹어서 보여줌 — 어느 쪽이든 세로 중앙 정렬되는
  // profile-viewport "밖"에 있어서 콘텐츠가 짧아도 아래로 처지지 않고 항상 맨 위에 붙음.
  const auHeaderHtml = (slides.length > 1 || editMode) ? `
      <div class="profile-au-bar" id="profAuTabs">
        ${slides.map((s,i)=> `
          <span class="profile-section-tab ${i===profileSlideIndex?'active':''}" data-au="${i}">
            ${escapeHtml(s.label || 'AU')}
            ${editMode ? `<button class="ps-edit" data-auedit="${i}" title="AU 이름 수정">✎</button>` : ''}
          </span>
        `).join('')}
        ${editMode ? `<button class="profile-section-add" id="profAuAddBtn" title="AU 추가">＋</button>` : ''}
        ${editMode ? `<button class="icon-btn profile-au-del" id="profAuDelBtn" title="이 AU 전체 삭제">✕</button>` : ''}
      </div>
    ` : (slide.label ? `
      <div class="profile-au-bar profile-au-bar-single">
        <span class="profile-au-name">${escapeHtml(slide.label)}</span>
      </div>
    ` : '');

  box.innerHTML = `
    ${auHeaderHtml}
    <div class="profile-viewport" id="profileViewport">
      ${(slide.sections.length > 1 || section.name || section.desc || editMode) ? `
        <div class="profile-section-header" id="profSecHeader">
          <div class="profile-section-name ${!section.name ? 'empty-hint':''}" id="profSecLabelBtn" ${editMode ? 'title="눌러서 시점/IF 이름 수정"' : ''}>
            ${section.name ? escapeHtml(section.name) : (editMode ? '+ 시점/IF 이름 추가 (예: 첫 만남)' : '')}
          </div>
          ${(slide.sections.length > 1 || editMode) ? `
            <div class="profile-section-actions">
              ${slide.sections.length > 1 ? `<button class="icon-btn profile-section-order" id="profSecOrderBtn" title="시점/IF 목록 보기">☰</button>` : ''}
              ${editMode ? `<button class="icon-btn profile-section-add" id="profSecAddBtn" title="시점/IF 추가">＋</button>` : ''}
              ${(editMode && slide.sections.length > 1) ? `<button class="icon-btn profile-section-del" id="profSecDelBtn" title="이 시점/IF 삭제">✕</button>` : ''}
            </div>
          ` : ''}
        </div>
        ${(section.desc || editMode) ? `
          <div class="profile-section-desc ${!section.desc ? 'empty-hint':''}" id="profSecDescBtn" ${editMode ? 'title="눌러서 시점/IF 설명 수정"' : ''}>
            ${section.desc ? escapeHtml(section.desc) : (editMode ? '+ 짧은 설명 추가' : '')}
          </div>
        ` : ''}
      ` : ''}
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
          return `
            <div class="profile-person" data-slot="${slot}">
              <div class="profile-basic ${editMode ? 'editable' : ''}" data-slot="${slot}">
                <div class="profile-photo">
                  <div class="profile-avatar ${avatar ? 'has-image' : ''}" ${avatar ? `style="background-image:url('${avatar}');background-size:${avatarBgSize(avatar)}"` : ''}>
                    ${avatar ? '' : '👤'}
                  </div>
                  ${oneLiner || editMode ? `
                    <div class="profile-oneliner ${!oneLiner ? 'empty-hint':''}">${oneLiner ? '“' + escapeHtml(oneLiner) + '”' : (editMode ? '+ 한마디 추가' : '')}</div>
                  ` : ''}
                </div>
                <div class="profile-info">
                  ${role ? `<div class="profile-role">${escapeHtml(role)}</div>` : ''}
                  <div class="profile-name">${hasContent ? escapeHtml(name || '(이름 없음)') : (editMode ? '+ 프로필 추가' : '')}</div>
                </div>
              </div>
              <div class="profile-person-fields ${editMode ? 'editable' : ''}" data-fieldslot="${slot}">
                ${fieldsHtml(fields)}
              </div>
            </div>
          `;
        }).join('<div class="profile-divider"></div>')}
      </div>
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
}

function bindProfile(slides){
  const box = document.getElementById('cardProfile');

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
    if(!confirm(`"${auName || 'AU'}"를 정말 삭제하시겠어요? 이 AU에 담긴 모든 시점/IF와 정보가 함께 지워지고, 되돌릴 수 없어요.`)) return;
    const arr = [...slides]; arr.splice(profileSlideIndex,1);
    await docRef('profile').set({slides:arr}, {merge:true});
    deleteAvatarChunksInSections(slides[profileSlideIndex] && slides[profileSlideIndex].sections);
    profileSlideIndex = 0; profileSectionIndex = 0;
  };
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
  if(secLabelBtn && editMode) secLabelBtn.onclick = ()=> openProfileSectionModal(profileSlideIndex, profileSectionIndex, slides);
  const secDescBtn = box.querySelector('#profSecDescBtn');
  if(secDescBtn && editMode) secDescBtn.onclick = ()=> openProfileSectionModal(profileSlideIndex, profileSectionIndex, slides);

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
    if(!confirm(`"${secName || '이 시점/IF'}"를 정말 삭제하시겠어요? 되돌릴 수 없어요.`)) return;
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

  // 정보 항목에 링크가 달려 있으면 그 링크를 누를 땐 편집 모달 대신 링크가 바로 열리게 함
  box.querySelectorAll('.pf-link-item').forEach(a=> a.addEventListener('click', (e)=> e.stopPropagation()));

  // 사진/한마디/소개/이름은 한 창에서, 정보 항목은 별도 창에서 — 각각 두 프로필을 한 창 안에서 같이 수정
  box.querySelectorAll('.profile-basic.editable').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      openProfileBasicModal(profileSlideIndex, profileSectionIndex, slides);
    });
  });
  box.querySelectorAll('.profile-person-fields.editable').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      openProfileFieldsModal(profileSlideIndex, profileSectionIndex, slides);
    });
  });

  if(!editMode){
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
function openProfileBasicModal(slideIdx, secIdx, slides){
  const slide = slides[slideIdx];
  const section = slide.sections[secIdx];
  const secLabel = section.name || '이 시점/IF';

  const bulkNote = slide.sections.length > 1;
  // 체크 상태는 이제 AU(사람 슬롯)에 저장된 값을 그대로 불러와서 보여줌 — 한 번 체크하면
  // 직접 바꾸기 전까진 창을 다시 열어도 풀리지 않음.
  const bulkToggle = (cls, label, checked)=> bulkNote
    ? `<label class="pe-bulk-row"><input type="checkbox" class="${cls}" ${checked ? 'checked' : ''}> ${escapeHtml(label)}, 이 AU의 다른 시점/IF에도 똑같이 적용</label>`
    : '';

  const colHtml = (slot)=>{
    const pf = section.peopleFields[slot] || { fields:[], avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'', name:'', role:'' };
    const personBulk = (slide.people[slot] && slide.people[slot].bulk) || { avatar:false, oneLiner:false, name:true, role:true, fields:{} };
    // 청크로 저장된 사진은 편집창을 열 때마다 다시 안 불러오고, 카드에 이미 보여주면서
    // 캐시된 값이 있으면 그걸 그대로 미리보기로 씀(없으면 자켓 모달과 같은 방식으로 안내만 표시)
    const cachedAvatar = pf.avatarChunked ? (chunkedImageCache.get(pf.avatarFileId) || '') : (pf.avatar || '');
    const hasAvatar = pf.avatarChunked || !!pf.avatar;
    return `
      <div class="profile-edit-col" data-slot="${slot}">
        <h4>프로필 ${slot===0?'①':'②'}</h4>
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
      </div>
    `;
  };

  openModal(`
    <h3>사진 · 한마디 · 소개 · 이름 · ${escapeHtml(secLabel)}</h3>
    <p class="hint">기본적으로는 지금 보고 있는 "${escapeHtml(secLabel)}"에만 저장돼요.${bulkNote ? ' 항목 아래 체크박스를 켜면 그 항목만 이 AU의 다른 시점/IF에도 똑같이 적용할 수 있어요. 한 번 체크해두면 직접 해제하기 전까진 계속 체크된 채로 남고, 새 시점/IF를 추가할 때도 그대로 이어져요.' : ''}</p>
    <div class="profile-edit-cols">
      ${colHtml(0)}
      <div class="profile-edit-divider"></div>
      ${colHtml(1)}
    </div>
    <div class="modal-actions">
      <button class="btn ghost" id="c">취소</button>
      <button class="btn primary" id="s">저장</button>
    </div>
  `, m=>{
    [0,1].forEach(slot=>{
      const col = m.querySelector(`.profile-edit-col[data-slot="${slot}"]`);
      col.querySelector('.pe-avatar-clear').onclick = ()=>{
        col.dataset.avatarCleared = '1';
        col.querySelector('.pe-avatar-preview').style.display = 'none';
        toast('저장하면 사진이 지워져요');
      };
    });

    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중…';
      try{
        const arr = cloneSlides(slides);
        const otherSecIdxs = arr[slideIdx].sections.map((_,i)=>i).filter(i=> i !== secIdx);
        const oldChunksToDelete = []; // [{fileId, total}] — 성공적으로 저장된 뒤에만 지움
        for(const slot of [0,1]){
          const col = m.querySelector(`.profile-edit-col[data-slot="${slot}"]`);
          const file = col.querySelector('.pe-avatar-file').files[0];
          const url = col.querySelector('.pe-avatar-url').value.trim();
          const oneLiner = col.querySelector('.pe-oneliner').value.trim();
          const name = col.querySelector('.pe-name').value.trim();
          const role = col.querySelector('.pe-role').value.trim();

          const bulkAvatar = !!col.querySelector('.pe-bulk-avatar') && col.querySelector('.pe-bulk-avatar').checked;
          const bulkOneliner = !!col.querySelector('.pe-bulk-oneliner') && col.querySelector('.pe-bulk-oneliner').checked;
          const bulkName = !!col.querySelector('.pe-bulk-name') && col.querySelector('.pe-bulk-name').checked;
          const bulkRole = !!col.querySelector('.pe-bulk-role') && col.querySelector('.pe-bulk-role').checked;

          const pf = section.peopleFields[slot] || { fields:[], avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'', name:'', role:'' };
          // 사진 관련 값들 — 기본은 그대로 유지, 아래 세 경우(지우기/URL/업로드) 중 하나라도
          // 일어나면 새 값으로 바뀌고 예전에 청크로 저장돼 있던 사진은 정리 대상에 들어감
          let avatar = pf.avatar || '';
          let avatarChunked = !!pf.avatarChunked;
          let avatarFileId = pf.avatarFileId || '';
          let avatarChunkTotal = pf.avatarChunkTotal || 0;
          let avatarDataUrl = null; // 방금 새로 준비된 사진의 실제 데이터(다른 시점/IF에 복제할 때 씀)

          if(col.dataset.avatarCleared === '1'){
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
            // 프로필 문서 하나에 모든 AU/시점의 사진이 같이 들어있어서, 사진을 그대로(inline)
            // 저장하면 시점/IF 몇 개만 추가돼도 금세 1MB 한도를 넘겨버림. 그래서 프로필 사진은
            // 무조건 청크로 따로 저장하고 여기엔 참조(fileId)만 남김.
            saveBtn.textContent = '사진 저장 중…';
            let chunkInfo;
            try{ chunkInfo = await saveFileChunked(dataUrl); }
            catch(err){ toast('사진을 저장하지 못했어요.'); saveBtn.disabled = false; saveBtn.textContent = '저장'; return; }
            chunkedImageCache.set(chunkInfo.fileId, dataUrl);
            avatar = ''; avatarChunked = true; avatarFileId = chunkInfo.fileId; avatarChunkTotal = chunkInfo.total;
            avatarDataUrl = dataUrl;
          }

          // 지금 보고 있는 시점/IF에는 항상 반영 (정보 항목은 별도 창에서 관리하므로 그대로 유지)
          arr[slideIdx].sections[secIdx].peopleFields[slot] = {
            ...pf, avatar, avatarChunked, avatarFileId, avatarChunkTotal, oneLiner, name, role
          };

          // 체크된 항목만 이 AU의 다른 시점/IF에도 그대로 적용. 사진은 여러 시점/IF가 같은
          // fileId를 그대로 나눠 쓰게 하면 나중에 한쪽만 지울 때 다른 쪽 사진까지 같이
          // 사라질 수 있어서, 대신 시점/IF마다 사진을 따로(복제) 저장함.
          for(const si of otherSecIdxs){
            const targetPf = arr[slideIdx].sections[si].peopleFields[slot];
            if(bulkOneliner) targetPf.oneLiner = oneLiner;
            if(bulkName) targetPf.name = name;
            if(bulkRole) targetPf.role = role;
            if(!bulkAvatar) continue;
            if(avatarDataUrl){
              // 방금 새로 올린 사진 → 이 시점/IF에도 새로 청크 저장(참조 공유 안 함)
              saveBtn.textContent = '사진 복제 저장 중…';
              try{
                const dup = await saveFileChunked(avatarDataUrl);
                chunkedImageCache.set(dup.fileId, avatarDataUrl);
                targetPf.avatar = ''; targetPf.avatarChunked = true; targetPf.avatarFileId = dup.fileId; targetPf.avatarChunkTotal = dup.total;
              }catch(err){ /* 복제 저장 실패해도 본 저장은 계속 진행 */ }
            } else {
              // URL이거나(짧은 문자열이라 그냥 복사해도 안전) 사진을 지운 경우
              targetPf.avatar = avatar; targetPf.avatarChunked = avatarChunked; targetPf.avatarFileId = avatarFileId; targetPf.avatarChunkTotal = avatarChunkTotal;
            }
          }

          // "적용" 체크 상태를 AU(사람 슬롯)에 그대로 영구 저장 — 정보 항목의 적용 상태(fields)는
          // 정보 편집 창에서 따로 관리하므로 여기서는 건드리지 않고 그대로 유지
          arr[slideIdx].people[slot] = {
            ...arr[slideIdx].people[slot], name, role, avatar: '',
            bulk: {
              ...(arr[slideIdx].people[slot].bulk || {}),
              avatar: bulkAvatar, oneLiner: bulkOneliner, name: bulkName, role: bulkRole
            }
          };
        }
        saveBtn.textContent = '저장 중…';
        await docRef('profile').set({slides:arr}, {merge:true});
        oldChunksToDelete.forEach(({fileId, total})=> deleteFileChunked(fileId, total).catch(()=>{}));
      }catch(err){
        toast(`저장하지 못했어요: ${err.message || err}`);
        saveBtn.disabled = false; saveBtn.textContent = '저장';
        return;
      }
      closeModal();
    };
  }, 'modal-profile-edit');
}

/* "정보" 항목(성격·나이·키/몸무게·링크 등)만 따로 편집하는 창. 사진/한마디/소개/이름은
   openProfileBasicModal 쪽에서 관리하고, 이 창은 정보 목록만 다룸. */
function openProfileFieldsModal(slideIdx, secIdx, slides){
  const slide = slides[slideIdx];
  const section = slide.sections[secIdx];
  const secLabel = section.name || '이 시점/IF';

  const bulkNote = slide.sections.length > 1;

  const colHtml = (slot)=>{
    return `
      <div class="profile-edit-col" data-slot="${slot}">
        <h4>정보 ${slot===0?'①':'②'}</h4>
        <div class="pf-edit-list pe-fields-list"></div>
        <button type="button" class="btn small ghost pe-add-field">+ 항목 추가</button>
        <button type="button" class="btn small ghost pe-add-link">+ 링크 추가</button>
      </div>
    `;
  };

  openModal(`
    <h3>정보 편집 · ${escapeHtml(secLabel)}</h3>
    <p class="hint">나이·생년월일·키/몸무게·BWH는 숫자만 넣으면 자동 정리, 성격은 쉼표로 구분하면 해시태그로 표시돼요.${bulkNote ? ' 체크박스를 켜면 그 항목만 이 AU의 다른 시점/IF에도 함께 적용돼요.' : ''}</p>
    <div class="profile-edit-cols">
      ${colHtml(0)}
      <div class="profile-edit-divider"></div>
      ${colHtml(1)}
    </div>
    <div class="modal-actions">
      <button class="btn ghost" id="c">취소</button>
      <button class="btn primary" id="s">저장</button>
    </div>
  `, m=>{
    // 항목별 "적용" 체크 초기값도 매번 false로 시작하지 않고, AU에 저장된 값에서 라벨로 찾아 이어받음
    const personBulkOf = (slot)=> (slide.people[slot] && slide.people[slot].bulk) || { avatar:false, oneLiner:false, name:true, role:true, fields:{} };
    const fieldKey = (label)=> (label||'').trim().toLowerCase();
    const slotState = [0,1].map(slot=>{
      const pf = section.peopleFields[slot] || { fields:[], avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'', name:'', role:'' };
      const pBulk = personBulkOf(slot);
      return { fields:(pf.fields||[]).map(f=>({ ...f, bulk: !!pBulk.fields[fieldKey(f.label)] })) };
    });

    [0,1].forEach(slot=>{
      const col = m.querySelector(`.profile-edit-col[data-slot="${slot}"]`);
      const listEl = col.querySelector('.pe-fields-list');
      const rowHtml = (f, i)=>{
        if(f.type === 'link'){
          return `
          <div class="pf-edit-row pf-edit-row-link" data-idx="${i}" data-type="link">
            <input type="text" class="pf-edit-label" placeholder="링크 이름 (예: 플레이리스트)" value="${escapeHtml(f.label)}">
            <input type="url" class="pf-edit-link" placeholder="링크 URL" value="${escapeHtml(f.link||'')}">
            ${bulkNote ? `
            <div class="pf-edit-row-actions">
              <label class="pe-bulk-row pf-bulk-row" title="이 링크를 이 AU의 다른 시점/IF에도 똑같이 적용"><input type="checkbox" class="pf-edit-bulk" ${f.bulk ? 'checked' : ''}> 일괄적용</label>
              <button type="button" class="btn small danger" data-del="${i}">✕</button>
            </div>` : `<button type="button" class="btn small danger" data-del="${i}">✕</button>`}
          </div>
        `;
        }
        // "기타 설명"은 자유롭게 길게 적는 항목이라, 한 줄짜리 입력칸 대신 여러 줄 쓸 수 있는
        // 큰 textarea로 보여줘서 내용을 적을 공간을 넉넉하게 줌
        const isDesc = (f.label||'').trim() === '기타 설명';
        return `
          <div class="pf-edit-row ${isDesc ? 'pf-edit-row-desc' : ''}" data-idx="${i}" data-type="text">
            <input type="text" class="pf-edit-label" placeholder="항목명 (예: 키/몸무게)" value="${escapeHtml(f.label)}">
            ${isDesc
              ? `<textarea class="pf-edit-value pf-edit-value-desc" placeholder="내용">${escapeHtml(f.value)}</textarea>`
              : `<input type="text" class="pf-edit-value" placeholder="내용" value="${escapeHtml(f.value)}">`}
            ${bulkNote ? `
            <div class="pf-edit-row-actions">
              <label class="pe-bulk-row pf-bulk-row" title="이 항목을 이 AU의 다른 시점/IF에도 똑같이 적용"><input type="checkbox" class="pf-edit-bulk" ${f.bulk ? 'checked' : ''}> 일괄적용</label>
              <button type="button" class="btn small danger" data-del="${i}">✕</button>
            </div>` : `<button type="button" class="btn small danger" data-del="${i}">✕</button>`}
          </div>
        `;
      };
      const drawFields = ()=>{
        const list = slotState[slot].fields;
        // 새 항목은 배열 맨 뒤에 추가되는데, "기타 설명"이 중간에 있으면 새로 추가한
        // 항목과 위치가 뒤섞여 헷갈리므로, 화면에는 "기타 설명"을 항상 맨 아래로 고정해서 보여줌
        // (실제 배열 순서/삭제 인덱스는 그대로 유지 — 표시 순서만 바꿈)
        const descIdx = list.findIndex(f=> f.type !== 'link' && (f.label||'').trim() === '기타 설명');
        const order = list.map((_,i)=> i).filter(i=> i !== descIdx);
        if(descIdx !== -1) order.push(descIdx);
        listEl.innerHTML = order.map(i=> rowHtml(list[i], i)).join('') || `<div class="w-empty">등록된 항목이 없어요</div>`;
        listEl.querySelectorAll('[data-del]').forEach(btn=> btn.addEventListener('click', ()=>{
          slotState[slot].fields.splice(Number(btn.dataset.del), 1);
          drawFields();
        }));
        listEl.querySelectorAll('.pf-edit-bulk').forEach(cb=> cb.addEventListener('change', ()=>{
          const i = Number(cb.closest('.pf-edit-row').dataset.idx);
          slotState[slot].fields[i].bulk = cb.checked;
        }));
      };
      drawFields();
      col.querySelector('.pe-add-field').onclick = ()=>{ slotState[slot].fields.push({type:'text', label:'', value:'', bulk:false}); drawFields(); };
      // 링크는 항목마다 붙이는 게 아니라, 링크 전용 항목으로만 추가하고 항상 목록 맨 아래에 놓임
      col.querySelector('.pe-add-link').onclick = ()=>{ slotState[slot].fields.push({type:'link', label:'', link:'', bulk:false}); drawFields(); };
    });

    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중…';
      try{
        const arr = cloneSlides(slides);
        const otherSecIdxs = arr[slideIdx].sections.map((_,i)=>i).filter(i=> i !== secIdx);
        for(const slot of [0,1]){
          const col = m.querySelector(`.profile-edit-col[data-slot="${slot}"]`);
          // 링크 전용 항목은 항상 뒤로 보내서, 저장 순서 자체도 일반 항목 다음에 오게 정리해둠
          const rows = Array.from(col.querySelectorAll('.pf-edit-row'));
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

          const pf = section.peopleFields[slot] || { fields:[], avatar:'', avatarChunked:false, avatarFileId:'', avatarChunkTotal:0, oneLiner:'', name:'', role:'' };

          // 지금 보고 있는 시점/IF에는 항상 반영 (사진/한마디/소개/이름은 그대로 유지)
          arr[slideIdx].sections[secIdx].peopleFields[slot] = {
            ...pf, fields: fields.map(({bulk, ...f})=> f)
          };

          // 체크된 항목만 이 AU의 다른 시점/IF에도 그대로 적용
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

          // "적용" 체크 상태를 AU(사람 슬롯)에 그대로 영구 저장 — 다음에 편집창을 다시 열거나
          // 새 시점/IF를 만들 때도 직접 바꾸기 전까진 이 상태를 그대로 이어받음
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
        }
        saveBtn.textContent = '저장 중…';
        await docRef('profile').set({slides:arr}, {merge:true});
      }catch(err){
        toast(`저장하지 못했어요: ${err.message || err}`);
        saveBtn.disabled = false; saveBtn.textContent = '저장';
        return;
      }
      closeModal();
    };
  }, 'modal-profile-edit');
}

function openProfileSlideModal(slideIdx, slides){
  const slide = slides[slideIdx];
  const canDelete = slides.length > 1;
  openModal(`
    <h3>AU 이름</h3>
    <label>이름 (선택 — 예: 본편, 카페 AU, 학원 AU)</label>
    <input type="text" id="slLabel" value="${escapeHtml(slide.label)}" placeholder="비워두면 이름 없이 보여요">
    <label style="margin-top:10px;">구분</label>
    <div class="sec-kind-row">
      <label class="sec-kind-opt"><input type="radio" name="slKind" value="timeline" ${slide.kind === 'timeline' ? 'checked' : ''}> 시점 (연대기 흐름)</label>
      <label class="sec-kind-opt"><input type="radio" name="slKind" value="if" ${slide.kind !== 'timeline' ? 'checked' : ''}> IF (가정)</label>
    </div>
    <p class="hint">"시점"으로 설정하면 이 AU 안의 시점/IF들이 아래에서 점 나열 대신 타임라인 모양으로 보여요. 이 구분은 AU 전체에 한 번에 적용돼요.</p>
    <p class="hint">시점/IF 이름은 카드에서 그 부분을 눌러서, 키/몸무게·성격 같은 정보는 각 프로필 이름 아래 영역을 눌러서 따로 편집할 수 있어요.</p>
    <div class="modal-actions">
      ${canDelete ? `<button class="btn danger" id="d" type="button">이 AU 전체 삭제</button>` : ''}
      <button class="btn ghost" id="c">취소</button>
      <button class="btn primary" id="s">저장</button>
    </div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    const delBtn = m.querySelector('#d');
    if(delBtn) delBtn.onclick = async ()=>{
      if(!confirm(`"${slide.label || 'AU'}"를 정말 삭제하시겠어요? 이 AU에 담긴 모든 시점/IF와 정보가 함께 지워지고, 되돌릴 수 없어요.`)) return;
      const arr = [...slides]; arr.splice(slideIdx,1);
      await docRef('profile').set({slides:arr}, {merge:true});
      deleteAvatarChunksInSections(slides[slideIdx] && slides[slideIdx].sections);
      profileSlideIndex = 0; profileSectionIndex = 0;
      closeModal();
    };
    m.querySelector('#s').onclick = async ()=>{
      const label = m.querySelector('#slLabel').value.trim();
      const kind = m.querySelector('input[name="slKind"]:checked').value === 'timeline' ? 'timeline' : 'if';
      const arr = cloneSlides(slides);
      arr[slideIdx].label = label;
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
      <div class="sec-order-row ${!editMode ? 'viewonly' : ''}" data-idx="${i}">
        <span class="sec-order-idx">${i+1}</span>
        <span class="sec-order-name ${!sec.name ? 'empty-hint' : ''}">${sec.name ? escapeHtml(sec.name) : '(이름 없음)'}</span>
        ${editMode ? `
          <button class="icon-btn sec-order-default ${i===defIdx ? 'active' : ''}" data-idx="${i}" title="${i===defIdx ? '이 AU를 열면 처음 보여지는 시점/IF예요' : '이 AU를 열었을 때 처음 보여줄 시점/IF로 지정'}">${i===defIdx ? '★' : '☆'}</button>
          <div class="sec-order-btns">
            <button class="icon-btn sec-order-up" data-idx="${i}" title="위로" ${i===0?'disabled':''}>▲</button>
            <button class="icon-btn sec-order-down" data-idx="${i}" title="아래로" ${i===secs.length-1?'disabled':''}>▼</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  };
  openModal(`
    <h3>시점/IF ${editMode ? '순서 편집' : '목록'}</h3>
    <p class="hint">${editMode ? '▲▼로 순서를 옮기면 바로 저장돼요. ☆를 누르면 이 AU를 열었을 때 처음 보여줄 시점/IF로 지정돼요(지정 안 하면 첫 번째가 보여요).' : '눌러서 그 시점/IF로 바로 이동할 수 있어요.'}</p>
    <div id="secOrderList" class="sec-order-list">${renderRows()}</div>
    <div class="modal-actions">
      <button class="btn primary" id="s">닫기</button>
    </div>
  `, m=>{
    const listEl = m.querySelector('#secOrderList');
    const swap = async (i, j)=>{
      const slideObj = workingSlides[slideIdx];
      const secs = slideObj.sections;
      [secs[i], secs[j]] = [secs[j], secs[i]];
      // 순서를 바꿔도 "기본으로 보여줄 시점/IF"는 내용 기준으로 그대로 따라가야 하므로,
      // 지정된 기본 인덱스가 이번에 맞바뀐 자리 중 하나라면 같이 옮겨줌.
      const defIdx = slideObj.defaultSectionIndex || 0;
      if(defIdx === i) slideObj.defaultSectionIndex = j;
      else if(defIdx === j) slideObj.defaultSectionIndex = i;
      await docRef('profile').set({slides:workingSlides}, {merge:true});
      if(profileSlideIndex === slideIdx){
        if(profileSectionIndex === i) profileSectionIndex = j;
        else if(profileSectionIndex === j) profileSectionIndex = i;
      }
      listEl.innerHTML = renderRows();
      bindRows();
    };
    const setDefault = async (i)=>{
      workingSlides[slideIdx].defaultSectionIndex = i;
      await docRef('profile').set({slides:workingSlides}, {merge:true});
      listEl.innerHTML = renderRows();
      bindRows();
    };
    const bindRows = ()=>{
      if(editMode){
        listEl.querySelectorAll('.sec-order-default').forEach(btn=>{
          btn.onclick = (e)=>{ e.stopPropagation(); setDefault(Number(btn.dataset.idx)); };
        });
        listEl.querySelectorAll('.sec-order-up').forEach(btn=>{
          if(btn.disabled) return;
          btn.onclick = (e)=>{ e.stopPropagation(); swap(Number(btn.dataset.idx), Number(btn.dataset.idx) - 1); };
        });
        listEl.querySelectorAll('.sec-order-down').forEach(btn=>{
          if(btn.disabled) return;
          btn.onclick = (e)=>{ e.stopPropagation(); swap(Number(btn.dataset.idx), Number(btn.dataset.idx) + 1); };
        });
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
    <p class="hint">키/몸무게·성격 같은 정보 항목은 추가한 뒤 각 프로필 이름 아래 영역을 눌러서 따로 편집할 수 있어요.</p>
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
    <p class="hint">키/몸무게·성격 같은 정보 항목은 각 프로필 이름 아래 영역을 눌러서 따로 편집할 수 있어요. 이 시점/IF를 삭제하려면 창을 닫고 제목 옆 ✕ 버튼을 눌러주세요.</p>
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
  const needsSkeleton = !box.querySelector('.mp-player') || mpSkeletonEditMode !== editMode;
  if(needsSkeleton){
    buildMusicSkeleton(box);
    mpSkeletonEditMode = editMode;
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
    <div class="mp-cover-bg" id="mpCoverBg"></div>
    <div class="mp-player">
      <input type="range" class="mp-seek" id="mpSeek" min="0" max="1000" value="0">
      <div class="mp-times"><span id="mpCurTime">0:00</span><span id="mpDurTime">0:00</span></div>
      <div class="mp-meta">
        <div class="mp-title" id="mpTitle">재생할 곡을 선택해주세요</div>
        <div class="mp-artist" id="mpArtist"></div>
      </div>
      <div class="mp-controls">
        <button class="icon-btn mp-repeat-btn" id="mpRepeatBtn" title="반복재생"></button>
        <button class="icon-btn mp-prev-btn" id="mpPrevBtn" title="이전 곡">⏮</button>
        <button class="mp-play-btn" id="mpPlayBtn" title="재생/일시정지">▶</button>
        <button class="icon-btn mp-next-btn" id="mpNextBtn" title="다음 곡">⏭</button>
        <button class="icon-btn mp-continuous-btn" id="mpContinuousBtn" title="연속재생">➜</button>
      </div>
      <div class="player-tracks" id="mpTrackList"></div>
      ${editMode ? `<button class="btn small music-add" id="musicAddBtn">+ 곡 추가</button>` : ''}
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
      ${editMode ? `<span class="mp-track-drag-handle" title="드래그해서 순서 바꾸기">⠿</span>` : ''}
      ${editMode ? `<button class="icon-btn" data-edit="${t.id}" title="수정" style="width:22px;height:22px;font-size:.6rem;">✎</button>` : ''}
      ${editMode ? `<button class="icon-btn" data-del="${t.id}" title="삭제" style="width:22px;height:22px;font-size:.6rem;">✕</button>` : ''}
    </div>
  `;
  }).join('') : `<div class="w-empty">등록된 곡이 없어요</div>`;
  listEl.querySelectorAll('[data-id]').forEach(row=>{
    row.addEventListener('click', (e)=>{
      if(e.target.closest('[data-edit]') || e.target.closest('[data-del]') || e.target.closest('.mp-track-drag-handle')) return;
      mpPlayById(row.dataset.id, true);
    });
  });
  listEl.querySelectorAll('[data-edit]').forEach(btn=> btn.addEventListener('click', e=>{
    e.stopPropagation();
    const t = tracks.find(x=>x.id===btn.dataset.edit);
    if(t) openMusicTrackModal(t);
  }));
  listEl.querySelectorAll('[data-del]').forEach(btn=> btn.addEventListener('click', async e=>{
    e.stopPropagation();
    await mpDeleteTrack(btn.dataset.del);
  }));
  // 편집모드에서 드래그로 재생목록 순서를 바꿀 수 있게 함(다른 위젯의 사진 순서 변경과 동일한 방식)
  bindPinDragReorder(
    listEl, '.mp-track-row',
    ()=> (musicData.tracks || []).slice(),
    async (arr)=> docRef('music').set({tracks:arr}, {merge:true})
  );
}

function updateMpMetaDisplay(track){
  const bg = document.getElementById('mpCoverBg');
  const titleEl = document.getElementById('mpTitle');
  const artistEl = document.getElementById('mpArtist');
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
    ${isEdit ? `<p class="hint">현재 음원: ${currentSourceDesc}. 그대로 두거나 아래에서 바꿀 수 있어요.</p>` : ''}
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
      <p class="hint">누르면 바로 재생되는 mp3 파일 주소를 넣어주세요. 구글드라이브 등 대부분의 공유 링크는 재생이 안 될 수 있어요.</p>
    </div>
    <label style="margin-top:6px;">자켓 이미지 (선택 — 비워두면 투명하게 보여요, 움직이는 GIF도 가능)</label>
    <input type="file" id="mCoverFile" accept="image/*">
    <p class="hint">움직이는 GIF는 최대 ${Math.round(COVER_CHUNKED_MAX_BYTES/1024/1024)}MB까지 올릴 수 있어요. (용량이 크면 자동으로 나눠 저장하고, 불러올 때 몇 초 더 걸릴 수 있어요)</p>
    <label style="margin-top:6px;">또는 이미지 URL</label>
    <input type="url" id="mCoverUrl" placeholder="https://...">
    ${isEdit && (existing.cover || existing.coverChunked) ? `<div class="mp-modal-cover-preview" id="mCoverPreviewWrap">${existing.cover ? `<img src="${existing.cover}" alt="">` : `<p class="hint">현재 자켓: 저장된 이미지 (용량이 커서 미리보기는 생략돼요)</p>`}<button type="button" class="btn ghost small" id="mCoverClear">이미지 지우기</button></div>` : ''}
    <p class="hint">유튜브 링크와 mp3 링크를 지원해요. 자켓 이미지는 비워둬도 괜찮아요.</p>
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
        try{ dataUrl = await compressImageFile(coverFile, 800, 180000, COVER_CHUNKED_MAX_BYTES); }
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
  return `${y}.${m}.${d}`;
}

function renderDday(){
  const items = (ddayData.items || []).map((it,i)=>({...it, _i:i})).sort((a,b)=> a.date.localeCompare(b.date));
  const body = document.getElementById('ddayBody');
  body.innerHTML = items.map(it=> `
    <div class="dday-item">
      ${editMode ? `<button class="icon-btn" data-del="${it._i}">✕</button>` : ''}
      <div class="dday-info">
        <div class="dday-label">${escapeHtml(it.label)}</div>
        <div class="dday-date">${ddayDateText(it.date)}</div>
      </div>
      <div class="dday-count">${ddayDiffText(it.date)}</div>
    </div>
  `).join('') || `<div class="w-empty">등록된 디데이가 없어요</div>`;
  body.querySelectorAll('[data-del]').forEach(btn=> btn.addEventListener('click', async ()=>{
    const idx = Number(btn.dataset.del);
    const arr = [...ddayData.items]; arr.splice(idx,1);
    await docRef('dday').set({items:arr}, {merge:true});
  }));

  const wrap = document.getElementById('ddayAddWrap');
  wrap.innerHTML = editMode ? `<button class="btn small" id="ddayAddBtn">+ 디데이 추가</button>` : '';
  const addBtn = document.getElementById('ddayAddBtn');
  if(addBtn) addBtn.onclick = openDdayAddModal;
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
  const entries = (guestbookData.entries || []).slice().sort((a,b)=> (b.ts||0) - (a.ts||0));
  const body = document.getElementById('guestbookBody');
  body.innerHTML = entries.map(e=> `
    <div class="gb-entry" data-id="${e.id}">
      ${editMode ? `<button class="gb-del">✕</button>` : ''}
      <span class="gb-name">${escapeHtml(e.name||'익명')}</span>
      <span class="gb-time">${e.ts ? new Date(e.ts).toLocaleDateString('ko-KR') : ''}</span>
      <div class="gb-msg">${escapeHtml(e.message)}</div>
    </div>
  `).join('') || `<div class="w-empty">아직 남겨진 방명록이 없어요</div>`;
  body.querySelectorAll('.gb-del').forEach(btn=> btn.addEventListener('click', async ()=>{
    const id = btn.closest('.gb-entry').dataset.id;
    const arr = (guestbookData.entries||[]).filter(x=> x.id !== id);
    await docRef('guestbook').set({entries: arr}, {merge:true});
  }));
}

docRef('guestbook').onSnapshot(doc=>{ guestbookData = doc.exists ? doc.data() : {entries:[]}; renderGuestbook(); });

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

const DDAY_MILESTONE_INTERVAL = 50; // "50일 간격" 기념일 자동 표시 주기

function daysBetween(baseDateStr, targetDateStr){
  const base = new Date(baseDateStr + 'T00:00:00');
  const target = new Date(targetDateStr + 'T00:00:00');
  return Math.round((target - base) / 86400000);
}

// 디데이 위젯에 등록된 날짜를 기준으로, 해당 날짜와 그 뒤 50일 단위가 되는 날짜마다
// 캘린더에 자동으로 기념일 표시를 띄워줌 (직접 캘린더에 따로 입력할 필요 없음)
function ddayMilestonesForDate(dateStr){
  const marks = [];
  (ddayData.items || []).forEach(it=>{
    if(!it.date) return;
    const diff = daysBetween(it.date, dateStr);
    if(diff >= 0 && diff % DDAY_MILESTONE_INTERVAL === 0){
      marks.push(diff === 0 ? `${it.label} 시작일` : `${it.label} ${diff}일`);
    }
  });
  return marks;
}

// 특정 연/월 한 달치 캘린더 블록의 HTML을 만들어줌.
// kind: 'prev' | 'current' | 'next'. 이동 버튼은 더 이상 각 달의 head에 붙이지 않고
// (아래 renderCalendar에서 전체 캘린더 위/아래에 상하 버튼으로 따로 배치함),
// 이전/다음 달은 요일(dow) 줄 없이 흐리게 표시하고 절반만 보이도록 나중에 높이를 잘라냄.
function buildCalMonthHTML(y, m, kind){
  const events = calendarData.events || {};
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0,10);
  const isCurrent = kind === 'current';
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
        <strong>${y}. ${m+1}</strong>
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

// 모바일 전용 주간 스트립: 해당 주(일~토) 7칸만 한 줄로 보여줌.
function buildCalWeekHTML(startDate){
  const events = calendarData.events || {};
  const todayStr = new Date().toISOString().slice(0,10);
  const days = [];
  let cells = '';
  for(let i=0;i<7;i++){
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    days.push(d);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const hasManual = events[dateStr] && events[dateStr].length;
    const ddayMarks = ddayMilestonesForDate(dateStr);
    const cls = [
      'cal-day',
      dateStr===todayStr ? 'today' : '',
      (hasManual || ddayMarks.length) ? 'has-event' : '',
      ddayMarks.length ? 'has-dday' : ''
    ].filter(Boolean).join(' ');
    cells += `<div class="${cls}" data-day="${dateStr}" title="${ddayMarks.length ? escapeHtml(ddayMarks.join(', ')) : ''}">${d.getDate()}</div>`;
  }
  const first = days[0], last = days[6];
  const rangeLabel = first.getMonth() === last.getMonth()
    ? `${first.getFullYear()}. ${first.getMonth()+1}.${first.getDate()} - ${last.getDate()}`
    : `${first.getMonth()+1}.${first.getDate()} - ${last.getMonth()+1}.${last.getDate()}`;
  return `
    <div class="cal-week">
      <div class="cal-head"><strong>${rangeLabel}</strong></div>
      <div class="cal-grid">
        ${['일','월','화','수','목','금','토'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}
        ${cells}
      </div>
    </div>
  `;
}

let calViewWasMobile = null;
function renderCalendar(){
  const box = document.getElementById('cardCalendar');
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
      ${buildCalMonthHTML(prevY, prevM, 'prev')}
      ${buildCalMonthHTML(calState.y, calState.m, 'current')}
      ${buildCalMonthHTML(nextY, nextM, 'next')}
    </div>
    <div class="cal-nav cal-nav-next"><span class="cal-nav-btn" id="calNext">▼</span></div>
  `;
  box.querySelector('#calPrev').onclick = ()=>{ calState.m--; if(calState.m<0){calState.m=11; calState.y--;} renderCalendar(); };
  box.querySelector('#calNext').onclick = ()=>{ calState.m++; if(calState.m>11){calState.m=0; calState.y++;} renderCalendar(); };
  box.querySelectorAll('[data-day]').forEach(el=> el.addEventListener('click', ()=> openDayModal(el.dataset.day)));

  applyCalMonthClipHeights(box);
  ensureCalClipResizeWatch(box);

  fitRefGalleryToCalendarHeight();
}
// 창 폭이 900px 경계를 넘나들 때(주간뷰 ↔ 월간뷰) 캘린더를 다시 그려줌
// (리사이즈/기기 회전 등으로 모바일·PC 전환이 생겨도 항상 알맞은 뷰로 유지됨)
window.addEventListener('resize', debounce(()=>{
  if(calViewWasMobile === null) return;
  if(isMobileCalView() !== calViewWasMobile) renderCalendar();
}, 150));

// 이전/다음 달 미리보기는 이번 달 그리드 높이의 절반만 보이게 잘라냄.
// prev는 아래쪽 절반(이번 달과 맞닿는 쪽)이 보이도록 위로 밀어 올리고,
// next는 위쪽 절반(이번 달과 맞닿는 쪽)이 자연스럽게 보이도록 둠.
// (예전엔 renderCalendar() 안에서 딱 한 번만 계산했는데, 모바일에서 카드 폭이
// 아직 0으로 잡히는 순간(탭이 화면에 보이기 전, 레이아웃/폰트가 자리잡기 전 등)에
// 이 계산이 실행되면 fullH가 0이 되어 이전/다음 달이 통째로 높이 0px로 접혀
// 안 보이는 문제가 있었음 — 이 파일의 layoutPinMasonry/ensurePinMasonryResizeWatch와
// 같은 종류의 버그라 같은 방식(ResizeObserver)으로 고침. 폭을 못 구한 경우엔
// 억지로 0으로 확정 짓지 않고 넘어가고, 아래 ResizeObserver가 카드가 실제
// 크기를 갖는 순간(=모바일에서도) 다시 계산해줌. */
function applyCalMonthClipHeights(box){
  const curGrid = box.querySelector('.cal-month-current .cal-grid');
  const prevClip = box.querySelector('.cal-month-prev .cal-clip');
  const prevGrid = box.querySelector('.cal-month-prev .cal-grid');
  const nextClip = box.querySelector('.cal-month-next .cal-clip');
  if(!(curGrid && prevClip && prevGrid && nextClip)) return;
  const fullH = curGrid.getBoundingClientRect().height;
  if(!fullH) return;
  const halfH = fullH / 2;
  prevClip.style.height = `${halfH}px`;
  prevGrid.style.marginTop = `-${halfH}px`;
  nextClip.style.height = `${halfH}px`;
}
let calClipResizeObserver = null;
function ensureCalClipResizeWatch(box){
  if(typeof ResizeObserver === 'undefined') return;
  if(calClipResizeObserver) calClipResizeObserver.disconnect();
  calClipResizeObserver = new ResizeObserver(()=> applyCalMonthClipHeights(box));
  calClipResizeObserver.observe(box);
}

function openDayModal(dateStr){
  const events = calendarData.events || {};
  const manual = events[dateStr] || [];
  const ddayMarks = ddayMilestonesForDate(dateStr);
  if(!editMode){
    if(!manual.length && !ddayMarks.length){ toast('이 날은 등록된 일정이 없어요'); return; }
    const lines = [...ddayMarks.map(t=>`🎉 ${t}`), ...manual];
    openModal(`<h3>${dateStr}</h3><div style="white-space:pre-wrap;font-size:.88rem;">${escapeHtml(lines.join('\n'))}</div>
      <div class="modal-actions"><button class="btn ghost" id="c">닫기</button></div>`,
      m=> m.querySelector('#c').onclick = closeModal);
    return;
  }
  openModal(`
    <h3>${dateStr} 일정</h3>
    ${ddayMarks.length ? `<p class="hint">🎉 디데이 연동: ${escapeHtml(ddayMarks.join(', '))} (자동으로 표시되는 항목이라 여기서 지울 필요 없어요)</p>` : ''}
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

/* ---------------- 6. 갤러리 (핀터레스트형 매스너리) ---------------- */

/* 예전엔 items가 그냥 URL 문자열 배열이었어서, 새로 추가된 블러 옵션과 호환되도록
   문자열이면 {url, blur:false}로, 객체면 그대로 정규화해줌 */
function normalizeGalleryItem(it){
  if(typeof it === 'string') return { url: it, blur: false, opts: [] };
  if(it.chunked) return { chunked:true, fileId: it.fileId, chunkTotal: it.chunkTotal, blur: !!it.blur, opts: it.opts || (it.opt ? [it.opt] : []) };
  return { url: it.url, blur: !!it.blur, opts: it.opts || (it.opt ? [it.opt] : []) };
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
        newItems.push({ chunked:true, fileId, chunkTotal: total, blur: !!raw.blur, opts: raw.opts || (raw.opt ? [raw.opt] : []) });
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
   줄을 세워서 하나 끝나면 다음 게 시작되도록 함(모든 갤러리가 이 큐를 공유함) */
const CHUNK_LOAD_CONCURRENCY = 4;
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
      const resolved = resolveGalleryItemUrl(item, ()=> fillTile(tile, idx, chunkedImageCache.get(item.fileId) || '', item));
      if(resolved !== null) fillTile(tile, idx, resolved, item);
    });
  }, { root: gridEl, rootMargin: '200px 0px' });
  targets.forEach(tile=> observerHolder.current.observe(tile));
}

function deleteGalleryImageIfChunked(item){
  if(item && item.chunked){ deleteFileChunked(item.fileId, item.chunkTotal).catch(()=>{}); }
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
function galleryTileHtml(it, i){
  if(it.chunked && chunkedImageCache.has(it.fileId)) return galleryTileMarkup(it, chunkedImageCache.get(it.fileId) || '', i);
  if(!it.chunked) return galleryTileMarkup(it, it.url, i);
  return `<div class="pin-item pin-loading" data-idx="${i}"><span>불러오는 중…</span></div>`;
}
function galleryTileMarkup(it, url, i){
  return `
    <div class="pin-item ${it.blur ? 'blurred' : ''}" data-idx="${i}">
      <img src="${escapeHtml(url)}" loading="lazy" decoding="async">
      ${editMode ? `<button class="pin-del-btn" data-del="${i}" title="삭제">✕</button>` : ''}
      ${editMode ? `<button class="pin-blur-btn" data-blur="${i}" title="${it.blur ? '블러 해제' : '블러 처리'}">${it.blur ? '🙈' : '👁'}</button>` : ''}
      ${editMode ? `<button class="pin-opt-btn" data-opt-edit="${i}" title="옵션 지정" style="bottom:8px;right:8px;top:auto;">🏷</button>` : ''}
    </div>`;
}
function fillGalleryTile(tile, idx, url, it){
  if(!tile.isConnected) return; // 그사이 그리드가 다시 그려져서 이 타일이 이미 화면에서 빠졌으면 무시
  tile.classList.remove('pin-loading');
  tile.innerHTML = `
    <img src="${escapeHtml(url)}" loading="lazy" decoding="async">
    ${editMode ? `<button class="pin-del-btn" data-del="${idx}" title="삭제">✕</button>` : ''}
    ${editMode ? `<button class="pin-blur-btn" data-blur="${idx}" title="${it.blur ? '블러 해제' : '블러 처리'}">${it.blur ? '🙈' : '👁'}</button>` : ''}
    ${editMode ? `<button class="pin-opt-btn" data-opt-edit="${idx}" title="옵션 지정" style="bottom:8px;right:8px;top:auto;">🏷</button>` : ''}
  `;
  if(it.blur) tile.classList.add('blurred');
  const img = tile.querySelector('img');
  attachImgFallback(img);
  const grid = tile.closest('#galleryGrid');
  if(grid){
    if(img && !img.complete) img.addEventListener('load', ()=> relayoutPinMasonryDebounced(grid), { once:true });
    else relayoutPinMasonryDebounced(grid);
  }
}
function handleGalleryDelete(idx){
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
    <div class="pin-toolbar">
      <div class="tag-filter" id="galleryFilterChips" style="display:none;"></div>
      ${editMode ? `<button class="btn small ghost" id="galOptsBtn">⚙ 옵션 관리</button>` : ''}
    </div>
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
  requestAnimationFrame(()=> layoutPinMasonry(gridEl));
  watchPinTileImagesForRelayout(gridEl);

  // 열기/삭제/블러/옵션 지정 클릭을 그리드 전체에 한 번만 위임해서 걸어둠.
  // 이렇게 하면 나중에 낱장 사진이 지연 로딩으로 채워져도(pin-loading → 실제 이미지)
  // 다시 걸어줄 필요가 없음 (레퍼런스 갤러리와 동일한 방식)
  gridEl.addEventListener('click', (e)=>{
    const delBtn = e.target.closest('[data-del]');
    if(delBtn){ e.stopPropagation(); handleGalleryDelete(Number(delBtn.dataset.del)); return; }
    const blurBtn = e.target.closest('[data-blur]');
    if(blurBtn){ e.stopPropagation(); handleGalleryBlurToggle(Number(blurBtn.dataset.blur)); return; }
    const optBtn = e.target.closest('[data-opt-edit]');
    if(optBtn){ e.stopPropagation(); handleGalleryOptEdit(Number(optBtn.dataset.optEdit)); return; }
    const tile = e.target.closest('.pin-item:not(.pin-loading)');
    if(tile) openGalleryViewModal(Number(tile.dataset.idx));
  });

  const addBtn = box.querySelector('#galAddBtn');
  if(addBtn) addBtn.onclick = openGalleryAddModal;
  const optsBtn = box.querySelector('#galOptsBtn');
  if(optsBtn) optsBtn.onclick = ()=> openOptionsManagerModal('sharedGalleryOptions', sharedGalleryOptionsData.options, (options)=>{ sharedGalleryOptionsData = {options}; renderGallery(); });
  // 드래그 순서 변경은 로딩 중인 타일까지 포함해서 한 번만 걸어둠. 타일 엘리먼트 자체는
  // 사진이 나중에 채워져도 같은 노드를 그대로 재사용하기 때문에 다시 걸 필요가 없음
  bindPinDragReorder(
    gridEl, '.pin-item',
    ()=> items.slice(),
    async (arr)=> docRef('gallery').set({items:arr}, {merge:true})
  );
  setupPinGalleryLazyLoad(gridEl, pairs, galleryObserverHolder, '.pin-item.pin-loading',
    (tile, idx, url, it)=> fillGalleryTile(tile, idx, url, it));
}

function openGalleryViewModal(idx){
  const allItems = (galleryData.items || []).map(normalizeGalleryItem);
  // 지금 선택된 옵션 칩에 해당하는 사진들끼리만 라이트박스에서 이전/다음으로 넘어가도록,
  // 원본 배열 인덱스(idxMap)를 따로 들고 필터링된 목록만 넘겨줌
  const idxMap = allItems.map((it,i)=> i).filter(i=> !galleryFilterOpt || (allItems[i].opts||[]).includes(galleryFilterOpt));
  const items = idxMap.map(i=> allItems[i]);
  const startPos = Math.max(0, idxMap.indexOf(idx));
  openImageLightbox({
    items,
    index: startPos,
    resolve: resolveGalleryItemUrl,
    tag: (item)=> item.opts,
    onEditTag: editMode ? (pos)=>{
      const i = idxMap[pos];
      closeModal();
      openItemOptEditModal(items[pos].opts, sharedGalleryOptionsData.options, (opts)=>{
        const arr = (galleryData.items||[]).map(normalizeGalleryItem);
        arr[i] = { ...arr[i], opts };
        if(!galleryFilterOpt) skipNextGalleryRender = true;
        docRef('gallery').set({items:arr}, {merge:true}); // 응답을 기다리지 않고 바로 진행(느려 보이는 원인이었음)
        // openItemOptEditModal이 저장 직후 자기 모달을 닫으므로, 그보다 한 틱 뒤에 다시 열어야
        // 방금 연 라이트박스가 그 closeModal()에 같이 지워지지 않음(네트워크는 더 이상 안 기다림)
        setTimeout(()=> openGalleryViewModal(i), 0);
      });
    } : null,
    onDelete: editMode ? (pos)=>{
      const i = idxMap[pos];
      const arr = (galleryData.items||[]).map(normalizeGalleryItem);
      const [removed] = arr.splice(i,1);
      docRef('gallery').set({items:arr}, {merge:true}); // 응답을 기다리지 않고 바로 진행
      deleteGalleryImageIfChunked(removed);
      // 같은 라이트박스 안에서 연달아 삭제해도 인덱스가 어긋나지 않게, 방금 지운 자리를
      // 빼고 그 뒤 항목들의 원본 인덱스도 하나씩 당겨줌
      idxMap.splice(pos,1);
      for(let k=0;k<idxMap.length;k++){ if(idxMap[k] > i) idxMap[k]--; }
    } : null
  });
}

function openGalleryAddModal(){
  openModal(`
    <h3>사진 추가</h3>
    <label>사진 올리기 (기기에서 여러 장 선택 가능)</label>
    <input type="file" id="galFiles" accept="image/*" multiple>
    <p class="hint">화면에 맞게 자동으로 압축해서 갤러리 맨 앞에 추가돼요. 별도 사이트에 올릴 필요 없어요.</p>
    <label>또는, 이미지 URL 직접 입력</label>
    <input type="url" id="galUrl" placeholder="https://...">
    <label>옵션 (분류, 여러 개 선택 가능)</label>
    <div id="galOptBox">${renderOptionCheckboxes(sharedGalleryOptionsData.options, [])}</div>
    <p class="hint">여러 장을 한 번에 올리면 여기서 고른 옵션이 전부에 적용돼요. 옵션 목록은 "⚙ 옵션 관리"에서 추가할 수 있어요.</p>
    <label style="display:flex;align-items:center;gap:8px;margin-top:12px;">
      <input type="checkbox" id="galBlur" style="width:auto;">
      <span style="font-size:.82rem;color:var(--ink);">썸네일 블러 처리 (눌러야만 원본이 보여요)</span>
    </label>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">추가</button></div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const files = Array.from(m.querySelector('#galFiles').files || []);
      const url = normalizeImageUrl(m.querySelector('#galUrl').value.trim());
      const blur = m.querySelector('#galBlur').checked;
      const opts = getCheckedOptionValues(m.querySelector('#galOptBox'));
      const newItems = [];
      if(files.length){
        saveBtn.disabled = true;
        for(let i=0;i<files.length;i++){
          saveBtn.textContent = `처리 중… (${i+1}/${files.length})`;
          try{
            const dataUrl = await compressImageFile(files[i], 1200, 260000);
            const stored = await storeGalleryImage(dataUrl);
            newItems.push({ ...stored, blur, opts });
          }catch(err){ toast(`"${files[i].name}" 처리 실패: ${err.message || err}`); }
        }
      } else if(url){
        newItems.push({ url, blur, opts });
      } else {
        toast('사진을 선택하거나 URL을 입력해주세요');
        return;
      }
      try{
        const existing = (galleryData.items||[]).map(normalizeGalleryItem);
        await docRef('gallery').set({ items: [...newItems, ...existing] }, {merge:true});
      }catch(err){
        toast(`저장하지 못했어요: ${err.message || err}`);
        saveBtn.disabled = false; saveBtn.textContent = '추가';
        return;
      }
      closeModal();
    };
  });
}

docRef('sharedGalleryOptions').onSnapshot(doc=>{
  sharedGalleryOptionsData = doc.exists ? doc.data() : {options:[]};
  renderGallery(); renderGallery2(); renderRefGallery();
});

/* 예전엔 갤러리마다 옵션 목록을 따로 저장했는데, 그때 만들어둔 옵션이 있으면
   공유 목록이 아직 비어있을 때 한 번만 자동으로 합쳐줌 */
(async function migrateGalleryOptionsToShared(){
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
})();
docRef('gallery').onSnapshot(doc=>{
  galleryData = doc.exists ? doc.data() : {items:[]};
  if(skipNextGalleryRender){ skipNextGalleryRender = false; }
  else { renderGallery(); }
  if(editMode) migrateInlineGalleryImages('gallery', ()=> galleryData.items || []);
});

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


function gallery2TileHtml(it, i){
  if(it.chunked && chunkedImageCache.has(it.fileId)) return gallery2TileMarkup(it, chunkedImageCache.get(it.fileId) || '', i);
  if(!it.chunked) return gallery2TileMarkup(it, it.url, i);
  return `<div class="pin-item-dense pin-loading" data-idx="${i}"><span>불러오는 중…</span></div>`;
}
function gallery2TileMarkup(it, url, i){
  return `
    <div class="pin-item-dense ${it.blur ? 'blurred' : ''}" data-idx="${i}">
      <img src="${escapeHtml(url)}" loading="lazy" decoding="async">
      ${editMode ? `<button class="pin-del-btn" data-del="${i}" title="삭제">✕</button>` : ''}
      ${editMode ? `<button class="pin-blur-btn" data-blur="${i}" title="${it.blur ? '블러 해제' : '블러 처리'}">${it.blur ? '🙈' : '👁'}</button>` : ''}
      ${editMode ? `<button class="pin-opt-btn" data-opt-edit="${i}" title="옵션 지정" style="bottom:4px;right:4px;top:auto;">🏷</button>` : ''}
    </div>`;
}
function fillGallery2Tile(tile, idx, url, it){
  if(!tile.isConnected) return;
  tile.classList.remove('pin-loading');
  tile.innerHTML = `
    <img src="${escapeHtml(url)}" loading="lazy" decoding="async">
    ${editMode ? `<button class="pin-del-btn" data-del="${idx}" title="삭제">✕</button>` : ''}
    ${editMode ? `<button class="pin-blur-btn" data-blur="${idx}" title="${it.blur ? '블러 해제' : '블러 처리'}">${it.blur ? '🙈' : '👁'}</button>` : ''}
    ${editMode ? `<button class="pin-opt-btn" data-opt-edit="${idx}" title="옵션 지정" style="bottom:4px;right:4px;top:auto;">🏷</button>` : ''}
  `;
  if(it.blur) tile.classList.add('blurred');
  attachImgFallback(tile.querySelector('img'));
}
function handleGallery2Delete(idx){
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
    <div class="pin-toolbar">
      <div class="tag-filter" id="gallery2FilterChips" style="display:none;"></div>
      ${editMode ? `<button class="btn small ghost" id="gal2OptsBtn">⚙ 옵션 관리</button>` : ''}
    </div>
    <div class="gallery2-grid" id="gallery2Grid">
      ${colsHtml}
      ${items.length===0 ? `<div class="w-empty">아직 사진이 없어요</div>` : ''}
      ${pairs.length===0 && items.length>0 ? `<div class="w-empty">이 옵션에 해당하는 사진이 없어요</div>` : ''}
    </div>
    ${editMode ? `<button class="gallery-add-fab" id="galAddBtn2" title="사진 추가">＋</button>` : ''}
  `;
  const gridEl = box.querySelector('#gallery2Grid');
  restoreScrollPos(gridEl, savedScroll);
  applyGallery2Overlap(gridEl, pairs.length, colCount);
  renderOptionFilterChips(box.querySelector('#gallery2FilterChips'), sharedGalleryOptionsData.options, gallery2FilterOpt, (opt)=>{ gallery2FilterOpt = opt; renderGallery2(); });
  gridEl.querySelectorAll('.pin-item-dense:not(.pin-loading) img').forEach(attachImgFallback);

  // 열기/삭제/블러/옵션 지정 클릭을 그리드 전체에 한 번만 위임(지연 로딩으로 타일이
  // 나중에 채워져도 다시 걸어줄 필요 없음)
  gridEl.addEventListener('click', (e)=>{
    const delBtn = e.target.closest('[data-del]');
    if(delBtn){ e.stopPropagation(); handleGallery2Delete(Number(delBtn.dataset.del)); return; }
    const blurBtn = e.target.closest('[data-blur]');
    if(blurBtn){ e.stopPropagation(); handleGallery2BlurToggle(Number(blurBtn.dataset.blur)); return; }
    const optBtn = e.target.closest('[data-opt-edit]');
    if(optBtn){ e.stopPropagation(); handleGallery2OptEdit(Number(optBtn.dataset.optEdit)); return; }
    const tile = e.target.closest('.pin-item-dense:not(.pin-loading)');
    if(tile) openGallery2ViewModal(Number(tile.dataset.idx));
  });

  const addBtn = box.querySelector('#galAddBtn2');
  if(addBtn) addBtn.onclick = openGallery2AddModal;
  const optsBtn2 = box.querySelector('#gal2OptsBtn');
  if(optsBtn2) optsBtn2.onclick = ()=> openOptionsManagerModal('sharedGalleryOptions', sharedGalleryOptionsData.options, (options)=>{ sharedGalleryOptionsData = {options}; renderGallery2(); });
  bindPinDragReorder(
    gridEl, '.pin-item-dense',
    ()=> items.slice(),
    async (arr)=> docRef('gallery2').set({items:arr}, {merge:true})
  );
  setupPinGalleryLazyLoad(gridEl, pairs, gallery2ObserverHolder, '.pin-item-dense.pin-loading',
    (tile, idx, url, it)=> fillGallery2Tile(tile, idx, url, it));
}

function openGallery2ViewModal(idx){
  const allItems = (gallery2Data.items || []).map(normalizeGalleryItem);
  // 지금 선택된 옵션 칩에 해당하는 사진들끼리만 라이트박스에서 이전/다음으로 넘어가도록,
  // 원본 배열 인덱스(idxMap)를 따로 들고 필터링된 목록만 넘겨줌
  const idxMap = allItems.map((it,i)=> i).filter(i=> !gallery2FilterOpt || (allItems[i].opts||[]).includes(gallery2FilterOpt));
  const items = idxMap.map(i=> allItems[i]);
  const startPos = Math.max(0, idxMap.indexOf(idx));
  openImageLightbox({
    items,
    index: startPos,
    resolve: resolveGalleryItemUrl,
    tag: (item)=> item.opts,
    onEditTag: editMode ? (pos)=>{
      const i = idxMap[pos];
      closeModal();
      openItemOptEditModal(items[pos].opts, sharedGalleryOptionsData.options, (opts)=>{
        const arr = (gallery2Data.items||[]).map(normalizeGalleryItem);
        arr[i] = { ...arr[i], opts };
        if(!gallery2FilterOpt) skipNextGallery2Render = true;
        docRef('gallery2').set({items:arr}, {merge:true});
        setTimeout(()=> openGallery2ViewModal(i), 0);
      });
    } : null,
    onDelete: editMode ? (pos)=>{
      const i = idxMap[pos];
      const arr = (gallery2Data.items||[]).map(normalizeGalleryItem);
      const [removed] = arr.splice(i,1);
      docRef('gallery2').set({items:arr}, {merge:true});
      deleteGalleryImageIfChunked(removed);
      idxMap.splice(pos,1);
      for(let k=0;k<idxMap.length;k++){ if(idxMap[k] > i) idxMap[k]--; }
    } : null
  });
}

function openGallery2AddModal(){
  openModal(`
    <h3>사진 추가</h3>
    <label>사진 올리기 (기기에서 여러 장 선택 가능)</label>
    <input type="file" id="gal2Files" accept="image/*" multiple>
    <p class="hint">화면에 맞게 자동으로 압축해서 갤러리 맨 앞에 추가돼요. 별도 사이트에 올릴 필요 없어요.</p>
    <label>또는, 이미지 URL 직접 입력</label>
    <input type="url" id="gal2Url" placeholder="https://...">
    <label>옵션 (분류, 여러 개 선택 가능)</label>
    <div id="gal2OptBox">${renderOptionCheckboxes(sharedGalleryOptionsData.options, [])}</div>
    <p class="hint">여러 장을 한 번에 올리면 여기서 고른 옵션이 전부에 적용돼요. 옵션 목록은 "⚙ 옵션 관리"에서 추가할 수 있어요.</p>
    <label style="display:flex;align-items:center;gap:8px;margin-top:12px;">
      <input type="checkbox" id="gal2Blur" style="width:auto;">
      <span style="font-size:.82rem;color:var(--ink);">썸네일 블러 처리 (눌러야만 원본이 보여요)</span>
    </label>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">추가</button></div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const files = Array.from(m.querySelector('#gal2Files').files || []);
      const url = normalizeImageUrl(m.querySelector('#gal2Url').value.trim());
      const blur = m.querySelector('#gal2Blur').checked;
      const opts = getCheckedOptionValues(m.querySelector('#gal2OptBox'));
      const newItems = [];
      if(files.length){
        saveBtn.disabled = true;
        for(let i=0;i<files.length;i++){
          saveBtn.textContent = `처리 중… (${i+1}/${files.length})`;
          try{
            const dataUrl = await compressImageFile(files[i], 1200, 260000);
            const stored = await storeGalleryImage(dataUrl);
            newItems.push({ ...stored, blur, opts });
          }catch(err){ toast(`"${files[i].name}" 처리 실패: ${err.message || err}`); }
        }
      } else if(url){
        newItems.push({ url, blur, opts });
      } else {
        toast('사진을 선택하거나 URL을 입력해주세요');
        return;
      }
      try{
        const existing = (gallery2Data.items||[]).map(normalizeGalleryItem);
        await docRef('gallery2').set({ items: [...newItems, ...existing] }, {merge:true});
      }catch(err){
        toast(`저장하지 못했어요: ${err.message || err}`);
        saveBtn.disabled = false; saveBtn.textContent = '추가';
        return;
      }
      closeModal();
    };
  });
}

docRef('gallery2').onSnapshot(doc=>{
  gallery2Data = doc.exists ? doc.data() : {items:[]};
  if(skipNextGallery2Render){ skipNextGallery2Render = false; }
  else { renderGallery2(); }
  if(editMode) migrateInlineGalleryImages('gallery2', ()=> gallery2Data.items || []);
});

/* ---------------- 6-3. 레퍼런스 갤러리 (캘린더 옆, 완전히 독립된 세 번째 갤러리)
   작고 촘촘한 정사각형 썸네일. 다른 갤러리들과 똑같이 옵션(태그)만 붙일 수 있음 ---------------- */

function normalizeRefGalleryItem(it){
  if(typeof it === 'string') return { url: it, opts: [] };
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
    <div class="pin-toolbar">
      <div class="tag-filter" id="refGalleryFilterChips" style="display:none;"></div>
      ${editMode ? `<button class="btn small ghost" id="refGalOptsBtn">⚙ 옵션 관리</button>` : ''}
    </div>
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

  // 열기/삭제/옵션 지정 클릭을 그리드 전체에 한 번만 위임해서 걸어둠.
  // 이렇게 하면 나중에 낱장 사진이 지연 로딩으로 채워져도(pin-loading → 실제 이미지)
  // 다시 걸어줄 필요가 없음
  gridEl.addEventListener('click', (e)=>{
    const delBtn = e.target.closest('[data-del]');
    if(delBtn){ e.stopPropagation(); handleRefGalleryDelete(Number(delBtn.dataset.del)); return; }
    const optBtn = e.target.closest('[data-opt-edit]');
    if(optBtn){ e.stopPropagation(); handleRefGalleryOptEdit(Number(optBtn.dataset.optEdit)); return; }
    const tile = e.target.closest('.pin-item-dense:not(.pin-loading)');
    if(tile) openRefGalleryViewModal(Number(tile.dataset.idx));
  });

  const addBtn = box.querySelector('#refGalAddBtn');
  if(addBtn) addBtn.onclick = openRefGalleryAddModal;
  const optsBtn = box.querySelector('#refGalOptsBtn');
  if(optsBtn) optsBtn.onclick = ()=> openOptionsManagerModal('sharedGalleryOptions', sharedGalleryOptionsData.options, (options)=>{ sharedGalleryOptionsData = {options}; renderRefGallery(); });

  // 드래그 순서 변경은 로딩 중인 타일까지 포함해서 한 번만 걸어둠. 타일 엘리먼트 자체는
  // 사진이 나중에 채워져도 같은 노드를 그대로 재사용하기 때문에 다시 걸 필요가 없음
  bindPinDragReorder(
    gridEl, '.pin-item-dense',
    ()=> items.slice(),
    async (arr)=> docRef('refgallery').set({items:arr}, {merge:true})
  );

  setupRefGalleryLazyLoad(gridEl, pairs);
}

/* 이미 이번 세션에서 한 번 불러와 캐시된 사진(또는 애초에 다운로드가 필요 없는 외부 URL)은
   바로 표시하고, 아직 안 불러온 청크 사진만 빈 플레이스홀더로 그림 — 실제 로딩은
   setupRefGalleryLazyLoad가 화면 근처로 스크롤됐을 때 시작함 */
function renderRefGalleryTileHtml(it, i){
  if(it.chunked && chunkedImageCache.has(it.fileId)) return refGalleryTileMarkup(chunkedImageCache.get(it.fileId) || '', i);
  if(!it.chunked) return refGalleryTileMarkup(it.url, i);
  return `<div class="pin-item-dense pin-loading" data-idx="${i}"><span>...</span></div>`;
}

function refGalleryTileMarkup(url, i){
  return `
    <div class="pin-item-dense" data-idx="${i}">
      <img src="${escapeHtml(url)}" loading="lazy" decoding="async">
      ${editMode ? `<button class="pin-del-btn" data-del="${i}" title="삭제">✕</button>` : ''}
      ${editMode ? `<button class="pin-opt-btn" data-opt-edit="${i}" title="옵션 지정" style="top:4px;right:4px;">🏷</button>` : ''}
    </div>`;
}

/* 지연 로딩 자체는 setupPinGalleryLazyLoad(공용 함수, 갤러리/갤러리2와 공유)가 처리함 */
let refGalleryObserverHolder = { current: null };
function setupRefGalleryLazyLoad(gridEl, pairs){
  setupPinGalleryLazyLoad(gridEl, pairs, refGalleryObserverHolder, '.pin-item-dense.pin-loading',
    (tile, idx, url)=> fillRefGalleryTile(tile, idx, url));
}

function fillRefGalleryTile(tile, idx, url){
  if(!tile.isConnected) return; // 그사이 그리드가 다시 그려져서 이 타일이 이미 화면에서 빠졌으면 무시
  tile.classList.remove('pin-loading');
  tile.innerHTML = `
    <img src="${escapeHtml(url)}" loading="lazy" decoding="async">
    ${editMode ? `<button class="pin-del-btn" data-del="${idx}" title="삭제">✕</button>` : ''}
    ${editMode ? `<button class="pin-opt-btn" data-opt-edit="${idx}" title="옵션 지정" style="top:4px;right:4px;">🏷</button>` : ''}
  `;
  attachImgFallback(tile.querySelector('img'));
}

function handleRefGalleryDelete(idx){
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
  const allItems = (refGalleryData.items || []).map(normalizeRefGalleryItem);
  // 지금 선택된 옵션 칩에 해당하는 사진들끼리만 라이트박스에서 이전/다음으로 넘어가도록,
  // 원본 배열 인덱스(idxMap)를 따로 들고 필터링된 목록만 넘겨줌
  const idxMap = allItems.map((it,i)=> i).filter(i=> !refGalleryFilterOpt || (allItems[i].opts||[]).includes(refGalleryFilterOpt));
  const items = idxMap.map(i=> allItems[i]);
  const startPos = Math.max(0, idxMap.indexOf(idx));
  openImageLightbox({
    items,
    index: startPos,
    resolve: resolveGalleryItemUrl,
    tag: (item)=> item.opts,
    onEditTag: editMode ? (pos)=>{
      const i = idxMap[pos];
      closeModal();
      openItemOptEditModal(items[pos].opts, sharedGalleryOptionsData.options, (opts)=>{
        const arr = (refGalleryData.items||[]).map(normalizeRefGalleryItem);
        arr[i] = { ...arr[i], opts };
        // 필터가 꺼져 있으면 태그만 바꿔선 화면에 보이는 사진 구성이 안 바뀌므로 재렌더링 생략
        if(!refGalleryFilterOpt) skipNextRefGalleryRender = true;
        docRef('refgallery').set({items:arr}, {merge:true}); // 응답을 기다리지 않고 바로 진행
        setTimeout(()=> openRefGalleryViewModal(i), 0);
      });
    } : null,
    onDelete: editMode ? (pos)=>{
      const i = idxMap[pos];
      const arr = (refGalleryData.items||[]).map(normalizeRefGalleryItem);
      const [removed] = arr.splice(i,1);
      docRef('refgallery').set({items:arr}, {merge:true}); // 응답을 기다리지 않고 바로 진행
      deleteGalleryImageIfChunked(removed);
      idxMap.splice(pos,1);
      for(let k=0;k<idxMap.length;k++){ if(idxMap[k] > i) idxMap[k]--; }
    } : null
  });
}

function openRefGalleryAddModal(){
  openModal(`
    <h3>레퍼런스 사진 추가</h3>
    <label>사진 올리기 (기기에서 여러 장 선택 가능)</label>
    <input type="file" id="refGalFiles" accept="image/*" multiple>
    <p class="hint">화면에 맞게 자동으로 압축해서 맨 앞에 추가돼요. 별도 사이트에 올릴 필요 없어요.</p>
    <label>또는, 이미지 URL 직접 입력</label>
    <input type="url" id="refGalUrl" placeholder="https://...">
    <label>옵션 (분류, 여러 개 선택 가능)</label>
    <div id="refGalOptBox">${renderOptionCheckboxes(sharedGalleryOptionsData.options, [])}</div>
    <p class="hint">여러 장을 한 번에 올리면 여기서 고른 옵션이 전부에 적용돼요. 옵션 목록은 "⚙ 옵션 관리"에서 추가할 수 있어요.</p>
    <div class="modal-actions"><button class="btn ghost" id="c">취소</button><button class="btn primary" id="s">추가</button></div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const files = Array.from(m.querySelector('#refGalFiles').files || []);
      const url = normalizeImageUrl(m.querySelector('#refGalUrl').value.trim());
      const opts = getCheckedOptionValues(m.querySelector('#refGalOptBox'));
      const newItems = [];
      if(files.length){
        saveBtn.disabled = true;
        for(let i=0;i<files.length;i++){
          saveBtn.textContent = `처리 중… (${i+1}/${files.length})`;
          try{
            const dataUrl = await compressImageFile(files[i], 1200, 260000);
            const stored = await storeGalleryImage(dataUrl);
            newItems.push({ ...stored, opts });
          }catch(err){ toast(`"${files[i].name}" 처리 실패: ${err.message || err}`); }
        }
      } else if(url){
        newItems.push({ url, opts });
      } else {
        toast('사진을 선택하거나 URL을 입력해주세요');
        return;
      }
      try{
        const existing = (refGalleryData.items||[]).map(normalizeRefGalleryItem);
        await docRef('refgallery').set({ items: [...newItems, ...existing] }, {merge:true});
      }catch(err){
        toast(`저장하지 못했어요: ${err.message || err}`);
        saveBtn.disabled = false; saveBtn.textContent = '추가';
        return;
      }
      closeModal();
    };
  });
}

docRef('refgallery').onSnapshot(doc=>{
  refGalleryData = doc.exists ? doc.data() : {items:[]};
  // 데이터는 항상 최신으로 갱신하되, 태그만 바뀐 경우엔 무거운 전체 그리드 재렌더링을 건너뜀
  if(skipNextRefGalleryRender){ skipNextRefGalleryRender = false; }
  else { renderRefGallery(); }
  if(editMode) migrateInlineGalleryImages('refgallery', ()=> refGalleryData.items || []);
});

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
        ${editMode ? `<button class="video-del" data-del="${i}" type="button">✕</button>` : ''}
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
    <p class="hint">유튜브 링크를 넣으면 목록에 추가돼요.</p>
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

docRef('videos').onSnapshot(doc=>{
  videosData = doc.exists ? doc.data() : {items:[]};
  renderVideos();
});

/* ---------------- 6-1. 문서 정리 (갤러리와 세션카드 사이) ---------------- */

let docsData = { cards: [] };
let docOptionsData = { options: [] };
let docFilterOpt = null;
const DOC_FILE_MAX_BYTES = 650000; // 이 크기까지는 카드 문서 안에 바로 저장(가장 빠름)
const DOC_FILE_CHUNKED_MAX_BYTES = 8 * 1024 * 1024; // 이보다 크면 여러 문서로 나눠 저장(파이어스토리지 없이 8MB까지)

function renderDocs(){
  const list = document.getElementById('docList');
  const allCards = docsData.cards || [];
  renderOptionFilterChips(document.getElementById('docFilter'), docOptionsData.options, docFilterOpt, (opt)=>{ docFilterOpt = opt; renderDocs(); });
  // 새로 추가한 문서가 배열 맨 뒤에 붙는 구조라, 화면에는 최신 문서가 위로 오도록 뒤집어서 보여줌
  const pairs = allCards.map((c,i)=>({c,i})).filter(({c})=> !docFilterOpt || (c.opts||(c.opt?[c.opt]:[])).includes(docFilterOpt)).reverse();
  list.innerHTML = pairs.map(({c,i})=> `
    <div class="doc-row" data-idx="${i}">
      <span class="doc-icon">${escapeHtml(c.icon || '📄')}</span>
      <div class="doc-main">
        <div class="doc-title">${escapeHtml(c.title)}</div>
        ${(c.opts||(c.opt?[c.opt]:[])).length ? `<div class="doc-opt-row">${(c.opts||(c.opt?[c.opt]:[])).map(o=> `<span class="doc-opt">${escapeHtml(o)}</span>`).join('')}</div>` : ''}
        ${c.desc ? `<div class="doc-desc">${escapeHtml(c.desc)}</div>` : ''}
      </div>
      ${editMode ? `<button class="doc-edit" data-edit="${i}">✎</button>` : ''}
      ${editMode ? `<button class="doc-del" data-del="${i}">✕</button>` : ''}
    </div>
  `).join('') || `<div class="w-empty">${docFilterOpt ? '이 옵션에 해당하는 문서가 없어요' : '정리된 문서가 없어요'}</div>`;

  list.querySelectorAll('.doc-row').forEach(row=> row.addEventListener('click', async (e)=>{
    if(e.target.closest('[data-edit]') || e.target.closest('[data-del]')) return;
    const idx = Number(row.dataset.idx);
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
    const arr = [...docsData.cards]; arr.splice(idx,1);
    await docRef('documents').set({cards:arr}, {merge:true});
    if(removed && removed.chunked) deleteFileChunked(removed.fileId, removed.chunkTotal).catch(()=>{});
  }));

  const wrap = document.getElementById('docAddWrap');
  wrap.innerHTML = editMode ? `<div class="doc-add-row"><button class="btn small doc-add" id="docAddBtn">+ 문서 추가</button><button class="btn small ghost" id="docOptsBtn">⚙ 옵션 관리</button></div>` : '';
  const addBtn = document.getElementById('docAddBtn');
  if(addBtn) addBtn.onclick = openDocAddModal;
  const optsBtn = document.getElementById('docOptsBtn');
  if(optsBtn) optsBtn.onclick = openDocOptionsModal;
}

function openDocAddModal(){
  openModal(`
    <h3>문서 추가</h3>
    <label>아이콘(이모지, 선택)</label><input type="text" id="dcIcon" placeholder="📄" maxlength="2">
    <label>제목</label><input type="text" id="dcTitle" placeholder="예: 설정집, 규칙 정리">
    <label>설명 (선택)</label><input type="text" id="dcDesc" placeholder="한 줄 설명">
    <label>옵션 (부제, 여러 개 선택 가능)</label>
    <div id="dcOptBox">${renderOptionCheckboxes(docOptionsData.options, [])}</div>
    <p class="hint">옵션 목록은 아래쪽 "⚙ 옵션 관리"에서 직접 추가/수정할 수 있어요.</p>
    <div class="radio-row">
      <label><input type="radio" name="doc-src" value="link" checked> 링크로 연결</label>
      <label><input type="radio" name="doc-src" value="file"> 파일 올리기</label>
    </div>
    <div id="dcLinkWrap">
      <label>문서 링크 (구글드라이브 공유 링크 등)</label><input type="url" id="dcLink" placeholder="https://drive.google.com/...">
    </div>
    <div id="dcFileWrap" style="display:none">
      <label>파일 선택</label><input type="file" id="dcFile">
      <p class="hint">약 ${Math.round(DOC_FILE_CHUNKED_MAX_BYTES/1024/1024)}MB까지 파이어스토리지 없이 바로 올릴 수 있어요. 그보다 크면 "링크로 연결"을 이용해주세요. (용량이 크면 저장/열기에 몇 초 더 걸릴 수 있어요)</p>
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
    <p class="hint">현재 연결: ${currentDesc}. 그대로 두거나 아래에서 바꿀 수 있어요.</p>
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
      <p class="hint">약 ${Math.round(DOC_FILE_CHUNKED_MAX_BYTES/1024/1024)}MB까지 가능해요.</p>
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

function renderSessions(){
  const grid = document.getElementById('sessionGrid');
  const cards = sessionsData.cards || [];
  grid.innerHTML = cards.map((c,i)=> `
    <div class="session-card" data-idx="${i}" title="${escapeHtml(c.title||'')}">
      ${c.thumb ? `<img src="${escapeHtml(c.thumb)}" alt="${escapeHtml(c.title||'')}">` : `<div class="session-noimg">📄</div>`}
      ${editMode ? `<button class="edit" data-edit="${i}">✎</button>` : ''}
      ${editMode ? `<button class="del" data-del="${i}">✕</button>` : ''}
    </div>
  `).join('') || `<div class="w-empty" style="grid-column:1/-1">등록된 자료가 없어요</div>`;

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
    const arr = [...sessionsData.cards]; arr.splice(idx,1);
    await docRef('sessions').set({cards:arr}, {merge:true});
    if(removed && removed.chunked) deleteFileChunked(removed.fileId, removed.chunkTotal).catch(()=>{});
  }));

  const wrap = document.getElementById('sessionAddWrap');
  wrap.innerHTML = editMode ? `<button class="btn small session-add" id="sessAddBtn">+ 자료 추가</button>` : '';
  const addBtn = document.getElementById('sessAddBtn');
  if(addBtn) addBtn.onclick = openSessionAddModal;
}

function openSessionAddModal(){
  openModal(`
    <h3>자료 추가</h3>
    <label>썸네일 이미지 (사진 한 장)</label>
    <input type="file" id="sThumbFile" accept="image/*">
    <p class="hint">화면에 맞게 자동으로 압축해서 저장돼요. 카드에는 이 사진만 보여요.</p>
    <label>제목 (선택 — 마우스를 올리면 보여요)</label><input type="text" id="sTitle" placeholder="예: 1화 - 첫 만남">
    <div class="radio-row">
      <label><input type="radio" name="pdf-src" value="none" checked> 연결 안 함</label>
      <label><input type="radio" name="pdf-src" value="file"> PDF 파일 올리기</label>
      <label><input type="radio" name="pdf-src" value="link"> 링크로 연결</label>
    </div>
    <div id="pdfFileWrap" style="display:none">
      <label>PDF 파일</label><input type="file" id="sPdfFile" accept="application/pdf">
      <p class="hint">약 ${Math.round(SESSION_PDF_CHUNKED_MAX_BYTES/1024/1024)}MB까지 파이어스토리지 없이 바로 올릴 수 있어요. 그보다 크면 오른쪽 "링크로 연결"을 골라서 구글드라이브 공유 링크를 붙여넣어주세요. (용량이 크면 저장/열기에 몇 초 더 걸릴 수 있어요)</p>
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
    <p class="hint">현재 연결된 자료: ${pdfStatus}. 그대로 두거나 아래에서 바꿀 수 있어요.</p>
    <div class="radio-row">
      <label><input type="radio" name="pdf-src-e" value="keep" checked> 그대로 유지</label>
      <label><input type="radio" name="pdf-src-e" value="file"> PDF 파일로 바꾸기</label>
      <label><input type="radio" name="pdf-src-e" value="link"> 링크로 바꾸기</label>
    </div>
    <div id="pdfFileWrapE" style="display:none">
      <label>PDF 파일</label><input type="file" id="sPdfFileE" accept="application/pdf">
      <p class="hint">약 ${Math.round(SESSION_PDF_CHUNKED_MAX_BYTES/1024/1024)}MB까지 가능해요.</p>
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

function renderChecklist(){
  const body = document.getElementById('checklistBody');
  const all = (checklistData.items || []).map((it,i)=>({...it, _i:i}));
  const unchecked = all.filter(it=> !it.checked);
  const checked = all.filter(it=> it.checked);

  function row(it){
    const subtitle = it.subtitle || '';
    return `
      <div class="check-item ${it.checked?'checked':''}" data-idx="${it._i}">
        <input type="checkbox" ${it.checked?'checked':''} ${editMode?'':'disabled'}>
        <div class="check-item-main">
          <span class="check-item-text ${it.link ? 'has-link' : ''}" ${it.link ? `data-linkopen="${it._i}" title="${escapeHtml(it.link)}"` : ''}>${escapeHtml(it.text)}</span>
          ${(subtitle || editMode) ? `<span class="check-item-subtitle ${editMode ? 'editable' : ''} ${!subtitle ? 'empty-hint' : ''}" ${editMode ? `data-subedit="${it._i}"` : ''}>${subtitle ? escapeHtml(subtitle) : (editMode ? '+ 부제목 추가' : '')}</span>` : ''}
        </div>
        ${editMode ? `<button class="check-link-edit" data-linkedit="${it._i}" title="${it.link ? '링크 수정/삭제' : '링크 추가'}">${it.link ? '✎' : '🔗+'}</button>` : ''}
        ${editMode ? `<button class="del">✕</button>` : ''}
      </div>
    `;
  }

  // 할 일/완료를 위아래로 쌓아 가로선으로 나누던 것에서, 좌우로 나란히 두고
  // 세로선으로 구분하는 2단 레이아웃으로 바꿈
  if(!unchecked.length && !checked.length){
    body.innerHTML = `<div class="w-empty">등록된 항목이 없어요</div>`;
  } else if(unchecked.length && checked.length){
    body.innerHTML =
      `<div class="check-col">${unchecked.map(row).join('')}</div>` +
      `<div class="check-divider"></div>` +
      `<div class="check-col">${checked.map(row).join('')}</div>`;
  } else {
    body.innerHTML = `<div class="check-col check-col-full">${(unchecked.map(row).join('') || checked.map(row).join(''))}</div>`;
  }

  body.querySelectorAll('.check-item').forEach(el=>{
    const idx = Number(el.dataset.idx);
    const cb = el.querySelector('input[type=checkbox]');
    cb.addEventListener('change', async ()=>{
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
    const subEdit = el.querySelector('[data-subedit]');
    if(subEdit) subEdit.addEventListener('click', (e)=>{ e.stopPropagation(); openChecklistItemSubtitleModal(idx); });
    const del = el.querySelector('.del');
    if(del) del.addEventListener('click', async ()=>{
      const arr = [...checklistData.items]; arr.splice(idx,1);
      await docRef('checklist').set({items:arr}, {merge:true});
    });
    const linkEdit = el.querySelector('[data-linkedit]');
    if(linkEdit) linkEdit.addEventListener('click', ()=> openChecklistLinkModal(idx));
  });

  const wrap = document.getElementById('checklistAddWrap');
  wrap.innerHTML = `<input type="text" id="checkNewInput" placeholder="새 항목"><button class="btn small primary" id="checkAddBtn">추가</button>`;
  const addBtn = document.getElementById('checkAddBtn');
  const input = document.getElementById('checkNewInput');
  const submit = async ()=>{
    const text = input.value.trim();
    if(!text) return;
    await docRef('checklist').set({ items: [...(checklistData.items||[]), {text, checked:false}] }, {merge:true});
    input.value = '';
  };
  addBtn.onclick = submit;
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
}

docRef('checklist').onSnapshot(doc=>{ checklistData = doc.exists ? doc.data() : {items:[]}; renderChecklist(); });

function openChecklistItemSubtitleModal(idx){
  const cur = (checklistData.items||[])[idx];
  if(!cur) return;
  const subtitle = cur.subtitle || '';
  openModal(`
    <h3>항목 부제목</h3>
    <label>부제목 (선택 — 항목 아래에 작게 표시돼요)</label>
    <input type="text" id="checkItemSubInput" value="${escapeHtml(subtitle)}" placeholder="예: 8월 말까지">
    <div class="modal-actions">
      ${subtitle ? `<button class="btn danger" id="d" type="button">지우기</button>` : ''}
      <button class="btn ghost" id="c">취소</button>
      <button class="btn primary" id="s">저장</button>
    </div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    const delBtn = m.querySelector('#d');
    if(delBtn) delBtn.onclick = async ()=>{
      const arr = [...checklistData.items];
      arr[idx] = { ...arr[idx], subtitle:'' };
      await docRef('checklist').set({items:arr}, {merge:true});
      closeModal();
    };
    m.querySelector('#s').onclick = async ()=>{
      const saveBtn = m.querySelector('#s');
      const subtitle = m.querySelector('#checkItemSubInput').value.trim();
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중…';
      try{
        const arr = [...checklistData.items];
        arr[idx] = { ...arr[idx], subtitle };
        await docRef('checklist').set({items:arr}, {merge:true});
      }catch(err){
        toast('저장하지 못했어요');
        saveBtn.disabled = false; saveBtn.textContent = '저장';
        return;
      }
      closeModal();
    };
  });
}

function openChecklistLinkModal(idx){
  const cur = (checklistData.items||[])[idx];
  if(!cur) return;
  openModal(`
    <h3>항목 링크</h3>
    <label>연결할 링크 (구글드라이브 공유 링크 등)</label>
    <input type="url" id="ckLink" placeholder="https://..." value="${escapeHtml(cur.link||'')}">
    <div class="modal-actions">
      ${cur.link ? `<button class="btn danger" id="rm">링크 삭제</button>` : ''}
      <button class="btn ghost" id="c">취소</button>
      <button class="btn primary" id="s">저장</button>
    </div>
  `, m=>{
    m.querySelector('#c').onclick = closeModal;
    if(m.querySelector('#rm')) m.querySelector('#rm').onclick = async ()=>{
      const arr = [...checklistData.items];
      arr[idx] = { ...arr[idx], link: '' };
      await docRef('checklist').set({items:arr}, {merge:true});
      closeModal();
    };
    m.querySelector('#s').onclick = async ()=>{
      const link = m.querySelector('#ckLink').value.trim();
      const arr = [...checklistData.items];
      arr[idx] = { ...arr[idx], link };
      await docRef('checklist').set({items:arr}, {merge:true});
      closeModal();
    };
  });
}

/* ---------------- row-2(캘린더+세션 / 문서+체크리스트) 높이 맞추기 ----------------
   캘린더는 이전달·이번달·다음달이 세로로 이어져서 표시되고, 요일 칸이
   정사각형(aspect-ratio)이라 폭에 따라 세로 높이가 자동으로 달라짐. 그래서
   캘린더를 기준으로 삼아 나머지 위젯들의 높이를 캘린더의 실제 렌더링 높이에
   맞춰줌(모두 이미 내부 스크롤 처리가 되어 있어서, 높이가 줄어들면 안에서
   스크롤됨). 세션 위젯은 캘린더 옆(나란히)이라 캘린더와 같은 높이를 그대로
   가지고, 문서·체크리스트 위젯은 캘린더 아래로 쌓여 있으므로 둘을 합친 높이가
   캘린더 높이와 같아지도록 나눠 가짐(문서 위젯이 더 크게). 900px 이하(row-2가
   1열로 쌓이는 모바일 레이아웃)에서는 보정을 끄고 각자 자연스러운 높이로 둠. */
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
    const checklistH = Math.max(120, Math.round((h - gap) * 0.35));
    const docsH = h - gap - checklistH;
    docsCard.style.height = docsH + 'px';
    checklistCard.style.height = checklistH + 'px';
  }
}
function initRow2HeightSync(){
  const cal = document.getElementById('cardCalendar');
  if(!cal) return;
  if(typeof ResizeObserver !== 'undefined'){
    new ResizeObserver(()=> syncRow2Height()).observe(cal);
  }
  window.addEventListener('resize', syncRow2Height);
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
  if(prevBtn) prevBtn.addEventListener('click', ()=> goTo(currentIdx() - 1));
  if(nextBtn) nextBtn.addEventListener('click', ()=> goTo(currentIdx() + 1));

  // 스와이프/스크롤로 탭이 넘어갔을 때 활성 점/화살표 상태도 같이 맞춰줌
  let scrollTimer = null;
  viewport.addEventListener('scroll', ()=>{
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(()=>{
      const idx = Math.round(viewport.scrollLeft / viewport.clientWidth);
      setActive(idx);
    }, 80);
  });

  // 화면 크기가 바뀌어도(예: 회전) 현재 보고 있던 탭 위치를 그대로 유지
  window.addEventListener('resize', ()=> goTo(currentIdx(), false));

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

function ensureStickerEl(slot){
  if(stickerEls[slot]) return stickerEls[slot];
  const root = document.createElement('div');
  root.className = 'site-sticker';
  root.innerHTML = `
    <div class="sticker-bubble" id="stickerBubble${slot}"><span class="sticker-bubble-text"></span></div>
    <div class="sticker-avatar" id="stickerAvatar${slot}"></div>
  `;
  document.body.appendChild(root);
  const avatarEl = root.querySelector('.sticker-avatar');
  const bubbleEl = root.querySelector('.sticker-bubble');
  const bubbleTextEl = root.querySelector('.sticker-bubble-text');

  // 기본 위치(저장된 값이 없을 때): 배너 좌상단 쪽에 두 스티커가 가깝게 모여있게.
  // 배너 높이가 항상 560px 고정이라, 뷰포트 비율이 아니라 배너 기준 픽셀로 계산함
  // (화면이 배너보다 낮으면 화면 안에 들어오도록 보정).
  const bannerBottom = Math.min(560, window.innerHeight - 20);
  const saved = (stickerPosData.positions||{})[slot];
  if(saved){
    applyStickerFrac(root, saved.x, saved.y);
  } else {
    // 앵커(왼쪽 위 기준점)는 멧돼지(slot 0) 자리로 두고, 사슴(slot 1)은 그보다
    // 오른쪽 아래로 떨어진 자리에 둠 — 프로필 위젯의 좌우 순서(멧돼지=왼쪽)를
    // 그대로 지키면서, 멧돼지가 사슴보다 위에 오도록. 말풍선은 스티커 위쪽으로
    // 떠오르므로 배너 맨 위에서 말풍선이 잘리지 않도록 위쪽 여백(topClearance)을
    // 충분히 두고, 왼쪽도 화면 끝에 바짝 붙지 않도록 여백(leftMargin)을 넉넉히 둬서
    // 좀 더 중앙 쪽으로 오게 함. 말풍선 너비를 좁혀둔 만큼 가로 간격(hGap)만으로도
    // 말풍선끼리 안 겹치게 하고, 세로 간격(vGap)은 캐릭터 키 차이가 너무 크지
    // 않도록 작게 유지함.
    // 모든 값은 STICKER_W(데스크탑 기준 160px)가 아니라 실제로 렌더링된 스티커
    // 크기(root.offsetWidth)에 비례해서 계산함 — 화면이 좁아지면 미디어쿼리로
    // 스티커 자체가 92px까지 작아지는데, 간격을 고정 px로 두면 스티커는 작아지는데
    // 둘 사이 거리는 그대로라 오히려 서로 멀어져 보이는 문제가 있었음.
    const actualW = root.offsetWidth || STICKER_W;
    const scale = actualW / STICKER_W;
    const leftMargin = 64 * scale, topClearance = 92 * scale, hGap = (STICKER_W - 42) * scale, vGap = 36 * scale;
    const anchorLeft = leftMargin;
    const anchorTop = topClearance;
    const defaultLeft = slot === 1 ? anchorLeft + hGap : anchorLeft;
    const defaultTop = slot === 1 ? anchorTop + vGap : anchorTop;
    root.style.left = defaultLeft + 'px';
    root.style.top = defaultTop + 'px';
    stickerClamp(root);
  }

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

  // 화면 크기가 바뀌면(회전 등) 비율 기준으로 다시 위치 맞춤
  window.addEventListener('resize', debounce(()=>{
    const {x,y,maxX,maxY} = stickerClamp(root);
    applyStickerFrac(root, maxX? x/maxX : 0, maxY? y/maxY : 0);
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
  });
  if(!stickerBothScheduleStarted && people.length){
    stickerBothScheduleStarted = true;
    // 접속/새로고침한 순간엔 70~150초짜리 랜덤 스케줄을 기다리지 않고 바로 한 번
    // 말풍선을 띄워서, 처음 들어왔을 때도 스티커가 있다는 걸 바로 알 수 있게 함
    Object.keys(stickerEls).forEach(slot=> showStickerBubble(Number(slot)));
    scheduleBothStickerBubbles();
  }
}

docRef('stickers').onSnapshot(doc=>{ stickerPosData = doc.exists ? doc.data() : { positions:{} }; renderStickers(); });

/* ---------------- 초기화 ---------------- */

refreshLockUI();
initRow2HeightSync();
initBoardTabs();
