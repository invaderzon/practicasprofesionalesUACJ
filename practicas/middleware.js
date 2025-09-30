// middleware.js
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => res.cookies.set({ name, value, ...options }),
        remove: (name, options) => res.cookies.set({ name, value: '', ...options }),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = req.nextUrl.pathname;

  const roleHome = (role) =>
    role === 'professor' ? '/docente/grupos'
    : role === 'company' ? '/empresa/vacantes'
    : '/alumno/buscar';

  // Redirección legacy: /estudiantes -> /alumno/buscar
  if (pathname === '/estudiantes') {
    const url = req.nextUrl.clone();
    url.pathname = '/alumno/buscar';
    return NextResponse.redirect(url);
  }

  // Rutas públicas (permiten acceso sin login)
  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/practicas') ||
    pathname.startsWith('/empresa/signup') || // <- signup de empresa es público
    pathname.startsWith('/img') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico';

  if (isPublic) {
    // Si ya está logeado y entra a /login o /empresa/signup, redirige a su home por rol
    if (user && (pathname.startsWith('/login') || pathname.startsWith('/empresa/signup'))) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const role = profile?.role ?? 'student';
      const url = req.nextUrl.clone();
      url.pathname = roleHome(role);
      return NextResponse.redirect(url);
    }
    return res;
  }

  // Rutas protegidas
  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: [
    // Pasa por middleware todo excepto _next, favicon y CUALQUIER archivo con extensión común de estáticos
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|mp4|mp3|avi|mov|txt|xml|json|css|js|map)).*)',
  ],
};

