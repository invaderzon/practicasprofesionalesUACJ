// pages/alumno/buscar.js
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/navbar";
import Footer from "../../components/footer";
import { useActivePractice } from '../../components/hooks/useActivePractice';

/* ---------- UI: catálogos ---------- */
const MODALIDADES = ["Presencial", "Híbrida", "Remota"];
const COMPENSACIONES = ["Apoyo económico", "Sin apoyo"];
const IDIOMAS = ["ES", "EN"];

/* ---------- UI: normalizador y mapeos ---------- */
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const mapUIToDB_mod = (v) => {
  const k = norm(v);
  if (k === "presencial") return "presencial";
  if (k === "hibrida" || k === "hibrido") return "híbrido";
  if (k === "remota" || k === "remoto") return "remoto";
  return null;
};

const COMP_VARIANTS = {
  apoyo: ["apoyo_economico", "apoyo economico", "Apoyo económico", "apoyo económico", "APOYO ECONOMICO"],
  sin: ["sin_apoyo", "sin apoyo", "Sin apoyo", "SIN APOYO"],
};

const MAP_DB_TO_UI = {
  modalidad: { presencial: "Presencial", "híbrido": "Híbrida", remoto: "Remota" },
  comp: {
    apoyo_economico: "Apoyo económico",
    "Apoyo económico": "Apoyo económico",
    sin_apoyo: "Sin apoyo",
    "Sin apoyo": "Sin apoyo",
  },
};
const fmtMod = (dbVal) => MAP_DB_TO_UI.modalidad[dbVal] ?? dbVal ?? "Modalidad N/A";
const fmtComp = (dbVal) => MAP_DB_TO_UI.comp[dbVal] ?? dbVal ?? "Compensación N/A";

/* ---------- UI: icon buttons ---------- */
function IconBtn({ title, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: 36,
        height: 36,
        borderRadius: 999,
        border: "1px solid #d6d8df",
        background: "#fff",
        color: "#1F3354",
        cursor: "pointer",
        boxShadow: "0 1px 4px rgba(0,0,0,.06)"
      }}
    >
      {children}
    </button>
  );
}
function IconBookmark({ active = false }) {
  return active ? (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#2563eb" d="M6 2h12a1 1 0 0 1 1 1v18l-7-4-7 4V3a1 1 0 0 1 1-1Z" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="none"
        stroke="var(--color-principal)"
        strokeWidth="2"
        d="M6 2h12a1 1 0 0 1 1 1v18l-7-4-7 4V3a1 1 0 0 1 1-1Z"
      />
    </svg>
  );
}
function IconBan() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#1F3354"
        d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm5.657 15.657A8 8 0 1 1 20 12a7.95 7.95 0 0 1-2.343 5.657ZM7.05 7.05 16.95 16.95"
        stroke="#1F3354"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
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

/* ---------- UI: helpers ---------- */
function splitLines(text) {
  const arr = String(text || "").split(/\r?\n|•|- /).map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : ["No disponible"];
}
function Pill({ label, value, options = [], onChange }) {
  return (
    <label className="jobs-pill">
      <span className="lbl">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
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

/* ---------- Página ---------- */
export default function EstudiantesPage() {
  const router = useRouter();
  const reqSeq = useRef(0);

  const { hasActivePractice, loading: practiceLoading } = useActivePractice();

  // buscador y filtros
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");
  const [filters, setFilters] = useState({ modalidad: "", comp: "", idioma: "" });

  // datos
  const [vacancies, setVacancies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // paginación
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;
  const [hasMore, setHasMore] = useState(true);

  // usuario y flags 
  const [userId, setUserId] = useState(null);
  const [studentProgramId, setStudentProgramId] = useState(null);
  const [favIds, setFavIds] = useState([]);
  const [hiddenIds, setHiddenIds] = useState([]);
  
  // Estados separados y específicos
  const [applicationStatuses, setApplicationStatuses] = useState({});
  const [completedVacancyIds, setCompletedVacancyIds] = useState([]);
  const [offerVacancyIds, setOfferVacancyIds] = useState([]);
  const [participatingVacancyIds, setParticipatingVacancyIds] = useState([]);

  /* ---------- BD: boot - COMPLETAMENTE CORREGIDO ---------- */
  useEffect(() => {
    let ignore = false;
    const boot = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || ignore) return;
      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("program_id")
        .eq("id", user.id)
        .single();
      
      if (!ignore) {
        setStudentProgramId(profile?.program_id ?? null);
        console.log("🎯 Programa del estudiante:", profile?.program_id);
      }

      // Cargar TODOS los datos necesarios
      const [
        { data: favData }, 
        { data: hidData }, 
        { data: appsData },
        { data: practicesData }
      ] = await Promise.all([
        supabase.from("vacancy_favorites").select("vacancy_id").eq("student_id", user.id).limit(500),
        supabase.from("vacancy_hidden").select("vacancy_id").eq("student_id", user.id).limit(500),
        supabase.from("applications").select("vacancy_id, status").eq("student_id", user.id).limit(1000),
        supabase.from("practices").select("vacancy_id, status").eq("student_id", user.id).limit(100)
      ]);

      if (!ignore && favData) setFavIds(favData.map((x) => x.vacancy_id));
      if (!ignore && hidData) setHiddenIds(hidData.map((x) => x.vacancy_id));
      
      if (!ignore) {
        console.log("📊 Todas las aplicaciones cargadas:", appsData);
        console.log("🏆 Prácticas cargadas:", practicesData);
        
        // Separar correctamente todos los estados
        const statusMap = {};
        const completedIds = [];
        const offerIds = [];
        const participatingIds = [];

        // Procesar aplicaciones
        if (appsData) {
          appsData.forEach(app => {
            statusMap[app.vacancy_id] = app.status;
            
            if (['completada', 'terminada', 'finalizada'].includes(app.status)) {
              completedIds.push(app.vacancy_id);
            }
            
            if (app.status === 'oferta') {
              offerIds.push(app.vacancy_id);
            }
          });
        }

        // Procesar prácticas activas
        if (practicesData) {
          practicesData.forEach(practice => {
            if (practice.status === 'active') {
              participatingIds.push(practice.vacancy_id);
            }
          });
        }
        
        setApplicationStatuses(statusMap);
        setCompletedVacancyIds(completedIds);
        setOfferVacancyIds(offerIds);
        setParticipatingVacancyIds(participatingIds);
      }
    };
    boot();
    return () => { ignore = true; };
  }, []);

  /* ---------- BD: carga de vacantes por programa ---------- */
  useEffect(() => {
    const fetchData = async () => {
      const myId = ++reqSeq.current;
      setLoading(true);
      setErrorMsg("");

      // Si no hay studentProgramId, mostrar vacantes sin filtrar por programa
      if (!studentProgramId) {
        console.log("⚠️ No hay programa asignado, mostrando todas las vacantes");
        let query = supabase
          .from("vacancies")
          .select(`
            id, title, modality, compensation, language, requirements, activities,
            location_text, rating_avg, rating_count, status, created_at, company_id,
            spots_total, spots_taken, spots_left,
            company:companies!left ( id, name, industry, logo_url )
          `)
          .in("status", ["activa", "active"])
          .gt("spots_left", 0);

        // Aplicar filtros básicos
        if (q) {
          const safe = String(q).replace(/[\*\(\)",]/g, " ").trim();
          const likeStar = `*${safe}*`;
          query = query.or(`title.ilike.${likeStar},location_text.ilike.${likeStar}`);
        }

        if (loc) query = query.ilike("location_text", `%${loc}%`);

        const dbMod = mapUIToDB_mod(filters.modalidad);
        if (dbMod) query = query.eq("modality", dbMod);

        if (filters.comp) {
          const k = norm(filters.comp);
          if (k === "apoyo economico") query = query.in("compensation", COMP_VARIANTS.apoyo);
          else if (k === "sin apoyo") query = query.in("compensation", COMP_VARIANTS.sin);
        }

        if (filters.idioma) query = query.eq("language", filters.idioma);

        if (hiddenIds.length) {
          const csvHidden = `(${hiddenIds.map(id => `"${id}"`).join(",")})`;
          query = query.not("id", "in", csvHidden);
        }

        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.order("created_at", { ascending: false }).range(from, to);

        const { data, error } = await query;
        if (myId !== reqSeq.current) return;

        if (error) {
          setErrorMsg(error.message || "Error al cargar vacantes.");
          setVacancies([]);
          setSelected(null);
          setHasMore(false);
        } else {
          setVacancies(data || []);
          setSelected((data && data[0]) || null);
          setHasMore((data || []).length === PAGE_SIZE);
        }

        setLoading(false);
        return;
      }

      // Si hay studentProgramId, filtrar por programa
      let companyIds = [];
      if (q) {
        const safeQ = String(q).replace(/[%*(),"]/g, " ").trim();
        const { data: compHits } = await supabase
          .from("companies")
          .select("id")
          .ilike("name", `%${safeQ}%`)
          .limit(50);
        if (myId !== reqSeq.current) return;
        if (compHits?.length) companyIds = compHits.map((c) => c.id);
      }

      let query = supabase
        .from("vacancies")
        .select(`
          id, title, modality, compensation, language, requirements, activities,
          location_text, rating_avg, rating_count, status, created_at, company_id,
          spots_total, spots_taken, spots_left,
          company:companies!left ( id, name, industry, logo_url ),
          vacancy_programs!inner ( program_id )
        `)
        .in("status", ["activa", "active"])
        .gt("spots_left", 0)
        .eq("vacancy_programs.program_id", studentProgramId);

      if (q) {
        const safe = String(q).replace(/[\*\(\)",]/g, " ").trim();
        const likeStar = `*${safe}*`;
        const parts = [`title.ilike.${likeStar}`, `location_text.ilike.${likeStar}`];
        if (companyIds.length) {
          const csv = `(${companyIds.map(id => `"${id}"`).join(",")})`;
          parts.push(`company_id.in.${csv}`);
        }
        query = query.or(parts.join(","));
      }

      if (loc) query = query.ilike("location_text", `%${loc}%`);

      const dbMod = mapUIToDB_mod(filters.modalidad);
      if (dbMod) query = query.eq("modality", dbMod);

      if (filters.comp) {
        const k = norm(filters.comp);
        if (k === "apoyo economico") query = query.in("compensation", COMP_VARIANTS.apoyo);
        else if (k === "sin apoyo") query = query.in("compensation", COMP_VARIANTS.sin);
      }

      if (filters.idioma) query = query.eq("language", filters.idioma);

      if (hiddenIds.length) {
        const csvHidden = `(${hiddenIds.map(id => `"${id}"`).join(",")})`;
        query = query.not("id", "in", csvHidden);
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, error } = await query;
      if (myId !== reqSeq.current) return;

      if (error) {
        setErrorMsg(error.message || "Error al cargar vacantes.");
        setVacancies([]);
        setSelected(null);
        setHasMore(false);
      } else {
        setVacancies(data || []);
        setSelected((data && data[0]) || null);
        setHasMore((data || []).length === PAGE_SIZE);
      }

      setLoading(false);
    };

    fetchData();
  }, [q, loc, filters, page, hiddenIds, studentProgramId]);

  /* ---------- BD: acciones favoritos/ocultas ---------- */
  const toggleFavorite = async (vacancyId) => {
    if (!userId) return;
    try {
      if (favIds.includes(vacancyId)) {
        const { error } = await supabase
          .from("vacancy_favorites")
          .delete()
          .eq("student_id", userId)
          .eq("vacancy_id", vacancyId);
        if (error) throw error;
        setFavIds((prev) => prev.filter((id) => id !== vacancyId));
      } else {
        const { error } = await supabase
          .from("vacancy_favorites")
          .insert({ student_id: userId, vacancy_id: vacancyId });
        if (error) throw error;
        setFavIds((prev) => [...prev, vacancyId]);
      }
    } catch (e) {
      console.error(e);
      alert(e.message || "No se pudo actualizar favoritos.");
    }
  };

  const toggleHidden = async (vacancyId) => {
    if (!userId) return;
    try {
      if (hiddenIds.includes(vacancyId)) {
        const { error } = await supabase
          .from("vacancy_hidden")
          .delete()
          .eq("student_id", userId)
          .eq("vacancy_id", vacancyId);
        if (error) throw error;
        setHiddenIds((prev) => prev.filter((id) => id !== vacancyId));
      } else {
        const { error: hideErr } = await supabase
          .from("vacancy_hidden")
          .insert({ student_id: userId, vacancy_id: vacancyId });
        if (hideErr) throw hideErr;

        if (favIds.includes(vacancyId)) {
          const { error: favDelErr } = await supabase
            .from("vacancy_favorites")
            .delete()
            .eq("student_id", userId)
            .eq("vacancy_id", vacancyId);
          if (favDelErr) throw favDelErr;
          setFavIds((prev) => prev.filter((id) => id !== vacancyId));
        }
        setHiddenIds((prev) => [...prev, vacancyId]);

        if (selected?.id === vacancyId) {
          const next = vacancies.find((v) => v.id !== vacancyId && !hiddenIds.includes(v.id));
          setSelected(next || null);
        }
      }
    } catch (e) {
      console.error(e);
      alert(e.message || "No se pudo actualizar la visibilidad.");
    }
  };

  /* ---------- BD: postularse (vía RPC SECURITY DEFINER) ---------- */
  const applyNow = async (vacancy) => {
    try {
      if (!userId) { router.push("/login"); return; }
      if (!vacancy?.id) return;
      
      // Verificar participación activa en ESTA vacante específica
      const isParticipatingInThis = participatingVacancyIds.includes(vacancy.id);
      if (hasActivePractice && !isParticipatingInThis) {
        alert("Ya tienes un proyecto activo. No puedes postularte a otras vacantes.");
        return;
      }

      // Verificar si ya tiene oferta activa
      if (offerVacancyIds.includes(vacancy.id)) {
        alert("Ya tienes una oferta para esta vacante. Ve a la sección de ofertas para gestionarla.");
        router.push('/alumno/ofertas');
        return;
      }

      // Verificar si ya tiene una aplicación ACTIVA (no completada) para esta vacante
      const currentStatus = applicationStatuses[vacancy.id];
      if (currentStatus && ['postulada', 'en_revision', 'oferta', 'aceptada'].includes(currentStatus)) {
        alert("Ya te has postulado a esta vacante.");
        return;
      }

      // Si tiene una práctica COMPLETADA para esta vacante, mostrar confirmación
      if (completedVacancyIds.includes(vacancy.id)) {
        const ok = confirm("Ya completaste una práctica en esta vacante anteriormente. ¿Deseas postularte nuevamente?");
        if (!ok) return;
      }

      // Llama a la función SQL: public.apply_and_notify(uuid)
      const { error } = await supabase.rpc("apply_and_notify", {
        p_vacancy_id: vacancy.id,
      });

      if (error) {
        // Duplicado (ya postuló antes)
        if ((error.code === "23505") || /duplicate key|already exists/i.test(error.message || "")) {
          alert("Ya te habías postulado a esta vacante.");
          setApplicationStatuses(prev => ({ ...prev, [vacancy.id]: 'postulada' }));
          return;
        }
        throw error;
      }

      // Marca como postulada en UI
      setApplicationStatuses(prev => ({ ...prev, [vacancy.id]: 'postulada' }));
      setCompletedVacancyIds(prev => prev.filter(id => id !== vacancy.id));
      setOfferVacancyIds(prev => prev.filter(id => id !== vacancy.id));
      alert("¡Listo! Tu postulación fue enviada.");
    } catch (e) {
      console.error(e);
      alert(e.message || "No se pudo completar la postulación.");
    }
  };

  // Función completamente reescrita para determinar el estado del botón
  const getApplyButtonState = (vacancyId) => {
    const currentStatus = applicationStatuses[vacancyId];
    const isParticipatingInThis = participatingVacancyIds.includes(vacancyId);
    const hasOfferForThis = offerVacancyIds.includes(vacancyId);
    const hasCompletedThis = completedVacancyIds.includes(vacancyId);
    
    console.log("🎯 Estado del botón para vacante", vacancyId, ":", {
      currentStatus,
      hasActivePractice,
      isParticipatingInThis,
      hasOfferForThis,
      hasCompletedThis
    });

    // Participando activamente en ESTA vacante
    if (isParticipatingInThis) {
      return { 
        text: "✅ Ya estás participando", 
        disabled: false,
        type: "practicing",
        action: () => router.push('/alumno/mis-practicas')
      };
    }
    
    // Tiene oferta para ESTA vacante
    if (hasOfferForThis) {
      return { 
        text: "🎉 ¡Tienes una oferta!", 
        disabled: false,
        type: "offer",
        action: () => router.push('/alumno/ofertas')
      };
    }
    
    // Tiene práctica activa en OTRA vacante
    if (hasActivePractice && !isParticipatingInThis) {
      return { 
        text: "Práctica Activa", 
        disabled: true,
        type: "active_practice"
      };
    } 
    
    // Ya postulada normalmente
    else if (currentStatus && ['postulada', 'en_revision', 'aceptada'].includes(currentStatus)) {
      return { 
        text: "Ya postulada", 
        disabled: true,
        type: "applied"
      };
    } 
    
    // Práctica completada anteriormente
    else if (hasCompletedThis) {
      return { 
        text: "Postularse nuevamente", 
        disabled: false,
        type: "completed_retry"
      };
    } 
    
    // Postulación normal
    else {
      return { 
        text: "Postularse ahora", 
        disabled: false,
        type: "normal"
      };
    }
  };

  // Función para obtener texto del estado
  const getStatusText = (vacancyId) => {
    const currentStatus = applicationStatuses[vacancyId];
    const isParticipatingInThis = participatingVacancyIds.includes(vacancyId);
    const hasOfferForThis = offerVacancyIds.includes(vacancyId);
    const hasCompletedThis = completedVacancyIds.includes(vacancyId);
    
    // Participación activa primero
    if (isParticipatingInThis) return "✅ Participando activamente";
    if (hasOfferForThis) return "🎉 ¡Tienes una oferta!";
    if (hasActivePractice) return "Práctica activa";
    if (currentStatus === 'postulada') return "Postulación enviada";
    if (currentStatus === 'en_revision') return "En revisión por la empresa";
    if (currentStatus === 'aceptada') return "Oferta aceptada";
    if (hasCompletedThis) return "Práctica completada anteriormente";
    return "Disponible para postularse";
  };

  // Función para obtener color del estado
  const getStatusColor = (vacancyId) => {
    const currentStatus = applicationStatuses[vacancyId];
    const isParticipatingInThis = participatingVacancyIds.includes(vacancyId);
    const hasOfferForThis = offerVacancyIds.includes(vacancyId);
    const hasCompletedThis = completedVacancyIds.includes(vacancyId);
    
    // Participación activa primero
    if (isParticipatingInThis) return "#059669";
    if (hasOfferForThis) return "#d97706";
    if (hasActivePractice) return "#dc2626";
    if (currentStatus === 'postulada') return "#059669";
    if (currentStatus === 'en_revision') return "#7c3aed";
    if (currentStatus === 'aceptada') return "#059669";
    if (hasCompletedThis) return "#f59e0b";
    return "#6b7280";
  };

  /* ---------- Render ---------- */
  const filtered = useMemo(() => vacancies, [vacancies]);

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

  return (
    <>
      <Navbar />
      <main className="jobs-wrap">
        {/* buscador */}
        <div className="jobs-searchbar">
          <div className="jobs-input">
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
              <circle cx="9" cy="9" r="7" fill="#2563eb" stroke="currentColor" strokeWidth="2" />
              <line x1="14.5" y1="14.5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" />
            </svg>
            <input
              value={q}
              onChange={(e) => { setPage(0); setQ(e.target.value); }}
              placeholder="Título del empleo, palabras clave o empresa"
            />
          </div>

          <div className="jobs-input">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path fill="currentColor" d="M12 2A7 7 0 0 0 5 9c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7m0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
            </svg>
            <input
              value={loc}
              onChange={(e) => { setPage(0); setLoc(e.target.value); }}
              placeholder="Ciudad/colonia (p. ej., Ciudad Juárez)"
            />
          </div>

          <button className="jobs-searchbtn" onClick={() => setPage(0)} aria-label="Buscar">
            Buscar
          </button>
        </div>

        {/* Mensaje de práctica activa */}
        {hasActivePractice && (
          <div className="jobs-error" style={{ 
            background: "#f0fdf4", 
            borderColor: "#bbf7d0", 
            color: "#166534",
            marginBottom: "16px"
          }}>
            <strong>¡Tienes un proyecto activo!</strong> No puedes postularte a nuevas vacantes mientras seas parte de un proyecto.
          </div>
        )}

        {/* Mensaje de falta de programa */}
        {!studentProgramId && !loading && (
          <div className="jobs-error" style={{ 
            background: "#fef3c7", 
            borderColor: "#f59e0b", 
            color: "#92400e",
            marginBottom: "16px"
          }}>
            <strong>⚠️ Configura tu programa académico</strong> en tu perfil para ver vacantes específicas de tu carrera.
          </div>
        )}

        {/* filtros */}
        <div className="jobs-filters">
          <Pill
            label="Modalidad"
            value={filters.modalidad}
            onChange={(v) => { setPage(0); setFilters((s) => ({ ...s, modalidad: v })); }}
            options={MODALIDADES}
          />
          <Pill
            label="Compensación"
            value={filters.comp}
            onChange={(v) => { setPage(0); setFilters((s) => ({ ...s, comp: v })); }}
            options={COMPENSACIONES}
          />
          <Pill
            label="Idioma"
            value={filters.idioma}
            onChange={(v) => { setPage(0); setFilters((s) => ({ ...s, idioma: v })); }}
            options={IDIOMAS}
          />
        </div>

        {/* grid principal */}
        <section className="jobs-grid">
          {/* listado */}
          <aside className="jobs-listing">
            {loading && Array.from({ length: 6 }).map((_, i) => <div className="jobs-card sk" key={i} />)}

            {!loading && filtered.map((v) => {
              const isFav = favIds.includes(v.id);
              const isHidden = hiddenIds.includes(v.id);
              const buttonState = getApplyButtonState(v.id);
              const statusText = getStatusText(v.id);
              const statusColor = getStatusColor(v.id);
              const isParticipatingInThis = participatingVacancyIds.includes(v.id);
              const hasOfferForThis = offerVacancyIds.includes(v.id);
              
              return (
                <button
                  key={v.id}
                  className={`jobs-card ${selected?.id === v.id ? "is-active" : ""}`}
                  onClick={() => {
                    if (typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches) {
                      router.push(`/alumno/vacante/${v.id}`);
                    } else {
                      setSelected(v);
                    }
                  }}
                >
                  <div className="jobs-card-left" />
                  <div className="jobs-card-body">
                    <div className="jobs-card-top" style={{ justifyContent: "space-between" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <LogoSquare src={v.company?.logo_url} name={v.company?.name} />
                        <div>
                          <h4 className="jobs-card-title">{v.title}</h4>
                          <div className="jobs-card-company">{v.company?.name || "Empresa"}</div>
                          <div className="jobs-card-rating">
                            <Stars rating={v.rating_avg} compact />
                            <span className="jobs-muted small">({v.rating_count ?? 0})</span>
                          </div>
                        </div>
                      </div>

                      <div className="jobs-card-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <IconBtn
                          title={isFav ? "Quitar de favoritos" : "Agregar a favoritos"}
                          onClick={() => toggleFavorite(v.id)}
                        >
                          <IconBookmark active={isFav} />
                        </IconBtn>

                        <IconBtn
                          title={isHidden ? "Mostrar esta vacante" : "Ocultar esta vacante"}
                          onClick={() => toggleHidden(v.id)}
                        >
                          <IconBan active={isHidden} />
                        </IconBtn>
                      </div>
                    </div>

                    <div className="jobs-meta">
                      <span>{fmtMod(v.modality)}</span>
                      <span>{fmtComp(v.compensation)}</span>
                    </div>

                    <div className="jobs-loc-row">
                      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                        <path fill="currentColor" d="M12 2A7 7 0 0 0 5 9c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7m0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
                      </svg>
                      <span className="jobs-muted">{v.location_text || "Ubicación no especificada"}</span>
                    </div>

                    {/* Estado de postulación en la tarjeta */}
                    <div style={{ marginTop: 8 }}>
                      <span 
                        className="jobs-muted small" 
                        style={{ color: statusColor, fontWeight: 'bold' }}
                      >
                        {statusText}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}

            {!loading && hasMore && filtered.length > 0 && (
              <button className="jobs-more" onClick={() => setPage((p) => p + 1)}>
                Cargar más
              </button>
            )}

            {!loading && !filtered.length && (
              <div className="jobs-empty small">
                {studentProgramId 
                  ? "Sin resultados con esos filtros." 
                  : "No hay vacantes disponibles o necesitas configurar tu programa académico."}
              </div>
            )}
          </aside>

          {/* detalle */}
          <article className="jobs-detail">
            {loading && <div className="jobs-skeleton">Cargando…</div>}

            {!loading && !selected && (
              <div className="jobs-empty">
                {studentProgramId
                  ? "Selecciona una vacante para ver los detalles"
                  : "Configura tu programa en el perfil para ver vacantes dirigidas a tu carrera."}
              </div>
            )}

            {!loading && selected && (
              <div className="jobs-detail-inner">
                <header className="jobs-detail-head">
                  <div className="jobs-detail-titles">
                    <h2 className="jobs-title" style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <LogoSquare src={selected.company?.logo_url} name={selected.company?.name} />
                      {selected.title}
                    </h2>
                    <a className="jobs-company" href="#" onClick={(e) => e.preventDefault()}>
                      {selected.company?.name || "Empresa"}
                    </a>
                    <div className="jobs-rating">
                      <Stars rating={selected.rating_avg} />
                      <span className="jobs-muted">({selected.rating_count ?? 0})</span>
                    </div>
                  </div>
                </header>

                {/* Participando en ESTA vacante */}
                {participatingVacancyIds.includes(selected.id) && (
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

                {/* Tiene oferta para ESTA vacante */}
                {offerVacancyIds.includes(selected.id) && (
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

                {/* Práctica completada anteriormente */}
                {completedVacancyIds.includes(selected.id) && !offerVacancyIds.includes(selected.id) && !participatingVacancyIds.includes(selected.id) && (
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

                <div className="jobs-chips">
                  <span className="jobs-chip">{fmtMod(selected.modality)}</span>
                  <span className="jobs-chip">{fmtComp(selected.compensation)}</span>
                  <span className="jobs-chip">Idioma {selected.language || "ES"}</span>
                </div>

                <p className="jobs-location">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                    <path fill="currentColor" d="M12 2A7 7 0 0 0 5 9c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7m0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
                  </svg>
                  {selected.location_text || "Ubicación no especificada"}
                </p>

                <hr className="jobs-sep" />

                {selected.activities && (
                  <section className="jobs-section">
                    <h3>Actividades</h3>
                    <ul className="jobs-list">
                      {splitLines(selected.activities).map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </section>
                )}

                {selected.requirements && (
                  <section className="jobs-section">
                    <h3>Requisitos</h3>
                    <ul className="jobs-list">
                      {splitLines(selected.requirements).map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </section>
                )}

                {selected.location_text && (
                  <section className="jobs-section">
                    <h3>Ubicación en mapa</h3>
                    <MapEmbedByAddress address={selected.location_text} />
                  </section>
                )}

                <div className="jobs-cta">
                  {(() => {
                    const buttonState = getApplyButtonState(selected.id);
                    return (
                      <button
                        className="jobs-apply"
                        disabled={buttonState.disabled}
                        onClick={buttonState.action || (() => applyNow(selected))}
                        title={hasActivePractice ? "Ya tienes una práctica activa" : ""}
                        style={{
                          background: 
                            buttonState.type === "practicing" ? "#0ea5e9" :
                            buttonState.type === "offer" ? "#f59e0b" :
                            buttonState.type === "active_practice" ? "#f3f4f6" : 
                            buttonState.type === "completed_retry" ? "#f59e0b" : 
                            buttonState.type === "applied" ? "#0ea5e9" : "#2563eb",
                          color: buttonState.type === "active_practice" ? "#6b7280" : "#fff"
                        }}
                      >
                        {buttonState.text}
                      </button>
                    );
                  })()}
                </div>
              </div>
            )}
          </article>
        </section>

        {errorMsg && <div className="jobs-error">{errorMsg}</div>}
      </main>
      <Footer />
    </>
  );
}