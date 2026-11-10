const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const state = {query:'stars:>1000', sort:'stars', page:1, items:[], filtered:[], language:'all', view:'grid', mode:'discover', bookmarks:[], history:[], chart:null, busy:false};
const fmt = n => Intl.NumberFormat('en',{notation:n>=10000?'compact':'standard',maximumFractionDigits:1}).format(n||0);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ago = date => {const d=Math.max(0,Date.now()-new Date(date).getTime());const days=Math.floor(d/86400000);return days===0?'today':days===1?'1d ago':days<30?`${days}d ago`:days<365?`${Math.floor(days/30)}mo ago`:`${Math.floor(days/365)}y ago`};
const langColors = ['#c49aaa','#95647e','#76516b','#d0b0b5','#a77c8e','#6e5367','#b48b9b','#8c6b7c'];
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2600)}
function setBusy(b){state.busy=b;$('#loadMoreBtn').disabled=b;$('#loadMoreBtn').textContent=b?'Loading…':'Load more repositories ↓'}
async function fetchRepos(reset=true){
 if(state.busy)return;
 if(reset){state.page=1;state.items=[]}
 setBusy(true);
 if(reset)$('#repoGrid').innerHTML='<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';
 try{
  const params=new URLSearchParams({q:state.query,sort:state.sort,order:'desc',page:state.page,per_page:24});
  const res=await fetch('/api/search?'+params);const data=await res.json();
  if(!res.ok)throw new Error(data.error||'Search failed');
  state.total=data.total_count||0;state.items=reset?data.items:[...state.items,...data.items];
  if(reset)fetch('/api/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:state.query})}).catch(()=>{});
  applyFilters();updateStats();renderRepos();renderChart();
  $('#resultsTitle').textContent=state.mode==='bookmarks'?'Your bookmarks':'Trending repositories';
  $('#resultsSubtitle').textContent=`${fmt(state.total)} matching repositories · live GitHub data`;
  $('#loadMoreBtn').style.display=state.items.length>=state.total?'none':'inline-block';
 }catch(e){if(reset)$('#repoGrid').innerHTML=`<div class="empty-state"><div class="empty-icon">⌁</div><h3>Connection interrupted</h3><p>${esc(e.message)} Check your connection and try again.</p></div>`;toast(e.message)}
 finally{setBusy(false);$('#resultCount').textContent=`${state.items.length} LOADED`;}
}
function applyFilters(){
 const source=state.mode==='bookmarks'?state.bookmarks.map(b=>b.snapshot).filter(Boolean):state.items;
 state.filtered=source.filter(r=>state.language==='all'||r.language===state.language);
}
function updateStats(){
 const list=state.items;const stars=list.reduce((s,r)=>s+(r.stargazers_count||0),0);const langs=new Set(list.map(r=>r.language).filter(Boolean));
 animateValue($('#totalRepos'),state.total);animateValue($('#totalStars'),stars,true);animateValue($('#languageCount'),langs.size);animateValue($('#averageStars'),list.length?Math.round(stars/list.length):0,true);
}
function animateValue(el,value,compact=false){const start=Number(el.dataset.value||0),end=value;el.dataset.value=end;const duration=550;const t0=performance.now();function step(t){const p=Math.min(1,(t-t0)/duration);const eased=1-Math.pow(1-p,3);const n=Math.round(start+(end-start)*eased);el.textContent=compact?fmt(n):fmt(n);if(p<1)requestAnimationFrame(step)}requestAnimationFrame(step)}
function renderRepos(){
 const grid=$('#repoGrid');grid.classList.toggle('list-mode',state.view==='list');
 if(!state.filtered.length){grid.innerHTML=`<div class="empty-state"><div class="empty-icon">◇</div><h3>${state.mode==='bookmarks'?'Nothing saved just yet':'No repositories found'}</h3><p>${state.mode==='bookmarks'?'Bookmark repositories to keep them close.':'Try a broader query or another language filter.'}</p></div>`;return}
 grid.innerHTML=state.filtered.map((r,i)=>{const saved=state.bookmarks.some(b=>b.full_name===r.full_name);return `<article class="repo-card" data-full="${esc(r.full_name)}" style="animation-delay:${Math.min(i,10)*.035}s">
  <div class="repo-top"><img class="owner-avatar" src="${esc(r.owner?.avatar_url||'')}" alt="" loading="lazy"><div style="min-width:0"><div class="repo-owner">${esc(r.owner?.login||'')}</div><div class="repo-name">${esc(r.name)}</div></div><button class="bookmark-btn ${saved?'saved':''}" data-bookmark="${esc(r.full_name)}" aria-label="${saved?'Remove bookmark':'Bookmark repository'}" title="${saved?'Remove bookmark':'Bookmark'}">${saved?'◆':'◇'}</button></div>
  <p class="repo-desc">${esc(r.description||'No description has been provided for this repository.')}</p>
  <div class="topic-row">${(r.topics||[]).slice(0,3).map(t=>`<span class="topic">${esc(t)}</span>`).join('')}</div>
  <div class="repo-bottom"><span><i class="lang-dot"></i>${esc(r.language||'Other')}</span><span>✧ ${fmt(r.stargazers_count)}</span><span>⑂ ${fmt(r.forks_count)}</span><span class="repo-updated">${ago(r.updated_at)}</span></div>
 </article>`}).join('');
}
function renderChart(){
 const counts={};state.items.forEach(r=>{const l=r.language||'Other';counts[l]=(counts[l]||0)+1});
 const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,7);$('#chartTotal').textContent=state.items.length;
 $('#languageLegend').innerHTML=entries.slice(0,6).map(([name,count],i)=>`<div class="legend-item"><i class="legend-dot" style="background:${langColors[i%langColors.length]}"></i><span>${esc(name)} · ${count}</span></div>`).join('')||'<span class="legend-item">No language data yet</span>';
 if(!window.Chart)return;
 if(state.chart)state.chart.destroy();
 const ctx=$('#languageChart').getContext('2d');
 state.chart=new Chart(ctx,{type:'doughnut',data:{labels:entries.map(e=>e[0]),datasets:[{data:entries.map(e=>e[1]),backgroundColor:entries.map((_,i)=>langColors[i%langColors.length]),borderColor:'#21101B',borderWidth:3,hoverOffset:5}]},options:{responsive:true,maintainAspectRatio:false,cutout:'76%',plugins:{legend:{display:false},tooltip:{backgroundColor:'#241521',borderColor:'#81566c',borderWidth:1,titleColor:'#f5edf1',bodyColor:'#c4b2bc',padding:10,displayColors:true}}}});
}
async function openRepo(full){
 const [owner,repo]=full.split('/');const modal=$('#modalBackdrop');modal.classList.add('open');modal.setAttribute('aria-hidden','false');$('#modalContent').innerHTML='<div class="modal-loading">Gathering repository intelligence…</div>';
 try{
  const [rRes,lRes]=await Promise.all([fetch(`/api/repository/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`),fetch(`/api/languages/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)]);
  const r=await rRes.json(),langs=await lRes.json();if(!rRes.ok)throw new Error(r.error||'Could not load details');
  const saved=state.bookmarks.some(b=>b.full_name===r.full_name);
  const langEntries=Object.entries(langs).sort((a,b)=>b[1]-a[1]);const total=langEntries.reduce((s,x)=>s+x[1],0);
  $('#modalContent').innerHTML=`<div class="modal-head"><img src="${esc(r.owner.avatar_url)}" alt=""><div><h2 id="modalTitle">${esc(r.full_name)}</h2><p>${esc(r.owner.login)} · ${r.private?'Private':'Public'} repository</p></div></div>
   <p class="modal-description">${esc(r.description||'No description has been provided for this repository.')}</p>
   <div class="modal-metrics"><div class="modal-metric"><strong>✧ ${fmt(r.stargazers_count)}</strong><span>STARS</span></div><div class="modal-metric"><strong>⑂ ${fmt(r.forks_count)}</strong><span>FORKS</span></div><div class="modal-metric"><strong>${fmt(r.open_issues_count)}</strong><span>OPEN ISSUES</span></div><div class="modal-metric"><strong>${r.watchers_count}</strong><span>WATCHERS</span></div></div>
   <div class="modal-section"><h3>Topics</h3><div class="modal-tags">${(r.topics||[]).map(t=>`<span class="topic">${esc(t)}</span>`).join('')||'<span class="repo-owner">No topics added</span>'}</div></div>
   <div class="modal-section"><h3>Language composition</h3><div class="modal-tags">${langEntries.length?langEntries.map(([name,bytes])=>`<span class="topic">${esc(name)} · ${total?Math.round(bytes/total*100):0}%</span>`).join(''):'<span class="repo-owner">No language data available</span>'}</div></div>
   <div class="modal-section"><h3>Repository activity</h3><p class="repo-owner">Created ${new Date(r.created_at).toLocaleDateString()} · Updated ${new Date(r.updated_at).toLocaleDateString()} · Default branch: ${esc(r.default_branch)}</p></div>
   <button class="search-submit" id="modalBookmark" style="margin-top:18px">${saved?'◆ Saved to bookmarks':'◇ Save repository'}</button> <a class="modal-link" href="${esc(r.html_url)}" target="_blank" rel="noopener noreferrer">Open on GitHub ↗</a>`;
  $('#modalBookmark').addEventListener('click',()=>toggleBookmark(r));
 }catch(e){$('#modalContent').innerHTML=`<div class="modal-loading">${esc(e.message)}</div>`}
}
async function toggleBookmark(repo){
 const idx=state.bookmarks.findIndex(b=>b.full_name===repo.full_name);
 try{
  if(idx>=0){const res=await fetch('/api/bookmarks/'+encodeURIComponent(repo.full_name),{method:'DELETE'});if(!res.ok)throw new Error('Could not remove bookmark');state.bookmarks.splice(idx,1);toast('Removed from your bookmarks')}
  else{const res=await fetch('/api/bookmarks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repository:repo})});if(!res.ok)throw new Error('Could not save bookmark');state.bookmarks.unshift({full_name:repo.full_name,snapshot:repo});toast('Saved to your account')}
  $('#bookmarkCount').textContent=state.bookmarks.length;
  if(state.mode==='bookmarks'){applyFilters();renderRepos()}
  else{const btn=$(`[data-bookmark="${CSS.escape(repo.full_name)}"]`);if(btn){btn.classList.toggle('saved',idx<0);btn.textContent=idx<0?'◆':'◇'}}
  const modalBtn=$('#modalBookmark');if(modalBtn)modalBtn.textContent=idx<0?'◆ Saved to bookmarks':'◇ Save repository';
 }catch(e){toast(e.message)}
}
async function loadHistory(){
 const res=await fetch('/api/history');if(!res.ok)throw new Error('Could not load search history');state.history=await res.json();
 state.mode='history';$('#resultsTitle').textContent='Your search history';$('#resultsSubtitle').textContent='Recent searches saved to your personal workspace.';$('#loadMoreBtn').style.display='none';
 const grid=$('#repoGrid');grid.classList.remove('list-mode');
 if(!state.history.length){grid.innerHTML='<div class="empty-state"><div class="empty-icon">◷</div><h3>No searches yet</h3><p>Your searches will appear here as you explore GitHub.</p></div>';return}
 grid.innerHTML=`<div class="history-toolbar"><span>${state.history.length} RECENT SEARCHES</span><button id="clearHistoryBtn" class="load-more">Clear history</button></div>`+state.history.map((item,i)=>`<button class="history-item" data-history-query="${esc(item.query)}"><span class="history-icon">⌕</span><span><strong>${esc(item.query)}</strong><small>${new Date(item.searched_at+' UTC').toLocaleString()}</small></span><span class="history-arrow">↗</span></button>`).join('');
 $('#clearHistoryBtn').addEventListener('click',async()=>{await fetch('/api/history',{method:'DELETE'});state.history=[];loadHistory();toast('Search history cleared')});
 $$('.history-item').forEach(b=>b.addEventListener('click',()=>runQuery(b.dataset.historyQuery)));
}
async function loadProfile(){
 const [meRes,bmRes]=await Promise.all([fetch('/api/me'),fetch('/api/bookmarks')]);
 if(!meRes.ok){location.href='/login';return}
 const me=await meRes.json();state.bookmarks=await bmRes.json();
 const initials=(me.name||'GX').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
 $('#profileName').textContent=me.name+'’s workspace';$('#profileEmail').textContent=me.email;$('#profileAvatar').textContent=initials;$('#topAvatar').textContent=initials;$('#bookmarkCount').textContent=state.bookmarks.length;
}

function runQuery(q){state.query=q;state.mode='discover';state.language='all';$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view==='discover'));$$('.filter-tab').forEach(b=>b.classList.toggle('active',b.dataset.language==='all'));$('#searchInput').value=q;$('#breadcrumbCurrent').textContent='Discover';fetchRepos(true)}
$('#searchForm').addEventListener('submit',e=>{e.preventDefault();const q=$('#searchInput').value.trim();if(q)runQuery(q)});
$('#sortSelect').addEventListener('change',e=>{state.sort=e.target.value;fetchRepos(true)});
$('#refreshBtn').addEventListener('click',()=>fetchRepos(true));
$('#loadMoreBtn').addEventListener('click',()=>{state.page++;fetchRepos(false)});
$$('.query-chip').forEach(b=>b.addEventListener('click',()=>runQuery(b.dataset.fill)));
$$('.quick-filter').forEach(b=>b.addEventListener('click',()=>runQuery(b.dataset.query)));
$$('.spotlight-action').forEach(b=>b.addEventListener('click',()=>runQuery(b.dataset.topic)));
$$('.filter-tab').forEach(b=>b.addEventListener('click',()=>{$$('.filter-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.language=b.dataset.language;applyFilters();renderRepos()}));
$$('.nav-item').forEach(b=>b.addEventListener('click',async()=>{state.mode=b.dataset.view;$$('.nav-item').forEach(x=>x.classList.toggle('active',x===b));$('#breadcrumbCurrent').textContent=b.textContent.trim();if(state.mode==='bookmarks'){applyFilters();renderRepos();$('#resultsTitle').textContent='Your bookmarks';$('#resultsSubtitle').textContent='The repositories you chose to keep close.';$('#resultCount').textContent=`${state.filtered.length} SAVED`;$('#loadMoreBtn').style.display='none'}else if(state.mode==='history'){try{await loadHistory()}catch(e){toast(e.message)}}else{fetchRepos(true)}$('#sidebar').classList.remove('open')}));
$('#repoGrid').addEventListener('click',e=>{const bookmark=e.target.closest('[data-bookmark]');if(bookmark){e.stopPropagation();const repo=state.items.find(r=>r.full_name===bookmark.dataset.bookmark)||state.bookmarks.find(b=>b.full_name===bookmark.dataset.bookmark)?.snapshot;if(repo)toggleBookmark(repo);return}const card=e.target.closest('.repo-card');if(card)openRepo(card.dataset.full)});
$('#modalClose').addEventListener('click',closeModal);$('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
function closeModal(){$('#modalBackdrop').classList.remove('open');$('#modalBackdrop').setAttribute('aria-hidden','true')}
$('#listViewBtn').addEventListener('click',()=>{state.view=state.view==='grid'?'list':'grid';$('#listViewBtn').classList.toggle('selected',state.view==='list');$('.view-btn').classList.toggle('selected',state.view==='grid');renderRepos()});
$('#mobileMenu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
loadProfile().then(()=>fetchRepos(true)).catch(()=>{location.href='/login'});
