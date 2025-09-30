// components/Navbar.js
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function Navbar() {
  const router = useRouter();
  const pathname = router.pathname;

  const isPortal =
    pathname.startsWith("/alumno") ||
    pathname.startsWith("/estudiantes") ||
    pathname.startsWith("/mis-practicas") ||
    pathname.startsWith("/docente") ||
    pathname.startsWith("/empresa");

  // Home: menú hamburguesa
  const [menuActive, setMenuActive] = useState(false);
  const toggleMenu = () => setMenuActive((s) => !s);

  // Portal: user info
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState(""); // 👈 rol
  const [userOpen, setUserOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const menuRef = useRef(null);

  const [portalMenuOpen, setPortalMenuOpen] = useState(false);
  const togglePortalMenu = () => setPortalMenuOpen((s) => !s);

  // Cargar perfil
  useEffect(() => {
    let ignore = false;
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .single();
      if (!ignore) {
        if (profile?.full_name) setUserName(profile.full_name);
        setUserEmail(user.email || "");
        setUserRole(profile?.role || "student");
      }
    };
    if (isPortal) loadUser();
    return () => { ignore = true; };
  }, [isPortal]);

  const abrirMenu = () => { setClosing(false); setUserOpen(true); };
  const cerrarMenu = () => {
    if (!userOpen && !closing) return;
    setClosing(true);
    setTimeout(() => { setUserOpen(false); setClosing(false); }, 250);
  };
  const toggleUser = () => {
    if (userOpen && !closing) cerrarMenu();
    else if (!userOpen && !closing) abrirMenu();
  };

  useEffect(() => {
    if (!userOpen && !closing) return;
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) cerrarMenu();
    };
    const onEsc = (e) => { if (e.key === "Escape") cerrarMenu(); };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [userOpen, closing]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!isPortal) {
    return (
      <nav className="navbar">
        <div className="nav-logo">
          <Link href="/">
            <Image src="/img/uacj.png" alt="Logo UACJ" width={60} height={60} priority />
          </Link>
        </div>

        <div className="nav-title">
          <Link href="/">
            <h3>VINCULACIÓN</h3>
          </Link>
        </div>

        <div className={`menu-toggle ${menuActive ? "active" : ""}`} onClick={toggleMenu}>
          <span></span><span></span><span></span>
        </div>
        <div className={`nav-links ${menuActive ? "active" : ""}`}>

          <Link className="nav-text" href="/login">INICIAR SESIÓN</Link>
        </div>
      </nav>
    );
  }

  const esActiva = (p) => pathname === p || pathname.startsWith(p + "/");

  // 👇 Tabs dinámicos según rol
  let tabs = [];
  if (userRole === "professor") {
    tabs = [
      { href: "/docente/grupos", label: "MIS GRUPOS" },
      { href: "/docente/buscar", label: "BUSCAR" },
    ];
  } else if (userRole === "company") {
    tabs = [
      { href: "/empresa/vacantes", label: "VACANTES" },
      { href: "/empresa/panel", label: "PANEL DE EMPRESA" },
    ];
  } else {
    // default: alumno
    tabs = [
      { href: "/alumno/buscar", label: "BUSCAR" },
      { href: "/alumno/mis-practicas", label: "MIS PRÁCTICAS" },
    ];
  }

  return (
    <>
      <header className="nav-portal">
        <div className="barra">
          <div className="izquierda">
            <Link href="/" className="marca">
              <Image src="/img/uacj.png" alt="UACJ" width={60} height={60} priority />
            </Link>
            <nav className="tabs">
              {tabs.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`tab ${esActiva(t.href) ? "activa" : ""}`}
                  aria-current={esActiva(t.href) ? "page" : undefined}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="derecha">
            <div
              className={`menu-toggle portal ${portalMenuOpen ? "active" : ""}`}
              onClick={togglePortalMenu}
            >
              <span></span><span></span><span></span>
            </div>
            <NotificationsBell />
            <button className="btn-usuario" onClick={toggleUser}>
              <span className="usuario-nombre">{userName}</span>
              <div className="usuario-avatar" aria-hidden />
              <svg className={`caret ${userOpen ? "abierto" : ""}`} width="14" height="14" viewBox="0 0 24 24">
                <path fill="currentColor" d="M7 10l5 5 5-5z" />
              </svg>
            </button>
            {(userOpen || closing) && (
              <div ref={menuRef} className={`menu-usuario ${closing ? "cerrando" : (userOpen ? "abierto" : "")}`}>
                <div className="cuenta">
                  <div className="avatar" aria-hidden />
                  <div className="datos">
                    <span className="nombre">{userName}</span>
                    {userEmail ? <span className="email">{userEmail}</span> : null}
                  </div>
                </div>
                <button className="menu-item" onClick={logout}>Cerrar sesión</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Menú móvil */}
      <div className={`portal-links ${portalMenuOpen ? "active" : ""}`}>
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`portal-link ${esActiva(t.href) ? "activa" : ""}`}
            onClick={() => setPortalMenuOpen(false)}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </>
  );
}


/* =======================
   🔔 Componente Notificaciones (global)
   ======================= */
function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]); // {id, type, title, body, action_url, created_at, read_at, ...}
  const panelRef = useRef(null);
  const btnRef = useRef(null);
  const router = useRouter();

  // Cargar notificaciones al montar
  useEffect(() => {
    let ignore = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || ignore) return;

      // 1) Unread count
      const { data: unreadRows } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: false })
        .eq("student_id", user.id)
        .is("read_at", null);

      setUnread((unreadRows || []).length);
      
const { data: list, error } = await supabase
      .from("notifications")
      .select(`
        id,
        type,
        title,
        body,
        action_url,
        created_at,
        read_at
      `)
      .eq("student_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) console.error("notifications list error:", error);
    if (!ignore && list) setItems(list);

    })();

    // Realtime: nuevas notificaciones al vuelo
    let channel;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      channel = supabase
        .channel(`notif_user_${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `student_id=eq.${user.id}` },
          (payload) => {
            const n = payload.new;
            setItems((prev) => [n, ...prev].slice(0, 20));
            setUnread((u) => u + 1);
            // pequeña animación de “ping” en el badge por CSS (ver .notif-ping class)
            try {
              btnRef.current?.classList.add("notif-ping");
              setTimeout(() => btnRef.current?.classList.remove("notif-ping"), 600);
            } catch {}
          }
        )
        .subscribe();
    })();

    return () => {
      ignore = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Abrir/cerrar con animación
  const openPanel = () => { setClosing(false); setOpen(true); };
  const closePanel = () => {
    if (!open && !closing) return;
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); }, 220);
  };
  const togglePanel = async () => {
    if (open && !closing) {
      closePanel();
      return;
    }
    openPanel();

    // Al abrir, marca todo como leído
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (unread > 0) {
        const nowIso = new Date().toISOString();
        const { error } = await supabase
          .from("notifications")
          .update({ read_at: nowIso })
          .eq("student_id", user.id)
          .is("read_at", null);
        if (error) console.error("mark read error:", error);
        setUnread(0);
        setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || nowIso })));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Cerrar al hacer click fuera / ESC
  useEffect(() => {
    if (!open && !closing) return;
    const onClickOutside = (e) => {
      if (!panelRef.current || !btnRef.current) return;
      if (
        panelRef.current.contains(e.target) ||
        btnRef.current.contains(e.target)
      ) return;
      closePanel();
    };
    const onEsc = (e) => { if (e.key === "Escape") closePanel(); };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, closing]);

  const goAction = (url) => {
    closePanel();
    if (!url) return;
    router.push(url);
  };

  return (
    <div className="notif-wrap">
      <button
        ref={btnRef}
        className="btn-usuario notif-btn"
        onClick={togglePanel}
        aria-label="Notificaciones"
        aria-expanded={open ? "true" : "false"}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2m6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1z"
          />
        </svg>
        {unread > 0 && <span className="badge">{unread}</span>}
      </button>

      {(open || closing) && (
        <>
          {/* overlay solo en móvil */}
          <div className={`notif-overlay ${open ? "open" : ""}`} onClick={closePanel} />

          <div
            ref={panelRef}
            className={`notif-panel ${closing ? "closing" : (open ? "open" : "")}`}
            role="dialog"
            aria-label="Notificaciones"
          >
            <header className="notif-head">
              <h4>Notificaciones</h4>
              {items.length > 0 ? (
                <span className="notif-sub">{items.filter(i => !i.read_at).length} sin leer</span>
              ) : null}
            </header>

            <div className="notif-list">
              {items.length === 0 && (
                <div className="notif-empty">No tienes notificaciones todavía.</div>
              )}

              {items.map((n) => (
                <article key={n.id} className={`notif-item ${!n.read_at ? "is-unread" : ""}`}>
                  <div className={`notif-ico ${n.type}`}>
                    {iconForType(n.type)}
                  </div>
                  <div className="notif-body">
                    <div className="notif-title">{n.title || prettyTitleFromType(n.type)}</div>
                    {n.body ? <div className="notif-text">{n.body}</div> : null}
                    <div className="notif-meta">
                      <time dateTime={n.created_at}>{timeAgo(n.created_at)}</time>
                      {n.action_url && (
                        <button className="notif-action" onClick={() => goAction(n.action_url)}>
                          Ver detalle
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */
function timeAgo(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "justo ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const dd = Math.floor(h / 24);
  if (dd < 7) return `${dd} d`;
  return d.toLocaleDateString();
}

function iconForType(type) {
  // colores los da CSS por clase .notif-ico.offer / .rejected / .auto_declined / .info
  if (type === "offer") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.85L18.18 22 12 18.77 5.82 22 7 14.12l-5-4.85 6.91-1.01L12 2z"/>
      </svg>
    );
  }
  if (type === "rejected" || type === "auto_declined") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <path fill="currentColor" d="M12 2a10 10 0 102 19.8V22h-4v-.2A10 10 0 0012 2m-1 5h2v6h-2V7m0 8h2v2h-2v-2z"/>
      </svg>
    );
  }
  // info default
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M11 9h2V7h-2m1 13a10 10 0 110-20 10 10 0 010 20m-1-4h2v-6h-2v6z"/>
    </svg>
  );
}

function prettyTitleFromType(type) {
  const map = {
    offer: "¡Tienes una oferta!",
    rejected: "Tu postulación fue rechazada",
    auto_declined: "Tu oferta caducó",
    info: "Notificación",
  };
  return map[type] || "Notificación";
}

