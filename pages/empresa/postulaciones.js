// pages/empresa/postulaciones.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/navbar";
import Footer from "../../components/footer";

/* ---------- UI: mini componentes ---------- */
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

// Componente Badge para estados
function Badge({ text, tone = "default" }) {
  const toneStyles = {
    default: { background: "#e5e7eb", color: "#374151" },
    info: { background: "#dbeafe", color: "#1e40af" },
    success: { background: "#dcfce7", color: "#166534" },
    warning: { background: "#fef3c7", color: "#92400e" },
    error: { background: "#fee2e2", color: "#991b1b" },
    muted: { background: "#f3f4f6", color: "#6b7280" }
  };

  const style = toneStyles[tone] || toneStyles.default;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 12px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        ...style
      }}
    >
      {text}
    </span>
  );
}

/* ---------- Página ---------- */
export default function EmpresaPostulacionesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [applications, setApplications] = useState([]);
  const [filteredApps, setFilteredApps] = useState([]);
  const [selectedVacancy, setSelectedVacancy] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("activas"); // 👈 Cambiado a "activas" por defecto
  const [vacancies, setVacancies] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);

  const isMobile = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setLoading(true);
        setErr("");

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        
        if ((profile?.role ?? "student") !== "company") {
          router.replace("/alumno/buscar");
          return;
        }

        // Obtener la empresa del usuario
        const { data: company, error: companyError } = await supabase
          .from("companies")
          .select("id")
          .eq("owner_id", user.id)
          .single();

        if (!company || companyError) {
          setErr("No se encontró tu empresa.");
          setLoading(false);
          return;
        }

        // Obtener todas las vacantes de la empresa
        const { data: companyVacancies, error: vacError } = await supabase
          .from("vacancies")
          .select("id, title, status")
          .eq("company_id", company.id)
          .order("created_at", { ascending: false });

        if (vacError) throw vacError;
        
        if (!ignore) {
          setVacancies(companyVacancies || []);
        }

        // Obtener todas las postulaciones para las vacantes de la empresa
        if (companyVacancies && companyVacancies.length > 0) {
          const vacancyIds = companyVacancies.map(v => v.id);
          
          const { data: allApplications, error: appsError } = await supabase
            .from("applications")
            .select(`
              id,
              applied_at,
              status,
              student_id,
              vacancy_id,
              profiles!applications_student_id_fkey (
                id, 
                full_name, 
                avatar_url,
                email,
                program_id,
                cv_url,
                programs (
                  name
                )
              ),
              vacancies!applications_vacancy_id_fkey (
                id, 
                title,
                modality,
                compensation,
                activities,
                requirements,
                location_text,
                company:companies!vacancies_company_id_fkey (
                  id,
                  name,
                  logo_url
                )
              )
            `)
            .in("vacancy_id", vacancyIds)
            .order("applied_at", { ascending: false });

          if (appsError) throw appsError;

          if (!ignore) {
            const formattedApps = allApplications?.map(app => ({
              id: app.id,
              applied_at: app.applied_at,
              status: app.status,
              student: app.profiles,
              vacancy: app.vacancies
            })) || [];
            
            setApplications(formattedApps);
            setFilteredApps(formattedApps);
            setSelectedApp(formattedApps[0] || null);
          }
        }

        setLoading(false);
      } catch (e) {
        console.error(e);
        if (!ignore) {
          setErr(e.message || "Error cargando las postulaciones.");
          setLoading(false);
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, [router]);

  // Filtrar postulaciones - VERSIÓN CORREGIDA 👇
  useEffect(() => {
    let filtered = applications;
    
    if (selectedVacancy !== "all") {
      filtered = filtered.filter(app => app.vacancy?.id === selectedVacancy);
    }
    
    if (selectedStatus !== "all") {
      if (selectedStatus === "activas") {
        // Mostrar solo postulaciones activas (no finalizadas/completadas)
        filtered = filtered.filter(app => 
          !['completada', 'finalizada'].includes(app.status?.toLowerCase())
        );
      } else {
        filtered = filtered.filter(app => app.status === selectedStatus);
      }
    }
    
    setFilteredApps(filtered);
    // Actualizar selectedApp si el actual fue filtrado
    if (selectedApp && !filtered.find(app => app.id === selectedApp.id)) {
      setSelectedApp(filtered[0] || null);
    }
  }, [selectedVacancy, selectedStatus, applications, selectedApp]);

  // Funciones corregidas para mapeo de estados 👇
  const getStatusText = (status) => {
    const statusMap = {
      'postulada': 'Pendiente',
      'pendiente': 'Pendiente',
      'revisada': 'Revisada',
      'entrevista': 'En entrevista',
      'oferta': 'Oferta enviada',
      'aceptada': 'Práctica activa',
      'completada': 'Práctica completada',
      'finalizada': 'Práctica finalizada',
      'cancelada': 'Cancelada',
      'rechazada': 'Rechazada'
    };
    return statusMap[status?.toLowerCase()] || status || 'Pendiente';
  };

  const getStatusBadgeTone = (status) => {
    switch (status?.toLowerCase()) {
      case 'postulada':
      case 'pendiente':
        return 'warning';
      case 'revisada':
      case 'entrevista':
        return 'info';
      case 'oferta':
        return 'info';
      case 'aceptada':
        return 'success';
      case 'completada':
      case 'finalizada':
        return 'muted';
      case 'rechazada':
      case 'cancelada':
        return 'error';
      default:
        return 'muted';
    }
  };

  const updateApplicationStatus = async (applicationId, newStatus) => {
    try {
      // 1. Actualizar el estado de la aplicación
      const { error: updateError } = await supabase
        .from("applications")
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", applicationId);

      if (updateError) throw updateError;

      // 2. Si es una oferta, crear notificación
      if (newStatus === 'oferta') {
        await createOfferNotification(applicationId);
      }

      // 3. Actualizar estado local
      setApplications(prev => prev.map(app => 
        app.id === applicationId ? { ...app, status: newStatus } : app
      ));

      if (selectedApp && selectedApp.id === applicationId) {
        setSelectedApp(prev => ({ ...prev, status: newStatus }));
      }

      console.log(`Estado actualizado a: ${newStatus}`);

    } catch (error) {
      console.error("Error actualizando estado:", error);
      alert("No se pudo actualizar el estado.");
    }
  };

  // Función auxiliar corregida para crear notificación de oferta
  const createOfferNotification = async (applicationId) => {
    try {
      console.log("Creando notificación para aplicación:", applicationId);
      
      // Primero obtener los datos básicos de la aplicación
      const { data: applicationData, error: appError } = await supabase
        .from("applications")
        .select(`
          student_id,
          vacancy_id,
          vacancies (
            title,
            companies (
              name
            )
          )
        `)
        .eq("id", applicationId)
        .single();

      if (appError) {
        console.error("Error obteniendo aplicación:", appError);
        return;
      }

      console.log("Datos de aplicación obtenidos:", applicationData);

      if (applicationData && applicationData.vacancies) {
        const companyName = applicationData.vacancies.companies?.name || "la empresa";
        const vacancyTitle = applicationData.vacancies.title || "la vacante";
        
        // Llamar a la función de base de datos
        const { data: notificationId, error: functionError } = await supabase
          .rpc('create_company_notification', {
            p_student_id: applicationData.student_id,
            p_application_id: applicationId,
            p_type: 'offer',
            p_title: '¡Tienes una oferta! 🎉',
            p_body: `${companyName} te ha enviado una oferta para: "${vacancyTitle}"`,
            p_action_url: '/alumno/ofertas'
          });

        if (functionError) {
          console.error("Error llamando a función de notificación:", functionError);
          throw functionError;
        }
        
        console.log("Notificación de oferta creada exitosamente. ID:", notificationId);
      } else {
        console.error("No se pudieron obtener los datos completos de la aplicación");
      }

    } catch (error) {
      console.error("Error en createOfferNotification:", error);
    }
  };

  const handleSendOffer = (applicationId) => {
    if (confirm("¿Enviar oferta a este alumno?")) {
      updateApplicationStatus(applicationId, 'oferta');
    }
  };

  const handleReject = (applicationId) => {
    if (confirm("¿Rechazar esta postulación?")) {
      updateApplicationStatus(applicationId, 'rechazada');
    }
  };

  // Helper para formato de fecha relativa
  const timeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    return date.toLocaleDateString('es-MX');
  };

  return (
    <>
      <Navbar />
      <main className="jobs-wrap">
        {err && <div className="jobs-error">{err}</div>}

        <div className="profile-container">

          {/* Filtros - VERSIÓN ACTUALIZADA 👇 */}
          <section className="panel-card" style={{ marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: 16 }}>Filtros</h3>
            <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                  Vacante
                </label>
                <select
                  value={selectedVacancy}
                  onChange={(e) => setSelectedVacancy(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    minWidth: 200
                  }}
                >
                  <option value="all">Todas las vacantes</option>
                  {vacancies.map(vac => (
                    <option key={vac.id} value={vac.id}>
                      {vac.title}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                  Estado
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    minWidth: 180
                  }}
                >
                  <option value="activas">Solo activas</option>
                  <option value="all">Todas las postulaciones</option>
                  <option value="postulada">Pendiente</option>
                  <option value="oferta">Oferta</option>
                  <option value="aceptada">Práctica activa</option>
                  <option value="completada">Práctica completada</option>
                  <option value="finalizada">Práctica finalizada</option>
                  <option value="rechazada">Rechazada</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setSelectedVacancy("all");
                    setSelectedStatus("activas"); // 👈 Reset a "activas"
                  }}
                >
                  Limpiar filtros
                </button>
              </div>
            </div>
          </section>

          {/* UI: grid principal */}
          <section className="jobs-grid">
            {/* UI: listado izquierda */}
            <aside className="jobs-listing">
              {loading && Array.from({ length: 6 }).map((_, i) => <div key={i} className="jobs-card sk" />)}
              {!loading && filteredApps.length === 0 && (
                <div className="jobs-empty small">
                  {applications.length === 0 
                    ? "No hay postulaciones para tus vacantes."
                    : "No hay postulaciones que coincidan con los filtros."
                  }
                </div>
              )}

              {!loading && filteredApps.map((app) => (
                <button
                  key={app.id}
                  className={`jobs-card ${selectedApp?.id === app.id ? "is-active" : ""}`}
                  onClick={() => {
                    if (isMobile()) {
                      console.log("App seleccionada:", app.id);
                    } else {
                      setSelectedApp(app);
                    }
                  }}
                >
                  <div className="jobs-card-left" />
                  <div className="jobs-card-body">
                    <div className="jobs-card-top" style={{ justifyContent: "space-between" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            overflow: 'hidden',
                            background: '#e5e7eb',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {app.student?.avatar_url ? (
                            <img
                              src={app.student.avatar_url}
                              alt={app.student.full_name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <span style={{ fontSize: 14, color: '#6b7280' }}>
                              {(app.student?.full_name?.[0] || 'A').toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <h4 className="jobs-card-title">{app.student?.full_name || 'Alumno sin nombre'}</h4>
                          <div className="jobs-card-company">{app.vacancy?.title || 'Vacante sin título'}</div>
                          <div className="jobs-card-rating">
                            <span className="jobs-muted small">
                              {app.student?.programs?.name || 'Programa no especificado'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="jobs-meta">
                      <Badge text={getStatusText(app.status)} tone={getStatusBadgeTone(app.status)} />
                      <span>{timeAgo(app.applied_at)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </aside>

            {/* UI: detalle derecha */}
            <article className="jobs-detail">
              {loading && <div className="jobs-skeleton">Cargando…</div>}
              {!loading && !selectedApp && filteredApps.length > 0 && (
                <div className="jobs-empty">Selecciona una postulación.</div>
              )}

              {!loading && selectedApp && (
                <div className="jobs-detail-inner">
                  {/* UI: encabezado postulación */}
                  <header className="jobs-detail-head">
                    <div className="jobs-detail-titles">
                      <h2 className="jobs-title">{selectedApp.student?.full_name || 'Alumno sin nombre'}</h2>
                      <div className="jobs-company">{selectedApp.vacancy?.title || 'Vacante sin título'}</div>
                      <div className="jobs-rating">
                        <Badge text={getStatusText(selectedApp.status)} tone={getStatusBadgeTone(selectedApp.status)} />
                      </div>
                    </div>
                  </header>

                  {/* UI: información del alumno */}
                  <div className="jobs-chips">
                    <span className="jobs-chip">{selectedApp.student?.email || 'Sin email'}</span>
                    <span className="jobs-chip">{selectedApp.student?.programs?.name || 'Programa no especificado'}</span>
                    <span className="jobs-chip">
                      Postuló: {timeAgo(selectedApp.applied_at)}
                    </span>
                  </div>

                  {selectedApp.student?.cv_url && (
                    <div style={{ marginBottom: 16 }}>
                      <a
                        href={selectedApp.student.cv_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost"
                        style={{ fontSize: 14 }}
                      >
                        📄 Ver CV
                      </a>
                    </div>
                  )}

                  <hr className="jobs-sep" />

                  {/* UI: información de la vacante */}
                  <section className="jobs-section">
                    <h3>Información de la Vacante</h3>
                    <div className="jobs-chips">
                      <span className="jobs-chip">{fmtMod(selectedApp.vacancy?.modality)}</span>
                      <span className="jobs-chip">{fmtComp(selectedApp.vacancy?.compensation)}</span>
                    </div>
                  </section>

                  {/* UI: actividades */}
                  {selectedApp.vacancy?.activities && (
                    <section className="jobs-section">
                      <h3>Actividades</h3>
                      <ul className="jobs-list">
                        {splitLines(selectedApp.vacancy?.activities).map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </section>
                  )}

                  {/* UI: requisitos */}
                  {selectedApp.vacancy?.requirements && (
                    <section className="jobs-section">
                      <h3>Requisitos</h3>
                      <ul className="jobs-list">
                        {splitLines(selectedApp.vacancy?.requirements).map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </section>
                  )}

                  {/* UI: Acciones según estado - VERSIÓN ACTUALIZADA 👇 */}
                  <section className="jobs-section">
                    <h3>Gestionar Postulación</h3>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      {selectedApp.status === 'postulada' || selectedApp.status === 'pendiente' ? (
                        <>
                          <button
                            className="jobs-apply"
                            onClick={() => handleSendOffer(selectedApp.id)}
                          >
                            Enviar oferta
                          </button>
                          <button
                            className="btn btn-ghost"
                            onClick={() => handleReject(selectedApp.id)}
                          >
                            Rechazar
                          </button>
                        </>
                      ) : selectedApp.status === 'oferta' ? (
                        <Badge text="Oferta enviada - Esperando respuesta" tone="info" />
                      ) : selectedApp.status === 'aceptada' ? (
                        <Badge text="✅ Práctica en curso" tone="success" />
                      ) : selectedApp.status === 'completada' || selectedApp.status === 'finalizada' ? (
                        <Badge text="🏁 Práctica finalizada" tone="muted" />
                      ) : selectedApp.status === 'rechazada' ? (
                        <Badge text="Postulación rechazada" tone="error" />
                      ) : (
                        <Badge text={getStatusText(selectedApp.status)} tone={getStatusBadgeTone(selectedApp.status)} />
                      )}
                    </div>
                  </section>
                </div>
              )}
            </article>
          </section>
        </div>
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