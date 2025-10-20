// pages/empresa/vacantes.js
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/navbar";
import Footer from "../../components/footer";

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

/* ---------- UI: utilidades ---------- */
function splitLines(text) {
  const arr = String(text || "").split(/\r?\n|•|- /).map(s=>s.trim()).filter(Boolean);
  return arr.length ? arr : ["No disponible"];
}

/* ---------- UI: mapa (con normalización de dirección) ---------- */
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

/* ---------- Página ---------- */
export default function EmpresaVacantesPage() {
  const router = useRouter();

  /* ---------- UI: loading / errores ---------- */
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  /* ---------- BD: catálogos ---------- */
  const [programs, setPrograms] = useState([]); 

  /* ---------- BD: empresa y data ---------- */
  const [company, setCompany] = useState(null);
  const [vacancies, setVacancies] = useState([]); 
  const [selected, setSelected] = useState(null);

  /* ---------- UI: modos panel derecho ---------- */
  const [mode, setMode] = useState("view"); 
  const [editForm, setEditForm] = useState(null);

  /* ---------- BD: postulaciones ---------- */
  const [apps, setApps] = useState([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [openAppId, setOpenAppId] = useState(null);
  const reqSeq = useRef(0);

  /* ---------- UI: búsqueda / filtros ---------- */
  const [q, setQ] = useState("");
  const [fltEstado, setFltEstado] = useState(""); 
  const [fltCupo, setFltCupo] = useState("");     

  /* ---------- UI: kebab ---------- */
  const [openMenuDetail, setOpenMenuDetail] = useState(false);
  const pageRef = useRef(null);

  /* ---------- Helpers ---------- */
  const isInactive = (v) => String(v?.status || "").toLowerCase().includes("inactiv");
  const spotsLeft = (v) => Number(v?.spots_left ?? Math.max((v?.spots_total ?? 0) - (v?.spots_taken ?? 0), 0));
  const isFull = (v) => spotsLeft(v) <= 0;
  const isMobile = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;

  const filtered = useMemo(() => {
    let arr = vacancies;
    const qq = (q || "").trim().toLowerCase();
    if (qq) arr = arr.filter(v => v.title?.toLowerCase().includes(qq));
    if (fltEstado === "activa") arr = arr.filter(v => !isInactive(v));
    if (fltEstado === "inactiva") arr = arr.filter(v => isInactive(v));
    if (fltCupo === "con_cupo") arr = arr.filter(v => spotsLeft(v) > 0 && !isInactive(v));
    if (fltCupo === "llenas") arr = arr.filter(v => (isFull(v) && !isInactive(v)) || isInactive(v));
    return arr;
  }, [vacancies, q, fltEstado, fltCupo]);

  /* ---------- BD: carga inicial ---------- */
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setLoading(true);
        setErr("");

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setErr("No hay sesión."); setLoading(false); return; }

        const { data: profile } = await supabase
          .from("profiles").select("role").eq("id", user.id).single();
        const role = profile?.role ?? "student";
        if (role !== "company") {
          router.replace(role === "professor" ? "/profesores" : "/alumno/buscar");
          return;
        }

        const { data: comp, error: cerr } = await supabase
          .from("companies")
          .select("id, name, logo_url, industry, owner_id, status")
          .eq("owner_id", user.id)
          .single();
        if (!comp || cerr) {
          setErr("No se encontró empresa para este usuario. Crea tu ficha de empresa.");
          setLoading(false);
          return;
        }
        if (ignore) return;
        setCompany(comp);

        const { data: progList, error: perr } = await supabase
          .from("programs")
          .select("id, key, name")
          .order("name", { ascending: true });
        if (perr) throw perr;
        if (!ignore) setPrograms(progList || []);

        const { data: vacs, error: verr } = await supabase
          .from("vacancies")
          .select(`
            id, title, status, created_at, spots_total, spots_taken, spots_left,
            modality, location_text, compensation, language, requirements, activities
          `)
          .eq("company_id", comp.id)
          .order("created_at", { ascending: false });
        if (verr) throw verr;

        let list = vacs || [];

        if (list.length) {
          const idsCSV = `(${list.map(v => `"${v.id}"`).join(",")})`;
          const { data: vps } = await supabase
            .from("vacancy_programs")
            .select("vacancy_id, program_id")
            .filter("vacancy_id", "in", idsCSV);

          const map = new Map();
          (vps || []).forEach(row => {
            const arr = map.get(row.vacancy_id) || [];
            arr.push(row.program_id);
            map.set(row.vacancy_id, arr);
          });
          list = list.map(v => ({ ...v, program_ids: map.get(v.id) || [] }));
        }

        if (ignore) return;
        setVacancies(list);
        setSelected(list?.[0] || null);
        setMode("view");
        setLoading(false);
      } catch (e) {
        console.error(e);
        if (!ignore) {
          setErr(e.message || "Error cargando panel.");
          setLoading(false);
        }
      }
    })();
    return () => { ignore = true; };
  }, [router]);

  /* ---------- UI: click fuera para cerrar kebab ---------- */
  useEffect(() => {
    const onClick = (e) => {
      if (!pageRef.current) return;
      if (!pageRef.current.contains(e.target)) return;
      const inKebab = e.target.closest?.("[data-kebab]");
      if (!inKebab) setOpenMenuDetail(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  /* ---------- UI: selección ---------- */
  const selectDesktop = (v) => {
    setSelected(v);
    setMode("view");
    setEditForm(null);
    setOpenAppId(null);
    setOpenMenuDetail(false);
  };
  const onSelect = (v) => {
    if (isMobile()) {
      router.push(`/empresa/vacante/${v.id}`);
      return;
    }
    selectDesktop(v);
  };

  /* ---------- Acciones (nueva/editar/apps/estado) ---------- */
  const openNew = () => {
    if (isMobile()) { router.push("/empresa/vacante/nueva"); return; }
    const blank = {
      id: null,
      title: "",
      modality: "presencial",
      compensation: "Apoyo económico",
      language: "ES",
      location_text: "",
      requirements: "",
      activities: "",
      status: "activa",
      spots_total: 1,
      program_ids: [],
    };
    setSelected(null);
    setEditForm(blank);
    setMode("edit");
    setOpenMenuDetail(false);
  };

  const beginEditSelected = () => {
    if (!selected) return;
    if (isMobile()) { router.push(`/empresa/vacante/${selected.id}?edit=1`); return; }
    setEditForm({
      id: selected.id,
      title: selected.title || "",
      modality: selected.modality || "presencial",
      compensation: selected.compensation || "Apoyo económico",
      language: selected.language || "ES",
      location_text: selected.location_text || "",
      requirements: selected.requirements || "",
      activities: selected.activities || "",
      status: selected.status || "activa",
      spots_total: Number(selected.spots_total ?? 1),
      program_ids: Array.isArray(selected.program_ids) ? [...selected.program_ids] : [],
    });
    setMode("edit");
    setOpenMenuDetail(false);
  };

  const goApps = () => {
    if (!selected) return;
    if (isMobile()) { router.push(`/empresa/vacante/${selected.id}#postulaciones`); return; }
    setMode("apps");
    setOpenAppId(null);
    setOpenMenuDetail(false);
  };

  const toggleActive = async (vac) => {
    const inactive = isInactive(vac);
    const ok = confirm(`¿Seguro que deseas ${inactive ? "activar" : "desactivar"} esta vacante?`);
    if (!ok) return;
    try {
      const newStatus = inactive ? "activa" : "inactiva";
      const { error } = await supabase.from("vacancies")
        .update({ status: newStatus })
        .eq("id", vac.id);
      if (error) throw error;
      setVacancies(prev => prev.map(v => v.id === vac.id ? { ...v, status: newStatus } : v));
      if (selected?.id === vac.id) setSelected(s => ({ ...s, status: newStatus }));
      setOpenMenuDetail(false);
    } catch (e) {
      alert(e.message || "No se pudo actualizar el estado.");
    }
  };

  /* ---------- Eliminar vacante ---------- */
  const deleteVacancy = async (vac) => {
    const ok = confirm(`¿Estás seguro de que quieres ELIMINAR permanentemente la vacante "${vac.title}"? Esta acción no se puede deshacer y también eliminará todas las postulaciones asociadas.`);
    if (!ok) return;
    
    try {
      // Primero eliminar las postulaciones relacionadas
      const { error: appsError } = await supabase
        .from("applications")
        .delete()
        .eq("vacancy_id", vac.id);
      
      if (appsError) {
        console.error("Error deleting applications:", appsError);
        // Continuamos aunque falle, para intentar eliminar la vacante igualmente
      }

      // Luego eliminar los programas asociados
      const { error: programsError } = await supabase
        .from("vacancy_programs")
        .delete()
        .eq("vacancy_id", vac.id);
      
      if (programsError) {
        console.error("Error deleting programs:", programsError);
        // Continuamos aunque falle
      }

      // Finalmente eliminar la vacante
      const { error } = await supabase
        .from("vacancies")
        .delete()
        .eq("id", vac.id);
      
      if (error) throw error;

      // Actualizar el estado local
      setVacancies(prev => prev.filter(v => v.id !== vac.id));
      
      // Si la vacante eliminada era la seleccionada, limpiar la selección
      if (selected?.id === vac.id) {
        setSelected(null);
        setMode("view");
      }
      
      setOpenMenuDetail(false);
      
      // Mostrar mensaje de éxito
      alert("Vacante eliminada correctamente.");
      
    } catch (e) {
      console.error("Error deleting vacancy:", e);
      alert(e.message || "No se pudo eliminar la vacante.");
    }
  };

  /* ---------- Guardar/descartar (form) ---------- */
  const onDiscard = () => {
    if (editForm?.id) {
      const v = vacancies.find(x => x.id === editForm.id);
      if (v) selectDesktop(v);
      else { setMode("view"); setEditForm(null); }
    } else {
      if (selected) setMode("view");
      else { setMode("view"); setEditForm(null); }
    }
  };

  const syncVacancyPrograms = async (vacancyId, programIds = []) => {
    await supabase.from("vacancy_programs").delete().eq("vacancy_id", vacancyId);
    if (programIds.length) {
      const rows = programIds.map(pid => ({ vacancy_id: vacancyId, program_id: pid }));
      const { error: insErr } = await supabase.from("vacancy_programs").insert(rows);
      if (insErr) throw insErr;
    }
  };

  const onSave = async (e) => {
    e.preventDefault();
    try {
      const f = editForm;
      if (!f.title?.trim()) { alert("Escribe un título."); return; }

      if (f.id) {
        const { data, error } = await supabase
          .from("vacancies")
          .update({
            title: f.title,
            modality: f.modality,
            compensation: f.compensation,
            language: f.language,
            location_text: f.location_text,
            requirements: f.requirements,
            activities: f.activities,
            spots_total: Number(f.spots_total || 1),
            status: f.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", f.id)
          .select()
          .single();
        if (error) throw error;

        await syncVacancyPrograms(f.id, f.program_ids || []);

        const updated = { ...data, program_ids: [...(f.program_ids || [])] };
        setVacancies(prev => prev.map(v => v.id === f.id ? updated : v));
        setSelected(updated);
        setMode("view");
        setEditForm(null);
      } else {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user || !company) throw new Error("Falta usuario o empresa.");

        const { data, error } = await supabase
          .from("vacancies")
          .insert({
            company_id: company.id,
            title: f.title,
            modality: f.modality,
            compensation: f.compensation,
            language: f.language,
            location_text: f.location_text,
            requirements: f.requirements,
            activities: f.activities,
            spots_total: Number(f.spots_total || 1),
            status: f.status || "activa",
          })
          .select()
          .single();
        if (error) throw error;

        await syncVacancyPrograms(data.id, f.program_ids || []);

        const newVac = { ...data, program_ids: [...(f.program_ids || [])] };
        setVacancies(prev => [newVac, ...prev]);
        selectDesktop(newVac);
      }
    } catch (e2) {
      console.error(e2);
      alert(e2.message || "No se pudo guardar la vacante.");
    }
  };

  /* ---------- Postulaciones (apps) ---------- */
  useEffect(() => {
    let ignore = false;
    const fetchApps = async () => {
      if (!selected || mode !== "apps") { setApps([]); return; }
      setAppsLoading(true);
      const myId = ++reqSeq.current;

      const { data, error } = await supabase
        .from("applications")
        .select(`
          id,
          status,
          offer_expires_at,
          decision,
          decision_at,
          auto_declined,
          applied_at,
          student:profiles ( id, full_name, avatar_url, cv_url, program_id )
        `)
        .eq("vacancy_id", selected.id)
        .in("status", ["postulada","oferta","rechazada","aceptada","retirada"])
        .order("applied_at", { ascending: false });

      if (ignore || myId !== reqSeq.current) return;

      if (error) {
        setErr(error.message);
        setApps([]);
      } else {
        setErr("");
        setApps(data || []);
      }
      setAppsLoading(false);
    };
    fetchApps();
    return () => { ignore = true; };
  }, [selected, mode]);

  const sendOffer = async (appId, days = 5) => {
  try {
    if (!selected) return;
    if (isInactive(selected) || isFull(selected)) {
      alert("Esta vacante no tiene cupo disponible o está inactiva.");
      return;
    }

    // NUEVO: llama a la RPC que acepta y notifica
    const { error } = await supabase.rpc("company_accept_application", {
      p_application_id: appId,
      p_offer_note: null,    
      p_days_to_expire: days 
    });
    if (error) throw error;

    // UI local
    setApps(prev => prev.map(a =>
      a.id === appId
        ? {
            ...a,
            status: "oferta",
            offer_expires_at: new Date(Date.now() + days * 86400000).toISOString()
          }
        : a
    ));
  } catch (e) {
    console.error(e);
    alert(e.message || "No se pudo marcar como oferta.");
  }
};


  const rejectApp = async (appId) => {
    try {
      const { error } = await supabase.rpc("company_set_application_status", {
        p_app_id: appId,
        p_status: "rechazada",
        p_offer_days: 0,
      });
      if (error) throw error;
      setApps(prev => prev.map(a => a.id === appId ? { ...a, status: "rechazada" } : a));
    } catch (e) {
      console.error(e);
      alert(e.message || "No se pudo rechazar la postulación.");
    }
  };

  /* ---------- Render ---------- */
  if (loading) {
    return (
      <>
        <Navbar />
        <main className="jobs-wrap"><div className="jobs-skeleton">Cargando…</div></main>
        <Footer />
      </>
    );
  }

  const companyName = company?.name || "Empresa";

  return (
    <>
      <Navbar />
      <main className="jobs-wrap" ref={pageRef}>
        {err && (
          <div className="jobs-error" role="alert">
            {err} {!company && <a href="/empresa/signup" style={{ color:"#2563eb", textDecoration:"underline", marginLeft:8 }}>Crear empresa</a>}
          </div>
        )}

        {/* ---------- UI: barra superior ---------- */}
        <div className="jobs-searchbar">
          <div className="jobs-input">
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
              <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="2" fill="#2563eb" />
              <line x1="14.5" y1="14.5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" />
            </svg>
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Buscar por título de la vacante" />
          </div>
          <button className="jobs-searchbtn" onClick={openNew} aria-label="Crear nueva vacante">Nueva vacante</button>
        </div>

        {/* ---------- UI: filtros ---------- */}
        <div className="jobs-filters">
          <Pill label="Estado" value={fltEstado} onChange={setFltEstado}
            options={["","activa","inactiva"]}
            labels={{"": "Todas", activa:"Activas", inactiva:"Inactivas"}}
          />
          <Pill label="Cupo" value={fltCupo} onChange={setFltCupo}
            options={["","con_cupo","llenas"]}
            labels={{"": "Todas", con_cupo:"Con cupo", llenas:"Llenas"}}
          />
        </div>

        {/* ---------- UI: grid ---------- */}
        <section className="jobs-grid">
          {/* ---------- UI: lista de vacantes ---------- */}
          <aside className="jobs-listing">
            {filtered.map((v) => (
              <button
                key={v.id}
                className={`jobs-card ${selected?.id === v.id ? "is-active" : ""}`}
                onClick={() => onSelect(v)}
              >
                <div className="jobs-card-left" />
                <div className="jobs-card-body">
                  <div className="jobs-card-top" style={{ justifyContent:"space-between" }}>
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <LogoSquare src={company?.logo_url} name={companyName} />
                      <div>
                        <h4 className="jobs-card-title" style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <EstadoDot v={v} />
                          <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v.title}</span>
                        </h4>
                        <div className="jobs-card-company">{companyName}</div>
                      </div>
                    </div>
                    <div style={{ width: 0, height: 0 }} />
                  </div>

                  <div className="jobs-meta">
                    <span>Modalidad {v.modality}</span>
                    <span>Compensación {v.compensation || "N/A"}</span>
                  </div>

                  <div className="jobs-loc-row">
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                      <path fill="currentColor" d="M12 2A7 7 0 0 0 5 9c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7m0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
                    </svg>
                    <span className="jobs-muted">{v.location_text || "Ubicación N/A"}</span>
                  </div>
                </div>
              </button>
            ))}
            {!filtered.length && <div className="jobs-empty small">Sin vacantes con esos filtros.</div>}
          </aside>

          {/* ---------- UI: panel derecho ---------- */}
          <article className="jobs-detail">
            {mode === "view" && !selected && <div className="jobs-empty">Selecciona una vacante.</div>}

            {mode === "view" && selected && (
              <div className="jobs-detail-inner">
                <header className="jobs-detail-head">
                  <div className="jobs-detail-titles">
                    <h2 className="jobs-title" style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <LogoSquare src={company?.logo_url} name={companyName} />
                      <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <EstadoDot v={selected} /> {selected.title}
                      </span>
                    </h2>
                    <div className="jobs-chips">
                      <span className="jobs-chip">{selected.modality}</span>
                      <span className="jobs-chip">{selected.compensation}</span>
                      <span className="jobs-chip">Idioma {selected.language || "ES"}</span>
                      {selected?.program_ids?.length > 0 && selected.program_ids.map(pid => {
                        const p = programs.find(x => x.id === pid);
                        return <span key={pid} className="jobs-chip">Programa {p?.key || "?"}</span>;
                      })}
                    </div>
                    <p className="jobs-location">
                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                        <path fill="currentColor" d="M12 2A7 7 0 0 0 5 9c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7m0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
                      </svg>
                      {selected.location_text || "Ubicación no especificada"}
                    </p>
                  </div>

                  <div data-kebab style={{ position:"relative" }}>
                    <button className="iconbtn" aria-label="Más acciones" onClick={()=>setOpenMenuDetail(s=>!s)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                        <path fill="currentColor" d="M12 7a2 2 0 110-4 2 2 0 010 4m0 7a2 2 0 110-4 2 2 0 010 4m0 7a2 2 0 110-4 2 2 0 010 4"/>
                      </svg>
                    </button>
                    {openMenuDetail && (
                      <Menu>
                        <MenuItem onClick={beginEditSelected}>Editar</MenuItem>
                        <MenuItem onClick={()=>toggleActive(selected)}>
                          {String(selected.status).toLowerCase().includes("inactiv") ? "Activar vacante" : "Desactivar vacante"}
                        </MenuItem>
                        <MenuItem onClick={() => deleteVacancy(selected)} danger>
                          Eliminar vacante
                        </MenuItem>
                      </Menu>
                    )}
                  </div>
                </header>

                <div style={{ display:"flex", gap:8, margin:"4px 0 10px" }}>
                  <div className={`jobs-chip ${isFull(selected) ? "danger" : ""}`}>
                    Cupo: {selected.spots_taken ?? 0}/{selected.spots_total ?? 1}
                  </div>
                </div>

                {selected.activities && (
                  <section className="jobs-section">
                    <h3>Actividades</h3>
                    <ul className="jobs-list">{splitLines(selected.activities).map((t,i)=><li key={i}>{t}</li>)}</ul>
                  </section>
                )}

                {selected.requirements && (
                  <section className="jobs-section">
                    <h3>Requisitos</h3>
                    <ul className="jobs-list">{splitLines(selected.requirements).map((t,i)=><li key={i}>{t}</li>)}</ul>
                  </section>
                )}

                {selected.location_text && (
                  <section className="jobs-section">
                    <h3>Ubicación en mapa</h3>
                    <MapEmbedByAddress address={selected.location_text} />
                  </section>
                )}

                <div className="jobs-cta" style={{ display:"flex", justifyContent:"flex-end" }}>
                  <button className="jobs-apply" onClick={goApps}>
                    Ver postulaciones
                  </button>
                </div>
              </div>
            )}

            {mode === "edit" && (
              <div className="jobs-detail-inner">
                <header className="jobs-detail-head">
                  <div className="jobs-detail-titles">
                    <h3 className="jobs-title">{editForm?.id ? "Editar vacante" : "Nueva vacante"}</h3>
                    <div className="jobs-muted small">Ajusta los campos y guarda los cambios.</div>
                  </div>
                </header>

                <form onSubmit={onSave} className="signup-form" style={{ display:"grid", gap:12 }}>
                  <div className="jobs-chips" style={{ gap:10 }}>
                    <span className="jobs-chip">Estado: {editForm?.status || "activa"}</span>
                    <span className="jobs-chip">Cupo total: {Number(editForm?.spots_total ?? 1)}</span>
                  </div>

                  <input
                    className="login-input"
                    type="text"
                    placeholder="Título de la vacante"
                    value={editForm?.title || ""}
                    onChange={(e)=>setEditForm(f=>({ ...f, title: e.target.value }))}
                    required
                  />

                  <div style={{ display:"grid", gap:10, gridTemplateColumns:"1fr 1fr 1fr" }}>
                    <label className="jobs-pill" style={{ gap:8 }}>
                      <span className="lbl">Modalidad</span>
                      <select
                        value={editForm?.modality || "presencial"}
                        onChange={(e)=>setEditForm(f=>({ ...f, modality: e.target.value }))}
                      >
                        <option value="presencial">Presencial</option>
                        <option value="híbrido">Híbrida</option>
                        <option value="remoto">Remota</option>
                      </select>
                    </label>

                    <label className="jobs-pill" style={{ gap:8 }}>
                      <span className="lbl">Compensación</span>
                      <select
                        value={editForm?.compensation || "Apoyo económico"}
                        onChange={(e)=>setEditForm(f=>({ ...f, compensation: e.target.value }))}
                      >
                        <option value="Apoyo económico">Apoyo económico</option>
                        <option value="Sin apoyo">Sin apoyo</option>
                      </select>
                    </label>

                    <label className="jobs-pill" style={{ gap:8 }}>
                      <span className="lbl">Idioma</span>
                      <select
                        value={editForm?.language || "ES"}
                        onChange={(e)=>setEditForm(f=>({ ...f, language: e.target.value }))}
                      >
                        <option value="ES">ES</option>
                        <option value="EN">EN</option>
                      </select>
                    </label>
                  </div>

                  <input
                    className="login-input"
                    type="text"
                    placeholder="Ubicación (texto)"
                    value={editForm?.location_text || ""}
                    onChange={(e)=>setEditForm(f=>({ ...f, location_text: e.target.value }))}
                  />

                  <div style={{ display:"grid", gap:10, gridTemplateColumns:"1fr 1fr" }}>
                    <label className="jobs-pill" style={{ gap:8 }}>
                      <span className="lbl">Estado</span>
                      <select
                        value={editForm?.status || "activa"}
                        onChange={(e)=>setEditForm(f=>({ ...f, status: e.target.value }))}
                      >
                        <option value="activa">Activa</option>
                        <option value="inactiva">Inactiva</option>
                      </select>
                    </label>

                    <label className="jobs-pill" style={{ gap:8 }}>
                      <span className="lbl">Cupo total</span>
                      <input
                        className="login-input"
                        type="number"
                        min={1}
                        value={editForm?.spots_total ?? 1}
                        onChange={(e)=>setEditForm(f=>({ ...f, spots_total: Number(e.target.value || 1) }))}
                        style={{ width:"120px" }}
                      />
                    </label>
                  </div>

                  <label className="jobs-pill" style={{ gap:8, alignItems:"flex-start" }}>
                    <div style={{ display:"grid", gap:6 }}>
                      <span className="lbl" style={{ fontSize:16 }}>Programas</span>
                      {programs.map(p => {
                        const checked = (editForm?.program_ids || []).includes(p.id);
                        return (
                          <label key={p.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const on = e.target.checked;
                                setEditForm(f => {
                                  const set = new Set(f.program_ids || []);
                                  if (on) set.add(p.id); else set.delete(p.id);
                                  return { ...f, program_ids: Array.from(set) };
                                });
                              }}
                            />
                            <span>{p.key} — {p.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </label>

                  <textarea
                    className="login-input"
                    rows={4}
                    placeholder="Actividades (una por línea)"
                    value={editForm?.activities || ""}
                    onChange={(e)=>setEditForm(f=>({ ...f, activities: e.target.value }))}
                  />
                  <textarea
                    className="login-input"
                    rows={4}
                    placeholder="Requisitos (uno por línea)"
                    value={editForm?.requirements || ""}
                    onChange={(e)=>setEditForm(f=>({ ...f, requirements: e.target.value }))}
                  />

                  <div className="jobs-cta" style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                    <button type="button" className="jobs-apply" onClick={onDiscard} style={{ background:"#ffffffff", color: "#1F3354" }}>
                      Descartar
                    </button>
                    <button className="jobs-apply" type="submit">
                      Guardar cambios
                    </button>
                  </div>
                </form>
              </div>
            )}

            {mode === "apps" && selected && (
              <div className="jobs-detail-inner">
                <header className="jobs-detail-head">
                  <div className="jobs-detail-titles">
                    <h3 className="jobs-title">Postulaciones: {selected.title}</h3>
                    <div className="jobs-muted small">
                      Al enviar una oferta se notificará al alumno. La plaza solo se confirma cuando el alumno acepta tu oferta.
                    </div>
                  </div>
                  <button className="jobs-searchbtn" onClick={()=>setMode("view")}>Volver</button>
                </header>

                <div style={{ display:"flex", gap:8, margin:"6px 0 10px" }}>
                  <div className={`jobs-chip ${isFull(selected) ? "danger" : ""}`}>
                    Cupo: {selected.spots_taken ?? 0}/{selected.spots_total ?? 1}
                  </div>
                </div>

                {appsLoading && <div className="jobs-skeleton">Cargando postulaciones…</div>}

                {!appsLoading && (
                  <section className="apps-list" style={{ display:"grid", gap:12 }}>
                    {apps.map((app) => {
                      const open = openAppId === app.id;
                      const canOffer = app.status === "postulada" && !isInactive(selected) && !isFull(selected);
                      const program = programs.find(p => p.id === app.student?.program_id);
                      return (
                        <StudentCard
                          key={app.id}
                          app={app}
                          program={program}
                          open={open}
                          onToggle={() => setOpenAppId(open ? null : app.id)}
                          onSendOffer={() => sendOffer(app.id, 5)}
                          onReject={() => rejectApp(app.id)}
                          canOffer={canOffer}
                        />
                      );
                    })}
                    {!apps.length && <div className="jobs-empty small">Aún no hay postulaciones.</div>}
                  </section>
                )}
              </div>
            )}
          </article>
        </section>
      </main>
      <Footer />
    </>
  );
}

/* ---------- UI: subcomponentes ---------- */
function EstadoDot({ v }) {
  const left = Number(v?.spots_left ?? Math.max((v?.spots_total ?? 0) - (v?.spots_taken ?? 0), 0));
  const inactive = String(v?.status || "").toLowerCase().includes("inactiv");
  const full = left <= 0;
  const info = inactive
    ? { c:"#9ca3af", t:"Vacante inactiva"}
    : (full ? { c:"#2563eb", t:"Cupo lleno"} : { c:"#10b981", t:"Activa (con cupo)" });
  return (
    <span
      title={info.t}
      style={{ display:"inline-block", width:10, height:10, borderRadius:999, background:info.c, boxShadow:"0 0 0 2px #fff" }}
    />
  );
}

function Pill({ label, value, options = [], onChange, labels }) {
  return (
    <label className="jobs-pill">
      <span className="lbl">{label}</span>
      <select value={value} onChange={(e)=>onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o || "all"} value={o}>{(labels && labels[o]) ?? (o || "Todos")}</option>
        ))}
      </select>
    </label>
  );
}

function Menu({ children }) {
  return (
    <div role="menu" style={{
      position:"absolute", right:0, top:28, background:"#fff", border:"1px solid #e6eaf1",
      borderRadius:8, boxShadow:"0 8px 20px rgba(0,0,0,.08)", minWidth:220, zIndex:20, padding:6
    }}>
      {children}
    </div>
  );
}

function MenuItem({ children, onClick, danger = false }) {
  return (
    <button
      className="jobs-more"
      onClick={onClick}
      style={{ 
        display: "block", 
        width: "100%", 
        textAlign: "left", 
        padding: "8px 10px", 
        border: "none", 
        background: "transparent", 
        cursor: "pointer",
        color: danger ? "#dc2626" : "#1f2937",
        fontWeight: danger ? "600" : "normal"
      }}
    >
      {children}
    </button>
  );
}

function StudentCard({ app, program, open, onToggle, onSendOffer, onReject, canOffer }) {
  const subtitle = (() => {
    if (app.student?.email) return app.student.email;
    if (program?.key || program?.name) return `${program?.key ?? ""}${program?.key && program?.name ? " — " : ""}${program?.name ?? ""}`;
    return "Alumno";
  })();

  return (
    <article
      className="student-card"
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e)=>{ if (e.key === "Enter" || e.key === " ") onToggle(); }}
      style={{
        position:"relative",
        background:"#fff",
        border:"1px solid #e6eaf1",
        borderRadius:14,
        padding:14,
        display:"grid",
        gap:10,
        boxShadow: open ? "0 10px 25px rgba(0,0,0,.08)" : "0 2px 10px rgba(0,0,0,.04)",
        transition:"box-shadow .2s ease, transform .05s ease",
      }}
    >
      {open && (
        <div style={{
          position:"absolute", right:0, top:0, bottom:0, width:6, borderRadius:"0 14px 14px 0",
          background:"#3b82f6"
        }} />
      )}

      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:44, height:44, borderRadius:999, background:"#eef2f7", overflow:"hidden", flex:"0 0 44px", display:"grid", placeItems:"center" }}>
          {app.student?.avatar_url
            ? /* eslint-disable-next-line @next/next/no-img-element */
              <img src={app.student.avatar_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            : (
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
                <path fill="#9aa6b2" d="M12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14m0-11a3 3 0 1 0 0 6 3 3 0 0 0 0-6m0 7.2a5.2 5.2 0 0 0-4.5 2.6 6.8 6.8 0 0 0 9 0A5.2 5.2 0 0 0 12 15.2Z"/>
              </svg>
            )
          }
        </div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:16, lineHeight:1.2, color:"#1f2937", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {app.student?.full_name || "Estudiante"}
          </div>
          <div style={{ fontSize:13, color:"#6b7280", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {subtitle}
          </div>
        </div>

        <StatusChip status={app.status} />

        <svg
          width="18" height="18" viewBox="0 0 24 24" aria-hidden
          style={{ marginLeft:8, transform: open ? "rotate(180deg)" : "rotate(0)", transition:"transform .15s" }}
        >
          <path fill="currentColor" d="M7 10l5 5 5-5z" />
        </svg>
      </div>

      {open && (
        <div style={{ paddingLeft:56 }}>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:10 }}>
            <InfoPill label="Aplicó" value={timeAgo(app.applied_at)} />
            {program?.key && <InfoPill label="Programa" value={program.key} />}
            {app.offer_expires_at && <InfoPill label="Expira" value={new Date(app.offer_expires_at).toLocaleString()} />}
          </div>

          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {!!app.student?.cv_url && (
              <a
                className="btn"
                href={app.student.cv_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e)=>e.stopPropagation()}
                style={btnStyle("ghost")}
              >
                📄 Ver CV
              </a>
            )}

            {app.status === "postulada" && (
              <>
                <button
                  className="jobs-apply"
                  disabled={!canOffer}
                  onClick={(e) => { e.stopPropagation(); onSendOffer(); }}
                  title={canOffer ? "Enviar oferta" : "No disponible"}
                >
                  Enviar oferta
                </button>

                <button
                  className="btn"
                  onClick={(e)=>{ e.stopPropagation(); onReject(); }}
                  style={btnStyle("ghost")}
                >
                  Rechazar
                </button>
              </>
            )}

            {app.status === "oferta" && <Badge text="Oferta enviada" tone="info" />}
            {app.status === "aceptada" && <Badge text="Aceptada ✅" tone="success" />}
            {app.status === "rechazada" && <Badge text="Rechazada" tone="muted" />}
            {app.status === "retirada" && <Badge text="Retirada por alumno" tone="muted" />}
          </div>
        </div>
      )}
    </article>
  );
}

function timeAgo(iso) {
  if (!iso) return "N/D";
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "justo ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const dd = Math.floor(h / 24);
  if (dd < 7) return `${dd} d`;
  return d.toLocaleDateString();
}

function StatusChip({ status }) {
  const map = {
    postulada: { label:"Postulada", bg:"#eef2f7", fg:"#1f3354" },
    oferta:    { label:"Oferta",    bg:"#eaf2ff", fg:"#1e40af" },
    aceptada:  { label:"Aceptada",  bg:"#ecfdf5", fg:"#065f46" },
    rechazada: { label:"Rechazada", bg:"#f3f4f6", fg:"#6b7280" },
    retirada:  { label:"Retirada",  bg:"#f3f4f6", fg:"#6b7280" },
  };
  const s = map[status] || { label: status || "Estado", bg:"#f3f4f6", fg:"#6b7280" };
  return (
    <span style={{
      fontSize:12, padding:"4px 8px", borderRadius:999, background:s.bg, color:s.fg,
      whiteSpace:"nowrap"
    }}>
      {s.label}
    </span>
  );
}

function InfoPill({ label, value }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:6,
      fontSize:12, background:"#f8fafc", color:"#475569",
      padding:"6px 10px", borderRadius:999, border:"1px solid #e6eaf1"
    }}>
      <strong style={{ fontWeight:600, color:"#1f2937" }}>{label}:</strong> {value}
    </span>
  );
}

function Badge({ text, tone="info" }) {
  const tones = {
    info:    { bg:"#eaf2ff", fg:"#1e40af" },
    success: { bg:"#ecfdf5", fg:"#065f46" },
    muted:   { bg:"#f3f4f6", fg:"#6b7280" },
  };
  const t = tones[tone] || tones.info;
  return (
    <span style={{ fontSize:12, padding:"6px 10px", borderRadius:8, background:t.bg, color:t.fg }}>
      {text}
    </span>
  );
}

function btnStyle(variant="primary", disabled=false) {
  if (variant === "ghost") {
    return {
      padding:"8px 12px", borderRadius:10, border:"1px solid #dbe2ea", background:"#fff", color:"#1f3354",
      cursor:"pointer"
    };
  }
  return {
    padding:"8px 12px", borderRadius:10, border:"1px solid transparent",
    background: disabled ? "#a5b4fc" : "#4f46e5", color:"#fff",
    cursor: disabled ? "not-allowed" : "pointer"
  };
}