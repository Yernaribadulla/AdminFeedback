// Public identifiers only. This static dashboard cannot keep credentials secret.
export const config = Object.freeze({
  sheetId: "1ZS1EXykP93modWYpw0_6CXXpk3NIe7e9-VkTSdSFZVE",
  timeZone: "Asia/Aqtau",
  timeoutMs: 12000,
  pageSize: 30,
  sheets: {
    reviews: { gid: "0" },
    scans: { gid: "917011252" },
    clicks: { sheet: "PlatformClicks" },
  },
});
