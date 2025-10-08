// pages/alumno/vacante/[id].js
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import Navbar from "../../../components/navbar";
import Footer from "../../../components/footer";
import { supabase } from "../../../lib/supabaseClient";
import { useActivePractice } from '../../../components/hooks/useActivePractice';

/* --- helpers UI<->BD para mostrar bonito --- */
const MAP_DB_TO_UI = {
  modalidad: { presencial: "Presencial", "híbrido": "Híbrida", remoto: "Remota" },
  comp: { apoyo_economico: "Apoyo económico", sin_apoyo: "Sin apoyo" },
};
const fmtMod = (dbVal) => MAP_DB_TO_UI.modalidad[dbVal] ?? dbVal ?? "Modalidad N/A";
const fmtComp = (dbVal) => MAP_DB_TO_UI.comp[dbVal] ?? dbVal ?? "Compensación N/A";

function splitLines(text) {
  const arr = String(text || "")
    .split(/\r?\n|•|- /)
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : ["No disponible"];
}

function Stars({ rating = 0 }) {
  const r = Math.round(Number(rating || 0));
  return (
    <span className="jobs-stars" aria-label={`Calificación ${r} de 5`}>
      <span className="full">{"★★★★★".slice(0, r)}</span>
      <span className="empty">{"★★★★★".slice(r)}</span>
    </span>
  );
}

/* ---------- UI: mapa (normaliza dirección) ---------- */
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
  return (
    <iframe
      src={src}
      width="100%"
      height="280"
      style={{ border: 0, borderRadius: 12 }}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      aria-label="Mapa de ubicación"
    />
  );
}

/* ---------- UI: logo empresa (o iniciales) ---------- */
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
      <div className="jobs-logo" style={{ width: 40, height: 40 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name || "Logo de la empresa"} />
      </div>
    );
  }
  return (
    <div
      className="jobs-logo-fallback"
      aria-label={name || "Empresa"}
      style={{
        width: 40, height: 40, background: "#e5e7eb", color: "#374151",
        display: "grid", placeItems: "center", borderRadius: 6, fontWeight: 700
      }}
    >
      <span style={{ fontSize: "0.85rem" }}>{initials}</span>
    </div>
  );
}

export default function VacanteDetallePage() {
  const router = useRouter();
  const { id } = router.query;

  // USAR EL HOOK PARA EL ESTADO DE PRÁCTICA ACTIVA
  const { hasActivePractice, loading: practiceLoading } = useActivePractice();

  const [vacancy, setVacancy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [applyLoading, setApplyLoading] = useState(false);
  const [userId, setUserId] = useState(null);
  const [appliedVacancyIds, setAppliedVacancyIds] = useState([]);
  const [hasOfferForThisVacancy, setHasOfferForThisVacancy] = useState(false);
  const [isParticipatingInThisVacancy, setIsParticipatingInThisVacancy] = useState(false);
  const [activePracticeData, setActivePracticeData] = useState(null);
  const [hasCompletedPracticeForThisVacancy, setHasCompletedPracticeForThisVacancy] = useState(false);

// Obtener usuario y aplicaciones
useEffect(() => {
  const boot = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);

      // CORRECCIÓN: Cargar SOLO aplicaciones con estados activos (en lugar de excluir)
      const { data: appsData } = await supabase
        .from("applications")
        .select("id, vacancy_id, status")
        .eq("student_id", user.id)
        .in("status", ["postulada", "en_proceso", "oferta"]) // ← SIN "aceptada"
        .limit(1000);
      
      console.log("📋 Aplicaciones ACTIVAS cargadas:", appsData); // DEBUG
      
      if (appsData) {
        const appliedIds = appsData.map(a => a.vacancy_id);
        setAppliedVacancyIds(appliedIds);
        
        console.log("🆔 IDs de vacantes postuladas ACTIVAS:", appliedIds); // DEBUG
        console.log("🎯 Vacante actual que estamos viendo:", id); // DEBUG
        
        // Verificar si tiene oferta para esta vacante específica
        if (id) {
          const offerForThis = appsData.find(app => 
            app.vacancy_id === id && app.status === 'oferta'
          );
          if (offerForThis) {
            console.log("🎉 Tiene oferta para esta vacante");
            setHasOfferForThisVacancy(true);
          }

          // Verificar si ya está postulado a ESTA vacante (cualquier estado activo)
          const alreadyApplied = appsData.find(app => 
            app.vacancy_id === id
          );
          
          if (alreadyApplied) {
            console.log("✅ Ya postulado a esta vacante con estado:", alreadyApplied.status);
          }

          // Verificar si tiene una práctica COMPLETADA para esta vacante
          const { data: completedApps } = await supabase
            .from("applications")
            .select("id, status")
            .eq("student_id", user.id)
            .eq("vacancy_id", id)
            .in("status", ["completada", "finalizada"])
            .single();

          if (completedApps) {
            console.log("🔄 Tiene práctica completada para esta vacante");
            setHasCompletedPracticeForThisVacancy(true);
          }
        }
      }

      // Cargar datos de la práctica activa si existe
      if (hasActivePractice) {
        const { data: practiceData } = await supabase
          .from("practices")
          .select("vacancy_id")
          .eq("student_id", user.id)
          .eq("status", "active")
          .single();
        
        if (practiceData) {
          setActivePracticeData(practiceData);
          
          // Verificar si está participando en ESTA vacante específica
          if (id && practiceData.vacancy_id === id) {
            setIsParticipatingInThisVacancy(true);
            console.log("🏆 Está participando en esta vacante específica");
          }
        }
      }
    }
  };
  if (id && !practiceLoading) {
    boot();
  }
}, [id, hasActivePractice, practiceLoading]);

  // Carga de la vacante
  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      setErr("");

      const { data, error } = await supabase
        .from("vacancies")
        .select(`
          id, title, modality, compensation, language, requirements, activities,
          location_text, rating_avg, rating_count, status, created_at,
          spots_total, spots_taken, spots_left,
          company_id,
          company:companies!left ( id, name, industry, logo_url )
        `)
        .eq("id", id)
        .single();

      if (error) {
        setErr(error.message || "No se pudo cargar la vacante.");
        setVacancy(null);
      } else {
        setVacancy(data);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  // Escuchar eventos de cambio de estado de práctica
  useEffect(() => {
    const handlePracticeChange = () => {
      console.log("🔄 Vacante - Evento de cambio de práctica recibido");
      // Recargar datos cuando cambie el estado de práctica
      if (id && userId) {
        const reloadData = async () => {
          const { data: practiceData } = await supabase
            .from("practices")
            .select("vacancy_id")
            .eq("student_id", userId)
            .eq("status", "active")
            .single();
          
          if (practiceData) {
            setActivePracticeData(practiceData);
            setIsParticipatingInThisVacancy(practiceData.vacancy_id === id);
          } else {
            setActivePracticeData(null);
            setIsParticipatingInThisVacancy(false);
          }
        };
        reloadData();
      }
    };

    window.addEventListener('practiceStatusChanged', handlePracticeChange);
    return () => {
      window.removeEventListener('practiceStatusChanged', handlePracticeChange);
    };
  }, [id, userId]);

  const onBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/alumno/buscar");
  };

  /* ---------- BD: postularse (vía RPC SECURITY DEFINER) ---------- */
  const onApply = async () => {
    try {
      if (!userId) { router.push("/login"); return; }
      if (!vacancy?.id) return;
      
      // USAR EL VALOR DEL HOOK
      if (hasActivePractice) {
        alert("Ya tienes un proyecto activo. No puedes postularte a otras vacantes.");
        return;
      }

      // Verificar si ya tiene una aplicación ACTIVA para esta vacante
      if (appliedVacancyIds.includes(vacancy.id)) {
        alert("Ya te has postulado a esta vacante.");
        return;
      }

      // Si tiene una práctica COMPLETADA para esta vacante, mostrar confirmación
      if (hasCompletedPracticeForThisVacancy) {
        const ok = confirm("Ya completaste una práctica en esta vacante anteriormente. ¿Deseas postularte nuevamente?");
        if (!ok) return;
      }

      setApplyLoading(true);

      // Llama a la función SQL: public.apply_and_notify(uuid)
      const { error } = await supabase.rpc("apply_and_notify", {
        p_vacancy_id: vacancy.id,
      });

      if (error) {
        // Duplicado (ya postuló antes)
        if ((error.code === "23505") || /duplicate key|already exists/i.test(error.message || "")) {
          alert("Ya te habías postulado a esta vacante.");
          setAppliedVacancyIds((prev) => (prev.includes(vacancy.id) ? prev : [...prev, vacancy.id]));
          return;
        }
        throw error;
      }

      // Éxito: marca como postulada en UI
      setAppliedVacancyIds((prev) => [...prev, vacancy.id]);
      setHasCompletedPracticeForThisVacancy(false); // Resetear el estado de práctica completada
      alert("¡Listo! Tu postulación fue enviada.");
    } catch (e) {
      console.error(e);
      alert(e.message || "No se pudo completar la postulación.");
    } finally {
      setApplyLoading(false);
    }
  };

  /* ---------- Redirigir a ofertas si ya tiene oferta ---------- */
  const goToOffers = () => {
    router.push('/alumno/ofertas');
  };

  /* ---------- Redirigir a mis prácticas si ya está participando ---------- */
  const goToMyPractices = () => {
    router.push('/alumno/mis-practicas');
  };

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

  // DEBUG: Mostrar estados actuales
  console.log("Estados actuales:", {
    vacancyId: id,
    isParticipatingInThisVacancy,
    hasOfferForThisVacancy,
    hasActivePractice, // USANDO EL HOOK
    appliedVacancyIds,
    hasCompletedPracticeForThisVacancy,
    userId
  });

  // Determinar el texto del botón y si está deshabilitado
  // Determinar el texto del botón y si está deshabilitado
  const getApplyButtonState = () => {
    const isApplied = appliedVacancyIds.includes(vacancy?.id);

    // DEBUG DETALLADO
    console.log("🔍 DEBUG COMPLETO del botón:", {
      vacancyId: vacancy?.id,
      vacancyTitle: vacancy?.title,
      isApplied,
      appliedVacancyIds,
      hasOfferForThisVacancy,
      isParticipatingInThisVacancy,
      hasActivePractice,
      hasCompletedPracticeForThisVacancy,
      spotsLeft: vacancy?.spots_left,
      applyLoading
    });

    if (isParticipatingInThisVacancy) {
      console.log("🏆 Caso 1: Participando en esta vacante");
      return { text: "✅ Ya estás participando en este proyecto", disabled: false, action: goToMyPractices };
    } else if (hasActivePractice) {
      console.log("⏸️ Caso 2: Tiene práctica activa en otra vacante");
      return { text: "⏸️ Ya estás participando en otro proyecto", disabled: true, action: null };
    } else if (hasOfferForThisVacancy) {
      console.log("🎉 Caso 3: Tiene oferta para esta vacante");
      return { text: "🎉 ¡Tienes una oferta! Revisar oferta", disabled: false, action: goToOffers };
    } else if (isApplied) {
      console.log("✅ Caso 4: Ya postulado a esta vacante");
      return { text: "✅ Ya postulada", disabled: true, action: null };
    } else if (vacancy?.spots_left <= 0) {
      console.log("❌ Caso 5: Cupos agotados");
      return { text: "❌ Cupos agotados", disabled: true, action: null };
    } else if (hasCompletedPracticeForThisVacancy) {
      console.log("🔄 Caso 6: Tuvo práctica completada anteriormente");
      return { text: "🔄 Postularse nuevamente", disabled: false, action: onApply };
    } else {
      console.log("📝 Caso 7: Postulación normal");
      return { text: applyLoading ? "Enviando..." : "📝 Postularse ahora", disabled: applyLoading, action: onApply };
    }
  };

  const buttonState = getApplyButtonState();

  return (
    <>
      <Navbar />

      <main className="jobs-wrap">
        <div className="jobs-grid" style={{ gridTemplateColumns: "1fr" }}>
          <article className="jobs-detail" style={{ display: "block" }}>

            {loading && <div className="jobs-skeleton">Cargando…</div>}
            {!loading && err && <div className="jobs-error">{err}</div>}
            {!loading && !err && !vacancy && <div className="jobs-empty">Vacante no encontrada</div>}

            {!loading && vacancy && (
              <div className="jobs-detail-inner">
                <header className="jobs-detail-head">
                  <div className="jobs-detail-titles">
                    <h2 className="jobs-title" style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <LogoSquare src={vacancy.company?.logo_url} name={vacancy.company?.name} />
                      {vacancy.title}
                    </h2>
                    <a className="jobs-company" href="#" onClick={(e) => e.preventDefault()}>
                      {vacancy.company?.name || "Empresa"}
                    </a>
                    <div className="jobs-rating">
                      <Stars rating={vacancy.rating_avg} />
                      <span className="jobs-muted">({vacancy.rating_count ?? 0})</span>
                    </div>
                  </div>
                </header>

                {/* Mensaje de que ya está participando en ESTA vacante */}
                {isParticipatingInThisVacancy && (
                  <div style={{
                    background: "#f0f9ff",
                    border: "1px solid #0ea5e9",
                    borderRadius: "8px",
                    padding: "16px",
                    marginBottom: "16px",
                    textAlign: "center"
                  }}>
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      gap: "8px",
                      marginBottom: "8px"
                    }}>
                      <span style={{ fontSize: "24px" }}>✅</span>
                      <strong style={{ color: "#0369a1" }}>¡Ya estás participando en esta vacante!</strong>
                    </div>
                    <p style={{ margin: 0, color: "#075985", fontSize: "14px" }}>
                      Esta es tu práctica actual. No olvides mantener contacto con la empresa para conocer más detalles del proyecto.
                    </p>
                  </div>
                )}

                {/* Mensaje de que tiene práctica activa (pero no en esta vacante) - USANDO EL HOOK */}
                {hasActivePractice && !isParticipatingInThisVacancy && (
                  <div style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "8px",
                    padding: "16px",
                    marginBottom: "16px",
                    textAlign: "center"
                  }}>
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      gap: "8px",
                      marginBottom: "8px"
                    }}>
                      <span style={{ fontSize: "24px" }}>⏸️</span>
                      <strong style={{ color: "#dc2626" }}>Tienes un proyecto activo.</strong>
                    </div>
                    <p style={{ margin: 0, color: "#991b1b", fontSize: "14px" }}>
                      No puedes postularte a otras vacantes mientras tengas un proyecto en curso.
                    </p>
                  </div>
                )}

                {/* Mensaje de oferta activa */}
                {!isParticipatingInThisVacancy && !hasActivePractice && hasOfferForThisVacancy && (
                  <div style={{
                    background: "#fffbeb",
                    border: "1px solid #f59e0b",
                    borderRadius: "8px",
                    padding: "16px",
                    marginBottom: "16px",
                    textAlign: "center"
                  }}>
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      gap: "8px",
                      marginBottom: "8px"
                    }}>
                      <span style={{ fontSize: "24px" }}>🎉</span>
                      <strong style={{ color: "#d97706" }}>¡Tienes una oferta de esta vacante!</strong>
                    </div>
                    <p style={{ margin: 0, color: "#92400e", fontSize: "14px" }}>
                      Ve a la sección de ofertas para aceptar o rechazar esta propuesta.
                    </p>
                  </div>
                )}

                {/* Mensaje de práctica completada anteriormente */}
                {!isParticipatingInThisVacancy && !hasActivePractice && !hasOfferForThisVacancy && hasCompletedPracticeForThisVacancy && (
                  <div style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "8px",
                    padding: "16px",
                    marginBottom: "16px",
                    textAlign: "center"
                  }}>
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      gap: "8px",
                      marginBottom: "8px"
                    }}>
                      <span style={{ fontSize: "24px" }}>🔄</span>
                      <strong style={{ color: "#166534" }}>Ya completaste una práctica aquí anteriormente</strong>
                    </div>
                    <p style={{ margin: 0, color: "#166534", fontSize: "14px" }}>
                      Puedes postularte nuevamente a esta vacante.
                    </p>
                  </div>
                )}

                <div className="jobs-chips">
                  <span className="jobs-chip">{fmtMod(vacancy.modality)}</span>
                  <span className="jobs-chip">{fmtComp(vacancy.compensation)}</span>
                  <span className="jobs-chip">Idioma {vacancy.language || "ES"}</span>
                  {vacancy.spots_left > 0 && (
                    <span className="jobs-chip" style={{ background: "#dcfce7", color: "#166534" }}>
                      {vacancy.spots_left} cupo{vacancy.spots_left !== 1 ? 's' : ''} disponible{vacancy.spots_left !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <p className="jobs-location">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M12 2A7 7 0 0 0 5 9c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7m0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"
                    />
                  </svg>
                  {vacancy.location_text || "Ubicación no especificada"}
                </p>

                <hr className="jobs-sep" />

                {vacancy.activities && (
                  <section className="jobs-section">
                    <h3>Actividades</h3>
                    <ul className="jobs-list">
                      {splitLines(vacancy.activities).map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {vacancy.requirements && (
                  <section className="jobs-section">
                    <h3>Requisitos</h3>
                    <ul className="jobs-list">
                      {splitLines(vacancy.requirements).map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {vacancy.location_text && (
                  <section className="jobs-section">
                    <h3>Ubicación en mapa</h3>
                    <MapEmbedByAddress address={vacancy.location_text} />
                  </section>
                )}

                <div className="jobs-cta">
                  <button
                    className="jobs-apply"
                    disabled={buttonState.disabled}
                    onClick={buttonState.action || (() => {})}
                    style={{ 
                      width: "100%",
                      marginTop: 20,
                      opacity: buttonState.disabled ? 0.6 : 1,
                      background: hasCompletedPracticeForThisVacancy ? "#f59e0b" : 
                                 isParticipatingInThisVacancy ? "#0ea5e9" :
                                 hasOfferForThisVacancy ? "#f59e0b" :
                                 hasActivePractice ? "#f3f4f6" : "#2563eb",
                      color: hasActivePractice ? "#6b7280" : "#fff",
                      border: hasActivePractice ? "1px solid #d1d5db" : "none",
                      cursor: buttonState.disabled ? "not-allowed" : "pointer"
                    }}
                  >
                    {buttonState.text}
                  </button>
                </div>
              </div>
            )}
          </article>
        </div>
      </main>

      <Footer />
    </>
  );
}