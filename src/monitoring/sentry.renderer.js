"use strict";

(function initRendererPageMonitoring() {
  if (window.__taagerRendererMonitoringReady) return;
  window.__taagerRendererMonitoringReady = true;

  function serializeError(err) {
    if (!err) return { message: "Unknown renderer error" };
    return {
      name: err.name || "Error",
      message: err.message || String(err),
      stack: err.stack || "",
    };
  }

  function captureException(err, context) {
    try {
      if (window.monitoring && typeof window.monitoring.captureException === "function") {
        window.monitoring.captureException(serializeError(err), context || {});
      }
    } catch (_) {}
  }

  function addBreadcrumb(breadcrumb) {
    try {
      if (window.monitoring && typeof window.monitoring.addBreadcrumb === "function") {
        window.monitoring.addBreadcrumb(breadcrumb);
      }
    } catch (_) {}
  }

  window.addEventListener("error", function onRendererError(event) {
    captureException(event.error || event.message, {
      operation: "renderer.window.error",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      route: window.__taagerActiveRoute || "",
      theme: window._kbotTheme || "",
      language: window._kbotLang || "",
    });
  });

  window.addEventListener("unhandledrejection", function onRendererRejection(event) {
    captureException(event.reason, {
      operation: "renderer.unhandledrejection",
      route: window.__taagerActiveRoute || "",
      theme: window._kbotTheme || "",
      language: window._kbotLang || "",
    });
  });

  window.TaagerMonitoring = {
    addBreadcrumb,
    captureException,
    captureMessage: function captureMessage(message, level, context) {
      try {
        if (window.monitoring && typeof window.monitoring.captureMessage === "function") {
          window.monitoring.captureMessage(String(message), level || "info", context || {});
        }
      } catch (_) {}
    },
    setRoute: function setRoute(route) {
      window.__taagerActiveRoute = route;
      addBreadcrumb({ category: "navigation", message: route, level: "info" });
      try {
        window.monitoring.setContext("ui", {
          activeRoute: route,
          language: window._kbotLang || "",
          theme: window._kbotTheme || "",
        });
        window.monitoring.setTag("route", route);
      } catch (_) {}
    },
    setUiContext: function setUiContext(context) {
      try {
        window.monitoring.setContext("ui", context || {});
      } catch (_) {}
    },
    instrumentAsync: async function instrumentAsync(name, operation, fn, context) {
      const startedAt = Date.now();
      addBreadcrumb({ category: operation || "async", message: name + ":start", level: "info", data: context || {} });
      try {
        return await fn();
      } catch (err) {
        captureException(err, {
          operation: operation || "async",
          name,
          durationMs: Date.now() - startedAt,
          ...(context || {}),
        });
        throw err;
      } finally {
        addBreadcrumb({
          category: operation || "async",
          message: name + ":finish",
          level: "info",
          data: { durationMs: Date.now() - startedAt },
        });
      }
    },
    createReactErrorBoundary: function createReactErrorBoundary(React) {
      if (!React || !React.Component) return null;
      return class TaagerSentryErrorBoundary extends React.Component {
        constructor(props) {
          super(props);
          this.state = { hasError: false };
        }
        static getDerivedStateFromError() {
          return { hasError: true };
        }
        componentDidCatch(error, info) {
          captureException(error, {
            operation: "react.error-boundary",
            componentStack: info && info.componentStack,
          });
        }
        render() {
          if (this.state.hasError) return this.props.fallback || null;
          return this.props.children;
        }
      };
    },
  };
})();
