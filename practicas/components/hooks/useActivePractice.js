// hooks/useActivePractice.js
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient'; 

export function useActivePractice() {
  const [hasActivePractice, setHasActivePractice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkActivePractice = async () => {
      try {
        setError(null);
        
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          console.error("❌ Hook - Error obteniendo usuario:", userError);
          setError(userError.message);
          setHasActivePractice(false);
          setLoading(false);
          return;
        }

        if (!user) {
          console.log("🔐 Hook - No hay usuario autenticado");
          setHasActivePractice(false);
          setLoading(false);
          return;
        }

        console.log("🔍 Hook - Verificando práctica activa para usuario:", user.id);

        const { data: practice, error: practiceError } = await supabase
          .from("practices")
          .select("id, status, student_id")
          .eq("student_id", user.id)
          .eq("status", "active")
          .maybeSingle();

        if (practiceError) {
          console.error("❌ Hook - Error consultando prácticas:", practiceError);
          setError(practiceError.message);
          setHasActivePractice(false);
          setLoading(false);
          return;
        }

        console.log("✅ Hook - Práctica activa encontrada:", !!practice, practice);
        setHasActivePractice(!!practice);
        
      } catch (catchError) {
        console.error("💥 Hook - Error inesperado:", catchError);
        setError(catchError.message);
        setHasActivePractice(false);
      } finally {
        setLoading(false);
      }
    };

    checkActivePractice();

    // Escuchar eventos globales de cambio
    const handlePracticeChange = () => {
      console.log("📢 Hook - Evento global recibido, recargando estado...");
      setLoading(true);
      checkActivePractice();
    };

    // Escuchar cambios en tiempo real de la tabla practices
    const subscription = supabase
      .channel('practice-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'practices',
        },
        (payload) => {
          console.log('📢 Hook - Cambio en tiempo real:', payload);
          // Recargar solo si el cambio es relevante para el usuario actual
          checkActivePractice();
        }
      )
      .subscribe();

    window.addEventListener('practiceStatusChanged', handlePracticeChange);

    return () => {
      console.log("🧹 Hook - Limpiando event listeners y subscription");
      window.removeEventListener('practiceStatusChanged', handlePracticeChange);
      subscription.unsubscribe();
    };
  }, []);

  return { 
    hasActivePractice, 
    loading, 
    error 
  };
}