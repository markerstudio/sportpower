/* إعادة تهيئة قاعدة البيانات (حذف كل البيانات وإعادة الزرع) */
const Store = require('./store');
Store.reseed()
  .then(() => { console.log('Database reseeded.'); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
