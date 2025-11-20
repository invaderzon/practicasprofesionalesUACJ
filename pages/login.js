// pages/login.js
import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Navbar from '../components/navbar';
import Footer from '../components/footer';
import { supabase } from '../lib/supabaseClient';

const isProfesor = (email) => email.trim().toLowerCase().endsWith('@uacj.mx');
const isAlumno = (email) => email.trim().toLowerCase().endsWith('@alumnos.uacj.mx');

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setErr(error.message); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr('No se pudo obtener el usuario.'); return; }

    if (isProfesor(email)) return router.replace('/docente/grupos');
    if (isAlumno(email)) return router.replace('/alumno/buscar');

    // Default: empresa
    router.replace('/empresa/vacantes');
  };

  const onReset = async () => {
    if (!email) return setErr('Escribe tu correo para enviarte el enlace de recuperación.');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) setErr(error.message);
    else alert('Te enviamos un correo para reestablecer tu contraseña.');
  };

  return (
    <>
      <Navbar />
      <main className="login-wrap">
        <div className="login-card">
          <div className="login-left" />
          <div className="login-right">
            <h2>INICIAR SESIÓN</h2>

            <form onSubmit={onSubmit} className="login-form">
              <input
                className="login-input"
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={e=>setEmail(e.target.value)}
                required
              />
              <input
                className="login-input"
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={e=>setPassword(e.target.value)}
                required
              />

              {err && <p className="login-error">{err}</p>}

              <button className="login-btn" disabled={loading}>
                {loading ? 'Ingresando…' : 'Ingresar'}
              </button>
            </form>

            <button className="login-forgot" type="button" onClick={onReset}>
              ¿Olvidaste tu contraseña?
            </button>

            <p className="login-company">
                ¿Eres empresa sin cuenta aún?{' '}
              <a onClick={() => router.push('/empresa/signup')} style={{ color: '#2563eb', cursor: 'pointer' }}>
                Regístrate aquí
              </a>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
