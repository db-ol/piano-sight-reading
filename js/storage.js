(function (root) {
  'use strict';
  var KEY = 'sight-reading-history-v1';
  function read(storage) {
    try {
      var data = JSON.parse((storage || root.localStorage).getItem(KEY) || '[]');
      return Array.isArray(data) ? data.filter(function (x) {
        return x && typeof x.date === 'string' && x.summary && typeof x.summary === 'object';
      }).slice(0, 100) : [];
    } catch (e) { return []; }
  }
  function save(record, storage) {
    try {
      (storage || root.localStorage).setItem(KEY, JSON.stringify([record].concat(read(storage).filter(function (x) { return !record.id || x.id !== record.id; })).slice(0, 100)));
      return true;
    } catch (e) { return false; }
  }
  function clear(storage) {
    try { (storage || root.localStorage).removeItem(KEY); return true; }
    catch (e) { return false; }
  }
  var api = { read: read, save: save, clear: clear };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SightStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
