const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function marcarError(inputId, errId, mensaje) {
    const input = document.getElementById(inputId);
    const err   = document.getElementById(errId);
    input.classList.add('border-red-400');
    input.classList.remove('border-purple-200');
    err.textContent = mensaje;
    err.classList.remove('hidden');
}

function limpiarError(inputId, errId) {
    const input = document.getElementById(inputId);
    const err   = document.getElementById(errId);
    input.classList.remove('border-red-400');
    input.classList.add('border-purple-200');
    err.classList.add('hidden');
}

document.getElementById('emailUsuario').addEventListener('blur', function () {
    if (!this.value.trim()) {
        marcarError('emailUsuario', 'err-email', 'El correo es obligatorio.');
    } else if (!regexEmail.test(this.value.trim())) {
        marcarError('emailUsuario', 'err-email', 'Ingresa un correo electrónico válido.');
    } else {
        limpiarError('emailUsuario', 'err-email');
    }
});

document.getElementById('passwordUsuario').addEventListener('blur', function () {
    if (!this.value) {
        marcarError('passwordUsuario', 'err-password', 'La contraseña es obligatoria.');
    } else if (this.value.length < 8) {
        marcarError('passwordUsuario', 'err-password', 'Mínimo 8 caracteres.');
    } else {
        limpiarError('passwordUsuario', 'err-password');
    }
});

document.getElementById('formLogin').addEventListener('submit', function (e) {
    let valido = true;
    const email = document.getElementById('emailUsuario').value.trim();
    const pass  = document.getElementById('passwordUsuario').value;

    if (!email) {
        marcarError('emailUsuario', 'err-email', 'El correo es obligatorio.');
        valido = false;
    } else if (!regexEmail.test(email)) {
        marcarError('emailUsuario', 'err-email', 'Ingresa un correo electrónico válido.');
        valido = false;
    } else {
        limpiarError('emailUsuario', 'err-email');
    }

    if (!pass) {
        marcarError('passwordUsuario', 'err-password', 'La contraseña es obligatoria.');
        valido = false;
    } else if (pass.length < 8) {
        marcarError('passwordUsuario', 'err-password', 'Mínimo 8 caracteres.');
        valido = false;
    } else {
        limpiarError('passwordUsuario', 'err-password');
    }

    if (!valido) e.preventDefault();
});

document.querySelector('input[type="submit"]').addEventListener('mousedown', function () {
    var input = document.getElementById('passwordUsuario');
    if (input && input.type === 'text') {
        input.type = 'password';
        var btn = this.closest('form').querySelector('button[onclick*="togglePassword"]');
        if (btn) btn.innerHTML = `<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;
    }
});

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.innerHTML = isHidden
        ? `<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>`
        : `<svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;
}