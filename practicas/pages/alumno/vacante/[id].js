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
  const [applicationStatus, setApplicationStatus] = useState(null);

  // Obtener usuario y aplicaciones - COMPLETAMENTE CORREGIDO
  useEffect(() => {
    const boot = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);

        console.log("🔍 Iniciando carga de estados para usuario:", user.id, "vacante:", id);

        // 1. Primero verificar si está participando en ESTA vacante específica
        const { data: activePractice } = await supabase
          .from("practices")
          .select("vacancy_id")
          .eq("student_id", user.id)
          .eq("status", "active")
          .single();

        console.log("🏆 Práctica activa encontrada:", activePractice);

        if (activePractice) {
          setActivePracticeData(activePractice);
          const participatingInThis = activePractice.vacancy_id === id;
          setIsParticipatingInThisVacancy(participatingInThis);
          console.log("🎯 Participando en ESTA vacante:", participatingInThis);
        } else {
          setActivePracticeData(null);
          setIsParticipatingInThisVacancy(false);
        }

        // 2. Cargar TODAS las aplicaciones del usuario para esta vacante
        const { data: appsData } = await supabase
          .from("applications")
          .select("id, vacancy_id, status")
          .eq("student_id", user.id)
          .eq("vacancy_id", id);

        console.log("📋 TODAS las aplicaciones para esta vacante:", appsData);

        if (appsData && appsData.length > 0) {
          // Actualizar appliedVacancyIds
          const allAppliedIds = [...new Set(appsData.map(a => a.vacancy_id))];
          setAppliedVacancyIds(allAppliedIds);

          // 3. Buscar oferta específica para esta vacante
          const offerForThis = appsData.find(app => app.status === 'oferta');
          console.log("🎉 Oferta encontrada para esta vacante:", !!offerForThis, offerForThis);
          setHasOfferForThisVacancy(!!offerForThis);

          // 4. Buscar prácticas completadas para esta vacante
          const completedPractice = appsData.find(app => 
            app.status === 'completada' || app.status === 'finalizada'
          );
          console.log("🔄 Práctica completada encontrada:", !!completedPractice);
          setHasCompletedPracticeForThisVacancy(!!completedPractice);

          // 5. Guardar el estado actual de la aplicación
          const currentApp = appsData.find(app => 
            ['postulada', 'en_proceso', 'oferta'].includes(app.status)
          );
          setApplicationStatus(currentApp?.status || null);
          
        } else {
          console.log("📭 No hay aplicaciones para esta vacante");
          setHasOfferForThisVacancy(false);
          setHasCompletedPracticeForThisVacancy(false);
          setApplicationStatus(null);
        }
      }
    };
    
    if (id && !practiceLoading) {
      boot();
    }
  }, [id, practiceLoading]);

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
      
      // VERIFICACIÓN CORREGIDA: Solo bloquear si tiene práctica activa PERO NO en esta vacante
      if (hasActivePractice && !isParticipatingInThisVacancy) {
        alert("Ya tienes un proyecto activo. No puedes postularte a otras vacantes.");
        return;
      }

      // Verificar si ya tiene una aplicación ACTIVA (no completada) para esta vacante
      if (appliedVacancyIds.includes(vacancy.id) && !hasCompletedPracticeForThisVacancy) {
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
      console.log("🔄 Llamando a apply_and_notify_v2 para vacante:", vacancy.id);

      const { data, error } = await supabase.rpc("apply_and_notify_v2", {
        p_vacancy_id: vacancy.id,
      });

      console.log("📋 Respuesta del RPC:", { data, error });

      if (error) {
        console.error("❌ Error COMPLETO del RPC:", {
          message: error.message,
          details: error.details, 
          hint: error.hint,
          code: error.code
        });
        
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
      setHasCompletedPracticeForThisVacancy(false);
      setHasOfferForThisVacancy(false);
      setApplicationStatus('postulada');
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

  // Determinar el texto del botón - COMPLETAMENTE REESCRITO
  const getApplyButtonState = () => {
    console.log("🎯 Calculando estado del botón:", {
      isParticipatingInThisVacancy,
      hasOfferForThisVacancy,
      hasActivePractice,
      appliedVacancyIds: appliedVacancyIds.includes(vacancy?.id),
      hasCompletedPracticeForThisVacancy,
      applicationStatus
    });

    // 1. PRIORIDAD MÁXIMA: Ya está participando en ESTA vacante
    if (isParticipatingInThisVacancy) {
      return { 
        text: "✅ Ya estás participando en este proyecto", 
        disabled: false, 
        action: goToMyPractices,
        type: "practicing"
      };
    }
    
    // 2. Tiene oferta para ESTA vacante
    if (hasOfferForThisVacancy) {
      return { 
        text: "🎉 ¡Tienes una oferta!", 
        disabled: false, 
        action: goToOffers,
        type: "offer"
      };
    }
    
    // 3. Tiene práctica activa en OTRA vacante
    if (hasActivePractice && !isParticipatingInThisVacancy) {
      return { 
        text: "⏸️ Ya tienes un proyecto activo", 
        disabled: true, 
        action: null,
        type: "active_other"
      };
    }
    
    // 4. Ya postulada (estados normales: postulada o en_proceso)
    if (applicationStatus && ['postulada', 'en_proceso'].includes(applicationStatus)) {
      return { 
        text: "✅ Ya postulada", 
        disabled: true, 
        action: null,
        type: "applied"
      };
    }
    
    // 5. Cupos agotados
    if (vacancy?.spots_left <= 0) {
      return { 
        text: "❌ Cupos agotados", 
        disabled: true, 
        action: null,
        type: "full"
      };
    }
    
    // 6. Práctica completada anteriormente - puede postularse nuevamente
    if (hasCompletedPracticeForThisVacancy) {
      return { 
        text: applyLoading ? "Enviando..." : "🔄 Postularse nuevamente", 
        disabled: applyLoading, 
        action: onApply,
        type: "completed_retry"
      };
    }
    
    // 7. Postulación normal
    return { 
      text: applyLoading ? "Enviando..." : "📝 Postularse ahora", 
      disabled: applyLoading, 
      action: onApply,
      type: "normal"
    };
  };

  const buttonState = getApplyButtonState();

  // DEBUG: Mostrar estados actuales
  console.log("🔍 ESTADOS FINALES:", {
    vacancyId: id,
    isParticipatingInThisVacancy,
    hasOfferForThisVacancy,
    hasActivePractice,
    appliedVacancyIds: appliedVacancyIds.includes(id),
    hasCompletedPracticeForThisVacancy,
    applicationStatus,
    buttonText: buttonState.text,
    buttonType: buttonState.type
  });

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

                {/* Mensajes de estado - CORREGIDO */}
                
                {/* 1. Participando en ESTA vacante */}
                {buttonState.type === "practicing" && (
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

                {/* 2. Tiene oferta para ESTA vacante */}
                {buttonState.type === "offer" && (
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

                {/* 3. Tiene práctica activa en OTRA vacante */}
                {buttonState.type === "active_other" && (
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
                      <strong style={{ color: "#dc2626" }}>Ya tienes un proyecto activo</strong>
                    </div>
                    <p style={{ margin: 0, color: "#991b1b", fontSize: "14px" }}>
                      No puedes postularte a otras vacantes mientras tengas un proyecto en curso.
                    </p>
                  </div>
                )}

                {/* 4. Práctica completada anteriormente */}
                {buttonState.type === "completed_retry" && (
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

                {/* 5. Ya postulada normalmente */}
                {buttonState.type === "applied" && (
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
                      <strong style={{ color: "#0369a1" }}>Ya te has postulado a esta vacante</strong>
                    </div>
                    <p style={{ margin: 0, color: "#075985", fontSize: "14px" }}>
                      Tu postulación está siendo revisada por la empresa.
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
                      background: 
                        buttonState.type === "practicing" ? "#0ea5e9" :
                        buttonState.type === "offer" ? "#f59e0b" :
                        buttonState.type === "active_other" ? "#f3f4f6" :
                        buttonState.type === "completed_retry" ? "#f59e0b" :
                        buttonState.type === "applied" ? "#0ea5e9" : "#2563eb",
                      color: buttonState.type === "active_other" ? "#6b7280" : "#fff",
                      border: buttonState.type === "active_other" ? "1px solid #d1d5db" : "none",
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