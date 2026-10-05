"use strict";

function selectUsableAutomationPage(activePage, previousPage, isClosed) {
  if (activePage && !isClosed(activePage)) return activePage;
  if (previousPage && !isClosed(previousPage)) return previousPage;
  return null;
}

function canRetryCartUploadAttempt(state = {}) {
  return state.submissionMayHaveOccurred !== true;
}

function resolveCartUploadRecovery(orders, { submissionMayHaveOccurred, verificationSucceeded, confirmed = [], unconfirmed } = {}) {
  const unresolved = Array.isArray(unconfirmed) ? unconfirmed : (Array.isArray(orders) ? orders : []);
  if (submissionMayHaveOccurred === true && verificationSucceeded !== true) {
    return { confirmed: [], retry: [], manualReview: Array.isArray(orders) ? orders : [] };
  }
  if (submissionMayHaveOccurred === true) {
    return { confirmed, retry: [], manualReview: unresolved };
  }
  return { confirmed: [], retry: Array.isArray(orders) ? orders : [], manualReview: [] };
}

module.exports = {
  selectUsableAutomationPage,
  canRetryCartUploadAttempt,
  resolveCartUploadRecovery,
};
