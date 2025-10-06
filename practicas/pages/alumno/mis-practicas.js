// pages/alumno/mis-practicas.js
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/navbar";
import Footer from "../../components/footer";

// Estados que consideraremos como "completadas" (compararemos en minúsculas)
const COMPLETED_STATES = ["completada","terminada","finalizada","completed","finished","done"];

// --- helper: cache-busting para ver inmediatamente lo recién subido ---
const cacheBust = (url) => {
  if (!url) return url;
  return url.includes("?") ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
};

// Validación simple de extensión (evita nombres raros)
function validateExt(ext) {
  if (!ext || ext.includes("/")) throw new Error("Nombre de archivo inválido.");
}

// Función para obtener iniciales
const getInitials = (name) => {
  if (!name) return "E";
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

// Función para detectar si es PDF basado en la URL
const isPdfUrl = (url) => {
  if (!url) return false;
  return url.toLowerCase().endsWith('.pdf') || url.includes('.pdf?');
};

export default function MisPracticasPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Usuario / perfil
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); // { full_name, email, program, avatar_url, cv_url }
  const [cvUploading, setCvUploading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Listas
  const [favorites, setFavorites] = useState([]);
  const [applied, setApplied] = useState([]);      // <<< NUEVO: postulaciones activas / historial
  const [completed, setCompleted] = useState([]);
  const [hidden, setHidden] = useState([]);
  const [showHidden, setShowHidden] = useState(false);

  // Modal CV
  const [cvOpen, setCvOpen] = useState(false);

  // Forzar recargas (si las llegas a necesitar)
  const refreshKey = useRef(0);
  const bump = () => (refreshKey.current += 1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErr("");

      // 1) Usuario
      const { data: { user: u }, error: uErr } = await supabase.auth.getUser();
      if (uErr || !u) {
        setErr(uErr?.message || "No se pudo obtener el usuario.");
        setLoading(false);
        return;
      }
      setUser(u);

      // 2) Perfil + programa
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          program_id,
          avatar_url,
          cv_url,
          program:programs (
            id, key, name, faculty
          )
        `)
        .eq("id", u.id)
        .single();

      if (pErr) {
        setErr(pErr.message);
        setLoading(false);
        return;
      }

      // 3) Cargar información del grupo y profesor
      const { data: groupMembers, error: gmErr } = await supabase
        .from("group_members")
        .select(`
          group:groups (
            id,
            name,
            color,
            professor_id
          )
        `)
        .eq("student_id", u.id)
        .maybeSingle();

      let groupInfo = null;
      let professorInfo = null;

      if (groupMembers?.group) {
        groupInfo = groupMembers.group;
        
        // Obtener información del profesor
        const { data: profData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("id", groupInfo.professor_id)
          .single();
        
        professorInfo = profData;
      }

      setProfile({
        id: prof.id,
        full_name: prof.full_name || "(Sin nombre)",
        email: u.email || "",
        // 👇 importante: sólo en UI aplico cache-busting
        avatar_url: cacheBust(prof.avatar_url || ""),
        cv_url: prof.cv_url || "",
        program: prof.program || null,
        group: groupInfo,
        professor: professorInfo
      });

      // 4) Favoritos (vacancy_favorites)
      const { data: favs, error: fErr } = await supabase
        .from("vacancy_favorites")
        .select(`
          id,
          vacancy_id,
          created_at,
          vacancy:vacancies (
            id, title, modality, compensation, language,
            location_text, rating_avg, rating_count, created_at,
            company:companies ( id, name, logo_url )
          )
        `)
        .eq("student_id", u.id)
        .order("created_at", { ascending: false });

      if (fErr) {
        setErr(fErr.message);
        setLoading(false);
        return;
      }
      const favVacancies = (favs || [])
        .map((r) => ({ favRowId: r.id, ...r.vacancy }))
        .filter((v) => !!v?.id);
      setFavorites(favVacancies);

      // 5) TODAS las aplicaciones del alumno
      const { data: apps, error: aErr } = await supabase
        .from("applications")
        .select(`
          id, status, applied_at,
          vacancy:vacancies (
            id, title, modality, compensation, language,
            location_text, rating_avg, rating_count, created_at,
            company:companies ( id, name, logo_url )
          )
        `)
        .eq("student_id", u.id)
        .order("applied_at", { ascending: false });

      if (aErr) {
        setErr(aErr.message);
        setLoading(false);
        return;
      }

      // Separa postulaciones activas (no "completadas") y completadas
      const appsClean = (apps || []).filter((r) => r?.vacancy?.id);
      
      // Filtrar explícitamente las rechazadas
      const appliedList = appsClean
        .filter((r) => {
          const status = String(r.status || "").toLowerCase();
          return !COMPLETED_STATES.includes(status) && status !== "rechazada";
        })
        .map((r) => ({ ...r.vacancy, _app_status: r.status, _applied_at: r.applied_at }));

      const completedList = appsClean
        .filter((r) => COMPLETED_STATES.includes(String(r.status || "").toLowerCase()))
        .map((r) => ({ ...r.vacancy, _app_status: r.status, _applied_at: r.applied_at }));

      setCompleted(completedList);
      setApplied(appliedList);

      // 6) Vacantes silenciadas (vacancy_hidden)
      const { data: hidd, error: hErr } = await supabase
        .from("vacancy_hidden")
        .select(`
          id,
          vacancy_id, created_at,
          vacancy:vacancies (
            id, title, modality, compensation, language,
            location_text, rating_avg, rating_count, created_at,
            company:companies ( id, name, logo_url )
          )
        `)
        .eq("student_id", u.id)
        .order("created_at", { ascending: false });

      if (hErr) {
        setErr(hErr.message);
        setLoading(false);
        return;
      }
      const hiddenVacancies = (hidd || [])
        .map((r) => ({ hiddenRowId: r.id, ...r.vacancy }))
        .filter((v) => !!v?.id);
      setHidden(hiddenVacancies);

      setLoading(false);
    };

    load();
  }, [refreshKey.current]);

  // --------- Subir/Reemplazar CV (PDF o imagen) ----------
  const onUploadCv = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file || !user) return;
      setCvUploading(true);

      const okTypes = ["application/pdf", "image/png", "image/jpeg"];
      if (!okTypes.includes(file.type)) {
        alert("Sube un PDF o imagen (PNG/JPG).");
        setCvUploading(false);
        return;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      validateExt(ext);
      const path = `${user.id}/cv.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("cvs")
        .upload(path, file, { upsert: true });

      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("cvs").getPublicUrl(path);
      const publicUrl = pub?.publicUrl;

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ cv_url: publicUrl })
        .eq("id", user.id);

      if (updErr) throw updErr;

      // Aplicar cache-busting aquí también
      setProfile((p) => ({ ...p, cv_url: cacheBust(publicUrl) }));
      bump(); // Forzar recarga para detectar correctamente el tipo de archivo
    } catch (e2) {
      console.error(e2);
      alert(e2.message || "No se pudo subir el CV.");
    } finally {
      setCvUploading(false);
    }
  };

  // --------- Eliminar CV ----------
  const onDeleteCv = async () => {
    if (!user) return;
    const ok = confirm("¿Eliminar tu CV? Esta acción no se puede deshacer.");
    if (!ok) return;

    try {
      const { data: files, error: listErr } = await supabase.storage
        .from("cvs")
        .list(user.id, { search: "cv." });

      if (listErr) throw listErr;

      const toDelete = (files || [])
        .filter((f) => f.name.startsWith("cv."))
        .map((f) => `${user.id}/${f.name}`);

      if (toDelete.length) {
        const { error: delErr } = await supabase.storage.from("cvs").remove(toDelete);
        if (delErr) throw delErr;
      }

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ cv_url: null })
        .eq("id", user.id);
      if (updErr) throw updErr;

      setProfile((p) => ({ ...p, cv_url: "" }));
      setCvOpen(false);
    } catch (e2) {
      console.error(e2);
      alert(e2.message || "No se pudo eliminar el CV.");
    }
  };

  // --------- Cambiar avatar ----------
  const onUploadAvatar = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file || !user) return;
      setAvatarUploading(true);

      const okTypes = ["image/png", "image/jpeg"];
      if (!okTypes.includes(file.type)) {
        alert("Sube una imagen PNG/JPG.");
        setAvatarUploading(false);
        return;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      validateExt(ext);
      const path = `${user.id}/avatar.${ext}`;

      // (Opcional) Limpia otros avatars con distinta extensión para no acumular
      const { data: existing } = await supabase.storage.from("avatars").list(user.id);
      if (existing?.length) {
        const others = existing
          .filter((f) => f.name.startsWith("avatar.") && f.name !== `avatar.${ext}`)
          .map((f) => `${user.id}/${f.name}`);
        if (others.length) {
          await supabase.storage.from("avatars").remove(others);
        }
      }

      // Sube (sobrescribe si ya existe ese path)
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = pub?.publicUrl;

      // Guarda en BD sin el cache-busting
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);
      if (updErr) throw updErr;

      // En UI, muéstrala con cache-busting para ver la nueva al instante
      setProfile((p) => ({ ...p, avatar_url: cacheBust(publicUrl) }));
    } catch (e2) {
      console.error(e2);
      alert(e2.message || "No se pudo actualizar la foto.");
    } finally {
      setAvatarUploading(false);
    }
  };

  // --------- Quitar de favoritos ----------
  const onUnfavorite = async (vacancyId) => {
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;

      const { error } = await supabase
        .from("vacancy_favorites")
        .delete()
        .eq("student_id", u.id)
        .eq("vacancy_id", vacancyId);

      if (error) throw error;

      setFavorites((prev) => prev.filter((v) => v.id !== vacancyId));
    } catch (e) {
      console.error(e);
    }
  };

  // --------- Quitar silencio a una vacante ----------
  const onUnhideVacancy = async (vacancyId) => {
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;

      const { error } = await supabase
        .from("vacancy_hidden")
        .delete()
        .eq("student_id", u.id)
        .eq("vacancy_id", vacancyId);

      if (error) throw error;

      setHidden((prev) => prev.filter((v) => v.id !== vacancyId));
    } catch (e) {
      console.error(e);
    }
  };

  // --------- Helpers de UI ----------
  const fmtMod = (m) =>
    m === "presencial" ? "Presencial" : m === "remoto" ? "Remota" : "Híbrida";

  // Función para renderizar preview del CV
  const renderCvPreview = (cvUrl) => {
    if (!cvUrl) return null;
    
    if (isPdfUrl(cvUrl)) {
      return (
        <div style={{ 
          width: "100%", 
          height: 260, 
          background: "#f8f9fa",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #e9ecef",
          borderRadius: 8,
          overflow: "hidden"
        }}>
          <iframe
            src={`${cvUrl}#view=FitH&toolbar=0&navpanes=0`}
            style={{ 
              width: "100%", 
              height: "100%", 
              border: "none",
            }}
            title="Vista previa del CV"
          />
          <div style={{ 
            position: "absolute", 
            bottom: 8, 
            left: 0, 
            right: 0, 
            textAlign: "center",
            background: "rgba(255,255,255,0.9)",
            padding: "4px 8px",
            fontSize: 12,
            color: "#6c757d"
          }}>
            Documento PDF - Haz clic para ampliar
          </div>
        </div>
      );
    } else {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cvUrl}
          alt="CV"
          style={{ 
            width: "100%", 
            height: 260, 
            objectFit: "contain",
            background: "#f8f9fa",
            display: "block" 
          }}
        />
      );
    }
  };

  const Card = ({ v, actions = null, subtitle = null }) => (
    <article className="jobs-card" style={{ cursor: "default" }}>
      <div className="jobs-card-left" />
      <div className="jobs-card-body">
        <div className="jobs-card-top" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div className="jobs-logo">
              {v?.company?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={v.company.logo_url} 
                  alt={`Logo de ${v.company.name}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div 
                  style={{
                    width: 40, 
                    height: 40, 
                    background: "#e5e7eb", 
                    color: "#374151",
                    display: "grid", 
                    placeItems: "center", 
                    borderRadius: 6, 
                    fontWeight: 700
                  }}
                >
                  {getInitials(v?.company?.name)}
                </div>
              )}
            </div>
            <div>
              <h4 className="jobs-card-title">{v?.title}</h4>
              <div className="jobs-card-company">{v?.company?.name || "Empresa"}</div>
              {subtitle && <div className="jobs-muted small" style={{ marginTop: 2 }}>{subtitle}</div>}
              <div className="jobs-card-rating">
                <Stars rating={v?.rating_avg} compact />
                <span className="jobs-muted small">({v?.rating_count ?? 0})</span>
              </div>
            </div>
          </div>

          {/* Acciones / chips a la derecha */}
          <div className="jobs-card-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {actions}
          </div>
        </div>

        <div className="jobs-meta">
          <span>{fmtMod(v?.modality)}</span>
          <span>{v?.compensation || "Compensación N/A"}</span>
          <span>Idioma {v?.language || "ES"}</span>
        </div>

        <div className="jobs-loc-row">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M12 2A7 7 0 0 0 5 9c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7m0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"
            />
          </svg>
          <span className="jobs-muted">{v?.location_text || "Ubicación no especificada"}</span>
        </div>

        <div style={{ marginTop: 10 }}>
          <Link className="jobs-apply" href={`/alumno/vacante/${v.id}`}>
            Ver detalle
          </Link>
        </div>
      </div>
    </article>
  );

  const chip = (text, tone = "default") => (
    <span
      className="jobs-chip"
      style={{
        background: tone === "success" ? "#e9f7ef"
                 : tone === "warn" ? "#fff7e6"
                 : tone === "danger" ? "#fee2e2"
                 : "#f4f6fa",
        borderColor: tone === "success" ? "#c6f0d5"
                 : tone === "warn" ? "#ffe6b3"
                 : tone === "danger" ? "#fecaca"
                 : "#e6eaf1"
      }}
    >
      {text}
    </span>
  );

  const statusTone = (s) => {
    const k = String(s || "").toLowerCase();
    if (k === "aceptada") return "success";
    if (k === "oferta") return "warn";
    if (k === "rechazada" || k === "retirada") return "danger";
    return "default";
  };

  const fmtDate = (iso) => {
    try { return new Date(iso).toLocaleDateString(); } catch { return ""; }
  };

  return (
    <>
      <Navbar />

      <main className="jobs-wrap" style={{ maxWidth: 1200, marginInline: "auto" }}>
        {err && <div className="jobs-error">{err}</div>}

        {/* ====== Layout de 2 columnas ====== */}
        <section
          className="jobs-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "320px 1fr",
            gap: 16,
          }}
        >
          {/* ---------- Columna izquierda: Ficha alumno ---------- */}
          <aside
            className="jobs-detail"
            style={{ position: "sticky", top: 96, alignSelf: "start" }}
          >
            <div style={{ display: "grid", placeItems: "center", marginBottom: 12 }}>
              <div
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: "50%",
                  background: "#e9eef6",
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                }}
              >
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url}
                    alt="Avatar"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <svg width="52" height="52" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M12 12a5 5 0 1 0-5-5a5 5 0 0 0 5 5m0 2c-4.33 0-8 2.17-8 5v1h16v-1c0-2.83-3.67-5-8-5Z"
                    />
                  </svg>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <label className="jobs-apply" style={{ cursor: "pointer" }}>
                {avatarUploading ? "Subiendo..." : "Cambiar foto"}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={onUploadAvatar}
                  style={{ display: "none" }}
                  disabled={avatarUploading}
                />
              </label>
            </div>

            <h3 style={{ textAlign: "center", margin: "10px 0 2px" }}>
              {profile?.full_name || "Estudiante"}
            </h3>
            <p className="jobs-muted" style={{ textAlign: "center", margin: 0 }}>
              {profile?.email}
            </p>

            {profile?.program && (
              <div style={{ marginTop: 10, fontSize: 14, textAlign: "center" }}>
                <div><strong>Programa:</strong> {profile.program.name}</div>
                <div className="jobs-muted">({profile.program.key})</div>
                
                {/* Información del grupo */}
                {profile.group && (
                  <div style={{ marginTop: 8, padding: 8, background: "#f0f7ff", borderRadius: 6 }}>
                    <div><strong>Grupo:</strong> {profile.group.name}</div>
                    {profile.professor && (
                      <div className="jobs-muted">
                        <strong>Profesor:</strong> {profile.professor.full_name}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <hr className="jobs-sep" />

            {/* CV */}
            <h4 style={{ margin: "8px 0" }}>Mi Curriculum</h4>

            {profile?.cv_url ? (
              <>
                <div
                  style={{
                    border: "1px solid #e6eaf1",
                    borderRadius: 8,
                    overflow: "hidden",
                    cursor: "zoom-in",
                    position: "relative"
                  }}
                  onClick={() => setCvOpen(true)}
                  title="Ver en grande"
                >
                  {renderCvPreview(profile.cv_url)}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <label className="jobs-apply" style={{ display: "inline-block" }}>
                    {cvUploading ? "Subiendo…" : "Reemplazar CV"}
                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg"
                      onChange={onUploadCv}
                      style={{ display: "none" }}
                      disabled={cvUploading}
                    />
                  </label>
                  <button
                    className="jobs-apply"
                    style={{ background: "#e9eef6", color: "#1f2937" }}
                    onClick={onDeleteCv}
                  >
                    Eliminar CV
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="jobs-empty">Aún no subes tu CV.</div>
                <label className="jobs-apply" style={{ display: "inline-block", marginTop: 10 }}>
                  {cvUploading ? "Subiendo…" : "Subir CV"}
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    onChange={onUploadCv}
                    style={{ display: "none" }}
                    disabled={cvUploading}
                  />
                </label>
              </>
            )}
          </aside>

          {/* ---------- Columna derecha: Listas ---------- */}
          <section style={{ display: "grid", gap: 20 }}>
            {/* Mis postulaciones */}
            <h2 style={{ textAlign: "center" }}>Mis postulaciones</h2>
            {loading && <div className="jobs-card sk" />}
            {!loading && applied.length === 0 && (
              <div className="jobs-empty small">Aún no te has postulado a ninguna vacante.</div>
            )}
            {!loading &&
              applied.map((v) => (
                <Card
                  key={v.id + (v._applied_at || "")}
                  v={v}
                  subtitle={v._applied_at ? `Postulación del ${fmtDate(v._applied_at)}` : null}
                  actions={chip(`Estado: ${v._app_status || "-"}`, statusTone(v._app_status))}
                />
              ))}

            {/* Favoritos */}
            <h2 style={{ textAlign: "center" }}>Proyectos guardados</h2>
            {loading && <div className="jobs-card sk" />}
            {!loading && favorites.length === 0 && (
              <div className="jobs-empty small">Aún no tienes vacantes guardadas.</div>
            )}
            {!loading &&
              favorites.map((v) => (
                <Card
                  key={v.id}
                  v={v}
                  actions={
                    <button
                      type="button"
                      className="iconbtn"
                      title="Quitar de favoritos"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnfavorite(v.id);
                      }}
                      aria-label="Quitar de favoritos"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                        <path fill="#2563eb" d="M6 2h12a1 1 0 0 1 1 1v18l-7-4-7 4V3a1 1 0 0 1 1-1Z" />
                      </svg>
                    </button>
                  }
                />
              ))}

            {/* Completadas (solo si hay) */}
            {completed.length > 0 && (
              <>
                <h2 style={{ textAlign: "center" }}>Prácticas completadas</h2>
                {completed.map((v) => (
                  <Card
                    key={v.id}
                    v={v}
                    actions={chip(`Estado: ${v._app_status || "-"}`, "success")}
                  />
                ))}
              </>
            )}

            {/* Silenciadas (colapsable) */}
            <div>
              <button
                className="jobs-apply"
                style={{ background: "#e9eef6", color: "#1f2937" }}
                onClick={() => setShowHidden((s) => !s)}
              >
                {showHidden ? "Ocultar vacantes silenciadas" : "Ver vacantes silenciadas"}
              </button>

              {showHidden && (
                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  {hidden.length === 0 ? (
                    <div className="jobs-empty small">No tienes vacantes silenciadas.</div>
                  ) : (
                    hidden.map((v) => (
                      <Card
                        key={v.id}
                        v={v}
                        actions={
                          <button
                            type="button"
                            className="iconbtn"
                            title="Dejar de silenciar"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUnhideVacancy(v.id);
                            }}
                            aria-label="Dejar de silenciar"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                              <path
                                fill="#1F3354"
                                d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"
                              />
                            </svg>
                          </button>
                        }
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </section>
        </section>

        {/* ----- Modal de CV ampliado ----- */}
        {cvOpen && profile?.cv_url && (
          <div
            onClick={() => setCvOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.8)",
              display: "grid",
              placeItems: "center",
              zIndex: 9999,
              padding: 16,
              cursor: "zoom-out",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(1000px, 96vw)",
                height: "min(90vh, 95vh)",
                background: "#fff",
                borderRadius: 10,
                overflow: "hidden",
                boxShadow: "0 10px 30px rgba(0,0,0,.25)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Header del modal */}
              <div style={{
                padding: "12px 16px",
                background: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Curriculum Vitae</h3>
                <button
                  onClick={() => setCvOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "1.5rem",
                    cursor: "pointer",
                    color: "#64748b",
                    padding: 0,
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                  }}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>

              {/* Contenido del CV */}
              <div style={{ flex: 1, overflow: "auto" }}>
                {isPdfUrl(profile.cv_url) ? (
                  <iframe
                    src={`${profile.cv_url}#view=FitH`}
                    style={{ 
                      width: "100%", 
                      height: "100%", 
                      border: "none",
                      minHeight: "500px"
                    }}
                    title="CV PDF"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.cv_url}
                    alt="CV"
                    style={{ 
                      width: "100%", 
                      height: "auto", 
                      objectFit: "contain", 
                      display: "block",
                      maxHeight: "100%"
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </>
  );
}

/* --------- Mini componentes --------- */
function Stars({ rating = 0, compact = false }) {
  const r = Math.round(Number(rating || 0));
  const full = "★★★★★".slice(0, r);
  const empty = "★★★★★".slice(r);
  return (
    <span className={`jobs-stars ${compact ? "small" : ""}`} aria-label={`Calificación ${r} de 5`}>
      <span className="full">{full}</span>
      <span className="empty">{empty}</span>
    </span>
  );
}