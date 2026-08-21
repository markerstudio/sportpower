/* تطبيق الوضع المحفوظ مبكرًا قبل الرسم */
try { if (localStorage.getItem('sp-theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); } catch (e) { /* تجاهل */ }

/* تسجيل عامل الخدمة — التثبيت على الشاشة الرئيسية والعمل عند ضعف الاتصال */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* بيئات لا تدعم */ });
  });
  // نشرة جديدة استلمت التحكم → تحديث الصفحة مرة واحدة حتى لا تختلط
  // ملفات نسختين (كانت تسبب شاشة بيضاء بعد كل نشر)
  let swReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (swReloaded) return;
    swReloaded = true;
    location.reload();
  });
}

/* عميل الواجهة البرمجية */
const API = {
  token: localStorage.getItem('sp-token') || null,
  user: JSON.parse(localStorage.getItem('sp-user') || 'null'),

  async request(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    // 401 أثناء الدخول (كلمة مرور أو رمز تحقق خاطئ) رسالته تُعرض في مكانها —
    // وليس «انتهاء جلسة» يعيد التوجيه
    if (res.status === 401 && !url.startsWith('/api/login')) {
      this.clear();
      location.hash = '#/login';
      throw new Error('انتهت الجلسة — يرجى تسجيل الدخول من جديد.');
    }
    const data = await res.json().catch(() => ({}));
    /* الخادم يمنع كل شيء حتى تُغيَّر كلمة المرور المؤقتة — نعيد المستخدم
       إلى شاشة التغيير بدل إظهار خطأ صلاحية غامض */
    if (res.status === 403 && data.code === 'PASSWORD_CHANGE_REQUIRED') {
      if (this.user && !this.user.mustChangePassword) {
        this.user.mustChangePassword = true;
        try { localStorage.setItem('sp-user', JSON.stringify(this.user)); } catch (e) { /* تجاهل */ }
        if (typeof route === 'function') route();
      }
      throw new Error(data.error || 'يجب تغيير كلمة المرور المؤقتة أولًا.');
    }
    if (!res.ok) throw new Error(data.error || 'حدث خطأ غير متوقع.');
    return data;
  },

  _config: null,
  async config() {
    if (!this._config) {
      try { this._config = await fetch('/api/config').then((r) => r.json()); }
      catch (e) { this._config = { demo: false }; }
    }
    return this._config;
  },

  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
  put(url, body) { return this.request('PUT', url, body); },
  del(url) { return this.request('DELETE', url); },

  async login(username, password) {
    // رمز الجهاز الموثوق (إن وُجد لهذا المستخدم) يعفي من رمز التطبيق
    const deviceToken = localStorage.getItem('sp-device-' + username) || undefined;
    const data = await this.post('/api/login', { username, password, deviceToken });
    // أدوار المال والإدارة تكمل بالتحقق الثنائي قبل فتح الجلسة
    if (data.mfaRequired || data.mfaSetupRequired) return data;
    this._storeSession(data);
    return data.user;
  },

  async loginMfa(mfaToken, code, trustDevice, username) {
    const data = await this.post('/api/login/mfa', { mfaToken, code, trustDevice: !!trustDevice });
    if (data.deviceToken && username) {
      localStorage.setItem('sp-device-' + username, data.deviceToken);
    }
    this._storeSession(data);
    return data;
  },

  _storeSession(data) {
    this.token = data.token;
    this.user = data.user;
    localStorage.setItem('sp-token', data.token);
    localStorage.setItem('sp-user', JSON.stringify(data.user));
  },

  async logout() {
    try { await this.post('/api/logout'); } catch (e) { /* تجاهل */ }
    this.clear();
  },

  clear() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('sp-token');
    localStorage.removeItem('sp-user');
  },

  /* تنزيل ملف مع ترويسة المصادقة */
  async download(url, filename) {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + this.token } });
    if (!res.ok) throw new Error('تعذّر التنزيل.');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};
