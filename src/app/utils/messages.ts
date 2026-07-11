import Swal from 'sweetalert2'

export const info = (text: string, title: string = 'Info',  content : string = '') => {
  Swal.fire({
    title,
    text: content ? '' : text,
    icon: 'info',
    html:  content ? content : '',
    showCancelButton: false,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    confirmButtonText: 'SI, de acuerdo!',
    cancelButtonText: 'Cancelar'
  }).then();
}

export const error = (text: string = 'Ha ocurrido un error con la transacción actual', title: string = 'Error', content = null) => {
  Swal.fire({
    title,
    text: content ? '' : text,
    icon: 'error',
    html: content ?? '',
    showCancelButton: false,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Si, de acuerdo!',
    cancelButtonText: 'Cancelar'
  }).then();
}

export const warning = (text: string = 'Ha ocurrido un error con la transacción actual', title: string = 'Inválido', content = null) => {
  Swal.fire({
    title,
    text: content ? '' : text,
    icon: 'warning',
    html: content ?? '',
    showCancelButton: false,
    confirmButtonColor: '#3085d6',
    confirmButtonText: 'Si, de acuerdo!',
  }).then();
}

export const confirm = (text: string, handler?: OnConfirmHandle) => {
  Swal.fire({
    title: 'Confirmar',
    text: text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Si, de acuerdo!',
    cancelButtonText: 'Cancelar'
  }).then(result => {
    if (result.isConfirmed) {
      handler?.onConfirm();
    } else {
      handler?.onCancel && handler.onCancel();
    }
  });
}

export const promptText = (title: string, defaultValue: string = ''): Promise<string | null> => {
  return Swal.fire({
    title,
    input: 'text',
    inputValue: defaultValue,
    showCancelButton: true,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Crear',
    cancelButtonText: 'Cancelar',
    inputValidator: (value) => (!value ? 'Ingresá un nombre.' : undefined),
  }).then((result) => (result.isConfirmed ? (result.value as string) : null));
}

export const Toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  }
});

export interface OnConfirmHandle {
  onCancel?: VoidFunction;
  onConfirm: VoidFunction;
}
