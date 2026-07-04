"use strict";

function normalizeAccountText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function duplicateIdentity(account) {
  const country = normalizeAccountText(account && account.taagerCountry || "sa");
  const merchantId = normalizeAccountText(account && account.taagerAffiliateCode);
  const cmsProvider = normalizeAccountText(account && account.cmsProvider || "easyorders") === "lightfunnels"
    ? "lightfunnels"
    : "easyorders";
  const easyEmail = normalizeAccountText(account && account.easyEmail);
  const easyStore = normalizeAccountText(account && account.easyStore);
  const lightfunnelsEmail = normalizeAccountText(account && account.lightfunnelsEmail);
  const lightfunnelsAccountName = normalizeAccountText(account && account.lightfunnelsAccountName);
  const cmsEmail = cmsProvider === "lightfunnels" ? lightfunnelsEmail : easyEmail;
  const cmsAccount = cmsProvider === "lightfunnels" ? lightfunnelsAccountName : easyStore;
  return {
    country,
    merchantId,
    cmsProvider,
    easyEmail,
    easyStore,
    lightfunnelsEmail,
    lightfunnelsAccountName,
    cmsEmail,
    cmsAccount,
    hasCmsIdentity: !!(cmsEmail && cmsAccount),
  };
}

function accountsAreDuplicates(left, right) {
  const a = duplicateIdentity(left);
  const b = duplicateIdentity(right);
  if (!a.merchantId || !b.merchantId) return false;
  if (a.country !== b.country || a.merchantId !== b.merchantId) return false;
  if (a.cmsProvider !== b.cmsProvider) return false;
  if (!a.hasCmsIdentity || !b.hasCmsIdentity) return true;
  return a.cmsEmail === b.cmsEmail && a.cmsAccount === b.cmsAccount;
}

function duplicatePairKey(left, right) {
  const leftId = normalizeAccountText(left && left.id);
  const rightId = normalizeAccountText(right && right.id);
  if (!leftId || !rightId || leftId === rightId) return "";
  return [leftId, rightId].sort().join("|");
}

function duplicatePairs(accounts) {
  const pairs = new Set();
  const list = Array.isArray(accounts) ? accounts : [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (!accountsAreDuplicates(list[i], list[j])) continue;
      const key = duplicatePairKey(list[i], list[j]);
      if (key) pairs.add(key);
    }
  }
  return pairs;
}

function findNewDuplicateConflict(storedAccounts, proposedAccounts) {
  const existingPairs = duplicatePairs(storedAccounts);
  const storedIds = new Set((Array.isArray(storedAccounts) ? storedAccounts : []).map(account => normalizeAccountText(account && account.id)));
  const list = Array.isArray(proposedAccounts) ? proposedAccounts : [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (!accountsAreDuplicates(list[i], list[j])) continue;
      const key = duplicatePairKey(list[i], list[j]);
      if (key && !existingPairs.has(key)) {
        const leftStored = storedIds.has(normalizeAccountText(list[i] && list[i].id));
        const rightStored = storedIds.has(normalizeAccountText(list[j] && list[j].id));
        if (leftStored && !rightStored) return { account: list[j], conflict: list[i] };
        if (rightStored && !leftStored) return { account: list[i], conflict: list[j] };
        return { account: list[i], conflict: list[j] };
      }
    }
  }
  return null;
}

module.exports = {
  accountsAreDuplicates,
  duplicateIdentity,
  findNewDuplicateConflict,
  normalizeAccountText,
};
