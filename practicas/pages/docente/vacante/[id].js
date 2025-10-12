import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import Navbar from "../../../components/navbar";
import Footer from "../../../components/footer";
import { supabase } from "../../../lib/supabaseClient";

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

  const [vacancy, setVacancy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [applyLoading, setApplyLoading] = useState(false);
  const [userId, setUserId] = useState(null);
  const [appliedVacancyIds, setAppliedVacancyIds] = useState([]);

  // Obtener usuario y aplicaciones
  useEffect(() => {
    const boot = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: appsData } = await supabase
          .from("applications")
          .select("vacancy_id")
          .eq("student_id", user.id)
          .limit(1000);
        if (appsData) setAppliedVacancyIds(appsData.map(a => a.vacancy_id));
      }
    };
    boot();
  }, []);

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

  const onBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/alumno/buscar");
  };

  /* ---------- BD: postularse (vía RPC SECURITY DEFINER) ---------- */
  const onApply = async () => {
    try {
      if (!userId) { router.push("/login"); return; }
      if (!vacancy?.id) return;
      if (appliedVacancyIds.includes(vacancy.id)) return;

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
      alert("¡Listo! Tu postulación fue enviada.");
    } catch (e) {
      console.error(e);
      alert(e.message || "No se pudo completar la postulación.");
    } finally {
      setApplyLoading(false);
    }
  };

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
              </div>
            )}
          </article>
        </div>
      </main>

      <Footer />
    </>
  );
}