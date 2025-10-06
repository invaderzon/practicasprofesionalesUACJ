// pages/empresa/vacante/[id].js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Navbar from "../../../components/navbar";
import Footer from "../../../components/footer";
import { supabase } from "../../../lib/supabaseClient";

/* --- helpers UI<->BD para mostrar bonito --- */
const MAP_DB_TO_UI = {
  modalidad: { presencial: "Presencial", "híbrido": "Híbrida", remoto: "Remota" },
  comp: { "Apoyo económico": "Apoyo económico", "Sin apoyo": "Sin apoyo" },
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

// Componente para mostrar postulaciones
function StudentCard({ app, program, onSendOffer, onReject, canOffer }) {
  const [open, setOpen] = useState(false);
  
  const subtitle = (() => {
    if (app.student?.email) return app.student.email;
    if (program?.key || program?.name) return `${program?.key ?? ""}${program?.key && program?.name ? " — " : ""}${program?.name ?? ""}`;
    return "Alumno";
  })();

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'postulada': return { bg: '#fef3c7', color: '#92400e', text: 'Pendiente' };
      case 'oferta': return { bg: '#dbeafe', color: '#1e40af', text: 'Oferta' };
      case 'aceptada': return { bg: '#dcfce7', color: '#166534', text: 'Aceptada' };
      case 'rechazada': return { bg: '#fecaca', color: '#dc2626', text: 'Rechazada' };
      default: return { bg: '#f3f4f6', color: '#6b7280', text: status || 'Estado' };
    }
  };

  const status = getStatusColor(app.status);

  return (
    <div className="empresa-student-card">
      <div 
        className="empresa-student-header"
        onClick={() => setOpen(!open)}
      >
        <div className="empresa-student-avatar">
          {app.student?.avatar_url ? (
            <img src={app.student.avatar_url} alt={app.student.full_name} />
          ) : (
            <div className="empresa-student-avatar-fallback">
              {(app.student?.full_name?.[0] || 'A').toUpperCase()}
            </div>
          )}
        </div>
        
        <div className="empresa-student-info">
          <div className="empresa-student-name">
            {app.student?.full_name || 'Estudiante'}
          </div>
          <div className="empresa-student-subtitle">
            {subtitle}
          </div>
          <div className="empresa-student-meta">
            <span>{new Date(app.applied_at).toLocaleDateString('es-MX')}</span>
          </div>
        </div>
        
        <div className="empresa-student-status">
          <span 
            className="status-badge"
            style={{ 
              backgroundColor: status.bg, 
              color: status.color 
            }}
          >
            {status.text}
          </span>
          <svg 
            width="18" 
            height="18" 
            viewBox="0 0 24 24" 
            style={{ 
              transform: open ? "rotate(180deg)" : "rotate(0)", 
              transition: "transform .15s" 
            }}
          >
            <path fill="currentColor" d="M7 10l5 5 5-5z" />
          </svg>
        </div>
      </div>

      {open && (
        <div className="empresa-student-details">
          <div className="empresa-student-actions">
            {app.status === "postulada" && (
              <>
                <button
                  className="btn btn-primary"
                  onClick={() => onSendOffer(app.id)}
                  disabled={!canOffer}
                >
                  Enviar oferta
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => onReject(app.id)}
                >
                  Rechazar
                </button>
              </>
            )}
            
            {app.student?.cv_url && (
              <a
                href={app.student.cv_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
              >
                📄 Ver CV
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmpresaVacanteDetallePage() {
  const router = useRouter();
  const { isReady, query } = router;
  const { id } = query;

  const [vacancy, setVacancy] = useState(null);
  const [company, setCompany] = useState(null);
  const [applications, setApplications] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [vacancyPrograms, setVacancyPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("detalles"); // "detalles" | "postulaciones"
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState(null);

  // Cargar datos de la vacante, empresa y postulaciones
  useEffect(() => {
    if (!isReady || !id) return;
    
    (async () => {
      setLoading(true);
      setErr("");
      
      try {
        // Obtener usuario y empresa
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login");
          return;
        }

        // Primero obtener la empresa del usuario
        const { data: companyData } = await supabase
          .from("companies")
          .select("id, name, logo_url")
          .eq("owner_id", user.id)
          .single();

        if (!companyData) {
          setErr("No se encontró tu empresa.");
          setLoading(false);
          return;
        }
        setCompany(companyData);

        // Obtener vacante SIN filtrar por company_id primero para debug
        console.log("Buscando vacante con ID:", id);
        const { data: vacancyData, error: vacancyError } = await supabase
          .from("vacancies")
          .select(`
            id, title, modality, compensation, language, requirements, activities,
            location_text, status, spots_total, spots_taken, spots_left, created_at,
            company_id
          `)
          .eq("id", id)
          .single();

        if (vacancyError) {
          console.error("Error al cargar vacante:", vacancyError);
          setErr("No se encontró la vacante.");
          setLoading(false);
          return;
        }

        // Verificar que la vacante pertenezca a la empresa del usuario
        if (vacancyData.company_id !== companyData.id) {
          setErr("No tienes permisos para ver esta vacante.");
          setLoading(false);
          return;
        }

        console.log("Vacante encontrada:", vacancyData);
        setVacancy(vacancyData);

        // Obtener programas asociados a esta vacante
        const { data: vacancyProgramsData } = await supabase
          .from("vacancy_programs")
          .select("program_id")
          .eq("vacancy_id", id);

        const programIds = vacancyProgramsData?.map(vp => vp.program_id) || [];
        setVacancyPrograms(programIds);

        // Obtener todos los programas para el formulario
        const { data: programsData } = await supabase
          .from("programs")
          .select("id, key, name")
          .order("name", { ascending: true });
        setPrograms(programsData || []);

        // Inicializar formulario de edición
        setEditForm({
          id: vacancyData.id,
          title: vacancyData.title || "",
          modality: vacancyData.modality || "presencial",
          compensation: vacancyData.compensation || "Apoyo económico",
          language: vacancyData.language || "ES",
          location_text: vacancyData.location_text || "",
          requirements: vacancyData.requirements || "",
          activities: vacancyData.activities || "",
          status: vacancyData.status || "activa",
          spots_total: Number(vacancyData.spots_total ?? 1),
          program_ids: programIds,
        });

        // Obtener postulaciones
        const { data: appsData } = await supabase
          .from("applications")
          .select(`
            id,
            status,
            applied_at,
            student:profiles ( id, full_name, avatar_url, cv_url, program_id )
          `)
          .eq("vacancy_id", id)
          .order("applied_at", { ascending: false });

        setApplications(appsData || []);

      } catch (error) {
        console.error("Error loading data:", error);
        setErr("Error cargando los datos.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isReady, id, router]);

  const onBack = () => {
    router.push("/empresa/vacantes");
  };

  const toggleStatus = async () => {
    if (!vacancy) return;
    
    const newStatus = vacancy.status === "activa" ? "inactiva" : "activa";
    const ok = confirm(`¿${newStatus === "activa" ? "Activar" : "Desactivar"} esta vacante?`);
    if (!ok) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("vacancies")
        .update({ status: newStatus })
        .eq("id", vacancy.id);

      if (error) throw error;

      setVacancy(prev => ({ ...prev, status: newStatus }));
      setEditForm(prev => ({ ...prev, status: newStatus }));
    } catch (error) {
      alert(error.message || "No se pudo cambiar el estado.");
    } finally {
      setSaving(false);
    }
  };

  const deleteVacancy = async () => {
    if (!vacancy) return;
    
    const ok = confirm(`¿Estás seguro de que quieres ELIMINAR permanentemente la vacante "${vacancy.title}"? Esta acción no se puede deshacer.`);
    if (!ok) return;

    setSaving(true);
    try {
      // Eliminar postulaciones primero
      await supabase
        .from("applications")
        .delete()
        .eq("vacancy_id", vacancy.id);

      // Eliminar programas asociados
      await supabase
        .from("vacancy_programs")
        .delete()
        .eq("vacancy_id", vacancy.id);

      // Eliminar vacante
      const { error } = await supabase
        .from("vacancies")
        .delete()
        .eq("id", vacancy.id);

      if (error) throw error;

      alert("Vacante eliminada correctamente.");
      router.push("/empresa/vacantes");
    } catch (error) {
      alert(error.message || "No se pudo eliminar la vacante.");
    } finally {
      setSaving(false);
    }
  };

  const saveChanges = async (e) => {
    e.preventDefault();
    if (!editForm) return;

    setSaving(true);
    try {
      // Actualizar vacante
      const { error } = await supabase
        .from("vacancies")
        .update({
          title: editForm.title,
          modality: editForm.modality,
          compensation: editForm.compensation,
          language: editForm.language,
          location_text: editForm.location_text,
          requirements: editForm.requirements,
          activities: editForm.activities,
          status: editForm.status,
          spots_total: editForm.spots_total,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editForm.id);

      if (error) throw error;

      // Actualizar programas
      await supabase
        .from("vacancy_programs")
        .delete()
        .eq("vacancy_id", editForm.id);

      if (editForm.program_ids.length > 0) {
        const programRows = editForm.program_ids.map(pid => ({
          vacancy_id: editForm.id,
          program_id: pid
        }));
        const { error: programError } = await supabase
          .from("vacancy_programs")
          .insert(programRows);
        
        if (programError) throw programError;
      }

      // Actualizar estado local
      setVacancy(prev => ({
        ...prev,
        ...editForm
      }));
      setVacancyPrograms([...editForm.program_ids]);
      setEditMode(false);
      alert("Cambios guardados correctamente.");
    } catch (error) {
      alert(error.message || "No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  };

  const sendOffer = async (appId) => {
    if (!vacancy) return;
    
    const ok = confirm("¿Enviar oferta a este alumno?");
    if (!ok) return;

    setSaving(true);
    try {
      const { error } = await supabase.rpc("company_accept_application", {
        p_application_id: appId,
        p_offer_note: null,
        p_days_to_expire: 5
      });

      if (error) throw error;

      // Actualizar estado local
      setApplications(prev => prev.map(app =>
        app.id === appId
          ? { ...app, status: "oferta" }
          : app
      ));
      alert("Oferta enviada correctamente.");
    } catch (error) {
      alert(error.message || "No se pudo enviar la oferta.");
    } finally {
      setSaving(false);
    }
  };

  const rejectApp = async (appId) => {
    const ok = confirm("¿Rechazar esta postulación?");
    if (!ok) return;

    setSaving(true);
    try {
      const { error } = await supabase.rpc("company_set_application_status", {
        p_app_id: appId,
        p_status: "rechazada",
        p_offer_days: 0,
      });

      if (error) throw error;

      setApplications(prev => prev.map(app =>
        app.id === appId
          ? { ...app, status: "rechazada" }
          : app
      ));
      alert("Postulación rechazada.");
    } catch (error) {
      alert(error.message || "No se pudo rechazar la postulación.");
    } finally {
      setSaving(false);
    }
  };

  const canOffer = (app) => {
    return app.status === "postulada" && 
           vacancy?.status === "activa" && 
           (vacancy?.spots_left ?? 1) > 0;
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="jobs-wrap">
          <div className="empresa-vacante-container">
            <div className="empresa-vacante-loading">Cargando...</div>
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
        <div className="empresa-vacante-container">
          {/* Header con botón volver */}
          <div className="empresa-vacante-header">
            
            {vacancy && (
              <div className="empresa-vacante-title-section">
                <h1 className="empresa-vacante-title">
                  {editMode ? "Editar Vacante" : vacancy.title}
                </h1>
                <div className="empresa-vacante-status">
                  <span className={`status-indicator ${vacancy.status}`}>
                    {vacancy.status === "activa" ? "Activa" : "Inactiva"}
                  </span>
                  <span className="empresa-vacante-cupo">
                    Cupo: {vacancy.spots_taken ?? 0}/{vacancy.spots_total ?? 1}
                  </span>
                </div>
              </div>
            )}
          </div>

          {err && (
            <div className="empresa-vacante-error">
              {err}
            </div>
          )}

          {vacancy && (
            <>
              {/* Tabs de navegación */}
              <div className="empresa-vacante-tabs">
                <button
                  className={`empresa-tab ${activeTab === "detalles" ? "active" : ""}`}
                  onClick={() => setActiveTab("detalles")}
                >
                  Detalles
                </button>
                <button
                  className={`empresa-tab ${activeTab === "postulaciones" ? "active" : ""}`}
                  onClick={() => setActiveTab("postulaciones")}
                >
                  Postulaciones ({applications.length})
                </button>
              </div>

              {/* Contenido de los tabs */}
              <div className="empresa-vacante-content">
                {activeTab === "detalles" && (
                  <div className="empresa-vacante-details">
                    {editMode ? (
                      <form onSubmit={saveChanges} className="empresa-edit-form">
                        <div className="empresa-edit-section">
                          <h3>Información General</h3>
                          <div className="empresa-edit-grid">
                            <div className="empresa-edit-field">
                              <label>Título *</label>
                              <input
                                type="text"
                                value={editForm.title}
                                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                                required
                              />
                            </div>
                            <div className="empresa-edit-field">
                              <label>Modalidad</label>
                              <select
                                value={editForm.modality}
                                onChange={(e) => setEditForm(prev => ({ ...prev, modality: e.target.value }))}
                              >
                                <option value="presencial">Presencial</option>
                                <option value="híbrido">Híbrido</option>
                                <option value="remoto">Remoto</option>
                              </select>
                            </div>
                            <div className="empresa-edit-field">
                              <label>Compensación</label>
                              <select
                                value={editForm.compensation}
                                onChange={(e) => setEditForm(prev => ({ ...prev, compensation: e.target.value }))}
                              >
                                <option value="Apoyo económico">Apoyo económico</option>
                                <option value="Sin apoyo">Sin apoyo</option>
                              </select>
                            </div>
                            <div className="empresa-edit-field">
                              <label>Idioma</label>
                              <select
                                value={editForm.language}
                                onChange={(e) => setEditForm(prev => ({ ...prev, language: e.target.value }))}
                              >
                                <option value="ES">Español</option>
                                <option value="EN">Inglés</option>
                              </select>
                            </div>
                            <div className="empresa-edit-field">
                              <label>Ubicación</label>
                              <input
                                type="text"
                                value={editForm.location_text}
                                onChange={(e) => setEditForm(prev => ({ ...prev, location_text: e.target.value }))}
                                placeholder="Ciudad, Estado"
                              />
                            </div>
                            <div className="empresa-edit-field">
                              <label>Cupo total</label>
                              <input
                                type="number"
                                min="1"
                                value={editForm.spots_total}
                                onChange={(e) => setEditForm(prev => ({ ...prev, spots_total: Number(e.target.value) }))}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="empresa-edit-section">
                          <h3>Programas</h3>
                          <div className="empresa-programs-list">
                            {programs.map(program => (
                              <label key={program.id} className="empresa-program-checkbox">
                                <input
                                  type="checkbox"
                                  checked={editForm.program_ids.includes(program.id)}
                                  onChange={(e) => {
                                    const newProgramIds = e.target.checked
                                      ? [...editForm.program_ids, program.id]
                                      : editForm.program_ids.filter(id => id !== program.id);
                                    setEditForm(prev => ({ ...prev, program_ids: newProgramIds }));
                                  }}
                                />
                                <span>{program.key} — {program.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="empresa-edit-section">
                          <h3>Actividades</h3>
                          <textarea
                            value={editForm.activities}
                            onChange={(e) => setEditForm(prev => ({ ...prev, activities: e.target.value }))}
                            rows={4}
                            placeholder="Describe las actividades que realizará el practicante..."
                          />
                        </div>

                        <div className="empresa-edit-section">
                          <h3>Requisitos</h3>
                          <textarea
                            value={editForm.requirements}
                            onChange={(e) => setEditForm(prev => ({ ...prev, requirements: e.target.value }))}
                            rows={4}
                            placeholder="Lista los requisitos necesarios..."
                          />
                        </div>

                        <div className="empresa-edit-actions">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setEditMode(false)}
                            disabled={saving}
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={saving}
                          >
                            {saving ? "Guardando..." : "Guardar Cambios"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        {/* Información de la vacante en modo vista */}
                        <div className="empresa-vacante-info">
                          <div className="empresa-vacante-chips">
                            <span className="empresa-chip">{fmtMod(vacancy.modality)}</span>
                            <span className="empresa-chip">{fmtComp(vacancy.compensation)}</span>
                            <span className="empresa-chip">Idioma {vacancy.language || "ES"}</span>
                            {vacancyPrograms.length > 0 && vacancyPrograms.map(pid => {
                              const program = programs.find(p => p.id === pid);
                              return program ? (
                                <span key={pid} className="empresa-chip">Programa {program.key}</span>
                              ) : null;
                            })}
                          </div>

                          {vacancy.location_text && (
                            <div className="empresa-vacante-location">
                              <svg width="16" height="16" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M12 2A7 7 0 0 0 5 9c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7m0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
                              </svg>
                              {vacancy.location_text}
                            </div>
                          )}

                          {vacancy.activities && (
                            <section className="empresa-vacante-section">
                              <h3>Actividades</h3>
                              <ul className="empresa-list">
                                {splitLines(vacancy.activities).map((t, i) => (
                                  <li key={i}>{t}</li>
                                ))}
                              </ul>
                            </section>
                          )}

                          {vacancy.requirements && (
                            <section className="empresa-vacante-section">
                              <h3>Requisitos</h3>
                              <ul className="empresa-list">
                                {splitLines(vacancy.requirements).map((t, i) => (
                                  <li key={i}>{t}</li>
                                ))}
                              </ul>
                            </section>
                          )}
                        </div>

                        {/* Acciones */}
                        <div className="empresa-vacante-actions">
                          <button
                            className="btn btn-primary"
                            onClick={() => setEditMode(true)}
                          >
                            Editar Vacante
                          </button>
                          <button
                            className="btn btn-ghost"
                            onClick={toggleStatus}
                            disabled={saving}
                          >
                            {vacancy.status === "activa" ? "Desactivar" : "Activar"}
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={deleteVacancy}
                            disabled={saving}
                          >
                            Eliminar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activeTab === "postulaciones" && (
                  <div className="empresa-vacante-applications">
                    {applications.length === 0 ? (
                      <div className="empresa-no-applications">
                        <p>Aún no hay postulaciones para esta vacante.</p>
                      </div>
                    ) : (
                      <div className="empresa-applications-list">
                        {applications.map((app) => {
                          const program = programs.find(p => p.id === app.student?.program_id);
                          return (
                            <StudentCard
                              key={app.id}
                              app={app}
                              program={program}
                              onSendOffer={sendOffer}
                              onReject={rejectApp}
                              canOffer={canOffer(app)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}