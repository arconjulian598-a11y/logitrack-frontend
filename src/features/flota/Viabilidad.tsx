import { CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { ErrorFormulario, Field, FormActions } from '@/components/shared/Form';
import { aNumero } from '@/lib/formularios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Checkbox, Label } from '@/components/ui/misc';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import { CAUSAS_VIABILIDAD } from '@/lib/dominio';

/** POST /viabilidad: ¿alguna pareja vehículo+conductor podría llevar esta carga? No reserva nada. */
export function DialogoViabilidad({ abierto, onAbierto }: { abierto: boolean; onAbierto: (v: boolean) => void }) {
  const [peso, setPeso] = useState('');
  const [volumen, setVolumen] = useState('');
  const [tipo, setTipo] = useState<'general' | 'refrigerada'>('general');
  const [hazmat, setHazmat] = useState(false);
  const a = useAccion({
    fn: () => api.flota.viabilidad({ peso_kg: aNumero(peso)!, volumen_m3: aNumero(volumen), tipo_carga: tipo, es_hazmat: hazmat }),
    toastError: false,
  });
  const valido = (aNumero(peso) ?? 0) > 0 && (volumen === '' || (aNumero(volumen) ?? 0) > 0);
  return (
    <Dialog open={abierto} onOpenChange={onAbierto}>
      <DialogContent titulo="Comprobar viabilidad de una carga" descripcion="Consulta si la flota podría transportarla, sin reservar ningún vehículo.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valido) a.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Peso (kg)" htmlFor="v-peso" requerido>
              <Input id="v-peso" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} autoFocus />
            </Field>
            <Field label="Volumen (m³)" htmlFor="v-vol" ayuda="Opcional, mayor que 0">
              <Input id="v-vol" inputMode="decimal" value={volumen} onChange={(e) => setVolumen(e.target.value)} />
            </Field>
            <Field label="Tipo de carga" htmlFor="v-tipo">
              <NativeSelect id="v-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as 'general' | 'refrigerada')}>
                <option value="general">General</option>
                <option value="refrigerada">Refrigerada</option>
              </NativeSelect>
            </Field>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox id="v-haz" checked={hazmat} onCheckedChange={(c) => setHazmat(c === true)} />
              <Label htmlFor="v-haz">Mercancía peligrosa (HAZMAT)</Label>
            </div>
          </div>
          {a.data && (
            <div
              role="status"
              className={`flex gap-2 rounded-md border px-3 py-2.5 text-[13px] ${a.data.viable ? 'border-ok/30 bg-ok-soft' : 'border-danger/30 bg-danger-soft'}`}
            >
              {a.data.viable ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-danger" />}
              <div>
                <p className="font-semibold">{a.data.viable ? 'Viable' : 'No viable'}</p>
                <p className="text-text-2">
                  {a.data.viable
                    ? `${a.data.compatibles} pareja(s) compatibles; ${a.data.disponibles_ahora} libre(s) ahora.`
                    : (a.data.mensaje ?? CAUSAS_VIABILIDAD[a.data.causa ?? ''])}
                </p>
                {a.data.causa && <p className="text-xs text-text-3">Causa: {a.data.causa}</p>}
              </div>
            </div>
          )}
          <ErrorFormulario error={a.error} />
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => onAbierto(false)}>
              Cerrar
            </Button>
            <Button type="submit" variant="primary" disabled={!valido} cargando={a.isPending}>
              Comprobar
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
