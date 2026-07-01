(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AdminNotifications = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const STORAGE_KEY = 'taager.dismissedAdminNotificationIds';

  function createManager(options) {
    const storage = options.storage;
    const showToast = options.showToast;
    const isBlocked = options.isBlocked || (() => false);
    const schedule = options.setTimeout || setTimeout;
    const cancel = options.clearTimeout || clearTimeout;
    const retryMs = options.retryMs == null ? 250 : options.retryMs;
    const afterBlockedDelayMs = options.afterBlockedDelayMs == null ? 450 : options.afterBlockedDelayMs;
    let pending = null;
    let currentId = '';
    let closeCurrent = null;
    let timer = null;
    let waitingForUnblock = false;

    function readDismissed() {
      try {
        const value = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
        return new Set(Array.isArray(value) ? value.map(String) : []);
      } catch (_) {
        return new Set();
      }
    }

    function rememberDismissed(id) {
      const ids = readDismissed();
      ids.add(String(id));
      try { storage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids).slice(-100))); } catch (_) {}
    }

    function clearTimer() {
      if (timer != null) cancel(timer);
      timer = null;
    }

    function pump() {
      clearTimer();
      if (!pending || readDismissed().has(pending.id) || currentId === pending.id) return;
      if (isBlocked()) {
        waitingForUnblock = true;
        timer = schedule(pump, retryMs);
        return;
      }
      if (waitingForUnblock) {
        waitingForUnblock = false;
        timer = schedule(pump, afterBlockedDelayMs);
        return;
      }

      const notification = pending;
      pending = null;
      if (closeCurrent) closeCurrent();
      currentId = notification.id;
      let closed = false;
      closeCurrent = showToast(notification.message, {
        title: notification.title,
        kind: notification.kind,
        variant: 'admin',
        persistent: true,
        onClose: () => {
          if (closed) return;
          closed = true;
          rememberDismissed(notification.id);
          if (currentId === notification.id) {
            currentId = '';
            closeCurrent = null;
          }
        },
      });
    }

    function offer(raw) {
      clearTimer();
      if (!raw || raw.id == null) {
        pending = null;
        waitingForUnblock = false;
        return false;
      }
      const notification = {
        id: String(raw.id),
        title: String(raw.title || '').trim(),
        message: String(raw.message || '').trim(),
        kind: ['info', 'warn', 'success'].includes(raw.kind) ? raw.kind : 'info',
      };
      if (!notification.title || !notification.message || readDismissed().has(notification.id) || currentId === notification.id) {
        return false;
      }
      pending = notification;
      pump();
      return true;
    }

    return { offer, readDismissed };
  }

  return { STORAGE_KEY, createManager };
});
