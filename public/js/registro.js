const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const svgEyeOpen   = `<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;
const svgEyeClosed = `<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>`;

function marcarError(inputId, errId, mensaje) {
    document.getElementById(inputId).classList.add('border-red-400');
    document.getElementById(inputId).classList.remove('border-purple-200');
    const e = document.getElementById(errId);
    e.textContent = mensaje;
    e.classList.remove('hidden');
}
function limpiarError(inputId, errId) {
    document.getElementById(inputId).classList.remove('border-red-400');
    document.getElementById(inputId).classList.add('border-purple-200');
    document.getElementById(errId).classList.add('hidden');
}

function evaluarFuerza(pass) {
    let score = 0;
    if (pass.length >= 8)  score++;
    if (pass.length >= 12) score++;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return Math.min(score, 4);
}
const colores   = ['bg-red-400','bg-orange-400','bg-yellow-400','bg-green-500'];
const etiquetas = ['Muy débil','Débil','Regular','Fuerte'];
const segs      = ['seg1','seg2','seg3','seg4'];

document.getElementById('passwordUsuario').addEventListener('input', function () {
    const score = evaluarFuerza(this.value);
    segs.forEach((id, i) => {
        document.getElementById(id).className = 'h-1 flex-1 rounded-full ' + (i < score ? colores[score - 1] : 'bg-gray-200');
    });
    document.getElementById('lblFuerza').textContent = this.value ? (etiquetas[score - 1] || '') : '';
});

document.getElementById('nombreUsuario').addEventListener('blur', function () {
    const v = this.value.trim();
    if (!v) marcarError('nombreUsuario','err-nombre','El nombre es obligatorio.');
    else if (v.length < 3) marcarError('nombreUsuario','err-nombre','Mínimo 3 caracteres.');
    else limpiarError('nombreUsuario','err-nombre');
});
document.getElementById('emailUsuario').addEventListener('blur', function () {
    const v = this.value.trim();
    if (!v) marcarError('emailUsuario','err-email','El correo es obligatorio.');
    else if (!regexEmail.test(v)) marcarError('emailUsuario','err-email','Ingresa un correo válido.');
    else limpiarError('emailUsuario','err-email');
});
document.getElementById('passwordUsuario').addEventListener('blur', function () {
    if (!this.value) marcarError('passwordUsuario','err-password','La contraseña es obligatoria.');
    else if (this.value.length < 8) marcarError('passwordUsuario','err-password','Mínimo 8 caracteres.');
    else limpiarError('passwordUsuario','err-password');
});
document.getElementById('confirmacionUsuario').addEventListener('blur', function () {
    const pass = document.getElementById('passwordUsuario').value;
    if (!this.value) marcarError('confirmacionUsuario','err-confirmacion','Repite la contraseña.');
    else if (this.value !== pass) marcarError('confirmacionUsuario','err-confirmacion','Las contraseñas no coinciden.');
    else limpiarError('confirmacionUsuario','err-confirmacion');
});

document.getElementById('formRegistro').addEventListener('submit', function (e) {
    let valido = true;
    const nombre  = document.getElementById('nombreUsuario').value.trim();
    const email   = document.getElementById('emailUsuario').value.trim();
    const pass    = document.getElementById('passwordUsuario').value;
    const confirm = document.getElementById('confirmacionUsuario').value;

    if (!nombre || nombre.length < 3) { marcarError('nombreUsuario','err-nombre', nombre ? 'Mínimo 3 caracteres.' : 'El nombre es obligatorio.'); valido = false; }
    else limpiarError('nombreUsuario','err-nombre');

    if (!email) { marcarError('emailUsuario','err-email','El correo es obligatorio.'); valido = false; }
    else if (!regexEmail.test(email)) { marcarError('emailUsuario','err-email','Ingresa un correo válido.'); valido = false; }
    else limpiarError('emailUsuario','err-email');

    if (!pass || pass.length < 8) { marcarError('passwordUsuario','err-password', pass ? 'Mínimo 8 caracteres.' : 'La contraseña es obligatoria.'); valido = false; }
    else limpiarError('passwordUsuario','err-password');

    if (!confirm) { marcarError('confirmacionUsuario','err-confirmacion','Repite la contraseña.'); valido = false; }
    else if (confirm !== pass) { marcarError('confirmacionUsuario','err-confirmacion','Las contraseñas no coinciden.'); valido = false; }
    else limpiarError('confirmacionUsuario','err-confirmacion');

    if (!valido) e.preventDefault();
});

document.querySelector('input[type="submit"]').addEventListener('mousedown', function () {
    var form = this.closest('form');
    form.querySelectorAll('input[name="passwordUsuario"], input[name="confirmacionUsuario"]').forEach(i => { i.type = 'password'; });
    form.querySelectorAll('button[onclick="togglePasswordGroup(this)"]').forEach(b => { b.innerHTML = svgEyeOpen; });
});

function togglePasswordGroup(btn) {
    const form   = btn.closest('form');
    const inputs = form.querySelectorAll('input[name="passwordUsuario"], input[name="confirmacionUsuario"]');
    const isHidden = inputs[0].type === 'password';
    inputs.forEach(input => { input.type = isHidden ? 'text' : 'password'; });
    form.querySelectorAll('button[onclick="togglePasswordGroup(this)"]').forEach(b => { b.innerHTML = isHidden ? svgEyeClosed : svgEyeOpen; });
}