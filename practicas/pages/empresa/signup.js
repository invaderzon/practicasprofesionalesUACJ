import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import Navbar from '../../components/navbar';
import Footer from '../../components/footer';

const isProfesor = (email) => email.trim().toLowerCase().endsWith('@uacj.mx');
const isAlumno  = (email) => email.trim().toLowerCase().endsWith('@alumnos.uacj.mx');

export default function EmpresaSignup() {
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [err, setErr]                 = useState('');
  const [loading, setLoading]         = useState(false);
  const router = useRouter();

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');

    // Bloquear correos institucionales
    if (isProfesor(email) || isAlumno(email)) {
      setErr('Usa un correo corporativo, no institucional de UACJ.');
      return;
    }

    // Validaciones básicas
    const name = companyName.trim();
    const mail = email.trim();
    if (name.length < 2) {
      setErr('Escribe el nombre de la empresa.'); return;
    }
    if (password.length < 6) {
      setErr('La contraseña debe tener al menos 6 caracteres.'); return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signUp({
        email: mail,
        password,
        options: { data: { role: 'company', full_name: name } },
      });
      if (error) throw error;

      if (data.user) {
        await supabase
          .from('profiles')
          .update({ role: 'company', full_name: name })
          .eq('id', data.user.id);

        await supabase.from('companies').insert({
          name,
          email: mail,
          owner_id: data.user.id,
        });
      }

      router.replace('/login');
    } catch (e) {
      setErr(e.message || 'No se pudo completar el registro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="login-wrap">
        <div className="login-card">
          {/* Panel izquierdo (decorativo) */}
          <div className="login-left" />

          {/* Panel derecho (formulario) */}
          <div className="login-right">
            <h2>REGISTRO DE EMPRESA</h2>

            <form onSubmit={onSubmit} className="login-form">
              <input
                className="login-input"
                type="text"
                placeholder="Nombre de la empresa"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
              <input
                className="login-input"
                type="email"
                placeholder="Correo corporativo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                className="login-input"
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {err && <p className="login-error">{err}</p>}

              <button className="login-btn" disabled={loading}>
                {loading ? 'Registrando…' : 'Registrarse'}
              </button>
            </form>

            {/* Enlace alterno al login */}
            <p className="login-company" style={{ marginTop: 12 }}>
              ¿Ya tienes cuenta?{' '}
              <a href="/login" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                Inicia sesión
              </a>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
