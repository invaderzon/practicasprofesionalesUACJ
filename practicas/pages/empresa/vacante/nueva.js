// pages/empresa/vacantes/nueva.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Navbar from "../../../components/navbar";
import Footer from "../../../components/footer";
import { supabase } from "../../../lib/supabaseClient";

export default function NuevaVacantePage() {
  const router = useRouter();
  const [company, setCompany] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [programIds, setProgramIds] = useState([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    title: "",
    modality: "presencial",
    compensation: "Apoyo económico", 
    language: "ES",
    location_text: "",
    requirements: "",
    activities: "",
    status: "activa",
    spots_total: 1
  });

  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          if (mounted) router.replace("/login");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profile?.role !== "company") {
          if (mounted) router.replace("/alumno/buscar");
          return;
        }

        const [companyResult, programsResult] = await Promise.all([
          supabase.from("companies").select("id,name").eq("owner_id", user.id).single(),
          supabase.from("programs").select("id,key,name").order("name", { ascending: true })
        ]);

        if (!mounted) return;

        if (companyResult.error) {
          console.error("Error loading company:", companyResult.error);
          if (mounted) setErr("Error cargando datos de la empresa.");
          return;
        }

        if (!companyResult.data) {
          if (mounted) setErr("Crea tu ficha de empresa primero.");
          return;
        }

        if (mounted) {
          setCompany(companyResult.data);
          setPrograms(programsResult.data || []);
          setErr("");
        }
      } catch (error) {
        console.error("Error loading data:", error);
        if (mounted) setErr("Error cargando los datos.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleInputChange = (field) => (e) => {
    setForm(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };

  const handleSelectChange = (field) => (e) => {
    const value = field === 'spots_total' ? Number(e.target.value) : e.target.value;
    setForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleProgramToggle = (programId) => {
    setProgramIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(programId)) {
        newSet.delete(programId);
      } else {
        newSet.add(programId);
      }
      return Array.from(newSet);
    });
  };

  const save = async () => {
    if (!company) {
      alert("No se encontró la empresa. Verifica tu perfil.");
      return;
    }
    
    if (!form.title.trim()) {
      alert("Escribe un título para la vacante.");
      return;
    }

    setSaving(true);
    
    try {
      const { data: vacancy, error: vacancyError } = await supabase
        .from("vacancies")
        .insert({
          company_id: company.id,
          title: form.title.trim(),
          modality: form.modality,
          compensation: form.compensation,
          language: form.language,
          location_text: form.location_text.trim(),
          requirements: form.requirements.trim(),
          activities: form.activities.trim(),
          spots_total: form.spots_total,
          status: form.status,
        })
        .select("id")
        .single();

      if (vacancyError) throw vacancyError;

      if (programIds.length > 0) {
        const programRows = programIds.map(programId => ({
          vacancy_id: vacancy.id,
          program_id: programId
        }));

        const { error: programError } = await supabase
          .from("vacancy_programs")
          .insert(programRows);

        if (programError) {
          console.warn("Error inserting programs:", programError);
        }
      }

      router.push(`/empresa/vacante/${vacancy.id}`);
      
    } catch (error) {
      console.error("Error saving vacancy:", error);
      alert(error.message || "No se pudo crear la vacante. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="jobs-wrap">
          <div className="nueva-vacante-container">
            <div className="nueva-vacante-loading">Cargando...</div>
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
        <div className="nueva-vacante-container">
          {/* Header */}
          <div className="nueva-vacante-header">
            <h1 className="nueva-vacante-title">Nueva vacante</h1>
            <p className="nueva-vacante-subtitle">
              Completa la información para publicar la vacante
            </p>
          </div>

          {err && (
            <div className="nueva-vacante-error">
              {err}
            </div>
          )}

          {/* Información general */}
          <div className="nueva-vacante-card">
            <h3 className="nueva-vacante-card-title">
              Información general
            </h3>
            
            <div className="nueva-vacante-grid">
              {/* Título */}
              <div className="nueva-vacante-field">
                <label className="nueva-vacante-label">
                  Título del puesto *
                </label>
                <input
                  className="nueva-vacante-input"
                  type="text"
                  value={form.title}
                  onChange={handleInputChange('title')}
                  placeholder="Ej: Desarrollador Frontend Junior"
                  required
                />
              </div>

              {/* Ubicación */}
              <div className="nueva-vacante-field">
                <label className="nueva-vacante-label">
                  Ubicación
                </label>
                <input
                  className="nueva-vacante-input"
                  type="text"
                  value={form.location_text}
                  onChange={handleInputChange('location_text')}
                  placeholder="Ej: Ciudad Juárez, Chihuahua"
                />
              </div>

              {/* Modalidad */}
              <div className="nueva-vacante-field">
                <label className="nueva-vacante-label">
                  Modalidad
                </label>
                <select 
                  className="nueva-vacante-input"
                  value={form.modality} 
                  onChange={handleSelectChange('modality')}
                >
                  <option value="presencial">Presencial</option>
                  <option value="híbrido">Híbrido</option>
                  <option value="remoto">Remoto</option>
                </select>
              </div>

              {/* Compensación */}
              <div className="nueva-vacante-field">
                <label className="nueva-vacante-label">
                  Compensación
                </label>
                <select 
                  className="nueva-vacante-input"
                  value={form.compensation} 
                  onChange={handleSelectChange('compensation')}
                >
                  <option value="Apoyo económico">Apoyo económico</option>
                  <option value="Sin apoyo">Sin apoyo</option>
                </select>
              </div>

              {/* Idioma */}
              <div className="nueva-vacante-field">
                <label className="nueva-vacante-label">
                  Idioma
                </label>
                <select 
                  className="nueva-vacante-input"
                  value={form.language} 
                  onChange={handleSelectChange('language')}
                >
                  <option value="ES">Español</option>
                  <option value="EN">Inglés</option>
                </select>
              </div>

              {/* Cupo total */}
              <div className="nueva-vacante-field">
                <label className="nueva-vacante-label">
                  Cupo total
                </label>
                <input
                  className="nueva-vacante-input"
                  type="number"
                  min="1"
                  value={form.spots_total}
                  onChange={handleSelectChange('spots_total')}
                />
              </div>

              {/* Estado */}
              <div className="nueva-vacante-field">
                <label className="nueva-vacante-label">
                  Estado
                </label>
                <select 
                  className="nueva-vacante-input"
                  value={form.status} 
                  onChange={handleSelectChange('status')}
                >
                  <option value="activa">Activa</option>
                  <option value="inactiva">Inactiva</option>
                </select>
              </div>
            </div>
          </div>

          {/* Programas */}
          <div className="nueva-vacante-card">
            <h3 className="nueva-vacante-card-title">
              Programas académicos
            </h3>
            
            <div className="nueva-vacante-programs-list">
              {programs.length > 0 ? (
                programs.map(program => (
                  <label 
                    key={program.id}
                    className="nueva-vacante-program-item"
                  >
                    <input
                      type="checkbox"
                      checked={programIds.includes(program.id)}
                      onChange={() => handleProgramToggle(program.id)}
                    />
                    <span className="nueva-vacante-program-label">
                      <strong>{program.key}</strong> — {program.name}
                    </span>
                  </label>
                ))
              ) : (
                <div style={{ color: "#6b7280", fontSize: "14px", textAlign: "center", padding: "20px" }}>
                  No hay programas disponibles
                </div>
              )}
            </div>
          </div>

          {/* Actividades */}
          <div className="nueva-vacante-card">
            <h3 className="nueva-vacante-card-title">
              Actividades
            </h3>
            <textarea
              className="nueva-vacante-textarea"
              value={form.activities}
              onChange={handleInputChange('activities')}
              placeholder="Describe las actividades que realizará el practicante..."
              rows={5}
            />
          </div>

          {/* Requisitos */}
          <div className="nueva-vacante-card">
            <h3 className="nueva-vacante-card-title">
              Requisitos
            </h3>
            <textarea
              className="nueva-vacante-textarea"
              value={form.requirements}
              onChange={handleInputChange('requirements')}
              placeholder="Lista los requisitos necesarios para esta vacante..."
              rows={5}
            />
          </div>

          {/* Acciones */}
          <div className="nueva-vacante-actions">
            <button
              className="nueva-vacante-cancel-btn"
              onClick={() => router.push("/empresa/vacantes")}
              disabled={saving}
            >
              Cancelar
            </button>
            
            <button
              className="nueva-vacante-save-btn"
              onClick={save}
              disabled={saving || !form.title.trim()}
            >
              {saving ? "Guardando..." : "Publicar vacante"}
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}