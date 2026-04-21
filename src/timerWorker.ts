// 每秒發送一次 tick，不受瀏覽器後台節流影響
setInterval(() => {
  (self as any).postMessage({ type: "TICK", now: Date.now() });
}, 1000);