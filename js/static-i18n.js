(function () {
  'use strict';

  var labels = Array.from(document.querySelectorAll('[data-en]'), function (element) {
    return { element: element, zh: element.textContent, en: element.dataset.en };
  });
  var attributes = [];
  ['aria-label', 'content'].forEach(function (name) {
    var translation = 'data-en-' + name;
    document.querySelectorAll('[' + translation + ']').forEach(function (element) {
      attributes.push({ element: element, name: name, zh: element.getAttribute(name), en: element.getAttribute(translation) });
    });
  });

  function render() {
    var mode = I18n.mode();
    labels.forEach(function (label) {
      var element = label.element;
      if (mode === 'bi' && element.tagName !== 'OPTION' && element.tagName !== 'TITLE') {
        var primary = document.createElement('span');
        primary.className = 'i18n-primary';
        primary.lang = 'zh-CN';
        primary.textContent = label.zh;
        var secondary = document.createElement('span');
        secondary.className = 'i18n-secondary';
        secondary.lang = 'en';
        secondary.textContent = label.en;
        element.replaceChildren(primary, ' ', secondary);
      } else {
        element.textContent = I18n.t(label.zh, label.en);
      }
    });
    attributes.forEach(function (label) {
      label.element.setAttribute(label.name, I18n.t(label.zh, label.en));
    });
  }

  document.addEventListener('languagechange:app', render);
  render();
})();
