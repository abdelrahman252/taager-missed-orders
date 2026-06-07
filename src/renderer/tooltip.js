"use strict";

window.TaagerTooltip = (() => {
  let tooltipEl = null;
  let currentTarget = null;
  let showTimeout = null;
  let hideTimeout = null;
  const tooltipId = "taager-floating-tooltip";

  function init() {
    if (tooltipEl) return;
    tooltipEl = document.createElement("div");
    tooltipEl.className = "taager-floating-tooltip";
    tooltipEl.id = tooltipId;
    tooltipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tooltipEl);

    // Event delegation
    document.body.addEventListener("mouseover", handleMouseOver, true);
    document.body.addEventListener("mouseout", handleMouseOut, true);
    document.body.addEventListener("focusin", handleMouseOver, true);
    document.body.addEventListener("focusout", handleMouseOut, true);
    document.body.addEventListener("click", handleClick, true);
    document.body.addEventListener("keydown", handleKeyDown, true);
    tooltipEl.addEventListener("mouseenter", cancelHide);
    tooltipEl.addEventListener("mouseleave", scheduleHide);
    
    // Keep visible tooltips attached to their target while the viewport moves.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition, { passive: true });
  }

  function tooltipTarget(node) {
    return node && node.closest ? node.closest("[data-tooltip],[data-tooltip-template]") : null;
  }

  function handleMouseOver(e) {
    const target = tooltipTarget(e.target);
    if (!target) return;
    if (!target.getAttribute("data-tooltip") && !target.getAttribute("data-tooltip-template")) return;
    
    currentTarget = target;
    cancelHide();
    clearTimeout(showTimeout);
    
    showTimeout = setTimeout(() => {
      show(target);
    }, 100);
  }

  function handleMouseOut(e) {
    const target = tooltipTarget(e.target);
    if (!target) return;
    
    // If moving within the same target, ignore
    if (e.type === "mouseout" && e.relatedTarget && target.contains(e.relatedTarget)) {
      return;
    }

    if (e.type === "mouseout" && e.relatedTarget && tooltipEl && tooltipEl.contains(e.relatedTarget)) {
      return;
    }

    scheduleHide();
  }

  function handleClick(e) {
    if (tooltipEl && tooltipEl.contains(e.target)) {
      cancelHide();
      return;
    }
    const target = tooltipTarget(e.target);
    if (!target) {
      hide();
      return;
    }
    if (!target.getAttribute("data-tooltip-template")) return;
    clearTimeout(showTimeout);
    if (currentTarget === target && tooltipEl && tooltipEl.classList.contains("is-visible")) return;
    currentTarget = target;
    show(target);
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") hide();
  }

  function cancelHide() {
    clearTimeout(hideTimeout);
  }

  function scheduleHide() {
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(hide, 180);
  }

  function reposition() {
    if (!currentTarget || !tooltipEl || !tooltipEl.classList.contains("is-visible")) return;
    if (!currentTarget.isConnected) {
      hide();
      return;
    }
    updatePosition(currentTarget);
  }

  function setContent(target) {
    const templateId = target.getAttribute("data-tooltip-template");
    tooltipEl.replaceChildren();
    tooltipEl.classList.toggle("is-structured", !!templateId);
    if (templateId) {
      const template = document.getElementById(templateId);
      if (!template) return false;
      if (template.content) tooltipEl.appendChild(template.content.cloneNode(true));
      else tooltipEl.appendChild(template.cloneNode(true));
      return true;
    }
    const text = target.getAttribute("data-tooltip");
    if (!text) return false;
    tooltipEl.textContent = text;
    return true;
  }

  function show(target) {
    if (!tooltipEl || !target) return;
    if (!setContent(target)) return;
    if (currentTarget && currentTarget !== target) currentTarget.removeAttribute("aria-describedby");
    currentTarget = target;
    target.setAttribute("aria-describedby", tooltipId);
    tooltipEl.classList.add("is-visible");
    
    // Reset positioning to calculate true dimensions
    tooltipEl.style.left = "0px";
    tooltipEl.style.top = "0px";
    tooltipEl.style.transform = "none";
    
    updatePosition(target);
  }

  function hide() {
    clearTimeout(showTimeout);
    clearTimeout(hideTimeout);
    if (tooltipEl) {
      tooltipEl.classList.remove("is-visible");
    }
    if (currentTarget) currentTarget.removeAttribute("aria-describedby");
    currentTarget = null;
  }

  function updatePosition(target) {
    if (!tooltipEl || !target) return;
    
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    
    const offset = 8;
    const padding = 10;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const spaceAbove = Math.max(0, targetRect.top - padding - offset);
    const spaceBelow = Math.max(0, viewportHeight - targetRect.bottom - padding - offset);
    const placeAbove = tooltipRect.height <= spaceAbove || spaceAbove > spaceBelow;
    let top = placeAbove
      ? targetRect.top - tooltipRect.height - offset
      : targetRect.bottom + offset;
    let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

    top = Math.max(padding, Math.min(top, viewportHeight - tooltipRect.height - padding));
    left = Math.max(padding, Math.min(left, viewportWidth - tooltipRect.width - padding));

    tooltipEl.classList.toggle("is-above", placeAbove);
    tooltipEl.classList.toggle("is-below", !placeAbove);
    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
  }

  // Auto-init when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return { init, hide, updatePosition };
})();
