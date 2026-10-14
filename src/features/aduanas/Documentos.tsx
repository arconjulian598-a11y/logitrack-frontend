import { FileText } from 'lucide-react';
import { humanizar } from '@/lib/dominio';
import type { DocumentoAduanero } from '@/lib/types/api';

/**
 * Documentos de una declaración. Customs genera `{tipo, url}` con URLs de un dominio interno
 * simulado (docs.logitrack.local) que no sirve archivos: se muestran como referencia, no como enlace.
 */
export function Documentos({ documentos }: { documentos: DocumentoAduanero[] }) {
  if (!documentos?.length) return <p className="text-[13px] text-text-2">La declaración no lista documentos.</p>;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-text-2">Documentos exigidos ({documentos.length})</p>
      <ul className="divide-y divide-rule rounded-md border border-rule">
        {documentos.map((d, i) => {
          const tipo = typeof d === 'string' ? d : (d.tipo ?? `documento ${i + 1}`);
          const url = typeof d === 'string' ? null : (d.url ?? null);
          return (
            <li key={i} className="flex items-start gap-2.5 px-3 py-2 text-[13px]">
              <FileText className="mt-0.5 size-4 shrink-0 text-text-3" />
              <div className="min-w-0">
                <p className="font-medium">{humanizar(tipo)}</p>
                {url && (
                  <p className="truncate text-xs text-text-3" title={url}>
                    Referencia generada por el servicio (simulada): {url}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
