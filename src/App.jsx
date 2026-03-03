import { useState, useEffect, useCallback, useRef } from "react";

// ═══════════════════════════════════════════
//  SUPABASE CONFIG
// ═══════════════════════════════════════════

const SUPABASE_URL = "https://nwgefqvjlhtjovafxrhk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Yie9ZU8n6MWUxdeHP4clDw_MxKY3Qlc";

const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/5kQ8wP2qJ62Y3g2eWt5AQ00";
const APP_URL = "https://todo-app-beta-five-35.vercel.app";
const FREE_TASK_LIMIT = 3;

function supabase(token) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  async function query(table, { method = "GET", filters = "", body, select = "*" } = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${filters}${filters ? "&" : ""}select=${encodeURIComponent(select)}`;
    const opts = { method, headers: { ...headers } };
    if (body) opts.body = JSON.stringify(body);
    if (method === "DELETE" || method === "GET") delete opts.headers["Prefer"];
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Request failed: ${res.status}`);
    }
    if (method === "DELETE") return null;
    return res.json();
  }

  return {
    from: (table) => ({
      select: (sel = "*", filters = "") => query(table, { select: sel, filters }),
      insert: (data) => query(table, { method: "POST", body: data }),
      update: (data, filters) => query(table, { method: "PATCH", body: data, filters }),
      delete: (filters) => query(table, { method: "DELETE", filters }),
    }),
  };
}

async function supabaseAuth(action, payload) {
  const endpoints = {
    signup: "/auth/v1/signup",
    login: "/auth/v1/token?grant_type=password",
    refresh: "/auth/v1/token?grant_type=refresh_token",
    user: "/auth/v1/user",
  };
  const res = await fetch(`${SUPABASE_URL}${endpoints[action]}`, {
    method: action === "user" ? "GET" : "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      ...(payload?.token ? { Authorization: `Bearer ${payload.token}` } : {}),
    },
    body: action !== "user" ? JSON.stringify(payload.body) : undefined,
  });
  const data = await res.json();
  if (data.error || data.error_description) throw new Error(data.error_description || data.error?.message || data.msg || "Auth failed");
  return data;
}

const COLORS = {
  bg: "#12121f",
  card: "#1e1e30",
  cardHover: "#252538",
  primary: "#6C63FF",
  primaryLight: "#8B85FF",
  surface: "#2a2a40",
  surfaceLight: "#353550",
  text: "#ffffff",
  textSecondary: "#9090b0",
  textMuted: "#5a5a7a",
  red: "#ff5c5c",
  orange: "#ff8c42",
  green: "#4caf82",
  pink: "#ff6b9d",
  gold: "#FFD700",
};

// ═══════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════

export default function App() {
  const [session, setSession] = useState(null);
  const [authScreen, setAuthScreen] = useState("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const stripeSuccess = params.get("stripe_success");

      try {
        const raw = localStorage.getItem("todo-session");
        if (raw) {
          const saved = JSON.parse(raw);
          try {
            const refreshed = await supabaseAuth("refresh", { body: { refresh_token: saved.refresh_token } });
            const newSession = { access_token: refreshed.access_token, refresh_token: refreshed.refresh_token, user: refreshed.user };
            setSession(newSession);
            localStorage.setItem("todo-session", JSON.stringify(newSession));

            if (stripeSuccess === "1") {
              await upgradeToPro(newSession.access_token, newSession.user.id);
              window.history.replaceState({}, "", window.location.pathname);
            }
          } catch {
            localStorage.removeItem("todo-session");
          }
        }
      } catch {}
      setCheckingAuth(false);
    })();
  }, []);

  async function upgradeToPro(token, userId) {
    const db = supabase(token);
    try {
      const existing = await db.from("profiles").select("*", `user_id=eq.${userId}`);
      if (existing && existing.length > 0) {
        await db.from("profiles").update({ tier: "pro" }, `user_id=eq.${userId}`);
      } else {
        await db.from("profiles").insert({ user_id: userId, tier: "pro" });
      }
    } catch (e) {
      console.error("Failed to upgrade tier:", e);
    }
  }

  function saveSession(sess) {
    setSession(sess);
    try { localStorage.setItem("todo-session", JSON.stringify(sess)); } catch {}
  }

  function logout() {
    setSession(null);
    try { localStorage.removeItem("todo-session"); } catch {}
  }

  async function handleLogin(email, password) {
    setAuthLoading(true);
    setAuthError("");
    try {
      const data = await supabaseAuth("login", { body: { email, password } });
      saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
    } catch (e) {
      setAuthError(e.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignup(email, name, password) {
    setAuthLoading(true);
    setAuthError("");
    try {
      const data = await supabaseAuth("signup", { body: { email, password, data: { name } } });
      if (data.access_token) {
        saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
      } else {
        setAuthError("Check your email to confirm your account, then log in.");
        setAuthScreen("login");
      }
    } catch (e) {
      setAuthError(e.message);
    } finally {
      setAuthLoading(false);
    }
  }

  if (checkingAuth) {
    return <PhoneFrame><LoadingScreen message="Checking session..." /></PhoneFrame>;
  }

  if (!session) {
    return (
      <PhoneFrame>
        <AuthScreen screen={authScreen} setScreen={setAuthScreen} loading={authLoading} error={authError} onLogin={handleLogin} onSignup={handleSignup} />
      </PhoneFrame>
    );
  }

  return <MainApp session={session} onLogout={logout} upgradeToPro={upgradeToPro} />;
}

// ═══════════════════════════════════════════
//  MAIN APP (AUTHENTICATED)
// ═══════════════════════════════════════════

function MainApp({ session, onLogout, upgradeToPro }) {
  const db = supabase(session.access_token);
  const user = session.user;
  const userName = user?.user_metadata?.name || user?.email?.split("@")[0] || "there";

  const [screen, setScreen] = useState("home");
  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeTab, setActiveTab] = useState("All Tasks");
  const [newTask, setNewTask] = useState({ name: "", desc: "", dueDate: "", listId: "", subtasks: [] });
  const [newSubtask, setNewSubtask] = useState("");
  const [newList, setNewList] = useState({ name: "", desc: "", emoji: "📋", color: COLORS.primary });
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [slideDir, setSlideDir] = useState(null);
  const [animating, setAnimating] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [editSubtask, setEditSubtask] = useState("");
  const [userTier, setUserTier] = useState("free");
  const screenKey = useRef(0);

  const PAGE_ORDER = { home: 0, listDetail: 0.5, tasks: 1, settings: 2 };

  function navigateTo(target) {
    if (target === screen || animating) return;
    const currentIdx = PAGE_ORDER[screen] ?? 0;
    const targetIdx = PAGE_ORDER[target] ?? 0;
    setSlideDir(targetIdx > currentIdx ? "left" : "right");
    setAnimating(true);
    screenKey.current += 1;
    setScreen(target);
    setTimeout(() => { setAnimating(false); setSlideDir(null); }, 350);
  }

  const slideClass = slideDir === "left" ? "slide-from-right" : slideDir === "right" ? "slide-from-left" : "fade-in";

  function flash(status) {
    setSaveStatus(status);
    setTimeout(() => setSaveStatus("idle"), status === "error" ? 3000 : 1500);
  }

  async function fetchUserTier() {
    try {
      const profiles = await db.from("profiles").select("*", `user_id=eq.${user.id}`);
      if (profiles && profiles.length > 0) {
        setUserTier(profiles[0].tier || "free");
      } else {
        await db.from("profiles").insert({ user_id: user.id, tier: "free" });
        setUserTier("free");
      }
    } catch (e) {
      console.error("Failed to fetch tier:", e);
    }
  }

  async function fetchLists() {
    try {
      const listsData = await db.from("lists").select("*", `user_id=eq.${user.id}&order=position.asc`);
      const listIds = listsData.map(l => l.id);
      let tasksData = [];
      let subtasksData = [];

      if (listIds.length > 0) {
        tasksData = await db.from("tasks").select("*", `list_id=in.(${listIds.join(",")})&order=position.asc`);
        const tIds = tasksData.map(t => t.id);
        if (tIds.length > 0) {
          subtasksData = await db.from("subtasks").select("*", `task_id=in.(${tIds.join(",")})&order=position.asc`);
        }
      }

      const assembled = listsData.map(l => ({
        ...l,
        desc: l.description,
        tasks: tasksData
          .filter(t => t.list_id === l.id)
          .map(t => ({
            ...t,
            desc: t.description,
            dueDate: t.due_date,
            subtasks: subtasksData.filter(s => s.task_id === t.id),
          })),
      }));

      setLists(assembled);
    } catch (e) {
      console.error("Failed to load lists:", e);
    }
  }

  useEffect(() => {
    (async () => {
      await Promise.all([fetchLists(), fetchUserTier()]);
      setIsLoading(false);
    })();
  }, []);

  const allTasks = lists.flatMap((l) => l.tasks.map((t) => ({ ...t, listName: l.name, listColor: l.color, listId: l.id })));
  const totalTaskCount = allTasks.length;
  const isPro = userTier === "pro";
  const isAtLimit = !isPro && totalTaskCount >= FREE_TASK_LIMIT;

  const dueTodayCount = allTasks.filter((t) => !t.done && (t.dueDate?.includes("Today") || t.dueDate === "Tomorrow")).length;
  const overdueCount = allTasks.filter((t) => t.overdue && !t.done).length;

  const notifications = [
    ...allTasks.filter(t => t.overdue && !t.done).map(t => ({ id: `o-${t.id}`, type: "overdue", message: `${t.name} is overdue`, list: t.listName })),
    ...allTasks.filter(t => !t.done && t.dueDate?.includes("Today")).map(t => ({ id: `d-${t.id}`, type: "due", message: `${t.name} due ${t.dueDate}`, list: t.listName })),
  ];

  function handleUpgradeClick() {
    const successUrl = `${APP_URL}?stripe_success=1`;
    window.open(`${STRIPE_PAYMENT_LINK}?success_url=${encodeURIComponent(successUrl)}`, "_blank");
  }

  async function toggleTask(listId, taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    setLists(prev => prev.map(l => l.id === listId ? { ...l, tasks: l.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) } : l));
    try {
      await db.from("tasks").update({ done: !task.done }, `id=eq.${taskId}`);
      flash("saved");
    } catch { flash("error"); await fetchLists(); }
  }

  async function toggleSubtask(listId, taskId, subId) {
    const task = allTasks.find(t => t.id === taskId);
    const sub = task?.subtasks.find(s => s.id === subId);
    if (!sub) return;
    setLists(prev => prev.map(l => l.id === listId ? { ...l, tasks: l.tasks.map(t => t.id === taskId ? { ...t, subtasks: t.subtasks.map(s => s.id === subId ? { ...s, done: !s.done } : s) } : t) } : l));
    try {
      await db.from("subtasks").update({ done: !sub.done }, `id=eq.${subId}`);
      flash("saved");
    } catch { flash("error"); await fetchLists(); }
  }

  async function addSubtaskToTask(listId, taskId, subName) {
    const tempId = `temp-${Date.now()}`;
    setLists(prev => prev.map(l => l.id === listId ? { ...l, tasks: l.tasks.map(t => t.id === taskId ? { ...t, subtasks: [...t.subtasks, { id: tempId, name: subName, done: false }] } : t) } : l));
    try {
      const task = allTasks.find(t => t.id === taskId);
      await db.from("subtasks").insert({ task_id: taskId, name: subName, position: task?.subtasks?.length || 0 });
      flash("saved");
      await fetchLists();
    } catch { flash("error"); await fetchLists(); }
  }

  async function deleteTask(listId, taskId) {
    setLists(prev => prev.map(l => l.id === listId ? { ...l, tasks: l.tasks.filter(t => t.id !== taskId) } : l));
    try {
      await db.from("subtasks").delete(`task_id=eq.${taskId}`);
      await db.from("tasks").delete(`id=eq.${taskId}`);
      flash("saved");
    } catch { flash("error"); await fetchLists(); }
  }

  async function deleteList(listId) {
    setLists(prev => prev.filter(l => l.id !== listId));
    navigateTo("home");
    try {
      const tasks = allTasks.filter(t => t.listId === listId);
      for (const t of tasks) {
        await db.from("subtasks").delete(`task_id=eq.${t.id}`);
      }
      if (tasks.length) await db.from("tasks").delete(`list_id=eq.${listId}`);
      await db.from("lists").delete(`id=eq.${listId}`);
      flash("saved");
    } catch { flash("error"); await fetchLists(); }
  }

  async function addTask() {
    if (!newTask.name.trim()) return;
    if (isAtLimit) { setShowCreateTask(false); return; }
    const targetListId = newTask.listId || lists[0]?.id;
    if (!targetListId) return;
    setShowCreateTask(false);
    flash("saving");
    try {
      const taskCount = lists.find(l => l.id === targetListId)?.tasks.length || 0;
      const [created] = await db.from("tasks").insert({
        list_id: targetListId,
        name: newTask.name.trim(),
        description: newTask.desc,
        due_date: newTask.dueDate || null,
        priority: "medium",
        position: taskCount,
      });
      if (newTask.subtasks.length > 0 && created) {
        for (let i = 0; i < newTask.subtasks.length; i++) {
          await db.from("subtasks").insert({ task_id: created.id, name: newTask.subtasks[i].name, position: i });
        }
      }
      setNewTask({ name: "", desc: "", dueDate: "", listId: lists[0]?.id || "", subtasks: [] });
      await fetchLists();
      flash("saved");
    } catch (e) { console.error(e); flash("error"); }
  }

  async function addList() {
    if (!newList.name.trim()) return;
    setShowCreateList(false);
    flash("saving");
    try {
      await db.from("lists").insert({
        user_id: user.id,
        name: newList.name.trim(),
        emoji: newList.emoji,
        color: newList.color,
        description: newList.desc,
        position: lists.length,
      });
      setNewList({ name: "", desc: "", emoji: "📋", color: COLORS.primary });
      await fetchLists();
      flash("saved");
    } catch (e) { console.error(e); flash("error"); }
  }

  function addSubtaskToForm() {
    if (!newSubtask.trim()) return;
    setNewTask(prev => ({ ...prev, subtasks: [...prev.subtasks, { id: Date.now(), name: newSubtask, done: false }] }));
    setNewSubtask("");
  }

  function openEditTask(listId, task) {
    setEditTask({ listId, task: { ...task, subtasks: task.subtasks.map(s => ({ ...s })) } });
    setEditSubtask("");
  }

  async function saveEditTask() {
    if (!editTask || !editTask.task.name.trim()) return;
    const { listId: origListId, task: t } = editTask;
    const targetListId = t.moveToListId || origListId;
    setEditTask(null);
    flash("saving");
    try {
      const updateData = { name: t.name.trim(), description: t.desc || "", done: t.done, due_date: t.dueDate || null, priority: t.priority };
      if (targetListId !== origListId) updateData.list_id = targetListId;
      await db.from("tasks").update(updateData, `id=eq.${t.id}`);

      const origTask = lists.flatMap(l => l.tasks).find(tt => tt.id === t.id);
      const origSubs = origTask?.subtasks || [];
      const editSubs = t.subtasks;

      for (const os of origSubs) {
        if (!editSubs.find(es => es.id === os.id)) {
          await db.from("subtasks").delete(`id=eq.${os.id}`);
        }
      }
      for (let i = 0; i < editSubs.length; i++) {
        const es = editSubs[i];
        if (String(es.id).startsWith("temp-") || !origSubs.find(os => os.id === es.id)) {
          await db.from("subtasks").insert({ task_id: t.id, name: es.name, done: es.done, position: i });
        } else {
          const orig = origSubs.find(os => os.id === es.id);
          if (orig && (orig.done !== es.done || orig.name !== es.name)) {
            await db.from("subtasks").update({ name: es.name, done: es.done, position: i }, `id=eq.${es.id}`);
          }
        }
      }
      await fetchLists();
      flash("saved");
    } catch (e) { console.error(e); flash("error"); await fetchLists(); }
  }

  async function deleteTaskFromEdit() {
    if (!editTask) return;
    const { listId, task } = editTask;
    setEditTask(null);
    await deleteTask(listId, task.id);
  }

  function addEditSubtask() {
    if (!editSubtask.trim()) return;
    setEditTask(prev => ({ ...prev, task: { ...prev.task, subtasks: [...prev.task.subtasks, { id: `temp-${Date.now()}`, name: editSubtask, done: false }] } }));
    setEditSubtask("");
  }
  function removeEditSubtask(subId) {
    setEditTask(prev => ({ ...prev, task: { ...prev.task, subtasks: prev.task.subtasks.filter(s => s.id !== subId) } }));
  }
  function toggleEditSubtask(subId) {
    setEditTask(prev => ({ ...prev, task: { ...prev.task, subtasks: prev.task.subtasks.map(s => s.id === subId ? { ...s, done: !s.done } : s) } }));
  }

  async function handleClearCompleted() {
    flash("saving");
    try {
      const doneTasks = allTasks.filter(t => t.done);
      for (const t of doneTasks) {
        await db.from("subtasks").delete(`task_id=eq.${t.id}`);
        await db.from("tasks").delete(`id=eq.${t.id}`);
      }
      await fetchLists();
      flash("saved");
    } catch { flash("error"); }
  }

  async function resetAllData() {
    flash("saving");
    try {
      for (const l of lists) {
        for (const t of l.tasks) {
          await db.from("subtasks").delete(`task_id=eq.${t.id}`);
        }
        await db.from("tasks").delete(`list_id=eq.${l.id}`);
        await db.from("lists").delete(`id=eq.${l.id}`);
      }
      await fetchLists();
      setShowResetConfirm(false);
      flash("saved");
    } catch { flash("error"); }
  }

  const currentList = lists.find(l => l.id === activeList);
  const filteredTasks = currentList?.tasks.filter(t => {
    if (activeTab === "All Tasks") return true;
    if (activeTab === "Incomplete") return !t.done;
    if (activeTab === "Completed") return t.done;
    return true;
  });

  const emojiOptions = ["📋", "💼", "🎯", "🏠", "💪", "📚", "🛒", "✈️", "💡", "🎨"];
  const colorOptions = [COLORS.primary, COLORS.pink, COLORS.green, COLORS.orange, COLORS.red, "#00bcd4", "#ff9800", "#9c27b0"];

  if (isLoading) return <PhoneFrame><LoadingScreen message="Loading your tasks..." /></PhoneFrame>;

  return (
    <PhoneFrame>
      <GlobalStyles />

      {/* ── UPGRADE BANNER ── */}
      {isAtLimit && screen !== "settings" && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 40,
          background: "linear-gradient(90deg, #6C63FF, #ff6b9d)",
          padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderRadius: "40px 40px 0 0",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <div>
              <div style={{ color: "white", fontWeight: 700, fontSize: 12 }}>Free limit reached (3 tasks)</div>
              <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 11 }}>Upgrade for unlimited tasks</div>
            </div>
          </div>
          <button onClick={handleUpgradeClick} style={{
            background: "white", color: COLORS.primary, border: "none",
            borderRadius: 20, padding: "6px 14px", fontWeight: 800, fontSize: 12, cursor: "pointer",
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            Go Pro · $2
          </button>
        </div>
      )}

      {saveStatus !== "idle" && (
        <div className="save-indicator" style={{ position: "absolute", top: isAtLimit ? 52 : 28, left: "50%", transform: "translateX(-50%)", zIndex: 50, background: saveStatus === "error" ? COLORS.red + "cc" : saveStatus === "saved" ? COLORS.green + "cc" : COLORS.surface + "ee", padding: "5px 14px", borderRadius: 20, display: "flex", alignItems: "center", gap: 6, backdropFilter: "blur(8px)" }}>
          <span style={{ fontSize: 11 }}>{saveStatus === "saving" ? "💾" : saveStatus === "saved" ? "✓" : "⚠"}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.text }}>{saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save failed"}</span>
        </div>
      )}

      {/* ── HOME ── */}
      {screen === "home" && !showNotifications && (
        <div className={slideClass} key={screenKey.current + '-page'} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: `${isAtLimit ? 72 : 56}px 20px 12px` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: COLORS.green, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: "white" }}>{userName[0]?.toUpperCase()}</div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.text }}>Hello, {userName}!</div>
                    {isPro && (
                      <span style={{ background: "linear-gradient(90deg, #6C63FF, #ff6b9d)", color: "white", fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5 }}>PRO</span>
                    )}
                  </div>
                  <div style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 2 }}>Ready to conquer the day? 🚀</div>
                </div>
              </div>
              <button onClick={() => setShowNotifications(true)} style={{ background: COLORS.surface, border: "none", borderRadius: 12, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor: "pointer" }}>
                🔔
                {notifications.length > 0 && <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, background: COLORS.red, borderRadius: "50%" }} />}
              </button>
            </div>

            {/* Free tier task counter */}
            {!isPro && (
              <div style={{ background: COLORS.surface, borderRadius: 14, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, fontWeight: 600 }}>Free plan · {totalTaskCount}/{FREE_TASK_LIMIT} tasks</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width: 28, height: 6, borderRadius: 4, background: i < totalTaskCount ? COLORS.primary : COLORS.surfaceLight }} />
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <div style={{ background: "linear-gradient(135deg, #2a2a50, #1e1e38)", borderRadius: 16, padding: "16px 20px" }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: COLORS.primary }}>{dueTodayCount}</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 4 }}>Due Today 📅</div>
              </div>
              <div style={{ background: "linear-gradient(135deg, #2a2020, #1e1e30)", borderRadius: 16, padding: "16px 20px" }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: COLORS.orange }}>{overdueCount}</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 4 }}>Overdue 🔴</div>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 17, color: COLORS.text, marginBottom: 14 }}>Priority Focus</div>
              <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
                {allTasks.filter(t => !t.done && t.priority === "high").slice(0, 3).map(t => (
                  <div key={t.id} className="card slide-up" style={{ minWidth: 200, flexShrink: 0, borderRadius: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.primary, background: COLORS.surface, padding: "3px 8px", borderRadius: 6, textTransform: "uppercase" }}>{t.listName}</span>
                      <span className="priority-badge" style={{ background: "#ff5c5c22", color: COLORS.red }}>High</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text, marginBottom: 6 }}>{t.name}</div>
                    <span style={{ fontSize: 12, color: t.overdue ? COLORS.red : COLORS.textSecondary }}>🕐 {t.dueDate || "No date"}</span>
                  </div>
                ))}
                {allTasks.filter(t => !t.done && t.priority === "high").length === 0 && (
                  <div style={{ color: COLORS.textMuted, fontSize: 13, padding: 12 }}>No high priority tasks 🎉</div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 17, color: COLORS.text }}>My Lists</div>
                <button onClick={() => setShowCreateList(true)} style={{ background: COLORS.surface, border: "none", borderRadius: 10, padding: "6px 14px", color: COLORS.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New List</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {lists.map(list => {
                  const remaining = list.tasks.filter(t => !t.done).length;
                  const total = list.tasks.length;
                  const pct = total ? Math.round(((total - remaining) / total) * 100) : 0;
                  return (
                    <div key={list.id} className="card" style={{ cursor: "pointer", borderRadius: 16 }} onClick={() => { setActiveList(list.id); navigateTo("listDetail"); setActiveTab("All Tasks"); }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <div style={{ width: 42, height: 42, borderRadius: 12, background: list.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{list.emoji}</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>{list.name}</div>
                          <div style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{remaining} tasks remaining</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <div style={{ fontSize: 12, color: COLORS.textMuted }}>Progress</div>
                          <div style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>{pct}%</div>
                        </div>
                        <div style={{ height: 5, background: COLORS.surface, borderRadius: 10 }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: list.color, borderRadius: 10, transition: "width 0.5s ease" }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {lists.length === 0 && (
                  <div style={{ textAlign: "center", padding: 32, color: COLORS.textMuted }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📝</div>
                    <div style={{ fontWeight: 600 }}>No lists yet</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Create your first list to get started!</div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <BottomNav screen={screen} navigateTo={navigateTo} colors={COLORS} />
        </div>
      )}

      {/* ── NOTIFICATIONS ── */}
      {screen === "home" && showNotifications && (
        <div className={slideClass} key={screenKey.current + '-page'} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "56px 20px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
              <button onClick={() => setShowNotifications(false)} style={{ background: COLORS.surface, border: "none", borderRadius: 12, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, color: COLORS.text }}>←</button>
              <div style={{ fontWeight: 800, fontSize: 22, color: COLORS.text }}>Notifications</div>
            </div>
            {notifications.length === 0 && <div style={{ textAlign: "center", padding: 40, color: COLORS.textMuted }}><div style={{ fontSize: 36, marginBottom: 8 }}>✨</div><div style={{ fontWeight: 600 }}>All clear!</div></div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {notifications.map(n => (
                <div key={n.id} className="card" style={{ borderRadius: 16, display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: n.type === "overdue" ? COLORS.red + "22" : COLORS.primary + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{n.type === "overdue" ? "⚠️" : "📋"}</div>
                  <div><div style={{ fontWeight: 600, fontSize: 14, color: COLORS.text, marginBottom: 4 }}>{n.message}</div><span style={{ fontSize: 12, color: COLORS.primary }}>{n.list}</span></div>
                </div>
              ))}
            </div>
          </div>
          <BottomNav screen={screen} navigateTo={navigateTo} colors={COLORS} />
        </div>
      )}

      {/* ── LIST DETAIL ── */}
      {screen === "listDetail" && currentList && (
        <div className={slideClass} key={screenKey.current + '-page'} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ background: "linear-gradient(160deg, #4a3fff, #6C63FF)", padding: `${isAtLimit ? 72 : 56}px 20px 24px`, borderRadius: "0 0 28px 28px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.07)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <button onClick={() => navigateTo("home")} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 12, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 16, cursor: "pointer" }}>←</button>
              <button onClick={() => deleteList(currentList.id)} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 12, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>🗑️</button>
            </div>
            <div style={{ fontWeight: 800, fontSize: 28, color: "white", marginBottom: 6 }}>{currentList.name}</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginBottom: 16 }}>{currentList.desc}</div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ height: 6, flex: 1, background: "rgba(255,255,255,0.2)", borderRadius: 10 }}>
                <div style={{ height: "100%", width: `${currentList.tasks.length ? Math.round((currentList.tasks.filter(t=>t.done).length/currentList.tasks.length)*100) : 0}%`, background: "white", borderRadius: 10 }} />
              </div>
              <span style={{ color: "white", fontSize: 13, fontWeight: 700, marginLeft: 12 }}>{currentList.tasks.length ? Math.round((currentList.tasks.filter(t=>t.done).length/currentList.tasks.length)*100) : 0}%</span>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, background: COLORS.surface, padding: 4, borderRadius: 16 }}>
              {["All Tasks", "Incomplete", "Completed"].map(tab => (<button key={tab} className={`tab-btn ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)} style={{ flex: 1 }}>{tab}</button>))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 17, color: COLORS.text }}>Tasks</div>
              <button
                onClick={() => {
                  if (isAtLimit) { handleUpgradeClick(); return; }
                  setShowCreateTask(true);
                  setNewTask(p => ({ ...p, listId: currentList.id }));
                }}
                style={{ background: "none", border: `1.5px dashed ${isAtLimit ? COLORS.orange : COLORS.primary}`, borderRadius: 10, padding: "6px 14px", color: isAtLimit ? COLORS.orange : COLORS.primary, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                {isAtLimit ? "⚡ Upgrade to Add" : "+ Add Task"}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredTasks?.map(task => (<TaskCard key={task.id} task={task} listId={currentList.id} onToggle={toggleTask} onToggleSub={toggleSubtask} onDelete={deleteTask} onEdit={openEditTask} onAddSubtask={addSubtaskToTask} colors={COLORS} />))}
              {filteredTasks?.length === 0 && (<div style={{ textAlign: "center", padding: "40px 20px", color: COLORS.textMuted }}><div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div><div style={{ fontWeight: 600 }}>All clear!</div></div>)}
            </div>
          </div>
          <BottomNav screen={screen} navigateTo={navigateTo} colors={COLORS} />
        </div>
      )}

      {/* ── ALL TASKS ── */}
      {screen === "tasks" && (
        <div className={slideClass} key={screenKey.current + '-page'} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: `${isAtLimit ? 72 : 56}px 20px 12px` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div style={{ fontWeight: 800, fontSize: 24, color: COLORS.text }}>All Tasks</div>
              <button
                onClick={() => { if (isAtLimit) { handleUpgradeClick(); return; } setShowCreateTask(true); }}
                style={{ background: isAtLimit ? COLORS.orange + "22" : COLORS.primary, border: "none", borderRadius: 12, padding: "8px 16px", color: isAtLimit ? COLORS.orange : "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                {isAtLimit ? "⚡ Upgrade" : "+ New Task"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, background: COLORS.surface, padding: 4, borderRadius: 16 }}>
              {["All Tasks", "Incomplete", "Completed"].map(tab => (<button key={tab} className={`tab-btn ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)} style={{ flex: 1 }}>{tab}</button>))}
            </div>
            {lists.map(list => {
              const tasks = list.tasks.filter(t => { if (activeTab === "Incomplete") return !t.done; if (activeTab === "Completed") return t.done; return true; });
              if (!tasks.length) return null;
              return (
                <div key={list.id} style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: list.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{list.emoji}</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>{list.name}</div>
                    <div style={{ marginLeft: "auto", fontSize: 12, color: COLORS.textMuted }}>{tasks.filter(t => !t.done).length} left</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {tasks.map(task => (<TaskCard key={task.id} task={task} listId={list.id} onToggle={toggleTask} onToggleSub={toggleSubtask} onDelete={deleteTask} onEdit={openEditTask} onAddSubtask={addSubtaskToTask} colors={COLORS} compact />))}
                  </div>
                </div>
              );
            })}
          </div>
          <BottomNav screen={screen} navigateTo={navigateTo} colors={COLORS} />
        </div>
      )}

      {/* ── SETTINGS ── */}
      {screen === "settings" && (
        <div className={slideClass} key={screenKey.current + '-page'} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "56px 20px 12px" }}>
            <div style={{ fontWeight: 800, fontSize: 24, color: COLORS.text, marginBottom: 28 }}>Settings</div>

            <div style={{ background: "linear-gradient(135deg, #4a3fff22, #6C63FF11)", border: `1px solid ${COLORS.primary}33`, borderRadius: 20, padding: 20, marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: COLORS.green, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22, color: "white" }}>{userName[0]?.toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.text }}>{userName}</div>
                  {isPro && <span style={{ background: "linear-gradient(90deg, #6C63FF, #ff6b9d)", color: "white", fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 20, textTransform: "uppercase" }}>PRO</span>}
                </div>
                <div style={{ color: COLORS.textSecondary, fontSize: 13 }}>{user?.email}</div>
                <div style={{ marginTop: 6 }}><span style={{ color: COLORS.textMuted, fontSize: 11 }}>{allTasks.length} tasks across {lists.length} lists</span></div>
              </div>
            </div>

            {/* ── PLAN & BILLING ── */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Plan & Billing</div>
              {isPro ? (
                <div style={{ background: "linear-gradient(135deg, #6C63FF18, #ff6b9d12)", border: `1px solid ${COLORS.primary}44`, borderRadius: 18, padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #6C63FF, #ff6b9d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⚡</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.text }}>Pro Plan</div>
                      <div style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 2 }}>Unlimited tasks · $2 one-time</div>
                    </div>
                    <div style={{ background: COLORS.green + "22", color: COLORS.green, fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 20 }}>Active ✓</div>
                  </div>
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.primary}22` }}>
                    <div style={{ color: COLORS.textMuted, fontSize: 12 }}>✓ Unlimited tasks &nbsp;·&nbsp; ✓ Unlimited subtasks &nbsp;·&nbsp; ✓ All features</div>
                  </div>
                </div>
              ) : (
                <div style={{ background: COLORS.card, borderRadius: 18, overflow: "hidden" }}>
                  <div style={{ padding: "16px 18px", borderBottom: `1px solid ${COLORS.surface}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: COLORS.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🆓</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15, color: COLORS.text }}>Free Plan</div>
                          <div style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 1 }}>{totalTaskCount}/{FREE_TASK_LIMIT} tasks used</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[0,1,2].map(i => (
                          <div key={i} style={{ width: 20, height: 5, borderRadius: 3, background: i < totalTaskCount ? COLORS.primary : COLORS.surfaceLight }} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: 18 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #6C63FF, #ff6b9d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>⚡</div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.text }}>Upgrade to Pro</div>
                        <div style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 3, lineHeight: 1.5 }}>Unlock unlimited tasks for just $2. One-time payment, yours forever.</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                      {["Unlimited tasks (free plan capped at 3)", "Unlimited lists & subtasks", "All future features included"].map((feat, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 18, height: 18, borderRadius: "50%", background: COLORS.primary + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ color: COLORS.primary, fontSize: 10, fontWeight: 800 }}>✓</span>
                          </div>
                          <span style={{ color: COLORS.textSecondary, fontSize: 13 }}>{feat}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleUpgradeClick}
                      style={{ width: "100%", background: "linear-gradient(90deg, #6C63FF, #8B85FF)", color: "white", border: "none", borderRadius: 14, padding: "14px 0", fontWeight: 800, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      <span>⚡</span> Upgrade Now · $2
                    </button>
                    <div style={{ textAlign: "center", marginTop: 8, color: COLORS.textMuted, fontSize: 11 }}>Secure payment via Stripe</div>
                  </div>
                </div>
              )}
            </div>

            {[
              { title: "Data", items: [
                { icon: "🗑️", label: "Clear Completed", action: "clearCompleted" },
                { icon: "🔄", label: "Reset All Data", danger: true, action: "resetAll" },
              ]},
              { title: "Account", items: [
                { icon: "🚪", label: "Log Out", danger: true, action: "logout" },
              ]},
              { title: "About", items: [
                { icon: "☁️", label: "Backend", value: "Supabase" },
                { icon: "ℹ️", label: "Version", value: "3.1.0" },
              ]},
            ].map(section => (
              <div key={section.title} style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>{section.title}</div>
                <div style={{ background: COLORS.card, borderRadius: 18, overflow: "hidden" }}>
                  {section.items.map((item, i) => (
                    <div key={i} onClick={() => { if (item.action === "resetAll") setShowResetConfirm(true); if (item.action === "clearCompleted") handleClearCompleted(); if (item.action === "logout") onLogout(); }} style={{ display: "flex", alignItems: "center", padding: "15px 18px", borderBottom: i < section.items.length - 1 ? `1px solid ${COLORS.surface}` : "none", cursor: item.action ? "pointer" : "default" }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: COLORS.surface, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 14, fontSize: 16 }}>{item.icon}</div>
                      <div style={{ flex: 1, fontWeight: 500, fontSize: 15, color: item.danger ? COLORS.red : COLORS.text }}>{item.label}</div>
                      {item.value && <div style={{ color: COLORS.textMuted, fontSize: 13 }}>{item.value}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <BottomNav screen={screen} navigateTo={navigateTo} colors={COLORS} />
        </div>
      )}

      {/* ── CREATE TASK ── */}
      {showCreateTask && (
        <div className="overlay"><div className="sheet slide-up">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <button onClick={() => setShowCreateTask(false)} style={{ background: COLORS.surface, border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, color: COLORS.text }}>✕</button>
            <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.text }}>Create New Task</div>
            <button onClick={addTask} style={{ background: "none", border: "none", color: COLORS.primary, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Save</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Task Name</div><input className="input-field" placeholder="What needs to be done?" value={newTask.name} onChange={e => setNewTask(p => ({ ...p, name: e.target.value }))} /></div>
            <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Description</div><textarea className="input-field" placeholder="Add some notes..." rows={3} style={{ resize: "none" }} value={newTask.desc} onChange={e => setNewTask(p => ({ ...p, desc: e.target.value }))} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Due Date</div><input type="date" className="input-field" value={newTask.dueDate} onChange={e => setNewTask(p => ({ ...p, dueDate: e.target.value }))} style={{ colorScheme: "dark" }} /></div>
              <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>List</div><select className="input-field" value={newTask.listId} onChange={e => setNewTask(p => ({ ...p, listId: e.target.value }))} style={{ appearance: "none" }}>{lists.map(l => <option key={l.id} value={l.id}>{l.emoji} {l.name}</option>)}</select></div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>Subtasks</div>{newTask.subtasks.length > 0 && <span style={{ color: COLORS.primary, fontSize: 12, fontWeight: 700 }}>{newTask.subtasks.length} Added</span>}</div>
              {newTask.subtasks.map(s => (<div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${COLORS.surface}` }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.primary, flexShrink: 0 }} /><span style={{ color: COLORS.text, fontSize: 14 }}>{s.name}</span></div>))}
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}><input className="input-field" style={{ flex: 1 }} placeholder="Add a subtask..." value={newSubtask} onChange={e => setNewSubtask(e.target.value)} onKeyDown={e => e.key === "Enter" && addSubtaskToForm()} /><button onClick={addSubtaskToForm} style={{ background: COLORS.surface, border: "none", borderRadius: 12, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 20, color: COLORS.primary }}>+</button></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}><button className="btn-ghost" onClick={() => setShowCreateTask(false)}>Cancel</button><button className="btn-primary" onClick={addTask}>Create Task</button></div>
          </div>
        </div></div>
      )}

      {/* ── CREATE LIST ── */}
      {showCreateList && (
        <div className="overlay"><div className="sheet slide-up">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <button onClick={() => setShowCreateList(false)} style={{ background: COLORS.surface, border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, color: COLORS.text }}>✕</button>
            <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.text }}>New List</div>
            <button onClick={addList} style={{ background: "none", border: "none", color: COLORS.primary, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Save</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, background: COLORS.surface, borderRadius: 16, padding: 16 }}><div style={{ width: 52, height: 52, borderRadius: 14, background: newList.color + "33", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{newList.emoji}</div><div><div style={{ fontWeight: 700, fontSize: 16, color: newList.name ? COLORS.text : COLORS.textMuted }}>{newList.name || "List Name"}</div><div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>0 tasks</div></div></div>
            <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>List Name</div><input className="input-field" placeholder="e.g. Shopping, Work..." value={newList.name} onChange={e => setNewList(p => ({ ...p, name: e.target.value }))} /></div>
            <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Description</div><input className="input-field" placeholder="What is this list for?" value={newList.desc} onChange={e => setNewList(p => ({ ...p, desc: e.target.value }))} /></div>
            <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Choose Emoji</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{emojiOptions.map(em => (<button key={em} onClick={() => setNewList(p => ({ ...p, emoji: em }))} style={{ width: 44, height: 44, borderRadius: 12, background: newList.emoji === em ? COLORS.primary + "33" : COLORS.surface, border: newList.emoji === em ? `2px solid ${COLORS.primary}` : "2px solid transparent", fontSize: 22, cursor: "pointer" }}>{em}</button>))}</div></div>
            <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Color</div><div style={{ display: "flex", gap: 10 }}>{colorOptions.map(c => (<button key={c} onClick={() => setNewList(p => ({ ...p, color: c }))} style={{ width: 32, height: 32, borderRadius: "50%", background: c, border: newList.color === c ? "3px solid white" : "3px solid transparent", cursor: "pointer", boxShadow: newList.color === c ? `0 0 0 2px ${c}` : "none" }} />))}</div></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}><button className="btn-ghost" onClick={() => setShowCreateList(false)}>Cancel</button><button className="btn-primary" onClick={addList}>Create List</button></div>
          </div>
        </div></div>
      )}

      {/* ── RESET CONFIRM ── */}
      {showResetConfirm && (
        <div className="overlay" style={{ alignItems: "center", justifyContent: "center" }}><div className="slide-up" style={{ background: COLORS.card, borderRadius: 24, padding: 28, width: "85%", maxWidth: 340, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: COLORS.text, marginBottom: 8 }}>Reset All Data?</div>
          <div style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>This will permanently delete all your lists and tasks. This cannot be undone.</div>
          <div style={{ display: "flex", gap: 12 }}><button className="btn-ghost" onClick={() => setShowResetConfirm(false)} style={{ flex: 1, background: COLORS.surface }}>Cancel</button><button onClick={resetAllData} style={{ flex: 1, background: COLORS.red, color: "white", padding: "14px 28px", borderRadius: 14, fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer" }}>Reset</button></div>
        </div></div>
      )}

      {/* ── EDIT TASK ── */}
      {editTask && (
        <div className="overlay"><div className="sheet slide-up" style={{ maxHeight: "92%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <button onClick={() => setEditTask(null)} style={{ background: COLORS.surface, border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, color: COLORS.text }}>✕</button>
            <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.text, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{editTask.task.name || "Edit Task"}</div>
            <button onClick={saveEditTask} style={{ background: "none", border: "none", color: COLORS.primary, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Save</button>
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div onClick={() => setEditTask(p => ({ ...p, task: { ...p.task, done: !p.task.done } }))} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 20, background: editTask.task.done ? COLORS.green + "22" : COLORS.surface, cursor: "pointer" }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: editTask.task.done ? COLORS.green : "transparent", border: editTask.task.done ? "none" : `2px solid ${COLORS.surfaceLight}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{editTask.task.done && <span style={{ color: "white", fontSize: 9, fontWeight: 700 }}>✓</span>}</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: editTask.task.done ? COLORS.green : COLORS.textSecondary }}>{editTask.task.done ? "Completed" : "Mark Complete"}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Task Name</div><input className="input-field" value={editTask.task.name} onChange={e => setEditTask(p => ({ ...p, task: { ...p.task, name: e.target.value } }))} /></div>
            <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Description</div><textarea className="input-field" placeholder="Add some notes..." rows={3} style={{ resize: "none" }} value={editTask.task.desc || ""} onChange={e => setEditTask(p => ({ ...p, task: { ...p.task, desc: e.target.value } }))} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Due Date</div><input type="date" className="input-field" value={editTask.task.dueDate?.includes("-") ? editTask.task.dueDate : ""} onChange={e => setEditTask(p => ({ ...p, task: { ...p.task, dueDate: e.target.value } }))} style={{ colorScheme: "dark" }} />{editTask.task.dueDate && !editTask.task.dueDate.includes("-") && <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 4 }}>Current: {editTask.task.dueDate}</div>}</div>
              <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>List</div><select className="input-field" value={editTask.task.moveToListId || editTask.listId} onChange={e => setEditTask(p => ({ ...p, task: { ...p.task, moveToListId: e.target.value } }))} style={{ appearance: "none" }}>{lists.map(l => <option key={l.id} value={l.id}>{l.emoji} {l.name}</option>)}</select></div>
            </div>
            <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Priority</div><div style={{ display: "flex", gap: 8 }}>{["low","medium","high"].map(p => (<button key={p} onClick={() => setEditTask(prev => ({ ...prev, task: { ...prev.task, priority: p } }))} style={{ flex: 1, padding: "10px 0", borderRadius: 12, fontSize: 13, fontWeight: 700, textTransform: "capitalize", cursor: "pointer", border: "none", background: editTask.task.priority === p ? (p==="high"?COLORS.red+"22":p==="medium"?COLORS.orange+"22":COLORS.green+"22") : COLORS.surface, color: editTask.task.priority === p ? (p==="high"?COLORS.red:p==="medium"?COLORS.orange:COLORS.green) : COLORS.textMuted }}>{p}</button>))}</div></div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>Subtasks</div>{editTask.task.subtasks.length > 0 && <span style={{ color: COLORS.primary, fontSize: 12, fontWeight: 700 }}>{editTask.task.subtasks.filter(s=>s.done).length}/{editTask.task.subtasks.length}</span>}</div>
              {editTask.task.subtasks.map(s => (<div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${COLORS.surface}` }}><div className={`checkbox ${s.done?"done":""}`} style={{ width: 18, height: 18, minWidth: 18 }} onClick={() => toggleEditSubtask(s.id)}>{s.done && <span style={{ color: "white", fontSize: 10 }}>✓</span>}</div><span style={{ flex: 1, color: COLORS.text, fontSize: 14, textDecoration: s.done?"line-through":"none", opacity: s.done?0.6:1 }}>{s.name}</span><button onClick={() => removeEditSubtask(s.id)} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 14, opacity: 0.6 }}>✕</button></div>))}
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}><input className="input-field" style={{ flex: 1 }} placeholder="Add a subtask..." value={editSubtask} onChange={e => setEditSubtask(e.target.value)} onKeyDown={e => e.key === "Enter" && addEditSubtask()} /><button onClick={addEditSubtask} style={{ background: COLORS.surface, border: "none", borderRadius: 12, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 20, color: COLORS.primary }}>+</button></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              <button className="btn-primary" onClick={saveEditTask} style={{ width: "100%" }}>Save Changes</button>
              <div style={{ display: "flex", gap: 10 }}><button className="btn-ghost" onClick={() => setEditTask(null)} style={{ flex: 1 }}>Cancel</button><button onClick={deleteTaskFromEdit} style={{ flex: 1, background: COLORS.red+"18", color: COLORS.red, padding: "14px 28px", borderRadius: 14, fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer" }}>Delete Task</button></div>
            </div>
          </div>
        </div></div>
      )}
    </PhoneFrame>
  );
}

// ═══════════════════════════════════════════
//  AUTH SCREEN
// ═══════════════════════════════════════════

function AuthScreen({ screen, setScreen, loading, error, onLogin, onSignup }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 28px" }}>
      <GlobalStyles />
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <div style={{ fontWeight: 800, fontSize: 28, color: COLORS.text, marginBottom: 6 }}>{screen === "login" ? "Welcome Back" : "Create Account"}</div>
        <div style={{ color: COLORS.textSecondary, fontSize: 14 }}>{screen === "login" ? "Sign in to access your tasks" : "Get started with your todo lists"}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {screen === "signup" && (<div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Name</div><input className="input-field" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} /></div>)}
        <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Email</div><input className="input-field" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Password</div><input className="input-field" type="password" placeholder="Min 6 characters" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { screen === "login" ? onLogin(email, password) : onSignup(email, name, password); }}} /></div>
        {error && <div style={{ background: COLORS.red + "18", color: COLORS.red, padding: "10px 14px", borderRadius: 12, fontSize: 13, fontWeight: 600 }}>{error}</div>}
        <button className="btn-primary" onClick={() => screen === "login" ? onLogin(email, password) : onSignup(email, name, password)} disabled={loading} style={{ width: "100%", marginTop: 8, opacity: loading ? 0.7 : 1 }}>
          {loading ? "Please wait..." : screen === "login" ? "Sign In" : "Create Account"}
        </button>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <span style={{ color: COLORS.textMuted, fontSize: 14 }}>{screen === "login" ? "Don't have an account? " : "Already have an account? "}</span>
          <button onClick={() => setScreen(screen === "login" ? "signup" : "login")} style={{ background: "none", border: "none", color: COLORS.primary, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{screen === "login" ? "Sign Up" : "Sign In"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  SHARED COMPONENTS
// ═══════════════════════════════════════════

function PhoneFrame({ children }) {
  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
      <div style={{ width: 390, height: 844, background: COLORS.bg, borderRadius: 40, overflow: "hidden", position: "relative", boxShadow: "0 40px 100px rgba(0,0,0,0.6)", border: `1px solid ${COLORS.surface}` }}>{children}</div>
    </div>
  );
}

function LoadingScreen({ message }) {
  return (<><style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');@keyframes spin{to{transform:rotate(360deg)}}`}</style><div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}><div style={{ width: 48, height: 48, border: `3px solid ${COLORS.surface}`, borderTopColor: COLORS.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><div style={{ color: COLORS.textSecondary, fontSize: 15, fontWeight: 600 }}>{message}</div></div></>);
}

function GlobalStyles() {
  return (<style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${COLORS.surface};border-radius:4px}input,textarea{outline:none;font-family:inherit}button{cursor:pointer;font-family:inherit;border:none}
    .btn-primary{background:${COLORS.primary};color:white;padding:14px 28px;border-radius:14px;font-weight:700;font-size:15px;transition:all 0.2s}.btn-primary:hover{background:${COLORS.primaryLight};transform:translateY(-1px)}.btn-ghost{background:transparent;color:${COLORS.textSecondary};padding:14px 28px;border-radius:14px;font-weight:600;font-size:15px}
    .card{background:${COLORS.card};border-radius:18px;padding:16px;transition:background 0.2s}.card:hover{background:${COLORS.cardHover}}
    .input-field{background:${COLORS.surface};border:1.5px solid transparent;border-radius:12px;padding:13px 16px;color:${COLORS.text};font-size:14px;width:100%;transition:border-color 0.2s}.input-field:focus{border-color:${COLORS.primary}}.input-field::placeholder{color:${COLORS.textMuted}}
    .tab-btn{padding:8px 18px;border-radius:20px;font-size:13px;font-weight:600;transition:all 0.2s;background:transparent;color:${COLORS.textSecondary}}.tab-btn.active{background:${COLORS.primary};color:white}
    .nav-btn{display:flex;flex-direction:column;align-items:center;gap:4px;background:transparent;color:${COLORS.textMuted};font-size:11px;font-weight:500;flex:1;padding:8px 0;transition:color 0.2s}.nav-btn.active{color:${COLORS.primary}}
    .checkbox{width:22px;height:22px;border-radius:50%;border:2px solid ${COLORS.surfaceLight};display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;flex-shrink:0}.checkbox.done{background:${COLORS.primary};border-color:${COLORS.primary}}
    .priority-badge{padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700;text-transform:uppercase}
    .slide-up{animation:slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)}@keyframes slideUp{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}
    .fade-in{animation:fadeIn 0.25s ease}@keyframes fadeIn{from{opacity:0}to{opacity:1}}
    .slide-from-left{animation:slideFromLeft 0.35s cubic-bezier(0.25,0.46,0.45,0.94) both}.slide-from-right{animation:slideFromRight 0.35s cubic-bezier(0.25,0.46,0.45,0.94) both}
    @keyframes slideFromLeft{from{transform:translateX(-60px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideFromRight{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}
    .overlay{position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;z-index:10;backdrop-filter:blur(2px);border-radius:40px}.sheet{background:${COLORS.card};border-radius:24px 24px 0 0;padding:24px;width:100%;max-height:90%;overflow-y:auto}
    @keyframes savePulse{0%{opacity:0;transform:translateY(4px)}50%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-4px)}}.save-indicator{animation:savePulse 1.5s ease}
  `}</style>);
}

function TaskCard({ task, listId, onToggle, onToggleSub, onDelete, onEdit, onAddSubtask, colors, compact }) {
  const [expanded, setExpanded] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const subInputRef = useRef(null);
  const hasSubs = task.subtasks && task.subtasks.length > 0;
  function handleAddSub() { if (!newSubName.trim()) { setAddingSub(false); return; } onAddSubtask(listId, task.id, newSubName.trim()); setNewSubName(""); }
  function startAdd() { setAddingSub(true); if (!expanded) setExpanded(true); setTimeout(() => subInputRef.current?.focus(), 50); }

  return (
    <div style={{ background: colors.card, borderRadius: 16, padding: "14px 16px", opacity: task.done ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div className={`checkbox ${task.done?"done":""}`} onClick={() => onToggle(listId, task.id)}>{task.done && <span style={{ color: "white", fontSize: 12, fontWeight: 700 }}>✓</span>}</div>
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => onEdit(listId, task)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: colors.text, textDecoration: task.done?"line-through":"none" }}>{task.name}</div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {hasSubs && <button onClick={e => { e.stopPropagation(); setExpanded(!expanded); }} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer", fontSize: 16, padding: 0 }}>{expanded?"▲":"▼"}</button>}
              <button onClick={e => { e.stopPropagation(); onDelete(listId, task.id); }} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer", fontSize: 14, padding: "0 2px", opacity: 0.6 }}>✕</button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            {task.dueDate && <span style={{ fontSize: 12, color: task.overdue?colors.red:colors.textSecondary }}>🕐 {task.dueDate}</span>}
            {hasSubs && <span style={{ fontSize: 12, color: colors.textMuted }}>· {task.subtasks.filter(s=>s.done).length}/{task.subtasks.length}</span>}
          </div>
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, paddingLeft: 34 }}>
          {task.subtasks.map(sub => (
            <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${colors.surface}` }}>
              <div className={`checkbox ${sub.done?"done":""}`} style={{ width: 18, height: 18, minWidth: 18 }} onClick={() => onToggleSub(listId, task.id, sub.id)}>{sub.done && <span style={{ color: "white", fontSize: 10 }}>✓</span>}</div>
              <span style={{ fontSize: 13, color: colors.text, textDecoration: sub.done?"line-through":"none", opacity: sub.done?0.6:1 }}>{sub.name}</span>
            </div>
          ))}
          {addingSub ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, borderTop: `1px solid ${colors.surface}`, paddingTop: 10 }}>
              <input ref={subInputRef} value={newSubName} onChange={e => setNewSubName(e.target.value)} onKeyDown={e => { if (e.key==="Enter") handleAddSub(); if (e.key==="Escape") { setAddingSub(false); setNewSubName(""); }}} onBlur={() => { if (newSubName.trim()) handleAddSub(); else { setAddingSub(false); setNewSubName(""); }}} placeholder="Subtask name..." style={{ flex: 1, background: "transparent", border: "none", color: colors.text, fontSize: 13, padding: "4px 0", outline: "none", fontFamily: "inherit" }} />
              <button onClick={handleAddSub} style={{ background: "none", border: "none", color: colors.primary, fontWeight: 700, fontSize: 12, cursor: "pointer", padding: "4px 8px" }}>Done</button>
            </div>
          ) : (
            <div onClick={startAdd} style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, color: colors.primary, fontSize: 13, fontWeight: 600, cursor: "pointer" }}><span style={{ fontSize: 16 }}>+</span> Add Subtask</div>
          )}
        </div>
      )}
    </div>
  );
}

function BottomNav({ screen, navigateTo, colors }) {
  const tabs = [{ id: "home", label: "Home", icon: "🏠" }, { id: "tasks", label: "Tasks", icon: "✅" }, { id: "settings", label: "Settings", icon: "⚙️" }];
  return (
    <div style={{ background: colors.card, borderTop: `1px solid ${colors.surface}`, display: "flex", padding: "8px 0 20px" }}>
      {tabs.map(tab => {
        const isActive = screen === tab.id || (screen === "listDetail" && tab.id === "home");
        return (<button key={tab.id} className={`nav-btn ${isActive?"active":""}`} onClick={() => navigateTo(tab.id)} style={{ position: "relative" }}>
          {isActive && <div style={{ position: "absolute", inset: "4px 12px", background: "rgba(255,255,255,0.07)", borderRadius: 12, zIndex: 0 }} />}
          <span style={{ fontSize: 22, position: "relative", zIndex: 1 }}>{tab.icon}</span>
          <span style={{ position: "relative", zIndex: 1 }}>{tab.label}</span>
        </button>);
      })}
    </div>
  );
}
