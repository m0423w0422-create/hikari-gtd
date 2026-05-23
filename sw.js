const CACHE = "gtd-v7";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./","./index.html"])).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
  // 定期チェックを登録
  self.registration.periodicSync && self.registration.periodicSync.register("reminder-check",{minInterval: 60000}).catch(()=>{});
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(c => c || fetch(e.request).catch(()=>caches.match("./index.html")))
  );
});

// ── 通知チェック関数 ────────────────────────────────────────────
function checkAndNotify() {
  const nowDate = new Date().toISOString().slice(0,10);
  const nowHour = new Date().getHours();
  const nowMin  = new Date().getMinutes();

  // localStorageからタスクを読み込む
  let tasks = [];
  try { tasks = JSON.parse(self.localStorage && self.localStorage.getItem("gtd_tasks") || "[]"); } catch(e){}

  // IndexedDBから読む（localStorageはSWから使えないため）
  return self.clients.matchAll().then(clients => {
    // クライアント（アプリ画面）に問い合わせ
    if(clients.length > 0) {
      clients[0].postMessage({type:"CHECK_REMINDERS"});
    }
  });
}

// アプリからのメッセージ受信
self.addEventListener("message", e => {
  // アプリからの通知表示リクエスト
  if(e.data && e.data.type==="SHOW_NOTIFICATION") {
    e.waitUntil(
      self.registration.showNotification(e.data.title||"🔔 リマインダー", {
        body: e.data.body||"",
        icon: "./icon.png",
        badge: "./icon.png",
        tag: e.data.tag||"gtd-reminder",
        requireInteraction: true,
        vibrate: [200, 100, 200],
        data: { url: "./" },
      })
    );
  }

  // タスクデータを受け取って通知チェック
  if(e.data && e.data.type==="REMINDER_DATA") {
    const tasks = e.data.tasks || [];
    const nowDate = new Date().toISOString().slice(0,10);
    const nowHour = new Date().getHours();
    const nowMin  = new Date().getMinutes();

    tasks.forEach(t => {
      // 通常リマインダー
      if(t.reminderSet && t.reminderDate && !t.done) {
        if(t.reminderDate === nowDate &&
           t.reminderHour === nowHour &&
           t.reminderMin  === nowMin) {
          const key = "nf_"+t.id+"_"+nowDate+"_"+nowHour+"_"+nowMin;
          // クライアントに発火済みか確認してから通知
          self.registration.showNotification("🔔 " + t.text, {
            body: t.reminderDate + " " + String(t.reminderHour).padStart(2,"0") + ":" + String(t.reminderMin).padStart(2,"0"),
            icon: "./icon.png",
            badge: "./icon.png",
            tag: "reminder_" + t.id,
            requireInteraction: true,
            vibrate: [300, 100, 300],
            data: { taskId: t.id, url: "./" },
          });
        }
      }
      // 案件のnextActionDate
      if(t.taskType === "case" && t.nextActionDate && !t.done) {
        const h = t.nextActionHour || 9;
        const m = t.nextActionMin  || 0;
        if(t.nextActionDate === nowDate && h === nowHour && m === nowMin) {
          self.registration.showNotification("📋 案件: " + t.text, {
            body: (t.nextAction || "次のアクションの時間です"),
            icon: "./icon.png",
            badge: "./icon.png",
            tag: "case_" + t.id,
            requireInteraction: true,
            vibrate: [300, 100, 300],
            data: { taskId: t.id, url: "./" },
          });
        }
      }
    });
  }
});

// Periodic Sync（対応ブラウザのみ）
self.addEventListener("periodicsync", e => {
  if(e.tag === "reminder-check") {
    e.waitUntil(checkAndNotify());
  }
});

// 通知クリックでアプリを開く
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    clients.matchAll({type:"window", includeUncontrolled:true}).then(cls => {
      const match = cls.find(c => c.url.includes("gtd"));
      if(match) return match.focus();
      return clients.openWindow(url);
    })
  );
});
