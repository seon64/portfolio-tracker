import { useState, useEffect, useRef } from "react";

const MEALS = ["아침", "점심", "저녁"];
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const MEAL_ICONS = { 아침: "🌅", 점심: "☀️", 저녁: "🌙" };
const MEAL_COLORS = {
  아침: { accent: "#F59E0B" },
  점심: { accent: "#3B82F6" },
  저녁: { accent: "#7C3AED" },
};

function getWeekDates(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(diff + i);
    return d;
  });
}
function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatMonthDay(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }
function isToday(d) { return formatDate(d) === formatDate(new Date()); }

// ─── Notion API (proxy through Claude artifact fetch isn't possible directly,
//     so we call Notion REST via a CORS proxy note) ───────────────────────────
// NOTE: Notion API requires CORS proxy in browser. We'll use allorigins.
async function notionRequest(token, method, path, body) {
  const url = `https://api.notion.com/v1${path}`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
      Authorization: `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API error: ${res.status} ${err}`);
  }
  return res.json();
}

async function syncToNotion(token, dbId, meals) {
  // Query existing pages to avoid duplicates
  const existing = await notionRequest(token, "POST", `/databases/${dbId}/query`, {});
  const existingMap = {};
  for (const page of existing.results) {
    const dateVal = page.properties?.날짜?.date?.start;
    if (dateVal) existingMap[dateVal] = page.id;
  }

  const entries = Object.entries(meals);
  let synced = 0;
  for (const [date, dayMeals] of entries) {
    const props = {
      날짜: { date: { start: date } },
      아침: { rich_text: [{ text: { content: dayMeals["아침"] || "" } }] },
      점심: { rich_text: [{ text: { content: dayMeals["점심"] || "" } }] },
      저녁: { rich_text: [{ text: { content: dayMeals["저녁"] || "" } }] },
    };
    if (existingMap[date]) {
      await notionRequest(token, "PATCH", `/pages/${existingMap[date]}`, { properties: props });
    } else {
      await notionRequest(token, "POST", "/pages", {
        parent: { database_id: dbId },
        properties: props,
      });
    }
    synced++;
  }
  return synced;
}

// ─── Settings Panel ────────────────────────────────────────────────────────
function SettingsPanel({ onClose, notionToken, notionDbId, onSave }) {
  const [token, setToken] = useState(notionToken || "");
  const [dbId, setDbId] = useState(notionDbId || "");
  const [showToken, setShowToken] = useState(false);

  function handleSave() {
    onSave(token.trim(), dbId.trim());
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: "linear-gradient(135deg, #1e1b4b, #1e293b)",
        borderRadius: 20, padding: 28, width: "100%", maxWidth: 440,
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>⚙️</span>
            <span style={{ fontWeight: 700, fontSize: 17, color: "#e2e8f0" }}>노션 연동 설정</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{
          background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)",
          borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#fbbf24", lineHeight: 1.6,
        }}>
          💡 노션에서 <b>Integration</b>을 만들고 토큰을 복사하세요.<br />
          데이터베이스에 <b>날짜, 아침, 점심, 저녁</b> 속성이 필요해요.<br />
          Integration을 해당 데이터베이스에 연결(Share)해야 해요.
        </div>

        <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
          노션 Integration 토큰
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            type={showToken ? "text" : "password"}
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="secret_xxxxxxxxxxxx"
            style={inputStyle}
          />
          <button onClick={() => setShowToken(s => !s)} style={{
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10, padding: "0 12px", color: "#94a3b8", fontSize: 13, cursor: "pointer",
          }}>{showToken ? "숨기기" : "보기"}</button>
        </div>

        <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
          데이터베이스 ID
        </label>
        <input
          type="text"
          value={dbId}
          onChange={e => setDbId(e.target.value)}
          placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          style={{ ...inputStyle, marginBottom: 24, width: "100%", boxSizing: "border-box" }}
        />

        <div style={{ fontSize: 11, color: "#475569", marginBottom: 20, lineHeight: 1.6 }}>
          데이터베이스 URL에서 ID를 찾을 수 있어요:<br />
          notion.so/.../<b style={{ color: "#7c3aed" }}>여기가-database-id</b>?v=...
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSave} style={{
            flex: 1, background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
            border: "none", borderRadius: 12, padding: "12px", color: "#fff",
            fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>저장</button>
          <button onClick={onClose} style={{
            flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12, padding: "12px", color: "#94a3b8",
            fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}>취소</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────
export default function MealPlanner() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [meals, setMeals] = useState({});
  const [editing, setEditing] = useState(null);
  const [inputVal, setInputVal] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [activeDay, setActiveDay] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [notionToken, setNotionToken] = useState("");
  const [notionDbId, setNotionDbId] = useState("");
  const [syncStatus, setSyncStatus] = useState(null); // null | "syncing" | "ok" | "error"
  const [syncMsg, setSyncMsg] = useState("");

  const weekDates = getWeekDates(weekOffset);

  useEffect(() => {
    async function load() {
      try {
        const r1 = await window.storage.get("meal-planner-data");
        if (r1) setMeals(JSON.parse(r1.value));
        const r2 = await window.storage.get("notion-token");
        if (r2) setNotionToken(r2.value);
        const r3 = await window.storage.get("notion-db-id");
        if (r3) setNotionDbId(r3.value);
      } catch {}
      setLoaded(true);
    }
    load();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.storage.set("meal-planner-data", JSON.stringify(meals)).catch(() => {});
  }, [meals, loaded]);

  useEffect(() => {
    const todayIdx = weekDates.findIndex(isToday);
    setActiveDay(todayIdx >= 0 ? todayIdx : 0);
  }, [weekOffset]);

  async function handleSaveSettings(token, dbId) {
    setNotionToken(token);
    setNotionDbId(dbId);
    await window.storage.set("notion-token", token).catch(() => {});
    await window.storage.set("notion-db-id", dbId).catch(() => {});
  }

  async function handleSync() {
    if (!notionToken || !notionDbId) {
      setShowSettings(true);
      return;
    }
    setSyncStatus("syncing");
    setSyncMsg("");
    try {
      const count = await syncToNotion(notionToken, notionDbId, meals);
      setSyncStatus("ok");
      setSyncMsg(`${count}개 항목 동기화 완료 ✓`);
    } catch (e) {
      setSyncStatus("error");
      setSyncMsg(e.message);
    }
    setTimeout(() => setSyncStatus(null), 4000);
  }

  function startEdit(dateKey, meal, current) {
    setEditing({ dateKey, meal });
    setInputVal(current || "");
  }

  function saveEdit() {
    if (!editing) return;
    const { dateKey, meal } = editing;
    setMeals(prev => ({
      ...prev,
      [dateKey]: { ...(prev[dateKey] || {}), [meal]: inputVal.trim() },
    }));
    setEditing(null);
    setInputVal("");
  }

  function clearMeal(dateKey, meal) {
    setMeals(prev => {
      const updated = { ...(prev[dateKey] || {}) };
      delete updated[meal];
      return { ...prev, [dateKey]: updated };
    });
  }

  const weekLabel = (() => {
    if (weekOffset === 0) return "이번 주";
    if (weekOffset === -1) return "지난 주";
    if (weekOffset === 1) return "다음 주";
    return `${weekDates[0].getMonth()+1}월 ${weekDates[0].getDate()}일 — ${weekDates[6].getMonth()+1}월 ${weekDates[6].getDate()}일`;
  })();

  const activeDateKey = activeDay !== null ? formatDate(weekDates[activeDay]) : null;
  const hasNotion = !!(notionToken && notionDbId);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0F0C29 0%, #302B63 50%, #24243E 100%)",
      fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
      color: "#fff",
    }}>
      {showSettings && (
        <SettingsPanel
          notionToken={notionToken}
          notionDbId={notionDbId}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div style={{ padding: "32px 24px 0", maxWidth: 560, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 28 }}>🍽️</span>
            <h1 style={{
              margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px",
              background: "linear-gradient(90deg, #a78bfa, #60a5fa)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>식사 계획표</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Notion sync button */}
            <button onClick={handleSync} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: hasNotion
                ? syncStatus === "ok" ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)"
                : "rgba(255,255,255,0.05)",
              border: hasNotion ? "1px solid rgba(255,255,255,0.15)" : "1px dashed rgba(255,255,255,0.2)",
              borderRadius: 10, padding: "7px 12px", color: hasNotion ? "#e2e8f0" : "#64748b",
              fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
            }}>
              <span style={{ fontSize: 14 }}>
                {syncStatus === "syncing" ? "⏳" : syncStatus === "ok" ? "✅" : syncStatus === "error" ? "❌" : "📤"}
              </span>
              {syncStatus === "syncing" ? "동기화 중..." : "노션 동기화"}
            </button>
            {/* Settings */}
            <button onClick={() => setShowSettings(true)} style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10, width: 36, height: 36, color: "#94a3b8",
              fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>⚙️</button>
          </div>
        </div>

        {/* Notion status bar */}
        {(syncMsg || !hasNotion) && (
          <div style={{
            margin: "8px 0 0",
            padding: "8px 14px",
            borderRadius: 10,
            background: syncStatus === "error"
              ? "rgba(239,68,68,0.1)"
              : syncStatus === "ok"
              ? "rgba(34,197,94,0.1)"
              : "rgba(255,255,255,0.04)",
            border: `1px solid ${syncStatus === "error" ? "rgba(239,68,68,0.25)" : syncStatus === "ok" ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)"}`,
            fontSize: 12,
            color: syncStatus === "error" ? "#fca5a5" : syncStatus === "ok" ? "#86efac" : "#475569",
          }}>
            {syncMsg || (
              <span>
                노션 미연결 — <button onClick={() => setShowSettings(true)} style={{ background: "none", border: "none", color: "#a78bfa", cursor: "pointer", fontSize: 12, padding: 0, fontWeight: 600 }}>설정에서 연결하기 →</button>
              </span>
            )}
          </div>
        )}

        <p style={{ margin: "12px 0 20px", fontSize: 13, color: "#475569" }}>하루 세 끼를 미리 계획해보세요</p>

        {/* Week Nav */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: "10px 16px",
          marginBottom: 20, border: "1px solid rgba(255,255,255,0.1)",
        }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={navBtnStyle}>‹</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#e2e8f0" }}>{weekLabel}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>
              {formatMonthDay(weekDates[0])} – {formatMonthDay(weekDates[6])}
            </div>
          </div>
          <button onClick={() => setWeekOffset(w => w + 1)} style={navBtnStyle}>›</button>
        </div>

        {/* Day Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
          {weekDates.map((d, i) => {
            const active = activeDay === i;
            const today = isToday(d);
            return (
              <button key={i} onClick={() => setActiveDay(i)} style={{
                flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center",
                padding: "8px 12px", borderRadius: 12, minWidth: 48,
                border: today ? "2px solid #a78bfa" : "2px solid transparent",
                background: active ? "linear-gradient(135deg, #7c3aed, #3b82f6)" : "rgba(255,255,255,0.06)",
                cursor: "pointer", transition: "all 0.2s",
              }}>
                <span style={{ fontSize: 11, color: active ? "#e2e8f0" : "#94a3b8", fontWeight: 600 }}>{DAYS[i]}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: active ? "#fff" : "#cbd5e1", marginTop: 2 }}>{d.getDate()}</span>
                {today && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#a78bfa", marginTop: 3 }} />}
              </button>
            );
          })}
        </div>

        {/* Meal Cards */}
        {activeDateKey && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 40 }}>
            {MEALS.map((meal) => {
              const val = meals[activeDateKey]?.[meal] || "";
              const colors = MEAL_COLORS[meal];
              const isEditing = editing?.dateKey === activeDateKey && editing?.meal === meal;

              return (
                <div key={meal} style={{
                  borderRadius: 18, background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "12px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <span style={{ fontSize: 18 }}>{MEAL_ICONS[meal]}</span>
                    <span style={{
                      fontWeight: 700, fontSize: 15,
                      background: `linear-gradient(90deg, ${colors.accent}, #fff)`,
                      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                    }}>{meal}</span>
                  </div>
                  <div style={{ padding: "12px 16px 14px" }}>
                    {isEditing ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          autoFocus value={inputVal}
                          onChange={e => setInputVal(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null); }}
                          placeholder={`${meal} 메뉴를 입력하세요`}
                          style={{ flex: 1, background: "rgba(255,255,255,0.1)", border: `1.5px solid ${colors.accent}`, borderRadius: 10, padding: "9px 13px", color: "#fff", fontSize: 14, outline: "none" }}
                        />
                        <button onClick={saveEdit} style={{ background: colors.accent, border: "none", borderRadius: 10, padding: "0 16px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>저장</button>
                        <button onClick={() => setEditing(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, padding: "0 12px", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>취소</button>
                      </div>
                    ) : val ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 15, color: "#e2e8f0", fontWeight: 500 }}>{val}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => startEdit(activeDateKey, meal, val)} style={iconBtnStyle("#3b82f6")}>✏️</button>
                          <button onClick={() => clearMeal(activeDateKey, meal)} style={iconBtnStyle("#ef4444")}>🗑️</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(activeDateKey, meal, "")} style={{
                        width: "100%", background: "rgba(255,255,255,0.04)", border: "1.5px dashed rgba(255,255,255,0.15)",
                        borderRadius: 10, padding: "12px", color: "#64748b", fontSize: 13, cursor: "pointer", textAlign: "center",
                      }}>+ {meal} 메뉴 추가</button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Day Summary */}
            <div style={{ marginTop: 4, padding: "14px 18px", borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 8, letterSpacing: "0.5px", textTransform: "uppercase" }}>오늘의 식단 요약</div>
              {MEALS.map(meal => {
                const v = meals[activeDateKey]?.[meal];
                return (
                  <div key={meal} style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 13 }}>{MEAL_ICONS[meal]}</span>
                    <span style={{ fontSize: 12, color: "#94a3b8", width: 28 }}>{meal}</span>
                    <span style={{ fontSize: 13, color: v ? "#e2e8f0" : "#334155" }}>{v || "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const navBtnStyle = {
  background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 10,
  width: 36, height: 36, color: "#e2e8f0", fontSize: 20, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};

const inputStyle = {
  flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, outline: "none",
};

function iconBtnStyle(color) {
  return {
    background: `${color}22`, border: `1px solid ${color}44`,
    borderRadius: 8, padding: "5px 8px", cursor: "pointer", fontSize: 13, lineHeight: 1,
  };
}
