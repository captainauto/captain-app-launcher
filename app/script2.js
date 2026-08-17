
  /**
   * 자재단가 신규/갱신 팝업 — 2026-07-24부터 매입처/브랜드/타입/공급가/세액/금액을 전부 이 화면에서
   * 입력받는다(예전엔 이름+단가만 받고 매입처를 "미분류"로 자동 태그해서 나중에 관리자가 일일이
   * 정리해야 했음). 장부에서 이미 입력한 매입처(m.buyer)/결제구분(m.priceType)이 있으면 그대로 프리필한다.
   */
  function openPriceModal(customs, onDone) {
    priceModalCallback = onDone;
    const body = document.getElementById('priceModalBody');
    body.innerHTML = customs.map((m, i) => {
      const payType = m.priceType === 'cash' ? 'cash' : 'vat';
      // 장부에서 넘어오는 단가(m.price)는 항상 부가세 제외(공급가)다. 예전엔 부가세 포함 금액으로
      // 보고 ÷1.1로 역산했는데, 그러면 30,000을 넣어도 27,273/2,727로 쪼개져 실제보다 낮은 원가가
      // 자재단가에 저장됐다. 이제 입력값을 그대로 공급가로 쓰고 세액·금액을 얹는 방향으로만 계산한다.
      const supply = Number(m.price) || 0;
      const tax = payType === 'cash' ? '' : Math.round(supply * 0.1);
      const amount = payType === 'cash' ? '' : (supply + Math.round(supply * 0.1));
      return `<div style="padding:8px 0;border-bottom:1px solid var(--border);">
         <label style="display:flex;align-items:center;gap:8px;">
           <input type="checkbox" id="pm_chk_${i}" checked style="width:auto;" />
           <span style="flex:1;font-weight:600;">${escapeHtml_(m.name)}</span>
         </label>
         <div class="row" style="margin-top:4px;flex-wrap:wrap;">
           <input id="pm_buyer_${i}" placeholder="매입처" value="${escapeHtml_(m.buyer||'')}" style="flex:1;min-width:90px;" />
           <input id="pm_brand_${i}" placeholder="브랜드(선택)" style="flex:1;min-width:90px;" />
           <input id="pm_type_${i}" placeholder="타입(선택)" style="flex:1;min-width:90px;" />
         </div>
         <div class="row" style="margin-top:4px;flex-wrap:wrap;">
           <select id="pm_payType_${i}" style="flex:1;min-width:100px;" onchange="pmPayTypeChange_(${i})">
             <option value="vat" ${payType === 'vat' ? 'selected' : ''}>세금계산서</option>
             <option value="cash" ${payType === 'cash' ? 'selected' : ''}>현금가</option>
           </select>
           <input id="pm_supply_${i}" type="number" placeholder="공급가(부가세 제외)" value="${supply||''}" style="flex:1;min-width:90px;" oninput="pmSupplyChange_(${i})" />
           <input id="pm_tax_${i}" type="number" placeholder="세액" value="${tax}" style="flex:1;min-width:90px;" ${payType === 'cash' ? 'disabled' : ''} />
           <input id="pm_amount_${i}" type="number" placeholder="금액(부가세포함)" value="${amount}" style="flex:1;min-width:100px;" ${payType === 'cash' ? 'disabled' : ''} />
         </div>
       </div>`;
    }).join('');
    body.dataset.count = customs.length;
    body.dataset.names = JSON.stringify(customs.map(m => m.name));
    document.getElementById('priceModal').classList.remove('hidden');
  }

  function pmPayTypeChange_(i) {
    const payType = document.getElementById('pm_payType_' + i).value;
    const taxEl = document.getElementById('pm_tax_' + i);
    const amtEl = document.getElementById('pm_amount_' + i);
    if (payType === 'cash') {
      taxEl.value = ''; taxEl.disabled = true;
      amtEl.value = ''; amtEl.disabled = true;
    } else {
      taxEl.disabled = false; amtEl.disabled = false;
      pmSupplyChange_(i);
    }
  }

  function pmSupplyChange_(i) {
    if (document.getElementById('pm_payType_' + i).value === 'cash') return;
    const supply = Number(document.getElementById('pm_supply_' + i).value) || 0;
    const tax = Math.round(supply * 0.1);
    document.getElementById('pm_tax_' + i).value = tax;
    document.getElementById('pm_amount_' + i).value = supply + tax;
  }

  function confirmPriceModal() {
    const body = document.getElementById('priceModalBody');
    const count = Number(body.dataset.count);
    const names = JSON.parse(body.dataset.names);
    const items = [];
    for (let i = 0; i < count; i++) {
      if (!document.getElementById('pm_chk_' + i).checked) continue;
      const buyer = document.getElementById('pm_buyer_' + i).value.trim();
      if (!buyer) { toast('"' + names[i] + '"의 매입처를 입력하세요'); return; }
      const payType = document.getElementById('pm_payType_' + i).value;
      items.push({
        name: names[i],
        buyer: buyer,
        brand: document.getElementById('pm_brand_' + i).value.trim(),
        type: document.getElementById('pm_type_' + i).value.trim(),
        supply: document.getElementById('pm_supply_' + i).value,
        tax: payType === 'cash' ? '' : document.getElementById('pm_tax_' + i).value,
        amount: payType === 'cash' ? '' : document.getElementById('pm_amount_' + i).value
      });
    }
    // 콜백을 꺼내면서 바로 비운다 — 창을 닫기 전에 이미 큐에 들어간 두 번째 클릭이 뒤늦게 실행돼도
    // 저장(finalize)이 두 번 돌지 않게 하기 위함. 여기가 중복 기록이 생기던 경로 중 하나였다.
    const done = priceModalCallback;
    priceModalCallback = null;
    document.getElementById('priceModal').classList.add('hidden');
    if (items.length) {
      RUN()
        .withSuccessHandler(function () { toast(items.length + '건 자재단가 추가됨'); if (done) done(); })
        .withFailureHandler(function () { if (done) done(); })
        .addPriceBatch(items, currentUser.name);
    } else {
      if (done) done();
    }
  }

  function skipPriceModal() {
    const done = priceModalCallback;
    priceModalCallback = null; // confirmPriceModal과 같은 이유(두 번 눌림 방지)
    document.getElementById('priceModal').classList.add('hidden');
    if (done) done();
  }

  /**
   * 오늘이 속한 달을 'yyyy-MM'으로. 월 필터 기본값·"이번달" 판정에 쓴다.
   *
   * new Date().toISOString().slice(0,7) 을 쓰면 안 된다 — toISOString은 UTC라서 한국(UTC+9)에서는
   * 매달 1일 오전 9시 이전에 지난달이 나온다(예: 9월 1일 오전 8시 -> '2026-08').
   * 그 시간대에 앱을 열면 월 필터가 지난달로 잡히고, 월정산 확정도 지난달로 나갈 수 있었다.
   * (2026-08-17 발견)
   */
  function currentMonthStr_() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  // 좁은 화면에서 목차가 가로 스크롤될 때, 누른 탭이 화면 밖이면 가운데로 끌어온다.
  // scrollIntoView는 페이지까지 세로로 움직여버려서 목차 안에서만 scrollLeft를 직접 계산한다.
  function scrollTabIntoView_(btn) {
    if (!btn) return;
    const bar = btn.parentElement;
    if (!bar || bar.scrollWidth <= bar.clientWidth + 1) return; // 줄바꿈 모드(넓은 화면)면 아무것도 안 함
    const b = bar.getBoundingClientRect(), t = btn.getBoundingClientRect();
    const left = bar.scrollLeft + (t.left - b.left) - (b.width - t.width) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }

  let myRecentCache = [];
  function showEmpTab(tab) {
    scrollTabIntoView_(document.getElementById('empTabBtn-' + tab));
    ['input','incentive','unpaid','search','album','changelog'].forEach(t => {
      const panel = document.getElementById('empTab-' + t);
      const btn = document.getElementById('empTabBtn-' + t);
      if (panel) panel.classList.toggle('hidden', t !== tab);
      if (btn) btn.classList.toggle('active', t !== tab ? false : true);
    });
    if (tab === 'incentive') {
      const mEl = document.getElementById('empIncMonth');
      if (mEl && !mEl.value) {
        const now = new Date();
        mEl.value = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
      }
      loadMyIncentives();
    }
    if (tab === 'unpaid') loadMyUnpaid();
    if (tab === 'search') loadEmpRecentWeek();
    if (tab === 'album') initAlbumTab();
    if (tab === 'changelog') renderChangelogTab();
  }

  let empSearchCache = [];
  let empRecentCache = [];
  let admSearchCache = [];

  function dateBandBg_(rows) {
    let last = null, band = 0;
    return rows.map(function (r) {
      const d = fmtDate(r.date);
      if (d !== last) { band = band ? 0 : 1; last = d; }
      return band ? '#eef4fb' : '';
    });
  }

  function updateAgentOptions_(selectId, rows) {
    const full = agentListCache.map(function (a) { return { agent: a }; });
    msfUpdateOptions_(selectId, rows.concat(full), 'agent', '전체 출장자');
  }

  function filterByAgent_(rows, selectId) {
    return msfFilter_(rows, selectId, 'agent');
  }

  function filterByPayType_(rows, selectId) {
    return msfFilter_(rows, selectId, 'payType');
  }

  /** 출처(source) 필터용 select 옵션을 실제 데이터에 있는 값들로 채운다 (엑셀 필터처럼) */
  function updateSourceOptions_(selectId, rows) {
    const full = sourceCache.map(function (s) { return { source: s }; });
    msfUpdateOptions_(selectId, rows.concat(full), 'source', '전체 출처');
  }

  function filterBySource_(rows, selectId) {
    return msfFilter_(rows, selectId, 'source');
  }

  function loadEmpRecentWeek() {
    const body = document.getElementById('empRecentWeekBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="8" class="muted" style="padding:12px;">불러오는 중...</td></tr>';
    RUN()
      .withSuccessHandler(function (rows) {
        empRecentCache = Array.isArray(rows) ? rows : [];
        updateAgentOptions_('empAgentFilter', empRecentCache);
        updateSourceOptions_('empSourceFilter', empRecentCache);
        renderEmpRecentWeek_();
      })
      .withFailureHandler(function (e) {
        body.innerHTML = '<tr><td colspan="8" class="muted" style="padding:12px;">불러오기 실패: ' + e.message + '</td></tr>';
      })
      .getRecentLedgerEntriesForEmployee(7);
  }

  function renderEmpRecentWeek_() {
    const body = document.getElementById('empRecentWeekBody');
    if (!body) return;
    const list = filterBySource_(filterByPayType_(filterByAgent_(empRecentCache, 'empAgentFilter'), 'empPayFilter'), 'empSourceFilter');
    if (!list.length) { body.innerHTML = '<tr><td colspan="8" class="muted" style="padding:12px;">해당 기록이 없습니다.</td></tr>'; return; }
    const rows = list.slice().reverse();
    const bands = dateBandBg_(rows);
    body.innerHTML = rows.map((r, i) => `
      <tr onclick='editRowInForm(${jsonAttr_(r)})' style="cursor:pointer;background:${bands[i]};">
        <td style="white-space:nowrap;">${fmtDate(r.date)}</td>${truncTd_(r.address, 200)}${truncTd_(r.content, 200)}
        <td style="white-space:nowrap;background:#EAD1DC;">${fmtMoney(r.amount)}</td><td style="background:#B7E1CD;">${escapeHtml_(r.agent)}</td><td>${payTypeShort_(r.payType)}</td><td>${escapeHtml_(r.source||'')}</td>
        <td>
          <span class="badge">수정</span>
          ${r.docLink ? `<a href="https://drive.google.com/file/d/${r.docLink.fileId}/view" target="_blank" onclick="event.stopPropagation()">📄</a>` : ''}
          ${r.mediaCount ? `<a href="#" onclick="event.stopPropagation();event.preventDefault();openMediaModal(${r.rowIndex})">📷${r.mediaCount}</a>` : ''}
        </td>
      </tr>`).join('');
  }

  function applyEmpAgentFilter() {
    renderEmpRecentWeek_();
    renderEmpSearch_();
  }

  function loadMyIncentives() {
    const ym = document.getElementById('empIncMonth').value;
    const body = document.getElementById('empIncBody');
    if (body) body.innerHTML = '<tr><td colspan="6" class="muted" style="padding:12px;">불러오는 중...</td></tr>';
    RUN()
      .withSuccessHandler(function (rows) {
        const list = Array.isArray(rows) ? rows : [];
        const total = list.reduce((s,r) => s + (Number(r.incentive)||0), 0);
        document.getElementById('empIncTotal').innerHTML =
          '이 달 인센티브 합계: <strong style="color:#8b5cf6;">' + fmtMoney(total) + '</strong> (' + list.length + '건)';
        if (!list.length) { body.innerHTML = '<tr><td colspan="6" class="muted" style="padding:12px;">이 달 인센티브 받은 건이 없습니다.</td></tr>'; return; }
        body.innerHTML = list.map(r => `
          <tr>
            <td>${escapeHtml_(r.date)}</td><td>${escapeHtml_(r.address||'')}</td><td>${escapeHtml_(r.content||'')}</td>
            <td>${fmtMoney(r.subtitle)}</td>
            <td>${(r.incentiveRate===''||r.incentiveRate==null)?'':Math.round(Number(r.incentiveRate)*100)+'%'}</td>
            <td style="color:#8b5cf6;">${fmtMoney(r.incentive)}</td>
          </tr>`).join('');
      })
      .withFailureHandler(e => { if(body) body.innerHTML = '<tr><td colspan="6" class="muted">오류: '+e.message+'</td></tr>'; })
      .getMyIncentives(currentUser.name, ym);
  }

  /**
   * 직원용 미수금 — 본인 출장건만 열람. 어느 이름으로 거를지는 서버가 세션에서 꺼내 정하므로
   * 여기서 이름을 넘기지 않는다(넘겨봐야 서버가 안 본다).
   * 관리자 표와 달리 행 클릭(수정)·완료 버튼이 없다 — 일부러 뺀 것이니 다시 붙이지 말 것.
   */
  function loadMyUnpaid() {
    const body = document.getElementById('empUnpaidBody');
    const totalEl = document.getElementById('empUnpaidTotal');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="11" class="muted" style="padding:12px;">불러오는 중...</td></tr>';
    if (totalEl) totalEl.textContent = '';
    RUN()
      .withSuccessHandler(function (d) {
        const list = (d && Array.isArray(d.unpaid)) ? d.unpaid : [];
        if (totalEl) {
          totalEl.innerHTML = list.length
            ? '미수금 합계: <strong style="color:#ef4444;">' + fmtMoney(d.unpaidTotal) + '</strong> (' + d.unpaidCount + '건)'
            : '';
        }
        if (!list.length) {
          body.innerHTML = '<tr><td colspan="11" class="muted" style="text-align:center;padding:12px;">입금 미확인 건이 없습니다 👍</td></tr>';
          return;
        }
        const bands = dateBandBg_(list);
        // 장부 A~K열 순서 그대로. 금액(연분홍)·출장자(연초록)는 스프레드시트와 같은 색을 쓴다.
        body.innerHTML = list.map((u, i) => `
          <tr style="background:${bands[i]};">
            <td style="white-space:nowrap;">${escapeHtml_(u.date)}</td>
            <td style="white-space:nowrap;">${escapeHtml_(u.weekday||'')}</td>
            ${truncTd_(u.address||'', 170)}${truncTd_(u.content||'', 170)}
            <td style="white-space:nowrap;background:#EAD1DC;">${fmtMoney(u.amount)}</td>
            <td style="white-space:nowrap;">${(u.subtitle===''||u.subtitle==null)?'':fmtMoney(u.subtitle)}</td>
            <td style="background:#B7E1CD;">${escapeHtml_(u.agent||'')}</td>
            <td>${payTypeShort_(u.payType)}</td>
            <td>${escapeHtml_(u.confirmed||'')}</td>
            ${truncTd_(u.note||'', 120)}
            <td>${escapeHtml_(u.source||'')}</td>
          </tr>`).join('');
      })
      .withFailureHandler(function (e) {
        body.innerHTML = '<tr><td colspan="11" class="muted" style="padding:12px;">불러오기 실패: ' + e.message + '</td></tr>';
      })
      .getMyUnpaid();
  }

  function doEmpSearch() {
    const kw = document.getElementById('empSearchKw').value.trim();
    const el = document.getElementById('empSearchResult');
    if (!kw) { toast('검색어를 입력하세요'); return; }
    el.innerHTML = '<span class="muted">검색 중...</span>';
    RUN()
      .withSuccessHandler(function (rows) {
        empSearchCache = Array.isArray(rows) ? rows : [];
        updateAgentOptions_('empAgentFilter', empSearchCache.concat(empRecentCache));
        updateSourceOptions_('empSourceFilter', empSearchCache.concat(empRecentCache));
        renderEmpSearch_();
      })
      .withFailureHandler(e => { el.innerHTML = '<span class="muted">오류: '+e.message+'</span>'; })
      .searchLedger(kw);
  }

  function renderEmpSearch_() {
    const el = document.getElementById('empSearchResult');
    if (!el || !empSearchCache.length) return;
    const list = filterBySource_(filterByPayType_(filterByAgent_(empSearchCache, 'empAgentFilter'), 'empPayFilter'), 'empSourceFilter');
    if (!list.length) { el.innerHTML = '<span class="muted">해당 출장자의 검색 결과가 없습니다.</span>'; return; }
    const bands = dateBandBg_(list);
    el.innerHTML = '<div class="muted" style="margin-bottom:6px;">' + list.length + '건 (최대 100건)</div>' +
      '<div class="table-wrap"><table style="table-layout:fixed;"><thead><tr>' +
      '<th style="width:76px;white-space:nowrap;">날짜</th><th style="width:200px;">주소</th><th style="width:200px;">내용</th>' +
      '<th style="width:92px;white-space:nowrap;">금액</th><th style="width:70px;">출장자</th><th style="width:40px;white-space:nowrap;">입금</th>' +
      '<th style="width:50px;">확인</th><th style="width:120px;">비고</th><th style="width:56px;"></th>' +
      '</tr></thead><tbody>' +
      list.map((r, i) => `<tr onclick='editRowInForm(${jsonAttr_(r)})' style="cursor:pointer;background:${bands[i]};">
        <td style="white-space:nowrap;">${escapeHtml_(r.date)}</td>${truncTd_(r.address, 200)}${truncTd_(r.content, 200)}
        <td style="white-space:nowrap;background:#EAD1DC;">${fmtMoney(r.amount)}</td><td style="background:#B7E1CD;">${escapeHtml_(r.agent||'')}</td><td>${payTypeShort_(r.payType)}</td>
        <td>${escapeHtml_(r.confirmed||'')}</td>${truncTd_(r.note, 120)}
        <td>
          <span class="badge">수정</span>
          ${r.docLink ? `<a href="https://drive.google.com/file/d/${r.docLink.fileId}/view" target="_blank" onclick="event.stopPropagation()">📄</a>` : ''}
          ${r.mediaCount ? `<a href="#" onclick="event.stopPropagation();event.preventDefault();openMediaModal(${r.rowIndex})">📷${r.mediaCount}</a>` : ''}
        </td>
      </tr>`).join('') + '</tbody></table></div>';
  }

  function loadMyRecent() {
    RUN()
      .withSuccessHandler(function (rows) {
        myRecentCache = Array.isArray(rows) ? rows : [];
        const el = document.getElementById('myRecent');
        if (!el) return;
        if (!myRecentCache.length) { el.textContent = '오늘 등록한 기록이 없습니다.'; return; }
        el.innerHTML = myRecentCache.map((r, i) =>
          `<div style="padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick='editRowInForm(${jsonAttr_(r)})'>
             <strong>${fmtDate(r.date)}</strong> · ${escapeHtml_(r.address)} · ${escapeHtml_(r.content)} · ${fmtMoney(r.amount)}
             <button class="btn-outline" style="float:right;padding:2px 8px;font-size:12px;margin-left:6px;" onclick='openMediaModal(${r.rowIndex}, event)'>📎</button>
             <span class="badge" style="float:right;">수정</span>
           </div>`
        ).join('');
      })
      .withFailureHandler(function (e) {
        const el = document.getElementById('myRecent');
        if (el) el.textContent = '불러오기 실패: ' + e.message;
      })
      .getMyTodayEntries(currentUser.name);
  }

  function submitAdminEntry() {
    doSubmit('a');
  }

  function loadMyRecentAdmin() {
    RUN()
      .withSuccessHandler(function (rows) {
        const list = Array.isArray(rows) ? rows : [];
        const el = document.getElementById('myRecentAdmin');
        if (!el) return;
        if (!list.length) { el.textContent = '오늘 등록한 기록이 없습니다.'; return; }
        el.innerHTML = list.map(r =>
          `<div style="padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick='editRowInForm(${jsonAttr_(r)})'>
             <strong>${fmtDate(r.date)}</strong> · ${escapeHtml_(r.address)} · ${escapeHtml_(r.content)} · ${fmtMoney(r.amount)}
             <button class="btn-outline" style="float:right;padding:2px 8px;font-size:12px;margin-left:6px;" onclick='openMediaModal(${r.rowIndex}, event)'>📎</button>
             <span class="badge" style="float:right;">수정</span>
           </div>`
        ).join('');
      })
      .withFailureHandler(function (e) {
        const el = document.getElementById('myRecentAdmin');
        if (el) el.textContent = '불러오기 실패: ' + e.message;
      })
      .getMyTodayEntries(currentUser.name);
  }

  /**
   * 탭을 처음 열 때 한 번만 로더를 돌린다. 이미 불러온 탭이면 아무것도 안 한다.
   * 로그아웃하면 resetTabDataLoaded_()로 비워서, 다른 계정/지점으로 다시 로그인했을 때 새로 불러오게 한다.
   */
  const tabDataLoaded_ = {};
  function tabDataOnce_(target, current, loader) {
    if (current !== target || tabDataLoaded_[target]) return;
    tabDataLoaded_[target] = true;
    loader();
  }
  function resetTabDataLoaded_() {
    Object.keys(tabDataLoaded_).forEach(function (k) { delete tabDataLoaded_[k]; });
  }

  /** 지금 열려 있는 관리자 탭 이름(활성 버튼 기준). 못 찾으면 대시보드. */
  function currentAdminTab_() {
    const btn = document.querySelector('#adminView .tab-btn.active');
    return (btn && btn.id) ? btn.id.replace('tabBtn-', '') : 'dash';
  }

  function showAdminTab(tab) {
    scrollTabIntoView_(document.getElementById('tabBtn-' + tab));
    ['dash','input','cal','users','stock','doorlock','vehicle','incentive','stats','search','album','docs','expense','blogreq','changelog'].forEach(t => {
      const panel = document.getElementById('adminTab-' + t);
      const btn = document.getElementById('tabBtn-' + t);
      if (panel) panel.classList.toggle('hidden', t !== tab);
      if (btn) btn.classList.toggle('active', t === tab);
    });
    // 탭을 처음 열 때만 그 탭 데이터를 불러온다(로그인 때 전부 미리 부르던 것을 여기로 옮김 — 2026-08-02).
    // 한 번 불러온 탭은 다시 부르지 않는다. 데이터를 바꾸는 동작(저장/삭제)은 각자 자기 목록을 새로고침한다.
    tabDataOnce_('input', tab, function () { loadStockForForm(); loadSourceList(); });
    tabDataOnce_('cal', tab, function () { renderCalendar(); });
    tabDataOnce_('search', tab, function () { loadAgentList(); loadSourceList(); loadAllEntries(); });
    tabDataOnce_('users', tab, function () { loadUsers(); });
    tabDataOnce_('incentive', tab, function () { loadMyRecentAdmin(); });

    if (tab === 'stock') loadStockAndPrice();
    if (tab === 'doorlock') loadDoorlockCatalogTab();
    if (tab === 'dash') loadDashboard();
    if (tab === 'incentive') { loadIncentive(); loadMonthlySettlement(); }
    if (tab === 'stats') { loadStatistics(); loadPnL(); }
    if (tab === 'album') initAlbumTab();
    if (tab === 'users') { loadNotifyUsers_(); loadNaverLinkStatus(); loadGeminiKeyStatus(); loadOpenAiKeyStatus(); }
    if (tab === 'vehicle') loadVehicleTab();
    if (tab === 'docs') loadDocsManageTab();
    if (tab === 'expense') loadExpenseTab();
    if (tab === 'blogreq') loadBlogRequests();
    if (tab === 'changelog') renderChangelogTab();
    if (tab === 'cal') {
      const sd = document.getElementById('sortDate');
      if (sd && !sd.value) sd.valueAsDate = new Date();
    }
  }

  // ====================== 통계 탭 (구 정산/월별평균/출처별/결재형태 시트를 대체) ======================
  let statsCache_ = null;
  const STATS_COLORS_ = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4338ca'];
  // 직원별 그래프 색상은 고정: 김승우=파랑, 김영민=초록, 노휘래=노랑(가독성을 위해 진한 톤). 목록에 없는
  // 이름(신규 직원 등)은 STATS_COLORS_를 순서대로 배정하는 기존 방식으로 자연스럽게 대체된다.
  // 2026-07-24: 김영민 색상을 빨강→초록으로 변경(빨강은 "완료/경고" 표시용으로 예약).
  const AGENT_COLOR_MAP_ = { '김승우': '#2563eb', '김영민': '#16a34a', '노휘래': '#ca8a04' };
  function agentColor_(name, idx) {
    return AGENT_COLOR_MAP_[name] || STATS_COLORS_[idx % STATS_COLORS_.length];
  }

  function loadStatistics() {
    const trendEl = document.getElementById('statsTrend');
    if (trendEl) trendEl.innerHTML = '<span class="muted">불러오는 중...</span>';
    RUN()
      .withSuccessHandler(function (res) {
        statsCache_ = res || { months: [], byAgent: [], bySource: [] };
        renderStatsAll_();
      })
      .withFailureHandler(function (e) {
        if (trendEl) trendEl.innerHTML = '<span class="muted">불러오기 실패: ' + e.message + '</span>';
      })
      .getStatistics();
  }

  function statsRangedMonths_(selId) {
    if (!statsCache_) return [];
    const n = Number((document.getElementById(selId || 'statsRangeSel') || {}).value || 12);
    const all = statsCache_.months || [];
    return n > 0 ? all.slice(-n) : all;
  }

  function renderStatsAll_() {
    if (!statsCache_) return;
    renderStatsTrend_();
    populateStatsAvgPeriodYears_();
    renderStatsAvgSection_();
    renderStatsIncentiveChart_();
    renderStatsAgentCharts_();
    renderStatsSourceSection_();
    populateStatsMonthSel_();
    renderStatsAgentTable_();
  }

  function renderStatsTrend_() {
    const el = document.getElementById('statsTrend');
    if (!el) return;
    const months = statsRangedMonths_();
    if (!months.length) { el.innerHTML = '<span class="muted">데이터가 없습니다.</span>'; return; }
    const maxTotal = Math.max(1, ...months.map(m => m.total));
    el.innerHTML = months.map(function (m) {
      const w = Math.round(m.total / maxTotal * 100);
      const mw = m.total ? Math.round(m.margin / maxTotal * 100) : 0;
      return `<div class="bar-row">
        <span class="bar-label">${m.ym}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${w}%;"></div>
          <div class="bar-fill margin" style="width:${mw}%;height:8px;top:auto;bottom:0;opacity:.9;"></div>
        </div>
        <span class="bar-val">${fmtMoney(m.total)}<br><span style="color:#16a34a;">${fmtMoney(m.margin)}</span></span>
      </div>`;
    }).join('') + '<div class="muted" style="font-size:12px;margin-top:6px;">파란색=매출, 초록색=마진</div>';
  }

  function pct1_(v) { return (v * 100).toFixed(1) + '%'; }

  // ---- 기간 평균 정산 요약 ----
  function populateStatsAvgPeriodYears_() {
    const sel = document.getElementById('statsAvgPeriodSel');
    if (!sel || !statsCache_ || sel.querySelector('option[data-year]')) return;
    const years = [];
    (statsCache_.months || []).forEach(function (m) {
      const y = m.ym.slice(0, 4);
      if (years.indexOf(y) === -1) years.push(y);
    });
    years.reverse().forEach(function (y) {
      const opt = document.createElement('option');
      opt.value = 'year:' + y;
      opt.textContent = y + '년';
      opt.setAttribute('data-year', '1');
      sel.appendChild(opt);
    });
  }

  let statsCustomRangeMonths_ = null;

  function statsAvgPeriodMonths_() {
    const v = (document.getElementById('statsAvgPeriodSel') || {}).value || 'thisMonth';
    if (v === 'custom') return statsCustomRangeMonths_ || [];
    if (!statsCache_) return [];
    const all = statsCache_.months || [];
    if (v === 'thisMonth') {
      const cur = currentMonthStr_();
      return all.filter(function (m) { return m.ym === cur; });
    }
    if (v === 'all') return all;
    if (v.indexOf('year:') === 0) {
      const y = v.slice(5);
      return all.filter(function (m) { return m.ym.slice(0, 4) === y; });
    }
    const n = Number(v.replace('last', '')) || 12;
    return all.slice(-n);
  }

  function onStatsAvgPeriodChange_() {
    const isCustom = (document.getElementById('statsAvgPeriodSel') || {}).value === 'custom';
    const row = document.getElementById('statsCustomRangeRow');
    if (row) row.classList.toggle('hidden', !isCustom);
    if (!isCustom) { renderStatsAvgSection_(); return; }
    if (statsCustomRangeMonths_) renderStatsAvgSection_();
  }

  function applyStatsCustomRange_() {
    const start = document.getElementById('statsCustomStart').value;
    const end = document.getElementById('statsCustomEnd').value;
    const msg = document.getElementById('statsCustomRangeMsg');
    if (!start || !end) { if (msg) msg.textContent = '시작일과 종료일을 모두 선택하세요'; return; }
    if (start > end) { if (msg) msg.textContent = '시작일이 종료일보다 늦을 수 없습니다'; return; }
    if (msg) msg.textContent = '불러오는 중...';
    RUN()
      .withSuccessHandler(function (res) {
        statsCustomRangeMonths_ = (res && res.months) || [];
        if (msg) msg.textContent = statsCustomRangeMonths_.length ? '' : '해당 기간에 데이터가 없습니다.';
        renderStatsAvgSection_();
      })
      .withFailureHandler(function (e) {
        if (msg) msg.textContent = '오류: ' + e.message;
      })
      .getStatisticsForRange(start, end);
  }

  function statCard_(label, value, sub, accent) {
    return `<div class="stat-card" style="flex:1;min-width:150px;${accent || ''}">
      <div class="stat-label">${label}</div>
      <div class="stat-value" style="font-size:18px;">${value}</div>
      ${sub ? '<div class="stat-delta" style="color:var(--muted);">' + sub + '</div>' : ''}
    </div>`;
  }

  function renderStatsAvgGrid_() {
    const grid = document.getElementById('statsAvgGrid');
    const hqGrid = document.getElementById('statsHqGrid');
    if (!grid) return;
    const months = statsAvgPeriodMonths_();
    if (!months.length) {
      grid.innerHTML = '<span class="muted">데이터가 없습니다.</span>';
      if (hqGrid) { hqGrid.classList.add('hidden'); hqGrid.innerHTML = ''; }
      return;
    }
    const n = months.length;
    let sumTotal = 0, sumMargin = 0, sumCost = 0, sumCount = 0, sumWorkDays = 0;
    const sumPay = {};
    months.forEach(function (m) {
      sumTotal += m.total; sumMargin += m.margin; sumCost += m.cost; sumCount += m.count; sumWorkDays += m.workDays;
      const pt = m.payType || {};
      Object.keys(pt).forEach(function (k) { sumPay[k] = (sumPay[k] || 0) + pt[k].sum; });
    });
    const marginPct = sumTotal ? sumMargin / sumTotal : 0;
    const costPct = sumTotal ? sumCost / sumTotal : 0;
    const payPct = function (k) { return sumTotal ? (sumPay[k] || 0) / sumTotal : 0; };

    grid.innerHTML = [
      statCard_('월평균 매출', fmtMoney(Math.round(sumTotal / n)), null, 'border-color:#2563eb;background:#eff6ff;'),
      statCard_('월평균 이익', fmtMoney(Math.round(sumMargin / n)), null, 'border-color:#16a34a;background:#f0fdf4;'),
      statCard_('이익률', pct1_(marginPct), null, 'border-color:#0d9488;background:#f0fdfa;'),
      statCard_('원가율', pct1_(costPct), null, 'border-color:#ea580c;background:#fff7ed;'),
      statCard_('총 건수', sumCount + '건', '월평균 ' + (sumCount / n).toFixed(1) + '건'),
      statCard_('총 출장일', sumWorkDays + '일', '월평균 ' + (sumWorkDays / n).toFixed(1) + '일'),
      statCard_('건당 매출', fmtMoney(Math.round(sumCount ? sumTotal / sumCount : 0))),
      statCard_('건당 순이익', fmtMoney(Math.round(sumCount ? sumMargin / sumCount : 0))),
      statCard_('실제 출장일별 순이익', fmtMoney(Math.round(sumWorkDays ? sumMargin / sumWorkDays : 0)), '지난 날짜가 아닌 실제 기록된 날짜 기준', 'border-color:#8b5cf6;background:#f5f3ff;'),
      statCard_('입금+현금 비중', pct1_(payPct('입금') + payPct('현금')), null, 'border-color:#ca8a04;background:#fefce8;'),
      statCard_('세금계산서 비중', pct1_(payPct('세금계산서'))),
      statCard_('카드 비중', pct1_(payPct('카드'))),
      statCard_('입금 비중', pct1_(payPct('입금'))),
      statCard_('현금 비중', pct1_(payPct('현금')))
    ].join('');

    if (hqGrid) {
      const hasHq = months.some(function (m) { return m.incheonFee != null; });
      if (hasHq) {
        let sumFee = 0, sumHqProfit = 0;
        months.forEach(function (m) { sumFee += (m.incheonFee || 0); sumHqProfit += (m.hqNetProfit != null ? m.hqNetProfit : m.margin); });
        hqGrid.innerHTML = [
          statCard_('인천 가맹비 합계', fmtMoney(sumFee), '인천 매출 5% (만원 미만 절사, 개업 후 4개월 유예)'),
          statCard_('본사 총수익 합계', fmtMoney(Math.round(sumHqProfit)), '본사 이익 + 인천 가맹비'),
          statCard_('본사 총수익 월평균', fmtMoney(Math.round(sumHqProfit / n)))
        ].join('');
        hqGrid.classList.remove('hidden');
      } else {
        hqGrid.classList.add('hidden');
        hqGrid.innerHTML = '';
      }
    }

  }

  function renderStatsAvgSection_() {
    renderStatsAvgGrid_();
    renderStatsMonthlyTable_();
  }

  function renderStatsMonthlyTable_() {
    const body = document.getElementById('statsMonthlyBody');
    if (!body) return;
    const months = statsAvgPeriodMonths_();
    if (!months.length) { body.innerHTML = '<tr><td colspan="16" class="muted" style="padding:12px;">데이터가 없습니다.</td></tr>'; return; }
    body.innerHTML = months.slice().reverse().map(function (m) {
      const pt = m.payType || {};
      const g = function (k) { return pt[k] ? pt[k].pct : 0; };
      return `<tr>
        <td style="white-space:nowrap;">${m.ym}</td><td style="white-space:nowrap;background:#eff6ff;">${fmtMoney(m.total)}</td><td>${m.count}</td><td>${m.workDays}</td>
        <td style="white-space:nowrap;">${fmtMoney(Math.round(m.avgPerDayTotal))}</td><td style="white-space:nowrap;background:#f0fdf4;">${fmtMoney(m.margin)}</td>
        <td style="background:#f0fdfa;">${pct1_(m.marginPct)}</td><td style="background:#fff7ed;">${pct1_(m.costPct)}</td>
        <td style="white-space:nowrap;">${fmtMoney(Math.round(m.avgPerCaseTotal))}</td><td style="white-space:nowrap;">${fmtMoney(Math.round(m.avgPerCaseMargin))}</td>
        <td style="white-space:nowrap;background:#f5f3ff;">${fmtMoney(Math.round(m.avgPerDayMargin))}</td>
        <td>${pct1_(g('세금계산서'))}</td><td>${pct1_(g('입금'))}</td><td>${pct1_(g('카드'))}</td><td>${pct1_(g('현금'))}</td>
        <td style="background:#fefce8;">${pct1_(g('입금') + g('현금'))}</td>
      </tr>`;
    }).join('');
  }

  // ---- SVG 다중 선그래프 공용 컴포넌트 (외부 라이브러리 없이 순수 SVG) ----
  function fmtMoneyShort_(v) {
    const n = Math.round(v);
    if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(1) + '억';
    if (Math.abs(n) >= 10000) return Math.round(n / 10000) + '만';
    return String(n);
  }

  function svgLineChart_(months, series, opts) {
    opts = opts || {};
    if (!months.length || !series.length) return '<span class="muted">데이터가 없습니다.</span>';
    const axisFmt = opts.axisFmt || fmtMoneyShort_;
    const tooltipFmt = opts.tooltipFmt || fmtMoney;
    const W = 900, H = opts.height || 220, padL = 54, padR = 10, padT = 14, padB = 26;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const n = months.length;
    const allVals = [];
    series.forEach(function (s) { s.values.forEach(function (v) { if (v != null) allVals.push(v); }); });
    const maxV = Math.max(1, 0, ...allVals);
    const minV = Math.min(0, ...allVals);
    const xFor = function (i) { return padL + (n <= 1 ? innerW / 2 : i / (n - 1) * innerW); };
    const yFor = function (v) { return padT + innerH - ((v - minV) / ((maxV - minV) || 1)) * innerH; };

    const gridN = 4;
    let gridSvg = '';
    for (let g = 0; g <= gridN; g++) {
      const v = minV + (maxV - minV) * g / gridN;
      const y = yFor(v);
      gridSvg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#e5e7eb" stroke-width="1"/>';
      gridSvg += '<text x="' + (padL - 6) + '" y="' + (y + 3) + '" font-size="10" fill="#6b7280" text-anchor="end">' + axisFmt(v) + '</text>';
    }

    const labelStep = Math.max(1, Math.ceil(n / 12));
    let xLabelSvg = '';
    months.forEach(function (m, i) {
      if (i % labelStep !== 0 && i !== n - 1) return;
      xLabelSvg += '<text x="' + xFor(i) + '" y="' + (H - 8) + '" font-size="10" fill="#6b7280" text-anchor="middle">' + escapeHtml_(String(m).slice(2)) + '</text>';
    });

    let linesSvg = '';
    series.forEach(function (s) {
      let ptsStr = '', started = false;
      s.values.forEach(function (v, i) {
        if (v == null) return;
        ptsStr += (started ? ' ' : '') + xFor(i) + ',' + yFor(v);
        started = true;
      });
      linesSvg += '<polyline points="' + ptsStr + '" fill="none" stroke="' + s.color + '" stroke-width="2"/>';
      s.values.forEach(function (v, i) {
        if (v == null) return;
        linesSvg += '<circle cx="' + xFor(i) + '" cy="' + yFor(v) + '" r="2.5" fill="' + s.color + '"><title>' + escapeHtml_(months[i]) + ' ' + escapeHtml_(s.name) + ': ' + tooltipFmt(v) + '</title></circle>';
      });
    });

    const legendHtml = series.map(function (s) {
      return '<span class="chart-legend-item"><span class="chart-legend-swatch" style="background:' + s.color + ';"></span>' + escapeHtml_(s.name) + '</span>';
    }).join('');

    return '<div style="overflow-x:auto;"><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;min-width:560px;height:' + H + 'px;">' + gridSvg + linesSvg + xLabelSvg + '</svg></div>' +
      '<div class="chart-legend">' + legendHtml + '</div>';
  }

  // ---- 이익 대비 인센티브 추이 ----
  // 순금액을 나란히 그리면 이익이 인센티브보다 훨씬 커서(스케일 차이) 인센티브가 이익 대비
  // 오르는지 내리는지 눈으로 안 보인다. "이익은 줄고 있는데 인센티브는 오히려 늘고 있다" 같은
  // 서로 반대 방향 추세를 한눈에 보여주려면 두 선을 같은 기준선(=100)으로 놓고 비교해야 한다 —
  // 첫 비교가능월을 100으로 두고, 이후 각 달의 이익/인센티브를 그 대비 지수(index)로 환산해서
  // 두 선으로 같이 그린다. 팀 구성이 달랐던 달(누군가 인센티브를 아예 안 받은 달)을 섞으면
  // 비교 기준이 흔들리므로, 인센티브를 받아본 적 있는 직원(김영민·노휘래) 전원이 그 달에도
  // 인센티브를 받았을 때만 계산한다.
  function incentiveEligibleAgents_() {
    return (statsCache_.byAgent || []).filter(function (a) {
      return a.months.some(function (m) { return (m.incentive || 0) > 0; });
    }).map(function (a) { return a.agent; });
  }

  function renderStatsIncentiveChart_() {
    const el = document.getElementById('statsIncentiveChart');
    if (!el || !statsCache_) return;
    const months = statsRangedMonths_();
    const yms = months.map(function (m) { return m.ym; });
    const marginByYm = {};
    months.forEach(function (m) { marginByYm[m.ym] = m.margin; });

    const eligible = incentiveEligibleAgents_();
    const incByAgentByYm = {};
    (statsCache_.byAgent || []).forEach(function (a) {
      const map = {};
      a.months.forEach(function (m) { map[m.ym] = m.incentive || 0; });
      incByAgentByYm[a.agent] = map;
    });

    function isEligibleMonth(ym) {
      if (!eligible.length) return false;
      return eligible.every(function (ag) { return (incByAgentByYm[ag][ym] || 0) > 0; });
    }
    function totalInc(ym) {
      return eligible.reduce(function (sum, ag) { return sum + (incByAgentByYm[ag][ym] || 0); }, 0);
    }

    // 지수의 기준(=100)이 될 첫 비교가능월을 찾는다 (기간 안에서 가장 이른 달).
    let baseYm = null;
    for (let i = 0; i < yms.length; i++) {
      if (isEligibleMonth(yms[i]) && marginByYm[yms[i]]) { baseYm = yms[i]; break; }
    }

    if (!eligible.length || !baseYm) {
      el.innerHTML = '<span class="muted">비교할 수 있는 달이 없습니다 (' + escapeHtml_(eligible.join(', ') || '인센티브 대상자') + ' 전원이 함께 받은 달이 없음).</span>';
      return;
    }

    const baseMargin = marginByYm[baseYm];
    const baseInc = totalInc(baseYm);
    const marginIndex = yms.map(function (ym) {
      if (!isEligibleMonth(ym) || !marginByYm[ym]) return null;
      return marginByYm[ym] / baseMargin * 100;
    });
    const incIndex = yms.map(function (ym) {
      if (!isEligibleMonth(ym) || !baseInc) return null;
      return totalInc(ym) / baseInc * 100;
    });

    const series = [
      { name: '이익 지수', color: STATS_COLORS_[1], values: marginIndex },
      { name: '인센티브 지수(' + eligible.join('+') + ')', color: STATS_COLORS_[3], values: incIndex }
    ];
    el.innerHTML = svgLineChart_(yms, series, {
      axisFmt: function (v) { return Math.round(v); },
      tooltipFmt: function (v) { return v.toFixed(1); }
    }) + '<div class="muted" style="font-size:12px;margin-top:4px;">' + escapeHtml_(baseYm) + '=100 기준 지수. ' + escapeHtml_(eligible.join(', ')) +
      ' 전원이 인센티브를 받은 달만 계산 (팀 구성이 달라 비교 기준이 안 맞는 달은 건너뜀). 인센티브 선이 이익 선보다 위에서 벌어지면, 이익 대비 인센티브가 더 빠르게 늘고 있다는 뜻.</div>';
  }

  // ---- 출장자별 추이 (매출/마진/인센티브) ----
  function alignAgentSeries_(yms, field) {
    return (statsCache_.byAgent || []).map(function (a, idx) {
      const map = {};
      a.months.forEach(function (m) { map[m.ym] = m[field]; });
      return { name: a.agent, color: agentColor_(a.agent, idx), values: yms.map(function (ym) { return map[ym] != null ? map[ym] : null; }) };
    });
  }

  function renderStatsAgentCharts_() {
    const el = document.getElementById('statsAgentCharts');
    if (!el || !statsCache_) return;
    const months = statsRangedMonths_('statsAgentRangeSel');
    const yms = months.map(function (m) { return m.ym; });
    const blocks = [
      ['매출 추이', alignAgentSeries_(yms, 'total')],
      ['마진 추이', alignAgentSeries_(yms, 'margin')],
      ['인센티브 추이', alignAgentSeries_(yms, 'incentive')]
    ];
    el.innerHTML = blocks.map(function (b) {
      return '<div style="margin-bottom:14px;"><div style="font-size:13px;color:var(--muted);margin-bottom:4px;">' + b[0] + '</div>' + svgLineChart_(yms, b[1], { height: 180 }) + '</div>';
    }).join('');
  }

  // ---- 출처별 추이 (매출 상위 10개, 매출/마진) ----
  function topSourceSeries_(yms, field) {
    const withTotal = (statsCache_.bySource || []).map(function (s) {
      const map = {};
      s.months.forEach(function (m) { map[m.ym] = m; });
      const sumTotal = yms.reduce(function (sum, ym) { return sum + (map[ym] ? map[ym].total : 0); }, 0);
      return { source: s.source, map: map, sumTotal: sumTotal };
    }).filter(function (s) { return s.sumTotal > 0; });
    withTotal.sort(function (a, b) { return b.sumTotal - a.sumTotal; });
    return withTotal.slice(0, 10).map(function (s, idx) {
      return {
        name: s.source, color: STATS_COLORS_[idx % STATS_COLORS_.length],
        values: yms.map(function (ym) { return s.map[ym] ? s.map[ym][field] : null; })
      };
    });
  }

  function renderStatsSourceCharts_() {
    const el = document.getElementById('statsSourceCharts');
    if (!el || !statsCache_) return;
    const months = statsRangedMonths_('statsSourceRangeSel');
    const yms = months.map(function (m) { return m.ym; });
    const blocks = [
      ['매출 추이', topSourceSeries_(yms, 'total')],
      ['마진 추이', topSourceSeries_(yms, 'margin')]
    ];
    el.innerHTML = blocks.map(function (b) {
      return '<div style="margin-bottom:14px;"><div style="font-size:13px;color:var(--muted);margin-bottom:4px;">' + b[0] + '</div>' + svgLineChart_(yms, b[1], { height: 180 }) + '</div>';
    }).join('');
  }

  function populateStatsMonthSelBy_(selId) {
    const sel = document.getElementById(selId);
    if (!sel || !statsCache_) return;
    const months = statsCache_.months || [];
    const cur = sel.value;
    sel.innerHTML = months.slice().reverse().map(function (m) {
      return '<option value="' + m.ym + '"' + (m.ym === cur ? ' selected' : '') + '>' + m.ym + '</option>';
    }).join('');
    if (!cur && months.length) sel.value = months[months.length - 1].ym; // 기본값: 최신월
  }

  function populateStatsMonthSel_() {
    populateStatsMonthSelBy_('statsMonthSel');
  }

  function renderStatsAgentSource_() {
    renderStatsAgentTable_();
    renderStatsSourceTable_();
  }

  function renderStatsSourceSection_() {
    renderStatsSourceCharts_();
    renderStatsSourceTable_();
  }

  function renderStatsAgentTable_() {
    const agentBody = document.getElementById('statsAgentBody');
    if (!agentBody || !statsCache_) return;
    const sel = document.getElementById('statsMonthSel');
    const ym = sel ? sel.value : '';
    if (!ym) { agentBody.innerHTML = ''; return; }

    const agentRows = (statsCache_.byAgent || []).map(function (a) {
      const m = a.months.find(function (x) { return x.ym === ym; });
      return m ? { agent: a.agent, total: m.total, margin: m.margin, count: m.count, workDays: m.workDays, incentive: m.incentive } : null;
    }).filter(Boolean).sort(function (a, b) { return b.total - a.total; });
    agentBody.innerHTML = agentRows.length ? agentRows.map(function (r) {
      return `<tr><td>${escapeHtml_(r.agent)}</td><td style="white-space:nowrap;">${fmtMoney(r.total)}</td><td style="white-space:nowrap;">${fmtMoney(r.margin)}</td><td>${r.count}</td><td>${r.workDays}</td><td style="white-space:nowrap;">${fmtMoney(r.incentive)}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="muted" style="padding:12px;">해당 월 기록이 없습니다.</td></tr>';
  }

  function renderStatsSourceTable_() {
    const sourceBody = document.getElementById('statsSourceBody');
    if (!sourceBody || !statsCache_) return;
    const months = statsRangedMonths_('statsSourceRangeSel');
    const yms = months.map(function (m) { return m.ym; });
    if (!yms.length) { sourceBody.innerHTML = ''; return; }

    const ymSet = {};
    yms.forEach(function (ym) { ymSet[ym] = true; });
    const sourceRowsRaw = (statsCache_.bySource || []).map(function (s) {
      let total = 0, margin = 0, count = 0;
      s.months.forEach(function (m) {
        if (!ymSet[m.ym]) return;
        total += m.total; margin += m.margin; count += m.count;
      });
      return count ? { source: s.source, total: total, margin: margin, count: count } : null;
    }).filter(Boolean).sort(function (a, b) { return b.total - a.total; });
    const periodTotal = sourceRowsRaw.reduce(function (sum, r) { return sum + r.total; }, 0);
    sourceBody.innerHTML = sourceRowsRaw.length ? sourceRowsRaw.map(function (r) {
      const share = periodTotal ? r.total / periodTotal : 0;
      return `<tr><td>${escapeHtml_(r.source)}</td><td style="white-space:nowrap;">${fmtMoney(r.total)}</td><td style="white-space:nowrap;">${fmtMoney(r.margin)}</td><td>${r.count}</td><td>${pct1_(share)}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="muted" style="padding:12px;">해당 월 기록이 없습니다.</td></tr>';
  }

  function doAdmSearch() {
    const kw = document.getElementById('admSearchKw').value.trim();
    const el = document.getElementById('admSearchResult');
    if (!kw) { toast('검색어를 입력하세요'); return; }
    el.innerHTML = '<span class="muted">검색 중...</span>';
    RUN()
      .withSuccessHandler(function (rows) {
        admSearchCache = Array.isArray(rows) ? rows : [];
        updateAgentOptions_('admAgentFilter', admSearchCache.concat(allEntries || []));
        updateSourceOptions_('admSourceFilter', admSearchCache.concat(allEntries || []));
        renderAdmSearch_();
      })
      .withFailureHandler(e => { el.innerHTML = '<span class="muted">오류: '+e.message+'</span>'; })
      .searchLedger(kw);
  }

  function renderAdmSearch_() {
    const el = document.getElementById('admSearchResult');
    if (!el || !admSearchCache.length) return;
    const list = filterBySource_(filterByPayType_(filterByAgent_(admSearchCache, 'admAgentFilter'), 'admPayFilter'), 'admSourceFilter');
    if (!list.length) { el.innerHTML = '<span class="muted">해당 출장자의 검색 결과가 없습니다.</span>'; return; }
    const bands = dateBandBg_(list);
    el.innerHTML = '<div class="muted" style="margin-bottom:6px;">' + list.length + '건 (최대 100건)</div>' +
      '<div class="table-wrap"><table style="table-layout:fixed;"><thead><tr>' +
      '<th style="width:76px;white-space:nowrap;">날짜</th><th style="width:200px;">주소</th><th style="width:200px;">내용</th>' +
      '<th style="width:92px;white-space:nowrap;">금액</th><th style="width:70px;">출장자</th><th style="width:40px;white-space:nowrap;">입금</th>' +
      '<th style="width:50px;">확인</th><th style="width:120px;">비고</th><th style="width:90px;white-space:nowrap;">원가</th><th style="width:56px;"></th>' +
      '</tr></thead><tbody>' +
      list.map((r, i) => `<tr onclick='editRowInForm(${jsonAttr_(r)})' style="cursor:pointer;background:${bands[i]};">
        <td style="white-space:nowrap;">${escapeHtml_(r.date)}</td>${truncTd_(r.address, 200)}${truncTd_(r.content, 200)}
        <td style="white-space:nowrap;background:#EAD1DC;">${fmtMoney(r.amount)}</td><td style="background:#B7E1CD;">${escapeHtml_(r.agent||'')}</td><td>${payTypeShort_(r.payType)}</td>
        <td>${escapeHtml_(r.confirmed||'')}</td>${truncTd_(r.note, 120)}<td style="white-space:nowrap;">${fmtMoney(r.cost)}</td>
        <td>
          <span class="badge">수정</span>
          ${r.docLink ? `<a href="https://drive.google.com/file/d/${r.docLink.fileId}/view" target="_blank" onclick="event.stopPropagation()">📄</a>` : ''}
          ${r.mediaCount ? `<a href="#" onclick="event.stopPropagation();event.preventDefault();openMediaModal(${r.rowIndex})">📷${r.mediaCount}</a>` : ''}
          <a href="#" title="블로그 작성 요청" onclick='event.stopPropagation();event.preventDefault();openBlogRequestModal(${jsonAttr_(r)})'>✍️</a>
          ${r.mediaCount ? `<a href="#" title="사진 다운로드 준비" onclick='event.stopPropagation();event.preventDefault();openPhotoDownloadModal(${jsonAttr_(r)})'>📥</a>` : ''}
        </td>
      </tr>`).join('') + '</tbody></table></div>';
  }

  let blogReqRowIndex_ = null;
  function openBlogRequestModal(r) {
    blogReqRowIndex_ = r.rowIndex;
    document.getElementById('blogReq_info').textContent =
      (r.date || '') + ' · ' + (r.address || '') + ' · ' + (r.content || '') + (r.mediaCount ? (' · 사진/영상 ' + r.mediaCount + '건') : ' · 첨부된 사진/영상 없음');
    document.getElementById('blogReq_keywords').value = '';
    document.getElementById('blogReq_titlePhrase').value = '';
    // 지난번에 열었을 때의 결과가 남아 있으면 방금 이 행에서 나온 것처럼 보인다 — 열 때마다 비운다.
    ['blogReqOnly_result', 'blogAuto_result', 'thumbCandidates_result'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
    document.getElementById('blogRequestModal').classList.remove('hidden');
  }

  /**
   * "요청만 넣기" — 큐(블로그작성요청 시트)에 "대기"로 쌓아두고, 글은 나중에 Claude Code 세션에서 쓴다.
   *
   * 원래 있던 기능인데 V49.11에서 "발행 버튼 하나로 단순화"하며 호출부가 빠졌었다(서버 requestBlogPost는
   * 계속 살아 있었다). 그래서 "블로그 요청" 탭 안내문이 가리키는 경로가 끊겨 있었고, 큐에 대기 건을
   * 새로 넣을 방법이 아예 없었다 — 2026-08-03에 되살림.
   * 그때 뺀 이유였던 "재입력 초기화" 문제는 발행 버튼과 별개 버튼이라 생기지 않는다.
   *
   * 키워드를 필수로 두지 않는다 — 현장에서 "이건 블로그 각이다" 싶을 때 바로 눌러두는 용도라,
   * 키워드는 나중에 글 쓸 때 정해도 된다(서버도 빈 값을 그대로 받는다).
   */
  function submitBlogRequestOnly(btn) {
    const keywords = document.getElementById('blogReq_keywords').value.trim();
    const titlePhrase = document.getElementById('blogReq_titlePhrase').value.trim();
    const resEl = document.getElementById('blogReqOnly_result');
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '넣는 중...'; }
    if (resEl) resEl.innerHTML = '';
    RUN()
      .withSuccessHandler(function () {
        if (btn) { btn.disabled = false; btn.textContent = label; }
        document.getElementById('blogRequestModal').classList.add('hidden');
        toast('"✍️ 블로그 요청" 탭에 넣었습니다');
        // 지금 그 탭을 보고 있으면 바로 반영해준다(탭은 열 때마다 다시 부르므로 그 외엔 손댈 게 없다).
        const tab = document.getElementById('adminTab-blogreq');
        if (tab && !tab.classList.contains('hidden')) loadBlogRequests();
      })
      .withFailureHandler(function (e) {
        if (btn) { btn.disabled = false; btn.textContent = label; }
        if (resEl) resEl.innerHTML = '<span class="muted">오류: ' + escapeHtml_(e.message) + '</span>';
      })
      .requestBlogPost(blogReqRowIndex_, keywords, titlePhrase);
  }

  function openTextProviderPicker() {
    const keywords = document.getElementById('blogReq_keywords').value.trim();
    if (!keywords) { toast('주요 키워드를 입력하세요'); return; }
    document.getElementById('textProviderModal').classList.remove('hidden');
  }

  function confirmTextProviderAndGenerate() {
    const provider = document.querySelector('input[name="textProvider"]:checked').value;
    document.getElementById('textProviderModal').classList.add('hidden');
    generateBlogAuto(provider);
  }

  function generateBlogAuto(provider) {
    const keywords = document.getElementById('blogReq_keywords').value.trim();
    const titlePhrase = document.getElementById('blogReq_titlePhrase').value.trim();
    if (!keywords) { toast('주요 키워드를 입력하세요'); return; }
    const resEl = document.getElementById('blogAuto_result');
    resEl.innerHTML = '<span class="muted">생성 중... (' + (provider === 'gemini' ? 'Gemini' : 'OpenAI') + '로 글 작성 + 썸네일 생성, 잠시만 기다려주세요)</span>';
    RUN()
      .withSuccessHandler(function (res) {
        let html = '<div class="card" style="background:#f5f3ff;border-color:#c4b5fd;">' +
          '<strong>✅ 완료: ' + escapeHtml_(res.title) + '</strong><br>' +
          '<a href="' + res.docUrl + '" target="_blank">문서 열기</a> · ' +
          '<a href="' + res.folderUrl + '" target="_blank">보관 폴더 열기</a>';
        if (res.thumbError) html += '<div style="color:#b45309;font-size:12px;margin-top:6px;">썸네일 생성 실패(본문은 정상 생성됨): ' + escapeHtml_(res.thumbError) + '</div>';
        html += '</div>';
        resEl.innerHTML = html;
      })
      .withFailureHandler(function (e) { resEl.innerHTML = '<span class="muted">오류: ' + e.message + '</span>'; })
      .generateBlogPostAuto(blogReqRowIndex_, keywords, titlePhrase, provider);
  }

  function generateThumbCandidates() {
    const keywords = document.getElementById('blogReq_keywords').value.trim();
    if (!keywords) { toast('주요 키워드를 입력하세요'); return; }
    const resEl = document.getElementById('thumbCandidates_result');
    resEl.innerHTML = '<span class="muted">썸네일 후보 생성 중...</span>';
    RUN()
      .withSuccessHandler(function (res) {
        const list = (res && res.results) || [];
        if (!list.length) { resEl.innerHTML = '<span class="muted">생성된 후보가 없습니다</span>'; return; }
        let html = '<p class="muted" style="font-size:12px;">아래 목록을 눌러 확인하고, 마음에 드는 걸 다운로드해서 쓰세요.</p>';
        list.forEach(function (r) {
          if (r.error) { html += '<div style="color:#b45309;font-size:12px;">' + escapeHtml_(r.error) + '</div>'; return; }
          html += '<div class="row" style="margin-top:6px;align-items:center;">' +
            '<a class="btn-outline" style="flex:1;text-align:center;" href="' + r.viewUrl + '" target="_blank">👁 ' + escapeHtml_(r.orientation) + ' - ' + escapeHtml_(r.name) + '</a>' +
            '<a class="btn-outline" href="' + r.downloadUrl + '" target="_blank">⬇</a>' +
            '</div>';
        });
        if (res.folderUrl) html += '<div style="margin-top:8px;"><a href="' + res.folderUrl + '" target="_blank">보관 폴더 전체 열기</a></div>';
        resEl.innerHTML = html;
      })
      .withFailureHandler(function (e) { resEl.innerHTML = '<span class="muted">오류: ' + e.message + '</span>'; })
      .generateBlogThumbnailCandidates(blogReqRowIndex_, keywords);
  }

  let photoDownloadRowIndex_ = null;
  let photoDownloadCopyIds_ = [];
  function openPhotoDownloadModal(r) {
    photoDownloadRowIndex_ = r.rowIndex;
    photoDownloadCopyIds_ = [];
    document.getElementById('pdl_info').textContent =
      (r.date || '') + ' · ' + (r.address || '') + ' · ' + (r.content || '') + (r.mediaCount ? (' · 사진/영상 ' + r.mediaCount + '건') : '');
    document.getElementById('pdl_keyword').value = '';
    document.getElementById('pdl_form').classList.remove('hidden');
    document.getElementById('pdl_result').innerHTML = '';
    document.getElementById('photoDownloadModal').classList.remove('hidden');
  }

  function closePhotoDownloadModal_() {
    document.getElementById('photoDownloadModal').classList.add('hidden');
    if (photoDownloadCopyIds_.length) {
      toast('공유된 임시 사본이 남아있어 자동으로 정리합니다');
      RUN().withSuccessHandler(function(){}).withFailureHandler(function(){}).cleanupBlogPhotoDownloadLinks(photoDownloadCopyIds_);
      photoDownloadCopyIds_ = [];
    }
  }

  function submitPhotoDownloadRequest() {
    const keyword = document.getElementById('pdl_keyword').value.trim();
    if (!keyword) { toast('주요 키워드를 입력하세요'); return; }
    document.getElementById('pdl_result').innerHTML = '<span class="muted">준비 중...</span>';
    RUN()
      .withSuccessHandler(function (links) {
        const list = Array.isArray(links) ? links : [];
        photoDownloadCopyIds_ = list.map(l => l.id);
        if (!list.length) { document.getElementById('pdl_result').innerHTML = '<span class="muted">첨부된 사진이 없습니다</span>'; return; }
        document.getElementById('pdl_form').classList.add('hidden');
        document.getElementById('pdl_result').innerHTML =
          '<p class="muted" style="font-size:13px;">아래 목록을 순서대로 눌러서 다운로드하세요. 다운로드된 파일명이 문서의 사진 표시(예: [사진1])와 매칭됩니다.</p>' +
          list.map((l, i) => `<div class="row" style="margin-top:6px;align-items:center;">
            <a class="btn-outline" style="flex:1;text-align:center;" href="${l.url}" target="_blank" rel="noopener">⬇ ${i + 1}. ${escapeHtml_(l.name)}</a>
          </div>`).join('') +
          '<button class="btn-primary" style="width:100%;margin-top:12px;" onclick="finishPhotoDownload_()">다운로드 다 받았어요 (정리)</button>';
      })
      .withFailureHandler(function (e) { document.getElementById('pdl_result').innerHTML = '<span class="muted">오류: ' + e.message + '</span>'; })
      .prepareBlogPhotoDownloadLinks(photoDownloadRowIndex_, keyword);
  }

  function finishPhotoDownload_() {
    const ids = photoDownloadCopyIds_;
    photoDownloadCopyIds_ = [];
    RUN()
      .withSuccessHandler(function () { toast('정리 완료 ✅'); document.getElementById('photoDownloadModal').classList.add('hidden'); })
      .withFailureHandler(function (e) { toast('정리 중 오류: ' + e.message); })
      .cleanupBlogPhotoDownloadLinks(ids);
  }

  function applyAdmAgentFilter() {
    renderTable();
    renderAdmSearch_();
  }

  let incentiveCache = [];
  let pendingIncentiveEdits_ = {}; // rowIndex -> {ratePercent, subtitleCost} — "작성완료" 누르기 전까지 화면에만 보관
  function loadIncentive() {
    const dateEl = document.getElementById('incentiveDate');
    if (dateEl && !dateEl.value) dateEl.valueAsDate = new Date();
    const dateStr = dateEl ? dateEl.value : '';
    const body = document.getElementById('incentiveTableBody');
    if (body) body.innerHTML = '<tr><td colspan="10" class="muted" style="padding:12px;">불러오는 중...</td></tr>';
    pendingIncentiveEdits_ = {};
    RUN()
      .withSuccessHandler(function (rows) {
        incentiveCache = Array.isArray(rows) ? rows : [];
        renderIncentiveTable();
      })
      .withFailureHandler(function (e) {
        if (body) body.innerHTML = '<tr><td colspan="10" class="muted" style="padding:12px;">불러오기 실패: ' + e.message + '</td></tr>';
      })
      .getIncentiveList(currentUser.name, dateStr);
  }

  function pctFromRate(rate) {
    if (rate === '' || rate == null) return '';
    const n = Number(rate);
    if (isNaN(n)) return '';
    return Math.round(n * 100) + '%';
  }

  function renderIncentiveTable() {
    const body = document.getElementById('incentiveTableBody');
    if (!body) return;
    const list = incentiveCache;
    if (!list.length) { body.innerHTML = '<tr><td colspan="10" class="muted" style="padding:12px;">선택한 날짜에 기록이 없습니다.</td></tr>'; return; }
    body.innerHTML = list.map(function (r) {
      const incVal = (r.incentive === '' || r.incentive == null) ? '' : fmtMoney(r.incentive);
      const pending = pendingIncentiveEdits_[r.rowIndex];
      return `<tr onclick='openIncentiveModal(${jsonAttr_(r)})' style="cursor:pointer;${pending ? 'background:#fefce8;' : ''}">
        <td>${escapeHtml_(r.agent||'')}</td><td>${escapeHtml_(r.address||'')}</td><td>${escapeHtml_(r.content||'')}</td>
        <td>${fmtMoney(r.subtitle)}</td><td>${fmtMoney(r.price)}</td><td style="color:#16a34a;">${fmtMoney(r.margin)}</td>
        <td>${pctFromRate(r.incentiveRate)}</td>
        <td>${(r.subtitleCost===''||r.subtitleCost==null)?'':fmtMoney(r.subtitleCost)}</td>
        <td style="color:#8b5cf6;">${incVal}</td>
        <td><span class="badge">${pending ? '대기중' : '입력'}</span></td>
      </tr>`;
    }).join('');
  }

  function openIncentiveModal(r) {
    document.getElementById('inc_rowIndex').value = r.rowIndex;
    document.getElementById('inc_info').innerHTML =
      `${r.date} · ${r.agent||''} · ${r.address||''}<br>부제(F): <strong>${fmtMoney(r.subtitle)}</strong> · 원가(L): ${fmtMoney(r.price)}`;
    const curRate = (r.incentiveRate === '' || r.incentiveRate == null) ? '' : Math.round(Number(r.incentiveRate) * 100);
    document.getElementById('inc_rate').value = curRate;
    const curQ = (r.subtitleCost === '' || r.subtitleCost == null) ? r.price : r.subtitleCost;
    document.getElementById('inc_subCost').value = curQ;
    document.getElementById('inc_preview').textContent = '';
    updateIncPreview(r.subtitle);
    document.getElementById('incentiveModal').dataset.subtitle = r.subtitle;
    document.getElementById('incentiveModal').classList.remove('hidden');
    document.getElementById('inc_rate').oninput = () => updateIncPreview(r.subtitle);
    document.getElementById('inc_subCost').oninput = () => updateIncPreview(r.subtitle);
  }

  function updateIncPreview(subtitle) {
    const rate = Number(document.getElementById('inc_rate').value) || 0;
    const q = Number(document.getElementById('inc_subCost').value) || 0;
    const inc = (Number(subtitle) - q) * (rate / 100);
    // 실제 저장 시 R열 수식이 =ROUND((F-Q)*P,-3) 으로 1000원 단위 반올림하므로 미리보기도 동일하게 맞춤
    const rounded = Math.round(inc / 1000) * 1000;
    document.getElementById('inc_preview').innerHTML =
      `예상 인센티브 = (${fmtMoney(subtitle)} − ${fmtMoney(q)}) × ${rate}% = <strong style="color:#16a34a;">${fmtMoney(rounded)}</strong> (1,000원 단위 반올림)`;
  }

  // 여기서는 서버에 바로 저장하지 않고 화면(incentiveCache)에만 반영해둔다.
  // 실제 저장 + 알림발송은 "작성완료" 버튼(finishIncentiveBatch)에서 한 번에 처리한다.
  function saveIncentive() {
    const rowIndex = Number(document.getElementById('inc_rowIndex').value);
    const rate = document.getElementById('inc_rate').value;
    const q = document.getElementById('inc_subCost').value;
    pendingIncentiveEdits_[rowIndex] = { ratePercent: rate, subtitleCost: q };

    const row = incentiveCache.find(r => r.rowIndex === rowIndex);
    if (row) {
      const rateNum = Number(rate);
      const hasRate = !(rate === '' || rate == null || isNaN(rateNum));
      const qNum = Number(q) || 0;
      row.incentiveRate = hasRate ? rateNum / 100 : '';
      row.subtitleCost = q === '' ? '' : qNum;
      row.incentive = hasRate ? Math.round((Number(row.subtitle) - qNum) * (rateNum / 100) / 1000) * 1000 : '';
    }
    renderIncentiveTable();
    document.getElementById('incentiveModal').classList.add('hidden');
    toast('입력 반영됨 (아래 "작성완료" 눌러야 실제 저장 + 알림발송됩니다)');
  }

  function sendIncentiveBatch() {
    const dateEl = document.getElementById('incentiveDate');
    const dateStr = dateEl ? dateEl.value : '';
    const edits = Object.keys(pendingIncentiveEdits_).map(function (rowIndex) {
      const e = pendingIncentiveEdits_[rowIndex];
      return { rowIndex: Number(rowIndex), ratePercent: e.ratePercent, subtitleCost: e.subtitleCost };
    });
    if (!confirm('입력한 인센티브를 저장하고, 확정된 건을 직원별로 취합해서 알림 1통씩 보낼까요?')) return;
    RUN()
      .withSuccessHandler(function (res) {
        pendingIncentiveEdits_ = {};
        const results = (res && res.results) || [];
        if (!results.length) { toast('저장은 완료됐지만 발송할 인센티브가 없습니다'); loadIncentive(); return; }
        const lines = results.map(r => `${r.agent}: ${r.count}건 ${fmtMoney(r.total)} ${r.success ? '✅' : '❌(' + (r.message||'실패') + ')'}`);
        alert('저장 + 알림 일괄발송 결과\n\n' + lines.join('\n'));
        loadIncentive();
      })
      .withFailureHandler(e => toast('오류: ' + e.message))
      .saveAndSendIncentiveBatch(dateStr, edits);
  }

  let docKind = 'estimate';
  let docItems = [];

  let lastDocFileId = null;
  let lastDocFileName = '';

  let docEditState = { existingFileId: null, linkedRowIndex: null };

  function openDocModal(kind) {
    docKind = kind;
    docItems = [];
    lastDocFileId = null;
    lastDocFileName = '';
    docEditState = { existingFileId: null, linkedRowIndex: null };
    renderDocItems();
    document.getElementById('docModalTitle').textContent = kind === 'estimate' ? '견적서 작성' : '거래명세서 작성';
    document.getElementById('doc_client').value = '';
    document.getElementById('doc_date').valueAsDate = new Date();
    document.getElementById('docResult').innerHTML = '';
    document.getElementById('doc_emailTo').value = '';
    document.getElementById('docEmailResult').innerHTML = '';
    document.getElementById('docEditingBanner').classList.add('hidden');
    document.getElementById('docLinkPicked').classList.add('hidden');
    document.getElementById('docLinkSearchWrap').classList.remove('hidden');
    document.getElementById('doc_linkKw').value = '';
    document.getElementById('docLinkResult').innerHTML = '';
    document.getElementById('docModal').classList.remove('hidden');
    loadTodayDocsList(kind);
    loadBizCardStatus();
    loadBankBookStatus();
    loadCompanyBizRegStatus();
    loadRecentDocEmails_();
  }

  function loadRecentDocEmails_() {
    const dl = document.getElementById('docEmailList');
    if (!dl) return;
    RUN()
      .withSuccessHandler(function (list) {
        dl.innerHTML = (Array.isArray(list) ? list : []).map(function (e) {
          return '<option value="' + e + '"></option>';
        }).join('');
      })
      .withFailureHandler(function () {})
      .listRecentDocEmails();
  }

  /** 거래처명 입력란에서 벗어날 때, 예전에 이 거래처로 보낸 이메일이 있으면 자동으로 채워준다 (이미 입력돼 있으면 덮어쓰지 않음) */
  function autofillDocEmail() {
    const client = document.getElementById('doc_client').value.trim();
    const emailEl = document.getElementById('doc_emailTo');
    if (!client || !emailEl || emailEl.value.trim()) return;
    RUN()
      .withSuccessHandler(function (email) { if (email) emailEl.value = email; })
      .withFailureHandler(function () {})
      .getClientEmail(client);
  }

  function loadBizCardStatus() {
    const el = document.getElementById('bizCardStatus');
    if (!el) return;
    el.textContent = '';
    RUN()
      .withSuccessHandler(function (res) {
        if (res && res.exists) {
          el.innerHTML = '✅ 명함 등록됨 (' + res.fileName + ') — 계속 자동 첨부됩니다. 바꾸려면 아래에서 새로 선택하세요.';
        } else {
          el.textContent = '아직 등록된 명함이 없습니다.';
        }
      })
      .withFailureHandler(function () {})
      .getBusinessCardStatus();
  }

  function loadBankBookStatus() {
    const el = document.getElementById('bankBookStatus');
    const chk = document.getElementById('doc_attachBankBook');
    if (!el) return;
    el.textContent = '';
    if (chk) chk.disabled = true;
    RUN()
      .withSuccessHandler(function (res) {
        if (res && res.exists) {
          el.innerHTML = '✅ 등록됨 (' + res.fileName + ')';
          if (chk) chk.disabled = false;
        } else {
          el.textContent = '아직 등록된 통장사본이 없습니다.';
        }
      })
      .withFailureHandler(function () {})
      .getBankBookStatus();
  }

  function loadCompanyBizRegStatus() {
    const el = document.getElementById('companyBizRegStatus');
    const chk = document.getElementById('doc_attachBizReg');
    if (!el) return;
    el.textContent = '';
    if (chk) chk.disabled = true;
    RUN()
      .withSuccessHandler(function (res) {
        if (res && res.exists) {
          el.innerHTML = '✅ 등록됨 (' + res.fileName + ')';
          if (chk) chk.disabled = false;
        } else {
          el.textContent = '아직 등록된 사업자등록증이 없습니다.';
        }
      })
      .withFailureHandler(function () {})
      .getCompanyBizRegStatus();
  }

  function loadTodayDocsList(kind) {
    const wrap = document.getElementById('docTodayList');
    wrap.innerHTML = '<span class="muted">불러오는 중...</span>';
    RUN()
      .withSuccessHandler(function (rows) {
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) { wrap.innerHTML = '<span class="muted">오늘 작성한 ' + (kind === 'estimate' ? '견적서' : '거래명세서') + '가 없습니다.</span>'; return; }
        wrap.innerHTML = list.map(function (d) {
          return `<div style="padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick='loadDocForEdit("${escapeJsStr_(d.fileId)}")'>
            📄 ${escapeHtml_(d.client)} (${escapeHtml_(d.docDate)}) <span class="badge" style="float:right;">불러오기</span>
          </div>`;
        }).join('');
      })
      .withFailureHandler(function (e) { wrap.innerHTML = '<span class="muted">오류: ' + e.message + '</span>'; })
      .getTodayDocs(kind);
  }

  function loadDocForEdit(fileId) {
    RUN()
      .withSuccessHandler(function (doc) {
        if (!doc) { toast('불러오기 실패'); return; }
        docKind = doc.kind;
        document.getElementById('docModalTitle').textContent = doc.kind === 'estimate' ? '견적서 작성' : '거래명세서 작성';
        document.getElementById('doc_client').value = doc.client;
        document.getElementById('doc_date').value = doc.docDate;
        document.getElementById('doc_emailTo').value = doc.email || '';
        docItems = doc.items || [];
        renderDocItems();
        docEditState.existingFileId = doc.fileId;
        docEditState.linkedRowIndex = doc.linkedRowIndex || null;
        document.getElementById('docEditingBanner').classList.remove('hidden');
        document.getElementById('docEditingName').textContent = doc.fileName;
        if (docEditState.linkedRowIndex) {
          document.getElementById('docLinkPicked').classList.remove('hidden');
          document.getElementById('docLinkPickedText').textContent = '장부에 연결됨';
          document.getElementById('docLinkSearchWrap').classList.add('hidden');
        }
        document.getElementById('docResult').innerHTML = '';
        toast('불러왔습니다. 수정 후 "PDF 생성"을 누르면 같은 파일이 갱신됩니다.');
      })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); })
      .getDocByFileId(fileId);
  }

  function cancelDocEdit() {
    openDocModal(docKind);
  }

  // ====================== 견적서·거래명세서 관리 탭 (전체 기간) ======================
  function loadDocsManageTab() {
    const body = document.getElementById('docsMgBody');
    body.innerHTML = '<tr><td colspan="5" class="muted">불러오는 중...</td></tr>';
    const filters = {
      keyword: document.getElementById('docsMgKw').value,
      kind: document.getElementById('docsMgKind').value,
      dateFrom: document.getElementById('docsMgFrom').value,
      dateTo: document.getElementById('docsMgTo').value
    };
    RUN()
      .withSuccessHandler(function (rows) {
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) { body.innerHTML = '<tr><td colspan="5" class="muted">문서가 없습니다.</td></tr>'; return; }
        body.innerHTML = list.map(function (d) {
          const kindLabel = d.kind === 'estimate' ? '견적서' : '거래명세서';
          const linkBadge = d.linked
            ? '<span class="badge" style="background:#dcfce7;color:#166534;">연결됨</span>'
            : '<span class="badge">미연결</span>';
          const url = 'https://drive.google.com/file/d/' + encodeURIComponent(d.fileId) + '/view';
          return `<tr>
            <td>${escapeHtml_(d.docDate)}</td>
            <td>${kindLabel}</td>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml_(d.client)}">${escapeHtml_(d.client)}</td>
            <td>${linkBadge}</td>
            <td>
              <a href="${url}" target="_blank" class="btn-outline" style="padding:2px 8px;font-size:12px;text-decoration:none;">PDF 보기</a>
              <button class="btn-outline" style="padding:2px 8px;font-size:12px;" onclick='openDocForManageEdit("${escapeJsStr_(d.fileId)}","${d.kind}")'>수정</button>
              <button class="btn-danger" style="padding:2px 8px;font-size:12px;" onclick="deleteDocFromManage('${escapeJsStr_(d.fileId)}')">삭제</button>
            </td>
          </tr>`;
        }).join('');
      })
      .withFailureHandler(function (e) { body.innerHTML = '<tr><td colspan="5" class="muted">오류: ' + e.message + '</td></tr>'; })
      .getDocsForManage(filters);
  }

  function openDocForManageEdit(fileId, kind) {
    openDocModal(kind);
    loadDocForEdit(fileId);
  }

  function deleteDocFromManage(fileId) {
    if (!confirm('이 문서를 삭제할까요? (Drive 파일은 휴지통으로 이동되고, 장부에 연결돼 있었다면 연결도 함께 해제됩니다)')) return;
    RUN()
      .withSuccessHandler(function () { toast('삭제됨'); loadDocsManageTab(); })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); })
      .deleteDocRecord(fileId);
  }

  function doDocLinkSearch() {
    const kw = document.getElementById('doc_linkKw').value.trim();
    const el = document.getElementById('docLinkResult');
    if (!kw) { toast('검색어를 입력하세요'); return; }
    el.innerHTML = '<span class="muted">검색 중...</span>';
    RUN()
      .withSuccessHandler(function (rows) {
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) { el.innerHTML = '<span class="muted">검색 결과가 없습니다.</span>'; return; }
        el.innerHTML = list.slice(0, 15).map(function (r) {
          return `<div style="padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px;"
                    onclick='pickDocLink(${jsonAttr_(r)})'>
                    <strong>${escapeHtml_(r.date)}</strong> · ${escapeHtml_(r.address||'')} · ${escapeHtml_(r.content||'')}
                  </div>`;
        }).join('');
      })
      .withFailureHandler(function (e) { el.innerHTML = '<span class="muted">오류: ' + e.message + '</span>'; })
      .searchLedger(kw);
  }

  function pickDocLink(r) {
    docEditState.linkedRowIndex = r.rowIndex;
    document.getElementById('docLinkPicked').classList.remove('hidden');
    document.getElementById('docLinkPickedText').textContent = `${r.date} · ${r.address||''} 에 연결됨`;
    document.getElementById('docLinkSearchWrap').classList.add('hidden');
    document.getElementById('docLinkResult').innerHTML = '';
    // 이미 저장된(=fileId가 있는) 문서를 수정 중이면, PDF를 새로 만들지 않아도 지금 바로 연결을 저장한다.
    // (예전엔 "PDF 생성"을 눌러야만 연결이 저장돼서, PDF는 그대로 두고 장부 연결만 하려는 경우 저장할 방법이 없었음)
    if (docEditState.existingFileId) {
      RUN()
        .withSuccessHandler(function () { toast('장부 연결 저장됨'); })
        .withFailureHandler(function (e) { toast('연결 저장 실패: ' + e.message); })
        .linkDocToRow(docEditState.existingFileId, r.rowIndex);
    }
  }

  function clearDocLink() {
    docEditState.linkedRowIndex = null;
    document.getElementById('docLinkPicked').classList.add('hidden');
    document.getElementById('docLinkSearchWrap').classList.remove('hidden');
    if (docEditState.existingFileId) {
      RUN()
        .withSuccessHandler(function () { toast('장부 연결 해제됨'); })
        .withFailureHandler(function (e) { toast('연결 해제 실패: ' + e.message); })
        .unlinkDocByFileId(docEditState.existingFileId);
    }
  }

  function addDocItem() {
    const name = document.getElementById('doc_itemName').value.trim();
    const spec = document.getElementById('doc_itemSpec').value.trim();
    // 음수/0을 입력하면 합계가 음수가 돼서 한글 금액("금 원정")이 빈칸으로 나오는 등 문서가 이상하게 나가서 막는다
    const qty = Math.max(1, Number(document.getElementById('doc_itemQty').value) || 1);
    const price = numVal('doc_itemPrice');
    const note = document.getElementById('doc_itemNote').value.trim();
    if (!name) { toast('품목명을 입력하세요'); return; }
    docItems.push({ name, spec, qty, price, note });
    ['doc_itemName','doc_itemSpec','doc_itemNote'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('doc_itemQty').value = 1;
    document.getElementById('doc_itemPrice').value = '';
    renderDocItems();
  }

  function removeDocItem(i) { docItems.splice(i, 1); renderDocItems(); }

  function renderDocItems() {
    const el = document.getElementById('docItemList');
    el.innerHTML = docItems.map((it, i) => {
      const supply = (it.qty && it.price) ? it.qty * it.price : 0;
      return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span style="flex:2;">${it.name}${it.spec ? ' ('+it.spec+')' : ''}</span>
        <span style="flex:1;">x${it.qty}</span>
        <span style="flex:1;">${fmtMoney(it.price)}</span>
        <span style="flex:1;">${fmtMoney(supply)}</span>
        <button class="btn-danger" style="padding:2px 8px;font-size:12px;" onclick="removeDocItem(${i})">×</button>
      </div>`;
    }).join('');
    const totalSupply = docItems.reduce((s,it) => s + (it.qty*it.price||0), 0);
    const totalTax = Math.round(totalSupply * 0.1);
    document.getElementById('docItemTotal').textContent =
      `공급가액 ${fmtMoney(totalSupply)} + 세액 ${fmtMoney(totalTax)} = 합계 ${fmtMoney(totalSupply+totalTax)}`;
  }

  function submitDoc() {
    const btn = document.getElementById('docSubmitBtn');
    if (btn.disabled) return; // 이미 생성 요청이 진행 중 — 중복 클릭으로 문서가 두 번 생성되는 것을 방지
    const client = document.getElementById('doc_client').value.trim();
    const dateStr = document.getElementById('doc_date').value;
    const resultEl = document.getElementById('docResult');
    if (!client) { toast('거래처명을 입력하세요'); return; }
    if (!dateStr) { toast('날짜를 선택하세요'); return; }
    if (!docItems.length) { toast('품목을 1개 이상 추가하세요'); return; }
    const [y, m, d] = dateStr.split('-').map(Number);

    btn.disabled = true;
    resultEl.innerHTML = '<span class="muted">PDF 생성 중...</span>';
    const fn = (docKind === 'estimate') ? 'generateEstimate' : 'generateStatement';
    RUN()
      .withSuccessHandler(function (res) {
        btn.disabled = false;
        if (res && res.success) {
          resultEl.innerHTML = `✅ 생성 완료: <a href="${res.url}" target="_blank" rel="noopener">${res.fileName} 열기 ↗</a>`;
          lastDocFileId = res.fileId;
          lastDocFileName = res.fileName;
          docEditState.existingFileId = res.fileId;
          document.getElementById('docEditingBanner').classList.remove('hidden');
          document.getElementById('docEditingName').textContent = res.fileName;
          document.getElementById('docEmailResult').innerHTML = '';
          loadTodayDocsList(docKind);
        } else {
          resultEl.innerHTML = '<span class="muted">생성 실패</span>';
        }
      })
      .withFailureHandler(function (e) {
        btn.disabled = false;
        resultEl.innerHTML = '<span class="muted">오류: ' + e.message + '</span>';
      })
      [fn](client, y, m, d, docItems, docEditState.existingFileId, docEditState.linkedRowIndex, currentUser.name);
  }

  function handleBizCardUpload(inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    const status = document.getElementById('bizCardStatus');
    status.textContent = '등록 중...';
    const reader = new FileReader();
    reader.onload = function () {
      const base64 = reader.result.split(',')[1];
      RUN()
        .withSuccessHandler(function () { status.textContent = '등록됨 ✅ (앞으로 자동 첨부됩니다)'; })
        .withFailureHandler(function (e) { status.textContent = '오류: ' + e.message; })
        .uploadBusinessCard(base64, file.type, file.name);
    };
    reader.readAsDataURL(file);
  }

  function handleBankBookUpload(inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    const status = document.getElementById('bankBookStatus');
    status.textContent = '등록 중...';
    const reader = new FileReader();
    reader.onload = function () {
      const base64 = reader.result.split(',')[1];
      RUN()
        .withSuccessHandler(function () { loadBankBookStatus(); })
        .withFailureHandler(function (e) { status.textContent = '오류: ' + e.message; })
        .uploadBankBook(base64, file.type, file.name);
    };
    reader.readAsDataURL(file);
  }

  function handleCompanyBizRegUpload(inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    const status = document.getElementById('companyBizRegStatus');
    status.textContent = '등록 중...';
    const reader = new FileReader();
    reader.onload = function () {
      const base64 = reader.result.split(',')[1];
      RUN()
        .withSuccessHandler(function () { loadCompanyBizRegStatus(); })
        .withFailureHandler(function (e) { status.textContent = '오류: ' + e.message; })
        .uploadCompanyBizReg(base64, file.type, file.name);
    };
    reader.readAsDataURL(file);
  }

  function sendDocEmail() {
    const email = document.getElementById('doc_emailTo').value.trim();
    const resultEl = document.getElementById('docEmailResult');
    if (!email) { toast('이메일 주소를 입력하세요'); return; }
    if (!lastDocFileId) { toast('먼저 PDF를 생성하세요'); return; }
    const client = document.getElementById('doc_client').value.trim();
    const attachBankBook = document.getElementById('doc_attachBankBook').checked;
    const attachBizReg = document.getElementById('doc_attachBizReg').checked;
    resultEl.innerHTML = '<span class="muted">이메일 보내는 중...</span>';
    RUN()
      .withSuccessHandler(function (res) {
        if (!res || !res.success) { resultEl.innerHTML = '<span class="muted">발송 실패</span>'; return; }
        const warnings = (res.warnings && res.warnings.length) ? ' — ⚠ ' + res.warnings.map(escapeHtml_).join(', ') : '';
        resultEl.innerHTML = '✅ ' + escapeHtml_(email) + ' 로 발송 완료' + warnings;
      })
      .withFailureHandler(function (e) {
        resultEl.innerHTML = '<span class="muted">오류: ' + e.message + '</span>';
      })
      .sendDocEmail(lastDocFileId, lastDocFileName, email, docKind, client, attachBankBook, attachBizReg);
  }

  // 위쪽(오늘/이번달 통계)과 아래쪽(미수금)을 따로 요청한다 — 미수금은 전체 이력을 다 훑어야 해서
  // 느린데, 통계는 최근 데이터만 보면 되니까 미수금을 기다리지 않고 화면 위쪽부터 먼저 뜨게 하기 위함.
  /**
   * 대시보드 첫 화면. 예전엔 서버를 4번 따로 불렀는데(통계/미수금/세금계산서/현금미수령),
   * 호출마다 스프레드시트를 새로 열고 장부를 통째로 다시 읽어서 느렸다.
   * 이제 getDashboardBundle 한 번으로 받아온다 — 서버가 장부를 한 번만 읽는다(2026-08-02).
   */
  function loadDashboard() {
    const sumEl = document.getElementById('dashSummary');
    if (sumEl) sumEl.innerHTML = '<span class="muted">불러오는 중...</span>';
    const unpaidBody = document.getElementById('dashUnpaidBody');
    if (unpaidBody) unpaidBody.innerHTML = '<tr><td colspan="9" class="muted" style="padding:12px;">불러오는 중...</td></tr>';
    const taxBody = document.getElementById('dashTaxBody');
    if (taxBody) taxBody.innerHTML = '<tr><td colspan="6" class="muted" style="padding:12px;">불러오는 중...</td></tr>';
    const cashBody = document.getElementById('dashCashBody');
    if (cashBody) cashBody.innerHTML = '<tr><td colspan="6" class="muted" style="padding:12px;">불러오는 중...</td></tr>';

    RUN()
      .withSuccessHandler(function (res) {
        res = res || {};
        // 한 부분이 실패해도 나머지는 그리도록, 각각 따로 처리한다.
        if (res.stats) renderDashboardStats(res.stats);
        else if (sumEl) sumEl.innerHTML = '<span class="muted">불러오기 실패: ' + (res.statsError || '알 수 없음') + '</span>';

        if (res.unpaid) renderDashboardUnpaid(res.unpaid);
        else if (unpaidBody) unpaidBody.innerHTML = '<tr><td colspan="9" class="muted">불러오기 실패: ' + (res.unpaidError || '알 수 없음') + '</td></tr>';

        renderTodayTax_(res.tax || []);
        renderTodayCash_(res.cash || []);
        markLoadDone_(); // 로딩 시간 배지 갱신(어디가 느린지 사장님 폰에서 바로 보이게)
      })
      .withFailureHandler(function (e) {
        if (sumEl) sumEl.innerHTML = '<span class="muted">불러오기 실패: ' + e.message + '</span>';
        if (unpaidBody) unpaidBody.innerHTML = '<tr><td colspan="9" class="muted">불러오기 실패: ' + e.message + '</td></tr>';
        if (taxBody) taxBody.innerHTML = '<tr><td colspan="6" class="muted">불러오기 실패: ' + e.message + '</td></tr>';
        if (cashBody) cashBody.innerHTML = '<tr><td colspan="6" class="muted">불러오기 실패: ' + e.message + '</td></tr>';
      })
      .getDashboardBundle();
  }

  /**
   * "전체 다시 확인" — 스캔 표시를 지워서 장부 전체를 다시 훑게 한 뒤 대시보드를 새로 불러온다.
   * 평소엔 이미 처리된 위쪽을 건너뛰어 빠르지만, 스프레드시트를 직접 고쳐 오래된 건이 다시
   * 미확인/미발급이 된 경우를 즉시 반영하고 싶을 때 쓴다(그냥 두면 하루 한 번 자동으로 잡힌다).
   */
  function doFullLedgerRescan(btnEl) {
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '확인 중...'; }
    RUN()
      .withSuccessHandler(function () {
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = '🔄 전체 다시 확인'; }
        toast('장부 전체를 다시 확인합니다');
        loadDashboard();
      })
      .withFailureHandler(function (e) {
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = '🔄 전체 다시 확인'; }
        toast('오류: ' + e.message);
      })
      .forceFullLedgerScan();
  }

  /** 그리는 부분만 떼어냈다 — 첫 화면은 묶음(getDashboardBundle)에서 받은 걸 그대로 넘기고,
   *  완료/제외 처리 후에는 loadTodayTax()로 그 목록만 다시 받아 그린다. */
  function renderTodayTax_(rows) {
    const body = document.getElementById('dashTaxBody');
    if (!body) return;
    const list = Array.isArray(rows) ? rows : [];
    const cnt = document.getElementById('dashTaxCount');
    if (cnt) cnt.textContent = list.length + '건';
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:12px;">세금계산서 미발급 건이 없습니다 👍</td></tr>';
      return;
    }
    body.innerHTML = list.map(r => `
      <tr onclick='editRowInForm(${jsonAttr_(r)})' style="cursor:pointer;">
        <td>${escapeHtml_(r.date||'')}</td><td>${escapeHtml_(r.address||'')}</td><td>${escapeHtml_(r.content||'')}</td><td style="background:#EAD1DC;">${fmtMoney(r.amount)}</td><td style="background:#B7E1CD;">${escapeHtml_(r.agent||'')}</td>
        <td>
          <button class="btn-outline" style="padding:4px 8px;font-size:12px;" onclick='event.stopPropagation();openBizRegModal(${jsonAttr_(r)})'>보기</button>
          <button class="btn-primary" style="padding:4px 8px;font-size:12px;" onclick='event.stopPropagation();doTaxDone(${jsonAttr_(r)}, this)'>완료</button>
          <button class="btn-danger" style="padding:4px 8px;font-size:12px;" onclick='event.stopPropagation();doTaxExclude(${jsonAttr_(r)}, this)'>제외</button>
        </td>
      </tr>`).join('');
  }

  function loadTodayTax() {
    const body = document.getElementById('dashTaxBody');
    if (body) body.innerHTML = '<tr><td colspan="6" class="muted" style="padding:12px;">불러오는 중...</td></tr>';
    RUN()
      .withSuccessHandler(renderTodayTax_)
      .withFailureHandler(function (e) {
        if (body) body.innerHTML = '<tr><td colspan="6" class="muted">불러오기 실패: '+e.message+'</td></tr>';
      })
      .getTodayTaxInvoices();
  }

  function doTaxDone(r, btnEl) {
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '처리중...'; }
    RUN()
      .withSuccessHandler(function (res) {
        if (res && res.success) {
          toast('완료 처리됨 ✅');
        } else {
          toast((res && res.message) || '처리하지 못했습니다.');
        }
        loadTodayTax();
      })
      .withFailureHandler(function (e) {
        toast('오류: ' + e.message);
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = '완료'; }
      })
      .markTaxInvoiceDone(r.date, r.address, r.amount);
  }

  function doTaxExclude(r, btnEl) {
    if (!confirm('이 항목을 세금계산서 목록에서 제외할까요?\n(장부 데이터는 그대로 유지되고, 대시보드 목록에서만 안 보이게 됩니다)')) return;
    if (btnEl) { btnEl.disabled = true; }
    RUN()
      .withSuccessHandler(function () {
        toast('목록에서 제외했습니다');
        loadTodayTax();
      })
      .withFailureHandler(function (e) {
        toast('오류: ' + e.message);
        if (btnEl) { btnEl.disabled = false; }
      })
      .excludeTaxInvoice(r.date, r.address, r.amount);
  }

  /** 그리는 부분만 분리(loadTodayTax와 같은 이유). */
  function renderTodayCash_(rows) {
    const body = document.getElementById('dashCashBody');
    if (!body) return;
    const list = Array.isArray(rows) ? rows : [];
    const cnt = document.getElementById('dashCashCount');
    if (cnt) cnt.textContent = list.length + '건';
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:12px;">현금 미수령 건이 없습니다 👍</td></tr>';
      return;
    }
    body.innerHTML = list.map(r => `
      <tr>
        <td>${escapeHtml_(r.date||'')}</td><td>${escapeHtml_(r.address||'')}</td><td>${escapeHtml_(r.content||'')}</td><td style="background:#EAD1DC;">${fmtMoney(r.amount)}</td><td style="background:#B7E1CD;">${escapeHtml_(r.agent||'')}</td>
        <td><button class="btn-primary" style="padding:4px 10px;font-size:12px;" onclick="doCashDone(${r.rowIndex}, this)">완료</button></td>
      </tr>`).join('');
  }

  function loadTodayCash() {
    const body = document.getElementById('dashCashBody');
    if (body) body.innerHTML = '<tr><td colspan="6" class="muted" style="padding:12px;">불러오는 중...</td></tr>';
    RUN()
      .withSuccessHandler(renderTodayCash_)
      .withFailureHandler(function (e) {
        if (body) body.innerHTML = '<tr><td colspan="6" class="muted">불러오기 실패: '+e.message+'</td></tr>';
      })
      .getTodayCashPending();
  }

  function doCashDone(rowIndex, btnEl) {
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '처리중...'; }
    RUN()
      .withSuccessHandler(function () {
        toast('수령 확인됨 ✅');
        loadTodayCash();
      })
      .withFailureHandler(function (e) {
        toast('오류: ' + e.message);
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = '완료'; }
      })
      .markCashDone(rowIndex);
  }

  let unpaidNoteTarget_ = null; // {rowIndex, btnEl}

  function doUnpaidDone(rowIndex, btnEl) {
    unpaidNoteTarget_ = { rowIndex: rowIndex, btnEl: btnEl };
    const noteInput = document.getElementById('un_note');
    if (noteInput) noteInput.value = '';
    document.getElementById('unpaidNoteModal').classList.remove('hidden');
    if (noteInput) noteInput.focus();
  }

  function closeUnpaidNoteModal_() {
    document.getElementById('unpaidNoteModal').classList.add('hidden');
    unpaidNoteTarget_ = null;
  }

  function submitUnpaidDone_() {
    if (!unpaidNoteTarget_) return;
    const rowIndex = unpaidNoteTarget_.rowIndex;
    const btnEl = unpaidNoteTarget_.btnEl;
    const note = document.getElementById('un_note').value.trim();
    document.getElementById('unpaidNoteModal').classList.add('hidden');
    unpaidNoteTarget_ = null;
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '처리중...'; }
    RUN()
      .withSuccessHandler(function () {
        toast('입금 확인 처리됨 ✅');
        loadDashboard();
      })
      .withFailureHandler(function (e) {
        toast('오류: ' + e.message);
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = '완료'; }
      })
      .markCashDone(rowIndex, note);
  }

  function pctDelta(cur, prev) {
    if (!prev) return cur > 0 ? { txt: '신규', cls: 'delta-up' } : { txt: '-', cls: '' };
    const p = Math.round((cur - prev) / prev * 100);
    if (p > 0) return { txt: '▲ ' + p + '% (지난달 대비)', cls: 'delta-up' };
    if (p < 0) return { txt: '▼ ' + Math.abs(p) + '% (지난달 대비)', cls: 'delta-down' };
    return { txt: '지난달과 동일', cls: '' };
  }

  function renderDashboardStats(d) {
    if (!d) return;
    const td = d.today || {count:0,total:0,margin:0};
    const tm = d.thisMonth, lm = d.lastMonth;
    const tAvg = d.thisMonthAvg || {total:0,margin:0,count:0,workDays:0};
    const lAvg = d.lastMonthAvg || {total:0,margin:0,count:0,workDays:0};
    const dTotal = pctDelta(tAvg.total, lAvg.total);
    const dMargin = pctDelta(tAvg.margin, lAvg.margin);
    const dCount = pctDelta(tAvg.count, lAvg.count);
    const avgNote = '일평균 기준 (이번달 ' + tAvg.workDays + '일 / 지난달 ' + lAvg.workDays + '일 일함)';
    document.getElementById('dashSummary').innerHTML = `
      <div class="stat-card" style="border-color:#2563eb;background:#eff6ff;">
        <div class="stat-label">오늘 매출</div>
        <div class="stat-value">${fmtMoney(td.total)}</div>
        <div class="stat-delta">${td.count}건 · 마진 <span style="color:#16a34a;">${fmtMoney(td.margin)}</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">이번 달 매출</div>
        <div class="stat-value">${fmtMoney(tm.total)}</div>
        <div class="stat-delta ${dTotal.cls}">${dTotal.txt}</div>
        <div class="stat-delta" style="color:var(--muted);">일평균 ${fmtMoney(Math.round(tAvg.total))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">이번 달 마진</div>
        <div class="stat-value" style="color:#16a34a;">${fmtMoney(tm.margin)}</div>
        <div class="stat-delta ${dMargin.cls}">${dMargin.txt}</div>
        <div class="stat-delta" style="color:var(--muted);">일평균 ${fmtMoney(Math.round(tAvg.margin))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">이번 달 건수</div>
        <div class="stat-value">${tm.count}건</div>
        <div class="stat-delta ${dCount.cls}">${dCount.txt}</div>
        <div class="stat-delta" style="color:var(--muted);">일평균 ${tAvg.count.toFixed(1)}건</div>
      </div>
      <div style="flex-basis:100%;font-size:11px;color:var(--muted);margin-top:-4px;">${avgNote}</div>`;

    // 본사 화면에선 아래 지사별 비교(dashBranchTrendCard)가 본사 자신의 추이도 포함해서 보여주므로
    // 단일-지점용 추이 카드는 숨긴다. 지점(인천/남양주) 화면은 branchTrend가 안 오므로 그대로 유지.
    const branchTrend = d.branchTrend || [];
    const trendCard = document.getElementById('dashTrendCard');
    if (trendCard) trendCard.classList.toggle('hidden', branchTrend.length > 0);
    document.getElementById('dashTrend').innerHTML = buildTrendBarsHtml_(d.trend || []);

    const todayAgents = d.todayAgents || [];
    const todayEl = document.getElementById('dashTodayAgents');
    if (todayEl) {
      if (!todayAgents.length) {
        todayEl.innerHTML = '<span class="muted">오늘 실적이 없습니다.</span>';
      } else {
        todayEl.innerHTML = todayAgents.map(function (a, i) {
          return `<div class="rank-row">
            <span class="rank-num">${i+1}</span>
            <span style="flex:1;font-weight:600;">${a.name}</span>
            <span style="flex:1;text-align:right;">매출 ${fmtMoney(a.total)}</span>
            <span style="flex:1;text-align:right;color:#16a34a;">마진 ${fmtMoney(a.margin)}</span>
            <span style="width:50px;text-align:right;color:var(--muted);">${a.count}건</span>
          </div>`;
        }).join('');
      }
    }

    const agents = d.agents || [];
    if (!agents.length) {
      document.getElementById('dashAgents').innerHTML = '<span class="muted">이번 달 실적이 없습니다.</span>';
    } else {
      document.getElementById('dashAgents').innerHTML = agents.map(function (a, i) {
        return `<div class="rank-row">
          <span class="rank-num">${i+1}</span>
          <span style="flex:1;font-weight:600;">${a.name}</span>
          <span style="flex:1;text-align:right;">매출 ${fmtMoney(a.total)}</span>
          <span style="flex:1;text-align:right;color:#16a34a;">마진 ${fmtMoney(a.margin)}</span>
          <span style="flex:1;text-align:right;color:#8b5cf6;">인센 ${fmtMoney(a.incentive||0)}</span>
          <span style="width:44px;text-align:right;color:var(--muted);">${a.count}건</span>
        </div>`;
      }).join('');
    }

    renderDashBranchTrend_(branchTrend);
  }

  function renderDashboardUnpaid(d) {
    if (!d) return;
    document.getElementById('dashUnpaidTotal').textContent =
      '총 ' + (d.unpaidCount || 0) + '건 · ' + fmtMoney(d.unpaidTotal || 0);
    dashUnpaidCache_ = d.unpaid || [];
    populateDashUnpaidFilters_(dashUnpaidCache_);
    renderDashUnpaid_();
  }

  /**
   * 최근 7일 매출(파란 막대)·마진(초록 막대, 겹쳐서) 추이 + 7일 합계/일평균. dashTrend와 지사별 카드가 공용으로 씀.
   * 일평균은 7로 그냥 나누지 않고 그 중 "기록이 있는 날"(실제 출장/장부 작성일) 수로 나눈다 — 공휴일 등
   * 아무 기록 없는 날까지 나눗셈에 끼면 실제보다 낮은 일평균이 나오기 때문(월간 일평균과 동일한 기준).
   */
  function buildTrendBarsHtml_(trend) {
    const maxTotal = Math.max(1, ...trend.map(t => t.total));
    const trendSumTotal = trend.reduce(function (s, t) { return s + t.total; }, 0);
    const trendSumMargin = trend.reduce(function (s, t) { return s + t.margin; }, 0);
    const workDays = trend.filter(function (t) { return (t.count || 0) > 0; }).length;
    const trendN = workDays || trend.length || 1;
    return trend.map(function (t) {
      const w = Math.round(t.total / maxTotal * 100);
      const mw = t.total ? Math.round(t.margin / maxTotal * 100) : 0;
      const label = t.day.slice(5).replace('-', '/');
      return `<div class="bar-row">
        <span class="bar-label">${label}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${w}%;"></div>
          <div class="bar-fill margin" style="width:${mw}%;height:8px;top:auto;bottom:0;opacity:.9;"></div>
        </div>
        <span class="bar-val">${fmtMoney(t.total)}<br><span style="color:#16a34a;">${fmtMoney(t.margin)}</span></span>
      </div>`;
    }).join('') + '<div class="muted" style="font-size:12px;margin-top:6px;">파란색=매출, 초록색=마진</div>' +
      `<div style="margin-top:8px;font-size:13px;">
        <strong>7일 합계</strong> 매출 ${fmtMoney(trendSumTotal)} · 마진 <span style="color:#16a34a;">${fmtMoney(trendSumMargin)}</span>
        &nbsp;&nbsp;<strong>일평균</strong> 매출 ${fmtMoney(Math.round(trendSumTotal / trendN))} · 마진 <span style="color:#16a34a;">${fmtMoney(Math.round(trendSumMargin / trendN))}</span>
        <span class="muted">(일한 ${workDays}일 기준)</span>
      </div>`;
  }

  const BRANCH_COLORS_ = ['#2563eb', '#dc2626', '#7c3aed', '#0891b2', '#db2777']; // 본사=파랑, 인천=빨강

  /**
   * 본사 화면에서만: 같은 날짜 아래에 지사별(본사/인천, 남양주는 아직 오픈 전이라 제외) 막대를 색상만 다르게 이어붙여서 비교.
   * 매출 막대는 지사 색, 마진 막대(겹침)는 기존과 동일하게 초록색으로 통일해서 다른 위젯과 혼동 없게 함.
   */
  function renderDashBranchTrend_(branchTrend) {
    const card = document.getElementById('dashBranchTrendCard');
    if (!card) return;
    if (!branchTrend.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');

    document.getElementById('dashBranchTrendLegend').innerHTML = branchTrend.map(function (bt, i) {
      const color = BRANCH_COLORS_[i % BRANCH_COLORS_.length];
      return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;"></span>${escapeHtml_(bt.branch)}
      </span>`;
    }).join('') + '<span class="muted">(겹친 초록 막대 = 마진, 지사 공통)</span>';

    const days = branchTrend[0].days || [];
    let maxTotal = 1;
    branchTrend.forEach(function (bt) { bt.days.forEach(function (d) { maxTotal = Math.max(maxTotal, d.total); }); });

    document.getElementById('dashBranchTrendBody').innerHTML = days.map(function (day, di) {
      const label = String(day.day).slice(5).replace('-', '/');
      const rows = branchTrend.map(function (bt, bi) {
        const d = bt.days[di];
        const color = BRANCH_COLORS_[bi % BRANCH_COLORS_.length];
        const w = Math.round(d.total / maxTotal * 100);
        const mw = d.total ? Math.round(d.margin / maxTotal * 100) : 0;
        return `<div class="bar-row">
          <span class="bar-label">${escapeHtml_(bt.branch)}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width:${w}%;background:${color};"></div>
            <div class="bar-fill margin" style="width:${mw}%;height:8px;top:auto;bottom:0;opacity:.9;"></div>
          </div>
          <span class="bar-val">${fmtMoney(d.total)}<br><span style="color:#16a34a;">${fmtMoney(d.margin)}</span></span>
        </div>`;
      }).join('');
      return `<div style="margin-bottom:14px;">
        <div style="font-weight:600;font-size:13px;margin-bottom:2px;">${label}</div>
        ${rows}
      </div>`;
    }).join('');
  }

  let dashUnpaidCache_ = [];

  /** 출처/출장자/입금형태 필터의 체크박스 목록을 실제 미수금 데이터에 있는 값들로 채운다 (엑셀 필터처럼) */
  function populateDashUnpaidFilters_(rows) {
    msfUpdateOptions_('dashUnpaidSourceFilter', rows, 'source', '전체 출처');
    msfUpdateOptions_('dashUnpaidAgentFilter', rows, 'agent', '전체 출장자');
    msfUpdateOptions_('dashUnpaidPayFilter', rows, 'payType', '전체 입금형태');
  }

  /** 선택된 출처/출장자/입금형태 필터(다중선택)를 적용해서 미수금 표를 다시 그린다 */
  function renderDashUnpaid_() {
    const body = document.getElementById('dashUnpaidBody');
    if (!body) return;
    const unpaid = msfFilter_(msfFilter_(msfFilter_(dashUnpaidCache_, 'dashUnpaidSourceFilter', 'source'), 'dashUnpaidAgentFilter', 'agent'), 'dashUnpaidPayFilter', 'payType');
    if (!unpaid.length) {
      body.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;padding:12px;">조건에 맞는 미수금이 없습니다 👍</td></tr>';
    } else {
      body.innerHTML = unpaid.map(u => `
        <tr onclick='editRowInForm(${jsonAttr_(u)})' style="cursor:pointer;">
          <td style="white-space:nowrap;">${escapeHtml_(u.date)}</td>${truncTd_(u.address||'', 190)}${truncTd_(u.content||'', 190)}<td style="background:#B7E1CD;">${escapeHtml_(u.agent||'')}</td>
          <td>${escapeHtml_(u.source||'')}</td>
          <td style="white-space:nowrap;background:#EAD1DC;">${fmtMoney(u.amount)}</td><td>${payTypeShort_(u.payType)}</td>${truncTd_(u.note||'', 114)}
          <td><button class="btn-primary" style="padding:4px 10px;font-size:12px;" onclick="event.stopPropagation();doUnpaidDone(${u.rowIndex}, this)">완료</button></td>
        </tr>`).join('');
    }
  }

  /**
   * "재고·단가 관리" 탭. 예전엔 getLocations → (끝나면) getStockList → (끝나면) loadStockForForm()이
   * 다시 3개, 게다가 getPriceList까지 따로 나가서 서버 실행이 6개나 떴다(앞의 둘은 순차라 더 느렸다).
   * 세 목록이 전부 같은 스프레드시트에서 나오므로 getFormBundle 한 번으로 끝낸다(2026-08-13).
   */
  function loadStockAndPrice() {
    RUN()
      .withSuccessHandler(function (res) {
        res = res || {};
        locationsCache = Array.isArray(res.locations) ? res.locations : [];
        renderLocationList();

        applyStockList_(res.stock); // stockCache 갱신 + 기록입력 화면의 대분류 드롭다운까지 같이 채움
        renderStockTable();
        const majorList = document.getElementById('am_majorList');
        if (majorList) {
          const majors = Array.from(new Set(stockCache.map(s => s.major).filter(Boolean)));
          majorList.innerHTML = majors.map(m => `<option value="${m}"></option>`).join('');
        }

        priceCache = Array.isArray(res.prices) ? res.prices : [];
        priceListCache = priceCache; // 기록입력의 "자재 직접입력" 자동완성이 쓰는 캐시도 같이 채움
        renderPriceTable();
      })
      .getFormBundle();
  }

  /** 검색어와 대상 문자열의 띄어쓰기를 무시하고 부분일치 비교 (예: "도어 클로저" ↔ "도어클로저"). */
  function normKw_(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '');
  }

  function renderPriceTable() {
    const body = document.getElementById('priceTableBody');
    if (!body) return;
    const kw = normKw_(document.getElementById('priceSearchInput') ? document.getElementById('priceSearchInput').value : '');
    const list = !kw ? priceCache : priceCache.filter(p =>
      [p.buyer, p.brand, p.type, p.name].some(f => normKw_(f).indexOf(kw) !== -1));
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;padding:12px;">' +
        (kw ? '검색 결과가 없습니다.' : '등록된 자재단가가 없습니다.') + '</td></tr>';
      return;
    }
    body.innerHTML = list.map(p => `
      <tr>
        <td>${escapeHtml_(p.buyer||'')}</td><td>${escapeHtml_(p.brand||'')}</td>
        <td class="col-div">${escapeHtml_(p.type||'')}</td><td>${escapeHtml_(p.name||'')}</td>
        <td>${fmtMoney(p.supply)}</td>
        <td class="${p.tax === '' ? 'mat-blank' : ''}">${p.tax === '' ? '-' : fmtMoney(p.tax)}</td>
        <td class="col-div ${p.amount === '' ? 'mat-blank' : ''}">${p.amount === '' ? '-' : fmtMoney(p.amount)}</td>
        <td>${escapeHtml_(p.registeredDate||'')}</td><td>${escapeHtml_(p.registeredBy||'')}</td>
        <td><button class="btn-outline" style="padding:2px 8px;font-size:12px;" onclick="openPriceHistory('${escapeJsStr_(p.buyer||'')}','${escapeJsStr_(p.name||'')}')">이력</button></td>
      </tr>`).join('');
  }

  function openPriceHistory(buyer, name) {
    document.getElementById('priceHistoryTitle').textContent = name + ' 가격 이력' + (buyer ? ' (' + buyer + ')' : '');
    const body = document.getElementById('priceHistoryBody');
    body.innerHTML = '<p class="muted">불러오는 중...</p>';
    document.getElementById('priceHistoryModal').classList.remove('hidden');
    RUN()
      .withSuccessHandler(function (rows) {
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) { body.innerHTML = '<p class="muted">이력이 없습니다.</p>'; return; }
        body.innerHTML = list.map(function (r, i) {
          const prev = i > 0 ? list[i - 1] : null;
          const cur = r.amount !== '' ? r.amount : r.supply;
          const prevAmt = prev ? (prev.amount !== '' ? prev.amount : prev.supply) : null;
          let diff = '';
          if (prevAmt != null && prevAmt > 0) {
            const d = cur - prevAmt;
            if (d > 0) diff = ' <span style="color:#ef4444;">▲' + fmtMoney(d) + '</span>';
            else if (d < 0) diff = ' <span style="color:#3b82f6;">▼' + fmtMoney(-d) + '</span>';
          }
          return '<div style="padding:8px 0;border-bottom:1px solid #eee;">' +
            '<span class="muted">' + escapeHtml_(r.registeredDate || '(날짜 미상)') + (r.buyer ? ' · ' + escapeHtml_(r.buyer) : '') + '</span><br>' +
            '<strong>' + fmtMoney(cur) + '</strong>' + diff +
            '</div>';
        }).join('');
      })
      .getPriceHistory(buyer, name);
  }

  function renderLocationList() {
    const el = document.getElementById('locationList');
    if (!el) return;
    if (!locationsCache.length) { el.innerHTML = '<span class="muted">등록된 위치가 없습니다.</span>'; return; }
    el.innerHTML = locationsCache.map(function (l) {
      return `<span style="display:inline-flex;align-items:center;gap:6px;background:#eef2ff;color:var(--primary);padding:4px 10px;border-radius:14px;margin:2px;font-size:13px;">
        ${l.name}${l.type === '차량' ? ' 🚗' + (l.owner ? '(' + l.owner + ')' : '') : ''}
        <span style="cursor:pointer;font-weight:bold;" onclick="removeLocation(${l.rowIndex}, '${l.name}')">×</span>
      </span>`;
    }).join('');
  }

  function renderStockTable() {
    const head = document.getElementById('stockTableHead');
    const body = document.getElementById('stockTableBody');
    if (!head || !body) return;
    const locNames = locationsCache.map(l => l.name);
    head.innerHTML = '<tr><th>대분류</th><th>소분류</th><th class="col-div">매입처</th><th>공급가</th><th class="col-div">금액(부포)</th>' +
      locNames.map(n => `<th>${n}</th>`).join('') + '<th class="col-div">합계</th><th></th></tr>';
    const kw = normKw_(document.getElementById('stockSearchInput') ? document.getElementById('stockSearchInput').value : '');
    const rows = !kw ? stockCache : stockCache.filter(s =>
      [s.major, s.minor, s.buyer].some(f => normKw_(f).indexOf(kw) !== -1));
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="' + (7 + locNames.length) + '" class="muted" style="text-align:center;padding:12px;">' +
        (kw ? '검색 결과가 없습니다.' : '등록된 재고가 없습니다.') + '</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (s) {
      const locCells = locNames.map(n => `<td>${(s.stocks && s.stocks[n] != null) ? s.stocks[n] : 0}</td>`).join('');
      return `<tr>
        <td>${s.major||''}</td><td>${s.minor||''}</td><td class="col-div">${s.buyer||''}</td>
        <td>${fmtMoney(s.dPrice)}</td><td class="col-div">${s.vatPrice ? fmtMoney(s.vatPrice) : ''}</td>
        ${locCells}<td class="col-div"><strong>${s.total||0}</strong></td>
        <td><button class="btn-danger" style="padding:2px 8px;font-size:12px;" onclick="removeStock(${s.rowIndex})">삭제</button></td>
      </tr>`;
    }).join('');
  }

  function onPayTypeChange() {
    const payType = document.getElementById('am_payType').value;
    const taxEl = document.getElementById('am_tax');
    const amtEl = document.getElementById('am_amount');
    if (payType === 'cash') {
      taxEl.value = ''; taxEl.disabled = true;
      amtEl.value = ''; amtEl.disabled = true;
    } else {
      taxEl.disabled = false; amtEl.disabled = false;
      onSupplyChange();
    }
  }

  function onSupplyChange() {
    if (document.getElementById('am_payType').value === 'cash') return;
    const supply = Number(document.getElementById('am_supply').value) || 0;
    const tax = Math.round(supply * 0.1);
    document.getElementById('am_tax').value = tax;
    document.getElementById('am_amount').value = supply + tax;
  }

  function addNewMaterial() {
    const payType = document.getElementById('am_payType').value;
    const item = {
      major: document.getElementById('am_major').value.trim(),
      buyer: document.getElementById('am_buyer').value.trim(),
      brand: document.getElementById('am_brand').value.trim(),
      type: document.getElementById('am_type').value.trim(),
      name: document.getElementById('am_name').value.trim(),
      supply: document.getElementById('am_supply').value,
      tax: payType === 'cash' ? '' : document.getElementById('am_tax').value,
      amount: payType === 'cash' ? '' : document.getElementById('am_amount').value
    };
    if (!item.name) { toast('제품명을 입력하세요'); return; }
    if (!item.buyer) { toast('매입처를 입력하세요'); return; }
    RUN()
      .withSuccessHandler(function () {
        toast('자재 추가됨 (자재단가 + 재고현황)');
        ['am_major','am_buyer','am_brand','am_type','am_name','am_supply','am_tax','am_amount'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('am_payType').value = 'vat';
        onPayTypeChange();
        loadStockAndPrice();
      })
      .withFailureHandler(e => toast('오류: ' + e.message))
      .addMaterialWithPrice(item, currentUser.name);
  }

  function removeStock(rowIndex) {
    if (!confirm('이 자재를 재고현황에서 삭제할까요?')) return;
    RUN()
      .withSuccessHandler(function () { toast('삭제됨'); loadStockAndPrice(); })
      .deleteStock(rowIndex);
  }

  // ====================== 블로그 작성 요청 큐 ======================
  // 요청을 쌓아만 두고 볼 방법이 없어서 무엇이 밀려 있는지 알 수 없었다 — 목록/상태변경을 붙였다(2026-08-02).
  // 실제 글쓰기는 Claude Code 세션에서 하고, 여기서는 "무엇이 남았는지"와 "다 썼는지"만 관리한다.
  let blogReqCache_ = [];
  let blogReqSelected_ = {}; // 체크박스로 고른 rowIndex 모음 (선택 삭제용)

  function loadBlogRequests() {
    const el = document.getElementById('blogReqList');
    if (!el) return;
    const onlyPending = !!(document.getElementById('blogReqOnlyPending') || {}).checked;
    el.innerHTML = '<span class="muted">불러오는 중...</span>';
    RUN()
      .withSuccessHandler(function (rows) {
        blogReqCache_ = Array.isArray(rows) ? rows : [];
        // 새로 받은 목록은 행번호가 달라져 있을 수 있다 — 이전 선택은 버린다(엉뚱한 행이 선택돼 보이지 않게).
        blogReqSelected_ = {};
        renderBlogRequests_();
      })
      .withFailureHandler(function (e) { el.innerHTML = '<span class="muted">오류: ' + e.message + '</span>'; })
      .getBlogRequests(onlyPending);
  }

  function renderBlogRequests_() {
    const el = document.getElementById('blogReqList');
    if (!el) return;
    if (!blogReqCache_.length) {
      el.innerHTML = '<span class="muted">대기 중인 블로그 작성 요청이 없습니다.</span>';
      updateBlogReqBulkBar_(); // 마지막 건까지 지웠으면 선택 삭제 줄도 같이 감춘다
      return;
    }
    const badge = function (s) {
      // 자동생성 건은 "완료(자동)"이라 정확히 비교하면 안 된다.
      const color = s.indexOf('완료') === 0 ? '#16a34a' : (s === '작성중' ? '#f59e0b' : '#2563eb');
      return '<span style="background:' + color + ';color:#fff;padding:1px 8px;border-radius:10px;font-size:11px;">' + escapeHtml_(s) + '</span>';
    };
    el.innerHTML = blogReqCache_.map(function (r) {
      const done = r.status.indexOf('완료') === 0;
      return '<div class="card" style="padding:10px;margin-bottom:8px;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<input type="checkbox" onchange="onBlogReqCheck(' + r.rowIndex + ', this.checked)"' +
            (blogReqSelected_[r.rowIndex] ? ' checked' : '') +
            ' style="width:auto;height:auto;padding:0;border:none;background:none;border-radius:0;margin:0;flex:0 0 auto;">' +
          badge(r.status) +
          '<strong style="font-size:13px;">' + escapeHtml_(r.date) + ' ' + escapeHtml_(r.address) + '</strong>' +
          '<span class="muted" style="font-size:11px;">요청 ' + escapeHtml_(r.requestedAt) + (r.requester ? ' · ' + escapeHtml_(r.requester) : '') + '</span>' +
        '</div>' +
        '<div style="margin-top:4px;font-size:12px;">' + escapeHtml_(r.content) + '</div>' +
        (r.keywords ? '<div style="margin-top:2px;font-size:12px;"><span class="muted">키워드:</span> ' + escapeHtml_(r.keywords) + '</div>' : '') +
        (r.titlePhrase ? '<div style="font-size:12px;"><span class="muted">제목문구:</span> ' + escapeHtml_(r.titlePhrase) + '</div>' : '') +
        '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">' +
          (done
            ? '<button class="btn-outline" style="padding:3px 10px;font-size:12px;" onclick="toggleBlogReqDone(' + r.rowIndex + ')">↩ 아직 안 씀으로</button>'
            : '<button class="btn-primary" style="padding:3px 10px;font-size:12px;" onclick="toggleBlogReqDone(' + r.rowIndex + ')">✅ 다 썼음</button>') +
        '</div>' +
      '</div>';
    }).join('');
    updateBlogReqBulkBar_();
  }

  /**
   * 상태를 "대기 ↔ 완료"로 뒤집는다.
   * 예전엔 대기/작성중/완료 세 버튼이었는데, 혼자 쓰는 큐라 "작성중"이 하는 일이 없었다 —
   * 필요한 건 "썼나 / 안 썼나"뿐이라 토글 하나로 줄였다(2026-08-03, 사장님 지적).
   * 옛 데이터에 '작성중'으로 남아 있는 행은 완료가 아니므로 미완료로 보이고, 누르면 완료가 된다.
   */
  function toggleBlogReqDone(rowIndex) {
    const item = blogReqCache_.find(function (r) { return r.rowIndex === rowIndex; });
    if (!item) return;
    const next = item.status.indexOf('완료') === 0 ? '대기' : '완료';
    // 화면에서 먼저 바꾸고 저장은 뒤에서 — 응답(약 1.7초)을 기다리면 눌러도 반응이 없는 것처럼 보인다.
    item.status = next;
    renderBlogRequests_();
    RUN()
      .withSuccessHandler(function () { toast(next === '완료' ? '완료로 표시했습니다' : '다시 대기로 돌렸습니다'); })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); loadBlogRequests(); })
      .setBlogRequestStatus(rowIndex, next);
  }

  // ---------- 체크박스 선택 삭제 ----------
  function onBlogReqCheck(rowIndex, checked) {
    if (checked) blogReqSelected_[rowIndex] = true;
    else delete blogReqSelected_[rowIndex];
    updateBlogReqBulkBar_();
  }

  function toggleAllBlogReq(checked) {
    blogReqSelected_ = {};
    if (checked) blogReqCache_.forEach(function (r) { blogReqSelected_[r.rowIndex] = true; });
    renderBlogRequests_(); // 카드마다 체크 표시를 맞춰야 하므로 다시 그린다
  }

  function updateBlogReqBulkBar_() {
    const bar = document.getElementById('blogReqBulkBar');
    const cnt = document.getElementById('blogReqSelCount');
    const btn = document.getElementById('blogReqBulkDelBtn');
    const all = document.getElementById('blogReqSelectAll');
    if (!bar) return;
    bar.classList.toggle('hidden', !blogReqCache_.length);
    const n = Object.keys(blogReqSelected_).length;
    if (cnt) cnt.textContent = n ? (n + '건 선택됨') : '';
    if (btn) { btn.disabled = !n; btn.textContent = n ? ('선택 삭제 (' + n + ')') : '선택 삭제'; }
    if (all) all.checked = !!blogReqCache_.length && n === blogReqCache_.length;
  }

  /**
   * 선택한 건들을 한 번에 삭제.
   *
   * ⚠️ rowIndex는 시트의 물리 행번호라, 행이 지워지면 그 아래 항목들의 번호가 위로 밀린다.
   * 예전 코드가 한 건 지울 때마다 목록을 통째로 다시 불러왔던 게 바로 이것 때문이었다(왕복 2번, 약 3.4초).
   * 여기서는 다시 불러오는 대신 **남은 항목의 rowIndex를 직접 빼서 맞춘다** — 지워진 것 중
   * 자기보다 위에 있던 개수만큼 당겨주면 서버의 실제 행번호와 정확히 같아진다. 왕복은 한 번뿐이다.
   * (숨겨진 완료 건들도 같이 밀리지만 화면에 없어 건드릴 수 없고, 탭을 다시 열면 새 번호로 받는다.)
   */
  function deleteSelectedBlogRequests(btn) {
    const rows = Object.keys(blogReqSelected_).map(Number);
    if (!rows.length) return;
    if (!confirm(rows.length + '건을 삭제할까요? 되돌릴 수 없습니다.')) return;

    const deleted = rows.slice().sort(function (a, b) { return a - b; });
    blogReqCache_ = blogReqCache_.filter(function (r) { return !blogReqSelected_[r.rowIndex]; });
    blogReqCache_.forEach(function (r) {
      let shift = 0;
      for (let i = 0; i < deleted.length; i++) if (deleted[i] < r.rowIndex) shift++;
      r.rowIndex -= shift;
    });
    blogReqSelected_ = {};
    renderBlogRequests_();

    RUN()
      .withSuccessHandler(function (res) {
        toast(((res && res.deleted) || rows.length) + '건 삭제했습니다');
      })
      .withFailureHandler(function (e) {
        // 어디까지 지워졌는지 알 수 없으므로 이때만 서버에서 다시 받아 맞춘다.
        toast('삭제 실패: ' + e.message);
        loadBlogRequests();
      })
      .deleteBlogRequests(rows);
  }

  // ====================== 도어락 가격표 관리 ======================
  let dcCategories_ = [];
  let dcCurrentCategory_ = null;
  let dcCurrentItems_ = [];
  let dcEditRowIndex_ = null;

  function loadDoorlockCatalogTab() {
    RUN()
      .withSuccessHandler(function (cats) {
        dcCategories_ = Array.isArray(cats) ? cats : [];
        const majorList = document.getElementById('dc_categoryList');
        if (majorList) majorList.innerHTML = dcCategories_.map(c => `<option value="${escapeHtml_(c)}"></option>`).join('');
        // 선택 카테고리를 먼저 확정한 뒤에 탭을 그린다 — 순서가 반대면 첫 진입 때 활성 탭 표시와
        // 카테고리 이동/삭제 버튼 활성 상태가 한 박자씩 어긋난다. 삭제 등으로 사라진 카테고리를
        // 가리키고 있던 경우도 여기서 첫 번째 카테고리로 되돌린다.
        if (dcCategories_.indexOf(dcCurrentCategory_) === -1) {
          dcCurrentCategory_ = dcCategories_.length ? dcCategories_[0] : null;
        }
        renderDoorlockCategoryTabs_();
        if (dcCurrentCategory_) {
          loadDoorlockCatalogItems(dcCurrentCategory_);
          loadLatestDoorlockImage_(dcCurrentCategory_);
        } else {
          const grid = document.getElementById('dcItemGrid');
          if (grid) grid.innerHTML = '<span class="muted">카테고리를 먼저 추가해주세요.</span>';
        }
      })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); })
      .getDoorlockCatalogCategories();
  }

  function renderDoorlockCategoryTabs_() {
    const wrap = document.getElementById('dcCategoryTabs');
    if (!wrap) return;
    wrap.innerHTML = dcCategories_.map(function (c) {
      const active = c === dcCurrentCategory_;
      return '<button class="' + (active ? 'btn-primary' : 'btn-outline') + '" style="padding:6px 12px;font-size:13px;" onclick="selectDoorlockCategory(\'' + escapeJsStr_(c) + '\')">' + escapeHtml_(c) + '</button>';
    }).join('');

    // 카테고리 이동/삭제 버튼은 "지금 선택된 카테고리"에 대해 동작하므로, 선택이 없거나 양 끝이면 잠근다.
    const pos = dcCategories_.indexOf(dcCurrentCategory_);
    const setDisabled_ = function (id, off) {
      const el = document.getElementById(id); if (el) el.disabled = off;
    };
    setDisabled_('dcCatUpBtn', pos <= 0);
    setDisabled_('dcCatDownBtn', pos < 0 || pos >= dcCategories_.length - 1);
    setDisabled_('dcCatDelBtn', pos < 0);
    const posEl = document.getElementById('dcCatPos');
    if (posEl) posEl.textContent = pos < 0 ? '' : ('선택: ' + dcCurrentCategory_ + ' (' + (pos + 1) + '/' + dcCategories_.length + ')');

    renderDoorlockBulkPick_(); // 카테고리 추가/삭제/순서변경이 체크박스 목록에도 바로 반영되게
  }

  // --- 가격표 이미지 한번에 만들기 ---
  var dcBulkChecked_ = {}; // 카테고리명 -> true (체크된 것만 담는다)
  var dcBulkRunning_ = false;

  function renderDoorlockBulkPick_() {
    const wrap = document.getElementById('dcBulkPick');
    if (!wrap) return;
    if (!dcCategories_.length) {
      wrap.innerHTML = '<span class="muted" style="font-size:12px;">카테고리를 먼저 추가해주세요.</span>';
      return;
    }
    // 체크박스 id/onchange는 카테고리명 대신 순번으로 건다 — 한글 이름을 그대로 쓰면 따옴표·공백 escape가 지저분해진다.
    wrap.innerHTML = dcCategories_.map(function (c, i) {
      return '<label><input type="checkbox" ' + (dcBulkChecked_[c] ? 'checked' : '') +
        ' onchange="dcBulkToggle_(' + i + ',this.checked)">' + escapeHtml_(c) + '</label>';
    }).join('');
  }

  function dcBulkToggle_(i, on) {
    const c = dcCategories_[i];
    if (!c) return;
    if (on) dcBulkChecked_[c] = true; else delete dcBulkChecked_[c];
  }

  function dcBulkSelectAll(on) {
    dcBulkChecked_ = {};
    if (on) dcCategories_.forEach(function (c) { dcBulkChecked_[c] = true; });
    renderDoorlockBulkPick_();
  }

  /**
   * 체크한 카테고리들의 가격표 이미지를 차례로 만든다.
   * 서버에서 한 번에 다 돌리지 않는 이유: 한 장 만드는 데 30~50초(사진·서식 렌더 대기 + PDF 변환 + 썸네일 재시도)가
   * 걸려서 여러 장을 한 호출에 몰면 Apps Script 6분 실행 제한에 걸린다. 화면에서 한 건씩 부르면 제한에 안 걸리고
   * "3/5 생성 중"처럼 진행 상황도 보여줄 수 있다(2026-08-01).
   */
  function generateDoorlockBulkImages() {
    if (dcBulkRunning_) return;
    const list = dcCategories_.filter(function (c) { return dcBulkChecked_[c]; });
    if (!list.length) { toast('한번에 만들 카테고리를 하나 이상 선택하세요'); return; }
    if (!confirm(list.length + '개 카테고리의 가격표 이미지를 새로 만듭니다.\n' +
      '한 장에 30초~1분쯤 걸려서 다 끝나기까지 약 ' + Math.max(1, Math.round(list.length * 45 / 60)) + '분 걸립니다.\n' +
      '끝날 때까지 이 화면을 닫지 마세요.\n\n계속할까요?')) return;

    dcBulkRunning_ = true;
    dcSetBulkButtons_(true);
    dcBulkStep_(list, 0, []);
  }

  /** 일괄 생성 중에는 낱개 생성 버튼도 같이 잠근다 — 같은 카테고리를 동시에 만들면 서로 결과를 덮어쓴다. */
  function dcSetBulkButtons_(busy) {
    ['dcBulkGenBtn', 'dcGenBtn'].forEach(function (id) {
      const el = document.getElementById(id); if (el) el.disabled = busy;
    });
  }

  function dcBulkStep_(list, i, done) {
    if (i >= list.length) { dcBulkFinish_(done); return; }
    const cat = list[i];
    dcBulkRenderProgress_(list, i, done);
    RUN()
      .withSuccessHandler(function (res) {
        done.push({ category: cat, res: res });
        if (cat === dcCurrentCategory_) renderDoorlockImageResult_(res); // 지금 보고 있는 카테고리면 아래 미리보기도 새것으로
        dcBulkStep_(list, i + 1, done);
      })
      .withFailureHandler(function (e) {
        // 한 건 실패해도 나머지는 계속 만든다 — 어떤 게 실패했는지는 아래 목록에 남는다.
        done.push({ category: cat, error: e.message });
        dcBulkStep_(list, i + 1, done);
      })
      .generateDoorlockCatalogImage(cat);
  }

  function dcBulkRenderProgress_(list, i, done) {
    const el = document.getElementById('dcBulkProgress');
    if (!el) return;
    el.innerHTML = '<div style="font-size:12px;">⏳ ' + (i + 1) + '/' + list.length + ' — ' +
      escapeHtml_(list[i]) + ' 생성 중...</div>' + dcBulkDoneList_(done);
  }

  function dcBulkDoneList_(done) {
    if (!done.length) return '';
    return '<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px;">' + done.map(function (d) {
      if (d.error) {
        return '<span style="font-size:12px;color:#ef4444;">✕ ' + escapeHtml_(d.category) + ' — ' + escapeHtml_(d.error) + '</span>';
      }
      const link = (d.res && d.res.downloadUrl)
        ? ' <a href="' + escapeHtml_(d.res.downloadUrl) + '" style="margin-left:6px;">📥 다운로드</a>' : '';
      return '<span style="font-size:12px;">✓ ' + escapeHtml_(d.category) + link + '</span>';
    }).join('') + '</div>';
  }

  function dcBulkFinish_(done) {
    dcBulkRunning_ = false;
    dcSetBulkButtons_(false);
    const ok = done.filter(function (d) { return !d.error; }).length;
    const el = document.getElementById('dcBulkProgress');
    if (el) {
      el.innerHTML = '<div style="font-size:12px;font-weight:bold;">완료 — ' + ok + '/' + done.length + '장 생성됨' +
        '</div>' + dcBulkDoneList_(done);
    }
    toast(ok + '장 생성 완료');
  }

  function selectDoorlockCategory(cat) {
    dcCurrentCategory_ = cat;
    renderDoorlockCategoryTabs_();
    loadDoorlockCatalogItems(cat);
    loadLatestDoorlockImage_(cat); // 탭을 옮겼다 돌아와도 그 카테고리의 최종본이 계속 보이게
  }

  /** 선택한 카테고리를 탭 순서에서 한 칸 앞/뒤로 옮긴다. */
  function moveDoorlockCategory(direction) {
    if (!dcCurrentCategory_) { toast('카테고리를 먼저 선택하세요'); return; }
    RUN()
      .withSuccessHandler(function (res) {
        if (res && res.success === false) { toast(res.message || '옮길 수 없습니다'); return; }
        loadDoorlockCatalogTab();
      })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); })
      .moveDoorlockCatalogCategory(dcCurrentCategory_, direction);
  }

  function toggleDoorlockCategoryAdd(show) {
    const row = document.getElementById('dcCatAddRow');
    if (!row) return;
    row.classList.toggle('hidden', !show);
    const input = document.getElementById('dcCatNewName');
    if (input) { input.value = ''; if (show) input.focus(); }
  }

  function submitDoorlockCategory() {
    const name = document.getElementById('dcCatNewName').value.trim();
    if (!name) { toast('카테고리 이름을 입력하세요'); return; }
    RUN()
      .withSuccessHandler(function (res) {
        if (res && res.success === false) { toast(res.message || '추가할 수 없습니다'); return; }
        toast('카테고리가 추가되었습니다');
        toggleDoorlockCategoryAdd(false);
        dcCurrentCategory_ = name; // 방금 만든 카테고리를 바로 선택해서 제품을 넣을 수 있게 한다
        loadDoorlockCatalogTab();
      })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); })
      .addDoorlockCatalogCategory(name);
  }

  function deleteDoorlockCategory() {
    if (!dcCurrentCategory_) { toast('카테고리를 먼저 선택하세요'); return; }
    if (!confirm('"' + dcCurrentCategory_ + '" 카테고리를 삭제할까요?\n(제품이 남아 있으면 삭제되지 않습니다)')) return;
    RUN()
      .withSuccessHandler(function (res) {
        if (res && res.success === false) { toast(res.message || '삭제할 수 없습니다'); return; }
        toast('카테고리가 삭제되었습니다');
        dcCurrentCategory_ = null;
        loadDoorlockCatalogTab();
      })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); })
      .deleteDoorlockCatalogCategory(dcCurrentCategory_);
  }

  function generateDoorlockCategoryImage() {
    if (!dcCurrentCategory_) { toast('카테고리를 먼저 선택하세요'); return; }
    const btn = document.getElementById('dcGenBtn');
    const result = document.getElementById('dcGenResult');
    btn.disabled = true;
    result.innerHTML = '<span class="muted">이미지 생성 중... (몇 초 걸릴 수 있습니다)</span>';
    RUN()
      .withSuccessHandler(function (res) {
        btn.disabled = false;
        renderDoorlockImageResult_(res);
      })
      .withFailureHandler(function (e) {
        btn.disabled = false;
        result.innerHTML = '<span class="muted">오류: ' + e.message + '</span>';
      })
      .generateDoorlockCatalogImage(dcCurrentCategory_);
  }

  /**
   * 생성된(또는 예전에 생성해둔) 가격표 최종본을 결과 영역에 그린다.
   * 버튼줄에 class="row"를 쓰면 전역 `.row > *{flex:1}`에 걸려 링크가 제멋대로 늘어나므로 인라인 flex로 감쌌다.
   */
  function renderDoorlockImageResult_(res) {
    const el = document.getElementById('dcGenResult');
    if (!el) return;
    if (!res || !res.fileId) { el.innerHTML = ''; return; }
    el.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:10px;align-items:center;">' +
        (res.thumb ? '<img src="' + res.thumb + '" style="width:100%;max-width:520px;border-radius:8px;border:1px solid var(--border);">' : '') +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">' +
          '<a href="' + res.downloadUrl + '" class="btn-primary" style="text-decoration:none;padding:6px 14px;">📥 이미지 다운로드</a>' +
          '<a href="' + res.url + '" target="_blank" class="btn-outline" style="text-decoration:none;padding:6px 14px;">드라이브에서 열기</a>' +
        '</div>' +
        '<span class="muted" style="font-size:12px;">이 카테고리의 최종본입니다. 새로 만들면 이 이미지가 교체됩니다.</span>' +
      '</div>';
  }

  /** 카테고리를 열 때마다 그 카테고리로 마지막에 만들어둔 가격표를 불러와 계속 띄워둔다. */
  function loadLatestDoorlockImage_(cat) {
    const el = document.getElementById('dcGenResult');
    if (el) el.innerHTML = '<span class="muted">최종 가격표 확인 중...</span>';
    RUN()
      .withSuccessHandler(function (res) {
        if (cat !== dcCurrentCategory_) return; // 그 사이 다른 카테고리로 옮겼으면 무시
        renderDoorlockImageResult_(res);
      })
      .withFailureHandler(function () { if (el) el.innerHTML = ''; })
      .getLatestDoorlockCatalogImage(cat);
  }

  function loadDoorlockCatalogItems(cat) {
    const grid = document.getElementById('dcItemGrid');
    const title = document.getElementById('dcGridTitle');
    if (title) title.textContent = cat ? (cat + ' 제품 목록') : '제품 목록';
    if (grid) grid.innerHTML = '<span class="muted">불러오는 중...</span>';
    RUN()
      .withSuccessHandler(function (items) {
        dcCurrentItems_ = Array.isArray(items) ? items : [];
        dcRenderItems_();
      })
      .withFailureHandler(function (e) { if (grid) grid.innerHTML = '<span class="muted">오류: ' + e.message + '</span>'; })
      .getDoorlockCatalog(cat);
  }

  /** 지금 메모리에 있는 dcCurrentItems_ 순서 그대로 목록을 다시 그린다(서버 왕복 없음). */
  function dcRenderItems_() {
    const grid = document.getElementById('dcItemGrid');
    if (!grid) return;
    if (!dcCurrentItems_.length) { grid.innerHTML = '<span class="muted">이 카테고리에 등록된 제품이 없습니다.</span>'; return; }
    grid.innerHTML = dcCurrentItems_.map(function (item, i) {
      return renderDoorlockCatalogItem_(item, i, dcCurrentItems_.length);
    }).join('');
  }

  function renderDoorlockCatalogItem_(item, idx, total) {
    const thumb = item.thumb
      ? '<img src="' + item.thumb + '" style="width:100%;height:110px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" />'
      : '<div style="width:100%;height:110px;display:flex;align-items:center;justify-content:center;font-size:34px;background:#f1f3f5;border-radius:8px;border:1px solid var(--border);">🔒</div>';
    const priceLine = item.salePrice !== '' ? fmtMoney(item.salePrice) + (item.discount ? ' <span style="color:#ef4444;">(' + escapeHtml_(String(item.discount)) + ')</span>' : '') : '<span class="muted">가격 미정</span>';
    // flex:0 0 170px를 인라인으로 못박는다 — 전역 규칙 `.row > * { flex: 1 }`(Index.html) 때문에
    // width:170px만으로는 카드가 남는 공간을 균등 분배해버려서, 마지막 줄에 카드가 하나만 남으면
    // 그 카드가 혼자 가로 전체로 늘어나 보였다(2026-07-31 확인).
    return '<div class="card" style="flex:0 0 170px;width:170px;padding:10px;font-size:12px;">' +
      thumb +
      '<div style="margin-top:6px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + escapeHtml_(item.brand + ' ' + item.model) + '">' + escapeHtml_(item.brand) + ' ' + escapeHtml_(item.model) + '</div>' +
      '<div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + escapeHtml_(item.type || '') + '">' + escapeHtml_(item.type || '') + '</div>' +
      '<div style="margin-top:4px;">' + priceLine + '</div>' +
      (item.note ? '<div class="muted" style="margin-top:2px;font-size:11px;">' + escapeHtml_(item.note) + '</div>' : '') +
      // 순서 이동 — 목록(=가격표 이미지)에 나오는 차례. ◀▶는 한 칸씩, 가운데 칸에 번호를 직접 적으면 그 자리로 바로 간다.
      // 전역 `input{width:100%;padding:10px 12px;font-size:15px}`(Index.html)에 먹히지 않도록 인라인으로 못박는다.
      '<div style="margin-top:6px;display:flex;gap:4px;align-items:center;">' +
        '<button class="btn-outline" style="padding:2px 0;font-size:12px;flex:1;" ' + (idx === 0 ? 'disabled' : '') +
          ' onclick="moveDoorlockItem(' + item.rowIndex + ',\'up\')" title="앞으로">◀</button>' +
        '<input type="text" inputmode="numeric" value="' + (idx + 1) + '"' +
          ' style="flex:0 0 30px;width:30px;padding:2px 0;font-size:11px;text-align:center;border-radius:6px;"' +
          ' title="여기에 순서 번호를 적고 Enter를 누르면 그 자리로 바로 옮겨집니다"' +
          ' onfocus="this.select()"' +
          ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}"' +
          ' onchange="jumpDoorlockItem(' + item.rowIndex + ',this.value)">' +
        '<span class="muted" style="font-size:11px;">/' + total + '</span>' +
        '<button class="btn-outline" style="padding:2px 0;font-size:12px;flex:1;" ' + (idx === total - 1 ? 'disabled' : '') +
          ' onclick="moveDoorlockItem(' + item.rowIndex + ',\'down\')" title="뒤로">▶</button>' +
      '</div>' +
      '<div style="margin-top:6px;display:flex;gap:6px;">' +
        '<button class="btn-outline" style="padding:2px 8px;font-size:12px;flex:1;" onclick="editDoorlockItem(' + item.rowIndex + ')">수정</button>' +
        '<button class="btn-danger" style="padding:2px 8px;font-size:12px;flex:1;" onclick="deleteDoorlockItem(' + item.rowIndex + ')">삭제</button>' +
      '</div>' +
    '</div>';
  }

  /** ◀▶ — 한 칸 앞뒤로. */
  function moveDoorlockItem(rowIndex, direction) {
    const from = dcIndexOfRow_(rowIndex);
    if (from < 0) return;
    dcMoveTo_(from, direction === 'up' ? from - 1 : from + 1);
  }

  /** 가운데 칸에 적은 번호로 바로 보내기. */
  function jumpDoorlockItem(rowIndex, value) {
    const from = dcIndexOfRow_(rowIndex);
    if (from < 0) return;
    const to = Math.round(Number(value)) - 1;
    if (!(to >= 0 && to < dcCurrentItems_.length)) {
      toast('1 ~ ' + dcCurrentItems_.length + ' 사이의 번호를 적어주세요');
      dcRenderItems_(); // 잘못 적은 값을 원래 번호로 되돌린다
      return;
    }
    dcMoveTo_(from, to);
  }

  function dcIndexOfRow_(rowIndex) {
    for (let i = 0; i < dcCurrentItems_.length; i++) {
      if (dcCurrentItems_[i].rowIndex === rowIndex) return i;
    }
    return -1;
  }

  /**
   * 순서를 화면에서 "먼저" 바꾸고, 시트 저장은 뒤에서 처리한다.
   * 예전엔 한 칸 옮길 때마다 서버 응답을 기다렸다가 목록 전체(사진 썸네일 포함)를 다시 불러와서
   * 눈에 띄게 느렸다 — 그래서 즉시 반영으로 바꿨다(2026-08-01 사용자 요청).
   *
   * 서버는 같은 카테고리 행들의 "값"만 새 순서대로 다시 써넣고 행 자체는 그대로 두므로,
   * 화면도 항목 순서만 바꾼 뒤 rowIndex(=시트 행번호)를 원래 오름차순대로 다시 나눠주면 서버 결과와 똑같아진다.
   * rowIndex가 가리키는 내용이 바뀌므로, 수정 중인 항목이 있으면 엉뚱한 행을 덮어쓰지 않도록 편집을 먼저 취소한다.
   */
  function dcMoveTo_(from, to) {
    if (from === to || to < 0 || to >= dcCurrentItems_.length) return;
    if (dcEditRowIndex_) cancelDoorlockEdit();

    const rowIndex = dcCurrentItems_[from].rowIndex; // 저장 요청은 "옮기기 전" 행번호로 보낸다
    const rows = dcCurrentItems_.map(function (it) { return it.rowIndex; }).sort(function (a, b) { return a - b; });
    dcCurrentItems_.splice(to, 0, dcCurrentItems_.splice(from, 1)[0]);
    dcCurrentItems_.forEach(function (it, i) { it.rowIndex = rows[i]; });
    dcRenderItems_();

    dcQueueOrderSave_(rowIndex, to + 1);
  }

  /**
   * 저장은 한 번에 하나씩 순서대로 보낸다. 화면이 먼저 바뀌니 사용자가 연달아 누를 수 있는데,
   * 동시에 보내면 서버가 아직 반영 안 된 상태를 기준으로 계산해 순서가 어긋난다.
   * 큐로 직렬화하면 각 요청이 "이전 요청까지 반영된 시트"를 보게 되어 화면과 시트가 항상 같아진다.
   */
  var dcOrderQueue_ = [];
  var dcOrderBusy_ = false;

  function dcQueueOrderSave_(rowIndex, position) {
    dcOrderQueue_.push({ rowIndex: rowIndex, position: position });
    dcFlushOrderQueue_();
  }

  function dcFlushOrderQueue_() {
    if (dcOrderBusy_ || !dcOrderQueue_.length) return;
    const job = dcOrderQueue_.shift();
    dcOrderBusy_ = true;
    RUN()
      .withSuccessHandler(function (res) {
        dcOrderBusy_ = false;
        if (res && res.success === false) { dcOrderFailed_(res.message || '옮길 수 없습니다'); return; }
        dcFlushOrderQueue_();
      })
      .withFailureHandler(function (e) { dcOrderBusy_ = false; dcOrderFailed_('순서 저장 실패: ' + e.message); })
      .setDoorlockCatalogItemPosition(job.rowIndex, job.position);
  }

  /** 한 건이라도 저장이 어긋나면 화면 순서를 믿을 수 없으므로, 남은 요청을 버리고 시트 기준으로 다시 불러온다. */
  function dcOrderFailed_(msg) {
    dcOrderQueue_ = [];
    toast(msg);
    loadDoorlockCatalogItems(dcCurrentCategory_);
  }

  /**
   * 정가·판매가가 바뀔 때마다 할인율 칸을 정수 퍼센트로 다시 채운다(소수점은 반올림).
   * 서버의 calcDoorlockDiscount_와 같은 식이며, 할인이 아닌 경우(정가 없음/판매가가 정가 이상)엔 비운다.
   * keepWhenUncalculable=true면 계산이 안 되는 상황에서 기존 값을 지우지 않는다 — 정가 없이 할인율만
   * 손으로 적어둔 옛 데이터를 수정하려고 열었을 때 그 값이 사라지지 않게 하기 위함.
   */
  function dcSyncDiscount_(keepWhenUncalculable) {
    const list = Number(document.getElementById('dc_listPrice').value) || 0;
    const sale = Number(document.getElementById('dc_salePrice').value) || 0;
    const calc = (list > 0 && sale > 0 && sale < list) ? (Math.round((list - sale) / list * 100) + '%') : '';
    if (!calc && keepWhenUncalculable) return;
    document.getElementById('dc_discount').value = calc;
  }

  function editDoorlockItem(rowIndex) {
    const item = dcCurrentItems_.find(i => i.rowIndex === rowIndex);
    if (!item) { toast('항목을 찾을 수 없습니다. 목록을 새로고침합니다.'); loadDoorlockCatalogItems(dcCurrentCategory_); return; }
    dcEditRowIndex_ = item.rowIndex;
    document.getElementById('dc_category').value = item.category || '';
    document.getElementById('dc_brand').value = item.brand || '';
    document.getElementById('dc_model').value = item.model || '';
    document.getElementById('dc_type').value = item.type || '';
    document.getElementById('dc_listPrice').value = item.listPrice === '' ? '' : item.listPrice;
    document.getElementById('dc_salePrice').value = item.salePrice === '' ? '' : item.salePrice;
    document.getElementById('dc_discount').value = item.discount || '';
    dcSyncDiscount_(true); // 정가·판매가가 둘 다 있으면 다시 계산, 아니면 저장돼 있던 값을 그대로 둔다
    document.getElementById('dc_note').value = item.note || '';
    document.getElementById('dcFormTitle').textContent = item.brand + ' ' + item.model + ' 수정 중';
    document.getElementById('dcImageHint').classList.add('hidden');
    document.getElementById('dcImageRow').classList.remove('hidden');
    document.getElementById('dcImagePreview').innerHTML = item.thumb
      ? '<img src="' + item.thumb + '" style="width:100%;height:100%;object-fit:cover;">'
      : '🔒';
    document.getElementById('dcCancelEditBtn').classList.remove('hidden');
    window.scrollTo({ top: document.getElementById('dcFormTitle').offsetTop - 80, behavior: 'smooth' });
  }

  function cancelDoorlockEdit() {
    dcEditRowIndex_ = null;
    ['dc_category','dc_brand','dc_model','dc_type','dc_listPrice','dc_salePrice','dc_discount','dc_note'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('dc_imageInput').value = '';
    document.getElementById('dcFormTitle').textContent = '제품 등록';
    document.getElementById('dcImageHint').classList.remove('hidden');
    document.getElementById('dcImageRow').classList.add('hidden');
    document.getElementById('dcCancelEditBtn').classList.add('hidden');
  }

  function saveDoorlockItem() {
    const item = {
      category: document.getElementById('dc_category').value.trim(),
      brand: document.getElementById('dc_brand').value.trim(),
      model: document.getElementById('dc_model').value.trim(),
      type: document.getElementById('dc_type').value.trim(),
      listPrice: document.getElementById('dc_listPrice').value,
      salePrice: document.getElementById('dc_salePrice').value,
      discount: document.getElementById('dc_discount').value.trim(),
      note: document.getElementById('dc_note').value.trim()
    };
    if (!item.category) { toast('카테고리를 입력하세요'); return; }
    if (!item.brand || !item.model) { toast('브랜드/모델명을 입력하세요'); return; }
    const runner = RUN()
      .withSuccessHandler(function () {
        toast(dcEditRowIndex_ ? '수정되었습니다' : '등록되었습니다');
        cancelDoorlockEdit();
        loadDoorlockCatalogTab();
      })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); });
    if (dcEditRowIndex_) runner.updateDoorlockCatalogItem(dcEditRowIndex_, item);
    else runner.addDoorlockCatalogItem(item);
  }

  function deleteDoorlockItem(rowIndex) {
    if (!confirm('이 제품을 삭제하시겠습니까? 등록된 사진도 함께 삭제됩니다.')) return;
    RUN()
      .withSuccessHandler(function () {
        toast('삭제되었습니다');
        if (dcEditRowIndex_ === rowIndex) cancelDoorlockEdit();
        loadDoorlockCatalogItems(dcCurrentCategory_);
      })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); })
      .deleteDoorlockCatalogItem(rowIndex);
  }

  function handleDoorlockImageUpload(inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    if (!dcEditRowIndex_) { toast('먼저 저장한 뒤 목록에서 "수정"을 눌러 사진을 추가하세요'); inputEl.value = ''; return; }
    const preview = document.getElementById('dcImagePreview');
    preview.innerHTML = '<span style="font-size:10px;">업로드 중...</span>';
    compressImageToBase64_(file, 1200, 0.82, function (result) {
      RUN()
        .withSuccessHandler(function (res) {
          preview.innerHTML = res.thumb ? '<img src="' + res.thumb + '" style="width:100%;height:100%;object-fit:cover;">' : '🔒';
          toast('사진이 저장되었습니다');
          loadDoorlockCatalogItems(dcCurrentCategory_);
        })
        .withFailureHandler(function (e) { toast('오류: ' + e.message); preview.innerHTML = '🔒'; })
        .uploadDoorlockCatalogImage(dcEditRowIndex_, result.base64, result.mimeType, result.fileName);
    }, function (err) {
      preview.innerHTML = '🔒';
      toast('이미지 처리 실패: ' + err);
    });
  }

  function addNewLocation() {
    const name = document.getElementById('nl_name').value.trim();
    const type = document.getElementById('nl_type').value;
    const owner = document.getElementById('nl_owner').value.trim();
    if (!name) { toast('위치명을 입력하세요'); return; }
    if (type === '차량' && !owner) { toast('차량은 담당자 이름이 필요합니다'); return; }
    RUN()
      .withSuccessHandler(function () {
        toast('위치 추가됨');
        ['nl_name','nl_owner'].forEach(id => document.getElementById(id).value = '');
        loadStockAndPrice();
      })
      .withFailureHandler(e => toast('오류: ' + e.message))
      .addLocation({ name: name, type: type, owner: owner });
  }

  function removeLocation(rowIndex, locName) {
    if (!confirm('"' + locName + '" 위치를 삭제할까요?\n재고현황의 해당 열도 함께 삭제됩니다.')) return;
    RUN()
      .withSuccessHandler(function () { toast('위치 삭제됨'); loadStockAndPrice(); })
      .withFailureHandler(e => toast('오류: ' + e.message))
      .deleteLocation(rowIndex, locName);
  }

  function shiftMonth(delta) {
    calDate.setMonth(calDate.getMonth() + delta);
    renderCalendar();
  }

  function renderCalendar() {
    const y = calDate.getFullYear(), m = calDate.getMonth();
    document.getElementById('calMonthLabel').textContent = y + '년 ' + (m+1) + '월';
    const head = document.getElementById('calHead');
    head.innerHTML = ['일','월','화','수','목','금','토'].map(d => `<div class="cal-head">${d}</div>`).join('');

    const yearMonth = y + '-' + String(m+1).padStart(2,'0');
    RUN()
      .withSuccessHandler(function (summary) {
        const grid = document.getElementById('calGrid');
        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m+1, 0).getDate();
        let html = '';
        let monthCount = 0, monthTotal = 0, monthMargin = 0;
        for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';
        for (let d = 1; d <= daysInMonth; d++) {
          const key = y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
          const info = summary[key];
          if (info) { monthCount += info.count; monthTotal += info.total; monthMargin += info.margin || 0; }
          html += `<div class="cal-cell" onclick="showDayDetail('${key}')">
                     <div class="d">${d}</div>
                     ${info ? `<div class="info">${info.count}건<br>매출 ${fmtMoney(info.total)}<br><span style="color:#16a34a;">마진 ${fmtMoney(info.margin||0)}</span></div>` : ''}
                   </div>`;
        }
        grid.innerHTML = html;
        const sumEl = document.getElementById('calMonthSummary');
        if (sumEl) {
          sumEl.innerHTML = `이번 달 <strong>${monthCount}건</strong> · 매출 <strong>${fmtMoney(monthTotal)}</strong> · <span style="color:#16a34a;">마진 <strong>${fmtMoney(monthMargin)}</strong></span>`;
        }
      })
      .getCalendarSummary(yearMonth);
  }

  function showDayDetail(dateKey) {
    const rows = allEntries.filter(e => fmtDate(e.date) === dateKey);
    if (!rows.length) { toast(dateKey + ' 기록 없음'); return; }
    const sd = document.getElementById('sortDate');
    if (sd) sd.value = dateKey;
    editRowInForm(rows[0]);
    if (rows.length > 1) toast(dateKey + '에 ' + rows.length + '건 있음 (전체장부 탭에서 모두 확인)');
  }

  function doSortDay() {
    const dateStr = document.getElementById('sortDate').value;
    if (!dateStr) { toast('정렬할 날짜를 선택하세요'); return; }
    if (!confirm(dateStr + ' 기록을 출장자 순서로 재정렬할까요?\n(순수익 누계도 다시 계산됩니다)')) return;
    toast('정렬 중...');
    RUN()
      .withSuccessHandler(function (res) {
        if (res && res.success) {
          toast(res.sorted != null ? (res.sorted + '건 정렬 완료 ✅') : (res.message || '정렬 완료'));
          loadAllEntries();
          renderCalendar();
        } else {
          toast(res && res.message ? res.message : '정렬 실패');
        }
      })
      .withFailureHandler(e => toast('오류: ' + e.message))
      .sortDayByAgent(dateStr);
  }

  function loadAllEntries() {
    RUN()
      .withSuccessHandler(function (rows) {
        allEntries = Array.isArray(rows) ? rows : [];
        renderTable();
      })
      .withFailureHandler(function (e) {
        allEntries = [];
        const summaryEl = document.getElementById('tableSummary');
        if (summaryEl) summaryEl.textContent = '최근 장부 불러오기 실패: ' + e.message;
      })
      .getRecentLedgerEntries(7);
  }

  function renderTable() {
    const bodyEl = document.getElementById('tableBody');
    const summaryEl = document.getElementById('tableSummary');
    if (!bodyEl || !summaryEl) return;
    if (!Array.isArray(allEntries)) { allEntries = []; }

    const filtered = filterBySource_(filterByPayType_(filterByAgent_(allEntries, 'admAgentFilter'), 'admPayFilter'), 'admSourceFilter');
    summaryEl.textContent = `최근 7일 · ${filtered.length}건`;
    updateAgentOptions_('admAgentFilter', allEntries.concat(admSearchCache));
    updateSourceOptions_('admSourceFilter', allEntries.concat(admSearchCache));

    const rows = filtered.slice().reverse();
    const bands = dateBandBg_(rows);
    bodyEl.innerHTML = rows.map((r, i) => `
      <tr onclick='editRowInForm(${jsonAttr_(r)})' style="cursor:pointer;background:${bands[i]};">
        <td style="white-space:nowrap;">${fmtDate(r.date)}</td><td>${escapeHtml_(r.weekday)}</td>${truncTd_(r.address, 200)}${truncTd_(r.content, 200)}
        <td style="white-space:nowrap;background:#EAD1DC;">${fmtMoney(r.amount)}</td><td style="background:#B7E1CD;">${escapeHtml_(r.agent)}</td><td>${payTypeShort_(r.payType)}</td><td>${escapeHtml_(r.source||'')}</td>
        <td style="white-space:nowrap;">${fmtMoney(r.cost)}</td><td style="white-space:nowrap;">${fmtMoney(r.margin)}</td><td>${escapeHtml_(r.submittedBy)}</td>
        <td><span class="badge">수정</span>
          ${r.docLink ? `<a href="https://drive.google.com/file/d/${r.docLink.fileId}/view" target="_blank" onclick="event.stopPropagation()" title="${escapeHtml_(r.docLink.client)} 문서 보기">📄</a>` : ''}
          ${r.mediaCount ? `<a href="#" onclick="event.stopPropagation();event.preventDefault();openMediaModal(${r.rowIndex})" title="현장 사진/영상 보기">📷${r.mediaCount}</a>` : ''}
          <a href="#" title="블로그 작성 요청" onclick='event.stopPropagation();event.preventDefault();openBlogRequestModal(${jsonAttr_(r)})'>✍️</a>
          ${r.mediaCount ? `<a href="#" title="사진 다운로드 준비" onclick='event.stopPropagation();event.preventDefault();openPhotoDownloadModal(${jsonAttr_(r)})'>📥</a>` : ''}
        </td>
      </tr>
    `).join('');
  }

  let editUserState = { rowIndex: null };

  function loadUsers() {
    RUN()
      .withSuccessHandler(function (users) {
        document.getElementById('userTableBody').innerHTML = users.map(u => `
          <tr>
            <td>${escapeHtml_(u.name)}</td><td>${escapeHtml_(u.pin)}</td><td>${escapeHtml_(u.role)}</td>
            <td>
              <button class="btn-outline" onclick='startEditUser(${jsonAttr_(u)})'>수정</button>
              <button class="btn-danger" onclick="removeUser(${u.rowIndex})">삭제</button>
            </td>
          </tr>
        `).join('');
      })
      .getUsers();
  }

  function startEditUser(u) {
    editUserState.rowIndex = u.rowIndex;
    document.getElementById('newUserName').value = u.name;
    document.getElementById('newUserPin').value = u.pin;
    document.getElementById('newUserRole').value = u.role;
    document.getElementById('addUserBtn').textContent = '수정 저장';
    document.getElementById('cancelUserEditBtn').classList.remove('hidden');
    toast(u.name + ' 정보를 수정합니다. 위 입력칸에서 고친 뒤 "수정 저장"을 누르세요.');
  }

  function cancelUserEdit() {
    editUserState.rowIndex = null;
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserPin').value = '';
    document.getElementById('addUserBtn').textContent = '추가';
    document.getElementById('cancelUserEditBtn').classList.add('hidden');
  }

  function addNewUser() {
    const name = document.getElementById('newUserName').value.trim();
    const pin = document.getElementById('newUserPin').value.trim();
    const role = document.getElementById('newUserRole').value;
    if (!name || !pin) { toast('이름과 PIN을 입력하세요'); return; }
    const editing = !!editUserState.rowIndex;
    const call = RUN()
      .withSuccessHandler(function (res) {
        if (res && res.success === false) { alert(res.message || '저장하지 못했습니다.'); return; }
        toast(editing ? '사용자 정보가 수정되었습니다' : '사용자가 추가되었습니다');
        cancelUserEdit();
        loadUsers();
      })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); });
    if (editing) call.updateUser(editUserState.rowIndex, name, pin, role);
    else call.addUser(name, pin, role);
  }

  function removeUser(rowIndex) {
    if (!confirm('이 사용자를 삭제하시겠습니까?')) return;
    RUN().withSuccessHandler(function () { loadUsers(); }).deleteUser(rowIndex);
  }

  function saveGeminiApiKey() {
    const key = document.getElementById('geminiApiKey').value.trim();
    if (!key) { toast('API 키를 입력하세요'); return; }
    RUN()
      .withSuccessHandler(function () { toast('저장되었습니다'); document.getElementById('geminiApiKey').value = ''; loadGeminiKeyStatus(); })
      .withFailureHandler(e => toast('오류: ' + e.message))
      .setGeminiApiKey(key);
  }

  function loadGeminiKeyStatus() {
    const el = document.getElementById('geminiKeyStatus');
    if (!el) return;
    RUN()
      .withSuccessHandler(function (res) { el.textContent = (res && res.linked) ? '✓ 저장됨' : '아직 저장된 키가 없습니다'; })
      .withFailureHandler(function () { el.textContent = ''; })
      .getGeminiKeyStatus();
  }

  function saveOpenAiApiKey() {
    const key = document.getElementById('openaiApiKey').value.trim();
    if (!key) { toast('API 키를 입력하세요'); return; }
    RUN()
      .withSuccessHandler(function () { toast('저장되었습니다'); document.getElementById('openaiApiKey').value = ''; loadOpenAiKeyStatus(); })
      .withFailureHandler(e => toast('오류: ' + e.message))
      .setOpenAiApiKey(key);
  }

  function loadOpenAiKeyStatus() {
    const el = document.getElementById('openaiKeyStatus');
    if (!el) return;
    RUN()
      .withSuccessHandler(function (res) { el.textContent = (res && res.linked) ? '✓ 저장됨' : '아직 저장된 키가 없습니다'; })
      .withFailureHandler(function () { el.textContent = ''; })
      .getOpenAiKeyStatus();
  }

  // ---------- 📧 이메일 알림 ----------
  let emailNotifyRows = [];
  let emailNotifyUsers_ = [];

  /**
   * 사장님은 사용자 목록에도 '관리자'로 들어 있는데, 예전엔 서버 알림 키인 'owner' 줄을 따로 하나 더
   * 붙여서 같은 사람이 두 줄로 떴다. 그래서 주소를 양쪽에 넣게 되고, 장부 작성완료 알림이 2통씩 왔다
   * (2026-08-05 확인). 이제 '관리자' 사용자 줄 하나로 합치고, 저장할 때 그 이름 키와 'owner' 키에
   * 같은 주소를 같이 써준다 — 서버는 예전처럼 'owner'로 보내면 되고 화면만 한 줄이 된다.
   */
  function loadEmailNotifyStatus_(users) {
    emailNotifyUsers_ = (users || []).map(function (u) {
      return (typeof u === 'string') ? { name: u, role: '' } : u; // 이름 배열로 부르던 옛 호출도 받는다
    });
    const names = emailNotifyUsers_.map(u => u.name);
    const ownerUser = emailNotifyUsers_.filter(u => String(u.role || '').trim() === '관리자')[0];
    const ownerName = ownerUser ? ownerUser.name : '';
    emailNotifyRows = emailNotifyUsers_.map(function (u) {
      const isOwner = (u.name === ownerName);
      return { key: u.name, label: isOwner ? (u.name + ' (사장님)') : u.name, alsoOwner: isOwner };
    });
    // 본사 관리자가 사용자 목록에 없으면(지점 관리자만 있는 경우 등) 예전처럼 owner 줄을 따로 둔다.
    if (!ownerName) emailNotifyRows.unshift({ key: 'owner', label: '사장님(본인)', alsoOwner: false });
    RUN()
      .withSuccessHandler(renderEmailNotifyList_)
      .withFailureHandler(function (e) {
        const el = document.getElementById('emailNotifyList');
        if (el) el.innerHTML = `<span class="muted">불러오기 실패: ${e.message}</span>`;
      })
      .getEmailNotifyStatus(names);
  }

  function renderEmailNotifyList_(status) {
    const el = document.getElementById('emailNotifyList');
    if (el) {
      el.innerHTML = emailNotifyRows.map(function (r, i) {
        // 합쳐진 사장님 줄은 이름 키에 아직 주소가 없을 수 있다(예전엔 owner 키에만 넣어뒀으므로).
        let s = (status && status[r.key]) || {};
        if (r.alsoOwner && !s.email) s = (status && status.owner) || s;
        const ph = '알림 받을 이메일 주소';
        return `<div class="row" style="align-items:center;margin-top:6px;">
          <span style="flex:1;">${r.label}</span>
          <input id="emailNotify_${i}" value="${s.email || ''}" placeholder="${ph}" style="flex:2;" />
          <button class="btn-outline" onclick="saveEmailNotify(${i}, this)">저장</button>
          ${s.linked ? `<button class="btn-outline" onclick="testEmailNotify('${r.key}', this)" style="margin-left:4px;">테스트</button>` : ''}
        </div>`;
      }).join('');
    }
    const q = document.getElementById('emailNotifyQuota');
    if (q) {
      const left = status && typeof status.__quota === 'number' ? status.__quota : -1;
      q.textContent = left >= 0
        ? `오늘 더 보낼 수 있는 메일: ${left}통 (한도는 매일 초기화됩니다)`
        : '';
    }
  }

  function refreshEmailNotify_() {
    loadEmailNotifyStatus_(emailNotifyUsers_);
  }

  function saveEmailNotify(idx, btn) {
    const row = emailNotifyRows[idx];
    if (!row) return;
    const input = document.getElementById('emailNotify_' + idx);
    const val = input ? input.value : '';
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
    const done_ = function (r) {
      if (btn) { btn.disabled = false; btn.textContent = '저장'; }
      if (r && r.success) { toast(r.email ? '저장했습니다.' : '알림을 껐습니다.'); refreshEmailNotify_(); }
      else alert(r && r.message ? r.message : '저장하지 못했습니다.');
    };
    const fail_ = function (e) {
      if (btn) { btn.disabled = false; btn.textContent = '저장'; }
      alert('오류: ' + e.message);
    };
    RUN()
      .withSuccessHandler(function (r) {
        // 사장님 줄은 서버가 알림 보낼 때 쓰는 'owner' 키에도 같은 주소를 넣어둔다.
        if (row.alsoOwner && r && r.success) {
          RUN().withSuccessHandler(function () { done_(r); }).withFailureHandler(fail_).setNotifyEmail('owner', val);
        } else {
          done_(r);
        }
      })
      .withFailureHandler(fail_)
      .setNotifyEmail(row.key, val);
  }

  function testEmailNotify(userKey, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '발송 중...'; }
    RUN()
      .withSuccessHandler(function (r) {
        if (btn) { btn.disabled = false; btn.textContent = '테스트'; }
        if (r && r.success) alert('보냈습니다. 메일함을 확인해 주세요.\n알림 소리가 안 나면 지메일 앱 > 설정 > 알림을 "전체"로 바꿔주세요.');
        else alert('실패: ' + (r && r.message ? r.message : JSON.stringify(r)));
        refreshEmailNotify_();
      })
      .withFailureHandler(function (e) {
        if (btn) { btn.disabled = false; btn.textContent = '테스트'; }
        alert('오류: ' + e.message);
      })
      .sendEmailNotifyTest(userKey);
  }

  /** 사용자관리 탭을 열 때 사용자 목록을 받아 이메일 알림 목록을 채운다. */
  function loadNotifyUsers_() {
    RUN()
      .withSuccessHandler(function (users) {
        loadEmailNotifyStatus_((Array.isArray(users) ? users : []).map(u => u.name));
      })
      .getUsers();
  }

  // ====================== 네이버 블로그 자동발행 ======================
  function saveNaverCreds() {
    const id = document.getElementById('naverClientId').value.trim();
    const secret = document.getElementById('naverClientSecret').value.trim();
    if (!id || !secret) { toast('Client ID/Secret을 모두 입력하세요'); return; }
    RUN()
      .withSuccessHandler(function () {
        toast('저장되었습니다');
        document.getElementById('naverClientId').value = '';
        document.getElementById('naverClientSecret').value = '';
        loadNaverLinkStatus();
      })
      .withFailureHandler(e => toast('오류: ' + e.message))
      .setNaverClientCreds(id, secret);
  }

  function connectNaver() {
    // 팝업 차단 우회: 클릭 즉시 빈 탭을 먼저 열고, URL이 오면 그 탭 주소만 바꾼다.
    const popup = window.open('', '_blank');
    RUN()
      .withSuccessHandler(function (url) {
        if (popup && !popup.closed) popup.location.href = url;
        else window.open(url, '_blank');
      })
      .withFailureHandler(function (e) {
        if (popup) popup.close();
        toast('오류: ' + e.message);
      })
      .getNaverAuthUrl();
  }

  function loadNaverLinkStatus() {
    const dbgEl = document.getElementById('naverDebugUrl');
    if (dbgEl) dbgEl.textContent = window.location.href + ' (referrer: ' + document.referrer + ')';
    const el = document.getElementById('naverLinkStatus');
    if (el) el.textContent = '연동 상태 확인 중...';
    RUN()
      .withSuccessHandler(function (res) {
        if (!el) return;
        if (res.linked) { el.textContent = '✓ 연동됨'; el.style.color = '#22c55e'; }
        else { el.textContent = res.hasCreds ? '연동 안 됨 (Client ID/Secret은 저장됨)' : 'Client ID/Secret부터 저장하세요'; el.style.color = '#94a3b8'; }
      })
      .withFailureHandler(function (e) { if (el) el.textContent = '오류: ' + e.message; })
      .getNaverLinkStatus();
  }

  function testNaverPost(btn) {
    if (btn) { btn.disabled = true; btn.textContent = '발행 중...'; }
    const resultEl = document.getElementById('naverLinkResult');
    if (resultEl) resultEl.textContent = '';
    RUN()
      .withSuccessHandler(function (res) {
        if (btn) { btn.disabled = false; btn.textContent = '테스트 발행'; }
        if (resultEl) resultEl.textContent = res && res.success ? ('성공: ' + (res.url || '발행됨')) : ('실패: ' + (res && res.message));
      })
      .withFailureHandler(function (e) {
        if (btn) { btn.disabled = false; btn.textContent = '테스트 발행'; }
        if (resultEl) resultEl.textContent = '오류: ' + e.message;
      })
      .sendNaverTestPost();
  }

  function publishNaverPost() {
    const title = document.getElementById('naverPostTitle').value.trim();
    const contents = document.getElementById('naverPostContents').value.trim();
    const category = document.getElementById('naverPostCategory').value.trim();
    const resultEl = document.getElementById('naverPostResult');
    if (!title || !contents) { toast('제목과 본문을 입력하세요'); return; }
    if (!confirm('네이버 블로그에 바로 발행됩니다. 진행할까요?')) return;
    resultEl.textContent = '발행 중...';
    RUN()
      .withSuccessHandler(function (res) {
        if (res && res.success) {
          resultEl.innerHTML = '✓ 발행 완료' + (res.url ? (' — <a href="' + res.url + '" target="_blank">글 보기</a>') : '');
          document.getElementById('naverPostTitle').value = '';
          document.getElementById('naverPostContents').value = '';
        } else {
          resultEl.textContent = '✗ 실패: ' + (res && res.message);
        }
      })
      .withFailureHandler(function (e) { resultEl.textContent = '오류: ' + e.message; })
      .postToNaverBlog(title, contents, category);
  }

  // ====================== 차량관리 ======================
  let vehicleListCache = [];
  let vehicleInfoCache = {};

  function loadVehicleTab() {
    RUN()
      .withSuccessHandler(function (vehicles) {
        vehicleListCache = Array.isArray(vehicles) ? vehicles : [];
        RUN()
          .withSuccessHandler(function (info) {
            vehicleInfoCache = info || {};
            renderVehicleCards();
            const opts = vehicleListCache.map(v => `<option value="${v.name}">${v.name}</option>`).join('');
            document.getElementById('fl_vehicle').innerHTML = opts;
            document.getElementById('fl_filterVehicle').innerHTML = '<option value="">전체 차량</option>' + opts;
            document.getElementById('fine_vehicle').innerHTML = opts;
            document.getElementById('fine_filterVehicle').innerHTML = '<option value="">전체 차량</option>' + opts;
            onFineVehicleChange();
            const monthEl = document.getElementById('fl_filterMonth');
            if (!monthEl.value) monthEl.value = currentMonthStr_();
            const vsumMonthEl = document.getElementById('vsum_month');
            if (!vsumMonthEl.value) vsumMonthEl.value = currentMonthStr_();
            const fineMonthEl = document.getElementById('fine_filterMonth');
            if (!fineMonthEl.value) fineMonthEl.value = currentMonthStr_();
            loadFuelLogs();
            loadVehicleSummary();
            loadFines();
          })
          .getVehicleInfo();
      })
      .getVehicleList();
  }

  function loadVehicleSummary() {
    const monthEl = document.getElementById('vsum_month');
    const monthStr = monthEl.value || currentMonthStr_();
    const tbody = document.getElementById('vsumBody');
    tbody.innerHTML = '<tr><td colspan="5" class="muted">불러오는 중...</td></tr>';
    RUN()
      .withSuccessHandler(function (rows) {
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) { tbody.innerHTML = '<tr><td colspan="5" class="muted">등록된 차량이 없습니다</td></tr>'; return; }
        tbody.innerHTML = list.map(function (r) {
          return '<tr><td>' + escapeHtml_(r.vehicle) + '</td><td>' + escapeHtml_(r.owner || '-') + '</td><td>' + fmtMoney(r.fuelCost) + '</td><td>' +
            (r.drivingKm != null ? r.drivingKm.toLocaleString() + 'km' : '<span class="muted">기준없음(전달 월말 킬로수 필요)</span>') + '</td><td>' +
            (r.costPerKm != null ? r.costPerKm.toLocaleString() + '원/km' : '-') + '</td></tr>';
        }).join('');
      })
      .withFailureHandler(function (e) { tbody.innerHTML = '<tr><td colspan="5" class="muted">오류: ' + e.message + '</td></tr>'; })
      .getVehicleMonthlySummary(monthStr);
  }

  // ====================== 관리자 "오늘 통합장부 작성 완료" ======================
  let intReviewIssueCount_ = 0; // "완료" 눌렀을 때 미해결 문제가 남아있으면 재확인시키기 위해 기억해둠

  // "작성완료" 클릭 시 순서: ① 그날 장부 출장자순 정렬 → ② 장부 검토 모달(누락/오류 확인) →
  // ③ "완료" 누르면 본사+지점 관리자 본인에게 그날 전체 요약 알림 발송 + 인센티브 알림 일괄발송
  // → ④ 격려 팝업. finishIntegratedLedger_()에서 ③④ 처리.
  function completeIntegratedLedger() {
    const modal = document.getElementById('integratedReviewModal');
    const dateEl = document.getElementById('intReviewDate');
    if (dateEl && !dateEl.value) dateEl.valueAsDate = new Date();
    const dateStr = dateEl ? dateEl.value : '';
    modal.classList.remove('hidden');
    document.getElementById('intReviewSummary').textContent = '출장자순 정렬 중...';
    document.getElementById('intReviewIssues').innerHTML = '';
    RUN()
      .withSuccessHandler(function () { loadIntegratedReview_(dateStr); })
      .withFailureHandler(function (e) { toast('정렬 중 오류(검토는 계속 진행): ' + e.message); loadIntegratedReview_(dateStr); })
      .sortDayByAgent(dateStr);
  }

  // 자정 넘어 전날 장부를 마무리하는 경우가 있어서, 검토 모달의 날짜를 바꿔서 원하는 날짜를 다시 조회할 수 있게 함
  function loadIntegratedReview_(dateStr) {
    document.getElementById('intReviewSummary').textContent = '검토 중...';
    document.getElementById('intReviewIssues').innerHTML = '';
    intReviewIssueCount_ = 0;
    RUN()
      .withSuccessHandler(function (res) {
        const total = (res && res.totalCount) || 0;
        const issues = (res && res.issues) || [];
        const softNotes = (res && res.softNotes) || [];
        intReviewIssueCount_ = issues.length;
        document.getElementById('intReviewSummary').textContent =
          '총 ' + total + '건 중 문제 ' + issues.length + '건' + (softNotes.length ? (', 참고 ' + softNotes.length + '건') : '');
        let html = '';
        if (!issues.length && !softNotes.length) {
          html = '<div class="muted">이상 없습니다. 바로 완료하셔도 됩니다 ✅</div>';
        }
        issues.forEach(function (it) {
          html += '<div class="card" style="background:#fff5f5;border-color:#fca5a5;margin-bottom:8px;">' +
            '<strong>' + escapeHtml_(it.date) + ' · ' + escapeHtml_(it.address || '(주소없음)') + '</strong>' +
            '<div class="muted" style="margin:4px 0;">' + escapeHtml_(it.content || '') + (it.agent ? ' · ' + escapeHtml_(it.agent) : '') + '</div>' +
            '<div style="color:#dc2626;font-size:13px;">⚠ ' + escapeHtml_(it.problems.join(', ')) + '</div>' +
            '</div>';
        });
        softNotes.forEach(function (it) {
          html += '<div class="card" style="background:#fffbeb;border-color:#fcd34d;margin-bottom:8px;">' +
            '<strong>' + escapeHtml_(it.date) + ' · ' + escapeHtml_(it.address || '') + '</strong>' +
            '<div class="muted" style="margin:4px 0;">' + escapeHtml_(it.content || '') + (it.agent ? ' · ' + escapeHtml_(it.agent) : '') + '</div>' +
            '<div style="color:#b45309;font-size:13px;">ℹ ' + escapeHtml_(it.note) + '</div>' +
            '</div>';
        });
        document.getElementById('intReviewIssues').innerHTML = html;
      })
      .withFailureHandler(function (e) {
        document.getElementById('intReviewSummary').textContent = '검토 중 오류: ' + e.message;
      })
      .validateTodayLedger(dateStr);
  }

  function finishIntegratedLedger_() {
    if (intReviewIssueCount_ > 0 &&
        !confirm('아직 해결 안 된 문제가 ' + intReviewIssueCount_ + '건 있습니다. 그래도 완료할까요?')) {
      return;
    }
    const dateEl = document.getElementById('intReviewDate');
    const dateStr = dateEl ? dateEl.value : '';
    document.getElementById('integratedReviewModal').classList.add('hidden');
    // 본사(owner)와 지금 완료를 누른 이 지점 관리자 본인에게 그날 전체 기록 요약을 보낸다.
    // 인센티브 발송과 독립적인 알림이라 실패해도 완료 흐름을 막지 않는다.
    RUN().withFailureHandler(function () {}).notifyIntegratedLedgerComplete(dateStr);
    RUN()
      .withSuccessHandler(function (res) {
        const results = (res && res.results) || [];
        if (results.length) {
          toast('인센티브 알림 발송: ' + results.map(r => r.agent + ' ' + (r.success ? '✅' : '❌')).join(' / '));
        }
        showEncouragePopup_();
      })
      .withFailureHandler(function (e) {
        toast('인센티브 알림 발송 오류: ' + e.message);
        showEncouragePopup_();
      })
      .sendIncentiveKakaoBatch(dateStr);
  }

  function renderVehicleCards() {
    const el = document.getElementById('vehicleCards');
    if (!el) return;
    if (!vehicleListCache.length) {
      el.innerHTML = '<span class="muted">등록된 차량이 없습니다. 재고·단가 관리 → 위치 설정에서 유형을 "차량"으로 추가하세요.</span>';
      return;
    }
    el.innerHTML = vehicleListCache.map(function (v) {
      const info = vehicleInfoCache[v.name] || {};
      return `<div class="card" style="background:#fafbfc;">
        <strong>🚗 ${v.name}${v.owner ? ' (담당: ' + v.owner + ')' : ''}</strong>
        <div class="row" style="margin-top:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:120px;"><label>차량번호</label><input id="veh_plate_${v.name}" value="${info.plate || ''}" /></div>
          <div style="flex:1;min-width:120px;"><label>검사만료일</label><input id="veh_insp_${v.name}" type="date" value="${info.inspectionDue || ''}" /></div>
          <div style="flex:1;min-width:120px;"><label>엔진오일 교체일</label><input id="veh_oilDate_${v.name}" type="date" value="${info.oilChangedDate || ''}" /></div>
          <div style="flex:1;min-width:120px;"><label>오일교체주기(km)</label><input id="veh_oilKm_${v.name}" type="number" value="${info.oilIntervalKm || ''}" /></div>
        </div>
        <div class="row" style="margin-top:8px;">
          <input id="veh_note_${v.name}" placeholder="비고" value="${info.note || ''}" style="flex:2;" />
          <button class="btn-primary" onclick="saveVehicleInfoEntry('${v.name}')">저장</button>
        </div>
      </div>`;
    }).join('');
  }

  function saveVehicleInfoEntry(name) {
    const info = {
      plate: document.getElementById('veh_plate_' + name).value.trim(),
      owner: (vehicleListCache.find(v => v.name === name) || {}).owner || '',
      inspectionDue: document.getElementById('veh_insp_' + name).value,
      oilChangedDate: document.getElementById('veh_oilDate_' + name).value,
      oilIntervalKm: document.getElementById('veh_oilKm_' + name).value,
      note: document.getElementById('veh_note_' + name).value.trim()
    };
    RUN()
      .withSuccessHandler(function () { toast('차량 정보가 저장되었습니다'); loadVehicleTab(); })
      .withFailureHandler(e => toast('오류: ' + e.message))
      .saveVehicleInfo(name, info);
  }

  function onFuelKindChange() {
    const kind = document.getElementById('fl_kind').value;
    document.getElementById('fl_amount').classList.toggle('hidden', kind !== '주유');
    document.getElementById('fl_km').classList.toggle('hidden', kind !== '킬로수');
  }

  /**
   * 저장 직후, 방금 넣은 건이 실제로 보이도록 목록 필터를 맞춘다.
   *
   * 이게 없으면 지난달 날짜로 넣거나 필터가 다른 차량에 걸려 있을 때 저장은 됐는데 목록에서
   * 사라져서, "등록이 안 됐나?" 하고 다시 누르게 된다 — 2026-08-17에 지출관리에서 실제로
   * 같은 건이 7초 간격으로 2번 저장됐다. 주유·과태료도 구조가 같아 같은 헬퍼를 쓴다.
   *
   * 차량 필터는 '전체 차량'(빈 값)이면 건드리지 않는다. 이미 전체가 보이고 있으므로 좁힐 이유가 없다.
   * res: 서버가 돌려준 {month, vehicle}
   */
  function syncListFilterAfterSave_(monthElId, vehicleElId, res) {
    if (!res) return '';
    const monthEl = document.getElementById(monthElId);
    if (monthEl && res.month) monthEl.value = res.month;
    const vehEl = document.getElementById(vehicleElId);
    if (vehEl && vehEl.value && res.vehicle && vehEl.value !== res.vehicle) vehEl.value = res.vehicle;
    return res.month ? ' (' + res.month + ')' : '';
  }

  function addFuelLogEntry() {
    const vehicle = document.getElementById('fl_vehicle').value;
    const date = document.getElementById('fl_date').value;
    const kind = document.getElementById('fl_kind').value;
    if (!vehicle) { toast('차량을 등록·선택하세요'); return; }
    if (!date) { toast('날짜를 입력하세요'); return; }
    const entry = {
      vehicle: vehicle, date: date, kind: kind,
      amount: document.getElementById('fl_amount').value,
      km: document.getElementById('fl_km').value,
      agent: currentUser.name
    };
    RUN()
      .withSuccessHandler(function (res) {
        const where = syncListFilterAfterSave_('fl_filterMonth', 'fl_filterVehicle', res);
        toast('기록이 추가되었습니다' + where);
        document.getElementById('fl_amount').value = '';
        document.getElementById('fl_km').value = '';
        loadFuelLogs();
      })
      .withFailureHandler(e => toast('오류: ' + e.message))
      .addFuelLog(entry);
  }

  function loadFuelLogs() {
    const vehicle = document.getElementById('fl_filterVehicle').value;
    const month = document.getElementById('fl_filterMonth').value;
    RUN()
      .withSuccessHandler(function (logs) {
        const list = Array.isArray(logs) ? logs : [];
        document.getElementById('fuelLogBody').innerHTML = list.map(r => `
          <tr>
            <td>${escapeHtml_(r.date)}</td><td>${escapeHtml_(r.vehicle)}</td><td>${escapeHtml_(r.kind)}</td>
            <td>${r.km ? Number(r.km).toLocaleString() + 'km' : '-'}</td>
            <td>${r.amount ? fmtMoney(r.amount) : '-'}</td>
            <td>${escapeHtml_(r.agent)}</td>
            <td><button class="btn-danger" style="padding:2px 8px;font-size:12px;" onclick="deleteFuelLogEntry(${r.rowIndex})">삭제</button></td>
          </tr>`).join('');
        const totalFuel = list.filter(r => r.kind === '주유').reduce((s, r) => s + (Number(r.amount) || 0), 0);
        // "전체 차량" 필터일 때 차량 구분 없이 전체 킬로수 중 최대-최소로 계산하면 서로 다른
        // 차량의 계기판 숫자끼리 빼는 셈이 되어 의미 없는 값이 나온다(예: A차 첫 킬로수 입력 3,700km와
        // B차 67,058km를 빼서 63,358km라는 엉뚱한 "주행거리"가 나옴). 반드시 차량별로 묶어서, 그
        // 차량에 킬로수가 2회 이상 입력된 경우에만 그 차량의 최대-최소를 구하고, 그걸 차량별로 합산한다.
        const kmByVehicle_ = {};
        list.filter(r => r.kind === '킬로수').forEach(function (r) {
          const v = r.vehicle || '';
          (kmByVehicle_[v] || (kmByVehicle_[v] = [])).push(Number(r.km) || 0);
        });
        let kmRange = null;
        Object.keys(kmByVehicle_).forEach(function (v) {
          const arr = kmByVehicle_[v];
          if (arr.length >= 2) kmRange = (kmRange || 0) + (Math.max(...arr) - Math.min(...arr));
        });
        document.getElementById('fuelSummary').innerHTML = `
          <div class="stat-card">
            <div class="stat-label">이번 조회 총 주유비</div>
            <div class="stat-value">${fmtMoney(totalFuel)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">이번 조회 총 킬로수</div>
            <div class="stat-value">${kmRange != null ? kmRange.toLocaleString() + 'km' : '-'}</div>
            ${kmRange == null ? '<div class="stat-delta" style="color:var(--muted);">월말 킬로수 2회 이상 입력 필요</div>' : ''}
          </div>
        `;
      })
      .getFuelLogs(vehicle, month);
  }

  function deleteFuelLogEntry(rowIndex) {
    if (!confirm('이 기록을 삭제할까요?')) return;
    RUN().withSuccessHandler(function () { loadFuelLogs(); }).deleteFuelLog(rowIndex);
  }

  // ====================== 차량 과태료 ======================
  /** 과태료는 차량에 귀속되고, 차량은 한 직원이 계속 타고 다니는 걸 전제로 담당자를 차량 등록정보(owner)에서 그대로 가져온다. */
  function onFineVehicleChange() {
    const vehicle = document.getElementById('fine_vehicle').value;
    const owner = (vehicleListCache.find(v => v.name === vehicle) || {}).owner || '';
    const hint = document.getElementById('fine_ownerHint');
    if (hint) hint.textContent = owner ? ('담당자: ' + owner + ' (인센티브 월정산에서 이 사람 몫으로 차감됩니다)') : '이 차량은 담당자가 지정돼 있지 않습니다 — 위치설정에서 담당자를 먼저 지정하세요';
  }

  function addFineEntry() {
    const vehicle = document.getElementById('fine_vehicle').value;
    const date = document.getElementById('fine_date').value;
    if (!vehicle) { toast('차량을 등록·선택하세요'); return; }
    if (!date) { toast('날짜를 입력하세요'); return; }
    const owner = (vehicleListCache.find(v => v.name === vehicle) || {}).owner || '';
    const entry = {
      vehicle: vehicle, date: date, agent: owner,
      amount: document.getElementById('fine_amount').value,
      reason: document.getElementById('fine_reason').value.trim()
    };
    RUN()
      .withSuccessHandler(function (res) {
        const where = syncListFilterAfterSave_('fine_filterMonth', 'fine_filterVehicle', res);
        toast(owner
          ? '과태료 기록이 추가되었습니다' + where + ' (담당자: ' + owner + ')'
          : '과태료 기록이 추가됐지만 담당자 미지정이라 월정산에 반영되지 않습니다' + where);
        document.getElementById('fine_amount').value = '';
        document.getElementById('fine_reason').value = '';
        loadFines();
      })
      .withFailureHandler(e => toast('오류: ' + e.message))
      .addFine(entry);
  }

  function loadFines() {
    const vehicle = document.getElementById('fine_filterVehicle').value;
    const month = document.getElementById('fine_filterMonth').value;
    RUN()
      .withSuccessHandler(function (rows) {
        const list = Array.isArray(rows) ? rows : [];
        document.getElementById('fineBody').innerHTML = list.length ? list.map(r => `
          <tr>
            <td>${escapeHtml_(r.date)}</td><td>${escapeHtml_(r.vehicle)}</td><td>${escapeHtml_(r.agent||'-')}</td>
            <td>${fmtMoney(r.amount)}</td><td>${escapeHtml_(r.reason||'')}</td>
            <td><button class="btn-danger" style="padding:2px 8px;font-size:12px;" onclick="deleteFineEntry(${r.rowIndex})">삭제</button></td>
          </tr>`).join('') : '<tr><td colspan="6" class="muted" style="padding:12px;">해당 조건의 과태료 기록이 없습니다</td></tr>';
        const total = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        document.getElementById('fineSummary').innerHTML = `
          <div class="stat-card">
            <div class="stat-label">이번 조회 총 과태료</div>
            <div class="stat-value">${fmtMoney(total)}</div>
            <div class="stat-delta" style="color:var(--muted);">${list.length}건</div>
          </div>
        `;
      })
      .getFines(vehicle, month);
  }

  function deleteFineEntry(rowIndex) {
    if (!confirm('이 기록을 삭제할까요?')) return;
    RUN().withSuccessHandler(function () { loadFines(); }).deleteFine(rowIndex);
  }

  // ====================== 인센티브 월정산 ======================
  function loadMonthlySettlement() {
    const monthEl = document.getElementById('settleMonth');
    if (!monthEl.value) monthEl.value = currentMonthStr_();
    const month = monthEl.value;
    const body = document.getElementById('settleTableBody');
    body.innerHTML = '<tr><td colspan="5" class="muted" style="padding:12px;">불러오는 중...</td></tr>';
    RUN()
      .withSuccessHandler(function (rows) {
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) { body.innerHTML = '<tr><td colspan="5" class="muted" style="padding:12px;">직원이 없습니다</td></tr>'; return; }
        body.innerHTML = list.map(function (r) {
          return `<tr>
            <td>${escapeHtml_(r.agent)}</td>
            <td>${fmtMoney(r.incentiveTotal)}</td>
            <td style="color:#dc2626;">${r.fineTotal ? '-' + fmtMoney(r.fineTotal) : fmtMoney(0)}</td>
            <td style="font-weight:700;">${fmtMoney(r.finalAmount)}</td>
            <td>${r.confirmed ? '<span class="badge" style="background:#dcfce7;color:#16a34a;">확정됨</span>' : '<span class="muted">미확정</span>'}</td>
          </tr>`;
        }).join('');
      })
      .withFailureHandler(function (e) { body.innerHTML = '<tr><td colspan="5" class="muted" style="padding:12px;">불러오기 실패: ' + e.message + '</td></tr>'; })
      .getMonthlySettlementPreview(month);
  }

  function confirmMonthlySettlementBtn() {
    const monthEl = document.getElementById('settleMonth');
    const month = monthEl.value || currentMonthStr_();
    if (!confirm(month + ' 인센티브 월정산을 확정하고, 직원별로 [인센티브 합계 − 과태료 = 최종지급액] 안내를 보낼까요? (이미 확정한 적 있으면 이번 내용으로 덮어씁니다)')) return;
    RUN()
      .withSuccessHandler(function (res) {
        const results = (res && res.results) || [];
        if (!results.length) { toast('정산 대상(인센티브 또는 과태료가 있는 직원)이 없습니다'); return; }
        const lines = results.map(r => `${r.agent}: ${fmtMoney(r.finalAmount)} ${r.success ? '✅' : '❌(' + (r.message||'실패') + ')'}`);
        alert('월정산 확정 + 알림발송 결과\n\n' + lines.join('\n'));
        loadMonthlySettlement();
      })
      .withFailureHandler(e => toast('오류: ' + e.message))
      .confirmMonthlySettlement(month, currentUser.name);
  }


