import { useCallback, useEffect, useState } from 'react';

export type Tema = 'claro' | 'oscuro' | 'sistema';
const CLAVE = 'logitrack.tema';

function leer(): Tema {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === 'claro' || t === 'oscuro' ? t : 'sistema';
  } catch {
    return 'sistema';
  }
}

function aplicar(t: Tema) {
  const oscuro = t === 'oscuro' || (t === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', oscuro);
}

export function useTema() {
  const [tema, setTema] = useState<Tema>(leer);

  useEffect(() => {
    aplicar(tema);
    if (tema !== 'sistema') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = () => aplicar('sistema');
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [tema]);

  const cambiar = useCallback((t: Tema) => {
    setTema(t);
    try {
      if (t === 'sistema') localStorage.removeItem(CLAVE);
      else localStorage.setItem(CLAVE, t);
    } catch {
      /* almacenamiento no disponible: el tema dura la sesión */
    }
  }, []);

  return { tema, cambiar };
}

export function esOscuro(): boolean {
  return document.documentElement.classList.contains('dark');
}
