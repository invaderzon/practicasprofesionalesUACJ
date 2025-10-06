// hooks/useActivePractice.js
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient'; 

export function useActivePractice() {
  const [hasActivePractice, setHasActivePractice] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkActivePractice = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setHasActivePractice(false);
        setLoading(false);
        return;
      }

      const { data: practice } = await supabase
        .from("practices")
        .select("id")
        .eq("student_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      console.log("🔄 Hook - Práctica activa:", !!practice);
      setHasActivePractice(!!practice);
      setLoading(false);
    };

    checkActivePractice();

    // Escuchar eventos globales de cambio
    const handlePracticeChange = () => {
      console.log("📢 Hook - Evento global recibido");
      checkActivePractice();
    };

    window.addEventListener('practiceStatusChanged', handlePracticeChange);

    return () => {
      window.removeEventListener('practiceStatusChanged', handlePracticeChange);
    };
  }, []);

  return { hasActivePractice, loading };
}