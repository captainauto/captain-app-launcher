
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
