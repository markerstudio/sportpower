/* تطبيق الوضع المحفوظ مبكرًا قبل الرسم */
try { if (localStorage.getItem('sp-theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); } catch (e) { /* تجاهل */ }

/* تسجيل عامل الخدمة — التثبيت على الشاشة الرئيسية والعمل عند ضعف الاتصال */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* بيئات لا تدعم */ });
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
    if (res.status === 401 && !url.endsWith('/login')) {
      this.clear();
      location.hash = '#/login';
      throw new Error('انتهت الجلسة — يرجى تسجيل الدخول من جديد.');
    }
    const data = await res.json().catch(() => ({}));
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
    const data = await this.post('/api/login', { username, password });
    this.token = data.token;
    this.user = data.user;
    localStorage.setItem('sp-token', data.token);
    localStorage.setItem('sp-user', JSON.stringify(data.user));
    return data.user;
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
