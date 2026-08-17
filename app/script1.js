
  // 화면 코드(Script1~3)가 여기까지 도착해 실행되기 시작한 시각.
  // __T_HTML__(문서 맨 위)과의 차이가 "384KB를 마저 받아서 해석하는 데 걸린 시간"이다.
  window.__T_SCRIPT__ = (window.performance && performance.now) ? performance.now() : 0;

  /** 대시보드 숫자가 채워진 뒤 호출 — 화면/데이터 각각 몇 초 걸렸는지 배지에 표시한다. */
  function markLoadDone_() {
    const el = document.getElementById('loadTimeBadge');
    if (!el || !window.performance || !performance.now) return;
    const now = performance.now();
    const screenMs = Math.round(window.__T_SCRIPT__ || 0);
    const dataMs = Math.round(now - (window.__T_SCRIPT__ || 0));
    el.textContent = ' · 화면 ' + (screenMs / 1000).toFixed(1) + '초 · 데이터 ' + (dataMs / 1000).toFixed(1) + '초';
  }

  let adminBranchOverride = '';

  // 화면에 보이는 버전 배지(V53.x). 배포 때마다 여기를 올리고, 이번 업데이트 요약 한 줄은
  // 서버의 Changelog.js에 추가한다 — 그러면 로그인 시 1회성 팝업으로 자동 안내된다.
  const APP_VERSION = 'V54.5';
  // 변경이력(APP_CHANGELOG)은 46KB나 돼서 서버(Changelog.js)로 옮겼다 — 팝업이나 "업데이트 내역" 탭을
  // 실제로 열 때만 getChangelog()로 가져온다. 새 버전 안내를 추가할 곳도 이제 Changelog.js다.

  function renderVersionBadges_() {
    ['appVersionBadge1', 'appVersionBadge2'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.textContent = APP_VERSION;
    });
  }

  // "V50.9"/"V50.10"처럼 소수점 뒤가 두 자릿수인 버전은 Number()로 바로 비교하면 50.1 < 50.9로 잘못 정렬되므로,
  // 마침표 기준으로 나눠 각 자리를 정수로 비교한다.
  function versionNum_(v) {
    const p = String(v).replace('V', '').split('.').map(Number);
    return p[0] * 100000 + (p[1] || 0);
  }

  // 서버에서 한 번 받아온 전체 변경이력을 기억해둔다 — 팝업과 "업데이트 내역" 탭이 같이 쓴다.
  let changelogCache_ = null;

  /**
   * 변경이력을 가져온다. 한 번 받으면 그 뒤로는 서버에 다시 묻지 않는다.
   * cb(list) — list: [{v, text}, ...] 최신 버전부터. 실패하면 빈 배열로 부른다(화면이 멈추지 않게).
   */
  function loadChangelog_(cb) {
    if (changelogCache_) { cb(changelogCache_, true); return; }
    RUN()
      .withSuccessHandler(function (list) {
        changelogCache_ = Array.isArray(list) ? list : [];
        cb(changelogCache_, true);
      })
      // 두 번째 인자 false = "못 받아왔다". 못 받은 걸 "업데이트 없음"으로 오해하면 안 된다.
      .withFailureHandler(function () { cb([], false); })
      .getChangelog();
  }

  /**
   * 로그인(자동로그인 포함) 시 한 번 호출 — 마지막으로 확인한 버전 이후 놓친 업데이트가 있으면 팝업으로 보여준다.
   * 버전 비교는 클라이언트에서 먼저 하고, 실제로 보여줄 게 있을 때만 서버에서 내용을 받아온다
   * (대부분의 접속은 seen === APP_VERSION이라 서버 호출이 아예 나가지 않는다 — 첫 화면 속도에 영향 없음).
   */
  function checkWhatsNew() {
    const seen = localStorage.getItem('lastSeenVersion');
    if (seen === APP_VERSION) return;
    loadChangelog_(function (list, ok) {
      // 못 받아왔으면 아무것도 하지 않는다 — "확인함"으로 넘겨버리면 이 업데이트 안내를 영영 못 본다.
      // 다음에 앱을 열 때 다시 시도한다.
      if (!ok) return;
      const seenNum = seen ? versionNum_(seen) : -1; // 한 번도 확인 안 한 브라우저면 지금까지 전부 "놓친 업데이트"로 취급
      const missed = list.filter(function (c) { return versionNum_(c.v) > seenNum; });
      if (!missed.length) { localStorage.setItem('lastSeenVersion', APP_VERSION); return; }
      renderWhatsNewModal_(missed);
    });
  }

  /** 버전 배지를 눌러 언제든 다시 볼 수도 있음 — 이땐 확인 여부와 무관하게 전체 이력을 보여주고, "확인"을 눌러야만 lastSeenVersion이 갱신된다. */
  function showWhatsNewModal() {
    loadChangelog_(function (list) { renderWhatsNewModal_(list); });
  }

  /** entries: [{v, text}, ...] 최신순 */
  function renderWhatsNewModal_(entries) {
    if (!entries.length) return;
    document.getElementById('whatsNewVersion').textContent =
      entries.length > 1 ? (entries[entries.length - 1].v + ' ~ ' + entries[0].v) : entries[0].v;
    document.getElementById('whatsNewBody').innerHTML = entries.map(c => `
      <div style="margin-bottom:10px;">
        <strong style="color:#22c55e;">${c.v}</strong>
        <div style="margin-top:2px;">${escapeHtml_(c.text || '')}</div>
      </div>`).join('');
    document.getElementById('whatsNewModal').classList.remove('hidden');
  }

  function closeWhatsNewModal() {
    localStorage.setItem('lastSeenVersion', APP_VERSION);
    document.getElementById('whatsNewModal').classList.add('hidden');
  }

  /** "업데이트 내역" 탭(관리자/직원 공용) — 변경이력을 버전 최신순으로 나열해서 보여준다. */
  function renderChangelogTab() {
    ['adminTab-changelog-body', 'empTab-changelog-body'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el && !el.innerHTML) el.innerHTML = '<span class="muted">불러오는 중...</span>';
    });
    loadChangelog_(function (list) {
      const html = list.map(c => `<div class="card" style="margin-bottom:10px;">
        <strong style="color:#22c55e;">${c.v}</strong>
        <p style="margin:6px 0 0;line-height:1.6;">${escapeHtml_(c.text || '')}</p>
      </div>`).join('');
      ['adminTab-changelog-body', 'empTab-changelog-body'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
      });
    });
  }

  // 장부 입력 화면의 사업자등록증/현장사진 첨부란 드래그앤드롭 지원 (클릭해서 고르는 기존 방식도 그대로 유지됨)
  function onDropzoneOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dropzone-active');
  }
  function onDropzoneLeave(e) {
    e.currentTarget.classList.remove('dropzone-active');
  }
  function onDropzoneDrop(e, inputId) {
    e.preventDefault();
    e.currentTarget.classList.remove('dropzone-active');
    const input = document.getElementById(inputId);
    if (!input) return;
    const dt = e.dataTransfer;
    const files = dt && dt.files;
    // 탐색기에서 끌어온 파일이나 카톡 PC앱 채팅 이미지(로컬에 캐시된 실제 파일)는 여기로 바로 잡힘
    if (files && files.length) {
      input.files = files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    // 파일이 아니라 이미지 주소만 넘어온 경우(카톡 웹버전, 다른 웹페이지의 이미지를 직접 끌어온 경우 등) —
    // 주소로 직접 다운로드를 시도하고, 그것도 안 되면(다른 사이트가 막아둔 경우) 안내 메시지를 띄운다.
    let url = dt && dt.getData && dt.getData('text/uri-list');
    if (!url) {
      const html = dt && dt.getData && dt.getData('text/html');
      const m = html && html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m) url = m[1];
    }
    if (!url) { toast('파일을 인식하지 못했습니다. 탐색기에서 저장된 파일을 끌어다 놓아주세요.'); return; }
    url = url.split('\n')[0].trim();
    fetch(url)
      .then(function (res) { if (!res.ok) throw new Error('fetch 실패'); return res.blob(); })
      .then(function (blob) {
        const ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
        const file = new File([blob], 'dropped-image.' + ext, { type: blob.type || 'image/jpeg' });
        const dtNew = new DataTransfer();
        dtNew.items.add(file);
        input.files = dtNew.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })
      .catch(function () {
        toast('이미지를 직접 가져올 수 없습니다 (다른 사이트 보호정책 등). 이미지를 먼저 내 컴퓨터에 저장한 뒤 그 파일을 끌어다 놓아주세요.');
      });
  }

  function isAdminRole_(role) {
    return !!role && String(role).indexOf('관리자') !== -1;
  }

  function getBranch_() {
    if (!currentUser) return '';
    if (currentUser.role === '인천관리자' || currentUser.role === '인천직원') return '인천';
    if (currentUser.role === '남양주관리자' || currentUser.role === '남양주직원') return '남양주';
    if (currentUser.role === '관리자') return adminBranchOverride;
    return '';
  }

  function wrapRunner_(t) {
    return new Proxy(t, {
      get: function (target, prop) {
        var v = target[prop];
        if (prop === 'api') return v.bind(target);
        if (prop === 'withFailureHandler') {
          // 세션 토큰이 만료/무효라는 응답을 받으면 여기서 공통으로 잡아 로그인 화면으로 되돌린다 —
          // 그렇게 안 하면(예: 로그아웃 후 이전 토큰이 남아있는 경우 등) 아무 버튼을 눌러도 알 수 없는 오류 토스트만 계속 뜨게 됨
          return function (h) {
            var wrapped = function (e) {
              if (e && /로그인이 만료됐거나 확인되지 않았습니다/.test(e.message || '')) { forceReLogin_(); return; }
              if (h) h(e);
            };
            return wrapRunner_(v.call(target, wrapped));
          };
        }
        if (prop === 'withSuccessHandler' || prop === 'withUserObject') {
          return function (h) { return wrapRunner_(v.call(target, h)); };
        }
        if (typeof v === 'function') {
          return function () {
            var args = Array.prototype.slice.call(arguments);
            return target.api(getBranch_(), prop, args, authToken_);
          };
        }
        return v;
      }
    });
  }

  /**
   * 서버 호출 통로. 화면이 어디서 떠 있느냐에 따라 두 가지 중 하나를 쓴다 (2026-08-13).
   *
   *  - 지금까지처럼 Apps Script가 HTML을 직접 서빙하는 경우 → google.script.run (기존 그대로)
   *  - 화면이 다른 곳(GitHub Pages)에 올라가 있는 경우      → doPost JSON API에 fetch
   *
   * 호출하는 쪽 코드(99군데)는 한 줄도 바꾸지 않는다 — 두 통로가 완전히 같은 사용법
   * (.withSuccessHandler(...).withFailureHandler(...).함수명(인자))을 갖도록 맞춰놨다.
   * window.__API_BASE__ 를 세팅한 페이지에서만 fetch 쪽이 켜지므로, 기존 앱 동작에는 영향이 없다.
   */
  function RUN() {
    if (window.__API_BASE__) return fetchRunner_();
    return wrapRunner_(google.script.run);
  }

  /** google.script.run과 같은 모양의 체인을 흉내내는 fetch 버전. */
  function fetchRunner_(handlers) {
    const h = handlers || {};
    const withH = function (key) {
      return function (v) {
        const next = {};
        for (const k in h) next[k] = h[k];
        next[key] = v;
        return fetchRunner_(next);
      };
    };
    return new Proxy({}, {
      get: function (_t, prop) {
        if (prop === 'withSuccessHandler') return withH('success');
        if (prop === 'withFailureHandler') return withH('failure');
        if (prop === 'withUserObject') return withH('userObject');
        return function () {
          callApi_(String(prop), Array.prototype.slice.call(arguments), h);
        };
      }
    });
  }

  function callApi_(fn, args, h) {
    fetch(window.__API_BASE__, {
      method: 'POST',
      // text/plain 이어야 한다 — 다른 Content-Type이면 브라우저가 프리플라이트(OPTIONS)를 먼저 보내는데
      // Apps Script는 OPTIONS에 응답하지 못해서 요청 자체가 막힌다.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ branch: getBranch_(), fn: fn, args: args, token: authToken_ }),
      redirect: 'follow'
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.error) || '알 수 없는 오류');
        if (h.success) h.success(res.data, h.userObject);
      })
      .catch(function (e) {
        // wrapRunner_와 동일하게, 세션 만료는 여기서 공통으로 잡아 로그인 화면으로 되돌린다.
        if (e && /로그인이 만료됐거나 확인되지 않았습니다/.test(e.message || '')) { forceReLogin_(); return; }
        if (h.failure) h.failure(e, h.userObject);
      });
  }

  function forceReLogin_() {
    logout();
    document.getElementById('loginMsg').textContent = '로그인이 만료됐습니다. 다시 로그인해주세요.';
  }

  function switchBranch(branch) {
    adminBranchOverride = branch || '';
    toast(branch ? branch + '지점 장부로 전환했습니다' : '본사 장부로 전환했습니다');
    // 탭별로 "이미 불러왔다" 표시를 지워서, 다른 탭을 열면 새 지점 데이터로 다시 불러오게 한다.
    // 지금 보고 있는 탭만 즉시 새로고침한다(예전엔 안 보이는 탭 것까지 전부 다시 불러왔다 — 2026-08-02).
    resetTabDataLoaded_();
    showAdminTab(currentAdminTab_());
    // 재고/차량/사용자/검색 탭은 지금 보고 있는 탭이 아니면 안 보이니 새로고침을 안 했는데,
    // 화면에 남아있던 이전 지점의 행(rowIndex)을 그대로 수정/삭제하면 방금 전환한 새 지점의
    // 엉뚱한 행이 수정/삭제될 수 있어서, 지점 전환 시엔 무조건 다 지우고 다시 불러온다.
    admSearchCache = [];
    empSearchCache = [];
    const admSearchEl = document.getElementById('admSearchResult');
    if (admSearchEl) admSearchEl.innerHTML = '<span class="muted">지점이 바뀌어 검색 결과가 초기화됐습니다. 다시 검색해주세요.</span>';
    const empSearchEl = document.getElementById('empSearchResult');
    if (empSearchEl) empSearchEl.innerHTML = '';

    if (document.getElementById('adminTab-stock') && !document.getElementById('adminTab-stock').classList.contains('hidden')) loadStockAndPrice();
    if (document.getElementById('adminTab-vehicle') && !document.getElementById('adminTab-vehicle').classList.contains('hidden')) loadVehicleTab();
    if (document.getElementById('adminTab-users') && !document.getElementById('adminTab-users').classList.contains('hidden')) loadUsers();
    if (document.getElementById('adminTab-stats') && !document.getElementById('adminTab-stats').classList.contains('hidden')) loadStatistics();
  }


  let currentUser = null;
  let authToken_ = null; // 로그인 성공 시 서버가 발급한 세션 토큰 — 모든 서버 호출에 실어 보내 "진짜 로그인됐는지" 서버가 재검증하게 함
  let allEntries = [];
  let calDate = new Date();

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  // 이번달 마지막 평일(주말 제외)인지 — 월급/차량관리 등에서 "월말 처리"의 기준으로 씀
  function isLastWeekdayOfMonth_(d) {
    const date = d || new Date();
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    while (lastDay.getDay() === 0 || lastDay.getDay() === 6) lastDay.setDate(lastDay.getDate() - 1);
    return date.getFullYear() === lastDay.getFullYear() && date.getMonth() === lastDay.getMonth() && date.getDate() === lastDay.getDate();
  }

  let vlogState_ = { vehicle: null, fuelYes: null, isMonthEnd: false };

  function vlogSetFuel_(yes) {
    vlogState_.fuelYes = yes;
    // .btn-outline이 스타일시트에서 .btn-primary보다 뒤에 정의돼 있어서 두 클래스를 같이 걸면
    // btn-outline이 항상 이기므로(선택돼도 안 바뀜), className을 통째로 바꿔서 확실히 스타일을 스위칭한다
    document.getElementById('vlog_fuelYesBtn').className = 'btn-' + (yes ? 'primary' : 'outline');
    document.getElementById('vlog_fuelNoBtn').className = 'btn-' + (!yes ? 'primary' : 'outline');
    document.getElementById('vlog_amountWrap').classList.toggle('hidden', !yes);
  }

  // 완료 버튼 누르면 뜨는 격려 팝업용 문구 — 인사말/본문(속담·짧은 이야기)을 따로 두고 매번 랜덤 조합해서
  // 12개×20개 = 240가지가 나오게 함(문구 12개를 통째로 랜덤 뽑던 예전 방식은 금방 겹쳐 보였음)
  const ENCOURAGE_OPENERS_ = [
    '오늘 하루도 수고 많으셨습니다! 🙌', '오늘도 고생 많으셨어요! 😊', '하루 마무리 축하드려요! 🎉',
    '오늘 하루도 정말 수고하셨습니다 🙇', '오늘도 현장에서 애쓰셨습니다! 💪', '하루 일과 완료, 고생 많으셨어요 👏',
    '오늘도 수고 많으셨습니다! ☕', '하루 마감, 늘 감사합니다 🙌', '오늘도 정말 고생 많으셨습니다! 😄',
    '오늘 하루 마무리, 수고하셨습니다 🌙', '오늘도 애써주셔서 감사합니다 🙏', '하루 마무리 잘하셨습니다! ✨'
  ];
  const ENCOURAGE_BODIES_ = [
    '"천 리 길도 한 걸음부터"라는 말이 있죠. 오늘 다녀오신 그 한 곳 한 곳이 모여 캡틴자동문을 만들어갑니다.',
    '"비 온 뒤에 땅이 굳는다"고 하잖아요. 힘든 현장일수록 실력은 더 단단해지는 법입니다.',
    '"세 살 버릇 여든까지 간다"는 말처럼, 오늘도 꼼꼼히 마무리하신 그 습관이 최고의 자산입니다.',
    '짧은 이야기 하나 — 한 목수에게 평생 만든 문 중 뭐가 제일 자랑스럽냐고 물었더니 이렇게 답했대요. "전부요. 제가 만든 문은 열릴 때마다 누군가의 하루가 시작되니까요." 오늘 다신 그 문들도 그렇습니다.',
    '"급할수록 돌아가라"는 말처럼, 서두르지 않고 하나하나 정확하게 처리하신 오늘 하루가 진짜 프로의 하루였습니다.',
    '"열 번 찍어 안 넘어가는 나무 없다"죠. 오늘도 그 열 번 중 하나를 채우셨습니다.',
    '재밌는 이야기 하나 — 도어락은 "문을 잠그는 것"이 아니라 "돌아올 곳을 지키는 것"이라고 하더라고요. 오늘도 누군가의 그 자리를 지켜주셨네요.',
    '"낙숫물이 바위를 뚫는다"는 말처럼, 매일의 작은 성실함이 결국 큰 신뢰를 만듭니다.',
    '짧은 유머 하나 — 자동문이 사람을 보고 하는 말: "나는 너를 위해 열려있어." 오늘 하루 여러분도 누군가에게 그런 존재였습니다.',
    '"고생 끝에 낙이 온다"고 했죠. 오늘의 땀방울이 내일의 웃음이 될 겁니다.',
    '각자 자리에서 최선을 다해주신 덕분에 캡틴자동문이 잘 굴러갑니다. 오늘도 정말 고맙습니다.',
    '"등잔 밑이 어둡다"고 하죠. 매일 반복하시는 이 일이 작아 보여도, 사실 우리 회사에서 제일 중요한 일입니다.',
    '"우물을 파도 한 우물을 파라"는 말처럼, 한 분야를 꾸준히 파고드신 그 시간이 오늘의 실력을 만들었습니다.',
    '짧은 이야기 하나 — 옛날 어느 자물쇠 장인은 평생 같은 열쇠를 두 번 만든 적이 없었대요. 매번 다른 문, 다른 사연이었기 때문이죠. 오늘 여신 그 문들도 전부 다른 이야기였을 겁니다.',
    '"시작이 반이다"라는 말도 있지만, 오늘처럼 끝까지 마무리하는 게 진짜 반의 반입니다.',
    '"돌다리도 두들겨 보고 건너라"는 말처럼, 꼼꼼히 확인하며 작업하신 오늘 하루가 결국 우리 회사의 신뢰가 됩니다.',
    '재밌는 이야기 하나 — 누가 "문은 왜 이렇게 무거워요?" 물었더니 기사님이 이렇게 답했대요. "가벼우면 아무나 열죠." 오늘도 묵직한 하루, 잘 여셨습니다.',
    '현장마다 다른 상황에 그때그때 잘 대처해주셔서 감사합니다. 그게 진짜 실력입니다.',
    '"공든 탑이 무너지랴"는 말처럼, 오늘 하루하루 쌓으신 정성은 절대 헛되지 않습니다.',
    '오늘 하루, 사고 없이 무사히 마치신 것만으로도 충분히 잘하신 겁니다. 항상 안전운전, 안전작업 잊지 마세요.'
  ];
  function showEncouragePopup_() {
    const opener = ENCOURAGE_OPENERS_[Math.floor(Math.random() * ENCOURAGE_OPENERS_.length)];
    const body = ENCOURAGE_BODIES_[Math.floor(Math.random() * ENCOURAGE_BODIES_.length)];
    document.getElementById('encourageText').textContent = opener + '\n' + body;
    document.getElementById('encourageModal').classList.remove('hidden');
  }

  function sendLedgerCompleteNotify_(fuelAmount) {
    RUN()
      .withSuccessHandler(function (res) {
        toast(res && res.success ? '완료 알림을 보냈습니다' : '알림 전송 실패: ' + (res && res.message ? res.message : '사용자관리 탭의 알림 이메일 설정을 확인하세요'));
        showEncouragePopup_();
      })
      .withFailureHandler(function (e) {
        toast('오류: ' + e.message);
        showEncouragePopup_();
      })
      .notifyLedgerComplete(currentUser.name, fuelAmount || 0);
  }

  // X버튼이든 안드로이드 뒤로가기(popstate)든, 이 모달을 벗어나는 경로는 전부 여기로 와야 한다 —
  // 예전엔 뒤로가기가 그냥 숨기기만 해서 완료알림이 통째로 안 가던 버그가 있었다.
  function closeVehicleLogModal_() {
    document.getElementById('vehicleLogModal').classList.add('hidden');
    sendLedgerCompleteNotify_();
  }

  function submitVehicleLog_() {
    const jobs = [];
    let fuelAmount = 0;
    if (vlogState_.fuelYes) {
      const amount = numVal('vlog_amount');
      if (amount > 0) {
        fuelAmount = amount;
        jobs.push({ date: todayStr_(), vehicle: vlogState_.vehicle, kind: '주유', amount: amount, agent: currentUser.name });
      }
    }
    if (vlogState_.isMonthEnd) {
      const km = numVal('vlog_km');
      if (km > 0) {
        jobs.push({ date: todayStr_(), vehicle: vlogState_.vehicle, kind: '킬로수', km: km, agent: currentUser.name });
      }
    }
    document.getElementById('vehicleLogModal').classList.add('hidden');
    function runNext(i) {
      if (i >= jobs.length) { sendLedgerCompleteNotify_(fuelAmount); return; }
      RUN()
        .withSuccessHandler(function () { runNext(i + 1); })
        .withFailureHandler(function () { runNext(i + 1); }) // 차량기록 실패해도 완료알림은 그대로 보낸다
        .addFuelLog(jobs[i]);
    }
    runNext(0);
  }

  function completeTodayLedger() {
    if (!currentUser) return;
    if (!confirm('오늘 장부 작성을 완료하고 사장님께 알림을 보낼까요?')) return;
    RUN()
      .withSuccessHandler(function (vehicle) {
        if (!vehicle) { sendLedgerCompleteNotify_(); return; } // 배정된 차량이 없으면 차량 팝업 없이 바로 완료알림
        vlogState_ = { vehicle: vehicle, fuelYes: null, isMonthEnd: isLastWeekdayOfMonth_() };
        document.getElementById('vlog_amount').value = '';
        document.getElementById('vlog_km').value = '';
        document.getElementById('vlog_amountWrap').classList.add('hidden');
        document.getElementById('vlog_fuelYesBtn').className = 'btn-outline';
        document.getElementById('vlog_fuelNoBtn').className = 'btn-outline';
        document.getElementById('vlog_kmSection').classList.toggle('hidden', !vlogState_.isMonthEnd);
        document.getElementById('vehicleLogModal').classList.remove('hidden');
      })
      .withFailureHandler(function () { sendLedgerCompleteNotify_(); }) // 차량 조회 실패해도 완료알림은 보낸다
      .getMyVehicle(currentUser.name);
  }

  function fmtMoney(n) {
    return '₩' + Number(n || 0).toLocaleString();
  }

  /** 입금형태 표시용 — "세금계산서"처럼 길어도 앞 2글자(예: "세금")만 표에 보여준다. 전체 값은 title로 확인 가능 */
  function payTypeShort_(v) {
    const full = String(v || '').trim();
    if (!full) return '';
    const esc = escapeHtml_(full);
    return '<span title="' + esc + '">' + escapeHtml_(full.slice(0, 2)) + '</span>';
  }

  /**
   * 장부 검색 결과의 주소/내용 셀용 — 길면 말줄임표로 자르고, 전체 텍스트는 title(마우스 오버/길게 누르면 표시)로 남김.
   * maxWidth는 실제 데이터 평균 길이(주소 약 21자, 내용 약 12자) 기준으로 정함 — 대부분은 안 잘리고 긴 것만 줄여서 표 가로 스크롤을 줄인다.
   */
  // 장부 주소/내용/비고 등은 직원이 자유 입력하는 텍스트라, innerHTML로 그대로 꽂으면
  // "<img onerror=...>" 같은 내용이 저장됐을 때 다른 사람 화면에서 그대로 실행되는 저장형 XSS가 된다.
  // 목록/모달에서 사용자 입력을 화면에 꽂을 땐 항상 이 함수를 거친다.
  function escapeHtml_(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // onclick='...' 속성 안에 JSON.stringify(객체)를 그대로 넣는 곳이 여러 군데 있는데, 그 객체의 문자열 값에
  // 작은따옴표(')가 하나라도 섞여 있으면 속성이 거기서 끊기면서 뒤 내용이 임의 스크립트로 실행될 수 있었다.
  // (예: 주소/비고에 "010-1234-5678'그리고..." 처럼 작은따옴표가 들어간 실수 입력만으로도 발생 가능)
  // HTML엔티티로 이스케이프해두면 브라우저가 속성값을 파싱할 때 다시 원래 문자로 복원해주므로 동작은 그대로다.
  // onclick="foo('...')"처럼 큰따옴표 속성 안에 작은따옴표 JS 문자열을 직접 심는 곳(공유앨범 등)도
  // 같은 문제가 있어서(파일명에 따옴표가 섞이면 깨짐) 값 하나만 안전하게 넣을 때 쓰는 버전.
  function escapeJsStr_(s) {
    const jsEscaped = String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return jsEscaped.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function jsonAttr_(obj) {
    return JSON.stringify(obj)
      .replace(/&/g, '&amp;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function truncTd_(text, maxWidth) {
    const esc = escapeHtml_(text);
    return '<td style="max-width:' + maxWidth + 'px;overflow:hidden;text-overflow:ellipsis;" title="' + esc + '">' + esc + '</td>';
  }

  // ---- 체크박스 다중선택 필터 (msf = multi-select filter, 엑셀 필터 스타일) ----
  // 필터 id별로 "적용됐을 때 다시 그려야 할 화면"이 다르다. 이 함수들은 Script2.html(별도 <script> 블록,
  // Script1.html보다 나중에 실행됨)에 정의돼있어 여기서 직접 참조하면 정의 전이라 에러가 나므로,
  // 함수 이름 문자열로만 들고 있다가 실제 호출 시점(사용자가 체크박스를 클릭한 뒤, 이미 전체 로드가 끝난 뒤)에
  // window[이름]으로 찾아서 호출한다.
  const MSF_ONCHANGE_FN_NAME_ = {
    admAgentFilter: 'applyAdmAgentFilter', admPayFilter: 'applyAdmAgentFilter', admSourceFilter: 'applyAdmAgentFilter',
    empAgentFilter: 'applyEmpAgentFilter', empPayFilter: 'applyEmpAgentFilter', empSourceFilter: 'applyEmpAgentFilter',
    dashUnpaidSourceFilter: 'renderDashUnpaid_', dashUnpaidAgentFilter: 'renderDashUnpaid_', dashUnpaidPayFilter: 'renderDashUnpaid_'
  };
  function msfFireOnChange_(id) {
    const fnName = MSF_ONCHANGE_FN_NAME_[id];
    if (fnName && typeof window[fnName] === 'function') window[fnName]();
  }
  const msfValues_ = {};
  const msfSelected_ = {};
  const msfAllLabel_ = {};

  function msfUpdateOptions_(id, rows, field, allLabel) {
    if (!msfSelected_[id]) msfSelected_[id] = new Set();
    msfAllLabel_[id] = allLabel;
    const values = [];
    rows.forEach(function (r) {
      const v = String((r[field] != null ? r[field] : '')).trim();
      if (v && values.indexOf(v) === -1) values.push(v);
    });
    msfValues_[id] = values;
    const sel = msfSelected_[id];
    Array.from(sel).forEach(function (v) { if (values.indexOf(v) === -1) sel.delete(v); });
    msfRenderPanel_(id);
  }

  function msfInitStatic_(id, values, allLabel) {
    if (!msfSelected_[id]) msfSelected_[id] = new Set();
    msfAllLabel_[id] = allLabel;
    msfValues_[id] = values;
    msfRenderPanel_(id);
  }

  function msfRenderPanel_(id) {
    const panel = document.getElementById(id + '_panel');
    if (!panel) return;
    const values = msfValues_[id] || [];
    const sel = msfSelected_[id] || new Set();
    panel.innerHTML =
      '<div class="msf-actions"><a onclick="msfSelectAll_(\'' + id + '\')">전체선택</a><a onclick="msfClear_(\'' + id + '\')">전체해제</a></div>' +
      (values.length ? values.map(function (v) {
        const esc = escapeHtml_(v);
        const checked = sel.has(v) ? ' checked' : '';
        return '<label><input type="checkbox" data-v="' + esc + '"' + checked + ' onchange="msfToggleValue_(\'' + id + '\', this)"> ' + esc + '</label>';
      }).join('') : '<div class="muted" style="padding:8px 12px;font-size:13px;">항목 없음</div>');
    msfUpdateBtn_(id);
  }

  function msfUpdateBtn_(id) {
    const btn = document.getElementById(id + '_btn');
    if (!btn) return;
    const sel = msfSelected_[id] || new Set();
    const allLabel = msfAllLabel_[id] || '전체';
    if (sel.size === 0) btn.textContent = allLabel;
    else if (sel.size === 1) btn.textContent = Array.from(sel)[0];
    else btn.textContent = allLabel.replace(/^전체\s?/, '') + ' ' + sel.size + '개';
  }

  function msfToggleValue_(id, checkboxEl) {
    const v = checkboxEl.getAttribute('data-v');
    const sel = msfSelected_[id] || (msfSelected_[id] = new Set());
    if (checkboxEl.checked) sel.add(v); else sel.delete(v);
    msfUpdateBtn_(id);
    msfFireOnChange_(id);
  }

  function msfSelectAll_(id) {
    msfSelected_[id] = new Set(msfValues_[id] || []);
    msfRenderPanel_(id);
    msfFireOnChange_(id);
  }

  function msfClear_(id) {
    msfSelected_[id] = new Set();
    msfRenderPanel_(id);
    msfFireOnChange_(id);
  }

  function msfToggle_(id) {
    document.querySelectorAll('.msf-panel.open').forEach(function (p) {
      if (p.id !== id + '_panel') p.classList.remove('open');
    });
    const panel = document.getElementById(id + '_panel');
    if (panel) panel.classList.toggle('open');
  }

  function msfFilter_(rows, id, field) {
    const sel = msfSelected_[id];
    if (!sel || sel.size === 0) return rows;
    return rows.filter(function (r) { return sel.has(String((r[field] != null ? r[field] : '')).trim()); });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.msf')) {
      document.querySelectorAll('.msf-panel.open').forEach(function (p) { p.classList.remove('open'); });
    }
  });

  msfInitStatic_('admPayFilter', ['입금', '현금', '카드', '세금계산서', '무상'], '전체 입금형태');
  msfInitStatic_('empPayFilter', ['입금', '현금', '카드', '세금계산서', '무상'], '전체 입금형태');

  function numVal(elOrId) {
    const el = (typeof elOrId === 'string') ? document.getElementById(elOrId) : elOrId;
    if (!el) return 0;
    return Number(String(el.value || '').replace(/[^0-9.-]/g, '')) || 0;
  }

  function onMoneyInput(el) {
    const rawDigits = el.value.replace(/[^0-9]/g, '');
    const cursorFromEnd = el.value.length - el.selectionEnd;
    el.value = rawDigits ? Number(rawDigits).toLocaleString('ko-KR') : '';
    const pos = Math.max(0, el.value.length - cursorFromEnd);
    try { el.setSelectionRange(pos, pos); } catch (e) {}
  }

  function recalcEAmount(prefix) {
    const base = numVal(prefix + '_amount');
    const chkEl = document.getElementById(prefix + '_vatSeparate');
    const checked = chkEl && chkEl.checked;
    const eAmt = checked ? Math.round(base * 1.1) : base;
    const eEl = document.getElementById(prefix + '_eAmount');
    if (eEl) eEl.value = eAmt ? eAmt.toLocaleString('ko-KR') : '';
    recalcMargin(prefix);
  }

  function recalcMargin(prefix) {
    const marginEl = document.getElementById(prefix + '_margin');
    if (!marginEl) return;
    // 마진 = 받은 금액(F, 부가세 제외) - 원가(L). 청구금액(E)엔 부가세가 붙어 있을 수 있어 제외.
    const margin = numVal(prefix + '_amount') - numVal(prefix + '_cost');
    marginEl.value = margin.toLocaleString('ko-KR');
    marginEl.style.color = margin < 0 ? 'var(--danger, #dc2626)' : '';
  }

  function fmtDate(d) {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    if (!(d instanceof Date)) d = new Date(d);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
    return y + '-' + m + '-' + day;
  }

  window.onload = function () {
    renderVersionBadges_();
    // localStorage 사용 — 탭/브라우저를 완전히 닫거나 홈화면 아이콘으로 재실행해도
    // 로그아웃하기 전까진 자동으로 로그인 상태가 유지되게 하기 위함(sessionStorage는 탭이 살아있는 동안만 유지됨)
    const saved = localStorage.getItem('currentUser');
    const savedToken = localStorage.getItem('authToken');
    // 토큰 없이 사용자 정보만 남아있으면(이 업데이트 이전 세션 등) 서버가 모든 호출을 거부하므로
    // 그냥 로그인 화면으로 — currentUser만 있고 조용히 다 실패하는 것보단 재로그인 요청이 낫다
    if (saved && savedToken) {
      currentUser = JSON.parse(saved);
      authToken_ = savedToken;
      enterApp();
      // 자동로그인이라 authenticate()를 거치지 않는다 — 알림 이메일이 있는지 서버에 따로 물어봐야 한다.
      maybeAskNotifyEmail_();
    } else if (saved) {
      localStorage.removeItem('currentUser');
    }
    document.getElementById('f_date').valueAsDate = new Date();
  };

  // 안드로이드 뒤로가기 버튼을 누르면 앱을 벗어나며 새로고침되어 로그인화면으로 튕기는 문제 방지.
  // 더미 history 항목을 하나 채워두고, 뒤로가기가 눌리면(popstate) 실제로 페이지를 벗어나기 전에
  // 가로채서 열려있는 팝업만 닫고(자연스러운 "뒤로가기=닫기" 느낌은 유지) 더미 항목을 다시 채운다.
  history.pushState({ app: true }, '');
  window.addEventListener('popstate', function () {
    const openModal = document.querySelector('.modal-backdrop:not(.hidden)');
    if (openModal) {
      // 그냥 숨기기만 하면 안 되는 모달(예: 차량기록 팝업을 뒤로가기로 닫으면 완료알림이 아예 안 가던 버그,
      // 인센티브 안내 팝업을 뒤로가기로 닫으면 "확인함" 서버기록이 안 남던 버그)은 data-close-fn에 지정된
      // 자기 전용 닫기 함수를 그대로 호출해서 X버튼/확인버튼을 눌렀을 때와 동일하게 동작하게 한다.
      const closeFn = openModal.dataset.closeFn;
      if (closeFn && typeof window[closeFn] === 'function') window[closeFn]();
      else openModal.classList.add('hidden');
    }
    history.pushState({ app: true }, '');
  });

  let bizregState = { rowIndex: null, fileId: null, fileName: '' };

  /**
   * r: 세금계산서 미발급 목록의 행 객체({rowIndex, date, address, content, amount, agent, ...})
   * 또는 그냥 rowIndex 숫자만 넘겨도 동작(이전 호출 방식 호환).
   */
  function openBizRegModal(r) {
    const rowIndex = (r && typeof r === 'object') ? r.rowIndex : r;
    bizregState = { rowIndex: rowIndex, fileId: null, fileName: '' };
    document.getElementById('bizreg_rowIndex').value = rowIndex;
    document.getElementById('bizreg_fileInput').value = '';
    document.getElementById('bizregUploadStatus').textContent = '불러오는 중...';
    document.getElementById('bizregUploadView').classList.remove('hidden');
    document.getElementById('bizregFormView').classList.add('hidden');
    document.getElementById('bizRegModal').classList.remove('hidden');

    const ledgerInfoEl = document.getElementById('bizregLedgerInfo');
    if (r && typeof r === 'object') {
      const payType = String(r.payType || '').trim();
      const confirmed = r.confirmed === '예';
      const payBadge = payType
        ? ' <span style="background:' + (confirmed ? '#dcfce7' : '#fef3c7') + ';color:' +
          (confirmed ? '#166534' : '#92400e') + ';padding:1px 6px;border-radius:8px;font-size:11px;">' +
          escapeHtml_(payType) + ' ' + (confirmed ? '입금확인' : '미입금') + '</span>'
        : '';
      document.getElementById('bizregLedgerMeta').innerHTML = escapeHtml_(fmtDate(r.date) + ' · ' + (r.agent || '')) + payBadge;
      document.getElementById('bizreg_ledgerAddress').value = r.address || '';
      document.getElementById('bizreg_ledgerContent').value = r.content || '';
      document.getElementById('bizreg_ledgerAmount').value = fmtMoney(r.amount);
      document.getElementById('bizreg_ledgerRemark').value = r.remark || '';
      if (ledgerInfoEl) ledgerInfoEl.classList.remove('hidden');
    } else if (ledgerInfoEl) {
      ledgerInfoEl.classList.add('hidden');
    }

    RUN()
      .withSuccessHandler(function (res) {
        document.getElementById('bizregUploadStatus').textContent = '';
        if (res && res.exists) {
          bizregState.fileId = res.fileId;
          bizregState.fileName = res.fileName || '';
          fillBizRegForm_(res.fields);
          renderBizRegPreview_(res.fileId, bizregState.fileName);
          document.getElementById('bizregFormStatus').textContent = '';
          document.getElementById('bizregUploadView').classList.add('hidden');
          document.getElementById('bizregFormView').classList.remove('hidden');
        }
      })
      .withFailureHandler(function (e) {
        document.getElementById('bizregUploadStatus').textContent = '오류: ' + e.message;
      })
      .getBizRegForRow(rowIndex);
  }

  function buildBizRegCopyText_(f) {
    return `등록번호: ${f.bizNo || ''}\n상호: ${f.name || ''}\n성명: ${f.ceo || ''}\n사업장소재지: ${f.address || ''}\n업태: ${f.bizType || ''}\n종목: ${f.bizItem || ''}\n이메일: ${f.email || ''}`;
  }

  function fillBizRegForm_(fields) {
    document.getElementById('bizreg_bizNo').value = fields.bizNo || '';
    document.getElementById('bizreg_name').value = fields.name || '';
    document.getElementById('bizreg_ceo').value = fields.ceo || '';
    document.getElementById('bizreg_address').value = fields.address || '';
    document.getElementById('bizreg_bizType').value = fields.bizType || '';
    document.getElementById('bizreg_bizItem').value = fields.bizItem || '';
    document.getElementById('bizreg_email').value = fields.email || '';
  }

  function renderBizRegPreview_(fileId, fileName) {
    const wrap = document.getElementById('bizregPreviewWrap');
    if (!wrap) return;
    if (!fileId) { wrap.innerHTML = ''; return; }

    wrap.innerHTML = `<iframe src="https://drive.google.com/file/d/${fileId}/preview" style="width:100%;height:320px;border:1px solid var(--border);border-radius:8px;"></iframe>`;
  }

  function showBizRegUploadAgain() {
    document.getElementById('bizregFormView').classList.add('hidden');
    document.getElementById('bizreg_fileInput').value = '';
    document.getElementById('bizregUploadStatus').textContent = '';
    document.getElementById('bizregUploadView').classList.remove('hidden');
  }

  function handleBizRegFile(inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    const status = document.getElementById('bizregUploadStatus');
    status.textContent = '업로드하고 글자를 읽는 중... (몇 초 걸릴 수 있어요)';
    const reader = new FileReader();
    reader.onload = function () {
      const base64 = reader.result.split(',')[1];
      RUN()
        .withSuccessHandler(function (res) {
          if (!res || !res.success) { status.textContent = '업로드에 실패했습니다.'; return; }
          bizregState.fileId = res.fileId;
          bizregState.fileName = file.name;
          if (res.ocrError) {
            document.getElementById('bizregFormStatus').textContent = '자동 인식 실패 (실제 원인): ' + res.ocrError;
          } else if ((!res.fields.name || !res.fields.ceo) && res.debugText) {
            document.getElementById('bizregFormStatus').textContent =
              '상호/성명 일부 자동인식 실패. 빈 칸은 직접 입력해주세요. (아래는 개발자 확인용 원본 인식 텍스트)\n' + res.debugText;
          } else {
            document.getElementById('bizregFormStatus').textContent = '';
          }
          fillBizRegForm_(res.fields);
          renderBizRegPreview_(res.fileId, file.name);
          document.getElementById('bizregUploadView').classList.add('hidden');
          document.getElementById('bizregFormView').classList.remove('hidden');
        })
        .withFailureHandler(function (e) { status.textContent = '오류: ' + e.message; })
        .uploadAndOcrBizReg(bizregState.rowIndex, base64, file.type, file.name);
    };
    reader.readAsDataURL(file);
  }

  function saveBizRegReview() {
    const fields = {
      bizNo: document.getElementById('bizreg_bizNo').value.trim(),
      name: document.getElementById('bizreg_name').value.trim(),
      ceo: document.getElementById('bizreg_ceo').value.trim(),
      address: document.getElementById('bizreg_address').value.trim(),
      bizType: document.getElementById('bizreg_bizType').value.trim(),
      bizItem: document.getElementById('bizreg_bizItem').value.trim(),
      email: document.getElementById('bizreg_email').value.trim()
    };
    RUN()
      .withSuccessHandler(function () { toast('저장했습니다 ✅'); })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); })
      .saveBizReg(bizregState.rowIndex, bizregState.fileId, bizregState.fileName || 'bizreg', fields, currentUser.name);
  }

  function copyBizRegText() {
    const fields = {
      bizNo: document.getElementById('bizreg_bizNo').value.trim(),
      name: document.getElementById('bizreg_name').value.trim(),
      ceo: document.getElementById('bizreg_ceo').value.trim(),
      address: document.getElementById('bizreg_address').value.trim(),
      bizType: document.getElementById('bizreg_bizType').value.trim(),
      bizItem: document.getElementById('bizreg_bizItem').value.trim(),
      email: document.getElementById('bizreg_email').value.trim()
    };
    const text = buildBizRegCopyText_(fields);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('복사했습니다 ✅'); }).catch(function () { fallbackCopyText_(text); });
    } else {
      fallbackCopyText_(text);
    }
  }

  function copyPlainText_(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('복사했습니다 ✅'); }).catch(function () { fallbackCopyText_(text); });
    } else {
      fallbackCopyText_(text);
    }
  }

  function copyFieldById_(id) {
    const el = document.getElementById(id);
    copyPlainText_(el ? el.value : '');
  }

  /** 이메일 입력칸 값을 @ 기준으로 나눠서 앞부분(아이디) 또는 뒷부분(도메인)만 복사 */
  function copyEmailPart_(part) {
    const email = (document.getElementById('bizreg_email').value || '').trim();
    const at = email.indexOf('@');
    if (at === -1) { toast('이메일에 @ 이 없어요. 먼저 이메일을 입력해주세요.'); return; }
    const value = part === 'domain' ? email.slice(at + 1) : email.slice(0, at);
    copyPlainText_(value);
  }

  function fallbackCopyText_(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('복사했습니다 ✅'); }
    catch (e) { toast('복사에 실패했어요. 직접 선택해서 복사해주세요.'); }
    document.body.removeChild(ta);
  }

  function openMediaModal(rowIndex, evt) {
    if (evt) evt.stopPropagation();
    document.getElementById('media_rowIndex').value = rowIndex;
    document.getElementById('media_fileInput').value = '';
    document.getElementById('mediaUploadStatus').textContent = '';
    pendingFolderSync_ = null;
    document.getElementById('mediaModal').classList.remove('hidden');
    loadMediaList(rowIndex);
  }

  // ── 드라이브에서 직접 올리기 ──────────────────────────────────────────────
  // 앱을 거치지 않고 구글 드라이브 앱/웹에서 그 건의 폴더에 바로 올리는 길. 대용량 영상이나
  // 여러 개를 한꺼번에 올릴 때 제일 빠르고, 폰을 다른 데 써도 백그라운드로 계속 올라간다.
  // 대신 올린 사실을 앱이 바로 알 수 없으므로, 이 화면으로 돌아왔을 때 폴더를 훑어서 연결해준다.
  let pendingFolderSync_ = null; // { rowIndex, uploadedBy } — 드라이브를 열어둔 상태

  function openFieldMediaFolder(rowIndex) {
    if (!rowIndex) { toast('기록을 먼저 선택해주세요.'); return; }
    // 서버 응답을 기다렸다가 열면 팝업 차단에 막히므로, 클릭하는 순간 빈 창부터 띄워둔다
    const tab = window.open('', '_blank');
    const status = document.getElementById('mediaUploadStatus');
    if (status) status.textContent = '드라이브 폴더 여는 중...';
    RUN()
      .withSuccessHandler(function (r) {
        pendingFolderSync_ = { rowIndex: rowIndex, uploadedBy: currentUser ? currentUser.name : '' };
        if (tab) {
          tab.location.href = r.url;
          if (status) status.textContent = '드라이브 폴더(' + r.name + ')를 열었습니다. 다 올린 뒤 이 화면으로 돌아오면 목록에 자동으로 붙습니다.';
        } else if (status) {
          // 브라우저가 새 창을 막은 경우 — 직접 누를 수 있는 링크를 대신 보여준다
          status.innerHTML = '새 창이 차단됐습니다. <a href="' + r.url + '" target="_blank"><strong>여기를 눌러 드라이브 폴더(' + r.name + ') 열기</strong></a>';
        }
      })
      .withFailureHandler(function (e) {
        if (tab) tab.close();
        if (status) status.textContent = '오류: ' + e.message;
        toast('오류: ' + e.message);
      })
      .getFieldMediaFolderLink(rowIndex);
  }

  // 드라이브에 다녀와서 화면이 다시 보이면 폴더를 훑어 새로 올라온 사진/영상을 이 기록에 연결한다
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !pendingFolderSync_) return;
    const job = pendingFolderSync_;
    const status = document.getElementById('mediaUploadStatus');
    if (status) status.textContent = '드라이브에 올라온 파일 확인 중...';
    RUN()
      .withSuccessHandler(function (r) {
        const added = (r && r.added) || 0;
        if (status) {
          status.textContent = added
            ? ('드라이브에서 올린 ' + added + '개를 이 기록에 연결했습니다 ✅')
            : '아직 새로 올라온 파일이 없습니다. 업로드가 끝난 뒤 "🔄 새로고침"을 눌러주세요.';
        }
        if (added) loadMediaList(job.rowIndex);
      })
      .withFailureHandler(function (e) { if (status) status.textContent = '확인 실패: ' + e.message; })
      .syncFieldMediaFolder(job.rowIndex, job.uploadedBy);
  });

  // 현장 사진/영상 모달에서 체크한 파일ID 목록 — 매번 하나씩 지우고 다시 불러오던 걸
  // 여러 개 골라서 한 번에 지울 수 있게 개선(2026-07-24). 목록을 새로 불러올 때마다 초기화된다.
  let mediaSelectedIds_ = new Set();

  function loadMediaList(rowIndex) {
    const el = document.getElementById('mediaList');
    el.innerHTML = '<span class="muted">불러오는 중...</span>';
    mediaSelectedIds_ = new Set();
    RUN()
      .withSuccessHandler(function (rows) {
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) { el.innerHTML = '<span class="muted">아직 첨부된 파일이 없습니다.</span>'; return; }
        const hasDeletable = list.some(m => currentUser && (isAdminRole_(currentUser.role) || currentUser.name === m.uploadedBy));
        const toolbar = hasDeletable
          ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
              <button class="btn-danger" id="mediaBatchDeleteBtn" style="padding:4px 10px;font-size:12px;" disabled onclick="deleteSelectedFieldMedia_(${rowIndex})">선택 삭제 (0)</button>
              <span class="muted" style="font-size:11px;">삭제할 사진/영상에 체크하세요</span>
            </div>`
          : '';
        el.innerHTML = toolbar + '<div style="display:flex;flex-wrap:wrap;gap:12px;">' + list.map(function (m) {
          const icon = m.kind === 'video' ? '🎥' : '🖼️';
          const thumb = m.thumb
            ? `<img src="${m.thumb}" style="width:100%;height:100px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" />`
            : `<div style="width:100%;height:100px;display:flex;align-items:center;justify-content:center;font-size:30px;background:#f1f3f5;border-radius:8px;border:1px solid var(--border);">${icon}</div>`;
          const canDelete = currentUser && (isAdminRole_(currentUser.role) || currentUser.name === m.uploadedBy);
          const checkbox = canDelete
            ? `<input type="checkbox" style="position:absolute;top:4px;left:4px;width:18px;height:18px;" onclick="event.stopPropagation();toggleMediaSelect_('${escapeJsStr_(m.fileId)}', this.checked)" />`
            : '';
          return `<div style="width:120px;font-size:11px;">
            <div style="position:relative;">
              <a href="${m.viewUrl}" target="_blank">${thumb}</a>
              ${checkbox}
            </div>
            <div style="margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${m.fileName}">${icon} ${m.fileName}</div>
            <div><a href="${m.viewUrl}" target="_blank">보기·다운로드</a>${canDelete ? ` · <a href="#" style="color:#dc2626;" onclick="event.preventDefault();deleteFieldMediaItem('${escapeJsStr_(m.fileId)}', ${rowIndex})">삭제</a>` : ''}</div>
          </div>`;
        }).join('') + '</div>';
      })
      .withFailureHandler(function (e) { el.innerHTML = '<span class="muted">오류: ' + e.message + '</span>'; })
      .getFieldMediaList(rowIndex);
  }

  function toggleMediaSelect_(fileId, checked) {
    if (checked) mediaSelectedIds_.add(fileId); else mediaSelectedIds_.delete(fileId);
    const btn = document.getElementById('mediaBatchDeleteBtn');
    if (!btn) return;
    btn.textContent = '선택 삭제 (' + mediaSelectedIds_.size + ')';
    btn.disabled = mediaSelectedIds_.size === 0;
  }

  function deleteSelectedFieldMedia_(rowIndex) {
    const ids = Array.from(mediaSelectedIds_);
    if (!ids.length) return;
    if (!confirm(ids.length + '개 파일을 삭제하시겠습니까?')) return;
    RUN()
      .withSuccessHandler(function (r) {
        if (r && r.failures && r.failures.length) {
          toast((r.deleted || 0) + '개 삭제됨, 실패 ' + r.failures.length + '건: ' + r.failures.join(', '));
        } else {
          toast((r && r.deleted != null ? r.deleted : ids.length) + '개 삭제되었습니다');
        }
        loadMediaList(rowIndex);
      })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); })
      .deleteFieldMediaBatch(ids);
  }

  function deleteFieldMediaItem(fileId, rowIndex) {
    if (!confirm('이 파일을 삭제하시겠습니까?')) return;
    RUN()
      .withSuccessHandler(function () { toast('삭제되었습니다'); loadMediaList(rowIndex); })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); })
      .deleteFieldMedia(fileId);
  }

  // 서버함수를 Promise로 감싸는 헬퍼 (조각 업로드처럼 순차적으로 여러 번 호출해야 할 때 편하게 쓰려고)
  function callServer_(fnName) {
    const args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      const r = RUN().withSuccessHandler(resolve).withFailureHandler(reject);
      r[fnName].apply(r, args);
    });
  }

  function readBlobAsBase64_(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result.split(',')[1]); };
      reader.onerror = function () { reject(new Error('파일을 읽는 중 오류가 발생했습니다.')); };
      reader.readAsDataURL(blob);
    });
  }

  // 조각당 6MB. 너무 크면(수백MB 통째로) 모바일에서 멈추는 문제가 있어 조각내서 전송하되,
  // 조각이 너무 작으면(예전 2MB) 왕복 횟수가 늘어 그 고정 오버헤드(클라이언트→Apps Script→Drive 왕복마다 붙는
  // 지연)가 실제 대역폭보다 더 큰 병목이 됨 — 재개가능 업로드로 바뀌면서 조각 크기가 이어받기 정확성과
  // 무관해졌으므로(바이트 단위로 이어받음) 안전 마진 안에서 크게 잡아 왕복 횟수를 줄인다
  const MEDIA_CHUNK_SIZE_ = 6 * 1024 * 1024;
  const MEDIA_SMALL_FILE_LIMIT_ = 4 * 1024 * 1024; // 이보다 작으면 조각낼 필요 없이 한 번에 전송

  // 같은 파일(이름+용량+수정시각)이면 재시도해도 항상 같은 세션ID가 나오게 만들어서,
  // 서버에 이미 올라가 있는 조각은 다시 안 보내고 이어받기가 되도록 한다
  // (현장에서 전화가 오거나 신호가 끊겨 큰 영상 업로드가 중간에 실패하는 경우가 많아 추가됨)
  function fileSessionId_(file, rowIndex) {
    const safeName = String(file.name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    return 'up_' + rowIndex + '_' + file.size + '_' + (file.lastModified || 0) + '_' + safeName;
  }

  // ── 업로드 경로 ①: 브라우저 → Drive 직접 전송 (2026-08-07 도입, 기본값) ──────────────────
  // 서버는 "업로드 세션 주소"만 발급하고 파일 바이트는 여기서 구글로 바로 쏜다. 예전 방식(경로 ②)은
  // base64로 33% 부풀린 뒤 6MB씩 Apps Script를 거쳐 중계했는데, 실제 회선 속도가 아니라 그 왕복
  // 지연이 병목이었다. 직결이 막히는 환경(브라우저 보안정책 등)에서는 자동으로 경로 ②로 되돌아간다.
  let directUploadBlocked_ = false; // 한 번 막히면 그 세션 동안은 매번 헛시도하지 않고 바로 예전 방식을 쓴다

  /** 세션 주소로 파일(또는 남은 구간)을 PUT. 완료면 Drive가 준 파일정보, 아직이면 null */
  function putDirectRange_(uploadUrl, blob, start, totalSize, onProgress) {
    return new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      let progressed = false;
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Range', 'bytes ' + start + '-' + (start + blob.size - 1) + '/' + totalSize);
      xhr.upload.onprogress = function (e) {
        if (!e.lengthComputable) return;
        progressed = true;
        if (onProgress) onProgress(start + e.loaded, totalSize);
      };
      xhr.onload = function () {
        if (xhr.status === 200 || xhr.status === 201) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (e) { reject(new Error('업로드 응답을 읽지 못했습니다.')); }
        } else if (xhr.status === 308) {
          resolve(null); // 구글이 아직 다 못 받았다는 뜻 — 남은 구간을 이어서 보내면 된다
        } else {
          reject(new Error('전송 실패(' + xhr.status + ')'));
        }
      };
      xhr.onerror = function () {
        // 여기까지 한 바이트도 못 보냈으면 연결 자체가 막힌 것(보안정책 등)일 가능성이 높다
        const err = new Error('NETWORK');
        err.progressed = progressed;
        reject(err);
      };
      xhr.send(blob);
    });
  }

  /** 구글이 지금까지 몇 바이트를 받았는지 물어본다(끊긴 뒤 이어서 보낼 위치). 모르면 null */
  function queryDirectOffset_(uploadUrl, totalSize) {
    return new Promise(function (resolve) {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Range', 'bytes */' + totalSize);
      xhr.onload = function () {
        if (xhr.status === 308) {
          const range = xhr.getResponseHeader('Range');
          const m = range && /bytes=0-(\d+)/.exec(range);
          resolve(m ? parseInt(m[1], 10) + 1 : 0);
        } else if (xhr.status === 200 || xhr.status === 201) {
          try { resolve(JSON.parse(xhr.responseText)); } catch (e) { resolve(null); }
        } else {
          resolve(null);
        }
      };
      xhr.onerror = function () { resolve(null); };
      xhr.send();
    });
  }

  /** start 지점부터 끝까지 보낸다. 중간에 끊기면 받은 위치를 다시 물어서 이어보낸다(최대 3회) */
  function sendDirectFrom_(uploadUrl, file, start, onProgress, attempt) {
    return putDirectRange_(uploadUrl, file.slice(start), start, file.size, onProgress)
      .then(function (meta) {
        if (meta) return meta;
        return queryDirectOffset_(uploadUrl, file.size).then(function (next) {
          if (next && typeof next === 'object') return next; // 사실은 이미 완료돼 있던 경우
          if (next == null || next <= start) throw new Error('업로드가 더 진행되지 않았습니다.');
          return sendDirectFrom_(uploadUrl, file, next, onProgress, attempt);
        });
      })
      .catch(function (e) {
        if (!e || e.message !== 'NETWORK') throw e;
        if (!e.progressed && start === 0 && attempt === 0) {
          const blocked = new Error('직접 전송이 막혀 있습니다.');
          blocked.directUnsupported = true; // 예전 방식으로 넘기라는 신호
          throw blocked;
        }
        if (attempt >= 3) throw new Error('연결이 끊겨 업로드를 마치지 못했습니다.');
        return queryDirectOffset_(uploadUrl, file.size).then(function (next) {
          if (next && typeof next === 'object') return next;
          return sendDirectFrom_(uploadUrl, file, next == null ? 0 : next, onProgress, attempt + 1);
        });
      });
  }

  function uploadOneFileDirect_(file, rowIndex, kind, onProgress) {
    const sessionId = fileSessionId_(file, rowIndex);
    const mimeType = file.type || 'application/octet-stream';
    return callServer_('beginDirectMediaUpload', sessionId, rowIndex, file.name, mimeType, file.size)
      .then(function (res) {
        if (!res || !res.uploadUrl) {
          const err = new Error('업로드 주소를 받지 못했습니다.');
          err.directUnsupported = true;
          throw err;
        }
        return sendDirectFrom_(res.uploadUrl, file, 0, onProgress, 0);
      })
      .then(function (meta) {
        if (onProgress) onProgress(file.size, file.size);
        return callServer_('finishDirectMediaUpload', sessionId, rowIndex, meta.id, file.name, kind, currentUser.name);
      });
  }

  // ── 업로드 경로 ②: 예전 방식(Apps Script 중계) — 직결이 막힌 환경용 대비책 ──────────────────
  function uploadOneFileRelay_(file, rowIndex, kind, onProgress) {
    if (file.size <= MEDIA_SMALL_FILE_LIMIT_) {
      return readBlobAsBase64_(file).then(function (base64) {
        return callServer_('uploadFieldMedia', rowIndex, base64, file.type, file.name, kind, currentUser.name);
      });
    }
    const sessionId = fileSessionId_(file, rowIndex);
    const fileSize = file.size;
    const reportProgress = function (pos) { if (onProgress) onProgress(Math.min(pos, fileSize), fileSize); };

    return callServer_('getResumableUploadedBytes', sessionId, rowIndex, file.name, file.type, fileSize, kind, currentUser.name)
      .then(function (startResult) {
        if (startResult && startResult.done) return startResult; // 직전 시도가 실은 이미 성공했던 경우
        let pos = (startResult && startResult.startByte) || 0;
        reportProgress(pos);

        function sendNext() {
          if (pos >= fileSize) return { done: true }; // 이론상 도달 안 함(마지막 조각 응답에서 항상 done 처리됨)
          const end = Math.min(pos + MEDIA_CHUNK_SIZE_, fileSize);
          const chunkBlob = file.slice(pos, end);
          const chunkStart = pos;
          return readBlobAsBase64_(chunkBlob)
            .then(function (b64) {
              return callServer_('uploadFieldMediaChunkResumable', sessionId, rowIndex, file.name, file.type, fileSize, chunkStart, b64, kind, currentUser.name);
            })
            .then(function (result) {
              pos = end;
              reportProgress(pos);
              if (result && result.done) return result;
              return sendNext();
            });
        }
        return sendNext();
      });
  }

  /** onProgress(보낸바이트, 전체바이트) — 직결을 먼저 시도하고, 막혀 있으면 예전 방식으로 올린다 */
  function uploadOneFile_(file, rowIndex, onProgress) {
    const kind = file.type.indexOf('video') === 0 ? 'video' : 'photo';
    if (!file.size) return Promise.reject(new Error('파일이 비어 있습니다.'));
    if (directUploadBlocked_) return uploadOneFileRelay_(file, rowIndex, kind, onProgress);
    return uploadOneFileDirect_(file, rowIndex, kind, onProgress)
      .catch(function (e) {
        if (!e || !e.directUnsupported) throw e;
        directUploadBlocked_ = true;
        return uploadOneFileRelay_(file, rowIndex, kind, onProgress);
      });
  }

  // 업로드 중 화면이 저절로 꺼져서 끊기는 걸 막는다(폰을 손에 들고 화면 켜둔 채 기다리는 동안만 유효 —
  // 다른 앱으로 전환하거나 전화를 받으면 브라우저 자체가 백그라운드로 밀려나서 이 API도 자동 해제됨.
  // 지원 안 되는 환경/구글 iframe 내 권한정책으로 막힌 환경에서는 조용히 무시하고 넘어간다)
  let mediaWakeLock_ = null;
  function requestUploadWakeLock_() {
    try {
      if (navigator.wakeLock) {
        navigator.wakeLock.request('screen').then(function (wl) { mediaWakeLock_ = wl; }).catch(function () {});
      }
    } catch (e) { /* 무시 */ }
  }
  function releaseUploadWakeLock_() {
    if (mediaWakeLock_) { mediaWakeLock_.release().catch(function () {}); mediaWakeLock_ = null; }
  }
  // wakeLock은 화면이 꺼지거나 앱이 백그라운드로 가면 브라우저가 자동으로 풀어버림 —
  // 잠깐 다른 데 갔다가(화면 끔 등) 돌아왔을 때 업로드가 아직 진행 중이면 다시 걸어준다
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    const modal = document.getElementById('mediaModal');
    const status = document.getElementById('mediaUploadStatus');
    if (modal && !modal.classList.contains('hidden') && status && status.textContent.indexOf('업로드 중') !== -1) {
      requestUploadWakeLock_();
    }
    if (mediaUploadActive_) requestUploadWakeLock_();
  });

  // 장부 입력/수정 화면의 "현장 사진/영상" 드롭존 업로드용 — 예전엔 저장 버튼을 누르는 순간 백그라운드에서
  // 조용히 업로드를 시작해서(진행 표시 없음, 버튼도 바로 풀림) 사용자가 다 된 줄 알고 다른 데로 넘어가버리면
  // 업로드가 중간에 끊겨도 알 방법이 없었다(예: 사진 5장+영상 1개 중 4장만 올라감). 지금은 전체 화면 오버레이로
  // 진행 상황을 계속 보여주고, 다 끝날 때까지 폼 초기화/버튼 잠금해제를 미루고, 탭을 닫으려 하면 경고까지 띄운다.
  let mediaUploadActive_ = false;
  window.addEventListener('beforeunload', function (e) {
    if (!mediaUploadActive_) return;
    e.preventDefault();
    e.returnValue = '사진/영상이 아직 업로드 중입니다. 지금 나가면 못 올라간 파일이 있을 수 있어요.';
  });

  // 채워지는 바 방식 진행률 표시 — 여러 업로드 지점에서 공용으로 쓴다(현재: 현장 사진/영상).
  function setUploadProgressBar_(pct) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    const fill = document.getElementById('mediaUploadOverlayFill');
    const pctEl = document.getElementById('mediaUploadOverlayPct');
    if (fill) fill.style.width = p + '%';
    if (pctEl) pctEl.textContent = p + '%';
  }
  function showMediaUploadOverlay_(text, pct) {
    document.getElementById('mediaUploadOverlayText').textContent = text;
    setUploadProgressBar_(pct || 0);
    document.getElementById('mediaUploadOverlay').classList.remove('hidden');
  }
  function updateMediaUploadOverlay_(text, pct) {
    document.getElementById('mediaUploadOverlayText').textContent = text;
    if (pct != null) setUploadProgressBar_(pct);
  }
  function hideMediaUploadOverlay_() {
    document.getElementById('mediaUploadOverlay').classList.add('hidden');
  }

  /**
   * files를 순서대로 rowIndex에 업로드하면서 전체화면 오버레이(채워지는 진행률 바)로 진행상황을 보여준다.
   * 실패한 파일이 있어도 나머지는 계속 시도하고, 끝나면 { total, success, failures:[파일명...] }로 알려준다.
   */
  function runMediaUploadQueue_(files, rowIndex) {
    return new Promise(function (resolve) {
      const total = files.length;
      const failures = [];
      mediaUploadActive_ = true;
      requestUploadWakeLock_();
      showMediaUploadOverlay_('1 / ' + total + '번째 파일 업로드 중 — ' + files[0].name, 0);

      (function next(idx) {
        if (idx >= total) {
          releaseUploadWakeLock_();
          mediaUploadActive_ = false;
          hideMediaUploadOverlay_();
          resolve({ total: total, success: total - failures.length, failures: failures });
          return;
        }
        const file = files[idx];
        const baseLabel = (idx + 1) + ' / ' + total + '번째 파일 업로드 중 — ' + file.name;
        const basePct = (idx / total) * 100;
        updateMediaUploadOverlay_(baseLabel, basePct);
        uploadOneFile_(file, rowIndex, function (sentBytes, totalBytes) {
          const within = totalBytes > 0 ? sentBytes / totalBytes : 0;
          updateMediaUploadOverlay_(baseLabel + ' (' + mbText_(sentBytes) + '/' + mbText_(totalBytes) + 'MB)', ((idx + within) / total) * 100);
        })
          .then(function () { next(idx + 1); })
          .catch(function (e) {
            failures.push(file.name + (e && e.message ? ' — ' + e.message : ''));
            next(idx + 1);
          });
      })(0);
    });
  }

  function mbText_(bytes) { return (bytes / 1024 / 1024).toFixed(1); }

  function setModalUploadBar_(pct) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    const fill = document.getElementById('mediaModalProgressFill');
    const pctEl = document.getElementById('mediaModalProgressPct');
    if (fill) fill.style.width = p + '%';
    if (pctEl) pctEl.textContent = p + '%';
  }

  function handleMediaFiles(inputEl) {
    const files = inputEl.files;
    if (!files || !files.length) return;
    const rowIndex = Number(document.getElementById('media_rowIndex').value);
    const status = document.getElementById('mediaUploadStatus');
    const fileList = Array.from(files);
    const total = fileList.length;
    status.textContent = `업로드 중... (0/${total}, 첫 파일 ${mbText_(fileList[0].size)}MB)`;
    setModalUploadBar_(0);
    const failures_ = [];
    requestUploadWakeLock_();
    mediaUploadActive_ = true; // 이 모달로 올리는 중에도 탭을 닫으려 하면 경고가 뜨도록 공유 플래그 사용

    function uploadOne(idx) {
      if (idx >= total) {
        releaseUploadWakeLock_();
        mediaUploadActive_ = false;
        setModalUploadBar_(100);
        // 실패한 파일이 하나라도 있으면 "완료"로 덮어쓰지 않고 실패 내역을 그대로 남긴다
        // (예전엔 실패해도 무조건 완료 메시지로 덮어써져서 실제로 안 올라갔는데 성공한 것처럼 보이던 버그)
        status.textContent = failures_.length
          ? `업로드 일부 실패 ❌ (${total - failures_.length}/${total}건 성공) — ` + failures_.join(' / ')
          : '업로드 완료 ✅ (' + total + '건)';
        loadMediaList(rowIndex);
        return;
      }
      const file = fileList[idx];
      setModalUploadBar_((idx / total) * 100);
      uploadOneFile_(file, rowIndex, function (sentBytes, totalBytes) {
        status.textContent = `${idx + 1}/${total}번째 업로드 중... (${mbText_(sentBytes)}/${mbText_(totalBytes)}MB)`;
        setModalUploadBar_(((idx + (totalBytes > 0 ? sentBytes / totalBytes : 0)) / total) * 100);
      })
        .then(function () {
          status.textContent = `업로드 중... (${idx + 1}/${total})`;
          setModalUploadBar_(((idx + 1) / total) * 100);
          uploadOne(idx + 1);
        })
        .catch(function (e) {
          failures_.push((idx + 1) + '번째: ' + (e && e.message ? e.message : e));
          uploadOne(idx + 1);
        });
    }
    uploadOne(0);
  }

  let dateAutoSetFlags_ = { f_date: true, a_date: true };
  let lastKnownDateStr_ = null;

  function todayStr_() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function checkDateRollover_() {
    const cur = todayStr_();
    if (lastKnownDateStr_ === null) { lastKnownDateStr_ = cur; return; }
    if (cur !== lastKnownDateStr_) {
      lastKnownDateStr_ = cur;
      ['f_date', 'a_date'].forEach(function (id) {
        if (dateAutoSetFlags_[id]) {
          const el = document.getElementById(id);
          if (el) el.valueAsDate = new Date();
        }
      });
    }
  }
  setInterval(checkDateRollover_, 60000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkDateRollover_();
  });
  ['f_date', 'a_date'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', function () { dateAutoSetFlags_[id] = false; });
  });

  function checkIncentiveNotification() {
    RUN()
      .withSuccessHandler(function (res) {
        const items = (res && res.items) ? res.items : [];
        if (!items.length) return;
        showIncentiveNotifyModal(items, (res && res.fingerprints) ? res.fingerprints : []);
      })
      .withFailureHandler(function () {  })
      .getUnnotifiedIncentives(currentUser.name);
  }

  function showIncentiveNotifyModal(items, fingerprints) {
    const total = items.reduce((s, r) => s + (Number(r.incentive) || 0), 0);
    document.getElementById('incentiveNotifyTotal').innerHTML =
      '새로 확정된 인센티브 ' + items.length + '건 · 합계 <strong style="color:#8b5cf6;">' + fmtMoney(total) + '</strong>';
    document.getElementById('incentiveNotifyBody').innerHTML = items.map(function (r) {
      return `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:14px;">
        <strong>${escapeHtml_(r.date)}</strong> · ${escapeHtml_(r.address || '')} ${r.content ? '· ' + escapeHtml_(r.content) : ''}<br>
        <span class="muted" style="font-size:12px;">부제 ${fmtMoney(r.subtitle)} 기준</span>
        <span style="float:right;font-weight:700;color:#8b5cf6;">${fmtMoney(r.incentive)}</span>
      </div>`;
    }).join('');
    const modal = document.getElementById('incentiveNotifyModal');
    modal.dataset.fingerprints = JSON.stringify(fingerprints);
    modal.classList.remove('hidden');
  }

  function closeIncentiveNotify() {
    const modal = document.getElementById('incentiveNotifyModal');
    let fps = [];
    try { fps = JSON.parse(modal.dataset.fingerprints || '[]'); } catch (e) {}
    modal.classList.add('hidden');
    if (fps.length) {
      RUN()
        .withFailureHandler(function () {})
        .markIncentivesNotified(currentUser.name, fps);
    }
  }

  function doLogin() {
    const name = document.getElementById('loginName').value.trim();
    const pin = document.getElementById('loginPin').value.trim();
    if (!name || !pin) { toast('이름과 PIN을 입력하세요'); return; }
    document.getElementById('loginMsg').textContent = '확인 중...';
    RUN()
      .withSuccessHandler(function (res) {
        if (res.success) {
          currentUser = { name: res.name, role: res.role };
          authToken_ = res.token;
          localStorage.setItem('currentUser', JSON.stringify(currentUser));
          localStorage.setItem('authToken', authToken_);
          enterApp();
          // 서버가 로그인 응답에 "이 사람 알림 이메일이 없다"를 같이 실어보낸다 — 그래서 여기선 물어볼 게 없다.
          maybeAskNotifyEmail_(res.needNotifyEmail === true);
        } else if (res.locked) {
          // 서버가 PIN 무차별 대입을 막느라 잠근 상태 — 남은 시간을 그대로 보여준다.
          document.getElementById('loginMsg').textContent = res.message || '잠시 후 다시 시도해주세요.';
        } else {
          // 몇 번 더 틀리면 잠기는지 알려줘야, 진짜 직원이 당황하지 않고 PIN을 다시 확인한다.
          document.getElementById('loginMsg').textContent = '이름 또는 PIN이 올바르지 않습니다.' +
            (res.remaining ? ' (' + res.remaining + '번 더 틀리면 잠시 잠깁니다)' : '');
        }
      })
      .withFailureHandler(function (e) {
        document.getElementById('loginMsg').textContent = '오류: ' + e.message;
      })
      .authenticate(name, pin);
  }

  // ====================== 알림 이메일 받기 (로그인 직후) ======================
  // 알림이 이메일로 나가는데(Notify.js) 직원 주소를 사장님이 일일이 물어서 넣어야 했다.
  // 이제 주소가 없는 사람은 로그인할 때 본인이 직접 적는다. 저장할 때까지 로그인마다 계속 뜬다.
  //
  // 왜 두 갈래인가:
  //  - 직접 로그인 → authenticate()가 needNotifyEmail을 같이 돌려주므로 서버 호출이 늘지 않는다.
  //  - 자동로그인 → 로그인 응답 자체가 없으니 getMyNotifyEmail()로 한 번 물어본다. 다만 한 번 등록한
  //    기기에는 아래 표시를 남겨서, 그 뒤로는 앱을 열 때마다 묻지 않는다(첫 화면 속도에 영향 없게).
  const NOTIFY_EMAIL_OK_KEY_ = 'notifyEmailOk';

  function maybeAskNotifyEmail_(knownNeed) {
    // 본사 관리자(사장님)는 사용자관리 탭에서 직접 넣을 수 있어 제외. 지사 관리자는 그 탭이 안 보이므로 포함.
    if (!currentUser || currentUser.role === '관리자') return;
    if (knownNeed === true) { openNotifyEmailModal_(); return; }
    if (knownNeed === false) { localStorage.setItem(NOTIFY_EMAIL_OK_KEY_, currentUser.name); return; }
    if (localStorage.getItem(NOTIFY_EMAIL_OK_KEY_) === currentUser.name) return;
    RUN()
      .withSuccessHandler(function (r) {
        if (r && r.email) { localStorage.setItem(NOTIFY_EMAIL_OK_KEY_, currentUser.name); return; }
        openNotifyEmailModal_();
      })
      .withFailureHandler(function () { /* 못 물어봤으면 그냥 넘어간다 — 다음 로그인에 다시 확인한다 */ })
      .getMyNotifyEmail();
  }

  function openNotifyEmailModal_() {
    const input = document.getElementById('notifyEmailInput');
    if (input) input.value = '';
    const msg = document.getElementById('notifyEmailMsg');
    if (msg) { msg.style.color = ''; msg.textContent = ''; }
    const modal = document.getElementById('notifyEmailModal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeNotifyEmailModal() {
    const modal = document.getElementById('notifyEmailModal');
    if (modal) modal.classList.add('hidden');
  }

  function saveMyNotifyEmailFromModal() {
    const input = document.getElementById('notifyEmailInput');
    const msg = document.getElementById('notifyEmailMsg');
    const btn = document.getElementById('notifyEmailSaveBtn');
    const val = input ? input.value.trim() : '';
    if (!val) { if (msg) { msg.style.color = 'var(--danger, #dc2626)'; msg.textContent = '이메일 주소를 입력해주세요.'; } return; }
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
    if (msg) msg.textContent = '';
    RUN()
      .withSuccessHandler(function (r) {
        if (btn) { btn.disabled = false; btn.textContent = '저장'; }
        if (r && r.success) {
          localStorage.setItem(NOTIFY_EMAIL_OK_KEY_, currentUser.name);
          closeNotifyEmailModal();
          toast('저장했습니다. 앞으로 알림이 이 메일로 갑니다.');
        } else if (msg) {
          msg.style.color = 'var(--danger, #dc2626)';
          msg.textContent = (r && r.message) ? r.message : '저장하지 못했습니다.';
        }
      })
      .withFailureHandler(function (e) {
        if (btn) { btn.disabled = false; btn.textContent = '저장'; }
        if (msg) { msg.style.color = 'var(--danger, #dc2626)'; msg.textContent = '오류: ' + e.message; }
      })
      .saveMyNotifyEmail(val);
  }

  function logout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    currentUser = null;
    authToken_ = null;
    document.getElementById('employeeView').classList.add('hidden');
    document.getElementById('adminView').classList.add('hidden');
    document.getElementById('loginView').classList.remove('hidden');
    document.getElementById('loginName').value = '';
    document.getElementById('loginPin').value = '';
    resetTabDataLoaded_(); // 다른 계정/지점으로 다시 로그인하면 탭 데이터를 새로 불러오도록
  }

  function enterApp() {
    document.getElementById('loginView').classList.add('hidden');
    const isAdmin = isAdminRole_(currentUser.role);
    if (isAdmin) {
      document.getElementById('adminView').classList.remove('hidden');
      const bs = document.getElementById('branchSelect');
      if (bs) bs.classList.toggle('hidden', currentUser.role !== '관리자');
      // 본사 관리자('관리자')에게만 보이는 탭. 도어락 가격표는 2026-07-31부터 여기서 빠졌다 —
      // 데이터(도어락_가격표/도어락_카테고리 시트, 드라이브 폴더)가 이미 지점별로 나뉘어 있고
      // 백엔드 권한도 '...관리자' 전부를 통과시키므로, 지사 관리자도 자기 지점 가격표를 그대로 만들 수 있다.
      ['tabBtn-users', 'tabBtn-stock'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', currentUser.role !== '관리자');
      });
      document.getElementById('a_date').valueAsDate = new Date();
      // 처음 보이는 화면(대시보드)용 요청을 가장 먼저 보내서, 다른 탭용 요청들과 서버 실행 자원을
      // 덜 다투게 한다. showAdminTab('dash')가 내부에서 loadDashboard()를 호출하는데, 예전엔 바로
      // 아래서 loadDashboard()를 한 번 더 불러서 대시보드 관련 요청 3개(대시보드/세금계산서/현금미수령)가
      // 로그인마다 전부 중복으로 나가고 있었다(네트워크 로그로 확인) — 그 중복 호출을 제거함.
      showAdminTab('dash');
    } else {
      document.getElementById('employeeView').classList.remove('hidden');
      document.getElementById('empGreeting').textContent = currentUser.name + '님, 출장 기록 입력';
      loadMyRecent();
    }
    // 로그인 시 첫 화면(대시보드)에 필요한 것만 부른다.
    //
    // 예전엔 여기서 재고·출처·출장자·사용자·최근장부·달력까지 전부 미리 불러왔다. 그래서 로그인 한 번에
    // 서버 호출이 11개 나갔고, Apps Script가 동시 실행을 제한하는 데다 호출마다 스프레드시트를 새로
    // 여느라(1회 약 0.5초) 첫 화면이 눈에 띄게 느렸다. 실측(2026-08-02, 장부 5,441행): 11개 합쳐 약 21초.
    //
    // 이제 각 탭을 실제로 열 때 그 탭 데이터를 불러온다(도어락·차량 탭이 원래 쓰던 방식). 한 번 불러온
    // 뒤에는 tabDataLoaded_ 로 기억해서 탭을 오갈 때마다 다시 부르지 않는다.
    if (!isAdmin) loadStockForForm(); // 직원 화면은 기록입력이 첫 화면이라 자재 목록이 바로 필요하다
    checkIncentiveNotification();
    checkWhatsNew();
  }

  let stockCache = [];
  let locationsCache = [];
  let priceListCache = [];
  let priceCache = [];
  let matLines = [];
  let extraLines = [];

  /**
   * 기록입력 화면용 세 목록(재고·위치·자재단가)을 한 번에 받아온다.
   * 예전엔 getStockList/getLocations/getPriceList를 따로 세 번 불렀는데, 호출마다 서버 실행이 새로 뜨고
   * 스프레드시트를 다시 여느라 로그인이 느렸다 — getFormBundle 하나로 묶었다(2026-08-13).
   */
  function loadStockForForm() {
    RUN()
      .withSuccessHandler(function (res) {
        res = res || {};
        applyStockList_(res.stock);
        locationsCache = Array.isArray(res.locations) ? res.locations : [];
        priceListCache = Array.isArray(res.prices) ? res.prices : [];
      })
      .getFormBundle();
  }

  /** 재고 목록을 캐시에 넣고 대분류 드롭다운을 채운다(번들·단독 갱신 양쪽에서 씀). */
  function applyStockList_(rows) {
    stockCache = Array.isArray(rows) ? rows : [];
    const majors = [];
    stockCache.forEach(function (s) {
      const mj = String(s.major || '').trim();
      if (mj && majors.indexOf(mj) === -1) majors.push(mj);
    });
    ['f_major', 'a_major', 'e_major'].forEach(function (id) {
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = '<option value="">대분류...</option>' +
        majors.map(mj => `<option value="${mj}">${mj}</option>`).join('');
    });
  }

  /**
   * "재고에 없는 자재 직접 입력" 자동완성 — 자재단가에 같은 이름이 이미 있으면
   * 단가를 보여주고 클릭 시 그대로 채워준다 (있으면 가져오고, 없으면 새로 입력, 틀리면 수정 가능).
   */
  function onCustomMatInput(prefix) {
    const drop = document.getElementById(prefix + '_customMatDrop');
    const input = document.getElementById(prefix + '_customMat');
    if (!drop || !input) return;
    const typed = input.value.trim().toLowerCase();
    const matches = typed
      ? priceListCache.filter(p => String(p.name || '').toLowerCase().indexOf(typed) !== -1)
      : [];
    if (!matches.length) { drop.classList.add('hidden'); drop.innerHTML = ''; return; }
    drop.innerHTML = matches.slice(0, 15).map(function (p, idx) {
      const isCash = !(p.amount !== '' && p.amount != null);
      const priceLabel = fmtMoney(p.supply) + (isCash ? ' (현금가)' : ' (부가세제외, 총액 ' + fmtMoney(p.amount) + ')');
      return `<div class="ac-item" onclick='pickCustomMat("${prefix}", ${jsonAttr_(p)})'>
        ${escapeHtml_(p.name)} <span class="ac-sub">${escapeHtml_(p.buyer || '')} · ${priceLabel}</span>
      </div>`;
    }).join('');
    drop.classList.remove('hidden');
  }

  function pickCustomMat(prefix, p) {
    document.getElementById(prefix + '_customMat').value = p.name;
    const isCash = !(p.amount !== '' && p.amount != null);
    document.getElementById(prefix + '_customPrice').value = p.supply;
    const typeEl = document.getElementById(prefix + '_customPriceType');
    if (typeEl) typeEl.value = isCash ? 'cash' : 'vat';
    const sourceEl = document.getElementById(prefix + '_customSource');
    if (sourceEl && p.buyer && p.buyer.indexOf('미분류') === -1) sourceEl.value = p.buyer;
    const drop = document.getElementById(prefix + '_customMatDrop');
    if (drop) drop.classList.add('hidden');
  }

  let sourceCache = [];
  function loadSourceList() {
    RUN()
      .withSuccessHandler(function (rows) { sourceCache = Array.isArray(rows) ? rows : []; })
      .getSourceList();
  }

  let agentListCache = [];
  function loadAgentList() {
    RUN()
      .withSuccessHandler(function (rows) { agentListCache = Array.isArray(rows) ? rows : []; })
      .getAgentList();
  }

  function getSourceCandidates(prefix) {
    const typed = (document.getElementById(prefix + '_source').value || '').trim().toLowerCase();
    if (!typed) return sourceCache;
    return sourceCache.filter(s => s.toLowerCase().indexOf(typed) !== -1);
  }

  function renderSourceDropdown(prefix) {
    const drop = document.getElementById(prefix + '_sourceDrop');
    if (!drop) return;
    const cands = getSourceCandidates(prefix);
    if (!cands.length) {
      drop.innerHTML = '<div class="ac-empty">일치하는 항목 없음 (직접 입력 가능)</div>';
    } else {
      drop.innerHTML = cands.map(function (s) {
        const safe = s.replace(/'/g, "\\'");
        return `<div class="ac-item" onclick="pickSource('${prefix}', '${safe}')">${s}</div>`;
      }).join('');
    }
    drop.classList.remove('hidden');
  }

  function showSourceDropdown(prefix) { renderSourceDropdown(prefix); }
  function onSourceInput(prefix) { renderSourceDropdown(prefix); }
  function pickSource(prefix, value) {
    document.getElementById(prefix + '_source').value = value;
    const drop = document.getElementById(prefix + '_sourceDrop');
    if (drop) drop.classList.add('hidden');
  }

  function doPrevSearch(prefix) {
    const kwEl = document.getElementById(prefix + '_prevKw');
    const el = document.getElementById(prefix + '_prevResult');
    const kw = kwEl ? kwEl.value.trim() : '';
    if (!kw) { toast('검색어를 입력하세요'); return; }
    el.innerHTML = '<span class="muted">검색 중...</span>';
    RUN()
      .withSuccessHandler(function (rows) {
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) { el.innerHTML = '<span class="muted">검색 결과가 없습니다.</span>'; return; }
        el.innerHTML = '<div class="muted" style="margin-bottom:4px;">클릭하면 아래 항목에 그대로 채워집니다 (날짜만 오늘로)</div>' +
          list.slice(0, 20).map(function (r) {
            return `<div style="padding:6px 4px;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px;"
                      onclick='applyPrevRecord("${prefix}", ${jsonAttr_(r)})'>
                      <strong>${escapeHtml_(r.date)}</strong> · ${escapeHtml_(r.address||'')} · ${escapeHtml_(r.content||'')} · ${fmtMoney(r.amount)}
                    </div>`;
          }).join('');
      })
      .withFailureHandler(function (e) { el.innerHTML = '<span class="muted">오류: ' + e.message + '</span>'; })
      .searchLedger(kw);
  }

  function applyPrevRecord(prefix, r) {
    const set = function (id, val) { const el = document.getElementById(prefix + '_' + id); if (el) el.value = val; };
    set('address', r.address || '');
    set('content', r.content || '');

    const baseAmt = Number(r.subtitle) || Number(r.amount) || 0;
    const eAmt = Number(r.amount) || baseAmt;
    set('amount', baseAmt ? baseAmt.toLocaleString('ko-KR') : '');
    set('eAmount', eAmt ? eAmt.toLocaleString('ko-KR') : '');
    const vatEl = document.getElementById(prefix + '_vatSeparate');
    if (vatEl) vatEl.checked = (baseAmt > 0 && Math.abs(eAmt - Math.round(baseAmt * 1.1)) <= 1);

    const payEl = document.getElementById(prefix + '_payType');
    if (payEl && r.payType) payEl.value = r.payType;
    const confEl = document.getElementById(prefix + '_confirmed');
    if (confEl) confEl.value = '아니오';

    set('note', r.note || '');
    set('source', r.source || '');
    set('cost', r.cost ? Number(r.cost).toLocaleString('ko-KR') : '');

    matLines = []; extraLines = [];
    renderMatLines(); renderExtraLines();

    set('cost', r.cost ? Number(r.cost).toLocaleString('ko-KR') : '');
    recalcMargin(prefix);

    const resultEl = document.getElementById(prefix + '_prevResult');
    if (resultEl) resultEl.innerHTML = '';
    const kwEl = document.getElementById(prefix + '_prevKw');
    if (kwEl) kwEl.value = '';
    toast('이전 기록을 불러왔습니다. 필요한 부분만 고쳐서 등록하세요 ✅');
  }

  function onMajorChange(prefix) {
    document.getElementById(prefix + '_minor').value = '';
    document.getElementById(prefix + '_matPrice').value = '';
    renderMinorDropdown(prefix, '');
  }

  function getMinorCandidates(prefix) {
    const major = document.getElementById(prefix + '_major').value.trim();
    const typed = document.getElementById(prefix + '_minor').value.trim().toLowerCase();
    return stockCache.filter(function (s) {
      if (!s.minor) return false;
      if (major && String(s.major || '').trim() !== major) return false;
      if (typed && String(s.minor).toLowerCase().indexOf(typed) === -1) return false;
      return true;
    });
  }

  function renderMinorDropdown(prefix, _typed) {
    const drop = document.getElementById(prefix + '_minorDrop');
    if (!drop) return;
    const cands = getMinorCandidates(prefix);
    if (!cands.length) {
      drop.innerHTML = '<div class="ac-empty">일치하는 소분류 없음 (직접 추가 사용)</div>';
    } else {
      drop.innerHTML = cands.map(function (s) {
        const label = s.minor;
        const sub = (s.major ? s.major : '') + (s.spec ? ' · ' + s.spec : '') + ' · ' + fmtMoney(s.dPrice) + '(부가세제외)';
        return `<div class="ac-item" onclick="pickMinor('${prefix}', ${s.rowIndex})">${label}<span class="ac-sub">${sub}</span></div>`;
      }).join('');
    }
    drop.classList.remove('hidden');
  }

  function showMinorDropdown(prefix) {
    renderMinorDropdown(prefix, '');
  }

  function onMinorInput(prefix) {
    renderMinorDropdown(prefix, '');
  }

  let selectedStock = { f: null, a: null, e: null };
  function pickMinor(prefix, rowIndex) {
    const s = stockCache.find(x => x.rowIndex === rowIndex);
    if (!s) return;
    selectedStock[prefix] = s;
    document.getElementById(prefix + '_minor').value = s.minor;
    document.getElementById(prefix + '_matPrice').value = s.dPrice;
    if (s.major) {
      const majSel = document.getElementById(prefix + '_major');
      if (majSel) majSel.value = s.major;
    }
    document.getElementById(prefix + '_minorDrop').classList.add('hidden');
  }

  document.addEventListener('click', function (e) {
    ['f', 'a', 'e'].forEach(function (prefix) {
      const input = document.getElementById(prefix + '_minor');
      const drop = document.getElementById(prefix + '_minorDrop');
      if (input && drop && e.target !== input && !drop.contains(e.target)) {
        drop.classList.add('hidden');
      }
      const sInput = document.getElementById(prefix + '_source');
      const sDrop = document.getElementById(prefix + '_sourceDrop');
      if (sInput && sDrop && e.target !== sInput && !sDrop.contains(e.target)) {
        sDrop.classList.add('hidden');
      }
      const cInput = document.getElementById(prefix + '_customMat');
      const cDrop = document.getElementById(prefix + '_customMatDrop');
      if (cInput && cDrop && e.target !== cInput && !cDrop.contains(e.target)) {
        cDrop.classList.add('hidden');
      }
    });
  });

  function myCarLocation() {
    const loc = (locationsCache || []).find(function (l) {
      return l.type === '차량' && String(l.owner).trim() === String(currentUser.name).trim();
    });
    return loc ? loc.name : null;
  }

  function addStockLine(prefix) {
    prefix = prefix || 'f';
    const major = document.getElementById(prefix + '_major').value.trim();
    const minor = document.getElementById(prefix + '_minor').value.trim();
    const price = Number(document.getElementById(prefix + '_matPrice').value) || 0;
    const qtyEl = document.getElementById(prefix + '_stockQty');
    if (!minor) { toast('소분류를 선택하거나 입력하세요'); return; }
    const qty = Number(qtyEl.value) || 1;
    const s = selectedStock[prefix];

    maybeSyncStockPrice_(s, price);

    if (s && s.stocks) {
      chooseLocationAndAdd(prefix, s, minor, major, price, qty);
    } else {
      matLines.push({ name: minor, spec: major, qty: qty, price: price, fromStock: true, rowIndex: null, location: '', buyer: (s && s.buyer) ? s.buyer : '', dPrice: price });
      finishAddStock(prefix, qtyEl);
    }
  }

  /**
   * "재고에서 선택"으로 단가(부가세 제외 공급가)가 자동 채워진 뒤 사용자가 그 값을 다른 단가로
   * 고쳐 입력했다면, 재고현황 마스터 단가도 같이 고칠지 물어본다. 아니오를 누르면 이번 건에만
   * 새 단가를 쓰고 마스터 데이터는 그대로 둔다. 금액(부가세 포함)이 등록돼 있던 항목은 10% 부가세를
   * 그대로 얹어 같이 갱신해 두 값이 계속 맞물리게 한다.
   */
  function maybeSyncStockPrice_(s, newPrice) {
    if (!s || !s.rowIndex || !newPrice || newPrice === s.dPrice) return;
    if (!confirm('단가(부가세 제외)가 재고현황에 등록된 값(' + fmtMoney(s.dPrice) + ')과 다릅니다.\n재고현황의 단가를 ' + fmtMoney(newPrice) + '(으)로 수정하시겠습니까?')) return;
    const newDPrice = newPrice;
    const newVatPrice = s.vatPrice > 0 ? Math.round(newPrice * 1.1) : s.vatPrice;
    RUN().withFailureHandler(function (e) { toast('재고 단가 수정 실패: ' + e.message); }).updateStockPrice(s.rowIndex, newDPrice, newVatPrice);
    s.dPrice = newDPrice; s.vatPrice = newVatPrice; s.price = newVatPrice > 0 ? newVatPrice : newDPrice;
    const cacheItem = stockCache.find(function (x) { return x.rowIndex === s.rowIndex; });
    if (cacheItem) { cacheItem.dPrice = s.dPrice; cacheItem.vatPrice = s.vatPrice; cacheItem.price = s.price; }
    toast('재고 단가를 수정했습니다');
  }

  function chooseLocationAndAdd(prefix, s, minor, major, price, qty) {
    const office = s.stocks['사무실'] || 0;
    const warehouse = s.stocks['창고'] || 0;
    const myCar = myCarLocation();
    const myCarQty = myCar ? (s.stocks[myCar] || 0) : 0;

    const options = [];
    options.push({ loc: '사무실', label: '사무실 (재고 ' + office + ')', disabled: office <= 0 });
    options.push({ loc: '창고', label: '창고 (재고 ' + warehouse + ')', disabled: warehouse <= 0 });
    if (office <= 0 && warehouse <= 0 && myCar) {
      options.push({ loc: myCar, label: '내 차: ' + myCar + ' (재고 ' + myCarQty + ')', disabled: false });
    }
    options.push({ loc: '현장구매', label: '현장구매 (재고 차감 안 함)', disabled: false });

    pendingStock = { prefix: prefix, s: s, minor: minor, major: major, price: price, qty: qty };
    const body = document.getElementById('locChooseBody');
    body.innerHTML = '<p class="muted" style="margin-top:0;">' + minor + ' ' + qty + '개를 어디서 사용했나요?</p>' +
      options.map(function (o) {
        return `<button class="btn-outline" style="width:100%;margin-bottom:6px;text-align:left;${o.disabled ? 'opacity:.4;' : ''}"
                  ${o.disabled ? 'disabled' : ''} onclick="confirmLocation('${o.loc}')">${o.label}</button>`;
      }).join('');
    document.getElementById('locChooseModal').classList.remove('hidden');
  }

  let pendingStock = null;
  function confirmLocation(loc) {
    if (!pendingStock) return;
    const p = pendingStock;
    matLines.push({
      name: p.minor, spec: p.major, qty: p.qty, price: p.price,
      fromStock: true, rowIndex: p.s.rowIndex, location: loc, buyer: p.s.buyer || '', dPrice: p.price
    });
    document.getElementById('locChooseModal').classList.add('hidden');
    const qtyEl = document.getElementById(p.prefix + '_stockQty');
    finishAddStock(p.prefix, qtyEl);
    pendingStock = null;
  }

  function finishAddStock(prefix, qtyEl) {
    document.getElementById(prefix + '_minor').value = '';
    document.getElementById(prefix + '_matPrice').value = '';
    if (qtyEl) qtyEl.value = 1;
    selectedStock[prefix] = null;
    renderMatLines();
  }

  function addCustomLine(prefix) {
    prefix = prefix || 'f';
    const nameEl = document.getElementById(prefix + '_customMat');
    const qtyEl = document.getElementById(prefix + '_customQty');
    const priceEl = document.getElementById(prefix + '_customPrice');
    const typeEl = document.getElementById(prefix + '_customPriceType');
    const sourceEl = document.getElementById(prefix + '_customSource');
    const name = nameEl.value.trim();
    if (!name) { toast('자재명을 입력하세요'); return; }
    const qty = Number(qtyEl.value) || 1;
    const inputPrice = priceEl ? (Number(priceEl.value) || 0) : 0;
    const priceType = typeEl ? typeEl.value : 'vat'; // 'vat'=세금계산서(부가세 별도), 'cash'=현금가(계산서 없음)
    const source = sourceEl ? sourceEl.value.trim() : '';
    // 단가는 이제 항상 부가세 제외(공급가) 기준으로 입력받으므로 원가(L)·부제원가(dPrice) 모두
    // 입력값을 그대로 쓴다. priceType은 세금계산서 유무 표시 + 자재단가 마스터 저장 시 세액/금액
    // 역산(공급가×1.1)에만 쓰인다.
    const dPrice = inputPrice;
    maybeSyncPriceEntry_(name, inputPrice, priceType);
    matLines.push({ name: name, spec: '', qty: qty, price: inputPrice, fromStock: false, rowIndex: null, location: '현장구매', dPrice: dPrice, buyer: source, priceType: priceType });
    nameEl.value = ''; qtyEl.value = 1;
    if (priceEl) priceEl.value = '';
    if (sourceEl) sourceEl.value = '';
    if (typeEl) typeEl.value = 'vat';
    renderMatLines();
  }

  /**
   * "자재 직접 입력"에 이미 자재단가에 등록된 이름과 같은 이름을 넣었는데 단가(부가세 제외 공급가)가
   * 다르면, 자재단가의 기존 값도 같이 고칠지 물어본다. 아니오를 누르면 이번 건에만 새 단가를 쓰고
   * 마스터 데이터(자재단가)는 그대로 둔다.
   */
  function maybeSyncPriceEntry_(name, inputPrice, priceType) {
    if (!inputPrice) return;
    const existing = priceListCache.find(function (p) { return String(p.name || '').trim().toLowerCase() === name.toLowerCase(); });
    if (!existing || !existing.rowIndex) return;
    const existingSupply = Number(existing.supply) || 0;
    if (!existingSupply || existingSupply === inputPrice) return;
    if (!confirm('단가(부가세 제외)가 자재단가에 등록된 값(' + fmtMoney(existingSupply) + ')과 다릅니다.\n자재단가의 단가를 ' + fmtMoney(inputPrice) + '(으)로 수정하시겠습니까?')) return;
    const supply = inputPrice;
    const tax = priceType === 'cash' ? '' : Math.round(inputPrice * 0.1);
    const amount = priceType === 'cash' ? '' : (supply + tax);
    RUN().withFailureHandler(function (e) { toast('자재단가 수정 실패: ' + e.message); }).updatePriceEntry(existing.rowIndex, { supply: supply, tax: tax, amount: amount });
    existing.supply = supply; existing.tax = tax; existing.amount = amount;
    toast('자재단가를 수정했습니다');
  }

  function removeMatLine(i) { matLines.splice(i, 1); renderMatLines(); }

  function renderMatLines() {
    const html = matLines.map((m, i) => {
      const tag = m.fromStock ? '' : ' <span style="color:#f59e0b;font-size:11px;">직접기재</span>';
      const locTag = m.location ? ` <span style="color:#2563eb;font-size:11px;">[${m.location}]</span>` : '';
      const buyerTag = m.buyer ? ` <span style="color:#8b5cf6;font-size:11px;">${m.buyer}</span>` : '';
      const cashTag = (m.priceType === 'cash') ? ' <span style="color:#16a34a;font-size:11px;">현금가</span>' : '';
      const priceInput = `<input type="number" value="${m.price}" style="width:90px;" onchange="updateMatPrice(${i}, this.value)" />`;
      return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span style="flex:2;">${m.name}${m.spec ? ' ('+m.spec+')' : ''}${tag}${locTag}${buyerTag}${cashTag}</span>
        <span style="flex:0.6;">x${m.qty}</span>
        ${priceInput}
        <button class="btn-danger" style="padding:2px 8px;font-size:12px;" onclick="removeMatLine(${i})">×</button>
      </div>`;
    }).join('');
    ['f_matList', 'a_matList', 'e_matList'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    });
    recalcCost();
  }

  function updateMatPrice(i, val) {
    const m = matLines[i];
    m.price = Number(val) || 0;
    m.dPrice = m.price; // 단가는 항상 부가세 제외 기준이므로 그대로 동기화
    recalcCost();
  }

  function addExtraLine(prefix) {
    prefix = prefix || 'f';
    const nameEl = document.getElementById(prefix + '_extraName');
    const amtEl = document.getElementById(prefix + '_extraAmount');
    const name = nameEl.value.trim();
    const amt = Number(amtEl.value) || 0;
    if (!name || !amt) { toast('항목과 금액을 입력하세요'); return; }
    extraLines.push({ name: name, amount: amt });
    nameEl.value = ''; amtEl.value = '';
    renderExtraLines();
  }

  function removeExtraLine(i) { extraLines.splice(i, 1); renderExtraLines(); }

  function renderExtraLines() {
    const html = extraLines.map((e, i) =>
      `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span style="flex:2;">${e.name}</span>
        <span style="flex:1;">${fmtMoney(e.amount)}</span>
        <button class="btn-danger" style="padding:2px 8px;font-size:12px;" onclick="removeExtraLine(${i})">×</button>
      </div>`
    ).join('');
    ['f_extraList', 'a_extraList', 'e_extraList'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    });
    recalcCost();
  }

  function recalcCost() {
    // 원가(L)도 부제원가(buildMaterialDTotal)와 동일하게 부가세 제외 단가(dPrice) 기준으로 계산한다.
    // dPrice는 재고 자재는 공급가(부가세 제외), 직접입력 자재는 입력 시 부가세를 뗀 값으로 항상 채워져 있다.
    const matSum = matLines.reduce((s, m) => s + (Number(m.dPrice != null ? m.dPrice : m.price) || 0) * (Number(m.qty) || 1), 0);
    const extraSum = extraLines.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const total = matSum + extraSum;
    ['f_cost', 'a_cost', 'e_cost'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.value = total ? total.toLocaleString('ko-KR') : '';
    });
    recalcMargin('f');
    recalcMargin('a');
  }

  function buildMaterialContent() {
    return matLines.map(m => m.name + (m.qty > 1 ? ' x' + m.qty : '')).join(', ');
  }

  /**
   * 저장할 때 내용(D열) 뒤에 붙였던 " / 자재목록"을 다시 떼어낸다.
   *
   * 저장은 항상 `내용 = 사람이 쓴 설명 + ' / ' + 자재목록` 형태로 조립되는데(doSubmit),
   * 수정 화면을 열 땐 그 합쳐진 문자열을 그대로 내용칸에 되돌려놓고 자재 목록도 같이 복원한다.
   * 그 상태로 다시 저장하면 이미 자재명이 들어있는 내용 뒤에 같은 자재목록이 한 번 더 붙어서
   * "A, B / A, B"처럼 쌓인다(2026-08-05 장부 5462행 김포공항 건이 이 경우).
   *
   * 앱이 붙인 형태(' / ' + 자재목록)와 정확히 일치하는 꼬리만 떼어내므로, 사람이 직접 쓴 설명은
   * 건드리지 않는다. 이미 여러 번 겹쳐 저장된 과거 기록도 복구되도록 남아있지 않을 때까지 반복한다.
   */
  function stripSavedMatContent_(content, matContent) {
    let s = String(content == null ? '' : content).trim();
    const m = String(matContent == null ? '' : matContent).trim();
    if (!m) return s;
    for (let i = 0; i < 20; i++) {
      if (s === m) { s = ''; break; }
      const tail = ' / ' + m;
      if (s.length > tail.length && s.slice(-tail.length) === tail) {
        s = s.slice(0, s.length - tail.length).trim();
      } else break;
    }
    return s;
  }

  function buildMaterialDTotal() {
    const matSum = matLines.reduce((s, m) => s + (Number(m.dPrice != null ? m.dPrice : m.price) || 0) * (Number(m.qty) || 1), 0);
    const extraSum = extraLines.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return matSum + extraSum;
  }

  function buildCostNote() {
    const buyers = [];
    matLines.forEach(function (m) {
      const b = (m.buyer || '').trim();
      if (b && buyers.indexOf(b) === -1) buyers.push(b);
    });
    const parts = [];
    if (buyers.length) parts.push(buyers.join(', '));
    if (extraLines.length) {
      parts.push(extraLines.map(e => e.name + ' ' + Number(e.amount).toLocaleString()).join(', '));
    }
    return parts.join(' / ');
  }

  function resetMatExtra() {
    matLines = []; extraLines = [];
    renderMatLines(); renderExtraLines();
  }

  function getCustomMaterials() {
    return matLines.filter(m => !m.fromStock);
  }

  let editState = { rowIndex: null, rowId: null, prefix: null };

  function editRowInForm(r) {
    const isAdmin = isAdminRole_(currentUser.role);
    const prefix = isAdmin ? 'a' : 'f';
    // 반드시 입력 탭으로 데려온다. 예전엔 관리자만 탭을 바꿨는데, 직원이 "장부 검색"·"최근 7일 장부"에서
    // 행을 탭하면 화면은 검색 탭에 그대로 있고 안 보이는 입력 폼만 조용히 수정 모드로 바뀌었다
    // (수정 배너도 그 탭 안에 있어서 안 보임). 그 상태로 입력 탭에 가서 새 건을 적고 저장하면
    // 새 기록이 생기는 게 아니라 아까 눌렀던 남의 기록이 그 내용으로 덮어써진다 — 2026-08-05
    // 영동대로·신당동 건이 두 줄씩 생긴 사고의 경로다.
    if (isAdmin) showAdminTab('input');
    else if (typeof showEmpTab === 'function') showEmpTab('input');

    // rowId: 이 기록을 연 시점의 고유ID를 들고 있다가 저장/삭제 시 서버로 같이 보낸다.
    // 그 사이 관리자가 출장자순 정렬을 하면 이 화면이 가리키는 물리적 행 번호(rowIndex)에
    // 다른 기록이 들어와 있을 수 있는데, 서버가 이 값으로 "그 행이 맞는지" 확인해서
    // 엉뚱한 기록을 덮어쓰거나 지우는 사고를 막는다.
    // origDate/origAddress/origContent: "지금 덮어쓰려는 게 원래 무슨 기록이었는지"를 저장 직전에
    // 사람에게 보여주기 위한 값이다(doSubmit의 덮어쓰기 확인창).
    editState = { rowIndex: r.rowIndex, rowId: r.rowId || '', prefix: prefix, agent: r.agent || currentUser.name,
      origDate: r.date || '', origAddress: r.address || '', origContent: r.content || '',
      originalMatLines: [], originalExtraLines: [] };

    const g = id => document.getElementById(prefix + '_' + id);
    g('date').value = r.date;
    g('address').value = r.address || '';
    g('content').value = r.content || '';

    const baseAmt = Number(r.subtitle) || Number(r.amount) || 0;
    const eAmt = Number(r.amount) || baseAmt;
    g('amount').value = baseAmt ? baseAmt.toLocaleString('ko-KR') : '';
    g('eAmount').value = eAmt ? eAmt.toLocaleString('ko-KR') : '';
    const vatEl = g('vatSeparate');
    if (vatEl) vatEl.checked = (baseAmt > 0 && Math.abs(eAmt - Math.round(baseAmt * 1.1)) <= 1);
    recalcMargin(prefix);

    const payEl = g('payType'); if (payEl && r.payType) payEl.value = r.payType;
    const confEl = g('confirmed'); if (confEl && r.confirmed) confEl.value = r.confirmed;
    g('note').value = r.note || '';
    g('source').value = r.source || '';

    matLines = []; extraLines = [];
    renderMatLines(); renderExtraLines();
    loadStockForForm();
    loadSourceList();

    // renderMatLines/renderExtraLines가 recalcCost()를 호출하며 원가 필드를 비워버리므로
    // 반드시 그 다음에 기존 원가값으로 되돌린다.
    const setCostField_ = function () {
      const costEl = g('cost'); if (costEl && r.cost != null) costEl.value = Number(r.cost) ? Number(r.cost).toLocaleString('ko-KR') : '';
      recalcMargin(prefix);
    };
    setCostField_();

    // 이 행에 저장된 자재 목록을 불러와 복원 — 수정 시 화면에 다시 보여주고,
    // 저장할 때 이 시점의 목록(originalMatLines)과 비교해 재고 증감분(diff)을 계산하는 데 쓴다.
    RUN()
      .withSuccessHandler(function (usage) {
        if (editState.rowIndex !== r.rowIndex) return; // 그 사이 다른 행을 열었으면 무시
        const u = usage || {};
        matLines = Array.isArray(u.matLines) ? u.matLines : [];
        extraLines = Array.isArray(u.extraLines) ? u.extraLines : [];
        editState.originalMatLines = JSON.parse(JSON.stringify(matLines));
        editState.originalExtraLines = JSON.parse(JSON.stringify(extraLines));
        renderMatLines(); renderExtraLines();
        setCostField_();
        // 내용칸에는 사람이 쓴 설명만 남긴다. 자재목록은 아래 자재 영역에 이미 복원돼 있고,
        // 저장할 때 doSubmit이 다시 붙이므로 여기서 떼어두지 않으면 저장할 때마다 겹쳐 쌓인다.
        const contentEl = g('content');
        if (contentEl) contentEl.value = stripSavedMatContent_(contentEl.value, buildMaterialContent());
      })
      .withFailureHandler(function () {  })
      .getMaterialUsage(r.rowIndex);

    const banner = document.getElementById(prefix + '_editBanner');
    if (banner) banner.classList.remove('hidden');
    // 누구(출장자=작성자)의 기록을 수정 중인지 배너에 명시한다. 장부검색·대시보드 표 등에서 남의 기록을
    // 열었을 때 화면에는 폼 내용만 채워져서 누구 건지 알 수 없었고, 저장하면 원래 출장자 이름이 그대로
    // 유지되기 때문에(doSubmit의 agent: editState.agent) 남의 기록인 줄 모르고 고치는 사고가 났었다.
    // 본인 기록이면 파랑, 다른 사람 기록이면 주황으로 배경색까지 바꿔서 한눈에 구분되게 한다.
    setEditBannerWho_(prefix, editState.agent, r);
    const extras = document.getElementById(prefix + '_editExtras');
    if (extras) extras.classList.remove('hidden');
    const btns = document.getElementById(prefix + '_editButtons');
    if (btns) btns.classList.remove('hidden');
    const submitBtn = document.getElementById(prefix + '_submitBtn');
    if (submitBtn) submitBtn.textContent = '수정 저장';
    // 2026-07-24부터: 수정 중에도 신규 입력과 동일한 위치의 "현장 사진/영상" 드롭존을 그대로 보여준다
    // (예전엔 여기서 숨기고 아래 "보기/추가" 모달 하나로만 관리했는데, 신규 입력과 다르게 동작해서 헷갈린다는
    // 피드백으로 되돌림 — 저장 시 targetRowIndex로 업로드되는 기존 로직이 수정 모드에서도 그대로 맞기 때문에
    // 드롭존을 숨길 필요가 애초에 없었음). "보기/추가" 버튼은 이미 첨부된 사진을 확인하는 용도로 남겨둔다.

    loadEDocLink(prefix, r.rowIndex);

    const formEl = document.getElementById(prefix === 'a' ? 'adminTab-input' : 'empTab-input');
    if (formEl && formEl.scrollIntoView) formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * 수정 배너에 "누구의 어떤 기록"인지 채워 넣는다. agent가 비어 있거나(구 데이터) 초기화 호출이면
   * 예전과 같은 "기존 기록을 수정하는 중입니다" 문구로 돌아간다.
   * textContent로만 넣으므로 주소/내용에 특수문자가 있어도 이스케이프가 필요 없다.
   */
  function setEditBannerWho_(prefix, agent, r) {
    const whoEl = document.getElementById(prefix + '_editWho');
    const metaEl = document.getElementById(prefix + '_editMeta');
    const banner = document.getElementById(prefix + '_editBanner');
    if (whoEl) whoEl.textContent = agent ? ('출장자 ' + agent + ' 님의 기록') : '기존 기록';
    if (metaEl) {
      const parts = r ? [r.date, r.address, r.content].filter(function (v) { return v; }) : [];
      metaEl.textContent = parts.join(' · ');
    }
    if (banner) {
      const isOther = !!agent && agent !== (currentUser && currentUser.name);
      banner.style.background = isOther ? '#fff7ed' : '#eef6ff';
      banner.style.color = isOther ? '#b45309' : '#1d4ed8';
    }
  }

  function clearFormFields_(prefix) {
    ['address','content','amount','eAmount','note','source','cost','margin'].forEach(id => {
      const el = document.getElementById(prefix + '_' + id); if (el) el.value = '';
    });
    const vatEl = document.getElementById(prefix + '_vatSeparate'); if (vatEl) vatEl.checked = false;
    resetMatExtra();
  }

  function exitEditMode(prefix) {
    editState = { rowIndex: null, rowId: null, prefix: null };
    const banner = document.getElementById(prefix + '_editBanner');
    if (banner) banner.classList.add('hidden');
    setEditBannerWho_(prefix, '', null); // 다음 수정 때 이전 사람 이름이 남아있지 않도록 초기화
    const extras = document.getElementById(prefix + '_editExtras');
    if (extras) extras.classList.add('hidden');
    const btns = document.getElementById(prefix + '_editButtons');
    if (btns) btns.classList.add('hidden');
    const submitBtn = document.getElementById(prefix + '_submitBtn');
    if (submitBtn) submitBtn.textContent = '기록 등록';
    const mediaWrap = document.getElementById(prefix + '_mediaInputWrap');
    if (mediaWrap) mediaWrap.classList.remove('hidden');
    loadEDocLink(prefix, null); // 다음 신규 입력을 위해 문서연결 선택 상태 초기화
  }

  function cancelEdit(prefix) {
    exitEditMode(prefix);
    clearFormFields_(prefix);
    dateAutoSetFlags_[prefix + '_date'] = true;
    toast('수정을 취소했습니다');
  }

  function deleteEditingRow(prefix) {
    if (!editState.rowIndex) return;
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const rowIndex = editState.rowIndex;
    const rowId = editState.rowId;
    const isOwn = (prefix === 'f');
    const call = RUN()
      .withSuccessHandler(function (res) {
        if (res && res.success === false) {
          toast(res.message || '삭제할 수 없습니다');
          return;
        }
        toast('삭제되었습니다');
        exitEditMode(prefix);
        clearFormFields_(prefix);
        if (isAdminRole_(currentUser.role)) { loadMyRecentAdmin(); loadAllEntries(); renderCalendar(); }
        else { loadMyRecent(); loadEmpRecentWeek(); }
      })
      .withFailureHandler(e => toast('오류: ' + e.message));
    if (isOwn) call.deleteOwnEntry(rowIndex, currentUser.name, rowId);
    else call.deleteEntry(rowIndex, rowId);
  }

  let eDocLinkState_ = { fileId: null };
  // 아직 저장 전(최초 입력 중)에 고른 문서 fileId. 저장 후 rowIndex가 확정되면 그때 실제로 연결한다.
  let pendingDocLinkFileId_ = { f: null, a: null };

  function refreshDocLinkLists_(prefix) {
    if (prefix === 'a') { loadAllEntries(); }
    else { loadMyRecent(); loadEmpRecentWeek(); }
  }

  /**
   * rowIndex가 있으면(수정 중) 이미 연결된 문서를 서버에서 불러와 표시.
   * rowIndex가 없으면(최초 입력 중) 이번 입력에서 고를 예정인 문서 선택 상태만 초기화.
   */
  function loadEDocLink(prefix, rowIndex) {
    eDocLinkState_ = { fileId: null };
    pendingDocLinkFileId_[prefix] = null;
    const picked = document.getElementById(prefix + '_docLinkPicked');
    const searchWrap = document.getElementById(prefix + '_docLinkSearchWrap');
    if (!picked || !searchWrap) return;
    picked.classList.add('hidden');
    searchWrap.classList.remove('hidden');
    document.getElementById(prefix + '_docLinkKw').value = '';
    document.getElementById(prefix + '_docLinkResult').innerHTML = '';
    if (!rowIndex) return; // 최초 입력 중 — 서버에 물어볼 대상 행이 아직 없음
    RUN()
      .withSuccessHandler(function (link) {
        if (link) { eDocLinkState_.fileId = link.fileId; showEDocLinkPicked_(prefix, link); }
      })
      .withFailureHandler(function () {  })
      .getDocLinkForRow(rowIndex);
  }

  function showEDocLinkPicked_(prefix, link) {
    document.getElementById(prefix + '_docLinkPicked').classList.remove('hidden');
    document.getElementById(prefix + '_docLinkSearchWrap').classList.add('hidden');
    document.getElementById(prefix + '_docLinkPickedText').textContent =
      link.client + ' (' + (link.kind === 'estimate' ? '견적서' : '거래명세서') + ')';
    document.getElementById(prefix + '_docLinkOpenBtn').href = 'https://drive.google.com/file/d/' + link.fileId + '/view';
    // 선택 후에도 예전 검색 결과 목록이 그 밑에 그대로 남아있던 버그 수정 — 골랐으면 목록은 비운다
    const resultEl = document.getElementById(prefix + '_docLinkResult');
    if (resultEl) resultEl.innerHTML = '';
  }

  let eDocSearchResults_ = []; // 검색 결과를 여기 보관하고 onclick엔 인덱스만 실어서, 거래처명에 따옴표 등이
  // 섞여 있어도(JSON.stringify를 그대로 onclick 속성에 넣으면 여기서 깨질 수 있었음) 안전하게 처리한다

  function pickEDocLinkByIndex_(prefix, idx) {
    const d = eDocSearchResults_[idx];
    if (d) pickEDocLink(prefix, d);
  }

  function doEDocLinkSearch(prefix) {
    const kw = document.getElementById(prefix + '_docLinkKw').value.trim();
    const el = document.getElementById(prefix + '_docLinkResult');
    if (!kw) { toast('거래처명을 입력하세요'); return; }
    el.innerHTML = '<span class="muted">검색 중...</span>';
    RUN()
      .withSuccessHandler(function (res) {
        const list = (res && Array.isArray(res.rows)) ? res.rows : [];
        eDocSearchResults_ = list;
        if (!list.length) {
          const total = res ? (res.totalCount || 0) : 0;
          const recent = (res && Array.isArray(res.recentClients)) ? res.recentClients.filter(Boolean) : [];
          let msg = '검색 결과가 없습니다.';
          if (total) {
            msg += ' (전체 등록 문서 ' + total + '건';
            if (recent.length) msg += ' · 최근 거래처명: ' + recent.map(escapeHtml_).join(', ');
            msg += ')';
          } else {
            msg += ' (등록된 문서가 아직 없습니다)';
          }
          el.innerHTML = '<span class="muted">' + msg + '</span>';
          return;
        }
        el.innerHTML = list.map(function (d, idx) {
          return `<div style="padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px;"
                    onclick='pickEDocLinkByIndex_("${prefix}", ${idx})'>
                    📄 ${escapeHtml_(d.client)} (${escapeHtml_(d.docDate)}) · ${d.kind === 'estimate' ? '견적서' : '거래명세서'}
                  </div>`;
        }).join('');
      })
      .withFailureHandler(function (e) { el.innerHTML = '<span class="muted">오류: ' + e.message + '</span>'; })
      .searchDocs(kw);
  }

  /**
   * 문서를 고르는 시점에 이 폼이 "이미 저장된 행을 수정 중"이면 바로 서버에 연결하고,
   * "아직 저장 전(최초 입력)"이면 로컬에만 기억해뒀다가 저장 성공 후 rowIndex가 생기면 연결한다.
   */
  function pickEDocLink(prefix, d) {
    const isEditingThisForm = editState.rowIndex && editState.prefix === prefix;
    if (!isEditingThisForm) {
      pendingDocLinkFileId_[prefix] = d.fileId;
      eDocLinkState_.fileId = d.fileId;
      showEDocLinkPicked_(prefix, d);
      toast('문서를 선택했습니다. 저장하면 연결됩니다.');
      return;
    }
    const rowIndex = editState.rowIndex;
    RUN()
      .withSuccessHandler(function () {
        eDocLinkState_.fileId = d.fileId;
        showEDocLinkPicked_(prefix, d);
        toast('문서를 연결했습니다 ✅');
        refreshDocLinkLists_(prefix);
      })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); })
      .linkDocToRow(d.fileId, rowIndex);
  }

  function clearEDocLink(prefix) {
    const isEditingThisForm = editState.rowIndex && editState.prefix === prefix;
    if (!isEditingThisForm) {
      pendingDocLinkFileId_[prefix] = null;
      eDocLinkState_.fileId = null;
      document.getElementById(prefix + '_docLinkPicked').classList.add('hidden');
      document.getElementById(prefix + '_docLinkSearchWrap').classList.remove('hidden');
      return;
    }
    const rowIndex = editState.rowIndex;
    RUN()
      .withSuccessHandler(function () {
        eDocLinkState_.fileId = null;
        document.getElementById(prefix + '_docLinkPicked').classList.add('hidden');
        document.getElementById(prefix + '_docLinkSearchWrap').classList.remove('hidden');
        toast('연결을 해제했습니다');
        refreshDocLinkLists_(prefix);
      })
      .withFailureHandler(function (e) { toast('오류: ' + e.message); })
      .unlinkDocFromRow(rowIndex);
  }

  function submitEntry() {
    doSubmit('f');
  }

  /**
   * 수정 시 재고를 "새로 담은 만큼 통째로 차감"하지 않고, 기존에 저장된 자재 목록(oldLines)과
   * 지금 화면의 자재 목록(newLines)을 비교해서 차이(delta)만큼만 재고를 증감시키기 위한 계산.
   * 같은 재고행+위치 조합은 (새 수량 - 기존 수량)만큼만 반영, 위치가 바뀐 경우는
   * 기존 위치는 되돌리고(음수) 새 위치는 새로 차감(양수)되도록 각각 별도 델타로 잡힌다.
   */
  function computeStockDeltas_(oldLines, newLines) {
    const map = {};
    const add = (list, sign) => {
      (list || []).forEach(function (m) {
        if (!m.fromStock || !m.rowIndex || !m.location || m.location === '현장구매') return;
        const k = m.rowIndex + '|' + m.location;
        if (!map[k]) map[k] = { rowIndex: m.rowIndex, location: m.location, delta: 0 };
        map[k].delta += sign * (Number(m.qty) || 0);
      });
    };
    add(oldLines, -1);
    add(newLines, 1);
    return Object.keys(map).map(k => map[k]).filter(v => v.delta !== 0)
      .map(v => ({ rowIndex: v.rowIndex, location: v.location, qty: v.delta }));
  }

  function doSubmit(prefix) {
    // 느린 현장 네트워크에서 응답을 기다리다 버튼을 여러 번 누르면 같은 기록이 중복 등록되고
    // 재고도 중복 차감될 수 있어서, 요청이 진행 중인 동안은 버튼을 잠가둔다.
    const submitBtn = document.getElementById(prefix + '_submitBtn');
    if (submitBtn && submitBtn.disabled) return;
    if (submitBtn) submitBtn.disabled = true;
    const unlockSubmitBtn_ = function () { if (submitBtn) submitBtn.disabled = false; };

    const g = id => document.getElementById(prefix + '_' + id);
    const isEditing = (editState.rowIndex && editState.prefix === prefix);
    const matContent = buildMaterialContent();
    // 수정 중이면 내용칸에 자재목록이 남아 있을 수 있으므로(수정 화면을 연 직후 자재 복원이
    // 아직 안 끝났거나 실패한 경우) 저장 직전에 한 번 더 떼어낸다. 이미 떼어져 있으면 그대로다.
    const baseContent = isEditing
      ? stripSavedMatContent_(g('content').value, matContent)
      : g('content').value.trim();
    let content = baseContent;
    if (matContent) content = baseContent ? (baseContent + ' / ' + matContent) : matContent;

    const baseAmount = numVal(prefix + '_amount');
    const eAmount = numVal(prefix + '_eAmount') || baseAmount;

    const entry = {
      date: g('date').value,
      address: g('address').value,
      content: content,
      amount: eAmount,
      subtitle: baseAmount,

      agent: isEditing ? editState.agent : currentUser.name,
      payType: g('payType').value,
      confirmed: g('confirmed').value,
      note: g('note').value,
      source: g('source').value,
      cost: numVal(prefix + '_cost'),
      costNote: buildCostNote(),
      subtitleCost: (matLines.length || extraLines.length) ? buildMaterialDTotal() : undefined,
      submittedBy: currentUser.name,
      rowId: isEditing ? editState.rowId : undefined
    };
    if (!entry.date || !entry.address) {
      toast('날짜, 주소는 필수입니다'); unlockSubmitBtn_(); return;
    }

    // 수정 모드인데 주소가 원래 기록과 다르다 = 십중팔구 "새 기록을 쓰는 줄 알았는데 실은 남의 기록을
    // 덮어쓰는 중"이다. 저장하면 원래 기록이 사라지므로 여기서 한 번 붙잡는다.
    // (주소가 그대로면 금액·비고 고치는 평범한 수정이라 묻지 않는다 — 매번 물으면 일상 수정이 번거로워진다)
    if (isEditing && String(entry.address).trim() !== String(editState.origAddress || '').trim()) {
      const who = editState.agent ? (editState.agent + ' 님의 ') : '';
      const what = [editState.origDate, editState.origAddress, editState.origContent].filter(function (v) { return v; }).join(' · ');
      if (!confirm('⚠️ 새 기록을 추가하는 게 아니라 기존 기록을 덮어쓰려 하고 있습니다.\n\n' +
                   '덮어쓸 기록: ' + who + what + '\n\n' +
                   '새 기록으로 등록하시려면 [취소]를 누른 뒤, 아래 "취소" 버튼으로 수정 모드를 빠져나온 다음 다시 입력해주세요.')) {
        unlockSubmitBtn_(); return;
      }
    }

    // 수정 화면을 열 때 이전에 저장된 "직접기재" 자재도 그대로 복원되므로, 아무것도 안 바꾸고
    // 다시 저장하기만 해도 매번 자재단가 등록 팝업이 뜨고 확인하면 똑같은 값으로 또 한 줄이
    // 추가되는 문제가 있었다(자재단가는 이력 보존을 위해 항상 새 행을 추가하는 방식이라 —
    // Stock.js addPriceEntry_ — 중복이 그대로 쌓였음). 수정 중엔 "이 시점 자재 목록"과 비교해
    // 이름·매입처·가격이 완전히 같은(=안 바뀐) 항목은 다시 등록 대상에서 뺀다.
    const isUnchangedCustom_ = function (m) {
      return (editState.originalMatLines || []).some(function (o) {
        return !o.fromStock && o.name === m.name &&
          String(o.buyer || '') === String(m.buyer || '') &&
          (Number(o.price) || 0) === (Number(m.price) || 0);
      });
    };
    const customs = isEditing
      ? getCustomMaterials().filter(function (m) { return !isUnchangedCustom_(m); })
      : getCustomMaterials();

    const finalize = function () {
      // 수정 중이면 "수정 시작 시점의 자재 목록"과 지금 목록을 비교해 차이만큼만 재고 반영.
      // 새 등록이면 기존 목록이 없으니 지금 담은 수량 그대로 전부 차감(기존 동작과 동일).
      const deductions = isEditing
        ? computeStockDeltas_(editState.originalMatLines || [], matLines)
        : matLines
            .filter(m => m.rowIndex && m.location && m.location !== '현장구매')
            .map(m => ({ rowIndex: m.rowIndex, location: m.location, qty: m.qty }));

      const matSnapshot = { matLines: matLines, extraLines: extraLines };

      const onSaved = function (res) {
        // 서버가 "같은 기록이 이미 있다"고 돌려준 경우(Ledger.js findDuplicateLedgerRow_).
        // 여기서 되묻지 않고 그냥 막으면, 같은 건물 다른 세대처럼 진짜로 같은 값의 두 건을
        // 넣어야 할 때 방법이 없어지므로 사람에게 한 번 확인받는다.
        if (!isEditing && res && res.duplicate) {
          unlockSubmitBtn_();
          if (confirm(res.message + '\n\n실수로 두 번 저장된 것이면 "취소"를 누르세요.\n같은 현장의 별도 건이라면 "확인"을 눌러 그대로 등록합니다.')) {
            if (submitBtn) submitBtn.disabled = true;
            sendSave_(true);
          }
          return;
        }
        if (isEditing && res && res.success === false) {
          unlockSubmitBtn_();
          toast(res.message || '수정할 수 없습니다');
          return;
        }
        const targetRowIndex = isEditing ? editState.rowIndex : (res && res.rowIndex);

        // 다음 수정 때 diff를 계산할 수 있도록, 이번에 실제로 저장된 자재 목록을 스냅샷으로 남겨둔다.
        if (targetRowIndex) {
          RUN().withFailureHandler(function () {}).saveMaterialUsage(targetRowIndex, matSnapshot);
        }

        // 최초 입력 중 미리 골라둔 견적서/거래명세서가 있으면 이제 rowIndex가 생겼으니 실제로 연결한다.
        if (!isEditing && targetRowIndex && pendingDocLinkFileId_[prefix]) {
          const pendingFileId = pendingDocLinkFileId_[prefix];
          pendingDocLinkFileId_[prefix] = null;
          RUN()
            .withSuccessHandler(function () { refreshDocLinkLists_(prefix); })
            .withFailureHandler(function (e) { toast('문서 연결 실패: ' + e.message); })
            .linkDocToRow(pendingFileId, targetRowIndex);
        }

        if (deductions.length) {
          RUN()
            .withSuccessHandler(function (dres) {
              if (dres && dres.warnings && dres.warnings.length) {
                toast((isEditing ? '수정됨' : '등록됨') + '. 주의: ' + dres.warnings[0]);
              } else {
                toast((isEditing ? '수정' : '등록') + ' 및 재고 차감 완료 ✅');
              }
            })
            .withFailureHandler(function () { toast((isEditing ? '수정됨' : '등록됨') + ' (재고 차감은 실패)'); })
            .deductStock(deductions);
        } else {
          toast(isEditing ? '수정되었습니다 ✅' : '등록되었습니다 ✅');
        }

        const bizFileEl = document.getElementById(prefix + '_bizRegFile');
        const bizFile = bizFileEl && bizFileEl.files && bizFileEl.files[0];
        if (bizFile && targetRowIndex) {
          const reader = new FileReader();
          reader.onload = function () {
            const base64 = reader.result.split(',')[1];
            RUN()
              .withSuccessHandler(function (ocrRes) {
                if (ocrRes && ocrRes.success) {
                  const emailEl = document.getElementById(prefix + '_bizEmail');
                  ocrRes.fields.email = emailEl ? emailEl.value.trim() : '';
                  if (emailEl) emailEl.value = '';
                  RUN()
                    .withSuccessHandler(function () {
                      toast(ocrRes.ocrError
                        ? ('사업자등록증 저장됨. 인식 실패 원인: ' + ocrRes.ocrError)
                        : '사업자등록증 자동인식 완료 (대시보드에서 확인 가능)');
                    })
                    .withFailureHandler(function (e) {
                      toast('⚠️ 사진은 업로드됐지만 정보 저장에 실패했습니다: ' + e.message + ' — 다시 시도해주세요');
                    })
                    .saveBizReg(targetRowIndex, ocrRes.fileId, bizFile.name, ocrRes.fields, currentUser.name);
                } else {
                  toast('사업자등록증 처리에 실패했습니다.');
                }
              })
              .withFailureHandler(function (e) { toast('사업자등록증 업로드 오류: ' + e.message); })
              .uploadAndOcrBizReg(targetRowIndex, base64, bizFile.type, bizFile.name);
          };
          reader.readAsDataURL(bizFile);
          bizFileEl.value = '';
        }

        // 사진/영상 업로드가 끝날 때까지는 폼 초기화/버튼 잠금해제를 미룬다 — 예전엔 저장 직후 바로 폼을
        // 리셋하고 백그라운드에서 조용히 업로드해서, 다 된 줄 알고 다른 데로 넘어가면(탭 닫기 등) 업로드가
        // 중간에 끊겨도 알 방법이 없었다(예: 사진 5장+영상 1개 중 4장만 올라감). 지금은 전체화면 진행률
        // 오버레이가 다 끝나야 아래 마무리 단계가 실행된다.
        const finishUp_ = function () {
          unlockSubmitBtn_();
          if (isEditing) {
            exitEditMode(prefix);
          } else {
            loadEDocLink(prefix, null); // 신규 입력 저장 완료 — 다음 입력을 위해 문서연결 선택 상태 초기화
          }
          clearFormFields_(prefix);
          dateAutoSetFlags_[prefix + '_date'] = true;
          if (prefix === 'a') { loadMyRecentAdmin(); loadAllEntries(); renderCalendar(); }
          else { loadMyRecent(); loadEmpRecentWeek(); }
          loadStockForForm();
          loadSourceList();
        };

        const mediaFileEl = document.getElementById(prefix + '_mediaFiles');
        const mediaFiles = mediaFileEl && mediaFileEl.files ? Array.from(mediaFileEl.files) : [];
        if (mediaFiles.length && targetRowIndex) {
          mediaFileEl.value = '';
          runMediaUploadQueue_(mediaFiles, targetRowIndex).then(function (r) {
            if (r.failures.length) {
              toast('사진/영상 ' + r.success + '/' + r.total + '건 업로드 완료, 실패 ' + r.failures.length + '건: ' + r.failures.join(', '));
            } else {
              toast('사진/영상 ' + r.total + '건 업로드 완료 ✅');
            }
            finishUp_();
          });
        } else {
          finishUp_();
        }
      };

      // 중복 확인에서 "그래도 등록"을 고르면 force=true로 이 함수를 한 번 더 부른다.
      const sendSave_ = function (force) {
        const call = RUN()
          .withSuccessHandler(onSaved)
          .withFailureHandler(e => { unlockSubmitBtn_(); toast('오류: ' + e.message); });

        if (isEditing) {
          if (prefix === 'a') call.updateEntry(editState.rowIndex, entry);
          else call.updateOwnEntry(editState.rowIndex, entry, currentUser.name);
        } else {
          call.addEntry(entry, force === true);
        }
      };
      sendSave_(false);
    };

    if (customs.length === 0) {
      finalize();
    } else {
      openPriceModal(customs, finalize);
    }
  }

  let priceModalCallback = null;
