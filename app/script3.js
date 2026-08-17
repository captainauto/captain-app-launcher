
  let albumCategory = null;
  let albumOffset = 0;

  function albEl(id) {
    const p = (currentUser && isAdminRole_(currentUser.role)) ? 'a_' : 'e_';
    return document.getElementById(p + id);
  }

  function initAlbumTab() {
    const wrap = albEl('albumCats');
    if (!wrap || wrap.childElementCount) return;
    RUN()
      .withSuccessHandler(function (cats) {
        wrap.innerHTML = (cats || []).map(function (c) {
          return '<button class="btn-outline album-cat-btn" onclick="openAlbumCategory(\'' + escapeJsStr_(c) + '\')">' + escapeHtml_(c) + '</button>';
        }).join('');
      })
      .withFailureHandler(function (e) { wrap.innerHTML = '<span class="muted">오류: ' + e.message + '</span>'; })
      .getAlbumCategories();
  }

  function openAlbumCategory(cat) {
    albumCategory = cat;
    albumOffset = 0;
    albEl('albumCatTitle').textContent = cat;
    albEl('albumUploadWrap').classList.remove('hidden');
    albEl('albumGrid').innerHTML = '';
    albEl('albumMoreBtn').classList.add('hidden');
    loadAlbumPage(true);
  }

  function loadAlbumPage(reset) {
    if (!albumCategory) return;
    const grid = albEl('albumGrid');
    const status = albEl('albumStatus');
    status.textContent = '불러오는 중...';
    RUN()
      .withSuccessHandler(function (res) {
        status.textContent = '';
        const items = (res && res.items) || [];
        if (reset) grid.innerHTML = '';
        if (!items.length && reset) {
          grid.innerHTML = '<span class="muted">아직 올라온 파일이 없습니다. 첫 파일을 올려보세요!</span>';
        }
        grid.insertAdjacentHTML('beforeend', items.map(renderAlbumItem_).join(''));
        albumOffset += items.length;
        const more = albEl('albumMoreBtn');
        if (res && res.hasMore) more.classList.remove('hidden');
        else more.classList.add('hidden');
        if (res && typeof res.total === 'number') {
          albEl('albumCatTitle').textContent = albumCategory + ' (' + res.total + ')';
        }
      })
      .withFailureHandler(function (e) { status.textContent = '오류: ' + e.message; })
      .getAlbumList(albumCategory, albumOffset);
  }

  function renderAlbumItem_(m) {
    const canDelete = currentUser && (currentUser.role === '관리자' || currentUser.name === m.uploadedBy);
    const icon = m.kind === 'video' ? '🎥' : (m.kind === 'photo' ? '🖼️' : '📄');
    const thumb = m.thumb
      ? '<img src="' + m.thumb + '" style="width:100%;height:110px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" />'
      : '<div style="width:100%;height:110px;display:flex;align-items:center;justify-content:center;font-size:34px;background:#f1f3f5;border-radius:8px;border:1px solid var(--border);">' + icon + '</div>';
    return '<div style="width:140px;font-size:11px;">' +
      '<a href="' + m.viewUrl + '" target="_blank">' + thumb + '</a>' +
      '<div style="margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + escapeHtml_(m.fileName) + '">' + icon + ' ' + escapeHtml_(m.fileName) + '</div>' +
      '<div class="muted" style="font-size:10px;">' + escapeHtml_(m.uploadedBy || '') + '</div>' +
      '<div style="margin-top:2px;">' +
        '<a href="' + m.viewUrl + '" target="_blank">보기·다운로드</a>' +
        (canDelete ? ' · <a href="#" style="color:#dc2626;" onclick="event.preventDefault();deleteAlbumItem(\'' + escapeJsStr_(m.fileId) + '\')">삭제</a>' : '') +
      '</div>' +
    '</div>';
  }

  function deleteAlbumItem(fileId) {
    if (!confirm('이 파일을 삭제하시겠습니까?')) return;
    RUN()
      .withSuccessHandler(function () {
        toast('삭제되었습니다');
        albumOffset = 0;
        loadAlbumPage(true);
      })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); })
      .deleteAlbumFile(fileId, currentUser.name, currentUser.role);
  }

  function handleAlbumFiles(inputEl) {
    const files = inputEl.files;
    if (!files || !files.length) return;
    if (!albumCategory) { toast('먼저 카테고리를 선택하세요'); return; }
    const fileList = Array.from(files);
    const total = fileList.length;
    const status = albEl('albumStatus');
    const progWrap = albEl('albumProgressWrap');
    const progFill = albEl('albumProgressFill');
    const progPct = albEl('albumProgressPct');
    const setBar_ = function (pct) {
      const p = Math.max(0, Math.min(100, Math.round(pct)));
      if (progFill) progFill.style.width = p + '%';
      if (progPct) progPct.textContent = p + '%';
    };
    status.textContent = '업로드 중... (0/' + total + ')';
    if (progWrap) progWrap.classList.remove('hidden');
    setBar_(0);
    mediaUploadActive_ = true; // 앨범 업로드 중에도 탭을 닫으려 하면 경고가 뜨도록

    function uploadOne(idx) {
      if (idx >= total) {
        mediaUploadActive_ = false;
        setBar_(100);
        status.textContent = '업로드 완료 ✅';
        inputEl.value = '';
        albumOffset = 0;
        loadAlbumPage(true);
        return;
      }
      const file = fileList[idx];
      const reader = new FileReader();
      reader.onload = function () {
        const base64 = reader.result.split(',')[1];
        RUN()
          .withSuccessHandler(function () {
            status.textContent = '업로드 중... (' + (idx + 1) + '/' + total + ')';
            setBar_(((idx + 1) / total) * 100);
            uploadOne(idx + 1);
          })
          .withFailureHandler(function (e) {
            status.textContent = (idx + 1) + '번째 파일 실패: ' + e.message;
            setBar_(((idx + 1) / total) * 100);
            uploadOne(idx + 1);
          })
          .uploadAlbumFile(albumCategory, base64, file.type, file.name, currentUser.name);
      };
      reader.readAsDataURL(file);
    }
    uploadOne(0);
  }

  // ====================== 월손익 (통계 탭 상단) ======================
  // 서버가 최근 12개월치를 한 번에 주고, 여기서 폭포수·추이·손익분기를 그린다.
  let pnlCache_ = null;

  function loadPnL() {
    const el = document.getElementById('pnlWaterfall');
    if (el) el.innerHTML = '<span class="muted">불러오는 중...</span>';
    RUN()
      .withSuccessHandler(function (res) {
        pnlCache_ = res || { months: [] };
        populatePnLMonths_();
        renderPnL_();
        renderPnLTrend_();
      })
      .withFailureHandler(function (e) {
        if (el) el.innerHTML = '<span class="muted">불러오기 실패: ' + e.message + '</span>';
      })
      .getMonthlyPnL(12);
  }

  function populatePnLMonths_() {
    const sel = document.getElementById('pnlMonthSel');
    if (!sel || !pnlCache_) return;
    const months = (pnlCache_.months || []).slice().reverse();   // 최신이 위로
    sel.innerHTML = months.map(function (m) {
      return '<option value="' + m.ym + '">' + m.ym + '</option>';
    }).join('');
  }

  function pnlPct_(v) { return (v * 100).toFixed(1) + '%'; }

  /** 폭포수 한 줄. sign: '+'면 더하는 줄, '-'면 빼는 줄, ''면 소계 */
  function pnlRow_(label, amount, sign, opt) {
    const o = opt || {};
    const neg = amount < 0;
    const color = o.subtotal ? (neg ? '#dc2626' : '#0f172a') : (sign === '-' ? '#dc2626' : '#0f172a');
    const weight = o.subtotal ? '700' : '400';
    const border = o.subtotal ? 'border-top:2px solid #cbd5e1;' : '';
    const bg = o.highlight ? 'background:#f0fdfa;' : '';
    const pct = (o.rate !== undefined && o.rate !== null)
      ? '<span class="muted" style="font-size:12px;margin-left:6px;">(' + pnlPct_(o.rate) + ')</span>' : '';
    const click = o.onclick ? ' style="cursor:pointer;text-decoration:underline;" onclick="' + o.onclick + '"' : '';
    return '<tr style="' + border + bg + '">' +
      '<td' + click + '>' + (sign === '-' ? '− ' : (sign === '+' ? '+ ' : '')) + label + '</td>' +
      '<td style="text-align:right;color:' + color + ';font-weight:' + weight + ';white-space:nowrap;">' +
        (sign === '-' ? '-' : '') + fmtMoney(Math.abs(amount)) + pct +
      '</td></tr>';
  }

  function renderPnL_() {
    const el = document.getElementById('pnlWaterfall');
    const beEl = document.getElementById('pnlBreakEven');
    const detEl = document.getElementById('pnlDetail');
    if (!el || !pnlCache_) return;
    if (detEl) detEl.innerHTML = '';

    const ym = (document.getElementById('pnlMonthSel') || {}).value;
    const m = (pnlCache_.months || []).filter(function (x) { return x.ym === ym; })[0];
    if (!m) { el.innerHTML = '<span class="muted">데이터가 없습니다.</span>'; if (beEl) beEl.innerHTML = ''; return; }

    let html = '<div class="table-wrap"><table><tbody>';
    html += pnlRow_('매출 (부가세 제외)', m.revenue, '');
    if (m.incheonFee) html += pnlRow_('인천 가맹비', m.incheonFee, '+');
    html += pnlRow_('매출원가 (자재)', m.cost, '-');
    html += pnlRow_('매출총이익', m.grossProfit, '', { subtotal: true, rate: m.grossRate, highlight: true });
    if (m.labor) {
      html += pnlRow_('인건비' + (m.salaryEstimate ? ' (급여는 예상)' : ''), m.labor, '-',
        { onclick: "showPnLDetail_('인건비')" });
    }
    if (m.car) html += pnlRow_('차량비', m.car, '-', { onclick: "showPnLDetail_('차량')" });
    if (m.shop) html += pnlRow_('매장·사무', m.shop, '-', { onclick: "showPnLDetail_('매장')" });
    if (m.sga) html += pnlRow_('판관비', m.sga, '-', { onclick: "showPnLDetail_('판관비')" });
    if (m.taxMajor) html += pnlRow_('세금', m.taxMajor, '-', { onclick: "showPnLDetail_('세금')" });
    html += pnlRow_('영업이익', m.operating, '', { subtotal: true, rate: m.operatingRate });
    html += pnlRow_('순이익', m.net, '', { subtotal: true, rate: m.netRate, highlight: true });
    html += '</tbody></table></div>';

    // 차량비는 세 군데서 모이므로 어디서 왔는지 밝혀둔다
    if (m.car) {
      const d = m.carDetail || {};
      html += '<p class="muted" style="margin-top:6px;font-size:12px;">' +
        '차량비 내역 — 주유대장 ' + fmtMoney(d.fuel || 0) +
        ' · 과태료 ' + fmtMoney(d.fine || 0) +
        ' · 지출대장(충전·주차·보험·정비) ' + fmtMoney(d.expense || 0) + '</p>';
    }
    if (m.inProgress) {
      html += '<p style="margin-top:8px;font-size:12px;color:#1d4ed8;background:#eff6ff;padding:8px;border-radius:6px;">' +
        'ℹ️ ' + m.ym + '은 <strong>아직 진행 중인 달</strong>입니다. 매출도 비용도 월말까지 계속 늘어나니 중간 점검용으로 보세요.</p>';
    }
    if (m.salaryEstimate) {
      html += '<p style="margin-top:8px;font-size:12px;color:#1d4ed8;background:#eff6ff;padding:8px;border-radius:6px;">' +
        'ℹ️ ' + m.ym + ' 급여는 <strong>다음 달 초에 지급</strong>되므로 아직 안 나갔습니다. ' +
        '그냥 비워두면 이익이 ' + fmtMoney(m.salaryEstimate) + '만큼 부풀어 보여서, ' +
        '직전에 나간 급여 <strong>' + fmtMoney(m.salaryEstimate) + '</strong>을 미지급으로 잡아뒀습니다. ' +
        '실제 지급되면 그 금액으로 바뀝니다.</p>';
    }
    if (m.legacyCostBasis) {
      html += '<p style="margin-top:8px;font-size:12px;color:#b45309;background:#fffbeb;padding:8px;border-radius:6px;">' +
        '⚠️ ' + m.ym + '은 <strong>참고치</strong>입니다. ' + pnlCache_.costBasisChangeYm +
        ' 이전에 저장된 기록은 자재 원가가 부가세 포함으로 들어가 있어서, 매출총이익이 실제보다 조금 낮게 나옵니다.</p>';
    }
    el.innerHTML = html;

    if (beEl) {
      const gap = m.revenue - m.breakEven;
      const reached = gap >= 0;
      beEl.innerHTML = m.breakEven
        ? '<div style="padding:10px;border-radius:8px;background:' + (reached ? '#f0fdf4' : '#fef2f2') + ';">' +
            '<strong>손익분기 매출 ' + fmtMoney(m.breakEven) + '</strong> — ' +
            (reached
              ? '이미 넘겼습니다. ' + fmtMoney(gap) + ' 더 팔았습니다.'
              : '<span style="color:#dc2626;">' + fmtMoney(-gap) + ' 모자랍니다.</span>') +
            '<div class="muted" style="font-size:12px;margin-top:4px;">이 달 고정비 ' + fmtMoney(m.totalCost) +
            '을 매출총이익률 ' + pnlPct_(m.grossRate) + '로 메우려면 필요한 매출입니다.</div>' +
          '</div>'
        : '';
    }
  }

  /** 비용 줄을 누르면 그 대분류의 상세 내역을 펼친다. */
  function showPnLDetail_(major) {
    const detEl = document.getElementById('pnlDetail');
    const ym = (document.getElementById('pnlMonthSel') || {}).value;
    if (!detEl || !ym) return;
    detEl.innerHTML = '<span class="muted">' + major + ' 내역 불러오는 중...</span>';
    RUN()
      .withSuccessHandler(function (rows) {
        const list = (rows || []).filter(function (r) { return r.major === major; });
        if (!list.length) { detEl.innerHTML = '<span class="muted">' + major + ' 내역이 없습니다.</span>'; return; }
        detEl.innerHTML = '<strong style="font-size:13px;">' + ym + ' ' + major + ' 내역</strong>' +
          '<div class="table-wrap" style="margin-top:6px;"><table>' +
          '<thead><tr><th>항목</th><th>이 달 반영</th><th>원금</th><th>업무%</th><th>배분</th><th>메모</th></tr></thead><tbody>' +
          list.map(function (r) {
            return '<tr><td>' + r.item + '</td>' +
              '<td style="text-align:right;">' + fmtMoney(r.amount) + '</td>' +
              '<td style="text-align:right;" class="muted">' + fmtMoney(r['원금']) + '</td>' +
              '<td style="text-align:right;">' + r.workPct + '%</td>' +
              '<td>' + r.spread + '</td>' +
              '<td class="muted">' + (r.memo || '') + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      })
      .withFailureHandler(function (e) { detEl.innerHTML = '<span class="muted">실패: ' + e.message + '</span>'; })
      .getPnLDetail(ym);
  }

  function renderPnLTrend_() {
    const el = document.getElementById('pnlTrend');
    if (!el || !pnlCache_) return;
    const months = pnlCache_.months || [];
    if (!months.length) { el.innerHTML = '<span class="muted">데이터가 없습니다.</span>'; return; }

    // 적자(음수 순이익)도 보여야 하므로 절대값 최대치를 기준으로 잡는다
    const maxV = Math.max(1, ...months.map(function (m) {
      return Math.max(m.revenue, m.grossProfit, Math.abs(m.net));
    }));
    el.innerHTML = months.map(function (m) {
      const w = function (v) { return Math.round(Math.abs(v) / maxV * 100); };
      const netColor = m.net < 0 ? '#dc2626' : '#ea580c';
      return '<div class="bar-row">' +
        '<span class="bar-label">' + m.ym + (m.legacyCostBasis ? ' ⚠️' : '') + '</span>' +
        '<div class="bar-track" style="height:22px;">' +
          '<div class="bar-fill" style="width:' + w(m.revenue) + '%;height:7px;top:0;"></div>' +
          '<div class="bar-fill" style="width:' + w(m.grossProfit) + '%;height:7px;top:7px;background:#16a34a;"></div>' +
          '<div class="bar-fill" style="width:' + w(m.net) + '%;height:7px;top:14px;background:' + netColor + ';"></div>' +
        '</div>' +
        '<span class="bar-val" style="font-size:11px;">' + fmtMoney(m.revenue) + '<br>' +
          '<span style="color:' + netColor + ';font-weight:700;">' + (m.net < 0 ? '-' : '') + fmtMoney(Math.abs(m.net)) + '</span></span>' +
      '</div>';
    }).join('');
  }

  // ====================== 지출관리 탭 (월손익 1단계) ======================
  // 손익 계산은 2단계에서 붙는다. 여기서는 기록을 쌓는 것까지만 한다.
  // 설계: docs/superpowers/specs/2026-08-16-월손익-설계.md
  let expenseOptionsLoaded_ = false;
  let expenseEditingRow_ = null;   // 수정 중인 행번호. null이면 신규 등록 모드.
  let expenseRows_ = [];           // 방금 그린 목록 (수정 버튼이 참조)

  function loadExpenseTab() {
    if (!expenseOptionsLoaded_) {
      RUN()
        .withSuccessHandler(function (opt) {
          fillExpenseSelect_('ex_major', opt.majors, '');
          fillExpenseSelect_('ex_payMethod', opt.payMethods, '');
          fillExpenseSelect_('ex_nature', opt.natures, '');
          fillExpenseSelect_('ex_filterMajor', opt.majors, '전체 대분류');
          fillExpenseSelect_('tpl_major', opt.majors, '');
          fillExpenseSelect_('tpl_payMethod', opt.payMethods, '');
          fillExpenseSelect_('tpl_nature', opt.natures, '');
          expenseOptionsLoaded_ = true;
          initExpenseDefaults_();
          loadExpenses();
          loadExpenseTemplates();
        })
        .withFailureHandler(function (e) { toast('지출 설정 불러오기 실패: ' + e.message); })
        .getExpenseOptions();
    } else {
      loadExpenses();
      loadExpenseTemplates();
    }
  }

  /** 고급 설정 접기/펼치기. 평소엔 접어둔다 — 실제로 손대는 건 5칸뿐이다. */
  function toggleExpenseAdvanced() {
    const box = document.getElementById('ex_advanced');
    const label = document.getElementById('ex_advToggleLabel');
    if (!box) return;
    const willShow = box.classList.contains('hidden');
    box.classList.toggle('hidden', !willShow);
    if (label) label.textContent = willShow ? '⚙️ 고급 설정 접기' : '⚙️ 고급 설정 (거의 안 씁니다)';
  }

  /** 드롭다운 채우기. blankLabel이 있으면 맨 위에 빈 값 항목을 넣는다(필터용). */
  function fillExpenseSelect_(id, values, blankLabel) {
    const el = document.getElementById(id);
    if (!el) return;
    let html = blankLabel ? '<option value="">' + blankLabel + '</option>' : '';
    html += (values || []).map(function (v) {
      return '<option value="' + v + '">' + v + '</option>';
    }).join('');
    el.innerHTML = html;
  }

  /** 처음 열 때 날짜·필터월을 오늘 기준으로 채운다. */
  function initExpenseDefaults_() {
    const now = new Date();
    const ymd = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    const dateEl = document.getElementById('ex_date');
    if (dateEl && !dateEl.value) dateEl.value = ymd;
    const monthEl = document.getElementById('ex_filterMonth');
    if (monthEl && !monthEl.value) monthEl.value = ymd.slice(0, 7);
    const tplMonthEl = document.getElementById('ex_tplRunMonth');
    if (tplMonthEl && !tplMonthEl.value) tplMonthEl.value = ymd.slice(0, 7);
  }

  // ---------- 반복 지출(템플릿) ----------
  let expenseTplRows_ = [];
  let expenseTplEditingRow_ = null;

  function loadExpenseTemplates() {
    const body = document.getElementById('expenseTplBody');
    if (!body) return;
    RUN()
      .withSuccessHandler(function (rows) { renderExpenseTemplates_(rows || []); })
      .withFailureHandler(function (e) {
        body.innerHTML = '<tr><td colspan="9" class="muted">불러오기 실패: ' + e.message + '</td></tr>';
      })
      .getExpenseTemplates();
  }

  function renderExpenseTemplates_(rows) {
    const body = document.getElementById('expenseTplBody');
    expenseTplRows_ = rows;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9" class="muted">등록된 반복 지출이 없습니다. 월세·통신비처럼 매달 나가는 걸 위에서 추가해보세요.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (t) {
      const off = t.on ? '' : ' style="opacity:.5;"';
      return '<tr' + off + '>' +
        '<td>' + (t.on ? '✅' : '⏸️') + '</td>' +
        '<td>' + t.major + '</td>' +
        '<td>' + t.item + '</td>' +
        '<td style="text-align:right;">' + fmtMoney(t.amount) + '</td>' +
        '<td>' + t.day + '일</td>' +
        '<td>' + t.payMethod + '</td>' +
        '<td>' + t.nature + '</td>' +
        '<td>' + (t.memo || '') + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button class="btn-outline" style="padding:2px 8px;font-size:12px;" onclick="toggleExpenseTemplate(' + t.rowIndex + ')">' + (t.on ? '중지' : '사용') + '</button> ' +
          '<button class="btn-outline" style="padding:2px 8px;font-size:12px;" onclick="editExpenseTemplate(' + t.rowIndex + ')">수정</button> ' +
          '<button class="btn-outline" style="padding:2px 8px;font-size:12px;" onclick="removeExpenseTemplate(' + t.rowIndex + ')">삭제</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function findExpenseTpl_(rowIndex) {
    return expenseTplRows_.filter(function (x) { return x.rowIndex === rowIndex; })[0];
  }

  function readExpenseTemplateForm_(on) {
    return {
      on: on,
      major: document.getElementById('tpl_major').value,
      item: document.getElementById('tpl_item').value.trim(),
      amount: Number(document.getElementById('tpl_amount').value) || 0,
      payMethod: document.getElementById('tpl_payMethod').value,
      nature: document.getElementById('tpl_nature').value,
      workPct: 100,
      day: Number(document.getElementById('tpl_day').value) || 1,
      memo: document.getElementById('tpl_memo').value.trim()
    };
  }

  function resetExpenseTemplateForm() {
    expenseTplEditingRow_ = null;
    ['tpl_item', 'tpl_amount', 'tpl_day', 'tpl_memo'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  function submitExpenseTemplate() {
    const tpl = readExpenseTemplateForm_(true);
    if (!tpl.item) { toast('항목을 입력해주세요.'); return; }
    if (!(tpl.amount > 0)) { toast('금액을 입력해주세요.'); return; }
    if (!(tpl.day >= 1 && tpl.day <= 31)) { toast('매달 며칠에 나가는지 입력해주세요 (1~31).'); return; }
    saveExpenseTemplate_(expenseTplEditingRow_, tpl, expenseTplEditingRow_ ? '수정했습니다.' : '반복 지출로 등록했습니다.');
  }

  function saveExpenseTemplate_(rowIndex, tpl, okMsg) {
    RUN()
      .withSuccessHandler(function (res) {
        if (res && res.success) { toast(okMsg); resetExpenseTemplateForm(); loadExpenseTemplates(); }
        else { toast((res && res.message) || '저장하지 못했습니다.'); }
      })
      .withFailureHandler(function (e) { toast('저장 실패: ' + e.message); })
      .saveExpenseTemplate(rowIndex, tpl);
  }

  function editExpenseTemplate(rowIndex) {
    const t = findExpenseTpl_(rowIndex);
    if (!t) { toast('항목을 찾지 못했습니다. 새로고침해주세요.'); return; }
    document.getElementById('tpl_major').value = t.major;
    document.getElementById('tpl_item').value = t.item;
    document.getElementById('tpl_amount').value = t.amount;
    document.getElementById('tpl_day').value = t.day;
    document.getElementById('tpl_payMethod').value = t.payMethod;
    document.getElementById('tpl_nature').value = t.nature;
    document.getElementById('tpl_memo').value = t.memo || '';
    expenseTplEditingRow_ = rowIndex;
    toast('수정 모드입니다. 내용을 바꾸고 추가를 누르세요.');
  }

  /** 지우지 않고 잠시 멈추기 — 예: 계약 끝난 달만 건너뛰고 싶을 때. */
  function toggleExpenseTemplate(rowIndex) {
    const t = findExpenseTpl_(rowIndex);
    if (!t) { toast('항목을 찾지 못했습니다. 새로고침해주세요.'); return; }
    const next = {
      on: !t.on, major: t.major, item: t.item, amount: t.amount, payMethod: t.payMethod,
      nature: t.nature, workPct: t.workPct, day: t.day, memo: t.memo
    };
    saveExpenseTemplate_(rowIndex, next, next.on ? '다시 사용합니다.' : '자동 생성을 중지했습니다.');
  }

  function removeExpenseTemplate(rowIndex) {
    const t = findExpenseTpl_(rowIndex);
    if (!t) { toast('항목을 찾지 못했습니다. 새로고침해주세요.'); return; }
    if (!confirm('반복 지출 "' + t.item + '"을(를) 삭제할까요?\n(이미 지출대장에 들어간 기록은 그대로 남습니다)')) return;
    RUN()
      .withSuccessHandler(function (res) {
        if (res && res.success) { toast('삭제했습니다.'); resetExpenseTemplateForm(); loadExpenseTemplates(); }
        else { toast((res && res.message) || '삭제하지 못했습니다.'); }
      })
      .withFailureHandler(function (e) { toast('삭제 실패: ' + e.message); })
      .deleteExpenseTemplate(rowIndex);
  }

  /** 매달 1일을 기다리지 않고 지금 바로 넣기. 이미 있는 항목은 서버가 건너뛴다. */
  function runExpenseTemplatesNow() {
    const ym = document.getElementById('ex_tplRunMonth').value;
    if (!ym) { toast('넣을 달을 골라주세요.'); return; }
    RUN()
      .withSuccessHandler(function (res) {
        if (!res || !res.success) { toast((res && res.message) || '실패했습니다.'); return; }
        if (!res.added && !res.skipped) { toast('사용 중인 반복 지출이 없습니다.'); return; }
        toast(res.ym + ' — ' + res.added + '건 넣었습니다' +
          (res.skipped ? ' (이미 있던 ' + res.skipped + '건은 건너뜀)' : ''));
        const f = document.getElementById('ex_filterMonth');
        if (f) f.value = res.ym;
        loadExpenses();
      })
      .withFailureHandler(function (e) { toast('실패: ' + e.message); })
      .runExpenseTemplates(ym);
  }

  function readExpenseForm_() {
    return {
      date: document.getElementById('ex_date').value,
      accrualMonth: document.getElementById('ex_accrualMonth').value,
      major: document.getElementById('ex_major').value,
      item: document.getElementById('ex_item').value.trim(),
      amount: Number(document.getElementById('ex_amount').value) || 0,
      payMethod: document.getElementById('ex_payMethod').value,
      nature: document.getElementById('ex_nature').value,
      workPct: document.getElementById('ex_workPct').value,
      spread: document.getElementById('ex_spread').value,
      memo: document.getElementById('ex_memo').value.trim()
    };
  }

  function resetExpenseForm() {
    expenseEditingRow_ = null;
    ['ex_item', 'ex_amount', 'ex_memo', 'ex_accrualMonth'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('ex_workPct').value = '100';
    document.getElementById('ex_spread').value = '당월';
    initExpenseDefaults_();
  }

  function submitExpense() {
    const entry = readExpenseForm_();
    if (!entry.item) { toast('항목을 입력해주세요.'); return; }
    if (!(entry.amount > 0)) { toast('금액을 입력해주세요.'); return; }

    const editing = expenseEditingRow_;
    const done = function (res) {
      if (res && res.success) {
        // 저장한 건이 보이는 달로 목록을 옮긴다. 지출은 지난달 정산분을 넣는 게 정상이라
        // (월세·퇴직연금·카드값), 이걸 안 하면 7월 건을 넣었는데 8월 목록이라 안 보인다.
        // 실제로 2026-08-17에 그래서 같은 건이 7초 간격으로 2번 저장됐다.
        if (res.accrualMonth) {
          const f = document.getElementById('ex_filterMonth');
          if (f) f.value = res.accrualMonth;
        }
        toast((editing ? '수정했습니다.' : '등록했습니다.') +
          (res.accrualMonth ? ' (' + res.accrualMonth + ' 귀속)' : ''));
        resetExpenseForm();
        loadExpenses();
      } else {
        // 서버가 막은 이유(주유 이중계산 등)를 그대로 보여준다
        toast((res && res.message) || '저장하지 못했습니다.');
      }
    };
    const failed = function (e) { toast('저장 실패: ' + e.message); };

    if (editing) {
      RUN().withSuccessHandler(done).withFailureHandler(failed).updateExpense(editing, entry);
    } else {
      RUN().withSuccessHandler(done).withFailureHandler(failed).addExpense(entry);
    }
  }

  function loadExpenses() {
    const body = document.getElementById('expenseBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="11" class="muted">불러오는 중...</td></tr>';
    const month = document.getElementById('ex_filterMonth').value;
    const major = document.getElementById('ex_filterMajor').value;

    RUN()
      .withSuccessHandler(function (rows) { renderExpenses_(rows || []); })
      .withFailureHandler(function (e) {
        body.innerHTML = '<tr><td colspan="11" class="muted">불러오기 실패: ' + e.message + '</td></tr>';
      })
      .getExpenses(month, major);
  }

  function renderExpenses_(rows) {
    const body = document.getElementById('expenseBody');
    const summary = document.getElementById('expenseSummary');
    expenseRows_ = rows;

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="11" class="muted">이 달에 등록된 지출이 없습니다.</td></tr>';
      if (summary) summary.textContent = '';
      return;
    }

    // 손익에 실제로 반영되는 금액은 '판관비'만이다(스펙 5.1절). 합계를 나눠 보여줘서
    // 매출원가성으로 잘못 골라둔 게 있으면 눈에 띄게 한다.
    let sumDeduct = 0, sumOther = 0;
    rows.forEach(function (r) {
      const eff = Math.round(r.amount * (r.workPct || 0) / 100);
      if (r.nature === '판관비') sumDeduct += eff; else sumOther += eff;
    });
    if (summary) {
      summary.innerHTML = '손익에서 차감 <strong style="color:#dc2626;">' + fmtMoney(sumDeduct) + '</strong>' +
        ' · 차감 안 함(매출원가성/충당차감) ' + fmtMoney(sumOther) +
        ' · 총 ' + rows.length + '건';
    }

    body.innerHTML = rows.map(function (r) {
      const dim = (r.nature !== '판관비') ? ' style="opacity:.55;"' : '';
      return '<tr' + dim + '>' +
        '<td>' + r.date + '</td>' +
        '<td>' + r.accrualMonth + '</td>' +
        '<td>' + r.major + '</td>' +
        // 반복 지출이 자동으로 넣은 건은 표시해준다 — 금액이 그 달만 다르면 고치라는 신호
        '<td>' + r.item + (r.source === '템플릿' ? ' <span class="muted" style="font-size:11px;">🔁</span>' : '') + '</td>' +
        '<td style="text-align:right;">' + fmtMoney(r.amount) + '</td>' +
        '<td>' + r.payMethod + '</td>' +
        '<td>' + r.nature + '</td>' +
        '<td style="text-align:right;">' + r.workPct + '%</td>' +
        '<td>' + r.spread + '</td>' +
        '<td>' + (r.memo || '') + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button class="btn-outline" style="padding:2px 8px;font-size:12px;" onclick="editExpense(' + r.rowIndex + ')">수정</button> ' +
          '<button class="btn-outline" style="padding:2px 8px;font-size:12px;" onclick="removeExpense(' + r.rowIndex + ')">삭제</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function findExpenseRow_(rowIndex) {
    return expenseRows_.filter(function (x) { return x.rowIndex === rowIndex; })[0];
  }

  function editExpense(rowIndex) {
    const r = findExpenseRow_(rowIndex);
    if (!r) { toast('행을 찾지 못했습니다. 새로고침해주세요.'); return; }

    document.getElementById('ex_date').value = r.date;
    document.getElementById('ex_accrualMonth').value = r.accrualMonth;
    document.getElementById('ex_major').value = r.major;
    document.getElementById('ex_item').value = r.item;
    document.getElementById('ex_amount').value = r.amount;
    document.getElementById('ex_payMethod').value = r.payMethod;
    document.getElementById('ex_nature').value = r.nature;
    document.getElementById('ex_workPct').value = r.workPct;
    document.getElementById('ex_spread').value = r.spread;
    document.getElementById('ex_memo').value = r.memo || '';

    expenseEditingRow_ = rowIndex;
    toast('수정 모드입니다. 내용을 바꾸고 등록을 누르세요.');
    document.getElementById('ex_item').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function removeExpense(rowIndex) {
    const r = findExpenseRow_(rowIndex);
    if (!r) { toast('행을 찾지 못했습니다. 새로고침해주세요.'); return; }
    if (!confirm(r.date + ' / ' + r.item + ' / ' + fmtMoney(r.amount) + ' 지출을 삭제할까요?')) return;

    RUN()
      .withSuccessHandler(function (res) {
        if (res && res.success) { toast('삭제했습니다.'); resetExpenseForm(); loadExpenses(); }
        else { toast((res && res.message) || '삭제하지 못했습니다.'); }
      })
      .withFailureHandler(function (e) { toast('삭제 실패: ' + e.message); })
      .deleteExpense(rowIndex, r.date, r.amount);
  }
