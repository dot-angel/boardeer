/* =========================================================
   자캐커플 갠홈 — style.css
   컨셉: "다이어리 방안지 위에 핀으로 고정한 스크랩북 카드"
   ========================================================= */

@import url('https://fonts.googleapis.com/css2?family=Song+Myung&family=Noto+Serif+KR:wght@400;500;700&family=Noto+Sans+KR:wght@300;400;500&family=JetBrains+Mono:wght@400;600&display=swap');

:root{
  /* ---- 검붉은 팔레트 (사용자가 위젯별로 덮어쓸 수 있음) ---- */
  --paper: #140b0c;
  --dot: #331519;
  --ink: #ece1d8;
  --ink-soft: #a8877e;
  --rose: #9c1c30;
  --sage: #7a2f36;
  --gold: #c6a15b;
  --gold-soft: #8a7145;
  --card-bg: #1f1112;
  --card-bg2: #281618;
  --card-border: #4a2a2a;
  --shadow: 0 10px 26px rgba(0,0,0,0.6);
  --shadow-press: 0 3px 10px rgba(0,0,0,0.65);

  --font-display: 'Song Myung', 'Noto Serif KR', serif;
  --font-body: 'Noto Sans KR', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  --radius: 4px;
}

*{ box-sizing: border-box; }

html,body{
  margin:0; padding:0; min-height:100%;
}

body{
  font-family: var(--font-body);
  color: var(--ink);
  background-color: var(--paper);
  /* 방안지 도트 패턴 */
  background-image: radial-gradient(var(--dot) 1.1px, transparent 1.1px);
  background-size: 22px 22px;
  background-attachment: fixed;
  min-height: 100vh;
  padding-bottom: 80px;
}

/* ---------- 상단 헤더 / 잠금 컨트롤 ---------- */
.site-topbar{
  position: sticky; top:0; z-index: 50;
  display:flex; align-items:center; justify-content:space-between;
  padding: 10px 22px;
  background: rgba(26,14,16,0.85);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid var(--gold-soft);
}
.site-topbar .site-name{
  font-family: var(--font-display);
  font-size: 1.15rem;
  letter-spacing: .03em;
}
.topbar-actions{ display:flex; gap:8px; align-items:center; }

.btn{
  font-family: var(--font-body);
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  color: var(--ink);
  padding: 7px 14px;
  border-radius: 2px;
  cursor: pointer;
  font-size: .85rem;
  transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
  box-shadow: var(--shadow);
}
.btn:hover{ background: var(--card-bg2); }
.btn:active{ transform: translateY(3px); box-shadow: var(--shadow-press); }
.btn.primary{ background: var(--rose); color:#fff; border-color: var(--rose); }
.btn.ghost{ background: transparent; box-shadow:none; }
.btn.small{ padding: 4px 10px; font-size: .75rem; }
.btn.danger{ background: var(--card-bg); color:#ff8b8b; border-color:#6b2a2a; }

.lock-badge{
  font-size: .75rem;
  padding: 4px 10px;
  border-radius: 2px;
  display:flex; align-items:center; gap:6px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
}
.lock-badge.unlocked{ border-color: var(--gold); color: var(--gold); }

/* ---------- 대시보드 그리드 ---------- */
.dashboard{
  max-width: 1280px;
  margin: 26px auto;
  padding: 0 22px;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: 8px;
  grid-auto-flow: dense;
  gap: 20px;
}

.widget{
  grid-column: span 4;
  position: relative;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  transition: transform .18s ease, box-shadow .18s ease;
  display:flex; flex-direction:column;
}
.widget[data-span="4"]{ grid-column: span 4; }
.widget[data-span="6"]{ grid-column: span 6; }
.widget[data-span="8"]{ grid-column: span 8; }
.widget[data-span="12"]{ grid-column: span 12; }

.widget:hover{ transform: translateY(-3px); box-shadow: 0 14px 30px rgba(0,0,0,0.6); border-color: var(--gold-soft); z-index: 2; }

@media (max-width: 980px){
  .widget, .widget[data-span]{ grid-column: 1 / -1; grid-row: auto !important; }
  .dashboard{ grid-auto-rows: auto; }
}

/* 클릭 애니메이션: 살짝 눌리는 느낌 */
.widget:active{ transform: translateY(4px); box-shadow: var(--shadow-press); }
.widget.pressed{ transform: translateY(4px); box-shadow: var(--shadow-press); }

/* 위젯 배경 사진 (선택) */
.widget.has-bg .widget-bg{
  position:absolute; inset:0;
  background-size: cover; background-position:center;
  opacity: .28;
  z-index:0;
}
.widget.has-bg .widget-body,
.widget.has-bg .widget-header{ position:relative; z-index:1; }

/* 모서리 금장 브래킷 — 동양 액자를 연상시키는 시그니처 요소 */
.widget::before, .widget::after{
  content:"";
  position:absolute; width:14px; height:14px;
  border-color: var(--gold);
  border-style: solid;
  opacity:.65;
  z-index:3;
  pointer-events:none;
  transition: opacity .18s ease, border-color .18s ease;
}
.widget::before{ top:9px; left:9px; border-width:1px 0 0 1px; }
.widget::after{ bottom:9px; right:9px; border-width:0 1px 1px 0; }
.widget:hover::before, .widget:hover::after{ opacity: 1; }

.widget-header{
  display:flex; align-items:center; justify-content:space-between;
  padding: 18px 16px 8px 16px;
}
.widget-title{
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 400;
  letter-spacing: .02em;
  outline: none;
  border-radius: 2px;
  padding: 2px 4px;
}
.widget-title[contenteditable="true"]:hover{ background: rgba(255,255,255,0.07); cursor: text; }

.widget-tools{ display:flex; gap:4px; opacity:0; transition:opacity .15s; }
.widget:hover .widget-tools{ opacity:1; }
.edit-mode .widget-tools{ opacity: .55; }
.edit-mode .widget:hover .widget-tools{ opacity:1; }

.icon-btn{
  width: 26px; height:26px;
  border-radius: 50%;
  border: 1px solid var(--card-border);
  background: var(--card-bg2);
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; font-size:.75rem;
  transition: transform .15s;
}
.icon-btn:active{ transform: translateY(2px); }

.widget-body{
  padding: 8px 16px 18px 16px;
  flex:1;
  display:flex; flex-direction:column;
  gap:10px;
}

/* ---------- 배너 ---------- */
.widget.type-banner{ min-height: 220px; }
.widget.type-banner .widget-header{ justify-content:center; padding-top:34px; }
.widget.type-banner .widget-title{ font-size: 2rem; }
.widget.type-banner .widget-body{ justify-content:center; align-items:center; text-align:center; }
.banner-sub{ color: var(--ink-soft); font-size: .95rem; }

/* ---------- 디데이 ---------- */
.dday-item{
  display:flex; align-items:baseline; justify-content:space-between;
  border-bottom: 1px solid var(--card-border);
  padding: 6px 0;
}
.dday-label{ font-size:.9rem; }
.dday-count{ font-family: var(--font-mono); font-weight:600; color: var(--rose); }

/* ---------- 캘린더 ---------- */
.cal-head{ display:flex; align-items:center; justify-content:space-between; }
.cal-grid{ display:grid; grid-template-columns: repeat(7,1fr); gap:3px; font-size:.72rem; }
.cal-dow{ text-align:center; color:var(--ink-soft); padding-bottom:4px; }
.cal-day{
  aspect-ratio: 1/1; display:flex; align-items:center; justify-content:center;
  border-radius: 2px; cursor:pointer; position:relative;
  border: 1px solid transparent;
}
.cal-day.today{ border-color: var(--rose); font-weight:700; }
.cal-day.has-event::after{
  content:""; position:absolute; bottom:3px; width:4px; height:4px; border-radius:50%;
  background: var(--gold);
}
.cal-day.empty{ visibility:hidden; }
.cal-day:hover{ background: rgba(255,255,255,0.06); }

/* ---------- 갤러리 ---------- */
.gallery-grid{ display:grid; grid-template-columns: repeat(3,1fr); gap:6px; }
.gallery-grid img{
  width:100%; aspect-ratio:1/1; object-fit:cover; border-radius:2px; cursor:pointer;
  border: 1px solid var(--card-border);
  transition: transform .15s;
}
.gallery-grid img:hover{ transform: scale(1.03); }
.gallery-add{
  aspect-ratio:1/1; border-radius:2px; border:1px dashed var(--card-border);
  display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--ink-soft);
}

/* ---------- 외부 링크 임베드 ---------- */
.embed-frame-wrap{ border-radius:2px; overflow:hidden; border:1px solid var(--card-border); background: var(--card-bg2); }
.embed-frame-wrap iframe{ width:100%; height: 280px; border:0; display:block; }
.embed-fallback{ padding: 14px; font-size:.82rem; color: var(--ink-soft); text-align:center; }

/* ---------- 백업 탭 (커스텀 카드 컨테이너) ---------- */
.backup-cards{ display:flex; flex-direction:column; gap:8px; }
.backup-card{
  display:flex; align-items:center; gap:10px;
  border: 1px solid var(--card-border); border-radius: 2px; padding: 8px 10px;
  background: var(--card-bg2);
}
.backup-card .bc-icon{ font-size:1.2rem; }
.backup-card .bc-main{ flex:1; min-width:0; }
.backup-card .bc-title{ font-weight:600; font-size:.88rem; }
.backup-card .bc-desc{ font-size:.75rem; color:var(--ink-soft); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.backup-card a.bc-link{ font-size:.78rem; color: var(--rose); text-decoration:none; }

/* ---------- 음악 플레이어 ---------- */
.player-track{
  display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:2px; cursor:pointer;
  font-size:.85rem;
}
.player-track.active{ background: rgba(201,123,132,0.12); font-weight:600; }
.player-controls{ display:flex; align-items:center; gap:10px; justify-content:center; padding: 6px 0; }
.player-controls button{
  border:none; background:var(--rose); color:#fff; width:34px; height:34px; border-radius:50%;
  cursor:pointer; font-size:.9rem;
}
.player-now{ text-align:center; font-size:.8rem; color:var(--ink-soft); }

/* ---------- 썰 / 커미션 리스트 ---------- */
.story-entry, .commission-card{
  border: 1px solid var(--card-border); border-radius:2px; padding:10px; background: var(--card-bg2);
}
.story-entry h4, .commission-card h4{ margin:0 0 4px 0; font-family: var(--font-display); font-size:.95rem; }
.story-entry .meta, .commission-card .meta{ font-size:.72rem; color:var(--ink-soft); margin-bottom:4px; }
.story-entry .content{ font-size:.85rem; line-height:1.5; white-space:pre-wrap; }
.commission-card img{ width:100%; border-radius:2px; margin-bottom:6px; }

/* ---------- 위젯 추가 바 ---------- */
.add-widget-bar{
  max-width:1280px; margin: 10px auto 40px; padding: 0 22px;
  display:flex; gap:8px; flex-wrap:wrap;
}

/* ---------- 모달 ---------- */
.modal-overlay{
  position: fixed; inset:0; background: rgba(58,53,50,0.45);
  display:flex; align-items:center; justify-content:center; z-index: 200;
  animation: fadeIn .15s ease;
}
@keyframes fadeIn{ from{opacity:0} to{opacity:1} }
.modal{
  background: var(--paper);
  border-radius: 3px;
  padding: 22px;
  width: min(420px, 90vw);
  max-height: 85vh; overflow:auto;
  box-shadow: 0 12px 30px rgba(0,0,0,.25);
  animation: popIn .18s ease;
}
@keyframes popIn{ from{ transform: translateY(10px); opacity:0 } to{ transform: translateY(0); opacity:1 } }
.modal h3{ font-family: var(--font-display); margin-top:0; }
.modal label{ display:block; font-size:.8rem; color:var(--ink-soft); margin: 10px 0 4px; }
.modal input[type=text], .modal input[type=password], .modal input[type=date],
.modal input[type=url], .modal input[type=number], .modal textarea, .modal select,
.modal input[type=file]{
  width:100%; padding:8px 10px; border-radius:2px; border:1px solid var(--card-border);
  font-family: var(--font-body); font-size:.85rem; background: var(--card-bg2); color: var(--ink);
}
.modal textarea{ min-height:90px; resize:vertical; }
.modal .row{ display:flex; gap:8px; }
.modal .row > *{ flex:1; }
.modal-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }
.modal input[type=color]{ width:44px; height:32px; padding:0; border:1px solid var(--card-border); border-radius:2px; }

.color-row{ display:flex; align-items:center; gap:8px; }
.color-row span{ font-size:.78rem; color:var(--ink-soft); }

.empty-hint{ font-size:.78rem; color:var(--ink-soft); text-align:center; padding: 14px 0; }

.toast{
  position: fixed; bottom: 20px; left:50%; transform: translateX(-50%);
  background: var(--ink); color:#fff; padding: 10px 18px; border-radius: 2px;
  font-size:.82rem; z-index: 300; animation: fadeIn .15s ease;
}
