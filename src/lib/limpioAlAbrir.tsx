import { useState, type ComponentType } from 'react';

/**
 * Envuelve un diálogo de formulario para que, cada vez que se ABRA, empiece limpio: campos, selecciones,
 * errores y estado de envío nuevos (se vuelve a montar). Al cerrar no cambia nada, así la animación de
 * cierre no se corta y, si hubo un error, lo escrito sigue visible mientras el diálogo esté abierto.
 *
 * `abiertoDe` dice cuándo está abierto (por defecto la prop `abierto`; p. ej. `(p) => !!p.vehiculo`).
 */
export function limpioAlAbrir<P extends object>(
  Dialogo: ComponentType<P>,
  abiertoDe: (p: P) => boolean = (p) => !!(p as { abierto?: boolean }).abierto,
): ComponentType<P> {
  function DialogoLimpio(props: P) {
    const abierto = abiertoDe(props);
    const [vez, setVez] = useState(0);
    const [antes, setAntes] = useState(abierto);
    // Estado derivado durante el render (patrón recomendado por React): al pasar de cerrado a abierto
    // cambia la clave y el formulario se monta de cero.
    if (abierto !== antes) {
      setAntes(abierto);
      if (abierto) setVez((v) => v + 1);
    }
    return <Dialogo key={vez} {...props} />;
  }
  DialogoLimpio.displayName = `Limpio(${Dialogo.displayName ?? Dialogo.name ?? 'Dialogo'})`;
  return DialogoLimpio;
}
