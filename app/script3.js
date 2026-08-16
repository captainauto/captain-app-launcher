
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
          expenseOptionsLoaded_ = true;
          initExpenseDefaults_();
          loadExpenses();
        })
        .withFailureHandler(function (e) { toast('지출 설정 불러오기 실패: ' + e.message); })
        .getExpenseOptions();
    } else {
      loadExpenses();
    }
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
        toast(editing ? '수정했습니다.' : '등록했습니다.');
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
        '<td>' + r.item + '</td>' +
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
