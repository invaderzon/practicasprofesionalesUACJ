import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import Navbar from "../../../components/navbar";
import Footer from "../../../components/footer";

/* Avatar circular con iniciales */
function AvatarCircle({ src, name, size = 40 }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt="Foto"
        style={{ width: size, height: size, objectFit: "cover", borderRadius: "50%", display: "block" }}
      />
    );
  }
  const initials =
    (name || "")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <div className="alumno-avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

export default function GrupoDetalle() {
  const router = useRouter();
  const { id: groupId } = router.query;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [students, setStudents] = useState([]);
  const [active, setActive] = useState(null);

  // programas (para mapear id -> nombre)
  const [programs, setPrograms] = useState([]);
  
  // Programa del profesor
  const [professorProgramId, setProfessorProgramId] = useState(null);

  // ---- Búsqueda de alumnos ----
  const [searchQuery, setSearchQuery] = useState("");
  
  // ---- Agregar alumno (inline) ----
  const [addingOpen, setAddingOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [candidate, setCandidate] = useState(null);
  const [alreadyInGroup, setAlreadyInGroup] = useState(false);
  const [alreadyInOtherGroup, setAlreadyInOtherGroup] = useState(false); // 
  const [existingGroupInfo, setExistingGroupInfo] = useState(null); // 
  const [savingAdd, setSavingAdd] = useState(false);
  const searchSeq = useRef(0);

  // ---- Menú kebab abierto ----
  const [openMenuId, setOpenMenuId] = useState(null);

  // Carga inicial: programas + miembros + programa del profesor
  useEffect(() => {
    if (!groupId) return;
    const load = async () => {
      setLoading(true); setErr("");

      // Obtener programas
      const { data: progList } = await supabase
        .from("programs")
        .select("id, name, key")
        .order("name", { ascending: true });
      setPrograms(progList || []);

      // Obtener el programa del profesor
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: professorProfile } = await supabase
          .from("profiles")
          .select("program_id")
          .eq("id", user.id)
          .single();
        setProfessorProgramId(professorProfile?.program_id || null);
      }

      // Obtener miembros del grupo
      const { data: members, error } = await supabase
        .from("group_members")
        .select(`
          student:profiles (
            id, full_name, email, avatar_url, cv_url, program_id,
            practices(student_id),
            applications(status, decision, vacancy:vacancies (
              id, title, modality, compensation, language, requirements, activities,
              location_text, rating_avg, rating_count, status, created_at, company_id,
              spots_total, spots_taken, spots_left,
              company:companies ( id, name, industry, logo_url )
            ))
          )
        `)
        .eq("group_id", groupId);
      if (error) { setErr(error.message); setStudents([]); setLoading(false); return; }
      const arr = (members || []).map(m => m.student);
      setStudents(arr);
      if (arr.length && !active) setActive(arr[0]);
      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Filtrar alumnos por búsqueda
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    
    const query = searchQuery.toLowerCase().trim();
    return students.filter(student => 
      student.full_name?.toLowerCase().includes(query) ||
      student.email?.toLowerCase().includes(query)
    );
  }, [students, searchQuery]);

  // Buscar alumnos por nombre o matrícula (email) - SOLO del mismo programa del profesor
  useEffect(() => {
    let ignore = false;
    const run = async () => {
      const q = (query || "").trim();
      if (!addingOpen || q.length < 2) { setResults([]); return; }

      const my = ++searchSeq.current;
      const like = `%${q}%`;
      
      // Construir consulta base
      let queryBuilder = supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, cv_url, program_id")
        .eq("role", "student")
        .or(`full_name.ilike.${like},email.ilike.${like}`);

      // Filtrar por programa del profesor si existe
      if (professorProgramId) {
        queryBuilder = queryBuilder.eq("program_id", professorProgramId);
      }

      // Ejecutar consulta
      const { data, error } = await queryBuilder
        .order("full_name", { ascending: true })
        .limit(8);

      if (ignore || my !== searchSeq.current) return;
      if (error) { setResults([]); return; }
      setResults(data || []);
    };
    run();
    return () => { ignore = true; };
  }, [addingOpen, query, professorProgramId]);

  // VERIFICAR SI EL CANDIDATO YA ESTÁ EN ESTE GRUPO U OTRO GRUPO
  useEffect(() => {
    const checkCandidate = async () => {
      if (!candidate?.id || !groupId) { 
        setAlreadyInGroup(false);
        setAlreadyInOtherGroup(false);
        setExistingGroupInfo(null);
        return; 
      }

      try {
        // Verificar si ya está en ESTE grupo
        const { data: currentGroup } = await supabase
          .from("group_members")
          .select("group_id")
          .eq("group_id", groupId)
          .eq("student_id", candidate.id)
          .maybeSingle();

        setAlreadyInGroup(!!currentGroup);

        // Verificar si está en OTRO grupo (excluyendo este grupo)
        const { data: otherGroups, error } = await supabase
          .from("group_members")
          .select(`
            group_id,
            group:groups (
              id,
              name,
              professor:profiles!groups_professor_id_fkey (
                full_name
              )
            )
          `)
          .eq("student_id", candidate.id)
          .neq("group_id", groupId); // Excluir este grupo

        if (error) throw error;

        const isInOtherGroup = otherGroups && otherGroups.length > 0;
        setAlreadyInOtherGroup(isInOtherGroup);

        // Si está en otro grupo, guardar la información
        if (isInOtherGroup && otherGroups[0].group) {
          setExistingGroupInfo({
            groupName: otherGroups[0].group.name,
            professorName: otherGroups[0].group.professor?.full_name || 'Profesor'
          });
        } else {
          setExistingGroupInfo(null);
        }

      } catch (error) {
        console.error("Error verificando grupos del alumno:", error);
        setAlreadyInOtherGroup(false);
        setExistingGroupInfo(null);
      }
    };

    checkCandidate();
  }, [candidate?.id, groupId]);

  const onAddConfirm = async () => {
    // PREVENIR AGREGAR SI YA ESTÁ EN OTRO GRUPO
    if (!candidate?.id || !groupId || alreadyInOtherGroup) return;
    
    try {
      setSavingAdd(true);
      if (!alreadyInGroup) {
        const { error } = await supabase.from("group_members").insert({
          group_id: groupId,
          student_id: candidate.id,
        });
        if (error && !String(error.message).includes("duplicate")) throw error;
      }
      // refresca listado
      const { data: members } = await supabase
        .from("group_members")
        .select(`student:profiles ( 
          id, full_name, email, avatar_url, cv_url, program_id, 
          practices(student_id),
          applications(status, decision, vacancy:vacancies (
            id, title, modality, compensation, language, requirements, activities,
            location_text, rating_avg, rating_count, status, created_at, company_id,
            spots_total, spots_taken, spots_left,
            company:companies ( id, name, industry, logo_url )
          )) 
        )`)
        .eq("group_id", groupId);

      const arr = (members || []).map(m => m.student);
      setStudents(arr);
      setActive(arr.find(s => s.id === candidate.id) || arr[0] || null);

      // Animación al cerrar después de agregar
      const formCard = document.querySelector('.add-form-card');
      if (formCard) {
        formCard.classList.add('exiting');
        setTimeout(() => {
          setAddingOpen(false);
          setQuery("");
          setResults([]);
          setCandidate(null);
          setAlreadyInGroup(false);
          setAlreadyInOtherGroup(false); 
          setExistingGroupInfo(null); 
        }, 250);
      } else {
        setAddingOpen(false);
        setQuery("");
        setResults([]);
        setCandidate(null);
        setAlreadyInGroup(false);
        setAlreadyInOtherGroup(false); 
        setExistingGroupInfo(null); 
      }
    } catch (e) {
      alert(e.message || "No se pudo agregar.");
    } finally {
      setSavingAdd(false);
    }
  };

  const onAddDiscard = () => {
    // Agregar clase de animación de salida
    const formCard = document.querySelector('.add-form-card');
    if (formCard) {
      formCard.classList.add('exiting');
      
      // Esperar a que termine la animación antes de limpiar el estado
      setTimeout(() => {
        setAddingOpen(false);
        setQuery("");
        setResults([]);
        setCandidate(null);
        setAlreadyInGroup(false);
        setAlreadyInOtherGroup(false); 
        setExistingGroupInfo(null); 
      }, 250);
    } else {
      setAddingOpen(false);
      setQuery("");
      setResults([]);
      setCandidate(null);
      setAlreadyInGroup(false);
      setAlreadyInOtherGroup(false); 
      setExistingGroupInfo(null); 
    }
  };

  const removeFromGroup = async (studentId) => {
    if (!confirm("¿Seguro que deseas eliminar este alumno del grupo?")) return;
    try {
      await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("student_id", studentId);
      setStudents(students.filter(s => s.id !== studentId));
      if (active?.id === studentId) setActive(null);
      setOpenMenuId(null);
    } catch (e) {
      alert(e.message || "No se pudo eliminar del grupo.");
    }
  };

  // Helper: programa nombre
  const programName = (pid) => {
    const p = programs.find(x => x.id === pid);
    return p ? `${p.key} — ${p.name}` : "—";
  };

  // Helper: formatear modalidad
  const fmtMod = (dbVal) => {
    const map = { presencial: "Presencial", "híbrido": "Híbrida", remoto: "Remota" };
    return map[dbVal] ?? dbVal ?? "Modalidad N/A";
  };

  // Helper: formatear compensación
  const fmtComp = (dbVal) => {
    const map = { apoyo_economico: "Apoyo económico", sin_apoyo: "Sin apoyo" };
    return map[dbVal] ?? dbVal ?? "Compensación N/A";
  };

  // Helper: dividir líneas de texto
  const splitLines = (text) => {
    const arr = String(text || "").split(/\r?\n|•|- /).map((s) => s.trim()).filter(Boolean);
    return arr.length ? arr : ["No disponible"];
  };

  // Helper: normalizar dirección para mapa
  const normalizeMxAddress = (address) => {
    let a = address || "";
    a = a.replace(/^C\.\s*/i, "Calle ");
    a = a.replace(/\bS\/N\b/gi, "S/N");
    if (!/Juárez/i.test(a)) a += ", Ciudad Juárez";
    if (!/Chihuahua/i.test(a)) a += ", Chihuahua";
    if (!/México|Mexico/i.test(a)) a += ", México";
    return a;
  };

  // Componente para mostrar mapa
  const MapEmbedByAddress = ({ address, zoom = 16 }) => {
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
  };

  // Navegar a detalles de vacante
  const navigateToVacancy = (vacancyId) => {
    router.push(`../vacante/${vacancyId}`);
  };

  return (
    <>
      <Navbar />

      <main className="jobs-wrap">
        {/* Barra superior CON búsqueda funcional */}
        <div className="jobs-searchbar prof-search" style={{ maxWidth: 640 }}>
          <div className="jobs-input">
            <input 
              placeholder="Buscar alumno por nombre o email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="jobs-searchbtn">Buscar</button>
        </div>

        {err && <div className="jobs-error">{err}</div>}

        <div className="jobs-grid">
          {/* Lista de alumnos (columna izquierda) */}
          <aside className="jobs-listing" style={{ position: "relative" }}>

            {/* Botón fijo arriba */}
            <div className="add-sticky">
              {!addingOpen ? (
                <button 
                  className="group-new" 
                  onClick={() => setAddingOpen(true)} 
                  aria-label="Agregar alumno" 
                  title="Agregar alumno"
                >
                  <span className="plus">+</span>
                </button>
              ) : (
                <div className="jobs-card add-form-card is-active">
                  <div className="jobs-card-left" />
                  <div className="jobs-card-body">
                    <div className="add-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h4 className="add-title">Agregar alumno al grupo</h4>
                      <button 
                        className="btn btn-ghost cancel-btn" 
                        onClick={onAddDiscard}
                        style={{ padding: '6px 12px', fontSize: '14px' }}
                      >
                        Cancelar
                      </button>
                    </div>
                    
                    {/* Mensaje informativo sobre el filtro por programa */}
                    {professorProgramId && (
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#666', 
                        marginBottom: '8px',
                        fontStyle: 'italic'
                      }}>
                        Mostrando solo alumnos de tu programa
                      </div>
                    )}
                    
                    <input
                      className="login-input"
                      type="text"
                      placeholder="Nombre o matrícula (correo)"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      autoFocus
                    />
                    
                    {results.length > 0 && !candidate && (
                      <div className="add-results">
                        {results.map((r) => (
                          <button key={r.id} className="result-item" onClick={() => setCandidate(r)}>
                            <AvatarCircle src={r.avatar_url} name={r.full_name} size={32} />
                            <div className="result-texts">
                              <div className="r-name">{r.full_name}</div>
                              <div className="r-sub">{r.email}</div>
                              {r.program_id && (
                                <div className="r-program">{programName(r.program_id)}</div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {query.length >= 2 && results.length === 0 && (
                      <div style={{ 
                        textAlign: 'center', 
                        padding: '16px', 
                        color: '#666',
                        fontSize: '14px'
                      }}>
                        {professorProgramId 
                          ? "No se encontraron alumnos de tu programa con ese criterio." 
                          : "No se encontraron alumnos con ese criterio."
                        }
                      </div>
                    )}
                    
                    {candidate && (
                      <div className="preview-card">
                        <div className="prev-row">
                          <AvatarCircle src={candidate.avatar_url} name={candidate.full_name} size={48} />
                          <div style={{ minWidth: 0 }}>
                            <div className="prev-name">{candidate.full_name}</div>
                            <div className="prev-sub">{candidate.email}</div>
                            {!!candidate.program_id && (
                              <div className="prev-pill">Programa: {programName(candidate.program_id)}</div>
                            )}
                            {!!candidate.cv_url && (
                              <a href={candidate.cv_url} target="_blank" rel="noreferrer" className="prev-link">Ver CV</a>
                            )}
                          </div>
                        </div>

                        {/* MENSAJE SI YA ESTÁ EN ESTE GRUPO */}
                        {alreadyInGroup && (
                          <div className="prev-note info">
                            Este alumno ya forma parte de este grupo.
                          </div>
                        )}

                        {/* MENSAJE SI YA ESTÁ EN OTRO GRUPO */}
                        {alreadyInOtherGroup && existingGroupInfo && (
                          <div className="prev-note warning" style={{ 
                            backgroundColor: '#fef3cd', 
                            border: '1px solid #fde68a',
                            color: '#92400e',
                            padding: '12px',
                            borderRadius: '8px',
                            marginTop: '12px'
                          }}>
                            <strong>⚠️ No se puede agregar</strong>
                            <div style={{ marginTop: '4px', fontSize: '14px' }}>
                              Este alumno ya pertenece al grupo <strong>"{existingGroupInfo.groupName}"</strong> del profesor <strong>{existingGroupInfo.professorName}</strong>.
                            </div>
                            <div style={{ marginTop: '4px', fontSize: '13px', fontStyle: 'italic' }}>
                              Un alumno no puede estar en más de un grupo simultáneamente.
                            </div>
                          </div>
                        )}

                        <div className="prev-actions">
                          <button className="btn btn-ghost" onClick={onAddDiscard}>Descartar</button>
                          
                          {/* BOTÓN DESHABILITADO SI YA ESTÁ EN OTRO GRUPO */}
                          <button 
                            className="btn btn-primary" 
                            onClick={onAddConfirm} 
                            disabled={savingAdd || alreadyInOtherGroup}
                            style={{
                              opacity: alreadyInOtherGroup ? 0.5 : 1,
                              cursor: alreadyInOtherGroup ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {savingAdd ? "Guardando…" : alreadyInGroup ? "Actualizar" : "Agregar"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ width: 0, height: 0 }} />
                </div>
              )}
            </div>

            {/* Alumnos */}
            {!loading && filteredStudents.map((s) => (
              <div
                key={s.id}
                className={`jobs-card ${active?.id === s.id ? "is-active" : ""}`}
                onClick={() => setActive(s)}
              >
                <div className="jobs-card-left" />
                <div className="jobs-card-body">
                  <div className="jobs-card-top">
                    <div className="jobs-logo"><AvatarCircle src={s.avatar_url} name={s.full_name} /></div>
                    <div>
                      <h4 className="jobs-card-title">{s.full_name}</h4>
                      <div className="jobs-card-company">{s.email}</div>
                    </div>
                  </div>
                </div>
                <div className="grp-kebab" onClick={(e)=>{e.stopPropagation(); setOpenMenuId(openMenuId === s.id ? null : s.id);}}>
                  <button className="grp-kebab-btn">···</button>
                  {openMenuId === s.id && (
                    <div className="grp-menu">
                      <button onClick={()=>removeFromGroup(s.id)}>Eliminar del grupo</button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {!loading && !filteredStudents.length && !addingOpen && (
              <div className="jobs-empty small">
                {searchQuery ? "No se encontraron alumnos con ese criterio." : "Aún no hay alumnos en este grupo."}
              </div>
            )}
          </aside>

          {/* DETALLE DEL ALUMNO (COLUMNA DERECHA) */}
          <section className="jobs-detail" style={{ display: "block" }}>
            {!active ? (
              <div className="jobs-empty small">Selecciona un alumno.</div>
            ) : (
              <div>
                <div className="jobs-detail-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <AvatarCircle src={active.avatar_url} name={active.full_name} size={80} />
                    <div>
                      <h2 className="jobs-title">{active.full_name}</h2>
                      <div className="jobs-muted">{active.email}</div>
                    </div>
                  </div>
                </div>

                <hr className="jobs-sep" />

                <div className="jobs-section">
                  <h3>Licenciatura</h3>
                  <p>{programName(active.program_id)}</p>

                  <h3>Currículum vitae</h3>
                  {active.cv_url ? (
                    <a href={active.cv_url} target="_blank" rel="noreferrer" className="jobs-company">
                      Ver CV
                    </a>
                  ) : (
                    <span className="jobs-muted">Sin CV</span>
                  )}
                </div>

                <hr className="jobs-sep" />

                <div className="jobs-section">
                  <h3>Estado de prácticas:</h3>
                  <p>
                    {active.practices && active.practices.length > 0 
                      ? active.practices.some(p => p.status === 'active') 
                        ? "Activo" 
                        : "Práctica finalizada" 
                      : "No inscrito"
                    }
                  </p>
                </div>

                {/* Vacantes donde el alumno está inscrito */}
                {active.applications?.filter(app => app.status === "aceptada").length > 0 && (
                  <>
                    <hr className="jobs-sep" />
                    <div className="jobs-section">
                      <h3>Práctica actual</h3>
                      {active.applications
                        .filter((app) => app.status === "aceptada")
                        .map((app, idx) => (
                          <div key={idx} className="vacancy-detail-card" style={{ 
                            border: '1px solid #e4e7ee', 
                            borderRadius: '12px', 
                            padding: '16px', 
                            marginBottom: '16px',
                            cursor: 'pointer'
                          }}
                          onClick={() => navigateToVacancy(app.vacancy.id)}
                          >
                            <h4 style={{ margin: '0 0 8px 0', color: '#1F3354' }}>
                              {app.vacancy.title}
                            </h4>
                            <p className="jobs-muted" style={{ margin: '0 0 12px 0' }}>
                              {app.vacancy.company?.name} · {fmtMod(app.vacancy.modality)} · {fmtComp(app.vacancy.compensation)}
                            </p>
                            
                            {app.vacancy.activities && (
                              <>
                                <h5>Actividades:</h5>
                                <ul className="jobs-list">
                                  {splitLines(app.vacancy.activities).map((activity, i) => (
                                    <li key={i}>{activity}</li>
                                  ))}
                                </ul>
                              </>
                            )}

                            {app.vacancy.requirements && (
                              <>
                                <h5>Requisitos:</h5>
                                <ul className="jobs-list">
                                  {splitLines(app.vacancy.requirements).map((req, i) => (
                                    <li key={i}>{req}</li>
                                  ))}
                                </ul>
                              </>
                            )}

                            {app.vacancy.location_text && (
                              <>
                                <h5>Ubicación:</h5>
                                <p>{app.vacancy.location_text}</p>
                                <MapEmbedByAddress address={app.vacancy.location_text} />
                              </>
                            )}

                            <div className="jobs-chips" style={{ marginTop: '12px' }}>
                              <span className="jobs-chip">{fmtMod(app.vacancy.modality)}</span>
                              <span className="jobs-chip">{fmtComp(app.vacancy.compensation)}</span>
                              <span className="jobs-chip">Idioma {app.vacancy.language || "ES"}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </>
                )}

                {/* Empresas interesadas en el estudiante */}
                {active.applications?.filter(app => app.status === "oferta" && app.decision !== "accepted").length > 0 && (
                  <>
                    <hr className="jobs-sep" />
                    <div className="jobs-section">
                      <h3>Empresas interesadas</h3>
                      {active.applications
                        .filter((app) => app.status === "oferta" && app.decision !== "accepted")
                        .map((app, idx) => (
                          <div 
                            key={idx} 
                            className="interested-company-card"
                            style={{ 
                              border: '1px solid #e4e7ee',
                              borderRadius: '8px',
                              padding: '12px',
                              marginBottom: '8px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                            onClick={() => navigateToVacancy(app.vacancy.id)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f8fafc';
                              e.currentTarget.style.borderColor = '#c7d5ff';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.borderColor = '#e4e7ee';
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <strong>{app.vacancy.title}</strong>
                                <p className="jobs-muted" style={{ margin: '4px 0 0 0' }}>
                                  {app.vacancy.company?.name} · {fmtMod(app.vacancy.modality)}
                                </p>
                              </div>
                              <span style={{ color: '#2563eb', fontSize: '14px' }}>Ver detalles →</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}