(function (root) {
  'use strict';
  var preference = 'sight-language';
  var selector = document.getElementById('language-select');
  var language = 'zh';
  try {
    var saved = localStorage.getItem(preference);
    if (saved === 'en' || saved === 'bi') language = saved;
  } catch (error) {}

  function translate(zh, en, mode) {
    switch (mode || language) {
      case 'en': return en;
      case 'bi': return zh === en ? zh : zh + ' ／ ' + en;
      default: return zh;
    }
  }

  function keyName(id, mode) {
    var key = SightGenerator.ALL_KEYS.find(function (item) { return item.id === id; });
    if (!key) return id;
    var accidental = key.alteration < 0 ? '♭' : key.alteration > 0 ? '♯' : '';
    return translate(key.label, key.tonic + accidental + ' ' + key.mode, mode);
  }

  function applyLanguage() {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.documentElement.dataset.language = language;
    selector.value = language;
  }
  root.I18n = { t: translate, keyName: keyName, mode: function () { return language; } };
  applyLanguage();
  selector.addEventListener('change', function () {
    language = selector.value;
    applyLanguage();
    try { localStorage.setItem(preference, language); } catch (error) {}
    document.dispatchEvent(new Event('languagechange:app'));
  });
})(window);
