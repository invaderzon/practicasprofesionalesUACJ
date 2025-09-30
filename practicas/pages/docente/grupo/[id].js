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

  // ---- Agregar alumno (inline) ----
  const [addingOpen, setAddingOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [candidate, setCandidate] = useState(null);
  const [alreadyInGroup, setAlreadyInGroup] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);
  const searchSeq = useRef(0);

  // ---- Menú kebab abierto ----
  const [openMenuId, setOpenMenuId] = useState(null);

  // Carga inicial: programas + miembros
  useEffect(() => {
    if (!groupId) return;
    const load = async () => {
      setLoading(true); setErr("");

      const { data: progList } = await supabase
        .from("programs")
        .select("id, name, key")
        .order("name", { ascending: true });
      setPrograms(progList || []);

      const { data: members, error } = await supabase
        .from("group_members")
        .select(`
          student:profiles (
            id, full_name, email, avatar_url, cv_url, program_id,
            practices(student_id),
            applications(status, decision, vacancy:vacancies (
              title, modality, activities, company:companies(name)
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

  // Buscar alumnos por nombre o matrícula (email)
  useEffect(() => {
    let ignore = false;
    const run = async () => {
      const q = (query || "").trim();
      if (!addingOpen || q.length < 2) { setResults([]); return; }

      const my = ++searchSeq.current;
      const like = `%${q}%`;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, cv_url, program_id")
        .eq("role", "student")
        .or(`full_name.ilike.${like},email.ilike.${like}`)
        .order("full_name", { ascending: true })
        .limit(8);

      if (ignore || my !== searchSeq.current) return;
      if (error) { setResults([]); return; }
      setResults(data || []);
    };
    run();
    return () => { ignore = true; };
  }, [addingOpen, query]);

  // Verifica si el candidato ya está en el grupo
  useEffect(() => {
    const check = async () => {
      if (!candidate?.id || !groupId) { setAlreadyInGroup(false); return; }
      const { data } = await supabase
        .from("group_members")
        .select("student_id")
        .eq("group_id", groupId)
        .eq("student_id", candidate.id)
        .maybeSingle();
      setAlreadyInGroup(!!data);
    };
    check();
  }, [candidate?.id, groupId]);

  const onAddConfirm = async () => {
    if (!candidate?.id || !groupId) return;
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
        .select(`student:profiles ( id, full_name, email, avatar_url, cv_url, program_id, practices(student_id), applications(status, decision, vacancy:vacancies(title, modality, activities, company:companies(name))) )`)
        .eq("group_id", groupId);

      const arr = (members || []).map(m => m.student);
      setStudents(arr);
      setActive(arr.find(s => s.id === candidate.id) || arr[0] || null);

      // limpia editor
      setAddingOpen(false);
      setQuery("");
      setResults([]);
      setCandidate(null);
      setAlreadyInGroup(false);
    } catch (e) {
      alert(e.message || "No se pudo agregar.");
    } finally {
      setSavingAdd(false);
    }
  };

  const onAddDiscard = () => {
    setAddingOpen(false);
    setQuery("");
    setResults([]);
    setCandidate(null);
    setAlreadyInGroup(false);
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

  // Orden: alumno activo primero en la lista (solo visual)
  const ordered = useMemo(() => {
    if (!active) return students;
    return [active, ...students.filter(s => s.id !== active.id)];
  }, [students, active]);

  // Helper: programa nombre
  const programName = (pid) => {
    const p = programs.find(x => x.id === pid);
    return p ? `${p.key} — ${p.name}` : "—";
  };

  return (
    <>
      <Navbar />

      <main className="jobs-wrap">
        {/* Barra superior SIN lupa */}
        <div className="jobs-searchbar prof-search" style={{ maxWidth: 640 }}>
          <div className="jobs-input"><input placeholder="Nombre del alumno" /></div>
          <button className="jobs-searchbtn" disabled>Buscar</button>
        </div>

        {err && <div className="jobs-error">{err}</div>}

        <div className="jobs-grid">
          {/* Lista de alumnos (columna izquierda) */}
          <aside className="jobs-listing" style={{ position: "relative" }}>
            {/* Botón fijo arriba */}
            <div className="add-sticky">
              {!addingOpen ? (
                <div
                  className="jobs-card group-new"
                  role="button"
                  tabIndex={0}
                  onClick={() => setAddingOpen(true)}
                >
                  <div className="jobs-card-left" />
                  <div className="jobs-card-body">
                    <div className="group-new-inner"><span className="group-new-icon">+</span></div>
                  </div>
                  <div style={{ width: 0, height: 0 }} />
                </div>
              ) : (
                <div className="jobs-card add-form-card is-active">
                  <div className="jobs-card-left" />
                  <div className="jobs-card-body">
                    <h4 className="add-title">Agregar alumno al grupo</h4>
                    <input
                      className="login-input"
                      type="text"
                      placeholder="Nombre o matrícula (correo)"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {results.length > 0 && !candidate && (
                      <div className="add-results">
                        {results.map((r) => (
                          <button key={r.id} className="result-item" onClick={() => setCandidate(r)}>
                            <AvatarCircle src={r.avatar_url} name={r.full_name} size={32} />
                            <div className="result-texts">
                              <div className="r-name">{r.full_name}</div>
                              <div className="r-sub">{r.email}</div>
                            </div>
                          </button>
                        ))}
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
                        {alreadyInGroup && <div className="prev-note">Este alumno ya forma parte de este grupo.</div>}
                        <div className="prev-actions">
                          <button className="btn btn-ghost" onClick={onAddDiscard}>Descartar</button>
                          <button className="btn btn-primary" onClick={onAddConfirm} disabled={savingAdd}>
                            {savingAdd ? "Guardando…" : "Continuar"}
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
            {!loading && ordered.map((s) => (
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

            {!loading && !students.length && !addingOpen && (
              <div className="jobs-empty small">Aún no hay alumnos en este grupo.</div>
            )}
          </aside>

          {/* Detalle del alumno (columna derecha) */}
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
                  <p>{active.practices ? "Activo" : "No inscrito"}</p>
                </div>

                {active.applications?.length > 0 && (
                  <>
                    <hr className="jobs-sep" />
                    <div className="jobs-section">
                      <h3>Esta empresa está interesada en el estudiante</h3>
                      {active.applications
                        .filter((a) => a.status === "oferta" || a.decision === "accepted")
                        .map((a, idx) => (
                          <div key={idx} style={{ marginBottom: 12 }}>
                            <p><strong>{a.vacancy.title}</strong></p>
                            <p className="jobs-muted">
                              {a.vacancy.company?.name} · {a.vacancy.modality}
                            </p>
                            <p>{a.vacancy.activities}</p>
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
