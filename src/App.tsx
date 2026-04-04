import React, { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";

// --- Types & Interfaces ---
type ItemType = "mushroom" | "flower";
type TimerState = "green" | "blue" | "red";

interface Settings {
  mushroomCooldown: number; // in seconds
  flowerCooldown: number; // in seconds
}

// [NEW]
interface Recipe {
  name: string;
  type: ItemType;
  coordinates: string;
}

const GAS_URL =
  "https://script.google.com/macros/s/AKfycbzlyLAKNlwTGMUeTx7RY-bCfET8S2h_Ew4Q5KAvbDLb03yMU4HmH3g_-9avjVj2bfA2wg/exec";

const ENABLE_DELETE_USER = false; // 控制是否開放刪除 Sheet 的功能

interface PikminItem {
  id: string;
  type: ItemType;
  name: string;
  lat: number;
  lng: number;
  targetTime: number; // Unix timestamp (ms)
  cooldownTargetTime: number; // Unix timestamp (ms)
  state: TimerState;
  hasPlayedA: boolean;
  hasPlayedB: boolean;
}

// --- Audio Synthesizer ---
const audioCtx = new (
  window.AudioContext || (window as any).webkitAudioContext
)();

let currentOsc: OscillatorNode | null = null;
let currentTimeout: ReturnType<typeof setTimeout> | null = null;

const playTone = (type: "A" | "B"): Promise<void> => {
  stopAudio(); // 播放新音效前強制清除舊狀態
  if (audioCtx.state === "suspended") audioCtx.resume();

  return new Promise((resolve) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    currentOsc = osc;

    const cleanup = () => {
      currentOsc = null;
      resolve();
    };

    if (type === "A") {
      // 輕快提示音 (Blue) - 5秒
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(
        1760,
        audioCtx.currentTime + 0.5,
      );
      gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);
      osc.start();
      osc.stop(audioCtx.currentTime + 5);
      currentTimeout = setTimeout(cleanup, 5000);
    } else {
      // 警報音 (Red) - 20秒
      osc.type = "square";
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      // 模擬警報頻率變化
      for (let i = 0; i < 20; i++) {
        osc.frequency.setValueAtTime(660, audioCtx.currentTime + i);
        osc.frequency.setValueAtTime(440, audioCtx.currentTime + i + 0.5);
      }
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 20);
      currentTimeout = setTimeout(cleanup, 20000);
    }
  });
};

const stopAudio = () => {
  if (currentOsc) {
    try {
      currentOsc.disconnect(); // 先切斷連接，確保立即靜音
      currentOsc.stop(); // 嘗試停止 (若已預先排定 stop 會報錯，交由 catch 攔截)
    } catch (e) {
      // 忽略 InvalidStateError
    }
    currentOsc = null;
  }
  if (currentTimeout) {
    clearTimeout(currentTimeout);
    currentTimeout = null;
  }
};

// --- Main Application ---
export default function App() {
  // State
  const [items, setItems] = useState<PikminItem[]>(() => {
    const saved = localStorage.getItem("pikminItems");
    return saved ? JSON.parse(saved) : [];
  });

  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem("pikminSettings");
    return saved
      ? JSON.parse(saved)
      : { mushroomCooldown: 270, flowerCooldown: 3330 };
  });

  const [form, setForm] = useState({
    type: "mushroom" as ItemType,
    name: "",
    timeH: "",
    timeM: "",
    coordinates: "",
  });
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<string>("");
  const [newUserName, setNewUserName] = useState("");
  const [isFetchingUsers, setIsFetchingUsers] = useState(false);
  const [isFetchingRecipes, setIsFetchingRecipes] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeAlarm, setActiveAlarm] = useState<{
    id: string;
    type: "A" | "B";
  } | null>(null);

  // Refs
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [id: string]: L.Marker }>({});

  // Persistence
  useEffect(() => {
    localStorage.setItem("pikminItems", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem("pikminSettings", JSON.stringify(settings));
  }, [settings]);

  // Map Initialization (Taichung Location Default)
  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    mapInstance.current = L.map(mapContainer.current).setView(
      [24.1433, 120.6814],
      14,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(mapInstance.current);

    mapInstance.current.on("click", (e: L.LeafletMouseEvent) => {
      setForm((prev) => ({
        ...prev,
        coordinates: `${e.latlng.lat}, ${e.latlng.lng}`,
      }));
    });

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []);

  // Map Markers Sync
  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;

    // 清除舊 Markers
    Object.values(markersRef.current).forEach((marker) =>
      map.removeLayer(marker),
    );
    markersRef.current = {};

    // 建立新 Markers
    items.forEach((item) => {
      const color =
        item.state === "green"
          ? "bg-green-500"
          : item.state === "blue"
            ? "bg-blue-400"
            : "bg-red-500 hover:bg-red-600 animate-pulse";

      const emoji = item.type === "mushroom" ? "🍄" : "🌸";

      // [MODIFIED] 核心修改：利用 Tailwind 注入文字標籤
      const icon = L.divIcon({
        className: "bg-transparent overflow-visible", // 必須設定 overflow-visible，否則文字會被裁切
        html: `
          <div class="relative flex flex-col items-center pointer-events-none">
            <div class="w-5 h-5 rounded-full border-2 border-white shadow-md ${color}"></div>
            
            <div class="absolute top-5 mt-1 px-1.5 py-0.5 text-[11px] font-bold text-gray-800 bg-white/90 backdrop-blur-sm rounded shadow-sm whitespace-nowrap border border-gray-200 z-50">
              ${emoji} ${item.name}
            </div>
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10], // 確保錨點依然維持在圓點正中心
      });

      const marker = L.marker([item.lat, item.lng], { icon }).addTo(map);

      // 既然標籤已經常駐在畫面上，我們不再需要原生的 Tooltip，故將其註解或刪除
      // marker.bindTooltip(item.name, { permanent: false, direction: "top" });

      markersRef.current[item.id] = marker;
    });
  }, [items]);

  // Timer Tick Logic (1s interval)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setItems((prev) =>
        prev.map((item) => {
          let newState = item.state;
          let playA = item.hasPlayedA;
          let playB = item.hasPlayedB;

          // 判斷狀態
          if (now >= item.targetTime) {
            newState = "red";
          } else if (now >= item.cooldownTargetTime) {
            newState = "blue";
          } else {
            newState = "green";
          }

          // 觸發音效邏輯
          if (newState === "blue" && !playA) {
            playA = true;
            setActiveAlarm({ id: item.id, type: "A" });
            playTone("A").then(() => setActiveAlarm(null));
          } else if (newState === "red" && !playB) {
            playB = true;
            setActiveAlarm({ id: item.id, type: "B" });
            playTone("B").then(() => {
              // 20秒結束自動刪除
              removeItem(item.id);
              setActiveAlarm(null);
            });
          }

          return {
            ...item,
            state: newState,
            hasPlayedA: playA,
            hasPlayedB: playB,
          };
        }),
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // [INSERT] at line X (就在 // Form Handlers 註解之上)
  // Fetch Users (Sheets)
  const loadUsers = useCallback(async () => {
    if (!GAS_URL.startsWith("http")) return;
    setIsFetchingUsers(true);
    try {
      const res = await fetch(`${GAS_URL}?action=getSheets`);
      const data = await res.json();
      setUsers(data);
      // 若尚未設定當前使用者，或當前使用者不存在列表中，預設選擇第一個
      setCurrentUser((prev) => (data.includes(prev) ? prev : data[0] || ""));
    } catch (error) {
      console.error("載入配方表失敗", error);
    } finally {
      setIsFetchingUsers(false);
    }
  }, []);

  // Fetch Recipes for selected User
  const loadRecipes = useCallback(async () => {
    if (!GAS_URL.startsWith("http") || !currentUser) return;
    setIsFetchingRecipes(true);
    try {
      const res = await fetch(
        `${GAS_URL}?action=getRecipes&sheetName=${encodeURIComponent(currentUser)}`,
      );
      const data = await res.json();
      setRecipes(data);
    } catch (error) {
      console.error("載入配方失敗", error);
    } finally {
      setIsFetchingRecipes(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  // 新增使用者表單
  const handleAddUser = async () => {
    const trimmed = newUserName.trim();
    if (!trimmed) return;
    try {
      await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({ action: "createSheet", sheetName: trimmed }),
      });
      setNewUserName("");
      await loadUsers();
      setCurrentUser(trimmed);
      alert("配方表建立成功！");
    } catch (error) {
      alert("建立配方表失敗");
    }
  };

  // 刪除使用者表單
  const handleDeleteUser = async (sheetName: string) => {
    if (!confirm(`確定要刪除「${sheetName}」的所有配方嗎？此動作無法復原。`))
      return;
    try {
      await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({ action: "deleteSheet", sheetName }),
      });
      await loadUsers();
    } catch (error) {
      alert("刪除失敗");
    }
  };

  // 產生並下載 .ics 行事曆檔案
  const downloadICS = (item: PikminItem) => {
    // 格式化時間為 ICS 要求的 YYYYMMDDTHHmmssZ (UTC)
    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    const startTime = new Date(item.targetTime);
    // 設定事件長度為 5 分鐘
    const endTime = new Date(item.targetTime + 5 * 60000);

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Pikmin Timer//TW",
      "BEGIN:VEVENT",
      `UID:${item.id}@pikmintimer`,
      `DTSTAMP:${formatDate(new Date())}`,
      `DTSTART:${formatDate(startTime)}`,
      `DTEND:${formatDate(endTime)}`,
      `SUMMARY:🛑 Pikmin: ${item.name} (${item.type === "mushroom" ? "香菇" : "巨大的花"}) 時間到！`,
      `DESCRIPTION:座標: ${item.lat}, ${item.lng}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT0M", // 0分鐘前提醒 (準時)
      "ACTION:DISPLAY",
      "DESCRIPTION:Pikmin Timer Alarm",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([icsContent], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${item.name}_timer.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Form Handlers

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (audioCtx.state === "suspended") audioCtx.resume(); // 解鎖 Audio

    const h = parseInt(form.timeH) || 0;
    const m = parseInt(form.timeM) || 0;
    const inputMs = (h * 3600 + m * 60) * 1000;

    const cooldownS =
      form.type === "mushroom"
        ? settings.mushroomCooldown
        : settings.flowerCooldown;
    const cooldownMs = cooldownS * 1000;

    const now = Date.now();
    const cooldownTarget = now + inputMs;
    const target = cooldownTarget + cooldownMs;

    // 將字串座標解析為數字變數，供後續地圖使用
    const [latStr, lngStr] = form.coordinates.split(",").map((s) => s.trim());
    const targetLat = parseFloat(latStr);
    const targetLng = parseFloat(lngStr);

    const newItem: PikminItem = {
      id: crypto.randomUUID(),
      type: form.type,
      name: form.name,
      lat: targetLat,
      lng: targetLng,
      cooldownTargetTime: cooldownTarget,
      targetTime: target,
      state: "green",
      hasPlayedA: false,
      hasPlayedB: false,
    };

    setItems((prev) => [...prev, newItem]);
    setForm({ ...form, name: "", timeH: "", timeM: "" }); // 座標保留方便連續標記

    // 透過 User-Agent 偵測是否為行動裝置 (排除 PC / Mac)
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      );

    if (isMobile) {
      // 僅在手機端觸發行事曆下載
      downloadICS(newItem);
    }

    // [NEW] 核心邏輯：控制地圖視角自動平移至新座標
    if (mapInstance.current) {
      mapInstance.current.flyTo(
        [targetLat, targetLng], // 目標座標
        16, // 目標縮放層級 (Zoom Level: 16 適合檢視單一地標)
        {
          animate: true, // 開啟平滑動畫
          duration: 0.8, // 動畫持續時間 (秒)
        },
      );
    }
  };

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const handleMute = () => {
    stopAudio();
    if (activeAlarm?.type === "B") {
      removeItem(activeAlarm.id);
    }
    setActiveAlarm(null);
  };

  const isValidCoordinates = () => {
    if (!form.coordinates.includes(",")) return false;
    const parts = form.coordinates.split(",");
    return (
      parts.length === 2 &&
      !isNaN(parseFloat(parts[0])) &&
      !isNaN(parseFloat(parts[1]))
    );
  };
  const isFormValid =
    form.name && (form.timeH || form.timeM) && isValidCoordinates();
  const isRecipeValid = form.name && form.coordinates; // 儲存配方不強制需要時間

  const handleSaveRecipe = async () => {
    if (!isRecipeValid) return;
    setIsSavingRecipe(true);
    try {
      await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "saveRecipe",
          sheetName: currentUser, // 寫入對應的 Sheet
          name: form.name,
          type: form.type === "mushroom" ? "香菇" : "巨大的花",
          coordinates: form.coordinates,
        }),
      });
      await loadRecipes(); // 儲存後重新載入列表
      alert("配方已儲存！");
    } catch (error) {
      console.error("儲存失敗", error);
      alert("儲存失敗，請檢查網路狀態或 GAS 設定。");
    } finally {
      setIsSavingRecipe(false);
    }
  };

  // Format countdown string
  const formatCountdown = (targetMs: number) => {
    const diff = targetMs - Date.now();
    const isNegative = diff < 0;
    const absDiff = Math.abs(diff);
    const s = Math.floor((absDiff / 1000) % 60);
    const m = Math.floor((absDiff / 1000 / 60) % 60);
    const h = Math.floor(absDiff / 1000 / 3600);
    const sign = isNegative ? "-" : "";
    return `${sign}${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col md:flex-row font-sans bg-[url('https://image-cdn.learnin.tw/bnextmedia/image/album/2026-01/4znk-1767885210.jpg?w=900&output=webp')] bg-cover bg-center overflow-hidden">
      {/* 警報/靜音列 */}
      {activeAlarm && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[9999] bg-red-600/90 backdrop-blur text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 cursor-pointer hover:bg-red-700 transition"
          onClick={handleMute}
        >
          <span className="font-bold text-lg animate-pulse">
            🛑{" "}
            {activeAlarm.type === "A"
              ? "進入冷卻 (點擊靜音)"
              : "時間到！(點擊關閉並刪除)"}
          </span>
        </div>
      )}

      {/* 地圖區塊 (Mobile: 40vh, Desktop: Flex-1) */}
      <div className="h-[40vh] md:h-full md:flex-1 relative z-0">
        <div ref={mapContainer} className="w-full h-full" />
      </div>

      {/* 側邊欄/下方區塊 (Glassmorphism UI) */}
      <div className="h-[60vh] md:h-full w-full md:w-[400px] flex flex-col bg-white/20 backdrop-blur-md border-t md:border-l border-white/40 shadow-xl relative z-10">
        {/* Header & Settings Button */}
        <div className="px-4 py-0 flex justify-between items-center border-b border-white/20">
          <h1 className="text-lg font-bold text-gray-800 drop-shadow-sm">
            🌱 Pikmin Timer
          </h1>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="text-xl hover:scale-110 transition drop-shadow-sm"
          >
            ⚙️
          </button>
        </div>

        {/* 新增表單 */}
        <div className="shrink-0 p-2 flex flex-col gap-2 border-b border-white/20">
          {/* 雙層選擇器：配方表與配方載入 */}
          <div className="flex gap-2">
            <select
              className="w-2/5 rounded p-2 bg-blue-50 border border-blue-300 focus:outline-none text-sm text-blue-900 font-bold"
              value={currentUser}
              onChange={(e) => setCurrentUser(e.target.value)}
            >
              {isFetchingUsers ? (
                <option>讀取中...</option>
              ) : (
                users.map((u) => (
                  <option key={u} value={u}>
                    👤 {u}
                  </option>
                ))
              )}
            </select>

            <select
              className="flex-1 rounded p-2 bg-white/80 border border-purple-300 focus:outline-none text-sm text-gray-900 font-bold"
              onChange={(e) => {
                const selected = recipes.find((r) => r.name === e.target.value);

                if (selected) {
                  // 資料正規化：相容 Google Sheets 內的中文與英文格式
                  let normalizedType: ItemType = "mushroom";
                  if (
                    selected.type === "flower" ||
                    (selected.type as string) === "巨大的花"
                  ) {
                    normalizedType = "flower";
                  }

                  setForm((prev) => ({
                    ...prev,
                    type: normalizedType,
                    name: selected.name,
                    coordinates: selected.coordinates,
                  }));
                }
              }}
            >
              <option value="">
                {isFetchingRecipes
                  ? "載入配方中..."
                  : "📂 選擇已儲存的配方載入..."}
              </option>
              {recipes.map((r, idx) => {
                const isMushroom =
                  r.type === "mushroom" || (r.type as string) === "香菇";
                return (
                  <option key={idx} value={r.name}>
                    {isMushroom ? "🍄" : "🌸"} {r.name}
                  </option>
                );
              })}
            </select>
          </div>{" "}
          {/* [修正] 補上缺失的 div 結尾標籤 */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <select
                className="flex-1 rounded p-2 bg-white/60 border border-white/50 focus:outline-none text-gray-900 font-bold"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as ItemType })
                }
              >
                <option value="mushroom">🍄 香菇</option>
                <option value="flower">🌸 巨大的花</option>
              </select>
              <input
                type="text"
                placeholder="名稱 (儲存配方以此為覆蓋依據)"
                className="flex-2 w-full rounded p-2 bg-white/60 border border-white/50 focus:outline-none text-gray-900 placeholder-gray-500 font-bold"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {/* 時間與座標合併為同一行 */}
            <div className="flex gap-2 text-sm">
              <div className="flex w-2/5 gap-1">
                <input
                  type="number"
                  min="0"
                  placeholder="時"
                  className="w-1/2 rounded p-2 bg-white/60 border border-white/50 focus:outline-none text-gray-900 placeholder-gray-500 font-bold text-center"
                  value={form.timeH}
                  onChange={(e) => setForm({ ...form, timeH: e.target.value })}
                />
                <input
                  type="number"
                  min="0"
                  placeholder="分"
                  className="w-1/2 rounded p-2 bg-white/60 border border-white/50 focus:outline-none text-gray-900 placeholder-gray-500 font-bold text-center"
                  value={form.timeM}
                  onChange={(e) => setForm({ ...form, timeM: e.target.value })}
                />
              </div>
              <input
                type="text"
                placeholder="座標點擊地圖帶入"
                className="flex-1 w-3/5 rounded p-2 bg-white/60 border border-white/50 focus:outline-none text-gray-900 placeholder-gray-500 font-bold"
                value={form.coordinates}
                onChange={(e) =>
                  setForm({ ...form, coordinates: e.target.value })
                }
              />
            </div>

            {/* 操作按鈕群組 */}
            <div className="flex gap-2 mt-1">
              <button
                type="submit"
                disabled={!isFormValid}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2 rounded shadow transition"
              >
                新增倒數
              </button>
              <button
                type="button"
                onClick={handleSaveRecipe}
                disabled={!isRecipeValid || isSavingRecipe}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-2 rounded shadow transition"
              >
                {isSavingRecipe ? "儲存中..." : "💾 儲存配方"}
              </button>
            </div>
          </form>
        </div>

        {/* 倒數清單列表 */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`shrink-0 p-3 rounded-lg border relative overflow-hidden transition-colors ${
                item.state === "green"
                  ? "bg-green-50/80 border-green-200 shadow-sm"
                  : item.state === "blue"
                    ? "bg-blue-50/80 border-blue-200 shadow-sm"
                    : "bg-red-100 border-red-500 border-2 shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse"
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="font-bold text-gray-800">
                  {item.type === "mushroom" ? "🍄" : "🌸"} {item.name}
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  ✖
                </button>
              </div>
              <div className="mt-2 text-xl font-mono font-bold text-gray-700 tracking-wider">
                {formatCountdown(item.targetTime)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                狀態:{" "}
                {item.state === "green"
                  ? "一般倒數中"
                  : item.state === "blue"
                    ? "進入冷卻期"
                    : "時間到！"}
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-center text-gray-500 mt-10">尚無追蹤項目</div>
          )}
        </div>
      </div>

      {/* 設定 Modal */}
      {isSettingsOpen && (
        <div className="absolute inset-0 z-[9999] bg-black/40 flex justify-center items-center backdrop-blur-sm p-4">
          <div className="bg-white/90 rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col gap-4">
            <h2 className="text-xl font-bold border-b pb-2">
              ⚙️ 設定冷卻時間 (秒)
            </h2>
            <label className="flex flex-col gap-1 text-sm font-bold text-gray-700">
              🍄 香菇預設冷卻 (預設 270 秒 = 4分30秒)
              <input
                type="number"
                className="p-2 border rounded font-normal"
                value={settings.mushroomCooldown}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    mushroomCooldown: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold text-gray-700">
              🌸 巨大的花冷卻 (預設 3330 秒 = 55分30秒)
              <input
                type="number"
                className="p-2 border rounded font-normal"
                value={settings.flowerCooldown}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    flowerCooldown: Number(e.target.value),
                  })
                }
              />
            </label>

            {/* [補全] 配方表管理區塊 */}
            <div className="border-t border-gray-200 pt-4 mt-2">
              <h2 className="text-lg font-bold border-b pb-2 mb-3 text-gray-800">
                🧑‍🤝‍🧑 管理配方表
              </h2>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="輸入新使用者/配方表名稱..."
                  className="flex-1 p-2 border rounded font-normal text-sm focus:outline-none"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                />
                <button
                  onClick={handleAddUser}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 rounded font-bold transition shadow-sm"
                >
                  新增
                </button>
              </div>

              {ENABLE_DELETE_USER && (
                <div className="max-h-32 overflow-y-auto pr-2 flex flex-col gap-2">
                  {users.map((u) => (
                    <div
                      key={u}
                      className="flex justify-between items-center bg-gray-50 border p-2 rounded"
                    >
                      <span className="font-bold text-gray-700 text-sm">
                        {u}
                      </span>
                      <button
                        onClick={() => handleDeleteUser(u)}
                        className="text-red-500 hover:text-red-700 text-sm font-bold bg-red-50 px-2 py-1 rounded"
                      >
                        刪除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setIsSettingsOpen(false)}
              className="mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded shadow transition"
            >
              完成
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
