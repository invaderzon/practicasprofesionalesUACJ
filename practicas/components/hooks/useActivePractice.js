// hooks/useActivePractice.js
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient'; 

export function useActivePractice() {
  const [hasActivePractice, setHasActivePractice] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkActivePractice = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log("🔴 Hook - No hay usuario");
        setHasActivePractice(false);
        setLoading(false);
        return;
      }

      console.log("🔄 Hook - Buscando TODAS las prácticas para usuario:", user.id);
      
      // Primero, veamos TODAS las prácticas que tienes
      const { data: allPractices, error } = await supabase
        .from("practices")
        .select("id, status, student_id, started_at, ended_at")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ Error en hook:", error);
        setHasActivePractice(false);
      } else {
        console.log("📊 Hook - TODAS las prácticas:", allPractices);
        
        // Buscar si hay alguna práctica activa
        const activePractice = allPractices.find(p => p.status === 'active');
        console.log("🎯 Práctica activa encontrada:", activePractice);
        
        console.log("🔍 Estado final del hook - hasActivePractice:", !!activePractice);
        setHasActivePractice(!!activePractice);
      }
    } catch (error) {
      console.error("💥 Error en hook:", error);
      setHasActivePractice(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log("🚀 Hook - useEffect ejecutado");
    checkActivePractice();

    // Escuchar eventos globales de cambio
    const handlePracticeChange = () => {
      console.log("📢 Hook - Evento global recibido, recargando...");
      setLoading(true);
      checkActivePractice();
    };

    window.addEventListener('practiceStatusChanged', handlePracticeChange);

    return () => {
      window.removeEventListener('practiceStatusChanged', handlePracticeChange);
    };
  }, []);

  return { hasActivePractice, loading };
}