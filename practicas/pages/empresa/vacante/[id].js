// pages/alumno/vacante/[id].js
import { useEffect, useMemo, useState } from "react";
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

export default function VacanteDetallePage() {
  const router = useRouter();
  const { isReady, query } = router;

  // appId puede venir undefined al primer render; normalízalo
  const appId = useMemo(() => {
    if (!isReady) return null;
    const q = query?.appId;
    if (Array.isArray(q)) return q[0] || null;
    return q || null;
  }, [isReady, query]);

  const [vacancy, setVacancy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // Carga de la vacante cuando hay id listo
  useEffect(() => {
    if (!isReady || !query?.id) return;
    (async () => {
      setLoading(true);
      setErr("");
      const { data, error } = await supabase
        .from("vacancies")
        .select(`
          id, title, modality, compensation, language, requirements, activities,
          location_text, rating_avg, rating_count, status, created_at,
          company_id,
          company:companies!left ( id, name, industry, logo_url )
        `)
        .eq("id", query.id)
        .single();
      if (error) {
        setErr(error.message || "No se pudo cargar la vacante.");
        setVacancy(null);
      } else {
        setVacancy(data);
      }
      setLoading(false);
    })();
  }, [isReady, query?.id]);

  const onBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/alumno/buscar");
  };

  /* ====== CTA cuando NO hay appId (modo “postularse” desde buscar) ====== */
  const onApply = async () => {
    if (!vacancy) return;
    setSaving(true);
    setErr("");
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      setErr("Debes iniciar sesión para postularte.");
      setSaving(false);
      return;
    }
    const { error: insErr } = await supabase
      .from("applications")
      .insert({
        student_id: user.id,
        vacancy_id: vacancy.id,
        status: "submitted",
      });
    if (insErr) setErr(insErr.message);
    else alert("Solicitud enviada ✨");
    setSaving(false);
  };

  /* ====== CTA cuando SÍ hay appId (modo “oferta”: aceptar/rechazar) ====== */
  const acceptOffer = async () => {
    if (!appId) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("student_accept_offer", { p_app_id: appId });
      if (error) throw error;
      alert("¡Listo! Oferta aceptada.");
      router.push("/alumno/mis-practicas");
    } catch (e) {
      alert(e.message || "No se pudo aceptar la oferta.");
    } finally {
      setSaving(false);
    }
  };

  const declineOffer = async () => {
    if (!appId) return;
    const ok = confirm("¿Rechazar esta oferta? Esta acción no se puede deshacer.");
    if (!ok) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("applications")
        .update({ status: "rechazada", decision: "declined", decision_at: new Date().toISOString() })
        .eq("id", appId);
      if (error) throw error;
      alert("Oferta rechazada.");
      router.push("/alumno/ofertas");
    } catch (e) {
      alert(e.message || "No se pudo rechazar la oferta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Navbar />

      <main className="jobs-wrap">
        <div className="jobs-grid" style={{ gridTemplateColumns: "1fr" }}>
          <article className="jobs-detail" style={{ display: "block" }}>
            <button className="jobs-apply" onClick={onBack} style={{ marginBottom: 10, background:"#111827" }}>
              ← Volver
            </button>

            {(!isReady || loading) && <div className="jobs-skeleton">Cargando…</div>}
            {isReady && !loading && err && <div className="jobs-error">{err}</div>}
            {isReady && !loading && !err && !vacancy && <div className="jobs-empty">Vacante no encontrada</div>}

            {isReady && !loading && vacancy && (
              <>
                <header className="jobs-detail-head">
                  <div className="jobs-detail-titles">
                    <h2 className="jobs-title">{vacancy.title}</h2>
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

                {/* CTA según presencia de appId */}
                {appId ? (
                  <div className="jobs-cta" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button className="jobs-apply" onClick={acceptOffer} disabled={saving}>
                      {saving ? "Guardando…" : "Aceptar oferta"}
                    </button>
                    <button
                      className="jobs-apply"
                      onClick={declineOffer}
                      disabled={saving}
                      style={{ background: "#9ca3af" }}
                    >
                      {saving ? "Guardando…" : "Rechazar"}
                    </button>
                  </div>
                ) : (
                  <div className="jobs-cta">
                    <button className="jobs-apply" onClick={onApply} disabled={saving}>
                      {saving ? "Enviando…" : "Postularse ahora"}
                    </button>
                  </div>
                )}

                <div className="jobs-map">
                  <img src="/img/mapa_demo.png" alt="Mapa" />
                </div>
              </>
            )}
          </article>
        </div>
      </main>

      <Footer />
    </>
  );
}
