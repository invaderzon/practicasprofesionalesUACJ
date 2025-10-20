import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Navbar from "../../components/navbar";
import Footer from "../../components/footer";
import { supabase } from "../../lib/supabaseClient";

const BUCKET_LOGOS = "logos";

export default function EmpresaPerfilPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [mode, setMode] = useState("view"); // view | edit
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);

  const [userEmail, setUserEmail] = useState("");
  const [company, setCompany] = useState(null);

  const [kpi, setKpi] = useState({ vacTotal: 0, vacActivas: 0, postulaciones: 0 });
  const [recentApps, setRecentApps] = useState([]);

  const [form, setForm] = useState({
    name: "",
    industry: "",
    website: "",
    description: "",
    logo_url: "",
    location_text: "",
  });

  const isActive = (s) => {
    const k = (s ?? "").toString().toLowerCase();
    return k.startsWith("activ") && !k.includes("inactiv");
  };

  const handleAppClick = (app) => {
    router.push("/empresa/postulaciones");
  };

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
        setUserEmail(user.email || "");

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if ((profile?.role ?? "student") !== "company") {
          router.replace("/alumno/buscar");
          return;
        }

        // Empresa
        const { data: comp, error: cerr } = await supabase
          .from("companies")
          .select(`
            id, name, email, logo_url, industry, website, description,
            owner_id, status, location_text
          `)
          .eq("owner_id", user.id)
          .single();

        if (!comp || cerr) {
          setErr("No se encontró tu empresa. Crea tu ficha primero.");
          setLoading(false);
          return;
        }
        if (ignore) return;
        setCompany(comp);

        // KPI
        const { data: vacs } = await supabase
          .from("vacancies")
          .select("id, status, created_at")
          .eq("company_id", comp.id)
          .order("created_at", { ascending: false });

        const vacList = vacs || [];
        const vacTotal = vacList.length;
        const vacActivas = vacList.filter((v) => isActive(v.status)).length;

        // CONTAR POSTULACIONES - VERSIÓN CORREGIDA 👇
        let postulaciones = 0;
        if (vacList.length > 0) {
          const vacancyIds = vacList.map(v => v.id);
          
          const { data: allApplications, error: appsError } = await supabase
            .from("applications")
            .select("id, vacancy_id, status")
            .in("vacancy_id", vacancyIds);
          
          if (!appsError && allApplications) {
            // Filtrar solo postulaciones activas (pendientes, oferta, aceptadas)
            const activeApplications = allApplications.filter(app => 
              ['postulada', 'pendiente', 'revisada', 'entrevista', 'oferta', 'aceptada']
                .includes(app.status?.toLowerCase())
            );
            
            postulaciones = activeApplications.length;
            console.log("✅ Postulaciones activas encontradas:", postulaciones);
            console.log("📊 Total de postulaciones (todas):", allApplications.length);
          } else {
            console.error("❌ Error contando postulaciones:", appsError);
          }
        }

        if (!ignore) setKpi({ vacTotal, vacActivas, postulaciones });
      

        setForm({
          name: comp.name || "",
          industry: comp.industry || "",
          website: comp.website || "",
          description: comp.description || "",
          logo_url: comp.logo_url || "",
          location_text: comp.location_text || "",
        });

        setLoading(false);
      } catch (e) {
        console.error(e);
        if (!ignore) {
          setErr(e.message || "Error cargando tu panel.");
          setLoading(false);
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, [router]);

  const initials = useMemo(() => {
    const n = (company?.name || form.name || "").trim();
    if (!n) return "EMP";
    const parts = n.split(/\s+/);
    return (
      (parts[0]?.[0] || "E").toUpperCase() + (parts[1]?.[0] || "M").toUpperCase()
    );
  }, [company?.name, form.name]);

  const startEdit = () => {
    if (!company) return;
    setForm({
      name: company.name || "",
      industry: company.industry || "",
      website: company.website || "",
      description: company.description || "",
      logo_url: company.logo_url || "",
      location_text: company.location_text || "",
    });
    setMode("edit");
  };

  const cancelEdit = () => {
    setMode("view");
    if (company) {
      setForm({
        name: company.name || "",
        industry: company.industry || "",
        website: company.website || "",
        description: company.description || "",
        logo_url: company.logo_url || "",
        location_text: company.location_text || "",
      });
    }
  };

  const saveChanges = async (e) => {
    e?.preventDefault?.();
    if (!company) return;
    try {
      const payload = {
        name: form.name?.trim() || "",
        industry: form.industry?.trim() || "",
        website: form.website?.trim() || "",
        description: form.description || "",
        logo_url: form.logo_url || null,
        location_text: form.location_text || "",
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("companies")
        .update(payload)
        .eq("id", company.id);
      if (error) throw error;
      setCompany((c) => ({ ...c, ...payload }));
      setMode("view");
    } catch (e2) {
      alert(e2.message || "No se pudo guardar.");
    }
  };

  const pickFile = () => fileInput.current?.click();
  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !company) return;
    try {
      setUploading(true);
      const ext = file.name.split(".").pop();
      const path = `company-logos/${company.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET_LOGOS)
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET_LOGOS).getPublicUrl(path);
      const publicUrl = pub?.publicUrl || "";
      setForm((f) => ({ ...f, logo_url: publicUrl }));
    } catch (e2) {
      alert(e2.message || "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const readonlyEmail = company?.email || userEmail || "—";

  return (
    <>
      <Navbar />
      <main className="jobs-wrap">
        {err && <div className="jobs-error">{err}</div>}
        {loading && <div className="jobs-skeleton" />}

        {!loading && company && (
          <div className="profile-container">
            {/* KPIs */}
            <section className="kpi-cards">
              <div className="kpi-card">
                <div className="kpi-label">Vacantes totales</div>
                <div className="kpi-value">{kpi.vacTotal}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Vacantes activas</div>
                <div className="kpi-value">{kpi.vacActivas}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Postulaciones activas</div>
                <div className="kpi-value">{kpi.postulaciones}</div>
              </div>
            </section>

            {/* Grid principal */}
            <div className="profile-grid">
              {/* Panel de perfil */}
              <section className="panel-card">
                <div className="section-title-row">
                  <h2 className="settings-title" style={{ margin: 0 }}>
                    Perfil de empresa
                  </h2>

                  {mode === "view" ? (
                    <div className="actions-row">
                      <button className="btn btn-primary" onClick={startEdit}>
                        Editar
                      </button>
                    </div>
                  ) : (
                    <div className="actions-row">
                      <button className="btn btn-ghost" onClick={cancelEdit}>
                        Descartar
                      </button>
                      <button className="btn btn-primary" onClick={saveChanges}>
                        Guardar cambios
                      </button>
                    </div>
                  )}
                </div>

                {/* Logo + uploader */}
                <div
                  className="avatar-uploader"
                  style={{ marginBottom: 12, alignItems: "flex-start" }}
                >
                  <div className="avatar-box" aria-label="Logo de la empresa">
                    {(mode === "edit" ? form.logo_url : company.logo_url) ? (
                      <img
                        src={mode === "edit" ? form.logo_url : company.logo_url}
                        alt=""
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "grid",
                          placeItems: "center",
                          background: "#eef2f7",
                          color: "#1f2937",
                          fontWeight: 800,
                          fontSize: 18,
                        }}
                      >
                        {initials}
                      </div>
                    )}
                  </div>

                  {mode === "edit" && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        ref={fileInput}
                        type="file"
                        accept="image/*"
                        className="file-hidden"
                        onChange={onFileChange}
                      />
                      <button
                        className="btn btn-ghost"
                        onClick={pickFile}
                        disabled={uploading}
                      >
                        {uploading ? "Subiendo…" : "Cambiar logo"}
                      </button>
                      {form.logo_url && (
                        <button
                          className="btn btn-danger"
                          onClick={() => setForm((f) => ({ ...f, logo_url: "" }))}
                        >
                          Quitar logo
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {mode === "view" ? (
                  <div className="settings-grid">
                    <Field label="Nombre comercial">
                      <Read>{company.name || "—"}</Read>
                    </Field>
                    <Field label="Industria">
                      <Read>{company.industry || "—"}</Read>
                    </Field>
                    <Field label="Sitio web">
                      <Read>{company.website || "—"}</Read>
                    </Field>
                    <Field label="Correo de contacto">
                      <Read>{readonlyEmail}</Read>
                    </Field>
                    <Field label="Ubicación (oficina principal)">
                      <Read>{company.location_text || "—"}</Read>
                    </Field>
                    <Field label="Descripción" full>
                      <Read multiline>{company.description || "—"}</Read>
                    </Field>
                  </div>
                ) : (
                  <form onSubmit={saveChanges} className="settings-grid">
                    <Field label="Nombre comercial">
                      <input
                        className="login-input"
                        value={form.name}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, name: e.target.value }))
                        }
                        placeholder="p. ej. ACME S.A. de C.V."
                      />
                    </Field>
                    <Field label="Industria">
                      <input
                        className="login-input"
                        value={form.industry}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, industry: e.target.value }))
                        }
                        placeholder="p. ej. Software, Manufactura..."
                      />
                    </Field>
                    <Field label="Sitio web">
                      <input
                        className="login-input"
                        value={form.website}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, website: e.target.value }))
                        }
                        placeholder="https://tu-sitio.com"
                      />
                    </Field>
                    <Field label="Correo de contacto">
                      <Read>{readonlyEmail}</Read>
                    </Field>
                    <Field label="Ubicación (oficina principal)">
                      <input
                        className="login-input"
                        value={form.location_text}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, location_text: e.target.value }))
                        }
                        placeholder="Ciudad, Estado / Dirección corta"
                      />
                    </Field>
                    <Field label="Descripción" full>
                      <textarea
                        className="login-input"
                        rows={4}
                        value={form.description}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, description: e.target.value }))
                        }
                        placeholder="Cuenta a los alumnos quiénes son, cultura, beneficios, etc."
                      />
                    </Field>
                  </form>
                )}
              </section>

              {/* Acciones */}
              <aside className="panel-card panel-actions">
                <div className="section-title-row">
                  <h3 className="settings-title" style={{ fontSize: 18, margin: 0 }}>
                    Acciones
                  </h3>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => router.push("/empresa/vacante/nueva")}
                  >
                    Publicar nueva vacante
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => router.push("/empresa/vacantes")}
                  >
                    Gestionar mis vacantes
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => router.push("/empresa/postulaciones")}
                  >
                    Ver postulaciones activas
                  </button>
                </div>

                <div className="tips-box">
                  <div className="tips-title">Tips</div>
                  <ul className="jobs-list" style={{ marginTop: 6 }}>
                    <li>
                      Mantén tu perfil actualizado: logo, industria y descripción
                      atractiva.
                    </li>
                    <li>
                      Publica vacantes con actividades y requisitos claros para mejorar
                      el match.
                    </li>
                  </ul>
                </div>
              </aside>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

/* —— Mini componentes de layout —— */
function Field({ label, full, children }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 6,
        gridColumn: full ? "1 / -1" : undefined,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1f2937" }}>
        {label}
      </div>
      {children}
    </div>
  );
}
function Read({ children, multiline }) {
  return (
    <div
      className="readonly-value"
      style={multiline ? { whiteSpace: "pre-wrap" } : undefined}
    >
      {children}
    </div>
  );
}