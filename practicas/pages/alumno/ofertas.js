// pages/alumno/ofertas.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/navbar";
import Footer from "../../components/footer";
import { useActivePractice } from '../../components/hooks/useActivePractice';

/* ---------- UI: mini componentes ---------- */
function Stars({ rating = 0, compact = false }) {
  const r = Math.round(Number(rating || 0));
  return (
    <span className={`jobs-stars ${compact ? "small" : ""}`} aria-label={`Calificación ${r} de 5`}>
      <span className="full">{"★★★★★".slice(0, r)}</span>
      <span className="empty">{"★★★★★".slice(r)}</span>
    </span>
  );
}

// UI: logo de empresa 
function LogoSquare({ src, name }) {
  const makeInitials = (raw) => {
    if (typeof raw !== "string") return "?";
    const cleaned = raw.replace(/\s+/g, " ").trim();
    if (!cleaned) return "?";
    const stop = new Set(["de", "del", "la", "las", "el", "los", "the", "of"]);
    const parts = cleaned.split(" ").filter(Boolean).filter(w => !stop.has(w.toLowerCase()));
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const initials = makeInitials(name);

  if (src) {
    return (
      <div className="jobs-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name || "Logo de la empresa"} />
      </div>
    );
  }
  return (
    <div className="jobs-logo-fallback" aria-label={name || "Empresa"}>
      <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{initials}</span>
    </div>
  );
}

function splitLines(text) {
  const arr = String(text || "")
    .split(/\r?\n|•|- /)
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : ["No disponible"];
}
const fmtMod = (m) => (m === "presencial" ? "Presencial" : m === "remoto" ? "Remota" : "Híbrida");
const fmtComp = (c) => c || "Compensación N/A";

/* ---------- UI: mapa ---------- */
function normalizeMxAddress(address) {
  let a = address || "";
  a = a.replace(/^C\.\s*/i, "Calle ");  
  a = a.replace(/\bS\/N\b/gi, "S/N");   
  if (!/Juárez/i.test(a)) a += ", Ciudad Juárez";
  if (!/Chihuahua/i.test(a)) a += ", Chihuahua";
  if (!/México|Mexico/i.test(a)) a += ", México";
  return a;
}

function MapEmbedByAddress({ address, zoom = 16 }) {
  if (!address) return null;
  const q = normalizeMxAddress(address);
  const src = `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${zoom}&output=embed`;
  return <iframe src={src} width="100%" height="280" style={{border:0,borderRadius:12}} loading="lazy" />;
}

/* ---------- Página ---------- */
export default function OfertasPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [userId, setUserId] = useState(null);
  
  // USAR EL HOOK EN LUGAR DEL ESTADO LOCAL
  const { hasActivePractice, loading: practiceLoading } = useActivePractice();

  // UI: estado principal
  const [offers, setOffers] = useState([]); // [{appId, applied_at, status, ...vacancy}]
  const [selected, setSelected] = useState(null);

  const isMobile = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;

  useEffect(() => {
    let ignore = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        /* ---------- BD: sesión ---------- */
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/login"); return; }
        setUserId(user.id);

        /* ---------- BD: ofertas (applications.status = 'oferta') ---------- */
        const { data, error } = await supabase
        .from("applications")
        .select(`
          id, applied_at, status,
          vacancy:vacancies (
            id, title, modality, compensation, language,
            location_text, rating_avg, rating_count, created_at,
            activities, requirements,
            company:companies!vacancies_company_id_fkey ( id, name, logo_url, location_text )
          )
        `)
        .eq("student_id", user.id)
        .eq("status", "oferta")
        .order("applied_at", { ascending: false });

        if (error) throw error;

        const list = (data || [])
          .filter(r => !!r?.vacancy)
          .map(r => ({ appId: r.id, applied_at: r.applied_at, status: r.status, ...r.vacancy }));

        if (!ignore) {
          setOffers(list);
          setSelected(list[0] || null);
        }
      } catch (e) {
        if (!ignore) setErr(e.message || "No se pudieron cargar tus ofertas.");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    
    // Escuchar eventos de cambio de estado de práctica
    const handlePracticeChange = () => {
      console.log("🔄 Ofertas - Evento de cambio de práctica recibido");
    };

    window.addEventListener('practiceStatusChanged', handlePracticeChange);

    return () => { 
      ignore = true;
      window.removeEventListener('practiceStatusChanged', handlePracticeChange);
    };
  }, [router]);

  /* ---------- Acciones (BD) ---------- */
const acceptOffer = async (appId) => {
  if (!userId || !appId) return;
  
  if (hasActivePractice) { 
    alert("Ya tienes una práctica activa. No puedes aceptar otra oferta."); 
    return; 
  }
  
  const ok = confirm("¿Aceptar esta oferta?\n\nAl aceptar:\n• Tendrás que contactar con la empresa para acordar tus horarios y obtener información de interés sobre tu nuevo puesto.\n• Se eliminarán tus otras postulaciones activas\n• No podrás postularte a otras vacantes durante tu práctica\n\n¿Continuar?");
  if (!ok) return;
  
  try {
    // 1. EJECUTAR student_accept_offer ORIGINAL (esto notifica al profesor)
    const { error } = await supabase.rpc("student_accept_offer", { p_app_id: appId });
    if (error) throw error;
    
    // 2. Notificación simple a la empresa (con la política RLS corregida)
    const { data: offerData } = await supabase
      .from("applications")
      .select(`
        student:students!applications_student_id_fkey (full_name),
        vacancy:vacancies (title, company:companies(owner_id))
      `)
      .eq("id", appId)
      .single();

    if (offerData?.vacancy?.company?.owner_id) {
      await supabase
        .from("notifications")
        .insert({
          student_id: offerData.vacancy.company.owner_id,
          type: "info",
          title: "Oferta aceptada", 
          body: `El alumno ${offerData.student.full_name} ha aceptado tu oferta para "${offerData.vacancy.title}".`,
          action_url: `/empresa/postulaciones`
        });
    }
    
    window.dispatchEvent(new CustomEvent('practiceStatusChanged'));
    router.push("/alumno/mis-practicas");
  } catch (e) {
    console.error(e);
    alert(e.message || "No se pudo aceptar la oferta.");
  }
};

  const declineOffer = async (appId) => {
    if (!userId || !appId) return;
    const ok = confirm("¿Rechazar esta oferta? Esta acción no se puede deshacer.");
    if (!ok) return;
    try {
      const { error } = await supabase
        .from("applications")
        .update({ status: "rechazada", decision: "declined", decision_at: new Date().toISOString() })
        .eq("id", appId);
      if (error) throw error;

      setOffers(prev => prev.filter(o => o.appId !== appId));
      if (selected?.appId === appId) setSelected(null);
    } catch (e) {
      console.error(e);
      alert(e.message || "No se pudo rechazar la oferta.");
    }
  };

  const list = useMemo(() => offers, [offers]);

  /* ---------- Helpers UI ---------- */
  // Prioriza la dirección de la vacante; si no existe, usa la de la empresa
  const mapAddress = selected?.location_text || selected?.company?.location_text || "";

  // Mostrar loading mientras se verifica el estado de práctica
  if (practiceLoading) {
    return (
      <>
        <Navbar />
        <main className="jobs-wrap">
          <div style={{ textAlign: "center", padding: "50px" }}>
            <div className="jobs-card sk" />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />

      <main className="jobs-wrap">
        {err && <div className="jobs-error">{err}</div>}

      {/* UI: aviso práctica activa - USAR EL VALOR DEL HOOK */}
        {hasActivePractice && (
          <div className="jobs-error" style={{ background: "#fff7ed", borderColor: "#fed7aa", color: "#9a3412" }}>
            Ya tienes una práctica activa. No puedes aceptar otra oferta por ahora.
          </div>
        )}
        <h2 style={{ textAlign: "center", margin: "6px 0 12px" }}>Mis ofertas</h2>

        {/* UI: grid principal */}
        <section className="jobs-grid">
          {/* UI: listado izquierda */}
          <aside className="jobs-listing">
            {loading && Array.from({ length: 6 }).map((_, i) => <div key={i} className="jobs-card sk" />)}
            {!loading && list.length === 0 && (
              <div className="jobs-empty small">No tienes ofertas por el momento.</div>
            )}

            {!loading && list.map((v) => (
              <button
                key={v.appId}
                className={`jobs-card ${selected?.appId === v.appId ? "is-active" : ""}`}
                onClick={() => {
                  if (isMobile()) {
                    router.push(`/alumno/vacante/${v.id}?appId=${encodeURIComponent(v.appId)}&from=ofertas`);
                  } else {
                    setSelected(v);
                  }
                }}
              >
                <div className="jobs-card-left" />
                <div className="jobs-card-body">
                  <div className="jobs-card-top" style={{ justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <LogoSquare src={v.company?.logo_url} name={v.company?.name} />
                      <div>
                        <h4 className="jobs-card-title">{v.title}</h4>
                        <div className="jobs-card-company">{v.company?.name || "Empresa"}</div>
                        <div className="jobs-card-rating">
                          <Stars rating={v.rating_avg} compact />
                          <span className="jobs-muted small">({v.rating_count ?? 0})</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="jobs-meta">
                    <span>{fmtMod(v.modality)}</span>
                    <span>{fmtComp(v.compensation)}</span>
                    <span>Idioma {v.language || "ES"}</span>
                  </div>
                </div>
              </button>
            ))}
          </aside>

          {/* UI: detalle derecha */}
          <article className="jobs-detail">
            {loading && <div className="jobs-skeleton">Cargando…</div>}
            {!loading && !selected && list.length > 0 && <div className="jobs-empty">Selecciona una oferta.</div>}

            {!loading && selected && (
              <div className="jobs-detail-inner">
                {/* UI: encabezado vacante */}
                <header className="jobs-detail-head">
                  <div className="jobs-detail-titles">
                    <h2 className="jobs-title">{selected.title}</h2>
                    <a className="jobs-company" href="#" onClick={(e) => e.preventDefault()}>
                      {selected.company?.name || "Empresa"}
                    </a>
                    <div className="jobs-rating">
                      <Stars rating={selected.rating_avg} />
                      <span className="jobs-muted">({selected.rating_count ?? 0})</span>
                    </div>
                  </div>
                </header>

                {/* UI: chips */}
                <div className="jobs-chips">
                  <span className="jobs-chip">{fmtMod(selected.modality)}</span>
                  <span className="jobs-chip">{fmtComp(selected.compensation)}</span>
                  <span className="jobs-chip">Idioma {selected.language || "ES"}</span>
                </div>

                {/* UI: ubicación */}
                <p className="jobs-location">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M12 2A7 7 0 0 0 5 9c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7m0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"
                    />
                  </svg>
                  {mapAddress || "Ubicación no especificada"}
                </p>

                <hr className="jobs-sep" />

                {/* UI: actividades */}
                {selected.activities && (
                  <section className="jobs-section">
                    <h3>Actividades</h3>
                    <ul className="jobs-list">
                      {splitLines(selected.activities).map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </section>
                )}

                {/* UI: requisitos */}
                {selected.requirements && (
                  <section className="jobs-section">
                    <h3>Requisitos</h3>
                    <ul className="jobs-list">
                      {splitLines(selected.requirements).map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </section>
                )}

                {/* UI: mapa (usa la dirección de la vacante; si no hay, usa la de la empresa) */}
                {mapAddress && (
                  <section className="jobs-section">
                    <h3>Ubicación en mapa</h3>
                    <MapEmbedByAddress address={mapAddress} />
                  </section>
                )}

                {/* UI: CTA */}
                <div className="jobs-cta" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    className="jobs-apply"
                    onClick={() => acceptOffer(selected.appId)}
                    disabled={hasActivePractice} // USAR EL VALOR DEL HOOK
                    title={hasActivePractice ? "Ya tienes una práctica activa" : "Aceptar oferta"}
                  >
                    Aceptar oferta
                  </button>
                  <button
                    className="jobs-apply"
                    style={{ background: "#e9eef6", color: "#1f2937" }}
                    onClick={() => declineOffer(selected.appId)}
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            )}
          </article>
        </section>
      </main>

      {/* UI: responsive */}
      <style jsx global>{`
        @media (max-width: 899px) {
          .jobs-grid { grid-template-columns: 1fr !important; }
          .jobs-detail { display: none !important; }
        }
      `}</style>

      <Footer />
    </>
  );
}