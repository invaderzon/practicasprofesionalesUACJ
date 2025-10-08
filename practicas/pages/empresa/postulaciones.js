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
  const [selectedStatus, setSelectedStatus] = useState("all");
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

  // Filtrar postulaciones
  useEffect(() => {
    let filtered = applications;
    
    if (selectedVacancy !== "all") {
      filtered = filtered.filter(app => app.vacancy?.id === selectedVacancy);
    }
    
    if (selectedStatus !== "all") {
      filtered = filtered.filter(app => app.status === selectedStatus);
    }
    
    setFilteredApps(filtered);
    // Actualizar selectedApp si el actual fue filtrado
    if (selectedApp && !filtered.find(app => app.id === selectedApp.id)) {
      setSelectedApp(filtered[0] || null);
    }
  }, [selectedVacancy, selectedStatus, applications, selectedApp]);

  const getStatusText = (status) => {
    const statusMap = {
      'postulada': 'Postulada',
      'pendiente': 'Pendiente',
      'revisada': 'Revisada',
      'entrevista': 'Entrevista',
      'oferta': 'Oferta enviada',
      'aceptada': 'Aceptada por alumno',
      'rechazada': 'Rechazada',
      'completada': 'Completada',
      'en_proceso': 'En proceso',
      'finalizada': 'Finalizada',
      'retirada': 'Retirada'
    };
    return statusMap[status?.toLowerCase()] || 'Postulada';
  };

  const getStatusBadgeTone = (status) => {
    switch (status?.toLowerCase()) {
      case 'postulada':
      case 'pendiente':
        return 'warning';
      case 'oferta':
        return 'info';
      case 'aceptada':
      case 'completada':
      case 'finalizada':
        return 'success';
      case 'rechazada':
      case 'retirada':
        return 'error';
      case 'en_proceso':
        return 'default';
      default:
        return 'muted';
    }
  };

  const updateApplicationStatus = async (applicationId, newStatus) => {
  try {
    console.log("🔍 [DEBUG] Iniciando actualización:", {
      applicationId,
      newStatus,
      timestamp: new Date().toISOString()
    });

    // 1. Primero verificar que la aplicación existe y podemos acceder a ella
    const { data: currentApp, error: fetchError } = await supabase
      .from("applications")
      .select("id, status, student_id, vacancy_id")
      .eq("id", applicationId)
      .single();

    console.log("🔍 [DEBUG] Aplicación encontrada:", currentApp);
    console.log("🔍 [DEBUG] Error al buscar:", fetchError);

    if (fetchError) {
      console.error("❌ Error buscando aplicación:", fetchError);
      throw new Error(`No se pudo encontrar la aplicación: ${fetchError.message}`);
    }

    if (!currentApp) {
      throw new Error("No se encontró la aplicación en la base de datos");
    }

    // 2. Verificar permisos - que la vacante pertenece a nuestra empresa
    const { data: { user } } = await supabase.auth.getUser();
    console.log("🔍 [DEBUG] Usuario actual:", user?.id);

    const { data: vacancyCheck, error: vacancyError } = await supabase
      .from("vacancies")
      .select("company_id, companies!inner(owner_id)")
      .eq("id", currentApp.vacancy_id)
      .single();

    console.log("🔍 [DEBUG] Verificación de vacante:", vacancyCheck);
    console.log("🔍 [DEBUG] Error verificación:", vacancyError);

    if (vacancyError || !vacancyCheck) {
      throw new Error("No tienes permisos para modificar esta aplicación");
    }

    // 3. Ahora intentar la actualización
    console.log("🔍 [DEBUG] Intentando actualizar con status:", newStatus);
    
    const { data, error } = await supabase
      .from("applications")
      .update({ 
        status: newStatus
      })
      .eq("id", applicationId)
      .select();

    console.log("🔍 [DEBUG] Respuesta de actualización:", {
      data,
      error,
      hasData: !!data,
      dataLength: data?.length
    });

    if (error) {
      console.error("❌ Error de Supabase en actualización:", error);
      throw error;
    }

    if (!data || data.length === 0) {
      // Esto es extraño - la actualización no devolvió datos pero tampoco error
      console.warn("⚠️ Actualización no devolvió datos pero tampoco error");
      
      // Verificar si realmente se actualizó
      const { data: verifyData } = await supabase
        .from("applications")
        .select("status")
        .eq("id", applicationId)
        .single();
        
      console.log("🔍 [DEBUG] Verificación post-actualización:", verifyData);
      
      if (verifyData && verifyData.status === newStatus) {
        console.log("✅ Actualización exitosa (verificada)");
        // Actualizar UI aunque no vengan datos
        setApplications(prev => prev.map(app => 
          app.id === applicationId ? { ...app, status: newStatus } : app
        ));

        if (selectedApp && selectedApp.id === applicationId) {
          setSelectedApp(prev => ({ ...prev, status: newStatus }));
        }
        return true;
      } else {
        throw new Error("La actualización no se realizó correctamente");
      }
    }

    console.log("✅ [DEBUG] Actualización exitosa con datos:", data[0]);

    // Actualizar el estado local
    setApplications(prev => prev.map(app => 
      app.id === applicationId ? { ...app, status: newStatus } : app
    ));

    // Actualizar selectedApp si es necesario
    if (selectedApp && selectedApp.id === applicationId) {
      setSelectedApp(prev => ({ ...prev, status: newStatus }));
    }

    return true;
  } catch (error) {
    console.error("❌ Error completo actualizando estado:", error);
    alert(`No se pudo actualizar el estado: ${error.message}`);
    return false;
  }
};

  const createNotificationForStudent = async (studentId, type, title, body) => {
  try {
    console.log("📨 [DEBUG] ===== INICIANDO CREACIÓN DE NOTIFICACIÓN =====");
    
    // 1. Verificar autenticación
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log("📨 [DEBUG] Usuario autenticado:", user?.id);
    
    if (!user) {
      console.error("❌ No hay usuario autenticado");
      return false;
    }

    // 2. Verificar que el usuario es una empresa
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    console.log("📨 [DEBUG] Perfil del usuario:", userProfile);
    
    if (profileError || userProfile?.role !== 'company') {
      console.error("❌ Usuario no es una empresa. Rol:", userProfile?.role);
      return false;
    }

    // 3. Verificar que existe una empresa asociada
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name')
      .eq('owner_id', user.id)
      .single();

    console.log("📨 [DEBUG] Empresa del usuario:", company);
    
    if (companyError || !company) {
      console.error("❌ Usuario no tiene empresa asociada");
      return false;
    }

    // 4. VERIFICACIÓN CRÍTICA: Asegurar que el studentId es válido
    console.log("📨 [DEBUG] Verificando studentId:", studentId);
    
    const { data: student, error: studentError } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', studentId)
      .single();

    console.log("📨 [DEBUG] Resultado verificación estudiante:", {
      student,
      error: studentError,
      studentIdProvided: studentId,
      studentIdFromDB: student?.id,
      matches: student?.id === studentId
    });

    if (studentError || !student) {
      console.error("❌ Estudiante no encontrado:", studentError);
      return false;
    }

    if (student.role !== 'student') {
      console.error("❌ El usuario destino no es un estudiante");
      return false;
    }

    // 5. Crear la notificación con datos mínimos
    console.log("📨 [DEBUG] Insertando notificación...");
    
    const notificationData = {
      student_id: studentId, // Usar el ID verificado
      type: type,
      title: title,
      body: body,
      action_url: "/alumno/ofertas",
      created_at: new Date().toISOString()
    };

    console.log("📨 [DEBUG] Datos de notificación:", notificationData);

    const { data, error } = await supabase
      .from("notifications")
      .insert(notificationData)
      .select();

    console.log("📨 [DEBUG] Respuesta completa:", {
      data: data?.[0],
      error: error ? {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      } : null
    });

    if (error) {
      console.error("❌ Error de Supabase:", error);
      return false;
    }

    if (data && data.length > 0) {
      console.log("✅ Notificación creada exitosamente. ID:", data[0].id);
      return true;
    }

    return false;

  } catch (error) {
    console.error("❌ Error inesperado:", error);
    return false;
  }
};



  const handleSendOffer = async (applicationId) => {
  if (!confirm("¿Enviar oferta a este alumno? Se le notificará para que confirme su aceptación.")) {
    return;
  }

  try {
    console.log("🎯 [DEBUG] ===== INICIANDO ENVÍO DE OFERTA =====");
    
    // 1. Obtener los datos COMPLETOS de la aplicación primero
    console.log("🎯 [DEBUG] Paso 1: Obteniendo datos de aplicación...");
    const { data: application, error: fetchError } = await supabase
      .from('applications')
      .select(`
        id,
        student_id,
        status,
        vacancies (
          title,
          company:companies (
            name,
            owner_id
          )
        )
      `)
      .eq('id', applicationId)
      .single();

    if (fetchError || !application) {
      console.error("❌ Error obteniendo aplicación:", fetchError);
      alert("❌ No se pudo obtener la información de la aplicación.");
      return;
    }

    console.log("🎯 [DEBUG] Datos de aplicación:", {
      applicationId: application.id,
      studentId: application.student_id,
      currentStatus: application.status,
      vacancyTitle: application.vacancies?.title,
      companyName: application.vacancies?.company?.name,
      companyOwner: application.vacancies?.company?.owner_id
    });

    const studentId = application.student_id;
    const vacancyTitle = application.vacancies?.title || 'la vacante';
    const companyName = application.vacancies?.company?.name || 'la empresa';

    if (!studentId) {
      console.error("❌ No hay student_id en la aplicación");
      alert("❌ No se puede enviar oferta: ID de estudiante no disponible.");
      return;
    }

    // 2. Actualizar el estado
    console.log("🎯 [DEBUG] Paso 2: Actualizando estado de aplicación...");
    const { data: updateData, error: updateError } = await supabase
      .from("applications")
      .update({ 
        status: 'oferta',
      })
      .eq('id', applicationId)
      .select();

    if (updateError) {
      console.error("❌ Error actualizando aplicación:", updateError);
      alert("❌ No se pudo actualizar el estado de la aplicación.");
      return;
    }

    console.log("✅ Estado de aplicación actualizado correctamente");

    // 3. Crear notificación
    console.log("🎯 [DEBUG] Paso 3: Creando notificación...");
    const notificationSuccess = await createNotificationForStudent(
      studentId,
      'offer',
      '¡Tienes una nueva oferta!',
      `La empresa ${companyName} te ha enviado una oferta para la vacante "${vacancyTitle}". Revisa tus ofertas para aceptarla o rechazarla.`
    );

    console.log("🎯 [DEBUG] Resultado final de notificación:", notificationSuccess);

    if (notificationSuccess) {
      alert("✅ Oferta enviada correctamente. El alumno ha sido notificado.");
      
      // Actualizar UI
      setApplications(prev => prev.map(app => 
        app.id === applicationId ? { ...app, status: 'oferta' } : app
      ));

      if (selectedApp && selectedApp.id === applicationId) {
        setSelectedApp(prev => ({ ...prev, status: 'oferta' }));
      }
    } else {
      alert("⚠️ Oferta enviada pero hubo un problema con la notificación. El estado se actualizó pero el alumno no recibió notificación.");
    }

  } catch (error) {
    console.error("❌ Error completo en handleSendOffer:", error);
    alert("❌ Error al enviar la oferta: " + error.message);
  }
};

  const handleReject = async (applicationId) => {
    if (confirm("¿Rechazar esta postulación? Se le notificará al alumno.")) {
      const success = await updateApplicationStatus(applicationId, 'rechazada');
      
      if (success && selectedApp) {
        // Crear notificación para el alumno
        await createNotificationForStudent(
          selectedApp.student.id,
          'rejected',
          'Actualización de tu postulación',
          `Lamentamos informarte que tu postulación para "${selectedApp.vacancy?.title}" en ${selectedApp.vacancy?.company?.name} no ha sido seleccionada.`,
          // En createNotificationForStudent, después de verificar el estudiante:
console.log("📨 [DEBUG] Comparando studentId:"),
console.log("📨 [DEBUG] - studentId recibido:", studentId),
console.log("📨 [DEBUG] - studentId de BD:", student.id),
console.log("📨 [DEBUG] - ¿Coinciden?:", studentId === student.id),
console.log("📨 [DEBUG] - Tipo de studentId:", typeof studentId),
console.log("📨 [DEBUG] - Tipo de student.id:", typeof student.id)
        );
      }
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

          {/* Filtros */}
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
                  <option value="all">Todos los estados</option>
                  <option value="postulada">Postulada</option>
                  <option value="oferta">Oferta enviada</option>
                  <option value="aceptada">Aceptada por alumno</option>
                  <option value="rechazada">Rechazada</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setSelectedVacancy("all");
                    setSelectedStatus("all");
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
                      // Para móvil podrías redirigir a una página de detalle
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

                  {/* UI: Acciones según estado - SOLO PARA EMPRESA */}
                  <section className="jobs-section">
                    <h3>Gestionar Postulación</h3>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      {selectedApp.status === 'postulada' ? (
                        <>
                          <button
                            className="jobs-apply"
                            onClick={() => handleSendOffer(selectedApp.id)}
                          >
                            📨 Enviar oferta
                          </button>
                          <button
                            className="btn btn-ghost"
                            onClick={() => handleReject(selectedApp.id)}
                          >
                            ❌ Rechazar
                          </button>
                        </>
                      ) : selectedApp.status === 'oferta' ? (
                        <div>
                          <Badge text="Oferta enviada - Esperando respuesta del alumno" tone="info" />
                          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>
                            El alumno ha sido notificado y debe confirmar si acepta la oferta.
                          </p>
                        </div>
                      ) : selectedApp.status === 'aceptada' ? (
                        <Badge text="✅ Oferta aceptada por el alumno" tone="success" />
                      ) : selectedApp.status === 'rechazada' ? (
                        <Badge text="❌ Postulación rechazada" tone="error" />
                      ) : selectedApp.status === 'en_proceso' ? (
                        <Badge text="🔄 Práctica en proceso" tone="default" />
                      ) : selectedApp.status === 'completada' ? (
                        <Badge text="✅ Práctica completada" tone="success" />
                      ) : null}
                    </div>
                  </section>
                </div>
              )}
            </article>
          </section>
        </div>


        {/* DIAGNÓSTICO Y PRUEBAS DEL SISTEMA DE NOTIFICACIONES */}
<div style={{ margin: "20px 0", padding: "15px", background: "#e7f3ff", border: "1px solid #b3d9ff", borderRadius: "8px" }}>
  <h4 style={{ margin: "0 0 15px 0", color: "#0066cc" }}>🔧 DIAGNÓSTICO DEL SISTEMA DE NOTIFICACIONES</h4>
  
  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
    {/* Test 1: Diagnóstico completo */}
    <button
      onClick={async () => {
        console.log("🧪 [DIAGNÓSTICO COMPLETO] Iniciando...");
        
        // 1. Verificar usuario
        const { data: { user } } = await supabase.auth.getUser();
        console.log("🧪 Usuario actual:", user?.id);
        
        if (!user) {
          alert("❌ No hay usuario autenticado");
          return;
        }

        // 2. Verificar perfil
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', user.id)
          .single();
        console.log("🧪 Perfil:", profile);

        // 3. Verificar empresa
        const { data: company } = await supabase
          .from('companies')
          .select('id, name, owner_id')
          .eq('owner_id', user.id)
          .single();
        console.log("🧪 Empresa:", company);

        // 4. Buscar un estudiante real para probar
        const { data: student } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .eq('role', 'student')
          .limit(1)
          .single();
        
        console.log("🧪 Estudiante de prueba:", student);

        if (student) {
          // 5. Probar notificación con la función corregida
          const result = await createNotificationForStudent(
            student.id,
            'offer',
            'TEST - Oferta de prueba',
            'Esta es una notificación de prueba del sistema de diagnóstico.'
          );
          
          console.log("🧪 Resultado final del diagnóstico:", result);
          alert(result ? 
            "✅ Diagnóstico EXITOSO: Notificación creada correctamente" : 
            "❌ Diagnóstico FALLÓ: Revisa la consola para detalles"
          );
        } else {
          alert("❌ No se encontraron estudiantes para probar");
        }
      }}
      style={{ 
        background: "#0066cc", 
        color: "white", 
        padding: "10px 15px", 
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "14px"
      }}
    >
      🔍 Ejecutar Diagnóstico Completo
    </button>

    {/* Test 2: Ver notificaciones existentes */}
    <button
      onClick={async () => {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (error) {
          console.error("Error al obtener notificaciones:", error);
          alert("❌ Error al obtener notificaciones: " + error.message);
        } else {
          console.log("Últimas notificaciones:", data);
          alert(`📊 Hay ${data?.length || 0} notificaciones en la base de datos. Revisa la consola para ver los detalles.`);
        }
      }}
      style={{ 
        background: "#28a745", 
        color: "white", 
        padding: "10px 15px", 
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "14px"
      }}
    >
      📊 Ver Notificaciones en BD
    </button>

    {/* Test 3: Test de inserción directa (simplificado) */}
    <button
      onClick={async () => {
        console.log("🧪 [TEST DIRECTO SIMPLIFICADO] Iniciando...");
        
        // Usar un estudiante real de la base de datos
        const { data: student } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('role', 'student')
          .limit(1)
          .single();

        if (!student) {
          alert("❌ No se encontró ningún estudiante en la base de datos");
          return;
        }

        console.log("🧪 [TEST] StudentId:", student.id);
        console.log("🧪 [TEST] Usuario actual...");
        
        const { data: { user } } = await supabase.auth.getUser();
        console.log("🧪 [TEST] Usuario:", user?.id);
        
        // Inserción directa pero con verificación
        console.log("🧪 [TEST] Insertando notificación...");
        const { data, error } = await supabase
          .from('notifications')
          .insert({
            student_id: student.id,
            type: 'offer',
            title: 'TEST DIRECTO SIMPLIFICADO',
            body: 'Notificación de prueba directa usando estudiante real de la BD',
            action_url: '/alumno/ofertas',
            created_at: new Date().toISOString()
          })
          .select();
        
        console.log("🧪 [TEST] Resultado:", {
          data: data?.[0],
          error: error ? {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
          } : null
        });
        
        if (error) {
          alert("❌ Error en test directo: " + error.message + " (Código: " + error.code + ")");
        } else {
          alert("✅ Test directo EXITOSO! ID: " + data[0]?.id);
        }
      }}
      style={{ 
        background: "#dc3545", 
        color: "white", 
        padding: "10px 15px", 
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "14px"
      }}
    >
      🧪 Test Inserción Directa
    </button>

    {/* Test 4: Verificar políticas RLS */}
    <button
      onClick={async () => {
        // Verificar políticas actuales
        const { data: policies } = await supabase
          .from('pg_policies')
          .select('*')
          .eq('tablename', 'notifications');
        
        console.log("🔐 Políticas RLS de notifications:", policies);
        alert(`🔐 Hay ${policies?.length || 0} políticas RLS para la tabla notifications. Revisa la consola para detalles.`);
      }}
      style={{ 
        background: "#6f42c1", 
        color: "white", 
        padding: "10px 15px", 
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "14px"
      }}
    >
      🔐 Verificar Políticas RLS
    </button>
  </div>

  <div style={{ marginTop: "15px", fontSize: "12px", color: "#666" }}>
    <p><strong>Instrucciones:</strong></p>
    <ol style={{ margin: "5px 0", paddingLeft: "20px" }}>
      <li>Ejecuta "Diagnóstico Completo" primero para verificar todo el sistema</li>
      <li>Si falla, usa "Test Inserción Directa" para probar solo la inserción</li>
      <li>Verifica las notificaciones existentes con el botón verde</li>
      <li>Revisa la consola del navegador (F12) para logs detallados</li>
    </ol>
  </div>
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