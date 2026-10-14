import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { ErrorFormulario, Field, FormActions } from '@/components/shared/Form';
import { vacioANull } from '@/lib/formularios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { useAccion } from '@/hooks/useAccion';
import * as api from '@/lib/api/endpoints';
import type { Cliente, TipoDocumento } from '@/lib/types/api';

const esquema = z.object({
  nombre: z.string().trim().min(2, { error: 'Mínimo 2 caracteres' }).max(150, { error: 'Máximo 150 caracteres' }),
  tipo_documento: z.enum(['CC', 'CE', 'NIT', 'PAS']),
  numero_documento: z.string().trim().min(3, { error: 'Mínimo 3 caracteres' }).max(30, { error: 'Máximo 30 caracteres' }),
  email: z
    .string()
    .trim()
    .max(150)
    .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), { error: 'Correo no válido' }),
  telefono: z.string().trim().max(30, { error: 'Máximo 30 caracteres' }),
  direccion: z.string().trim().max(255, { error: 'Máximo 255 caracteres' }),
});
type Valores = z.infer<typeof esquema>;

export function DialogoCliente({ abierto, onAbierto, cliente }: { abierto: boolean; onAbierto: (v: boolean) => void; cliente?: Cliente }) {
  const edicion = !!cliente;
  const navigate = useNavigate();
  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    values: {
      nombre: cliente?.nombre ?? '',
      tipo_documento: (cliente?.tipo_documento as TipoDocumento) ?? 'NIT',
      numero_documento: cliente?.numero_documento ?? '',
      email: cliente?.email ?? '',
      telefono: cliente?.telefono ?? '',
      direccion: cliente?.direccion ?? '',
    },
  });
  const a = useAccion({
    fn: (v: Valores) => {
      const datos = { ...v, email: vacioANull(v.email), telefono: vacioANull(v.telefono), direccion: vacioANull(v.direccion) };
      return edicion ? api.clientes.actualizar(cliente!.id, datos) : api.clientes.crear(datos);
    },
    exito: (c) => (edicion ? `Cliente ${c.nombre} actualizado.` : `Cliente ${c.nombre} registrado con código ${c.codigo_cliente}.`),
    invalida: [['clientes']],
    toastError: false,
    onSuccess: (c) => {
      onAbierto(false);
      if (!edicion) navigate(`/clientes/${c.id}`);
    },
  });
  const e = form.formState.errors;
  return (
    <Dialog open={abierto} onOpenChange={onAbierto}>
      <DialogContent
        titulo={edicion ? `Editar ${cliente!.nombre}` : 'Registrar cliente'}
        descripcion={edicion ? 'Tipo y número de documento se envían juntos.' : 'El código de cliente lo asigna el sistema.'}
        ancho="max-w-xl"
      >
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => a.mutate(v))} noValidate>
          <Field label="Nombre o razón social" htmlFor="cl-nombre" requerido error={e.nombre?.message}>
            <Input id="cl-nombre" {...form.register('nombre')} aria-invalid={!!e.nombre} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <Field label="Documento" htmlFor="cl-tipo" requerido>
              <NativeSelect id="cl-tipo" {...form.register('tipo_documento')}>
                <option value="NIT">NIT</option>
                <option value="CC">Cédula (CC)</option>
                <option value="CE">Cédula de extranjería</option>
                <option value="PAS">Pasaporte</option>
              </NativeSelect>
            </Field>
            <Field label="Número" htmlFor="cl-num" requerido error={e.numero_documento?.message}>
              <Input id="cl-num" {...form.register('numero_documento')} aria-invalid={!!e.numero_documento} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Correo" htmlFor="cl-email" error={e.email?.message}>
              <Input id="cl-email" type="email" {...form.register('email')} aria-invalid={!!e.email} />
            </Field>
            <Field label="Teléfono" htmlFor="cl-tel" error={e.telefono?.message}>
              <Input id="cl-tel" type="tel" {...form.register('telefono')} />
            </Field>
          </div>
          <Field label="Dirección" htmlFor="cl-dir" error={e.direccion?.message}>
            <Input id="cl-dir" {...form.register('direccion')} />
          </Field>
          <ErrorFormulario error={a.error} />
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => onAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" cargando={a.isPending}>
              {edicion ? 'Guardar cambios' : 'Registrar cliente'}
            </Button>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
