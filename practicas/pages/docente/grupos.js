// pages/profesor/grupos.js
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/navbar";
import Footer from "../../components/footer";

const DEFAULT_GROUP_COLOR = "#1F3354";

/* ---- Avatar con iniciales ---- */
function AvatarCircle({ src, name }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="Foto de perfil" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />;
  }
  const initials =
    (name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="prof-avatar-fallback" aria-label="Iniciales">
      {initials}
    </div>
  );
}

export default function ProfesorGruposPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // sesión
  const [user, setUser] = useState(null);

  // perfil profesor
  const [profile, setProfile] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ institute: "", office: "", office_hours: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // grupos
  const [groups, setGroups] = useState([]);
  const [menuOpenId, setMenuOpenId] = useState(null);

  // crear grupo
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_GROUP_COLOR);

  // búsqueda
  const [q, setQ] = useState("");

  const refreshKey = useRef(0);
  const bump = () => (refreshKey.current += 1);

  /* ----------------- Carga ----------------- */
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErr("");

      const { data: { user: u }, error: uErr } = await supabase.auth.getUser();
      if (uErr || !u) {
        setErr(uErr?.message || "No hay sesión.");
        setLoading(false);
        return;
      }
      setUser(u);

      // Perfil + instituto (si tienes tabla institutes se intentará el join; si no, sigue el texto libre)
      const { data: prof } = await supabase
        .from("profiles")
        .select(`
          id, full_name, avatar_url, institute, institute_id, office, office_hours,
          institute_join:institutes!left ( name, code )
        `)
        .eq("id", u.id)
        .single();

      const instituteLabel =
        prof?.institute_join?.name ||
        prof?.institute ||
        "";

      const profUi = {
        id: prof?.id,
        full_name: prof?.full_name || "Profesor",
        email: u.email || "",
        avatar_url: prof?.avatar_url || "",
        institute: instituteLabel,
        office: prof?.office || "",
        office_hours: prof?.office_hours || "",
      };
      setProfile(profUi);
      setForm({
        institute: instituteLabel,
        office: profUi.office,
        office_hours: profUi.office_hours,
      });

      // Grupos del profesor (sin created_at)
      const { data: gps, error: gErr } = await supabase
        .from("groups")
        .select("id, name, color, term, hidden")
        .eq("professor_id", u.id)
        .order("name", { ascending: true });

      if (gErr) {
        setErr(gErr.message);
        setGroups([]);
      } else {
        setGroups(gps || []);
      }

      setLoading(false);
    };

    load();
  }, [refreshKey.current]);

  /* ----------------- Acciones: perfil ----------------- */
  const onSaveProfile = async () => {
    if (!user) return;
    try {
      setSavingProfile(true);

      // intenta mapear a institutes si existe el valor
      let institute_id = null;
      const raw = (form.institute || "").trim();
      if (raw) {
        const { data: match } = await supabase
          .from("institutes")
          .select("id")
          .or(`code.ilike.${raw},name.ilike.${raw}`)
          .limit(1)
          .single();
        institute_id = match?.id || null;
      }

      const update = {
        office: form.office?.trim() || null,
        office_hours: form.office_hours?.trim() || null,
        institute: raw || null,
        institute_id: institute_id || null,
      };

      const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
      if (error) throw error;

      setEditOpen(false);
      bump();
    } catch (e) {
      alert(e.message || "No se pudo guardar la información.");
    } finally {
      setSavingProfile(false);
    }
  };

  const onCancelProfile = () => {
    setForm({
      institute: profile?.institute || "",
      office: profile?.office || "",
      office_hours: profile?.office_hours || "",
    });
    setEditOpen(false);
  };

  const onUploadAvatar = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file || !user) return;
      setUploadingAvatar(true);

      const okTypes = ["image/png", "image/jpeg", "image/webp"];
      if (!okTypes.includes(file.type)) {
        alert("Sube una imagen PNG/JPG/WEBP.");
        setUploadingAvatar(false);
        return;
      }

      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/avatar.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = pub?.publicUrl;

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);
      if (updErr) throw updErr;

      bump();
    } catch (e2) {
      console.error(e2);
      alert(e2.message || "No se pudo subir la imagen.");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  const onDeleteAvatar = async () => {
    if (!user) return;
    const ok = confirm("¿Quitar tu foto de perfil?");
    if (!ok) return;

    try {
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      if (error) throw error;
      bump();
    } catch (e) {
      alert(e.message || "No se pudo quitar la foto.");
    }
  };

  /* ----------------- Acciones: grupos ----------------- */
  const onSaveNew = async () => {
    try {
      if (!newName.trim()) {
        alert("Ponle nombre al grupo.");
        return;
      }
      if (!user) return;

      const { error } = await supabase
        .from("groups")
        .insert({
          professor_id: user.id,
          name: newName.trim(),
          color: newColor || DEFAULT_GROUP_COLOR,
          hidden: false,
        });
      if (error) throw error;

      // permanecer aquí
      setCreating(false);
      setNewName("");
      setNewColor(DEFAULT_GROUP_COLOR);
      bump();
    } catch (e) {
      alert(e.message || "No se pudo crear el grupo.");
    }
  };

  const onDelete = async (groupId) => {
    if (!confirm("¿Eliminar este grupo?")) return;
    const { error } = await supabase.from("groups").delete().eq("id", groupId);
    if (error) return alert(error.message || "No se pudo eliminar.");
    setMenuOpenId(null);
    bump();
  };

  const onToggleHidden = async (groupId, hiddenNow) => {
    const { error } = await supabase.from("groups").update({ hidden: !hiddenNow }).eq("id", groupId);
    if (error) return alert(error.message || "No se pudo actualizar.");
    setMenuOpenId(null);
    bump();
  };

  const onRename = async (groupId) => {
    const curr = groups.find((g) => g.id === groupId);
    const name = prompt("Nuevo nombre del grupo:", curr?.name || "");
    if (!name) return;
    const { error } = await supabase.from("groups").update({ name: name.trim() }).eq("id", groupId);
    if (error) return alert(error.message || "No se pudo renombrar.");
    setMenuOpenId(null);
    bump();
  };

  const onRecolor = async (groupId) => {
    const curr = groups.find((g) => g.id === groupId);
    const color = prompt("Color (hex, ej. #1F3354):", curr?.color || DEFAULT_GROUP_COLOR);
    if (!color) return;
    const { error } = await supabase.from("groups").update({ color }).eq("id", groupId);
    if (error) return alert(error.message || "No se pudo cambiar el color.");
    setMenuOpenId(null);
    bump();
  };

  /* ----------------- UI helpers ----------------- */
  const filtered = useMemo(() => {
    const k = (q || "").trim().toLowerCase();
    if (!k) return groups;
    return groups.filter((g) => (g.name || "").toLowerCase().includes(k));
  }, [q, groups]);

  const Kebab = ({ open, children }) =>
    open ? (
      <div className="grp-menu-pop" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    ) : null;

  const MenuItem = ({ danger = false, onClick, children }) => (
    <button
      type="button"
      onClick={onClick}
      className={`menu-item ${danger ? "danger" : ""}`}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );

  const GroupCard = ({ g }) => (
    <button
      className="group-item"
      onClick={() => (window.location.href = `/docente/grupo/${g.id}`)}
    >
      <span className="grp-color" style={{ background: g.color || DEFAULT_GROUP_COLOR }} />
      <div className="grp-body">
        <div className="grp-title">{g.name}</div>
        <div className="grp-sub">
          {g.term ? g.term : "—"}
          {g.hidden ? " · (oculto)" : ""}
        </div>
      </div>

      <div className="grp-kebab" onClick={(e) => e.stopPropagation()}>
        <button
          className="grp-kebab-btn"
          aria-label="Opciones"
          onClick={() => setMenuOpenId((id) => (id === g.id ? null : g.id))}
        >
          ···
        </button>
        <Kebab open={menuOpenId === g.id}>
          <MenuItem danger onClick={() => onDelete(g.id)}>Eliminar</MenuItem>
          <MenuItem onClick={() => onToggleHidden(g.id, g.hidden)}>{g.hidden ? "Mostrar" : "Ocultar"}</MenuItem>
          <MenuItem onClick={() => onRename(g.id)}>Cambiar nombre</MenuItem>
          <MenuItem onClick={() => onRecolor(g.id)}>Editar color</MenuItem>
        </Kebab>
      </div>
    </button>
  );

  return (
    <>
      <Navbar />

      <main className="jobs-wrap" style={{ maxWidth: 1200, marginInline: "auto" }}>
        {/* Buscador SIN lupa */}
        <div className="jobs-searchbar prof-search">
          <div className="jobs-input">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre del grupo"
            />
          </div>
          <button className="jobs-searchbtn" onClick={() => setQ((s) => s.trim())}>Buscar</button>
        </div>

        {err && <div className="jobs-error">{err}</div>}

        {/* Layout */}
        <section className="prof-layout">
          {/* Panel del profesor */}
          <aside className="prof-panel">
            <div className="prof-photo">
              <AvatarCircle src={profile?.avatar_url} name={profile?.full_name} />
            </div>

            <h3 className="prof-name">{profile?.full_name || "Profesor"}</h3>
            <div className="prof-mail">{profile?.email}</div>

            <div className="prof-info">
              <div><strong>Instituto de</strong> <span>{profile?.institute || "—"}</span></div>
              <div><strong>Horario de atención:</strong> <span>{profile?.office_hours || "—"}</span></div>
              <div><strong>Ubicación de oficina:</strong> <span>{profile?.office || "—"}</span></div>
            </div>

            <div className="prof-actions">
              <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
                {uploadingAvatar ? "Subiendo..." : "Subir imagen"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={onUploadAvatar}
                  style={{ display: "none" }}
                  disabled={uploadingAvatar}
                />
              </label>
              {profile?.avatar_url && (
                <button className="btn btn-ghost" onClick={onDeleteAvatar}>Quitar foto</button>
              )}
            </div>

            {!editOpen ? (
              <div className="prof-edit-row">
                <button className="btn btn-primary" onClick={() => setEditOpen(true)}>Editar información</button>
              </div>
            ) : (
              <div className="prof-edit-form">
                <input
                  className="prof-input"
                  placeholder="Instituto (IADA, IIT, ICSA, ICB, CCU o nombre completo)"
                  value={form.institute}
                  onChange={(e) => setForm((s) => ({ ...s, institute: e.target.value }))}
                />
                <input
                  className="prof-input"
                  placeholder="Horario de atención (ej. 8:00 am a 15:00 pm)."
                  value={form.office_hours}
                  onChange={(e) => setForm((s) => ({ ...s, office_hours: e.target.value }))}
                />
                <input
                  className="prof-input"
                  placeholder="Ubicación de oficina (ej. G-304)"
                  value={form.office}
                  onChange={(e) => setForm((s) => ({ ...s, office: e.target.value }))}
                />
                <div className="edit-actions">
                  <button className="btn btn-ghost" onClick={onCancelProfile}>Cancelar</button>
                  <button className="btn btn-primary" onClick={onSaveProfile} disabled={savingProfile}>
                    {savingProfile ? "Guardando…" : "Guardar cambios"}
                  </button>
                </div>
              </div>
            )}
          </aside>

          {/* Lista de grupos */}
          <section className="prof-groups">
            {loading && <div className="jobs-card sk" />}

            {!loading && filtered.map((g) => <GroupCard key={g.id} g={g} />)}

            {!loading && filtered.length === 0 && (
              <div className="jobs-empty small">Sin grupos con ese nombre.</div>
            )}

            {!creating ? (
              <button className="group-new" onClick={() => setCreating(true)} aria-label="Crear grupo" title="Crear grupo">
                <span className="plus">+</span>
              </button>
            ) : (
              <div className="group-editor">
                <div className="row">
                  <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="color-input" aria-label="Color del grupo" />
                  <input type="text" className="prof-input" placeholder="Nombre del grupo" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="edit-actions">
                  <button className="btn btn-ghost" onClick={() => { setCreating(false); setNewName(""); setNewColor(DEFAULT_GROUP_COLOR); }}>
                    Descartar cambios
                  </button>
                  <button className="btn btn-primary" onClick={onSaveNew}>Guardar cambios</button>
                </div>
              </div>
            )}
          </section>
        </section>
      </main>

      <Footer />
    </>
  );
}
